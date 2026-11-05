/* =====================================================================
   APP.JS — núcleo compartido por todas las páginas
   Hace: sesión, encabezado, menú inferior, botón ＋, datos, auto-refresco.
   Cada página solo define su contenido con:
       App.iniciar({ id:"inicio", titulo:"...", render: d => "<html>" })
   ===================================================================== */

/* ===== CONFIGURACIÓN GENERAL ===== */
const CONFIG = {
  MODO_DATOS:   "api",       // "local" = PRUEBAS (datos de demo en el navegador) | "api" = PRODUCCIÓN
  URL_API:      "https://br-lively-lake-bd089ovn-nocapi.compute.c-8.us-east-2.aws.neon.tech/api",        // solo modo "api"
  URL_LOGIN:    "login.html",
  REFRESCO_SEG: 10,            // auto-actualización (0 = desactivada)
  // Demo → n8n: si tiene una URL (o se carga en Perfil), los cambios de categoría de un INC también se mandan
  // a ese webhook de n8n para que actualice el INC en la base. En modo "api" no hace falta: todo pasa por n8n.
  N8N_WEBHOOK_INC: "",
  PRIORIDAD_CRITICA: 3         // respaldo si no hay clasificación: P1..P3 → CRÍTICO; resto → AFECTADO
};

/* Método "disponibilidad" (red móvil): >= ok → OK | >= warn → Degradado | menor → Crítico */
const UMBRALES = { ok: 99.5, warn: 97 };

/* =====================================================================
   👉 CÓMO PASAR A PRODUCCIÓN
   ---------------------------------------------------------------------
   1. CONFIG.MODO_DATOS = "api" y CONFIG.URL_API = URL real del backend.
   2. El backend responde GET {URL_API}/tablero con un JSON de la misma
      forma que DATOS_DEMO:
        servicios:  [{ id, nombre, red, grupo, icono, metodo, disponibilidad?, detalle? }]
        incidentes: [{ inc, servicios:[id,...], prioridad, titulo, inicio(ISO), afectados? }]
      - El estado de cada servicio (fija y móvil) sale de los INC ABIERTOS asociados.
      - (Opcional) metodo "disponibilidad": el estado sale del % según UMBRALES.
      Solo hay que mandar los INC abiertos.
   3. Se envía el token del login en el header Authorization; validalo
      en el backend. Si responde 401, la app vuelve al login.
   4. Las páginas no se tocan: solo cambia de dónde vienen los datos.
   ===================================================================== */

/* =====================================================================
   MENÚ INFERIOR — una página por botón (máx. 5, el del medio es ＋)
   Para agregar una página: creá el .html copiando uno existente y
   sumala acá.
   ===================================================================== */
// Barra inferior. "ids": pantallas en las que cada lugar se marca activo (Servicios y Reportes viven dentro de Inicio)
const NAV = [
  { id:"inicio",     href:"escritorio.html", icono:"inicio",  texto:"Inicio",     ids:["inicio", "servicios", "reportes"] },
  { id:"incidentes", href:"incidentes.html", icono:"alerta",  texto:"Incidentes", ids:["incidentes", "convocatoria"] },
  { id:"fab" },
  { id:"chats",      href:"chats.html",      icono:"mensaje", texto:"Chats",      ids:["chats"] },
  { id:"perfil",     href:"perfil.html",     icono:"usuario", texto:"Perfil",     ids:["perfil", "notificaciones"] }
];

// Acciones del botón ＋ (conectá cada una en App.accion)
const ACCIONES_FAB = [
  { id:"convocatoria", icono:"campana", texto:"Convocatoria general", clase:"req-gestor alarma" }   // solo jefes (RBAC por CSS; el backend lo valida)
];

/* =====================================================================
   DATOS DE DEMO (misma forma que debe devolver producción)
   Cada servicio indica su "red" y su "metodo" ("inc" por defecto, o "disponibilidad").
   ===================================================================== */
const minAtras = m => new Date(Date.now() - m * 60000).toISOString();

const DATOS_DEMO = {
  servicios: [
    { id:"fija",        nombre:"Fija",        red:"Red Fija", grupo:"Acceso", icono:"red" },
    { id:"television",  nombre:"Televisión",  red:"Red Fija", grupo:"TV",     icono:"tv" },
    { id:"voice-ip",    nombre:"Voice IP",    red:"Red Fija", grupo:"Voz",    icono:"telefono" },
    { id:"datos-movil", nombre:"Datos Móviles", red:"Red Móvil", grupo:"4G/5G",      icono:"antena" },
    { id:"voz-movil",   nombre:"Voz Móvil",     red:"Red Móvil", grupo:"VoLTE",      icono:"telefono" },
    { id:"sms",         nombre:"SMS",           red:"Red Móvil", grupo:"Mensajería", icono:"mensaje" }
  ],
  incidentes: [
    { inc:"INC000412301", servicios:["fija"], prioridad:1, grave:"si", titulo:"Corte de fibra troncal OLT Norte", inicio:minAtras(85), afectados:1450,
      descripcion:"Se detecta pérdida de señal en la troncal de fibra que une la OLT Norte con el nodo de agregación Centro.\n\n" +
        "Síntomas: clientes GPON de las zonas Norte 1, Norte 2 y Parque Industrial sin servicio de datos ni voz. Las ONT reportan LOS (pérdida de señal óptica).\n\n" +
        "Diagnóstico inicial: el OTDR marca un evento reflectivo a 3,2 km de la OLT, compatible con un corte físico. Hay una obra vial en Av. Libertador al 4500.\n\n" +
        "Acciones: se despachó la cuadrilla de planta externa (ETA 40 min). Se evalúa el desvío por el anillo secundario; requiere aprobación del jefe de turno.\n\n" +
        "Contactos: guardia de planta externa interno 4410 · jefe de turno interno 4400." },
    { inc:"INC000412355", servicios:["television"],  prioridad:5, grave:"posible", titulo:"Pixelado en canales HD",           inicio:minAtras(40),
      descripcion:"Clientes reportan pixelado en los canales HD del paquete premium. Afecta solo a decodificadores modelo X200." },
    { inc:"INC000412360", servicios:["television"],  prioridad:6, grave:"no", titulo:"Guía de programación desactualizada", inicio:minAtras(15),
      descripcion:"La guía de programación (EPG) de los decodificadores no muestra la grilla de hoy.\n\nCausa probable: la carga diaria desde el proveedor de contenidos (04:00) no se completó.\n\nImpacto: los clientes ven la guía vacía; la reproducción en vivo funciona con normalidad.\n\nAcción: reprocesar la carga manual con el proveedor y validar en un decodificador de prueba." },
    { inc:"INC000412371", servicios:["voz-movil"], prioridad:2, grave:"posible", titulo:"Llamadas cortadas zona Norte", inicio:minAtras(25), afectados:1200,
      descripcion:"Se cortan las llamadas de voz (VoLTE) a los 30–60 segundos en las celdas de la zona Norte.\n\nDiagnóstico inicial: el corte se concentra en el nodo de core de voz IMS 2; el nodo IMS 1 no presenta fallas.\n\nImpacto: unos 1200 clientes con llamadas entrecortadas o que no se completan.\n\nAcción: derivar el tráfico al nodo IMS 1 y revisar la sesión SIP con el proveedor de interconexión." }
  ]
};

/* =====================================================================
   ÍCONOS (SVG locales, sin dependencias)
   ===================================================================== */
const ICONOS = {
  inicio:'<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  server:'<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  grafico:'<path d="M3 3v18h18M7 15l4-4 3 3 5-6"/>',
  usuario:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  mas:'<path d="M12 5v14M5 12h14"/>',
  campana:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
  alerta:'<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  check:'<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  reloj:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  ticket:'<path d="M3 8a2 2 0 0 0 0 4v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4a2 2 0 0 1 0-4V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/>',
  buscar:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  mapa:'<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  salir:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  red:'<circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M12 7v5M12 12l-6 5.5M12 12l6 5.5"/>',
  tv:'<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M8 2l4 4 4-4"/>',
  play:'<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/>',
  antena:'<path d="M12 12v9M8 21h8"/><circle cx="12" cy="10" r="2"/><path d="M8.5 6.5a5 5 0 0 0 0 7M15.5 6.5a5 5 0 0 1 0 7M5.6 3.6a9 9 0 0 0 0 12.8M18.4 3.6a9 9 0 0 1 0 12.8"/>',
  telefono:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  mensaje:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  filtro:'<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  flecha:'<path d="M9 6l6 6-6 6"/>',
  clip:'<path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.5 3.5 0 0 1 5 5l-8.6 8.6a2 2 0 0 1-2.8-2.8l7.9-7.9"/>',
  enviar:'<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  mano:'<path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8a8 8 0 0 0 16 0v-3a2 2 0 0 0-4 0"/>',
  subir:'<path d="M12 19V5M5 12l7-7 7 7"/>',
  pin:'<path d="M12 17v5M9 3h6l-1 7 3 3H7l3-3z"/>',
  nota:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  equipo:'<path d="M16 21v-2a4 4 0 0 0-8 0v2"/><circle cx="12" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M2 21v-2a4 4 0 0 1 3-3.9"/>',
  cambiar:'<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  archivo:'<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>',
  candado:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  silencio:'<path d="M13.7 21a2 2 0 0 1-3.4 0M18.6 13A17 17 0 0 1 18 8M6.3 6.3A6 6 0 0 0 6 8c0 7-3 9-3 9h14M18 8a6 6 0 0 0-9.3-5M2 2l20 20"/>',
  historial:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/>',
  x:'<path d="M18 6L6 18M6 6l12 12"/>',
  enlace:'<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'
};

