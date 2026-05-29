/// <reference lib="webworker" />
import { precache, matchPrecache } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

declare let self: ServiceWorkerGlobalScope;

// ─── Take control immediately ────────────────────────────────────
self.skipWaiting();
clientsClaim();

// ─── Precache assets (but do NOT register routes yet) ────────────
// We use precache() instead of precacheAndRoute() so that workbox
// does NOT add its own fetch listener for navigation. This lets our
// custom fetch handler below run first and strip CSP headers.
const manifest = self.__WB_MANIFEST;
precache(manifest);

// ─── Activate: clean old caches ──────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.includes('-precache-') && !key.includes(self.registration.scope))
          .map((key) => caches.delete(key))
      )
    )
  );
});

// ─── Unified fetch handler: COI + CSP + cache-first for assets ───
self.addEventListener('fetch', (event: FetchEvent) => {
  const request = event.request;

  // Skip non-http(s) and broken cache requests
  if (!request.url.startsWith('http')) return;
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

  // ── Navigation requests (HTML document) ──
  // Fetch from network, strip CSP, add COI headers.
  // This is the critical path: nsite.run's CSP blocks WebAssembly
  // unless we remove it before the browser parses the response.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 0) return response;
          return rewriteHeaders(response);
        })
        .catch(async () => {
          // Offline fallback: serve cached index.html
          const cached = await matchPrecache('index.html');
          return cached ? rewriteHeaders(cached) : new Response('Offline', { status: 503 });
        })
    );
    return;
  }

  // ── Asset requests (JS, CSS, WASM, images) ──
  // Cache-first strategy using workbox precache, with header rewriting
  // for same-origin requests (needed for CORP on sub-resources).
  event.respondWith(
    (async () => {
      const cached = await matchPrecache(request.url);
      if (cached) {
        // Rewrite headers on cached same-origin assets too
        return request.mode === 'same-origin' ? rewriteHeaders(cached) : cached;
      }
      const networkResponse = await fetch(request);
      return request.mode === 'same-origin' || request.mode === 'cors'
        ? rewriteHeaders(networkResponse)
        : networkResponse;
    })()
  );
});

// ─── Helper: rewrite response headers ────────────────────────────
function rewriteHeaders(response: Response): Response {
  const headers = new Headers(response.headers);

  // Cross-Origin Isolation (enables SharedArrayBuffer for WASM workers)
  headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');

  // Strip CSP that blocks WebAssembly.instantiate()
  // nsite.run sends: script-src 'self' 'unsafe-inline' blob: https:
  // which lacks 'wasm-unsafe-eval', blocking all WASM compilation
  headers.delete('content-security-policy');
  headers.delete('content-security-policy-report-only');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
