package com.cinitswift.oun;

import android.os.Bundle;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private LocalProxyServer proxyServer;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        proxyServer = new LocalProxyServer(8787);
        try {
            proxyServer.start();
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to start local proxy", exception);
        }
        super.onCreate(savedInstanceState);
        bridge.getWebView().getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
    }

    @Override
    public void onDestroy() {
        if (proxyServer != null) {
            proxyServer.stop();
        }
        super.onDestroy();
    }
}
