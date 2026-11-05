/* Service worker de Assurance Center: muestra las notificaciones push aunque la página esté cerrada
   o el celular con la pantalla apagada. No guarda nada en caché ni toca datos: solo recibe el aviso
   (que llega cifrado de punta a punta) y, al tocarlo, abre la pantalla que corresponde. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = {}; }
  const titulo = String(d.titulo || "Assurance Center").slice(0, 80);
  const url = /^[a-z-]+\.html([?#][^\s]*)?$/.test(String(d.url || "")) ? d.url : "escritorio.html";   // solo pantallas propias
  e.waitUntil(self.registration.showNotification(titulo, {
    body: String(d.cuerpo || "").slice(0, 160),
    tag: d.tag || "aviso", renotify: true,
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
