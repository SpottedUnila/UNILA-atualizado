package com.spottedunila.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://spottedunila.github.io/UNILA-atualizado/";
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        webView.setWebViewClient(new WebViewClient());
        webView.addJavascriptInterface(new AndroidShareBridge(), "AndroidShare");
        webView.loadUrl(APP_URL);
    }

    private final class AndroidShareBridge {
        @JavascriptInterface
        public void share(String text) {
            runOnUiThread(() -> {
                Intent sendIntent = new Intent(Intent.ACTION_SEND);
                sendIntent.setType("text/plain");
                sendIntent.putExtra(Intent.EXTRA_TITLE, "Confira o Spotted");
                sendIntent.putExtra(Intent.EXTRA_TEXT, text);
                Intent chooser = Intent.createChooser(sendIntent, "Compartilhar aplicativo");
                startActivity(chooser);
            });
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }
}
