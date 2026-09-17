/* Service Worker Kipointe — cache applicatif complet du kiosque : la tablette démarre et fonctionne sans réseau.
 * Stratégies :
 *   - /api/*                : réseau uniquement (jamais de cache) ;
 *   - navigations (/kiosque) : réseau d'abord, cache en secours, /kiosque en dernier recours ;
 *   - /_next/static/*       : cache d'abord (fichiers immuables, hachés) ;
 *   - autres GET same-origin : cache puis rafraîchissement en arrière-plan.
 */
const VERSION = "kipointe-sw-v1";
const SHELL = ["/kiosque", "/kiosque/appairage", "/manifest.webmanifest", "/icons/icon.svg", "/icons/icon-maskable.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then(async (cache) => {
      await Promise.allSettled(SHELL.map((url) => cache.add(new Request(url, { cache: "reload" }))));
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cles) => Promise.all(cles.filter((c) => c !== VERSION).map((c) => caches.delete(c)))).then(() => self.clients.claim()),
  );
});

function cleCache(request) {
  const url = new URL(request.url);
  url.search = "";
  url.hash = "";
  return url.toString();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // réseau uniquement

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(VERSION);
        try {
          const reponse = await fetch(request);
          if (reponse.ok) cache.put(cleCache(request), reponse.clone());
          return reponse;
        } catch {
          return (await cache.match(cleCache(request))) || (await cache.match("/kiosque")) || Response.error();
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(VERSION);
        const enCache = await cache.match(request);
        if (enCache) return enCache;
        const reponse = await fetch(request);
        if (reponse.ok) cache.put(request, reponse.clone());
        return reponse;
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      const enCache = await cache.match(cleCache(request));
      const rafraichissement = fetch(request)
        .then((reponse) => {
          if (reponse.ok) cache.put(cleCache(request), reponse.clone());
          return reponse;
        })
        .catch(() => null);
      return enCache || (await rafraichissement) || Response.error();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
