package com.gerakmy.app;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Android's stock WebView does not implement window.print() at all — calling
// it from the app's web code (receiptPdf.ts) silently no-ops on native,
// unlike a real browser where it opens the OS print dialog (with "Save as
// PDF" as a built-in destination). This plugin bridges that gap: it loads
// the same receipt HTML into a throwaway, unattached WebView instance and
// hands that instance to Android's own PrintManager, which surfaces the
// exact same system print dialog / "Save as PDF" option a real browser
// would. The throwaway WebView is never added to any view hierarchy — the
// print subsystem only needs its PrintDocumentAdapter, not visible pixels.
@CapacitorPlugin(name = "NativePrint")
public class NativePrintPlugin extends Plugin {

    @PluginMethod
    public void print(PluginCall call) {
        String html = call.getString("html");
        if (html == null) {
            call.reject("html is required");
            return;
        }
        String jobName = call.getString("jobName", "Gerak Receipt");

        getActivity().runOnUiThread(() -> {
            WebView printWebView = new WebView(getContext());
            printWebView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    PrintManager printManager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
                    if (printManager == null) {
                        call.reject("Print service unavailable");
                        return;
                    }
                    PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(jobName);
                    printManager.print(jobName, adapter, new PrintAttributes.Builder().build());
                    call.resolve();
                }
            });
            printWebView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        });
    }
}
