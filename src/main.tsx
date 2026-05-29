import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'

// ─── Service Worker Registration with Reload Guard ───────────────
// On first visit, the SW isn't active yet so nsite.run's CSP applies.
// After the SW registers and takes control, ONE reload is needed so
// the SW can intercept the HTML response and strip the CSP headers.
// We use sessionStorage to prevent an infinite reload loop.
const RELOAD_KEY = 'nostr-compress-coi-reload';

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;

    // Force check for updates on registration to bypass 24-hour browser throttling
    registration.update().catch(err => {
      console.error('Failed to check for service worker update:', err);
    });

    // If we're already cross-origin isolated, we're done
    if (window.crossOriginIsolated) {
      sessionStorage.removeItem(RELOAD_KEY);
      return;
    }

    // If the SW is active and controlling but COI isn't set,
    // do ONE reload so the SW can intercept the navigation request
    const sw = registration.active || registration.waiting || registration.installing;
    if (sw && !sessionStorage.getItem(RELOAD_KEY)) {
      // Wait for the SW to become active before reloading
      const doReload = () => {
        sessionStorage.setItem(RELOAD_KEY, '1');
        window.location.reload();
      };

      if (sw.state === 'activated') {
        doReload();
      } else {
        sw.addEventListener('statechange', () => {
          if (sw.state === 'activated') doReload();
        });
      }
    }
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
