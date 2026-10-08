package com.tangwu.android;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String ORIGIN = "https://" + HOST;
    private static final int SAVE_DOCUMENT = 1;
    private WebView webView;
    private String pendingExport;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(16, 24, 39));
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(16, 24, 39));
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars()
                    | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                return insets;
            });
            root.requestApplyInsets();
        }
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        // Private in-app assets have a stable HTTPS origin, including Worker imports.
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse response = assets.shouldInterceptRequest(request.getUrl());
                if (HOST.equals(request.getUrl().getHost()) && response == null) {
                    return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                        Collections.emptyMap(), new java.io.ByteArrayInputStream(new byte[0]));
                }
                return response;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if ("https".equals(url.getScheme()) && HOST.equals(url.getHost())) return false;
                openExternal(url);
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage message) {
                if (BuildConfig.DEBUG) android.util.Log.d("TangWu", message.message());
                return true;
            }
        });
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(webView, "TWAndroid", Collections.singleton(ORIGIN),
                (view, message, origin, mainFrame, reply) -> {
                    if (!mainFrame || !ORIGIN.equals(origin.toString())) return;
                    try {
                        JSONObject data = new JSONObject(message.getData());
                        if (!"export".equals(data.optString("type"))) return;
                        String contents = data.getString("contents");
                        if (contents.length() > 16 * 1024 * 1024 || pendingExport != null) return;
                        String filename = data.optString("filename", "tangwu-human-games.json");
                        if (!filename.matches("[a-zA-Z0-9._-]{1,80}")) filename = "tangwu-human-games.json";
                        pendingExport = contents;
                        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                        intent.addCategory(Intent.CATEGORY_OPENABLE);
                        intent.setType("text/plain".equals(data.optString("mime")) ? "text/plain" : "application/json");
                        intent.putExtra(Intent.EXTRA_TITLE, filename);
                        startActivityForResult(intent, SAVE_DOCUMENT);
                    } catch (Exception error) {
                        pendingExport = null;
                        Toast.makeText(this, "无法导出对局，请重试", Toast.LENGTH_SHORT).show();
                    }
                });
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        if (state == null || webView.restoreState(state) == null)
            webView.loadUrl(ORIGIN + "/assets/site/index.html");
    }

    private void openExternal(Uri url) {
        if (!"https".equals(url.getScheme())) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, url)); }
        catch (ActivityNotFoundException error) {
            Toast.makeText(this, "请安装浏览器后打开联网模式", Toast.LENGTH_SHORT).show();
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != SAVE_DOCUMENT) return;
        String contents = pendingExport;
        pendingExport = null;
        if (result != RESULT_OK || data == null || data.getData() == null || contents == null) return;
        try (OutputStream stream = getContentResolver().openOutputStream(data.getData())) {
            if (stream == null) throw new java.io.IOException("No document output stream");
            stream.write(contents.getBytes(StandardCharsets.UTF_8));
            Toast.makeText(this, "对局文件已保存，可交给电脑训练", Toast.LENGTH_LONG).show();
        } catch (Exception error) {
            Toast.makeText(this, "保存失败，请换一个位置重试", Toast.LENGTH_LONG).show();
        }
    }

    @Override public void onBackPressed() {
        webView.evaluateJavascript("!!(window.TWMobile && window.TWMobile.back())", handled -> {
            if ("true".equals(handled)) return;
            if (webView.canGoBack()) webView.goBack();
            else finish();
        });
    }
    @Override protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        webView.saveState(state);
    }
    @Override protected void onPause() { super.onPause(); webView.onPause(); }
    @Override protected void onResume() { super.onResume(); if (webView != null) webView.onResume(); }
    @Override protected void onDestroy() {
        if (webView != null) { webView.stopLoading(); webView.destroy(); }
        super.onDestroy();
    }
}
