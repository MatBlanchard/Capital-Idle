package com.capitalidle.game;

import android.app.Activity;
import android.app.DownloadManager;
import android.app.AlertDialog;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.database.Cursor;
import org.json.JSONObject;
import org.json.JSONArray;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
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
  private long updateDownloadId = -1;
  private DownloadManager updateManager;
  private BroadcastReceiver updateReceiver;
  private Uri downloadedApk;
  private static final String LATEST_RELEASE = "https://api.github.com/repos/MatBlanchard/Capital-Idle/releases/latest";

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
    registerUpdateReceiver();
    checkForUpdates();
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


  private void updateStatus(String message) { runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show()); }

  private void checkForUpdates() {
    new Thread(() -> {
      HttpURLConnection connection = null;
      try {
        connection = (HttpURLConnection) new URL(LATEST_RELEASE).openConnection();
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(10000);
        connection.setRequestProperty("Accept", "application/vnd.github+json");
        connection.setRequestProperty("User-Agent", "CapitalIdle-Android");
        if (connection.getResponseCode() != 200) { updateStatus("Vérification impossible : GitHub HTTP " + connection.getResponseCode()); return; }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (InputStream in = connection.getInputStream()) {
          byte[] buffer = new byte[8192]; int n;
          while ((n = in.read(buffer)) != -1) {
            if (out.size() + n > 1024 * 1024) return;
            out.write(buffer, 0, n);
          }
        }
        JSONObject release = new JSONObject(out.toString("UTF-8"));
        String tag = release.optString("tag_name");
        if (!tag.startsWith("build-")) { updateStatus("Version publiée non reconnue : " + tag); return; }
        int remote = Integer.parseInt(tag.substring(6));
        int local = getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
        if (remote <= local) { updateStatus("Capital Idle est à jour (version " + local + ")"); return; }
        JSONArray assets = release.optJSONArray("assets");
        if (assets == null) { updateStatus("Version disponible, mais aucun APK publié"); return; }
        for (int i = 0; i < assets.length(); i++) {
          JSONObject asset = assets.getJSONObject(i);
          if ("CapitalIdle.apk".equals(asset.optString("name"))) {
            String url = asset.optString("browser_download_url");
            if (url.startsWith("https://github.com/MatBlanchard/Capital-Idle/releases/download/")) {
              runOnUiThread(() -> downloadUpdate(url, remote));
            }
            return;
          }
        }
        updateStatus("Nouvelle version détectée, mais fichier CapitalIdle.apk introuvable");
      } catch (Exception e) {
        updateStatus("Vérification des mises à jour impossible : " + e.getClass().getSimpleName());
      } finally {
        if (connection != null) connection.disconnect();
      }
    }).start();
  }

  private void downloadUpdate(String url, int version) {
    if (updateDownloadId != -1 || isFinishing()) return;
    try {
      updateManager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
      DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
      request.setTitle("Mise à jour Capital Idle");
      request.setDescription("Téléchargement de la version " + version);
      request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
      request.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, "CapitalIdle-update-" + version + ".apk");
      request.setMimeType("application/vnd.android.package-archive");
      updateDownloadId = updateManager.enqueue(request);
      Toast.makeText(this, "Mise à jour en téléchargement", Toast.LENGTH_LONG).show();
    } catch (Exception e) {
      Toast.makeText(this, "Téléchargement de la mise à jour impossible", Toast.LENGTH_LONG).show();
    }
  }

  private void registerUpdateReceiver() {
    updateReceiver = new BroadcastReceiver() {
      @Override public void onReceive(Context context, Intent intent) {
        if (!DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) return;
        long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
        if (id != updateDownloadId) return;
        updateDownloadId = -1;
        try (Cursor cursor = updateManager.query(new DownloadManager.Query().setFilterById(id))) {
          if (cursor != null && cursor.moveToFirst()
              && cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)) == DownloadManager.STATUS_SUCCESSFUL) {
            downloadedApk = updateManager.getUriForDownloadedFile(id);
            if (downloadedApk != null) {
              new AlertDialog.Builder(MainActivity.this)
                .setTitle("Mise à jour disponible")
                .setMessage("La nouvelle version de Capital Idle est téléchargée. Voulez-vous l'installer ? Votre sauvegarde sera conservée.")
                .setPositiveButton("Installer", (d, w) -> installUpdate())
                .setNegativeButton("Plus tard", null).show();
            }
          } else {
            Toast.makeText(MainActivity.this, "Échec du téléchargement de la mise à jour", Toast.LENGTH_LONG).show();
          }
        } catch (Exception e) {
          Toast.makeText(MainActivity.this, "Impossible d'ouvrir la mise à jour", Toast.LENGTH_LONG).show();
        }
      }
    };
    IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
    if (Build.VERSION.SDK_INT >= 33) registerReceiver(updateReceiver, filter, Context.RECEIVER_EXPORTED);
    else registerReceiver(updateReceiver, filter);
  }

  private void installUpdate() {
    if (downloadedApk == null) return;
    if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
      new AlertDialog.Builder(this)
        .setTitle("Autorisation Android requise")
        .setMessage("Autorisez Capital Idle à installer des applications, puis revenez dans le jeu pour confirmer l'installation.")
        .setPositiveButton("Ouvrir les paramètres", (d, w) -> {
          Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:" + getPackageName()));
          startActivity(settings);
        }).setNegativeButton("Annuler", null).show();
      return;
    }
    try {
      Intent intent = new Intent(Intent.ACTION_VIEW);
      intent.setDataAndType(downloadedApk, "application/vnd.android.package-archive");
      intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
      startActivity(intent);
    } catch (Exception e) {
      Toast.makeText(this, "Installation impossible : ouvrez le téléchargement Android", Toast.LENGTH_LONG).show();
    }
  }

  @Override protected void onResume() {
    super.onResume();
    if (downloadedApk != null && Build.VERSION.SDK_INT >= 26 && getPackageManager().canRequestPackageInstalls()) {
      new AlertDialog.Builder(this).setTitle("Installer la mise à jour")
        .setMessage("La mise à jour est prête. Voulez-vous lancer son installation ?")
        .setPositiveButton("Installer", (d, w) -> installUpdate())
        .setNegativeButton("Plus tard", null).show();
    }
  }

  @Override public void onBackPressed() {
    if (web.canGoBack()) web.goBack(); else super.onBackPressed();
  }
  @Override protected void onDestroy() { if (updateReceiver != null) unregisterReceiver(updateReceiver); web.destroy(); super.onDestroy(); }
}
