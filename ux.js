/* =====================================================================
   UX transversal de todas las pantallas (no toca la lógica de negocio):
   1. Tema claro / oscuro: se aplica antes de pintar, se guarda en este navegador (localStorage "tema")
      y se cambia con el botón ☀/☾ del encabezado (o el flotante del ingreso).
   2. Accesibilidad (WCAG 2.2): salto al contenido, nombre accesible para la navegación y la campana,
      y teclado (Enter / Espacio) en las filas que se tocan (las que tienen data-accion y no son botones).
   Va en el <head> de cada página, antes de estilos.css.
   ===================================================================== */
(() => {
  const CLAVE = "tema", COLOR = { oscuro:"#0d1117", claro:"#f6f8fa" };
  const raiz = document.documentElement;
  const guardado = () => { try { return localStorage.getItem(CLAVE); } catch { return null; } };
  const actual = () => raiz.dataset.tema === "claro" ? "claro" : "oscuro";

  function aplicar(tema){
    if (tema === "claro") raiz.dataset.tema = "claro"; else delete raiz.dataset.tema;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = COLOR[tema];
    document.querySelectorAll(".tema-btn").forEach(pintarBoton);
  }
  // Por defecto, oscuro (el de siempre en la sala de operaciones). Si la persona eligió otro, se respeta.
  aplicar(guardado() === "claro" ? "claro" : "oscuro");

  const SOL = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const LUNA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
  function pintarBoton(b){
    const claro = actual() === "claro";
    b.innerHTML = claro ? LUNA : SOL;
    b.setAttribute("aria-label", claro ? "Cambiar a tema oscuro" : "Cambiar a tema claro");
    b.setAttribute("aria-pressed", String(claro));
    b.title = claro ? "Tema oscuro" : "Tema claro";
  }
  function cambiar(){
    const nuevo = actual() === "claro" ? "oscuro" : "claro";
    raiz.classList.add("cambia-tema");
    aplicar(nuevo);
    try { localStorage.setItem(CLAVE, nuevo); } catch {}
    setTimeout(() => raiz.classList.remove("cambia-tema"), 300);
  }
  function nuevoBoton(clase){
    const b = document.createElement("button");
    b.type = "button"; b.className = "btn-icono tema-btn " + clase;
    b.addEventListener("click", cambiar);
    pintarBoton(b);
    return b;
  }

  // ---------- Accesibilidad ----------
  const NATIVOS = new Set(["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA", "SUMMARY", "LABEL"]);
  function mejorar(){
    const top = document.querySelector(".top");
    // Botón de tema: en el encabezado (antes de la campana) o flotante en el ingreso
    if (top && !top.querySelector(".tema-btn")) {
      const campana = top.querySelector("a.btn-icono");
      campana ? top.insertBefore(nuevoBoton(""), campana) : top.appendChild(nuevoBoton(""));
    } else if (!top && document.querySelector(".login") && !document.querySelector(".tema-btn")) {
      document.body.appendChild(nuevoBoton("tema-flotante"));
    }
    // Salto al contenido principal
    const app = document.getElementById("app") || document.querySelector("main");
    if (app && !document.querySelector(".saltar")) {
      if (!app.id) app.id = "contenido";
      if (!app.hasAttribute("tabindex")) app.tabIndex = -1;
      const a = document.createElement("a");
      a.className = "saltar"; a.href = "#" + app.id; a.textContent = "Saltar al contenido";
      document.body.prepend(a);
    }
    const nav = document.querySelector(".nav");
    if (nav && !nav.hasAttribute("aria-label")) nav.setAttribute("aria-label", "Navegación principal");
    // La campana anuncia cuántas notificaciones hay sin leer
    const badge = document.getElementById("badge"), campana = badge?.closest("a");
    if (campana) {
      const n = badge.hidden ? "" : badge.textContent.trim();
      const nombre = n ? `Notificaciones, ${n} sin leer` : "Notificaciones";
      if (campana.getAttribute("aria-label") !== nombre) campana.setAttribute("aria-label", nombre);
    }
    // Filas y tarjetas que se tocan (data-accion) sin ser botones: se pueden usar con teclado
    document.querySelectorAll("[data-accion]").forEach(el => {
      if (NATIVOS.has(el.tagName) || el.dataset.uxTeclado) return;
      el.dataset.uxTeclado = "1";
      if (!el.hasAttribute("role")) el.setAttribute("role", "button");
      if (!el.hasAttribute("tabindex")) el.tabIndex = 0;
    });
    // Campos sin etiqueta asociada: usan el texto de ayuda visible como nombre accesible
    document.querySelectorAll("input:not([type=hidden]), select, textarea").forEach(el => {
      if (el.labels?.length || el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby")) return;
      const fila = el.closest("li, .campo, .fila, tr, .eq-fila, .nivel-esc, .linea, div");
      const campo = el.dataset.campo ? el.dataset.campo.replace(/[_-]+/g, " ").replace(/^./, c => c.toUpperCase()) : "";
      const texto = el.getAttribute("placeholder") || el.title || fila?.querySelector("b, strong, th, legend, span")?.textContent || campo;
      if (texto.trim()) el.setAttribute("aria-label", texto.trim().replace(/\s+/g, " ").slice(0, 80));
    });
  }
  // Escape cierra la hoja o el formulario abierto (igual que tocar el fondo oscuro: cancela sin guardar)
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape" || document.getElementById("ventanaTexto") || document.getElementById("alarma")) return;
    const velo = document.getElementById("velo");
    if (velo?.classList.contains("on")) velo.click();
  });
  // Enter o Espacio sobre una fila con role="button" hace lo mismo que tocarla
  document.addEventListener("keydown", e => {
    const el = e.target;
    if (!(el instanceof HTMLElement) || !el.dataset?.uxTeclado || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    el.click();
  });

  let pendiente = false;
  const programar = () => { if (pendiente) return; pendiente = true; requestAnimationFrame(() => { pendiente = false; mejorar(); }); };
  const empezar = () => { mejorar(); new MutationObserver(programar).observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:["hidden"] }); };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", empezar) : empezar();
})();
