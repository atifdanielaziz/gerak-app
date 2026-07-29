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
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: '#EF4444',
      androidScaleType: 'CENTER_CROP',
    },
  },
};

export default config;
