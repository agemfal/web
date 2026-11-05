/* Service worker de Assurance Center: muestra las notificaciones push aunque la página esté cerrada
   o el celular con la pantalla apagada. No guarda nada en caché ni toca datos: solo recibe el aviso
   (que llega cifrado de punta a punta) y, al tocarlo, abre la pantalla que corresponde.
   Las cargas de pantalla (navegación) pasan directo a internet: algunas versiones de Chrome piden un manejador
   de "fetch" para ofrecer "Instalar app". No intercepta la API ni guarda respuestas. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", e => {
  if (e.request.mode !== "navigate") return;            // solo las pantallas; lo demás sigue su camino normal
  e.respondWith(fetch(e.request).catch(() => new Response(
    "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><body style='font-family:system-ui;background:#0b0f17;color:#e6edf3;padding:24px'><h1>Sin conexión</h1><p>Revisá internet y volvé a abrir Assurance Center.</p>",
    { headers:{ "Content-Type":"text/html; charset=utf-8" } })));
});

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = {}; }
  const titulo = String(d.titulo || "Assurance Center").slice(0, 80);
  const url = /^[a-z-]+\.html([?#][^\s]*)?$/.test(String(d.url || "")) ? d.url : "escritorio.html";   // solo pantallas propias
  e.waitUntil(self.registration.showNotification(titulo, {
    body: String(d.cuerpo || "").slice(0, 160),
    tag: d.tag || "aviso", renotify: true, silent: false,
    // Escalamientos y convocatorias: vibración larga y quedan en pantalla hasta tocarlos. Chats: vibración corta.
    vibrate: d.tag === "avisos" ? [400, 150, 400, 150, 400] : [150, 80, 150],
    requireInteraction: d.tag === "avisos",
    icon: "icono.svg", badge: "icono.svg",
    data: { url: new URL(url, self.registration.scope).href },
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const destino = e.notification.data?.url || self.registration.scope;
  e.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of abiertas) if (c.url.startsWith(self.registration.scope)) { await c.focus(); return c.navigate(destino); }
    return self.clients.openWindow(destino);
  })());
});