/* =====================================================================
   REGLAS DE ESTADO (todo sale de los INC asociados)
   ===================================================================== */
const $  = s => document.querySelector(s);
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const icono = n => `<svg class="i"><use href="#i-${n}"/></svg>`;
const ESTADO_TXT = { ok:"Sin INC", warn:"Afectado", crit:"Crítico", info:"Info" };
const ESTADO_TXT_DISP = { ok:"Operativo", warn:"Degradado", crit:"Crítico" };
const esDisp = s => s.metodo === "disponibilidad";
const textoEstado = (s, e) => (esDisp(s) ? ESTADO_TXT_DISP : ESTADO_TXT)[e];
const estadoDisp = v => v >= UMBRALES.ok ? "ok" : v >= UMBRALES.warn ? "warn" : "crit";
const ordenEstado = { crit:0, warn:1, ok:2 };

/* Clasificación operativa de INC: categoría = Prioridad × INC Grave; "prioridad" del INC = P# (1 = más urgente).
   La define el Administrador (Configuración → Clasificación de INC) y llega en GET /me; si no, vale esta. */
const CLASIF_BASE = {
  prioridades:[{ id:"critica", nombre:"Crítica", severidad:"crit" }, { id:"alta", nombre:"Alta", severidad:"warn" }],
  graves:[{ id:"si", nombre:"Sí", mayor:"si" }, { id:"posible", nombre:"Posible", mayor:"posible" }, { id:"no", nombre:"No", mayor:"no" }],
  categorias:[{ p:1, nombre:"Crítico Mayor", prioridad:"critica", grave:"si" }, { p:2, nombre:"Crítico Potencial", prioridad:"critica", grave:"posible" },
    { p:3, nombre:"Crítico Menor", prioridad:"critica", grave:"no" }, { p:4, nombre:"Alto Mayor", prioridad:"alta", grave:"si" },
    { p:5, nombre:"Alto Potencial", prioridad:"alta", grave:"posible" }, { p:6, nombre:"Alto Menor", prioridad:"alta", grave:"no" }]
};
const clasif = () => { try { return JSON.parse(sessionStorage.getItem("clasificacion") || "null") || CLASIF_BASE; } catch { return CLASIF_BASE; } };
const catInc = p => clasif().categorias.find(c => c.p === Number(p)) || null;
const sevInc = p => { const c = catInc(p); return c ? clasif().prioridades.find(x => x.id === c.prioridad)?.severidad || "warn" : Number(p) <= CONFIG.PRIORIDAD_CRITICA ? "crit" : "warn"; };
const nombreInc = p => catInc(p)?.nombre || `P${p}`;
const etiquetaInc = p => catInc(p) ? `${catInc(p).nombre} · P${p}` : `P${p}`;
// ¿Es incidente mayor? "si" | "posible" | "no" (por la categoría; si no tiene, por el campo grave del INC)
const mayorInc = i => { const c = catInc(i.prioridad), g = c && clasif().graves.find(x => x.id === c.grave); if (g) return g.mayor;
  const v = String(i.grave ?? "").trim().toLowerCase(); return /^(s[ií]|true|1)$/.test(v) ? "si" : v === "posible" ? "posible" : "no"; };
// Estado de un INC por su categoría
const estadoInc = i => sevInc(i.prioridad);
// INC abiertos asociados a un servicio
const incDe = (d, s) => d.incidentes.filter(i => i.servicios.includes(s.id)).sort((a,b) => a.prioridad - b.prioridad);
// Estado del servicio: por disponibilidad (móvil) o por el peor de sus INC (fija)
function estadoServicio(d, s){
  if (esDisp(s)) return estadoDisp(s.disponibilidad);
  const incs = incDe(d, s);
  if (!incs.length) return "ok";
  return incs.some(i => estadoInc(i) === "crit") ? "crit" : "warn";
}
const ordenarServicios = d => [...d.servicios].sort((a,b) =>
  ordenEstado[estadoServicio(d,a)] - ordenEstado[estadoServicio(d,b)] ||
  (esDisp(a) && esDisp(b) ? a.disponibilidad - b.disponibilidad : incDe(d,b).length - incDe(d,a).length));
const ordenarInc = arr => [...arr].sort((a,b) => a.prioridad - b.prioridad || new Date(a.inicio) - new Date(b.inicio));

// Salud general
function saludRed(d){
  const est = d.servicios.map(s => estadoServicio(d, s));
  const total = est.length, criticos = est.filter(e => e === "crit").length, afectados = est.filter(e => e === "warn").length;
  const ok = total - criticos - afectados;
  return {
    total, ok, criticos, afectados, incs: d.incidentes.length,
    clase:  criticos ? "crit" : afectados ? "warn" : "ok",
    titulo: criticos ? "Servicio crítico" : afectados ? "Servicios afectados" : "Todo operativo"
  };
}

// "hace 1 h 20 min"
// "en 3 min" / "ya" para el próximo nivel de escalamiento
const enCuanto = iso => { const s = (new Date(iso) - Date.now()) / 1000; return s <= 5 ? "ya" : s < 60 ? "en menos de 1 min" : s < 3600 ? `en ${Math.round(s / 60)} min` : `en ${Math.round(s / 3600)} h`; };
function hace(iso){
  const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return h < 24 ? `hace ${h} h${r ? " " + r + " min" : ""}` : `hace ${Math.floor(h/24)} d`;
}
const nombreServicio = (d, id) => d.servicios.find(s => s.id === id)?.nombre || id;

/* =====================================================================
   COMPONENTES REUTILIZABLES
   ===================================================================== */
