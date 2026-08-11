package com.cinitswift.oun;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class LocalProxyServerTest {
    @Test
    public void acceptsOnlyHttpTargets() {
        assertTrue(LocalProxyServer.isAllowedTarget("https://example.com/video.m3u8"));
        assertTrue(LocalProxyServer.isAllowedTarget("http://example.com/api"));
        assertFalse(LocalProxyServer.isAllowedTarget("file:///data/local.txt"));
        assertFalse(LocalProxyServer.isAllowedTarget("javascript:alert(1)"));
    }

    @Test
    public void rewritesPlaylistUrlsThroughLocalProxy() throws Exception {
        String playlist = "#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"keys/key.bin\"\nsegment-1.ts\n";

        String rewritten = LocalProxyServer.rewritePlaylist(
                playlist,
                "https://cdn.example.com/path/master.m3u8"
        );

        assertEquals(
                "#EXTM3U\n"
                        + "#EXT-X-KEY:METHOD=AES-128,URI=\"http://127.0.0.1:8787/proxy?url=https%3A%2F%2Fcdn.example.com%2Fpath%2Fkeys%2Fkey.bin\"\n"
                        + "http://127.0.0.1:8787/proxy?url=https%3A%2F%2Fcdn.example.com%2Fpath%2Fsegment-1.ts\n",
                rewritten
        );
    }
}
