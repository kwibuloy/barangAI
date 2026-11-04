package com.barangai.app;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import androidx.annotation.Nullable;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.rokid.cxr.Caps;
import com.rokid.cxr.session.AiInterceptMode;
import com.rokid.cxr.session.AuthResult;
import com.rokid.cxr.session.CloseReason;
import com.rokid.cxr.session.CxrSession;
import com.rokid.cxr.session.CxrSessionManager;
import com.rokid.cxr.session.GlassPermission;
import com.rokid.cxr.session.ICustomCmdSessionCallback;
import com.rokid.cxr.session.IImageCallback;
import com.rokid.cxr.session.ISessionLifecycleCbk;
import com.rokid.cxr.session.PausedReason;
import com.rokid.cxr.session.RokidAppStatus;
import com.rokid.cxr.session.SessionConfig;
import com.rokid.cxr.session.SessionErrorCode;
import com.rokid.cxr.session.SessionResult;
import com.rokid.cxr.session.SessionTimeouts;
import com.rokid.cxr.session.SessionType;
import com.rokid.cxr.session.TerminatingReason;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Arrays;

/**
 * Rokid Glasses through the Rokid AI App (CXR-L SDK). The website drives the report flow; this plugin only connects,
 * takes photos on the glasses, sends screens to the BarangAI glasses app and reports its button presses.
 * The glasses app (apps/mobile/android/glasses) is packed into this APK and the SDK installs it on connect.
 */
@CapacitorPlugin(name = "RokidGlasses")
public class RokidGlassesPlugin extends Plugin {

    static final String GLASSES_PACKAGE = "com.barangai.glasses";
    private static final String GLASSES_ACTIVITY = GLASSES_PACKAGE + ".MainActivity";
    private static final String GLASSES_APK = "glasses.apk";
    /** Channel names agreed with the glasses app: screens go out on one, button presses come back on the other. */
    static final String TO_GLASSES = "rk_custom_client";
    static final String FROM_GLASSES = "rk_custom_key";
    private static final String TOKEN = "rokid_token";
    /** Big enough to read street signs and wiring, small enough to cross Bluetooth quickly; the site shrinks it to 1600 px anyway. */
    private static final int PHOTO_WIDTH = 1600;
    private static final int PHOTO_HEIGHT = 1200;
    private static final int PHOTO_QUALITY = 80;

    private final Handler main = new Handler(Looper.getMainLooper());
    @Nullable
    private CxrSession session;
    @Nullable
    private PluginCall pendingAuth;
    @Nullable
    private PluginCall pendingPhoto;