const C = {
  tarjeta: ({ titulo, iconoTit, cuerpo, clase="", extra="" }) => `
    <section class="card ${clase}">
      ${titulo ? `<h2>${iconoTit ? icono(iconoTit) : ""}${esc(titulo)}${extra}</h2>` : ""}${cuerpo}
    </section>`,
  item: ({ estado="info", icono:ic="alerta", titulo, detalle, lado="", chip }) => `
    <li class="${estado}">
      <span class="ic">${icono(ic)}</span>
      <span class="cuerpo"><b>${esc(titulo)}</b><small>${esc(detalle)}</small></span>
      ${chip ? C.chip(estado, chip) : `<span class="lado">${lado}</span>`}
    </li>`,
  lista: items => items.length ? `<ul class="lista">${items.join("")}</ul>` : C.vacio("Sin elementos"),
  // Categoría del INC: nombre como dato principal y P# chico
  chipInc: p => `<span class="chip ${sevInc(p)}"><span class="punto"></span>${esc(nombreInc(p))}<small class="p-cat">P${esc(p)}</small></span>`,
  // SLA del INC (lo calcula el backend): vencido, en riesgo o tiempo restante
  chipSla: sla => !sla ? "" : sla.vencido ? `<span class="chip crit sla">${icono("reloj")}SLA vencido</span>`
    : `<span class="chip ${sla.riesgo ? "warn" : "ok"} sla">${icono("reloj")}SLA ${sla.restante_min >= 60 ? Math.floor(sla.restante_min / 60) + " h " + (sla.restante_min % 60) + " min" : sla.restante_min + " min"}</span>`,
  chip: (estado, txt) => `<span class="chip ${estado}"><span class="punto"></span>${esc(txt)}</span>`,
  barra: pct => `<span class="barra"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></span>`,
  /* Equipos de un INC: estado (Pendiente / Reconocido / Tomado), escalamiento y botones Tomar / Reconocer.
     Las acciones disponibles las manda el backend; data-accion="inc:<accion>:<INC>:<equipo>" lo atiende App. */
  equiposInc: (i, compacto = false) => `<div class="eq-inc ${compacto ? "compacto" : ""}">${(i.equipos || []).map(e => {
    const esc_ = e.escalamiento || {};
    const pendiente = App.pendientes.has(`${i.inc}:${e.id}`);
    const con = (e.colaboradores || []).length ? ` · con ${e.colaboradores.map(c => c.nombre).join(", ")}` : "";
    const [ic, estado] = pendiente ? ["mano", "Lo estás tomando · se confirma en 5 s"] : e.asignado ? ["mano", `Tomado por ${e.asignado.nombre}${con}`] : e.estado === "reconocido" ? ["check", `Reconocido${e.reconocido_por ? " por " + e.reconocido_por.nombre : ""}`]
      : esc_.estado === "esperando" ? (esc_.nivel === 0 ? ["reloj", `Sin tomar · aviso nivel 1 ${enCuanto(esc_.proximo_en)}`]
          : ["subir", `Sin tomar · avisado nivel ${esc_.nivel} de ${esc_.niveles}${esc_.proximo_en ? ` · nivel ${esc_.nivel + 1} ${enCuanto(esc_.proximo_en)}` : ""}`])
      : esc_.motivo === "agotado" ? ["alerta", "Sin tomar · escalamiento agotado"] : ["reloj", "Sin tomar"];
    const clase = e.estado === "pendiente" ? (esc_.motivo === "agotado" || esc_.nivel > 1 ? "crit" : "warn") : "ok";
    return `<div class="eq-fila ${clase}"><span class="eq-nom"><b>${esc(e.nombre || "—")}</b><small>${icono(ic)}${esc(estado)}</small></span>
      <span class="eq-btns">${pendiente ? `<button class="boton chico" data-accion="deshacer:${esc(i.inc)}:${esc(e.id)}">Deshacer</button>` : (e.acciones || []).map(a => `<button class="boton chico ${a.accion === "tomar" ? "primario" : ""}" data-accion="inc:${a.accion}:${esc(i.inc)}:${esc(e.id)}">${icono("mano")}${esc(a.etiqueta)}</button>`).join("")}</span></div>`;
  }).join("")}</div>`,
  // Sub-pestañas de Inicio: Resumen · Servicios · Reportes
  subnavInicio: activa => `<nav class="subnav" aria-label="Secciones de Inicio">${[["inicio", "escritorio.html", "Resumen"], ["servicios", "servicios.html", "Servicios"], ["reportes", "reportes.html", "Reportes"]]
    .map(([id, href, t]) => `<a href="${href}" class="${id === activa ? "activo" : ""}" ${id === activa ? 'aria-current="page"' : ""}>${t}</a>`).join("")}</nav>`,

  /* Cómo puedo sumarme a un INC (lo decide el backend). Una opción por equipo mío: tomarlo si nadie lo tiene,
     unirme a quien ya lo trabaja (varias personas), o sumar mi equipo si no figura. Devuelve [{ accion, id (equipo), nombre, estado, aviso }]. */
  sumarse: i => {
    const eqs = i.equipos || [], tiene = (e, a) => (e.acciones || []).some(x => x.accion === a), out = [];
    eqs.filter(e => e.estado === "pendiente" && tiene(e, "tomar")).forEach(e => out.push({ accion:"tomar", id:e.id, nombre:e.nombre,
      estado:`${e.nombre}: nadie lo tomó todavía`, aviso:"Unite al INC para trabajarlo: queda a tu nombre y se detiene el escalamiento." }));
    eqs.filter(e => tiene(e, "unirse")).forEach(e => out.push({ accion:"unirse", id:e.id, nombre:e.nombre,
      estado:`${e.nombre}: lo trabaja ${e.asignado?.nombre || "otra persona"}${(e.colaboradores || []).length ? " con " + e.colaboradores.map(c => c.nombre).join(", ") : ""}`,
      aviso:"Podés sumarte sin sacarle el INC a nadie: trabajan juntos." }));
    (i.puedo_sumar_equipo || []).forEach(t => out.push({ accion:"sumar_equipo", id:t.id, nombre:t.nombre,
      estado:`${t.nombre} todavía no está en este INC`, aviso:"Sumá tu equipo para trabajarlo: queda a tu nombre." }));
    return out;
  },

  /* Tarjeta de INC única (datos de GET /debates). Divulgación progresiva:
     nivel 1 = fila compacta (categoría, SLA, Abrir) · nivel 2 = tarjeta con equipos, último mensaje y una acción principal.
     "Ver equipos" despliega el detalle por equipo (queda abierto aunque la pantalla se actualice). */
  tarjetaInc: (i, { nivel = 2 } = {}) => {
    const d = i.debate, sev = sevInc(i.prioridad), eqs = i.equipos || [], inc = esc(i.inc);
    const pend = eqs.filter(e => e.estado === "pendiente").length;
    const opciones = C.sumarse(i);
    const noLeidos = d?.no_leidos ? `<span class="pastilla" aria-label="${d.no_leidos} mensajes sin leer">${d.no_leidos}</span>` : "";
    const abrir = d || i.puede_abrir ? `<button class="boton chico" data-accion="abririnc:${inc}">${icono("mensaje")}Abrir${d ? ` · ${d.mensajes_total} msj` : ""}</button>` : "";
    if (nivel === 1) return `<div class="tinc n1 ${sev}"><span class="tinc-cuerpo"><b>${esc(i.titulo)}</b>
      <span class="tinc-meta"><span class="mono-inc">${inc}</span>${C.chipInc(i.prioridad)}${C.chipSla(i.sla)}</span></span>${noLeidos}${abrir}</div>`;
    const abiertos = App.equiposAbiertos.has(i.inc);
    return `<article class="tinc ${sev}">
      <div class="tinc-l1"><b>${esc(i.titulo)}</b>${noLeidos}</div>
      <div class="tinc-meta">${C.chipInc(i.prioridad)}${C.chipSla(i.sla)}${i.escalado ? `<span class="chip crit">${icono("subir")}escalando</span>` : ""}</div>
      <div class="tinc-l2"><span class="mono-inc">${inc}</span> · ${eqs.length} equipo${eqs.length !== 1 ? "s" : ""}${eqs.length ? (pend ? ` · ${pend} sin tomar` : " · todos tomados") : ""}${d ? ` · ${d.participantes_total} en el chat` : ""}</div>
      ${d?.ultimo ? `<div class="tinc-ult">${esc(d.ultimo.autor || "")}: ${esc(d.ultimo.texto)}</div>` : ""}
      <div class="btns">
        ${opciones.map(mio => App.pendientes.has(`${i.inc}:${mio.id}`)
          ? `<button class="boton chico" data-accion="deshacer:${inc}:${esc(mio.id)}">${icono("mano")}Sumándote · Deshacer</button>`
          : `<button class="boton chico primario" data-accion="inc:${mio.accion}:${inc}:${esc(mio.id)}">${icono("mano")}${mio.accion === "tomar" ? "Tomar" : mio.accion === "unirse" ? "Unirme" : "Sumar"} · ${esc(mio.nombre)}</button>`).join("")}
        ${abrir}
        ${i.puede_cambiar_categoria ? `<button class="boton chico" data-accion="cat:${inc}:${i.prioridad}">${icono("cambiar")}Cambiar categoría</button>` : ""}
        ${eqs.length ? `<button class="boton chico" data-accion="vereq:${inc}" aria-expanded="${abiertos}">${icono("equipo")}${abiertos ? "Ocultar equipos" : `Ver equipos (${eqs.length})`}</button>` : ""}
      </div>
      ${abiertos ? C.equiposInc(i) : ""}
    </article>`;
  },

  vacio: (txt, ic="check") => `<div class="vacio">${icono(ic)}<div>${esc(txt)}</div></div>`,

  // Anillo: servicios sin INC / total
  anillo: (parte, total, etiqueta) => {
    const r = 32, per = 2 * Math.PI * r, frac = total ? parte / total : 1;
    return `<div class="anillo"><svg viewBox="0 0 76 76"><circle class="fondo" cx="38" cy="38" r="${r}"/>
      <circle class="valor" cx="38" cy="38" r="${r}" stroke-dasharray="${per}" stroke-dashoffset="${per * (1 - frac)}"/></svg>
      <span class="num">${parte}/${total}<small>${esc(etiqueta)}</small></span></div>`;
  },

  // Fila de servicio (Inicio)
  filaServicio: (d, s) => {
    const e = estadoServicio(d, s);
    const cont = esDisp(s)
      ? `<b class="num">${s.disponibilidad.toFixed(1)}</b><small>% DISP</small>`
      : `<b class="num">${incDe(d, s).length}</b><small>INC</small>`;
    return `<a class="fila-serv ${e}" href="servicios.html?id=${encodeURIComponent(s.id)}">
      <span class="ic">${icono(s.icono)}</span>
      <span class="cuerpo"><b>${esc(s.nombre)}</b><small>${esc(s.grupo || "")}</small></span>
      <span class="cont">${cont}</span>
      ${C.chip(e, textoEstado(s, e))}
    </a>`;
  },

  // Fila de INC
  filaInc: (d, i, conServicio=true) => {
    const e = estadoInc(i);
    const serv = conServicio ? i.servicios.map(id => nombreServicio(d, id)).join(", ") + " · " : "";
    const afe = i.afectados ? ` · ${i.afectados.toLocaleString("es-AR")} afectados` : "";
    return `<li class="${e}">
      <span class="ic">${icono(e === "crit" ? "alerta" : "reloj")}</span>
      <span class="cuerpo"><b>${esc(i.titulo)}</b><small>${esc(i.inc)} · ${esc(serv)}${hace(i.inicio)}${afe}</small></span>
      ${C.chipInc(i.prioridad)}
    </li>`;
  }
};

/* =====================================================================
   FUENTE DE DATOS (intercambiable local / api)
   ===================================================================== */
