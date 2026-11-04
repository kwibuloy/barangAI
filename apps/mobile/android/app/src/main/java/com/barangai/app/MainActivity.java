package com.barangai.app;

import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.widget.EditText;
import android.widget.FrameLayout;
import androidx.annotation.Nullable;
// AppCompat's dialog takes the app theme: green button, dark mode with the phone.
import androidx.appcompat.app.AlertDialog;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.CapConfig;

/** Loads BarangAI from the laptop running it, and asks for the laptop's address when it isn't known or can't be reached. */
public class MainActivity extends BridgeActivity {

    private static final String SERVER_URL = "server_url";
    private static final int DEFAULT_PORT = 8000;
    /** A laptop that has left the network gives no error for a long while, and the app would just look black. */
    private static final long LOAD_TIMEOUT_MS = 8000;

    private final Handler timer = new Handler(Looper.getMainLooper());
    private AlertDialog dialog;
    private boolean loadFailed;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        String saved = preferences().getString(SERVER_URL, null);
        // Capacitor gives native plugins (GPS) only to its main address, so the laptop has to be that address.
        if (saved != null) config = new CapConfig.Builder(this).setServerUrl(saved).create();
        registerPlugin(RokidGlassesPlugin.class);
        super.onCreate(savedInstanceState);
        if (saved == null) {
            askForServer(null);
            return;
        }
        bridge.setWebViewClient(
            new BridgeWebViewClient(bridge) {
                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    super.onReceivedError(view, request, error);
                    if (request.isForMainFrame()) {
                        loadFailed = true;
                        timer.removeCallbacksAndMessages(null);
                        askForServer(saved);
                    }
                }

                @Override
                public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                    super.onReceivedHttpError(view, request, response);
                    // Something answered at that address, but it isn't BarangAI.
                    if (request.isForMainFrame()) {
                        loadFailed = true;
                        timer.removeCallbacksAndMessages(null);
                        askForServer(saved);
                    }
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    super.onPageFinished(view, url);
                    timer.removeCallbacksAndMessages(null);
                    // It loaded after all, so the question no longer applies.
                    if (!loadFailed && dialog != null) dialog.dismiss();
                }
            }
        );
        timer.postDelayed(() -> askForServer(saved), LOAD_TIMEOUT_MS);
    }

    /** The Rokid AI App answers its consent screen here. */
    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        com.getcapacitor.PluginHandle handle = bridge == null ? null : bridge.getPlugin("RokidGlasses");
        if (handle != null) ((RokidGlassesPlugin) handle.getInstance()).onActivityResult(resultCode, data);
    }

    @Override
    public void onDestroy() {
        timer.removeCallbacksAndMessages(null);
        if (dialog != null) dialog.dismiss();
        super.onDestroy();
    }

    private SharedPreferences preferences() {
        return getSharedPreferences("barangai", MODE_PRIVATE);
    }

    private void askForServer(@Nullable String current) {
        if (dialog != null && dialog.isShowing()) return;
        EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setHint("192.168.1.20");
        if (current != null) input.setText(current);
        FrameLayout frame = new FrameLayout(this);
        int margin = Math.round(20 * getResources().getDisplayMetrics().density);
        frame.setPadding(margin, 0, margin, 0);
        frame.addView(input);
        dialog = new AlertDialog.Builder(this)
            .setIcon(R.mipmap.ic_launcher_round)
            .setTitle(current == null ? "Hi! Let's connect to BarangAI" : "Kap can't reach BarangAI")
            .setMessage("Type the phone address shown on the laptop running BarangAI. Both need the same Wi-Fi, or type localhost when connected by USB. The connection isn't encrypted, so use a network you trust.")
            .setView(frame)
            .setCancelable(false)
            .setPositiveButton(current == null ? "Connect" : "Try again", null)
            .create();
        dialog.setOnShowListener(shown ->
            dialog
                .getButton(AlertDialog.BUTTON_POSITIVE)
                .setOnClickListener(click -> {
                    String url = serverUrl(input.getText().toString());
                    if (url == null) {
                        input.setError("Enter an address such as 192.168.1.20");
                        return;
                    }
                    preferences().edit().putString(SERVER_URL, url).commit();
                    recreate();
                })
        );
        dialog.show();
    }

    /** The address as an origin, with http and the launcher's port when left out; null when it isn't an address. */
    @Nullable
    private static String serverUrl(String text) {
        String trimmed = text.trim();
        Uri uri = Uri.parse(trimmed.contains("://") ? trimmed : "http://" + trimmed);
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (host == null || host.isEmpty() || !("https".equals(scheme) || ("http".equals(scheme) && isPrivate(host)))) return null;
        int port = uri.getPort();
        if (port == -1 && "http".equals(scheme)) port = DEFAULT_PORT;
        return scheme + "://" + host + (port == -1 ? "" : ":" + port);
    }

    /** Plain HTTP stays on the local network: this address gets the app's GPS access, so no public site over HTTP. */
    private static boolean isPrivate(String host) {
        return host.equals("localhost") || host.matches("(127|10)(\\.\\d{1,3}){3}|192\\.168(\\.\\d{1,3}){2}|172\\.(1[6-9]|2\\d|3[01])(\\.\\d{1,3}){2}");
    }
}
