/// <reference types="@capacitor-community/safe-area" />

import type { CapacitorConfig } from '@capacitor/cli';

// Deliberately no `server.url` here — the built dist/ output is bundled
// locally into the native shell instead of pointing at gerakmy.com. Two
// reasons: it keeps the app working offline the same way the existing PWA
// already does, and a bare remote-URL wrapper is a real App Store rejection
// risk under Apple's Guideline 4.2 (Minimum Functionality) — worth avoiding
// from day one even though iOS is a later phase.
const config: CapacitorConfig = {
  appId: 'com.gerakmy.app',
  appName: 'Gerak',
  webDir: 'dist',
  server: {
    // NOT the same thing as server.url above — this doesn't fetch content
    // from the network at all, it only changes what origin string the
    // bundled local WebView reports (Referer header, document.location,
    // etc). Content still loads from dist/ exactly as before. Set so the
    // app's origin matches the production website's, letting HTTP-referrer-
    // restricted API keys (e.g. Google Places) allowlist just one entry
    // (gerakmy.com) instead of needing a separate https://localhost/* rule
    // for native builds.
    hostname: 'gerakmy.com',
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: '#EF4444',
      androidScaleType: 'CENTER_CROP',
    },
    // Required by @capacitor-community/safe-area on Capacitor v8 — lets
    // that plugin own inset handling instead of Capacitor's own (still
    // in-progress) SystemBars insets logic fighting it.
    SystemBars: {
      insetsHandling: 'disable',
    },
  },
};

export default config;
