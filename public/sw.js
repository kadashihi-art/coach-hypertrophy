/* Coach Hypertrophy — SW mínimo (installability + shell cache).
 * Não cacheia /api/auth/* nem APIs autenticadas de forma agressiva.
 */
const CACHE = "ch-shell-v2";
const PRECACHE = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function isAuthOrApi(url) {
  const p = url.pathname;
  return p.startsWith("/api/") || p.startsWith("/auth/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Auth / API: sempre network (nunca cache)
  if (isAuthOrApi(url)) return;

  // Navegação HTML: network-first, fallback cache
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/"))),
    );
    return;
  }

  // Estáticos do shell (ícones, manifest, etc.): stale-while-revalidate
  if (
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/sw.js" ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".svg")
  ) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone()).catch(() => undefined);
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});

/* Rest timer: aviso de fim de descanso com a tela bloqueada (best effort). */
let restTimeout = null;
const REST_TAG = "rest-timer";
async function restCancel() {
  if (restTimeout) { clearTimeout(restTimeout); restTimeout = null; }
  try {
    const ns = await self.registration.getNotifications({ tag: REST_TAG, includeTriggered: true });
    ns.forEach((n) => n.close());
  } catch { /* ignore */ }
}
async function algumClienteVisivel() {
  const cs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  return cs.some((c) => c.visibilityState === "visible");
}
self.addEventListener("message", (event) => {
  const d = event.data || {};
  if (d.type === "rest-cancel") { event.waitUntil(restCancel()); return; }
  if (d.type !== "rest-schedule" || typeof d.endAt !== "number") return;
  const opts = { body: d.body || "", tag: REST_TAG, renotify: true, vibrate: [120, 60, 120], icon: "/icons/icon-192.png", badge: "/icons/icon-192.png" };
  event.waitUntil((async () => {
    await restCancel();
    // Notification Triggers (Chrome com flag/origin trial): agenda no sistema, sobrevive ao SW dormir.
    if (typeof self.TimestampTrigger === "function") {
      try {
        await self.registration.showNotification(d.title, { ...opts, showTrigger: new self.TimestampTrigger(d.endAt) });
        return;
      } catch { /* cai no plano B */ }
    }
    // Plano B: mantém o SW vivo até o fim (o navegador pode encerrar antes — best effort).
    const wait = Math.max(0, d.endAt - Date.now());
    await new Promise((resolve) => { restTimeout = setTimeout(resolve, wait); });
    restTimeout = null;
    if (await algumClienteVisivel()) return; // app aberto: o próprio app vibra/apita
    await self.registration.showNotification(d.title, opts);
  })());
});
self.addEventListener("notificationclick", (event) => {
  if (event.notification.tag !== REST_TAG) return;
  event.notification.close();
  event.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const c = cs.find((x) => new URL(x.url).pathname.startsWith("/treino")) || cs[0];
    if (c) return c.focus();
    return self.clients.openWindow("/treino");
  })());
});
