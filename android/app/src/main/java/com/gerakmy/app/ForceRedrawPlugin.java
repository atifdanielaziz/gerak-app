package com.gerakmy.app;

import android.view.View;
import android.webkit.WebView;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Diagnosed live via chrome://inspect on a Galaxy S24+: after a tab switch,
// the DOM/computed style are already correct AND Chrome's own compositor
// has painted the correct frame (confirmed via Page.captureScreenshot
// showing the right colour) — but the physical screen still shows the old
// frame until an unrelated later touch.
//
// First attempt here was webView.invalidate() / postInvalidateOnAnimation()
// — confirmed live it did NOT fix it either. That makes sense in hindsight:
// a modern hardware-accelerated WebView typically renders through its own
// independent Android Surface (Chromium's own compositor talking straight
// to SurfaceFlinger), separate from the normal View draw() cycle that
// invalidate() actually controls — so it was very likely a no-op for what's
// actually on screen.
//
// Toggling visibility off and back on is a much more forceful hammer: it
// makes Android's window manager recompute the entire surface stack's
// z-order/visibility, which reliably makes SurfaceFlinger reconsider what's
// actually being presented — not just asking the View to redraw itself.
@CapacitorPlugin(name = "ForceRedraw")
public class ForceRedrawPlugin extends Plugin {

    @PluginMethod
    public void redraw(PluginCall call) {
        WebView webView = getBridge().getWebView();
        webView.post(() -> {
            webView.setVisibility(View.INVISIBLE);
            webView.post(() -> webView.setVisibility(View.VISIBLE));
        });
        call.resolve();
    }
}
