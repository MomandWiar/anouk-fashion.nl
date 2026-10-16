// Register the service worker only on the real (published) site, never inside the editor preview.
export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const inIframe = window.self !== window.top;
  const isPreview = /id-preview--|lovableproject\.com|localhost/.test(window.location.hostname);
  if (inIframe || isPreview) return;
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
