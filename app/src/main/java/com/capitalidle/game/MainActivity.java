package com.capitalidle.game;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.webkit.ValueCallback;
import android.widget.Toast;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
  private static final int PICK_IMPORT = 10;
  private static final int PICK_EXPORT = 11;
  private WebView web;
  private ValueCallback<Uri[]> uploadCallback;
  private String pendingExport;

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    web = new WebView(this);
    setContentView(web);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setAllowFileAccess(true);
    s.setAllowContentAccess(true);
    s.setJavaScriptCanOpenWindowsAutomatically(false);
    web.setWebChromeClient(new WebChromeClient() {
      @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
        if (uploadCallback != null) uploadCallback.onReceiveValue(null);
        uploadCallback = callback;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        try { startActivityForResult(intent, PICK_IMPORT); }
        catch (Exception e) { uploadCallback.onReceiveValue(null); uploadCallback = null; return false; }
        return true;
      }
    });
    web.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView view, String url) { return !url.startsWith("file:///android_asset/"); }
    });
    web.addJavascriptInterface(new SaveBridge(), "AndroidSave");
    web.loadUrl("file:///android_asset/index.html");
  }

  public class SaveBridge {
    @JavascriptInterface public void exportJson(String json) {
      runOnUiThread(() -> {
        pendingExport = json;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, "capital-idle-sauvegarde.json");
        startActivityForResult(intent, PICK_EXPORT);
      });
    }
  }

  @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
    if (requestCode == PICK_IMPORT) {
      if (uploadCallback != null) {
        uploadCallback.onReceiveValue(resultCode == RESULT_OK && data != null && data.getData() != null ? new Uri[]{data.getData()} : null);
        uploadCallback = null;
      }
    } else if (requestCode == PICK_EXPORT) {
      if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingExport != null) {
        try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
          if (out != null) { out.write(pendingExport.getBytes(StandardCharsets.UTF_8)); Toast.makeText(this,"Sauvegarde exportée",Toast.LENGTH_SHORT).show(); }
        } catch (Exception e) { Toast.makeText(this,"Échec de l'export",Toast.LENGTH_LONG).show(); }
      }
      pendingExport = null;
    }
  }

  @Override public void onBackPressed() {
    if (web.canGoBack()) web.goBack(); else super.onBackPressed();
  }
  @Override protected void onDestroy() { web.destroy(); super.onDestroy(); }
}
