"use strict";
// Offline copy of the site. The first online visit saves it on the device. The Gemara text
// itself comes from Sefaria, and every amud the student opens (plus the next two days'
// dafim, which app.js fetches ahead) is saved too. Online, files still come from the
// network first (up to 4s), so updates show up; the saved copy is the fallback.
const CACHE = "site-v1";
const TEXTS = "sefaria-v1";
const SHELL = ["./", "app.css", "app.js", "apple-touch-icon.png", "daf-layout.js", "icon-home.svg", "icon.svg", "index.html", "offline.js", "data/masechtot.json", "data/vocab.json"];
const SEFARIA = "https://www.sefaria.org";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== TEXTS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// offline.js asks for this on every online visit; the texts are saved as they are read
self.addEventListener("message", () => {});

// Network first, but give up after a few seconds (a weak signal shouldn't stall the page).
function fresh(req, cacheName) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("slow")), 4000);
    // "no-cache": always ask the server (a cheap 304 if nothing changed) rather than
    // trusting the browser's own cache, so a new app.js shows up on the next visit
    fetch(req, { cache: "no-cache" }).then(res => {
      clearTimeout(t);
      if (res.ok) { const copy = res.clone(); caches.open(cacheName).then(c => c.put(req, copy)); }
      resolve(res);
    }, err => { clearTimeout(t); reject(err); });
  });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === SEFARIA && url.pathname.startsWith("/api/")) {
    // the calendar changes daily; a saved one is only a fallback. Texts never change.
    e.respondWith(fresh(req, TEXTS).catch(() => caches.match(req, { cacheName: TEXTS })
      .then(hit => hit || Response.error())));
    return;
  }
  if (url.origin !== self.location.origin) return;
  e.respondWith(fresh(req, CACHE).catch(() =>
    caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match("index.html"))));
});