const fuente = {
  local: {
    async cargar(){
      let d; try { d = JSON.parse(localStorage.getItem("datosRed5") || "null"); } catch {}
      if (!d) { d = structuredClone(DATOS_DEMO); this.guardar(d); }
      return d;
    },
    guardar(d){ try { localStorage.setItem("datosRed5", JSON.stringify(d)); } catch {} },
    // Demo: de vez en cuando abre o cierra un INC para ver el auto-refresco
    async refrescar(){
      const d = await this.cargar(), r = Math.random();
      // Móvil: variación chica de disponibilidad alrededor del valor de demo
      d.servicios.filter(esDisp).forEach(s => {
        const base = DATOS_DEMO.servicios.find(b => b.id === s.id)?.disponibilidad ?? s.disponibilidad;
        s.disponibilidad = Math.min(100, Math.max(90, +(base + (Math.random() * 0.6 - 0.3)).toFixed(1)));
      });
      const conInc = d.servicios.filter(x => !esDisp(x));
      if (r < 0.12 && d.incidentes.length < 6) {
        const s = conInc[Math.floor(Math.random() * conInc.length)];
        d.incidentes.push({ inc:"INC000" + (412400 + Math.floor(Math.random() * 500)), servicios:[s.id],
          prioridad: 1 + Math.floor(Math.random() * clasif().categorias.length), titulo:"Degradación reportada en " + s.nombre, inicio:new Date().toISOString() });
      } else if (r > 0.88 && d.incidentes.length > 1) {
        d.incidentes.splice(Math.floor(Math.random() * d.incidentes.length), 1);
      }
      this.guardar(d); return d;
    }
  },
  api: {
    async cargar(){
      const r = await fetch(CONFIG.URL_API + "/tablero", { headers:{ Authorization:"Bearer " + sessionStorage.getItem("token") } });
      if (r.status === 401) { sessionStorage.clear(); location.replace(CONFIG.URL_LOGIN); }
      if (!r.ok) throw new Error("No se pudieron cargar los datos");
      return r.json();
    },
    refrescar(){ return this.cargar(); }
  }
}[CONFIG.MODO_DATOS];

/* =====================================================================
   MÓDULO USUARIOS / EQUIPOS / ROLES (RBAC)
   - "local": responde demo/n8n-simulado-rbac.js (mismas reglas y JSON que producción)
   - "api":   responde el backend en {URL_API}/... con el mismo contrato
   Usuario demo según el rol con que se ingresó (se cambia desde Perfil). Clave demo: demo123
   ===================================================================== */
const USUARIO_DEMO_POR_ROL = { ADMIN:"admin", GESTOR:"ana", OPERADOR:"bruno", LECTURA:"carla" };
const ROLES_TXT = { ADMIN:"Administrador", GESTOR:"Jefe/Gestor", OPERADOR:"Operador", LECTURA:"Solo Lectura" };
const hayModuloRBAC = () => CONFIG.MODO_DATOS === "api" || typeof SimuladorRBAC !== "undefined";

// Campo de formulario para App.formulario
function campoForm(c){
  const req = c.requerido ? "required" : "", lab = `<span>${esc(c.etiqueta)}</span>`;
  if (c.tipo === "select") return `<label class="campo">${lab}<select name="${c.id}" ${req}>${(c.opciones || []).map(o =>
    `<option value="${esc(o.valor)}" ${o.valor === c.valor ? "selected" : ""}>${esc(o.texto)}</option>`).join("")}</select></label>`;
  if (c.tipo === "multi") return `<fieldset class="campo"><legend>${esc(c.etiqueta)}</legend><div class="opciones">${(c.opciones || []).map(o =>
    `<label class="opcion ${o.deshabilitado ? "deshabilitada" : ""}"><input type="checkbox" name="${c.id}" value="${esc(o.valor)}" ${(c.valor || []).includes(o.valor) || o.deshabilitado ? "checked" : ""} ${o.deshabilitado ? "disabled" : ""}>${esc(o.texto)}</label>`).join("")
    || "<small>Sin opciones disponibles</small>"}</div></fieldset>`;
  if (c.tipo === "textarea") return `<label class="campo">${lab}<textarea name="${c.id}" ${req} ${c.min ? `minlength="${c.min}"` : ""} placeholder="${esc(c.ayuda || "")}">${esc(c.valor || "")}</textarea></label>`;
  if (c.tipo === "nota") return `<p class="cambio" style="margin:0 0 12px">${esc(c.texto)}</p>`;
  return `<label class="campo">${lab}<input name="${c.id}" type="${c.tipo || "text"}" value="${esc(c.valor || "")}" ${req} placeholder="${esc(c.ayuda || "")}"></label>`;
}
const JUSTIFICACION = { id:"justificacion", etiqueta:"Justificación (queda en la auditoría)", tipo:"textarea", requerido:true, min:10, ayuda:"Mínimo 10 caracteres" };

/* =====================================================================
   NÚCLEO
   ===================================================================== */
