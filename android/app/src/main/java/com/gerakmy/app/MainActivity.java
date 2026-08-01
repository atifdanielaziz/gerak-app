package com.gerakmy.app;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativePrintPlugin.class);
        registerPlugin(ForceRedrawPlugin.class);
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
        // Debug builds only - lets chrome://inspect on a connected computer
        // attach directly to this WebView, so a repaint bug we can't
        // reproduce ourselves can actually be diagnosed with DevTools'
        // Rendering > Paint flashing, instead of guessing blind again.
        // Never enabled in a release build (remote debugging shouldn't ship
        // to production).
        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
    }
}
