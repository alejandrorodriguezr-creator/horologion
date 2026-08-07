/*
 * Horologion — service worker.
 * Estrategia: cache-first para carga instantánea y uso sin conexión, con
 * revalidación en segundo plano (stale-while-revalidate) para que el
 * contenido se mantenga al día sin bloquear la primera pintura.
 *
 * Actualizaciones: cada despliegue debe subir CACHE_VERSION. La versión
 * nueva se instala en paralelo (sin tocar la caché activa), y solo
 * reemplaza a la anterior cuando la pestaña llama a skipWaiting (ver
 * mensaje "SKIP_WAITING" más abajo, disparado desde index.html cuando el
 * usuario acepta actualizar). Así nadie queda atrapado en una versión
 * vieja, pero tampoco se le interrumpe una oración a mitad de camino.
 */
const CACHE_VERSION = "horologion-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(() => {})
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.filter(n => n !== CACHE_VERSION).map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", event => {
  if(event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  const req = event.request;
  /* Solo GET del mismo origen: nunca interceptamos POST, otros orígenes,
     ni esquemas especiales (chrome-extension:, etc.). */
  if(req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_VERSION).then(async cache => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then(res => {
          if(res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      /* Cache-first: responde de inmediato si hay copia local; si no,
         espera la red. Cualquiera de las dos formas, la red actualiza
         la caché en segundo plano para la próxima visita. */
      return cached || (await network) || Response.error();
    })
  );
});