const App = {
  datos: null,
  pagina: null,
  usuario: sessionStorage.getItem("nombre") || "Usuario",
  equiposAbiertos: new Set(),     // tarjetas de INC con "Ver equipos" desplegado

  /* ===== INICIO RBAC ===== */
  rol: sessionStorage.getItem("rol") || "LECTURA",

  // Permisos efectivos calculados por el backend (GET /me → data.permisos), guardados al ingresar.
  // Solo sirven para ocultar botones: la autorización real la hace el backend en cada request.
  permisos: (() => { try { return JSON.parse(sessionStorage.getItem("permisos") || "[]"); } catch { return []; } })(),

  puede(accion){
    return this.rol === "ADMIN" || this.permisos.includes(accion);
  },
  // Ventana flotante para leer texto largo (descripción del INC): se cierra con ✕, Cerrar, tocando afuera o con Esc
  ventana({ titulo, subtitulo = "", texto = "", copiar = true }){
    document.getElementById("ventanaTexto")?.remove();
    const velo = $("#velo"), h = document.createElement("div");
    h.id = "ventanaTexto"; h.className = "hoja dialogo ventana on";
    h.setAttribute("role", "dialog"); h.setAttribute("aria-modal", "true"); h.setAttribute("aria-label", titulo);
    h.innerHTML = `<div class="ventana-cab"><div><h3>${esc(titulo)}</h3>${subtitulo ? `<small>${esc(subtitulo)}</small>` : ""}</div>
        <button type="button" class="btn-icono" data-cerrar aria-label="Cerrar">${icono("x")}</button></div>
      <div class="ventana-texto" tabindex="0">${esc(texto)}</div>
      <div class="btns">${copiar && navigator.clipboard ? `<button type="button" class="boton" data-copiar>Copiar</button>` : ""}
        <button type="button" class="boton primario" data-cerrar>Cerrar</button></div>`;
    document.body.append(h); velo.classList.add("on");
    const tecla = ev => { if (ev.key === "Escape") cerrar(); };
    const cerrar = () => { h.remove(); velo.classList.remove("on"); velo.onclick = () => this.hoja(false); document.removeEventListener("keydown", tecla); };
    velo.onclick = cerrar;
    document.addEventListener("keydown", tecla);
    h.querySelectorAll("[data-cerrar]").forEach(b => b.onclick = cerrar);
    h.querySelector("[data-copiar]")?.addEventListener("click", () => navigator.clipboard.writeText(texto).then(() => this.aviso("Descripción copiada"), () => this.aviso("No se pudo copiar")));
    h.querySelector(".ventana-texto").focus();
  },
  /* ===== FIN RBAC ===== */

  iniciar(pagina){
    if (!sessionStorage.getItem("token")) return location.replace(CONFIG.URL_LOGIN);
    /* ===== INICIO RBAC ===== */
    if (!["ADMIN", "GESTOR", "OPERADOR", "LECTURA"].includes(this.rol)) this.rol = "LECTURA";   // rol desconocido → mínimo privilegio
    document.body.setAttribute("data-rol", this.rol);
    /* ===== FIN RBAC ===== */
    this.pagina = pagina;
    document.addEventListener("pointerdown", () => this.desbloquearAudio(), { once:true, passive:true });
    document.addEventListener("visibilitychange", () => { if (!document.hidden && sessionStorage.getItem("token")) this.revisarNotificaciones(); });
    this.armarEstructura();
    this.cargar(false);
    // Service worker: para recibir notificaciones push con la página cerrada (solo con la API real)
    // (también en la demo: Chrome lo usa para ofrecer "Instalar app")
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
    window.addEventListener("beforeinstallprompt", ev => { ev.preventDefault(); App._instalar = ev; App.pagina?.alInstalable?.(); });
    window.addEventListener("appinstalled", () => { App._instalar = null; App.aviso("App instalada: abrila desde el ícono de Assurance Center", 5000); });
    // RBAC: rol, nombre y permisos los decide el backend (GET /me)
    if (hayModuloRBAC()) {
      this.sincronizarSesion().then(d => { if (d && this.datos) this.redibujar(); });
      // Campana = notificaciones (menciones, convocatorias, debates…): número de no leídas y aviso al llegar una nueva
      this.revisarNotificaciones(true);
      this.reanudarAlarma();
      setInterval(() => { if (!document.hidden) this.revisarNotificaciones(); }, 8000);
    }
    if (CONFIG.REFRESCO_SEG > 0) {
      setInterval(() => { if (!document.hidden) this.cargar(true); }, CONFIG.REFRESCO_SEG * 1000);
    }
  },

  armarEstructura(){
    const p = this.pagina;
    document.body.insertAdjacentHTML("afterbegin", `
      <svg width="0" height="0" style="position:absolute" aria-hidden="true">
        ${Object.entries(ICONOS).map(([k,v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`).join("")}
      </svg>
      <header class="top">
        <div class="titulo"><b>${esc(p.titulo)}</b><small><span class="vivo"></span><span id="actualizado">Cargando…</span></small></div>
        <a class="btn-icono" href="${hayModuloRBAC() ? "notificaciones.html" : "incidentes.html"}" aria-label="${hayModuloRBAC() ? "Notificaciones" : "Incidentes"}">${icono("campana")}<span class="badge" id="badge" hidden>0</span></a>
        <span class="progreso" id="progreso" style="--seg:${CONFIG.REFRESCO_SEG}s"></span>
      </header>`);
    if (!$("#app")) document.body.insertAdjacentHTML("beforeend", `<main id="app"></main>`);
    document.body.insertAdjacentHTML("beforeend", `
      <nav class="nav">${NAV.map(n => n.id === "fab"
        /* ===== INICIO RBAC: FAB según rol (LECTURA → hueco vacío para no romper la grilla) ===== */
        ? (["ADMIN", "GESTOR"].includes(this.rol)        // ＋ = Convocatoria general: solo jefes (el backend también lo valida)
            ? `<div><button class="fab req-gestor" id="fab" aria-label="Acciones rápidas">${icono("mas")}</button></div>`
            : `<div></div>`)
        /* ===== FIN RBAC ===== */
        : `<a href="${n.href}" class="${(n.ids || [n.id]).includes(p.id) ? "activo" : ""}" ${(n.ids || [n.id]).includes(p.id) ? 'aria-current="page"' : ""}>${icono(n.icono)}${n.texto}
            ${n.id === "chats" && hayModuloRBAC() ? `<span class="badge verde" id="badgeChat" hidden>0</span>` : ""}</a>`).join("")}</nav>
      <div class="velo" id="velo"></div>
      <div class="hoja" id="hoja"><h3>Acciones rápidas</h3>
        <div class="accesos">${ACCIONES_FAB.map(a => `<button class="acceso ${a.clase || ""}" data-accion="${a.id}"><span class="ic">${icono(a.icono)}</span>${a.texto}</button>`).join("")}</div>
      </div>
      <div class="avisos" id="avisos" role="status" aria-live="polite"></div>`);
    const fab = $("#fab"); if (fab) fab.onclick = () => this.hoja();   // RBAC: no existe en LECTURA
    $("#velo").onclick = () => this.hoja(false);
    addEventListener("pagehide", () => this.enviarPendientes());   // lo pendiente (Tomar, Cambiar categoría) se envía igual al salir
    document.addEventListener("click", e => {
      const a = e.target.closest("[data-accion]"); if (a) this.accion(a.dataset.accion, a);
    });
  },

  async cargar(refresco){
    try {
      this.datos = refresco ? await fuente.refrescar() : await fuente.cargar();
      $("#app").innerHTML = this.pagina.render(this.datos);
      this.pagina.alMontar?.(this.datos);
      document.body.classList.add("listo");
      if (!hayModuloRBAC()) { const n = this.datos.incidentes.length, b = $("#badge"); b.hidden = !n; b.textContent = n; }
      $("#actualizado").textContent = "Actualizado " + new Date().toLocaleTimeString("es-AR", { hour:"2-digit", minute:"2-digit", second:"2-digit" });
      const pr = $("#progreso"); pr.classList.remove("corre"); void pr.offsetWidth; if (CONFIG.REFRESCO_SEG > 0) pr.classList.add("corre");
    } catch (e) {
      this.aviso(e.message || "Error al cargar datos");
    }
  },

  redibujar(){ $("#app").innerHTML = this.pagina.render(this.datos); this.pagina.alMontar?.(this.datos); },

  hoja(forzar){
    const on = forzar ?? !$("#hoja").classList.contains("on");
    $("#hoja").classList.toggle("on", on); $("#velo").classList.toggle("on", on); $("#fab")?.classList.toggle("abierto", on);   // RBAC: ?. por LECTURA
  },

  // Avisos apilados (no se pisan) y anunciados a lectores de pantalla. accion opcional: { etiqueta, fn } (Deshacer, Tomar…)
  aviso(txt, ms = 2600, accion = null){
    const caja = $("#avisos"); if (!caja) return;
    const el = document.createElement("div");
    el.className = "toast on"; el.textContent = txt;
    if (accion) { const b = document.createElement("button"); b.type = "button"; b.textContent = accion.etiqueta;
      b.onclick = () => { quitar(); accion.fn(); }; el.append(b); ms = Math.max(ms, 5000); }
    const quitar = () => { el.classList.remove("on"); setTimeout(() => el.remove(), 250); };
    caja.append(el);
    while (caja.children.length > 3) caja.firstElementChild.remove();
    setTimeout(quitar, ms);
    return el;
  },

  /* ===== ALARMA EN PANTALLA =====
     Escalamientos, SLA vencido y convocatoria general: aviso a pantalla completa con sonido y vibración que se repite
     hasta que la persona toma el INC, lo abre o lo silencia. Se apaga sola si otro equipo toma el INC. Se puede desactivar en Perfil. */
  ALARMA_TIPOS: ["escalamiento", "sla", "convocatoria_general"],
  _alarma: null, _audio: null, _salida: null,
  alarmaOn(){ try { return localStorage.getItem("alarmaSonora") !== "0"; } catch { return true; } },
  alarmaConfigurar(on){ try { localStorage.setItem("alarmaSonora", on ? "1" : "0"); } catch {} if (!on) this.cerrarAlarma(); },
  // El navegador solo deja sonar después de un toque: se prepara el audio con el primer toque de la sesión
  desbloquearAudio(){
    try {
      const A = window.AudioContext || window.webkitAudioContext;
      if (!A) return null;
      this._audio ||= new A();
      if (this._audio.state === "suspended") this._audio.resume();
      return this._audio;
    } catch { return null; }
  },
  sonar(){
    const c = this.desbloquearAudio();
    const suena = !!c && c.state === "running";
    if (suena) {
      /* Más fuerte pero no estridente: el tono cuadrado pasa por un filtro que le saca los agudos que lastiman,
         y un compresor pone techo a los picos (sube el volumen percibido sin saturar). Dos pares "ti-ta" por ciclo. */
      if (!this._salida) {
        const comp = c.createDynamicsCompressor();
        comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 6; comp.attack.value = .003; comp.release.value = .15;
        const filtro = c.createBiquadFilter();
        filtro.type = "lowpass"; filtro.frequency.value = 2600; filtro.Q.value = .7;
        filtro.connect(comp).connect(c.destination);
        this._salida = filtro;
      }
      [[988, 0], [784, .2], [988, .5], [784, .7]].forEach(([hz, t]) => {
        const o = c.createOscillator(), g = c.createGain(), ini = c.currentTime + t;
        o.type = "square"; o.frequency.value = hz;
        g.gain.setValueAtTime(.0001, ini); g.gain.exponentialRampToValueAtTime(.18, ini + .015);
        g.gain.setValueAtTime(.18, ini + .13); g.gain.exponentialRampToValueAtTime(.0001, ini + .18);
        o.connect(g).connect(this._salida); o.start(ini); o.stop(ini + .19);
      });
    }
    try { if (navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.([300, 120, 300]); } catch {}   // el navegador solo deja vibrar después de un toque
    return suena;
  },
  alarma(n, { prueba = false } = {}){
    if (!prueba && !this.alarmaOn()) return;
    this.cerrarAlarma();
    const tipo = { escalamiento:"Escalamiento", sla:"SLA", convocatoria_general:"Convocatoria general" }[n.tipo] || "Alarma";
    const el = document.createElement("div");
    el.id = "alarma"; el.className = "alarma"; el.setAttribute("role", "alertdialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Alarma: " + n.titulo);
    el.innerHTML = `<div class="alarma-caja"><div class="alarma-ic">${icono("alerta")}</div><small class="alarma-tipo">${esc(tipo)}</small>
      <h2>${esc(n.titulo)}</h2>${n.cuerpo ? `<p>${esc(n.cuerpo)}</p>` : ""}
      <p class="alarma-sonido" hidden>Tocá la pantalla para activar el sonido.</p>
      <div class="btns">${n.puede_tomar && n.inc && n.team_id ? `<button class="boton primario" data-al="tomar">${icono("mano")}Tomar el INC</button>` : ""}
        ${n.enlace && !prueba ? `<button class="boton" data-al="ver">Ver</button>` : ""}<button class="boton" data-al="silenciar">Silenciar</button></div></div>`;
    document.body.append(el);
    const tituloOrig = document.title.replace(/^🚨 /, "");
    const tic = () => { el.querySelector(".alarma-sonido").hidden = this.sonar(); document.title = document.title.startsWith("🚨") ? tituloOrig : "🚨 " + n.titulo.slice(0, 40); };
    this._alarma = { n, el, tituloOrig, timer:setInterval(tic, 3000) };
    el.addEventListener("pointerdown", () => this.desbloquearAudio(), { once:true });
    el.querySelector("[data-al=silenciar]").onclick = () => this.cerrarAlarma();
    el.querySelector("[data-al=ver]")?.addEventListener("click", () => { this.cerrarAlarma(); location.href = n.enlace; });
    el.querySelector("[data-al=tomar]")?.addEventListener("click", () => { this.cerrarAlarma(); this.accionInc(`inc:tomar:${n.inc}:${n.team_id}`); });
    if (!prueba) { try { sessionStorage.setItem("alarmaActual", JSON.stringify(n)); } catch {} }
    tic();
    el.querySelector("[data-al]")?.focus();
  },
  cerrarAlarma(){
    const a = this._alarma;
    if (a) { clearInterval(a.timer); a.el.remove(); document.title = a.tituloOrig; this._alarma = null; }
    try { sessionStorage.removeItem("alarmaActual"); navigator.vibrate?.(0); } catch {}
  },
  // Al cambiar de pantalla la alarma sigue hasta que se la atiende
  reanudarAlarma(){
    try { const n = JSON.parse(sessionStorage.getItem("alarmaActual") || "null"); if (n && !this._alarma) this.alarma(n); } catch {}
  },

  /* ===== INICIO RBAC: API del módulo ===== */
  async revisarNotificaciones(primera = false){
    const r = await this.api("GET", "/notificaciones?no_leidas=1&limite=20");
    if (!r.cuerpo || !r.cuerpo.ok) return;
    const { notificaciones, no_leidas } = r.cuerpo.data, b = $("#badge");
    if (b) { b.hidden = !no_leidas; b.textContent = no_leidas > 99 ? "99+" : no_leidas; }
    let vistas; try { vistas = new Set(JSON.parse(sessionStorage.getItem("notifVistas") || "[]")); } catch { vistas = new Set(); }
    const nuevas = notificaciones.filter(n => !vistas.has(n.id) && !n.silenciosa);   // fuera de mi horario: sin aviso emergente
    // Alarma: lo que sigue sin atender y hay que accionar. Al abrir la app solo si todavía se puede tomar.
    const esAlarma = x => this.ALARMA_TIPOS.includes(x.tipo) && !x.silenciosa;
    const candidatas = nuevas.filter(x => esAlarma(x) && (!primera || x.puede_tomar));
    const sonada = candidatas.find(x => x.puede_tomar) || candidatas[0];
    if (sonada && this.alarmaOn()) this.alarma(sonada);
    // Si otro equipo ya tomó el INC, la alarma de ese aviso se apaga sola
    const act = this._alarma?.n;
    if (act?.puede_tomar && act.id !== "prueba" && !notificaciones.some(x => x.id === act.id && x.puede_tomar)) { this.cerrarAlarma(); this.aviso("El INC ya fue tomado", 3000); }
    if (!sonada && nuevas.length && !primera && !/notificaciones\.html$/.test(location.pathname)) {
      const n = nuevas.find(x => x.puede_tomar) || nuevas[0];      // un escalamiento que se puede tomar va primero, con su botón
      // En la demo la llamada no sale: se avisa que en producción sonaría el teléfono
      this.aviso(`${n.con_llamada ? "Llamada (simulada) · " : ""}${n.titulo}${nuevas.length > 1 ? ` (+${nuevas.length - 1})` : ""}`, 6000,
        n.puede_tomar ? { etiqueta:"Tomar", fn:() => this.accionInc(`inc:tomar:${n.inc}:${n.team_id}`) } : null);
    }
    notificaciones.forEach(n => vistas.add(n.id));
    try { sessionStorage.setItem("notifVistas", JSON.stringify([...vistas].slice(-200))); } catch {}
    this.pagina?.alNotificar?.(r.cuerpo.data);
    // Mensajes sin leer en los chats de los INC (ícono de chat del encabezado)
    const c = await this.api("GET", "/debates"), bc = $("#badgeChat");
    if (bc && c.cuerpo?.ok) { const n = c.cuerpo.data.no_leidos_total || 0; bc.hidden = !n; bc.textContent = n > 99 ? "99+" : n; }
    if (c.cuerpo?.ok) this.revisarChats(c.cuerpo.data);
  },

  /* ===== NOTIFICACIONES PUSH (pantalla apagada o en otra app) =====
     Web Push estándar con el service worker sw.js. La persona lo activa en Perfil (el navegador pide permiso).
     El servidor manda un aviso corto (INC y qué pasó, nunca el texto del mensaje) cifrado de punta a punta.
     En iPhone solo funciona con la página instalada (Compartir → Agregar a inicio). */
  // Instalar como app (Android/PC con Chrome o Edge). En iPhone: Compartir → Agregar a inicio.
  _instalar: null,
  instalada(){ return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; },
  async instalarApp(){
    if (this.instalada()) return this.aviso("Ya la estás usando como app", 3000);
    if (this._instalar) { this._instalar.prompt(); await this._instalar.userChoice.catch(() => null); this._instalar = null; return; }
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return this.aviso("En iPhone: tocá Compartir (el cuadrado con la flecha) → «Agregar a inicio»", 8000);
    this.aviso("Abrí el menú de Chrome (⋮) → «Instalar app» o «Agregar a la pantalla principal»", 8000);
  },
  pushSoportado(){ return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; },
  esIOSsinInstalar(){
    return /iPhone|iPad|iPod/.test(navigator.userAgent) && !navigator.standalone && !matchMedia("(display-mode: standalone)").matches;
  },
  pushActivo(){ try { return localStorage.getItem("pushActivo") === "1"; } catch { return false; } },
  async pushSuscripcion(){
    if (!this.pushSoportado()) return null;
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? reg.pushManager.getSubscription() : null;
  },
  async pushActivar(){
    if (CONFIG.MODO_DATOS === "local") return this.aviso("En la demo no hay servidor: las notificaciones push funcionan en la página real", 4500);
    if (this.esIOSsinInstalar()) return this.aviso("En iPhone primero instalá la página: Compartir → «Agregar a inicio». Después activalo desde ahí", 8000);
    if (!this.pushSoportado()) return this.aviso("Este navegador no admite notificaciones push", 4000);
    const clave = await this.api("GET", "/push/clave");
    if (!clave.cuerpo?.ok) return this.aviso(clave.cuerpo?.error?.mensaje || "No se pudo activar", 4500);
    const permiso = await Notification.requestPermission();
    if (permiso !== "granted") return this.aviso("No diste permiso de notificaciones. Se habilita desde la configuración del navegador para este sitio", 7000);
    try {
      const reg = await navigator.serviceWorker.register("sw.js");
      await navigator.serviceWorker.ready;
      const b = atob(clave.cuerpo.data.publica.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((clave.cuerpo.data.publica.length + 3) % 4));
      const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:Uint8Array.from(b, c => c.charCodeAt(0)) });
      const r = await this.api("POST", "/push/suscribir", sub.toJSON());
      if (!r.cuerpo?.ok) return this.aviso(r.cuerpo?.error?.mensaje || "No se pudo activar", 4500);
      try { localStorage.setItem("pushActivo", "1"); } catch {}
      this.aviso("Listo: te vamos a avisar aunque tengas la pantalla apagada", 4000);
      return true;
    } catch (e) { this.aviso("No se pudo activar: " + (e.message || e), 5000); }
  },
  async pushDesactivar(){
    try {
      const sub = await this.pushSuscripcion();
      if (sub) { await this.api("POST", "/push/baja", { endpoint:sub.endpoint }); await sub.unsubscribe(); }
    } catch {}
    try { localStorage.setItem("pushActivo", "0"); } catch {}
    this.aviso("Avisos con la pantalla apagada desactivados", 3000);
  },
  async pushProbar(){
    const r = await this.api("POST", "/push/probar");
    this.aviso(r.cuerpo?.ok ? "Prueba enviada: bloqueá el celular y fijate si llega" : (r.cuerpo?.error?.mensaje || "No se pudo enviar"), 5000);
  },

  /* ===== MENSAJES NUEVOS EN LOS CHATS =====
     Sonido corto y suave (distinto de la alarma) y una tarjeta flotante arriba que no tapa nada ni pide respuesta:
     se va sola, y si la tocás abre el chat. No avisa del chat que ya tenés abierto ni de tus propios mensajes.
     Se apaga el sonido en Perfil ("Sonido de mensajes"). */
  chatSonidoOn(){ try { return localStorage.getItem("sonidoChat") !== "0"; } catch { return true; } },
  chatSonidoConfigurar(on){ try { localStorage.setItem("sonidoChat", on ? "1" : "0"); } catch {} },
  sonarChat(){
    const c = this.desbloquearAudio();
    if (!c || c.state !== "running") return false;
    // "Tin-tin" suave: dos notas senoidales cortas y a bajo volumen
    [[880, 0], [1318.5, .12]].forEach(([hz, t]) => {
      const o = c.createOscillator(), g = c.createGain(), ini = c.currentTime + t;
      o.type = "sine"; o.frequency.value = hz;
      g.gain.setValueAtTime(.0001, ini); g.gain.exponentialRampToValueAtTime(.12, ini + .01);
      g.gain.exponentialRampToValueAtTime(.0001, ini + .35);
      o.connect(g).connect(c.destination); o.start(ini); o.stop(ini + .36);
    });
    try { if (navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.(60); } catch {}
    return true;
  },
  avisoChat({ titulo, texto, href, extra = 0 }){
    let caja = $("#avisosChat");
    if (!caja) { caja = document.createElement("div"); caja.id = "avisosChat"; caja.className = "avisos-chat"; caja.setAttribute("aria-live", "polite"); document.body.append(caja); }
    const el = document.createElement("div");
    el.className = "aviso-chat";
    el.innerHTML = `<a class="aviso-chat-cuerpo" href="${esc(href)}"><span class="ic">${icono("mensaje")}</span>
        <span><b>${esc(titulo)}</b>${texto ? `<small>${esc(texto)}</small>` : ""}${extra ? `<small class="mas">y ${extra} chat${extra === 1 ? "" : "s"} más con mensajes nuevos</small>` : ""}</span></a>
      <button type="button" class="aviso-chat-x" aria-label="Cerrar aviso">×</button>`;
    const quitar = () => { el.classList.remove("on"); setTimeout(() => el.remove(), 250); };
    el.querySelector(".aviso-chat-x").onclick = quitar;
    caja.append(el);
    while (caja.children.length > 2) caja.firstElementChild.remove();
    requestAnimationFrame(() => el.classList.add("on"));
    setTimeout(quitar, 7000);
  },
  revisarChats(data){
    const lista = [...(data.incidentes || []).map(i => i.debate).filter(Boolean), ...(data.otros_debates || [])];
    let vistos = null;
    try { vistos = JSON.parse(sessionStorage.getItem("chatVistos") || "null"); } catch {}
    const primeraVez = !vistos; vistos ||= {};
    const yo = sessionStorage.getItem("nombre") || "";
    const abierto = /debate\.html$/.test(location.pathname) ? new URLSearchParams(location.search).get("id") : null;
    const nuevos = lista.filter(d => d.no_leidos > 0 && d.ultimo?.en && d.ultimo.en !== vistos[d.id] && d.ultimo.autor !== yo && d.id !== abierto);
    lista.forEach(d => { if (d.ultimo?.en) vistos[d.id] = d.ultimo.en; });
    try { sessionStorage.setItem("chatVistos", JSON.stringify(vistos)); } catch {}
    if (primeraVez || !nuevos.length) return;
    nuevos.sort((a, b) => String(b.ultimo.en).localeCompare(String(a.ultimo.en)));
    const d = nuevos[0];
    this.avisoChat({ titulo:`${d.inc} · ${d.ultimo.autor || "Mensaje nuevo"}`, texto:d.ultimo.texto, href:"debate.html?id=" + encodeURIComponent(d.id), extra:nuevos.length - 1 });
    if (this.chatSonidoOn() && !this._alarma) this.sonarChat();     // con la alarma sonando, no se superpone
  },

  async api(metodo, ruta, body, opciones = {}){
    if (CONFIG.MODO_DATOS === "local") {
      if (typeof SimuladorRBAC === "undefined") return { http:500, cuerpo:{ ok:false, error:{ codigo:"SIN_SIMULADOR", mensaje:"Falta rbac-demo.js junto a app.js" } } };
      let r = SimuladorRBAC.atender({ metodo, ruta, token:this.tokenDemo(), body });
      if (r.http === 401) { sessionStorage.removeItem("tokenRBAC"); r = SimuladorRBAC.atender({ metodo, ruta, token:this.tokenDemo(), body }); }
      return r;
    }
    try {
      const res = await fetch(CONFIG.URL_API + ruta, { method:metodo, keepalive:!!opciones.keepalive,   // keepalive: envíos pendientes al salir de la página
        headers:{ Authorization:"Bearer " + sessionStorage.getItem("token"), "Content-Type":"application/json" },
        body: metodo === "GET" ? undefined : JSON.stringify(body || {}) });
      if (res.status === 401 && ruta !== "/auth/logout") {
        // El ingreso consulta por qué se cerró (otro dispositivo o 3 horas) para avisarle a la persona
        const viejo = sessionStorage.getItem("token"); sessionStorage.clear();
        try { if (viejo) sessionStorage.setItem("tokenViejo", viejo); } catch {}
        location.replace(CONFIG.URL_LOGIN);
      }
      const cuerpo = await res.json();
      if (cuerpo?.error?.codigo === "CAMBIO_CLAVE_REQUERIDO") location.replace(CONFIG.URL_LOGIN + "?cambio=1");
      return { http:res.status, cuerpo };
    } catch {
      return { http:0, cuerpo:{ ok:false, error:{ codigo:"SIN_CONEXION", mensaje:"No se pudo contactar al servidor" } } };
    }
  },

  // Cerrar sesión: n8n invalida el token (POST /auth/logout) y se vuelve al ingreso
  async salir(){
    if (hayModuloRBAC()) await this.api("POST", "/auth/logout", {}, { keepalive:true }).catch(() => null);
    sessionStorage.clear();
    location.replace(CONFIG.URL_LOGIN);
  },

  // Demo: sesión del simulador para el usuario demo elegido
  // Demo: sesión del simulador para quien ingresó. Se busca por usuario del login, después por nombre y por último por rol.
  tokenDemo(){
    const ss = k => (sessionStorage.getItem(k) || "").trim();
    if (ss("loginDemo") !== ss("token")) {             // ingresó otra persona: se descarta la sesión demo anterior
      ["tokenRBAC", "usuarioDemo", "nombreLogin"].forEach(k => sessionStorage.removeItem(k));
      sessionStorage.setItem("loginDemo", ss("token"));
      sessionStorage.setItem("nombreLogin", ss("nombre"));
    }
    let t = ss("tokenRBAC");
    if (!t) {
      const usuarios = SimuladorRBAC.estado().usuarios;
      const existe = x => usuarios.some(u => u.username === x);
      const deToken = ss("token").startsWith("hoja-") ? ss("token").slice(5) : "";   // login en modo "hoja": token = "hoja-<usuario>"
      const login = [deToken, ...["usuario", "username", "user", "login"].map(k => ss(k))].map(x => x.toLowerCase()).find(existe);
      const porNombre = usuarios.find(u => u.nombre.toLowerCase() === ss("nombreLogin").toLowerCase())?.username;
      const elegido = ss("usuarioDemo") || login || porNombre || USUARIO_DEMO_POR_ROL[this.rol] || "carla";
      const r = SimuladorRBAC.ingresar(elegido, "demo123");
      t = r.ok ? r.token : "";
      sessionStorage.setItem("tokenRBAC", t);
    }
    return t;
  },

  async sincronizarSesion(){
    const r = await this.api("GET", "/me");
    if (!r.cuerpo || !r.cuerpo.ok) return null;
    const d = r.cuerpo.data;
    sessionStorage.setItem("rol", d.usuario.rol);
    sessionStorage.setItem("nombre", d.usuario.nombre);
    sessionStorage.setItem("permisos", JSON.stringify(d.permisos));
    sessionStorage.setItem("equipos", JSON.stringify(d.equipos));
    if (d.config?.clasificacion) sessionStorage.setItem("clasificacion", JSON.stringify(d.config.clasificacion));
    this.rol = d.usuario.rol; this.usuario = d.usuario.nombre; this.permisos = d.permisos; this.me = d;
    document.body.setAttribute("data-rol", this.rol);
    return d;
  },

  // Ejecuta una escritura y avisa el resultado. Devuelve data o null.
  async enviar(metodo, ruta, body, mensajeOk){
    const antes = CONFIG.MODO_DATOS === "local" && typeof SimuladorRBAC !== "undefined" ? SimuladorRBAC.estado().correos.length : 0;
    const r = await this.api(metodo, ruta, body);
    if (!r.cuerpo.ok) { this.aviso(r.cuerpo.error.mensaje, 4500); return null; }
    let extra = "";
    if (CONFIG.MODO_DATOS === "local" && typeof SimuladorRBAC !== "undefined") {
      const clave = SimuladorRBAC.estado().correos.slice(antes).map(c => (c.texto.match(/Clave temporal: (\S+)/) || [])[1]).find(Boolean);
      if (clave) extra = ` · Clave temporal (demo): ${clave}`;
    }
    this.aviso(mensajeOk + extra, extra ? 9000 : 2600);
    return r.cuerpo.data;
  },

  // Formulario en hoja inferior. Resuelve con { campo: valor } o null si se cancela.
  formulario({ titulo, campos = [], enviar = "Guardar", peligro = false }){
    return new Promise(resolver => {
      const velo = $("#velo"), h = document.createElement("div");
      h.className = "hoja dialogo on";
      h.innerHTML = `<h3>${esc(titulo)}</h3><form novalidate>${campos.map(campoForm).join("")}
        <div class="btns"><button type="button" class="boton" data-cerrar>Cancelar</button>
        <button type="submit" class="boton ${peligro ? "peligro" : "primario"}">${esc(enviar)}</button></div></form>`;
      document.body.append(h); velo.classList.add("on");
      const cerrar = v => { h.remove(); velo.classList.remove("on"); velo.onclick = () => this.hoja(false); resolver(v); };
      velo.onclick = () => cerrar(null);
      h.querySelector("[data-cerrar]").onclick = () => cerrar(null);
      h.querySelector("form").onsubmit = ev => {
        ev.preventDefault();
        const f = ev.target;
        const malo = [...f.querySelectorAll("[required]")].find(x => x.value.trim().length < Number(x.getAttribute("minlength") || 1));
        if (malo) { malo.focus(); return this.aviso(malo.getAttribute("minlength") ? `Mínimo ${malo.getAttribute("minlength")} caracteres` : "Completá los campos obligatorios"); }
        const out = {};
        campos.filter(c => c.id).forEach(c => {
          out[c.id] = c.tipo === "multi" ? [...f.querySelectorAll(`[name="${c.id}"]:checked:not(:disabled)`)].map(x => x.value) : f.querySelector(`[name="${c.id}"]`).value.trim();
        });
        cerrar(out);
      };
      h.querySelector("input,select,textarea")?.focus();
    });
  },
  /* ===== FIN RBAC ===== */

  // Tomar / Reconocer un INC por equipo (lo valida el backend; la pantalla se refresca con alCambiarInc)
  /* Acciones con Deshacer: se confirman a los 5 s (o al salir de la página). Mientras tanto la pantalla las muestra como pendientes. */
  pendientes: new Map(),
  diferir(clave, texto, enviar){
    if (this.pendientes.has(clave)) return;
    const p = { enviar: async (salida = false) => { clearTimeout(p.t); if (!this.pendientes.has(clave)) return; this.pendientes.delete(clave); if (!salida) this.redibujar(); await enviar(salida); } };
    p.t = setTimeout(() => p.enviar(), 5000);
    this.pendientes.set(clave, p);
    this.redibujar();
    this.aviso(texto, 5000, { etiqueta:"Deshacer", fn:() => this.deshacer(clave) });
  },
  deshacer(clave){
    const p = this.pendientes.get(clave); if (!p) return;
    clearTimeout(p.t); this.pendientes.delete(clave); this.redibujar();
    this.aviso("Listo, no se hizo el cambio", 2200);
  },
  enviarPendientes(){ [...this.pendientes.values()].forEach(p => p.enviar(true)); },

  accionInc(id){
    const [, accion, inc, equipo] = id.split(":");
    const T = { tomar:["Vas a tomar", "Tomaste"], unirse:["Vas a unirte a", "Te uniste a"], sumar_equipo:["Vas a sumar tu equipo a", "Sumaste tu equipo a"] }[accion] || ["Vas a tomar", "Tomaste"];
    this.diferir(`${inc}:${equipo}`, `${T[0]} ${inc}. Se confirma en 5 segundos.`, async salida => {
      const r = await this.api("POST", `/incidentes/${encodeURIComponent(inc)}/acciones`, { accion, equipo_id:equipo }, { keepalive:salida });
      if (salida) return;
      if (!r.cuerpo.ok) { this.aviso(r.cuerpo.error.mensaje, 4000); return this.redibujar(); }
      const eq = r.cuerpo.data.incidente?.equipos.find(x => x.id === equipo);
      this.aviso(`${T[1]} ${inc}${eq ? " por " + eq.nombre : ""}${accion === "tomar" ? ": se detiene el escalamiento" : ""}`, 3000);
      this.pagina?.alCambiarInc?.(r.cuerpo.data);
    });
  },

  // Abrir INC: entra a su debate (lo abre si no existe) con la info del incidente desplegada
  async abrirInc(inc, info = true){
    const ir = id => location.href = "debate.html?id=" + encodeURIComponent(id) + (info ? "&info=1" : "");
    const r = await this.api("POST", "/debates", { inc });
    if (r.cuerpo.ok) return ir(r.cuerpo.data.debate.id);
    if (r.cuerpo.error.codigo === "DEBATE_YA_EXISTE") return ir(r.cuerpo.error.detalle.debate_id);
    this.aviso(r.cuerpo.error.mensaje, 4000);
  },

  // Cambiar la categoría de un INC (Prioridad × INC Grave). El backend valida, recalcula el SLA y avisa.
  async cambiarCategoria(inc, actual){
    const K = clasif(), c = catInc(actual);
    const f = await this.formulario({ titulo:`Cambiar categoría de ${inc}`, enviar:"Cambiar", campos:[
      { tipo:"nota", texto:`Ahora: ${etiquetaInc(actual)}. Se avisa a los equipos del INC y a quienes participan del chat; el SLA se recalcula con la nueva categoría.` },
      { id:"prioridad_tipo", etiqueta:"Prioridad", tipo:"select", valor:c?.prioridad, opciones:K.prioridades.map(x => ({ valor:x.id, texto:x.nombre })) },
      { id:"grave", etiqueta:"Incidente mayor", tipo:"select", valor:c?.grave, opciones:K.graves.map(x => ({ valor:x.id, texto:x.nombre })) },
      { id:"motivo", etiqueta:"Motivo (queda en la auditoría)", tipo:"textarea", requerido:true, min:5, ayuda:"Ej.: Se confirmó afectación masiva" } ] });
    if (!f) return;
    const nueva = K.categorias.find(x => x.prioridad === f.prioridad_tipo && x.grave === f.grave);
    if (!nueva) return this.aviso("Esa combinación de prioridad e incidente mayor no tiene categoría", 3500);
    this.diferir(`cat:${inc}`, `${inc} va a pasar a ${nueva.nombre} (P${nueva.p}). Se confirma en 5 segundos.`, async salida => {
      if (salida) { const r = await this.api("POST", `/incidentes/${encodeURIComponent(inc)}/categoria`, f, { keepalive:true });
        if (r.cuerpo?.ok && CONFIG.MODO_DATOS === "local") this.avisarN8n(inc, actual, nueva, f, r.cuerpo.data.incidente); return; }
      const r = await this.enviar("POST", `/incidentes/${encodeURIComponent(inc)}/categoria`, f, `${inc} ahora es ${nueva.nombre} (P${nueva.p})`);
      if (!r) return;
      this.pagina?.alCambiarInc?.(r);
      if (CONFIG.MODO_DATOS === "local") this.avisarN8n(inc, actual, nueva, f, r.incidente);
    });
  },

  // URL del webhook de n8n para el demo: la de Perfil (este navegador) o la de CONFIG
  webhookN8n(){ try { return localStorage.getItem("n8nWebhookInc") || CONFIG.N8N_WEBHOOK_INC; } catch { return CONFIG.N8N_WEBHOOK_INC; } },
  // Demo: manda el cambio de categoría a n8n (mismo contenido que guardaría WF49c en PostgreSQL)
  async avisarN8n(inc, anterior, nueva, f, incidente, prueba = false){
    const url = this.webhookN8n();
    if (!url) return null;
    const ant = catInc(anterior), K = clasif();
    const cuerpo = {
      evento: prueba ? "prueba_conexion" : "inc_categoria_cambiada", origen:"demo-noc", fecha:new Date().toISOString(),
      usuario:{ nombre:this.usuario, rol:this.rol, username:this.me?.usuario?.username || null },
      inc, motivo:f?.motivo || null,
      anterior: ant ? { prioridad:anterior, categoria:ant.nombre, prioridad_tipo:ant.prioridad, grave:ant.grave } : { prioridad:anterior },
      nueva: { prioridad:nueva.p, categoria:nueva.nombre, prioridad_tipo:nueva.prioridad, grave:nueva.grave,
               grave_mayor:K.graves.find(g => g.id === nueva.grave)?.mayor || "no", severidad:sevInc(nueva.p) },
      sla: incidente?.sla ? { minutos:incidente.sla.minutos, vence_en:incidente.sla.vence_en, vencido:incidente.sla.vencido } : null
    };
    try {
      const resp = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(cuerpo) });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      if (!prueba) this.aviso(`Cambio de ${inc} enviado a n8n`, 2500);
      return true;
    } catch (err) {
      this.aviso(`No se pudo avisar a n8n (${err.message}). El cambio quedó solo en el demo.`, 6000);
      return false;
    }
  },

  accion(id, el){
    this.hoja(false);
    if (this.pagina.accion?.(id, el) === true) return;
    if (id === "salir")      return this.salir();
    if (id === "incidentes") return location.href = "incidentes.html";
    if (id === "convocatoria") return location.href = "convocatoria.html";
    if (id === "chats") return location.href = "chats.html";
    if (id.startsWith("inc:")) return this.accionInc(id);
    if (id.startsWith("abririnc:")) return this.abrirInc(id.slice(9));
    if (id.startsWith("deshacer:")) return this.deshacer(id.slice(9));
    if (id.startsWith("vereq:")) { const inc = id.slice(6); this.equiposAbiertos.has(inc) ? this.equiposAbiertos.delete(inc) : this.equiposAbiertos.add(inc); return this.redibujar(); }
    if (id.startsWith("cat:")) { const [, inc, p] = id.split(":"); return this.cambiarCategoria(inc, Number(p)); }
    this.aviso(`"${el?.textContent.trim() || id}" disponible próximamente`);
  }
};