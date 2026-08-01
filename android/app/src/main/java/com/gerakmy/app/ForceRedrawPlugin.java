package com.gerakmy.app;

import android.webkit.WebView;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Diagnosed live via chrome://inspect on a Galaxy S24+: after a tab switch,
// the DOM/computed style are already correct AND Chrome's own compositor
// has painted the correct frame (confirmed via Page.captureScreenshot
// showing the right colour) — but the physical screen still shows the old
// frame until an unrelated later touch. Since Chrome's internal render
// pipeline is provably already correct, no JS/CSS technique (transform-gpu,
// requestAnimationFrame, forced reflow — all tried, all insufficient) can
// fix this: the already-correct frame simply isn't being presented to the
// display. That's an Android View-level concern, not a web-layer one.
// invalidate() explicitly schedules a real Android redraw pass for the
// WebView's own View, independent of whatever is deciding not to present
// the frame Chrome already composited.
@CapacitorPlugin(name = "ForceRedraw")
public class ForceRedrawPlugin extends Plugin {

    @PluginMethod
    public void redraw(PluginCall call) {
        WebView webView = getBridge().getWebView();
        webView.post(() -> {
            webView.invalidate();
            webView.postInvalidateOnAnimation();
        });
        call.resolve();
    }
}
