package com.barangai.glasses;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.rokid.cxr.CXRServiceBridge;
import com.rokid.cxr.Caps;
import java.util.HashMap;
import java.util.Map;

/**
 * The glasses side of BarangAI. The phone decides what to show and when: this screen only draws what it receives
 * and sends the resident's button presses back. No report data is stored here.
 */
public class MainActivity extends Activity {

    /** Channel names agreed with RokidGlassesPlugin on the phone. */
    private static final String FROM_PHONE = "rk_custom_client";
    private static final String TO_PHONE = "rk_custom_key";

    private static final int GREEN = Color.rgb(64, 255, 110);
    private static final int AMBER = Color.rgb(255, 200, 60);
    private static final int DIM = Color.rgb(150, 210, 160);

    /** Leg-key and touchpad events arrive as system broadcasts on Rokid Glasses (Rokid docs, "Glasses Keys and System Broadcasts"). */
    private static final Map<String, String> BUTTONS = new HashMap<>();

    static {
        BUTTONS.put("com.android.action.ACTION_SPRITE_BUTTON_CLICK", "click");
        BUTTONS.put("com.android.action.ACTION_SPRITE_BUTTON_DOUBLE_CLICK", "double_click");
        BUTTONS.put("com.android.action.ACTION_SPRITE_BUTTON_LONG_PRESS", "long_press");
        BUTTONS.put("com.android.action.ACTION_TWO_FINGER_SWIPE_FORWARD", "swipe_forward");
        BUTTONS.put("com.android.action.ACTION_TWO_FINGER_SWIPE_BACK", "swipe_back");
    }

    private CXRServiceBridge bridge;
    private TextView title;
    private TextView body;
    private TextView hint;

    private final BroadcastReceiver buttons = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = BUTTONS.get(intent.getAction());
            if (action == null) return;
            // While BarangAI is open, a click means "take the photo" here, not the glasses' own camera.
            if (isOrderedBroadcast()) abortBroadcast();
            send("button", action);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setContentView(layout());
        render("info", "BarangAI", "Waiting for your phone…", "Open BarangAI on your phone");

        bridge = new CXRServiceBridge(this);
        bridge.subscribe(FROM_PHONE, (CXRServiceBridge.MsgCallback) (name, caps, extra) -> {
            if (caps == null || caps.size() < 5) return;
            try {
                if (!"screen".equals(caps.at(0).getString())) return;
                String tone = caps.at(1).getString();
                String t = caps.at(2).getString();
                String b = caps.at(3).getString();
                String h = caps.at(4).getString();
                runOnUiThread(() -> render(tone, t, b, h));
            } catch (Exception ignored) {
                // A message from another version of the phone app.
            }
        });

        IntentFilter filter = new IntentFilter();
        for (String action : BUTTONS.keySet()) filter.addAction(action);
        filter.setPriority(IntentFilter.SYSTEM_HIGH_PRIORITY - 1);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(buttons, filter, Context.RECEIVER_EXPORTED);
        else registerReceiver(buttons, filter);
    }

    @Override
    protected void onResume() {
        super.onResume();
        send("app", "ready");
    }

    @Override
    protected void onPause() {
        send("app", "paused");
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        unregisterReceiver(buttons);
        super.onDestroy();
    }

    private void send(String kind, String value) {
        if (bridge == null) return;
        Caps caps = new Caps();
        caps.write(kind);
        caps.write(value);
        bridge.sendMessage(TO_PHONE, caps);
    }

    private void render(String tone, String t, String b, String h) {
        int accent = "warning".equals(tone) ? AMBER : GREEN;
        title.setText(t);
        title.setTextColor(accent);
        body.setText(b);
        hint.setText(h);
    }

    private LinearLayout layout() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(Color.BLACK);
        int pad = dp(24);
        root.setPadding(pad, pad, pad, pad);
        title = text(30, GREEN, true);
        body = text(22, GREEN, false);
        hint = text(18, DIM, false);
        root.addView(title);
        root.addView(body);
        root.addView(hint);
        ((LinearLayout.LayoutParams) body.getLayoutParams()).topMargin = dp(12);
        ((LinearLayout.LayoutParams) hint.getLayoutParams()).topMargin = dp(20);
        return root;
    }

    private TextView text(int sp, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setLayoutParams(new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        view.setGravity(Gravity.CENTER);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        view.setTextColor(color);
        view.setTypeface(Typeface.DEFAULT, bold ? Typeface.BOLD : Typeface.NORMAL);
        return view;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