    private CxrSessionManager manager() {
        return CxrSessionManager.Companion.getInstance(getContext().getApplicationContext());
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences("barangai", android.content.Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        RokidAppStatus app = manager().checkRokidAppCompatibility(getContext());
        result.put("rokidApp", app instanceof RokidAppStatus.Compatible ? "ok" : app instanceof RokidAppStatus.VersionTooLow ? "old" : "missing");
        result.put("authorized", preferences().getString(TOKEN, null) != null);
        result.put("glassesConnected", manager().isGlassesBtConnected());
        result.put("state", state());
        call.resolve(result);
    }

    /** Opens the Rokid AI App's consent screen; the answer comes back through MainActivity.onActivityResult. */
    @PluginMethod
    public void authorize(PluginCall call) {
        if (pendingAuth != null) pendingAuth.reject("Replaced by a newer request");
        pendingAuth = call;
        manager()
            .requestAuthorization(
                getActivity(),
                // Camera for photos; media and device management as Rokid's sample asks for installing and opening
                // the glasses app. Not yet checked on real glasses whether fewer would do.
                Arrays.asList(GlassPermission.CAMERA, GlassPermission.MEDIA, GlassPermission.DEVICE_MANAGE),
                result -> {
                    finishAuth(result);
                    return kotlin.Unit.INSTANCE;
                }
            );
    }

    /** MainActivity hands every activity result here; the SDK only uses it while a consent screen is open. */
    void onActivityResult(int resultCode, @Nullable Intent data) {
        if (pendingAuth == null) return;
        // The SDK runs the callback given to requestAuthorization from inside this call.
        manager().parseAuthorizationResult(resultCode, data);
    }

    private void finishAuth(AuthResult result) {
        PluginCall call = pendingAuth;
        pendingAuth = null;
        if (call == null) return;
        if (result.isSuccess() && result.getToken() != null) {
            preferences().edit().putString(TOKEN, result.getToken()).apply();
            call.resolve(new JSObject().put("authorized", true));
        } else {
            preferences().edit().remove(TOKEN).apply();
            call.resolve(new JSObject().put("authorized", false).put("error", code(result.getErrorCode())));
        }
    }

    @PluginMethod
    public void connect(PluginCall call) {
        String token = preferences().getString(TOKEN, null);
        if (token == null) {
            call.reject("Not authorized", "NOT_AUTHENTICATED");
            return;
        }
        File apk;
        try {
            apk = glassesApk();
        } catch (Exception failure) {
            call.reject("The glasses app is missing from this build", "GLASSES_APP_NOT_FOUND", failure);
            return;
        }
        closeSession();
        SessionConfig config = new SessionConfig(
            SessionType.CUSTOM_APP,
            GLASSES_PACKAGE,
            // Pause rather than fight the glasses' own assistant when the resident wakes it.
            AiInterceptMode.ALLOW_WITH_PAUSE,
            3000L,
            new SessionTimeouts(),
            null,
            null,
            GLASSES_ACTIVITY,
            apk.getAbsolutePath()
        );
        try {
            session = manager().create(config);
        } catch (Exception failure) {
            call.reject("Couldn't start a glasses session", "SESSION_ALREADY_EXISTS", failure);
            return;
        }
        CxrSession current = session;
        current.addLifecycleCallback(lifecycle);
        current.addImageCallback(images);
        current.addCustomCmdCallback(commands);
        current.connect(token);
        call.resolve(new JSObject().put("state", state()));
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        closeSession();
        // On sign-out the next account on this phone must give its own consent.
        if (Boolean.TRUE.equals(call.getBoolean("forget", false))) preferences().edit().remove(TOKEN).apply();
        call.resolve();
    }

    /** A screen for the glasses app: a title, a body and a hint for the buttons. */
    @PluginMethod
    public void show(PluginCall call) {
        CxrSession current = session;
        if (current == null) {
            call.reject("Glasses not connected", "SESSION_NOT_STARTED");
            return;
        }
        Caps caps = new Caps();
        caps.write("screen");
        caps.write(call.getString("tone", "info"));
        caps.write(call.getString("title", ""));
        caps.write(call.getString("body", ""));
        caps.write(call.getString("hint", ""));
        resolveResult(call, current.sendCustomCmd(TO_GLASSES, caps, new byte[0]));
    }

    /** Takes a photo with the glasses' camera and returns it base64-encoded. */
    @PluginMethod
    public void takePhoto(PluginCall call) {
        CxrSession current = session;
        if (current == null) {
            call.reject("Glasses not connected", "SESSION_NOT_STARTED");
            return;
        }
        if (pendingPhoto != null) {
            call.reject("A photo is already being taken", "OPERATION_IN_PROGRESS");
            return;
        }
        SessionResult<kotlin.Unit> started = current.takePhoto(PHOTO_WIDTH, PHOTO_HEIGHT, PHOTO_QUALITY);
        if (!started.isSuccess()) {
            call.reject(message(started), code(started.getCode()));
            return;
        }
        pendingPhoto = call;
    }

    @Override
    protected void handleOnDestroy() {
        closeSession();
    }

    private void closeSession() {
        CxrSession current = session;
        session = null;
        if (current == null) return;
        current.removeLifecycleCallback(lifecycle);
        current.removeImageCallback(images);
        current.removeCustomCmdCallback(commands);
        current.close();
        failPhoto("Glasses disconnected", "SESSION_NOT_STARTED");
    }

    private String state() {
        CxrSession current = session;
        return current == null ? "idle" : current.getState().name().toLowerCase();
    }

    private void emitState(String state, @Nullable String reason) {
        JSObject event = new JSObject().put("state", state);
        if (reason != null) event.put("reason", reason);
        main.post(() -> notifyListeners("state", event));
    }

    private final ISessionLifecycleCbk lifecycle = new ISessionLifecycleCbk() {
        @Override
        public void onSessionStarted() {
            emitState("started", null);
        }

        @Override
        public void onSessionPaused(PausedReason reason) {
            emitState("paused", reason.name());
        }

        @Override
        public void onSessionResumed() {
            emitState("started", null);
        }

        @Override
        public void onSessionTerminating(TerminatingReason reason, long gracePeriodMs) {
            emitState("terminating", reason.name());
        }

        @Override
        public void onSessionClosed(CloseReason reason) {
            main.post(() -> failPhoto("Glasses disconnected", "SESSION_NOT_STARTED"));
            emitState("idle", reason.name());
        }

        @Override
        public void onConnectResult(boolean success, SessionErrorCode error) {
            if (success) return;
            // An expired consent has to be given again in the Rokid AI App.
            if (error == SessionErrorCode.NOT_AUTHENTICATED || error == SessionErrorCode.TOKEN_EXPIRED) {
                preferences().edit().remove(TOKEN).apply();
            }
            emitState("idle", code(error));
        }
    };

    private final IImageCallback images = new IImageCallback() {
        @Override
        public void onImageReceived(byte[] data) {
            main.post(() -> {
                PluginCall call = pendingPhoto;
                pendingPhoto = null;
                if (call == null) return;
                call.resolve(new JSObject().put("data", Base64.encodeToString(data, Base64.NO_WRAP)).put("mime", mime(data)));
            });
        }

        @Override
        public void onImageError(SessionErrorCode error, int code, String message) {
            main.post(() -> failPhoto(message == null ? "The glasses couldn't take the photo" : message, code(error)));
        }
    };

    private final ICustomCmdSessionCallback commands = new ICustomCmdSessionCallback() {
        @Override
        public void onCustomCmdResult(String key, byte[] payload) {
            if (!FROM_GLASSES.equals(key) || payload == null) return;
            Caps caps = Caps.fromBytes(payload);
            if (caps == null || caps.size() < 2) return;
            try {
                String kind = caps.at(0).getString();
                String value = caps.at(1).getString();
                if ("button".equals(kind)) main.post(() -> notifyListeners("button", new JSObject().put("action", value)));
                else if ("app".equals(kind)) main.post(() -> notifyListeners("app", new JSObject().put("state", value)));
            } catch (Exception ignored) {
                // A message from another version of the glasses app; nothing to act on.
            }
        }
    };

    private void failPhoto(String message, String code) {
        PluginCall call = pendingPhoto;
        pendingPhoto = null;
        if (call == null) return;
        call.reject(message, code);
    }

    /** The glasses app ships inside this APK's assets; the SDK needs it as a file to upload to the glasses. */
    private File glassesApk() throws Exception {
        File target = new File(getContext().getFilesDir(), GLASSES_APK);
        try (InputStream in = getContext().getAssets().open(GLASSES_APK); OutputStream out = new FileOutputStream(target)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
        }
        return target;
    }

    private static void resolveResult(PluginCall call, SessionResult<?> result) {
        if (result.isSuccess()) call.resolve();
        else call.reject(message(result), code(result.getCode()));
    }

    private static String message(SessionResult<?> result) {
        return result.getMessage() == null ? result.getCode().name() : result.getMessage();
    }

    private static String code(@Nullable SessionErrorCode error) {
        return error == null ? "UNKNOWN" : error.name();
    }

    /** Rokid documents both JPEG (1.0) and WebP (1.1); tell them apart by their first bytes. */
    private static String mime(byte[] data) {
        boolean webp = data.length > 12 && data[0] == 'R' && data[1] == 'I' && data[2] == 'F' && data[3] == 'F' && data[8] == 'W' && data[9] == 'E' && data[10] == 'B' && data[11] == 'P';
        return webp ? "image/webp" : "image/jpeg";
    }
}
