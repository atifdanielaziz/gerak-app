import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { StatusBar } from '@capacitor/status-bar'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

// Newer Android versions (targeting API 35+) render app content edge-to-edge
// under the status bar by default — the web build's own CSS already
// accounts for this correctly via env(safe-area-inset-top) (that's why the
// browser/PWA version looks fine), but nothing tells the native Android
// status bar to actually reserve its own space, so the WebView draws
// straight under it with no gap. Telling it not to overlay sidesteps the
// whole issue rather than depending on the WebView correctly propagating
// window insets into CSS env() variables.
if (Capacitor.isNativePlatform()) {
  StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
}

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
