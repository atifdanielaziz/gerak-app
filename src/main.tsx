import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@capacitor-community/safe-area'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

// Newer Android versions render app content edge-to-edge under the status
// bar by default. The previous fix here (@capacitor/status-bar's
// setOverlaysWebView) only worked by coincidence on some Android versions —
// confirmed broken on a real Android 15 device, where Google now enforces
// edge-to-edge regardless and the old API silently no-ops. @capacitor-
// community/safe-area replaces it: it's self-initializing (no JS call
// needed here, just importing it registers its native listener), and on
// Chromium versions with the known env(safe-area-inset-*) reporting bug it
// pads the WebView itself so those CSS variables stay accurate everywhere
// they're already used in this app (Header.tsx, BottomNav.tsx, etc.) — no
// changes needed there.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(() => {
        // SW registered
      })
      .catch((error) => {
        console.error('GERAK Service Worker registration failed:', error);
      });
  });
}
