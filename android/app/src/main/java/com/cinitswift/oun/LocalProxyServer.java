package com.cinitswift.oun;

import java.io.ByteArrayInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import fi.iki.elonen.NanoHTTPD;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.ResponseBody;

public class LocalProxyServer extends NanoHTTPD {
    public static final String PROXY_PREFIX = "http://127.0.0.1:8787/proxy?url=";
    private static final Pattern URI_ATTRIBUTE = Pattern.compile("(URI=\\\")([^\\\"]+)(\\\")");
    private final OkHttpClient httpClient;

    public LocalProxyServer(int port) {
        super("127.0.0.1", port);
        httpClient = new OkHttpClient.Builder()
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(15, TimeUnit.SECONDS)
                .writeTimeout(15, TimeUnit.SECONDS)
                .followRedirects(true)
                .build();
    }

    static boolean isAllowedTarget(String target) {
        if (target == null) {
            return false;
        }
        try {
            String scheme = URI.create(target).getScheme();
            return "http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme);
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    static String rewritePlaylist(String playlist, String sourceUrl) throws IOException {
        Matcher matcher = URI_ATTRIBUTE.matcher(playlist);
        StringBuffer attributes = new StringBuffer();
        while (matcher.find()) {
            String replacement = matcher.group(1)
                    + proxyUrl(resolveUrl(sourceUrl, matcher.group(2)))
                    + matcher.group(3);
            matcher.appendReplacement(attributes, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(attributes);

        String[] lines = attributes.toString().split("\\n", -1);
        StringBuilder result = new StringBuilder(attributes.length());
        for (int index = 0; index < lines.length; index++) {
            String line = lines[index];
            String trimmed = line.trim();
            if (!trimmed.isEmpty() && !trimmed.startsWith("#")) {
                line = proxyUrl(resolveUrl(sourceUrl, trimmed));
            }
            result.append(line);
            if (index < lines.length - 1) {
                result.append('\n');
            }
        }
        return result.toString();
    }

    private static String resolveUrl(String baseUrl, String childUrl) throws IOException {
        return new URL(new URL(baseUrl), childUrl).toString();
    }

    private static String proxyUrl(String targetUrl) {
        return PROXY_PREFIX + URLEncoder.encode(targetUrl, StandardCharsets.UTF_8);
    }

    @Override
    public NanoHTTPD.Response serve(IHTTPSession session) {
        if (!"/proxy".equals(session.getUri())) {
            return cors(newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "Not found"));
        }
        if (Method.OPTIONS.equals(session.getMethod())) {
            return cors(newFixedLengthResponse(Response.Status.NO_CONTENT, "text/plain", ""));
        }

        Map<String, String> parameters = session.getParms();
        String targetUrl = parameters.get("url");
        if (!isAllowedTarget(targetUrl)) {
            return cors(newFixedLengthResponse(Response.Status.BAD_REQUEST, "text/plain", "Invalid target URL"));
        }

        Request request = new Request.Builder()
                .url(targetUrl)
                .header(
                        "User-Agent",
                        "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/122.0.0.0 Mobile Safari/537.36"
                )
                .header("Accept", "application/json, text/plain, */*")
                .build();

        String range = session.getHeaders().get("range");
        Request.Builder requestBuilder = request.newBuilder();
        if (range != null && !range.isEmpty()) {
            requestBuilder.header("Range", range);
        }

        try {
            okhttp3.Response upstream = httpClient.newCall(requestBuilder.build()).execute();
            ResponseBody body = upstream.body();
            if (body == null) {
                upstream.close();
                return cors(newFixedLengthResponse(new FixedStatus(502), "text/plain", "Empty upstream response"));
            }

            String contentType = body.contentType() == null
                    ? "application/octet-stream"
                    : body.contentType().toString();
            Response.IStatus status = statusFor(upstream.code());

            if (isPlaylist(contentType, targetUrl)) {
                String rewritten = rewritePlaylist(body.string(), targetUrl);
                upstream.close();
                byte[] bytes = rewritten.getBytes(StandardCharsets.UTF_8);
                NanoHTTPD.Response response = newFixedLengthResponse(
                        status,
                        contentType,
                        new ByteArrayInputStream(bytes),
                        bytes.length
                );
                return cors(response);
            }

            InputStream stream = new FilterInputStream(body.byteStream()) {
                @Override
                public void close() throws IOException {
                    try {
                        super.close();
                    } finally {
                        upstream.close();
                    }
                }
            };
            NanoHTTPD.Response response = body.contentLength() >= 0
                    ? newFixedLengthResponse(status, contentType, stream, body.contentLength())
                    : newChunkedResponse(status, contentType, stream);
            String contentRange = upstream.header("Content-Range");
            if (contentRange != null) {
                response.addHeader("Content-Range", contentRange);
            }
            String acceptRanges = upstream.header("Accept-Ranges");
            if (acceptRanges != null) {
                response.addHeader("Accept-Ranges", acceptRanges);
            }
            return cors(response);
        } catch (IOException exception) {
            return cors(newFixedLengthResponse(new FixedStatus(502), "text/plain", "Proxy request failed"));
        }
    }

    private static boolean isPlaylist(String contentType, String targetUrl) {
        String normalizedType = contentType.toLowerCase(Locale.ROOT);
        String normalizedUrl = targetUrl.toLowerCase(Locale.ROOT);
        return normalizedType.contains("mpegurl") || normalizedUrl.contains(".m3u8");
    }

    private static Response.IStatus statusFor(int statusCode) {
        Response.Status status = Response.Status.lookup(statusCode);
        return status == null ? new FixedStatus(statusCode) : status;
    }

    private static NanoHTTPD.Response cors(NanoHTTPD.Response response) {
        response.addHeader("Access-Control-Allow-Origin", "*");
        response.addHeader("Access-Control-Allow-Headers", "*");
        response.addHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
        return response;
    }

    private static final class FixedStatus implements Response.IStatus {
        private final int statusCode;

        private FixedStatus(int statusCode) {
            this.statusCode = statusCode;
        }

        @Override
        public int getRequestStatus() {
            return statusCode;
        }

        @Override
        public String getDescription() {
            return statusCode + " Upstream Response";
        }
    }
}
