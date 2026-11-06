/* rbac-demo.js — GENERADO por herramientas/empaquetar-demo-rbac.js: no editar a mano.
   Módulo de usuarios, equipos y roles del Demo Local en un solo archivo. */

/* ===== compartido/reglas-rbac.js ===== */
/* =====================================================================
   REGLAS-RBAC.JS — roles, usuarios, equipos y permisos (FUENTE ÚNICA)
   ---------------------------------------------------------------------
   · Producción (integración futura): se INCRUSTA, junto con reglas-noc.js,
     en los nodos Code de n8n. Es el backend.
   · Demo Local: lo usa demo/n8n-simulado-rbac.js para responder
     EXACTAMENTE los mismos JSON que n8n. La interfaz NO lo usa.
   Sin DOM, sin red, sin almacenamiento:
     ejecutar(operacion, entrada, sesion, raw) → { ok, http, cuerpo?, plan, foco? }
   · raw  = foto del módulo (misma forma que demo/datos-demo-rbac.js)
   · plan = cambios + auditoría + notificaciones; lo aplica
            el simulador o, en producción, UNA sentencia SQL atómica
   Contrato de integración: docs/ESPEC_RBAC_USUARIOS_EQUIPOS.md (Anexo)
   Especificación: docs/ESPEC_RBAC_USUARIOS_EQUIPOS.md
   ===================================================================== */
const ReglasRBAC = (() => {
  /* Base mínima idéntica a reglas-noc.js (sobres de respuesta y validación de matriz), para que el
     módulo funcione aunque reglas-noc.js no esté cargado. Si está, se usa el original. */
  const BASE_NOC = (() => {
    const meta = (auth, cfg, ahora) => ({ generado:new Date(ahora).toISOString(), version_api:cfg.version_api || "1.0", no_leidas:Number(auth.no_leidas || 0) });
    const ok = (data, auth, cfg, ahora, http = 200) => ({ http, cuerpo:{ ok:true, data, meta:meta(auth, cfg, ahora) } });
    const error = (http, codigo, mensaje, auth, cfg, ahora) => ({ http, cuerpo:{ ok:false, error:{ codigo, mensaje }, meta:meta(auth || {}, cfg || {}, ahora) } });
    const CANALES = ["app", "email", "telegram", "llamada"], ROLES = ["GESTOR", "OPERADOR", "LECTURA"];
    function validarMatriz(body, auth, raw){
      const cfg = raw.config, ahora = Date.now();
      const no = (h, c, m) => ({ ok:false, ...error(h, c, m, auth, cfg, ahora) });
      const eq = raw.equipos.find(e => e.id === body.equipo_id);
      if (!eq) return no(404, "EQUIPO_INVALIDO", "Equipo inexistente");
      const permisos = auth.es_admin ? (auth.permisos_admin || []) : ((auth.equipos || []).find(e => e.id === eq.id)?.permisos || []);
      if (!permisos.includes("editar_matriz")) return no(403, "SIN_PERMISO", "Tu rol no permite editar la matriz de este equipo");
      const niveles = Array.isArray(body.niveles) ? body.niveles : [];
      if (!niveles.length || niveles.length > 10) return no(400, "NIVELES_INVALIDOS", "La matriz debe tener entre 1 y 10 niveles");
      const out = [];
      for (const [k, n] of niveles.entries()) {
        const espera = Math.trunc(Number(n.espera_min));
        if (!(espera >= 1 && espera <= 1440)) return no(400, "ESPERA_INVALIDA", `Nivel ${k + 1}: la espera debe ser de 1 a 1440 minutos`);
        // Canales del nivel: valen para los destinatarios que no traen su propia secuencia ("pasos")
        const base = [...new Set(n.canales || [])], crudos = n.destinos || [];
        if (base.some(c => !CANALES.includes(c)) || (!base.length && !crudos.some(d => Array.isArray(d.pasos))))
          return no(400, "CANAL_INVALIDO", `Nivel ${k + 1}: canales inválidos`);
        if (!crudos.length) return no(400, "SIN_DESTINOS", `Nivel ${k + 1}: indicá al menos un destinatario`);
        const destinos = [];
        for (const d of crudos) {
          const x = d.tipo === "rol" ? { tipo:"rol", rol:d.rol } : { tipo:"usuario", id:d.id };
          if (x.tipo === "rol" && !ROLES.includes(x.rol)) return no(400, "DESTINO_INVALIDO", `Nivel ${k + 1}: rol inválido`);
          if (x.tipo === "usuario" && !(eq.miembros || []).some(m => m.id === x.id) && !(raw.admins || []).includes(x.id))
            return no(400, "DESTINO_INVALIDO", `Nivel ${k + 1}: el usuario no pertenece al equipo`);
          // Secuencia de este destinatario: [{ canal, min }] con min desde que arranca el nivel (0 = enseguida)
          let pasos = base.map(c => ({ canal:c, min:0 }));
          if (Array.isArray(d.pasos)) {
            if (!d.pasos.length || d.pasos.length > 5) return no(400, "PASOS_INVALIDOS", `Nivel ${k + 1}: cada destinatario lleva de 1 a 5 pasos`);
            pasos = [];
            for (const p of d.pasos) {
              const min = Number(p && p.min);
              if (!CANALES.includes(p && p.canal) || !Number.isInteger(min) || min < 0 || min > 1440)
                return no(400, "PASOS_INVALIDOS", `Nivel ${k + 1}: cada paso necesita un canal válido y de 0 a 1440 minutos`);
              if (pasos.some(q => q.canal === p.canal)) return no(400, "PASOS_INVALIDOS", `Nivel ${k + 1}: un canal aparece dos veces en la misma secuencia`);
              pasos.push({ canal:p.canal, min });
            }
            pasos.sort((a, b) => a.min - b.min);
          }
          if (!pasos.length) return no(400, "CANAL_INVALIDO", `Nivel ${k + 1}: canales inválidos`);
          destinos.push({ x, pasos });
        }
        // Los canales del nivel pasan a ser la unión de los pasos; la secuencia se guarda solo si no es "todo enseguida"
        const canales = [...new Set(destinos.flatMap(d => d.pasos.map(p => p.canal)))];
        const todoYa = JSON.stringify(canales.map(c => ({ canal:c, min:0 })));
        out.push({ nivel:k + 1, espera_min:espera, canales,
          destinos:destinos.map(({ x, pasos }) => JSON.stringify(pasos) === todoYa ? x : { ...x, pasos }) });
      }
      return { ok:true, team_id:eq.id, niveles:out };
    }
    return { ok, error, validarMatriz };
  })();
  const RN = typeof ReglasNOC !== "undefined" ? ReglasNOC : BASE_NOC;

  const ESTADO_USR_TXT = { activo:"Activo", inactivo:"Inactivo", baja:"Baja" };
  const ESTADO_EQ_TXT  = { activo:"Activo", inactivo:"Inactivo" };
  const ESTADO_SOL_TXT = { pendiente:"Pendiente", aprobada:"Aprobada", rechazada:"Rechazada", cancelada:"Cancelada", vencida:"Vencida" };
  const TRANSICIONES   = { activo:["inactivo", "baja"], inactivo:["activo", "baja"], baja:[] };
  const ROLES_DE_GESTOR = ["OPERADOR", "LECTURA"];      // roles que un Gestor puede pedir, agregar o remover
  const CANALES        = ["app", "email", "telegram", "llamada"];
  const ROLES_DESTINO  = ["GESTOR", "OPERADOR", "LECTURA"];
  const RE = {
    email:/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, username:/^[a-z0-9._-]{3,40}$/, codigo:/^[A-Z0-9-]{2,20}$/,
    hora:/^([01]\d|2[0-3]):[0-5]\d$/, fecha:/^\d{4}-\d{2}-\d{2}$/, producto:/^[a-z0-9-]{2,40}$/
  };
  // Teléfono para el canal Llamada: se guarda solo con dígitos y "+" (formato internacional, ej. +5491155550101)
  const ERROR_TELEFONO = "El teléfono debe tener entre 8 y 15 dígitos, con código de país (ej. +54 9 11 5555-0101)";
  const normalizarTelefono = v => {
    const t = txt(v).replace(/[\s().-]/g, "");
    if (!t) return null;
    return /^\+?\d{8,15}$/.test(t) ? (t.startsWith("+") ? t : "+" + t) : false;
  };
  const FUNCIONALIDADES = [
    ["usuarios","Usuarios"], ["equipos","Equipos"], ["roles","Roles"], ["incidentes","Incidentes"], ["sla","SLA"],
    ["escalamientos","Escalamientos"], ["notificaciones","Notificaciones"], ["tareas","Tareas"], ["chat","Chat Operativo"],
    ["notas","Notas"], ["adjuntos","Adjuntos"], ["falsos_positivos","Falsos Positivos"], ["validaciones","Validaciones"],
    ["cierres","Cierres"], ["reaperturas","Reaperturas"], ["dashboard","Dashboard"], ["auditoria","Auditoría"],
    ["reportes","Reportes"], ["configuracion","Configuración"]
  ];
  const ALCANCE_TXT   = { global:"G", equipo:"Eq", responsable:"R", propio:"P" };
  const AMPLITUD      = { global:0, equipo:1, responsable:2, propio:3 };
  const ORDEN_GRUPOS  = ["global", "responsable", "equipo", "propio"];
  const ORDEN_TIPOS   = ["C", "M", "V", "A", "E"];
  const LISTAS_PLAN = ["usuarios_ins","usuarios_upd","sesiones_revocar","equipos_ins","equipos_upd","integrantes_ins","integrantes_upd",
    "servicios_ins","servicios_del","productos_ins","productos_del","matrices_ins","matrices_ver","inc_equipo_upd","escalamientos_upd","config_upd","incidentes_upd","sla_avisos","solicitudes_ins","solicitudes_upd",
    "asignaciones_liberar","escalamientos_detener","debates_ins","debates_upd","participantes_ins","participantes_upd",
    "mensajes_ins","mensajes_upd","incidentes_ins","notificaciones","notificaciones_leer","auditoria","correos",
    "sesiones_ins","sesiones_cerrar","sesiones_revocar_otras","catalogo_servicios","inc_colaboradores_ins","colaboradores_del",
    "pasos_ins","pasos_hechos","pasos_cancelar","incidentes_cerrar","reingresos_avisados","reingresos_decidir"];

  /* ---------- Utilidades ---------- */
  const txt    = v => String(v ?? "").trim();
  const arr    = v => Array.isArray(v) ? v : [];
  const unicos = a => [...new Set(a)];
  const iso    = v => v == null || v === "" ? null : new Date(v).toISOString();
  const igual  = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const masMs  = (base, ms) => new Date(new Date(base).getTime() + ms).toISOString();
  const porNombre = (a, b) => String(a.nombre).localeCompare(String(b.nombre), "es");
  const uuidv4 = () => (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); });

  // Diferencias campo a campo (solo lo que cambió); nunca incluye claves ni hashes
  function diff(antes, despues, excluir = ["password_hash", "clave"]){
    const a = {}, d = {};
    for (const k of Object.keys(despues)) {
      if (excluir.includes(k) || igual(antes[k], despues[k])) continue;
      a[k] = antes[k] ?? null; d[k] = despues[k] ?? null;
    }
    return Object.keys(d).length ? { antes:a, despues:d } : null;
  }
  const SENSIBLE = /^(clave|password|password_hash|token|secret|actual|nueva|nueva_clave)$/i;
  function sanitizar(o){
    if (Array.isArray(o)) return o.map(sanitizar);
    if (o && typeof o === "object") return Object.fromEntries(Object.entries(o).filter(([k]) => !SENSIBLE.test(k)).map(([k, v]) => [k, sanitizar(v)]));
    return o;
  }

  /* ---------- Consultas sobre la foto (raw) ---------- */
  const usuario     = (raw, id) => raw.usuarios.find(u => u.id === id) || null;
  const equipo      = (raw, id) => raw.equipos.find(t => t.id === id) || null;
  const rolDef      = (raw, codigo) => raw.roles.find(r => r.codigo === codigo) || null;
  const nivel       = (raw, codigo) => rolDef(raw, codigo)?.nivel ?? 99;
  const permisoDef  = (raw, codigo) => raw.permisos.find(p => p.codigo === codigo) || null;
  const membresias  = (raw, userId) => raw.integrantes.filter(m => m.user_id === userId && m.estado === "activo");
  const delEquipo   = (raw, teamId) => raw.integrantes.filter(m => m.team_id === teamId && m.estado === "activo");
  const membresia   = (raw, teamId, userId) => raw.integrantes.find(m => m.team_id === teamId && m.user_id === userId && m.estado === "activo") || null;
  const responsable = (raw, teamId) => delEquipo(raw, teamId).find(m => m.es_responsable) || null;
  const activosDe   = (raw, userId, excluir = []) => membresias(raw, userId).filter(m => !excluir.includes(m.team_id) && equipo(raw, m.team_id)?.estado === "activo");
  const admins      = raw => raw.usuarios.filter(u => u.rol === "ADMIN" && u.estado === "activo");
  const puedeSerResp = (raw, u) => !!u && u.estado === "activo" && !!rolDef(raw, u.rol)?.puede_ser_responsable;
  const matrizDe    = (raw, teamId) => arr(raw.matrices).find(m => m.team_id === teamId) || null;
  const matricesCon = (raw, userId) => arr(raw.matrices).filter(m => m.niveles.some(n => n.destinos.some(d => d.tipo === "usuario" && d.id === userId)));
  const enUso = (raw, email, username, excluirId) =>
    email && raw.usuarios.some(u => u.id !== excluirId && u.email.toLowerCase() === email) ? ["EMAIL_EN_USO", "El correo ya está registrado"]
    : username && raw.usuarios.some(u => u.id !== excluirId && u.username.toLowerCase() === username) ? ["USERNAME_EN_USO", "El usuario ya existe"]
    : null;
  const pendienteCon = (raw, email, username) => arr(raw.solicitudes).find(s => s.estado === "pendiente" &&
    (s.email.toLowerCase() === email || s.username.toLowerCase() === username)) || null;
  const ref = u => u ? { id:u.id, nombre:u.nombre } : null;

  /* ---------- Identidad y permisos efectivos ----------
     Forma compatible con reglas-noc.js: { id, es_admin, permisos_admin, equipos:[{ id, nombre, rol, permisos }] } */
  function construirAuth(sesion, raw){
    if (!sesion || !sesion.user_id) return null;
    const u = usuario(raw, sesion.user_id);
    if (!u || u.estado !== "activo") return null;
    const rps = raw.role_permissions.filter(rp => rp.rol === u.rol);
    const de = alc => rps.filter(rp => alc.includes(rp.alcance)).map(rp => rp.permiso).sort();
    const es_admin = u.rol === "ADMIN";
    const equipos = membresias(raw, u.id).map(m => ({ m, t:equipo(raw, m.team_id) }))
      .filter(x => x.t && x.t.estado === "activo").sort((a, b) => porNombre(a.t, b.t))
      .map(({ m, t }) => ({
        id:t.id, codigo:t.codigo, nombre:t.nombre, rol:u.rol, es_responsable:!!m.es_responsable,
        permisos: unicos(rps.filter(rp => rp.alcance !== "responsable" || m.es_responsable).map(rp => rp.permiso)).sort()
      }));
    return {
      id:u.id, nombre:u.nombre, email:u.email, username:u.username, rol:u.rol, nivel:nivel(raw, u.rol),
      estado:u.estado, debe_cambiar_clave: origenClave(u) === "local" && !!u.debe_cambiar_clave, es_admin,
      permisos_admin: es_admin ? de(["global", "equipo", "responsable", "propio"]) : [],
      permisos_globales: de(["global"]), permisos_propios: de(["propio"]),
      alcances: Object.fromEntries(rps.map(rp => [rp.permiso, rp.alcance])),
      equipos, no_leidas: Number(sesion.no_leidas || 0)
    };
  }
  const permisosEfectivos = auth => auth.es_admin ? [...auth.permisos_admin]
    : unicos([...auth.permisos_globales, ...auth.equipos.flatMap(e => e.permisos)]).sort();

  // null = permitido · { http, codigo, mensaje } = denegado  (spec 2.4)
  function autorizar(auth, permiso, ctx = {}, raw = null){
    if (!auth) return { http:401, codigo:"SESION_INVALIDA", mensaje:"Sesión inválida o vencida: volvé a ingresar" };
    if (auth.debe_cambiar_clave) return { http:403, codigo:"CAMBIO_CLAVE_REQUERIDO", mensaje:"Tenés que cambiar tu clave antes de continuar" };
    if (auth.es_admin) return null;
    const alc = auth.alcances[permiso];
    const desc = (raw && permisoDef(raw, permiso)?.descripcion) || permiso;
    if (!alc) return { http:403, codigo:"SIN_PERMISO", mensaje:`Tu rol no permite: ${desc.toLowerCase()}` };
    if (alc === "global") return null;
    const teams = ctx.team_ids || (ctx.team_id ? [ctx.team_id] : null);
    const propio = id => auth.equipos.find(e => e.id === id);
    if (teams) {
      if (!teams.every(id => propio(id) && (alc !== "responsable" || propio(id).es_responsable)))
        return { http:403, codigo:"FUERA_DE_ALCANCE", mensaje: alc === "responsable"
          ? `Solo el responsable del equipo puede: ${desc.toLowerCase()}` : "No pertenecés a ese equipo" };
    } else if (!auth.equipos.some(e => alc !== "responsable" || e.es_responsable)) {
      return { http:403, codigo:"FUERA_DE_ALCANCE", mensaje: alc === "responsable"
        ? `Solo el responsable de un equipo puede: ${desc.toLowerCase()}` : "No pertenecés a ningún equipo activo" };
    }
    if (alc === "propio" && ctx.owner_id !== undefined && ctx.owner_id !== auth.id)
      return { http:403, codigo:"FUERA_DE_ALCANCE", mensaje:"Solo podés modificar tus propios registros" };
    return null;
  }
  const puede = (auth, permiso, ctx, raw) => !!auth && !autorizar(auth, permiso, ctx, raw);

  /* ---------- Plan y contexto de una operación ---------- */
  const planVacio = (auth = null, meta = {}, raw = {}) => ({
    actor_id: auth?.id || null, origen: meta.origen || "DEMO", execution_id: meta.execution_id || null,
    clave_horas: Number(raw.config?.politica_clave?.temporal_horas || 24),
    ...Object.fromEntries(LISTAS_PLAN.map(l => [l, []]))
  });

  function contexto(e, auth, raw, entidad){
    const meta = e.meta || {}, ahora = meta.ahora || iso(raw.ahora) || new Date().toISOString();
    const ids = [...arr(e.ids)], plan = planVacio(auth, meta, raw);
    const actorTipo = auth ? "usuario" : e.sistema ? "sistema" : "anonimo";
    const k = {
      e, auth, raw, meta, ahora, plan, entidad, team_id:null,
      just: txt(e.body.justificacion),
      id: () => ids.shift() || uuidv4(),
      aud(accion, ent, entidadId, teamId, cambio, extra = {}){
        plan.auditoria.push({
          actor_id: auth?.id || null, actor_tipo: actorTipo, accion, entidad: ent,
          entidad_id: entidadId == null ? null : String(entidadId), team_id: teamId || null, incident_id: extra.incident_id || null,
          datos: { antes: cambio?.antes ?? null, despues: cambio?.despues ?? null, justificacion: extra.justificacion ?? (k.just || null),
                   request_id: meta.request_id || null, ...(extra.datos || {}) }
        });
      },
      // Una fila de auditoría por equipo afectado (o una sin equipo)
      audEquipos(accion, ent, entidadId, teamIds, cambio, extra){
        const ts = unicos(teamIds.filter(Boolean));
        (ts.length ? ts : [null]).forEach(t => k.aud(accion, ent, entidadId, t, cambio, extra));
      },
      notificar(userIds, titulo, cuerpo, teamId = null, canales = ["app"], extra = {}){
        unicos(userIds.filter(Boolean)).filter(id => id !== auth?.id)
          .forEach(user_id => canales.forEach(canal => plan.notificaciones.push({ user_id, team_id:teamId, canal, titulo, cuerpo,
            tipo:extra.tipo || "general", enlace:extra.enlace || null })));
      },
      updIntegrante(id, cambios){       // un solo UPDATE por fila (dedupe)
        const ya = plan.integrantes_upd.find(x => x.id === id);
        if (ya) Object.assign(ya, cambios); else plan.integrantes_upd.push({ id, ...cambios });
      },
      fallo(http, codigo, mensaje, detalle){
        const r = RN.error(http, codigo, mensaje, auth || {}, raw.config || {}, ahora);
        if (detalle !== undefined) r.cuerpo.error.detalle = detalle;
        if (![401, 403, 409, 422].includes(http)) return { ok:false, http, cuerpo:r.cuerpo, plan:null };
        const p = planVacio(auth, meta, raw);
        const teamOk = k.team_id && equipo(raw, k.team_id) ? k.team_id : null;
        p.auditoria.push({
          actor_id: auth?.id || null, actor_tipo: actorTipo, accion: http <= 403 ? "ACCESO_DENEGADO" : "OPERACION_RECHAZADA",
          entidad: k.entidad, entidad_id: e.params.id ? String(e.params.id) : null, team_id: teamOk, incident_id:null,
          datos: { error:{ codigo, mensaje }, http, operacion: e.operacion, intento: sanitizar({ params:e.params, body:e.body }),
                   request_id: meta.request_id || null }
        });
        return { ok:false, http, cuerpo:r.cuerpo, plan:p };
      },
      // Verifica sesión, permiso/alcance y justificación obligatoria
      permiso(codigo, ctx = {}, justificacion = k.just){
        const d = autorizar(auth, codigo, ctx, raw);
        if (d) return k.fallo(d.http, d.codigo, d.mensaje);
        if (permisoDef(raw, codigo)?.requiere_justificacion && justificacion.length < 10)
          return k.fallo(422, "JUSTIFICACION_REQUERIDA", "Indicá una justificación (mínimo 10 caracteres)");
        return null;
      },
      exito: (http, foco, extra = {}) => ({ ok:true, http, plan, foco, extra }),
      lectura: (data, http = 200) => ({ ok:true, ...RN.ok(data, auth, raw.config, ahora, http), plan:null })
    };
    return k;
  }
  const sinSesion = k => k.auth ? null : k.fallo(401, "SESION_INVALIDA", "Sesión inválida o vencida: volvé a ingresar");

  /* ---------- Validaciones de datos ---------- */
  function datosPersona(raw, b, { parcial = false, excluirId = null } = {}){
    const out = {};
    const tiene = c => !parcial || Object.prototype.hasOwnProperty.call(b, c);
    if (tiene("nombre")) {
      out.nombre = txt(b.nombre);
      if (out.nombre.length < 3 || out.nombre.length > 120) return { error:[400, "NOMBRE_INVALIDO", "El nombre debe tener entre 3 y 120 caracteres"] };
    }
    if (tiene("email")) {
      out.email = txt(b.email).toLowerCase();
      if (!RE.email.test(out.email)) return { error:[400, "EMAIL_INVALIDO", "El correo no es válido"] };
    }
    if (tiene("username") || (!parcial && out.email)) {
      out.username = txt(b.username).toLowerCase() || (out.email || "").split("@")[0].replace(/[^a-z0-9._-]/g, "").slice(0, 40);
      if (!RE.username.test(out.username)) return { error:[400, "USERNAME_INVALIDO", "El usuario debe tener de 3 a 40 caracteres: a-z, 0-9, punto, guion o guion bajo"] };
    }
    if (tiene("telegram_chat_id")) out.telegram_chat_id = txt(b.telegram_chat_id) || null;
    if (tiene("telefono")) { const t = normalizarTelefono(b.telefono); if (t === false) return { error:[400, "TELEFONO_INVALIDO", ERROR_TELEFONO] }; out.telefono = t; }
    const uso = enUso(raw, out.email, out.username, excluirId);
    if (uso) return { error:[409, ...uso] };
    return { datos:out };
  }

  function claveDebil(clave, pol = {}){
    const min = Number(pol.min || 12);
    if (clave.length < min) return `La clave debe tener al menos ${min} caracteres`;
    if (pol.mayus !== false && !/[A-Z]/.test(clave)) return "La clave debe tener al menos una mayúscula";
    if (pol.minus !== false && !/[a-z]/.test(clave)) return "La clave debe tener al menos una minúscula";
    if (pol.numero !== false && !/\d/.test(clave)) return "La clave debe tener al menos un número";
    return null;
  }

  function validarHorario(h){
    if (!h || typeof h !== "object") return { error:"Indicá el horario de atención" };
    const zona_horaria = txt(h.zona_horaria) || "America/Argentina/Buenos_Aires";
    try { new Intl.DateTimeFormat("es", { timeZone:zona_horaria }); } catch { return { error:"Zona horaria inválida" }; }
    const excepciones = [];
    for (const x of arr(h.excepciones)) {
      if (!RE.fecha.test(txt(x.fecha)) || isNaN(Date.parse(x.fecha))) return { error:"Excepción con fecha inválida (AAAA-MM-DD)" };
      excepciones.push({ fecha:x.fecha, cerrado: x.cerrado !== false });
    }
    if (h.modalidad === "24x7") return { horario:{ modalidad:"24x7", zona_horaria, excepciones } };
    if (h.modalidad !== "franjas") return { error:"La modalidad debe ser 24x7 o franjas" };
    const franjas = [];
    for (const f of arr(h.franjas)) {
      const dias = unicos(arr(f.dias).map(Number)).sort();
      if (!dias.length || dias.some(d => !Number.isInteger(d) || d < 1 || d > 7)) return { error:"Los días van de 1 (lunes) a 7 (domingo)" };
      if (!RE.hora.test(txt(f.desde)) || !RE.hora.test(txt(f.hasta)) || f.desde >= f.hasta) return { error:"Cada franja necesita desde < hasta (HH:MM)" };
      franjas.push({ dias, desde:f.desde, hasta:f.hasta });
    }
    if (!franjas.length) return { error:"Indicá al menos una franja" };
    for (let d = 1; d <= 7; d++) {
      const del = franjas.filter(f => f.dias.includes(d)).sort((a, b) => a.desde.localeCompare(b.desde));
      for (let i = 1; i < del.length; i++) if (del[i].desde < del[i - 1].hasta) return { error:`Franjas superpuestas el día ${d}` };
    }
    return { horario:{ modalidad:"franjas", zona_horaria, franjas, excepciones } };
  }

  function enHorario(h, ahora){
    if (!h) return null;
    try {
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone:h.zona_horaria || "UTC", weekday:"short",
        year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hourCycle:"h23" })
        .formatToParts(new Date(ahora)).map(x => [x.type, x.value]));
      if (arr(h.excepciones).some(x => x.fecha === `${p.year}-${p.month}-${p.day}` && x.cerrado)) return false;
      if (h.modalidad === "24x7") return true;
      const dia = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].indexOf(p.weekday) + 1, hm = `${p.hour}:${p.minute}`;
      return arr(h.franjas).some(f => f.dias.includes(dia) && hm >= f.desde && hm <= f.hasta);
    } catch { return null; }
  }

  /* ---------- Vistas (JSON de salida, idénticas en demo y producción) ---------- */
  function accionesUsuario(raw, auth, u){
    const out = [], A = (accion, etiqueta, requiere = []) => out.push({ accion, etiqueta, requiere });
    if (!auth || u.estado === "baja") return out;
    const yo = u.id === auth.id, superior = nivel(raw, u.rol) < auth.nivel;
    if (puede(auth, "modificar_usuario", {}, raw)) A("modificar", "Editar datos");
    if (!yo && !superior && puede(auth, "cambiar_rol_usuario", {}, raw)) A("cambiar_rol", "Cambiar rol", ["rol", "justificacion"]);
    if ((auth.es_admin || ROLES_DE_GESTOR.includes(u.rol)) && puede(auth, "gestionar_integrantes", {}, raw))
      A("cambiar_equipos", "Cambiar equipos", ["equipos", "justificacion"]);
    if (!yo && !superior && puede(auth, "cambiar_estado_usuario", {}, raw)) {
      if (u.estado === "activo") A("desactivar", "Desactivar", ["justificacion"]);
      if (u.estado === "inactivo") A("activar", "Activar", ["justificacion"]);
      A("dar_baja", "Dar de baja", ["justificacion"]);
    }
    if (u.estado === "activo" && puede(auth, "resetear_clave_usuario", {}, raw)) A("resetear_clave", "Resetear clave");
    return out;
  }

  function vistaUsuario(raw, auth, u, completo = true){
    const rol = rolDef(raw, u.rol);
    const propios = !auth || auth.es_admin || u.id === auth.id;
    const equipos = membresias(raw, u.id).map(m => ({ m, t:equipo(raw, m.team_id) }))
      .filter(x => x.t && (propios || auth.equipos.some(e => e.id === x.t.id)))
      .sort((a, b) => Number(b.m.es_responsable) - Number(a.m.es_responsable) || porNombre(a.t, b.t))
      .map(({ m, t }) => ({ id:t.id, codigo:t.codigo, nombre:t.nombre, estado:t.estado, es_responsable:!!m.es_responsable, agregado_en:iso(m.agregado_en) }));
    const base = {
      id:u.id, username:u.username, email:u.email, nombre:u.nombre,
      disponibilidad_txt: textoDisponibilidad(u.disponibilidad),
      rol:{ codigo:u.rol, nombre:rol?.nombre || u.rol }, estado:u.estado, estado_txt:ESTADO_USR_TXT[u.estado] || u.estado
    };
    if (!completo) return { ...base, equipos, acciones:accionesUsuario(raw, auth, u) };
    return {
      ...base, debe_cambiar_clave: origenClave(u) === "local" && !!u.debe_cambiar_clave, origen_clave:origenClave(u), telefono:u.telefono ?? null, telegram_chat_id:u.telegram_chat_id ?? null,
      ultimo_login:iso(u.ultimo_login), equipos,
      creado:{ por:ref(usuario(raw, u.created_by)), en:iso(u.created_at) },
      actualizado:{ por:ref(usuario(raw, u.updated_by)), en:iso(u.updated_at) },
      motivo_estado:u.motivo_estado ?? null, desactivado_en:iso(u.desactivado_en), baja_en:iso(u.baja_en),
      version:u.updated_at ?? null,
      acciones:accionesUsuario(raw, auth, u)
    };
  }

  function accionesEquipo(raw, auth, t){
    const out = [], A = (accion, etiqueta, requiere = []) => out.push({ accion, etiqueta, requiere });
    if (!auth) return out;
    const ctx = { team_id:t.id }, activo = t.estado === "activo";
    if (puede(auth, "modificar_equipo", ctx, raw)) A("modificar", "Editar datos");
    if (activo && puede(auth, "gestionar_integrantes", ctx, raw)) A("gestionar_integrantes", "Integrantes", ["justificacion"]);
    if (activo && puede(auth, "asignar_responsable", ctx, raw)) A("cambiar_responsable", "Cambiar responsable", ["user_id", "justificacion"]);
    if (puede(auth, "asociar_servicios_productos", ctx, raw)) A("catalogo", "Servicios y productos");
    if (activo && puede(auth, "editar_matriz", ctx, raw)) A("editar_matriz", "Editar matriz");
    if (puede(auth, "cambiar_estado_equipo", ctx, raw)) A(activo ? "desactivar" : "activar", activo ? "Desactivar" : "Activar", ["justificacion"]);
    return out;
  }

  function vistaEquipo(raw, auth, t){
    const ints = delEquipo(raw, t.id).map(m => ({ m, u:usuario(raw, m.user_id) })).filter(x => x.u)
      .sort((a, b) => Number(b.m.es_responsable) - Number(a.m.es_responsable) || nivel(raw, a.u.rol) - nivel(raw, b.u.rol) || porNombre(a.u, b.u));
    const r = ints.find(x => x.m.es_responsable);
    const mx = matrizDe(raw, t.id);
    const porRol = Object.fromEntries(raw.roles.map(x => [x.codigo, ints.filter(i => i.u.rol === x.codigo).length]));
    const miembro = auth && auth.equipos.find(e => e.id === t.id);
    return {
      id:t.id, codigo:t.codigo, nombre:t.nombre, descripcion:t.descripcion ?? null,
      estado:t.estado, estado_txt:ESTADO_EQ_TXT[t.estado] || t.estado,
      horario:t.horario || null, en_horario:enHorario(t.horario, raw.ahora || Date.now()), email_equipo:t.email_equipo ?? null,
      responsable: r ? { id:r.u.id, nombre:r.u.nombre, rol:r.u.rol } : null,
      integrantes: ints.map(({ m, u }) => ({ id:u.id, nombre:u.nombre, rol:u.rol, es_responsable:!!m.es_responsable, estado:u.estado })),
      totales:{ integrantes:ints.length, por_rol:porRol },
      servicios: raw.service_teams.filter(x => x.team_id === t.id).map(x => raw.servicios.find(s => s.id === x.service_id)).filter(Boolean)
        .sort(porNombre).map(s => ({ id:s.id, nombre:s.nombre, red:s.red })),
      productos: raw.team_products.filter(x => x.team_id === t.id).map(x => raw.productos.find(p => p.id === x.product_id)).filter(Boolean)
        .sort(porNombre).map(p => ({ id:p.id, nombre:p.nombre })),
      matriz: mx ? { id:mx.id, version:mx.version, activa:true,
        actualizada: mx.creada_en ? { por:ref(usuario(raw, mx.creada_por)), en:iso(mx.creada_en) } : null,
        historial: arr(raw.matrices_historial).filter(h => h.team_id === t.id).sort((a, b) => b.version - a.version).slice(0, 5)
          .map(h => ({ version:h.version, resumen:h.niveles.map(n => `N${n.nivel} ${n.espera_min}′`).join(" → "), reemplazada_en:iso(h.reemplazada_en) })),
        niveles: mx.niveles.map(n => ({ ...n, alcance_ahora: (a => ({ personas:a.personas.length, disponibles:a.disponibles.length, en_franja:a.en_franja, sin_telefono:a.sin_telefono.map(u => u.nombre) }))(alcanceNivel(raw, t.id, n, null, raw.ahora || Date.now())),
          destinos: n.destinos.map(d => ({ ...(d.tipo === "usuario"
            ? { tipo:"usuario", id:d.id, nombre:usuario(raw, d.id)?.nombre || null } : { tipo:"rol", rol:d.rol }), pasos:pasosDestino(n, d) })) })) } : null,
      // Campos de compatibilidad con GET /equipos de reglas-noc.js
      mi_rol: auth?.es_admin ? "ADMIN" : (miembro ? auth.rol : null),
      es_responsable: !!miembro?.es_responsable,
      puede_editar: puede(auth, "editar_matriz", { team_id:t.id }, raw),
      miembros: ints.filter(x => x.u.estado === "activo").map(({ u }) => ({ id:u.id, nombre:u.nombre, rol:u.rol })),
      versiones: mx?.versiones || 0,
      creado:{ por:ref(usuario(raw, t.created_by)), en:iso(t.created_at) },
      version:t.updated_at ?? null,
      acciones:accionesEquipo(raw, auth, t)
    };
  }

  function vistaIntegrante(raw, id){
    const m = raw.integrantes.find(x => x.id === id);
    if (!m) return null;
    const u = usuario(raw, m.user_id), t = equipo(raw, m.team_id);
    return {
      id:m.id, team_id:m.team_id, equipo:t?.nombre || null, user_id:m.user_id, usuario:u?.nombre || null, rol:u?.rol || null,
      es_responsable:!!m.es_responsable, estado:m.estado,
      agregado_por:ref(usuario(raw, m.agregado_por)), agregado_en:iso(m.agregado_en),
      removido_por:ref(usuario(raw, m.removido_por)), removido_en:iso(m.removido_en), motivo_remocion:m.motivo_remocion ?? null
    };
  }

  function vistaSolicitud(raw, auth, s){
    const acciones = [];
    if (s.estado === "pendiente" && s.solicitado_por !== auth?.id && puede(auth, "aprobar_alta_usuario", {}, raw)) {
      acciones.push({ accion:"aprobar", etiqueta:"Aprobar", requiere:["motivo"] }, { accion:"rechazar", etiqueta:"Rechazar", requiere:["motivo"] });
    }
    return {
      id:s.id, estado:s.estado, estado_txt:ESTADO_SOL_TXT[s.estado] || s.estado,
      nombre:s.nombre, email:s.email, username:s.username, rol:{ codigo:s.rol, nombre:rolDef(raw, s.rol)?.nombre || s.rol },
      equipos: arr(s.equipos).map(id => ({ id, nombre:equipo(raw, id)?.nombre || null })),
      telefono:s.telefono ?? null, justificacion:s.justificacion,
      solicitado_por:ref(usuario(raw, s.solicitado_por)), solicitado_en:iso(s.solicitado_en), vence_en:iso(s.vence_en),
      resuelto_por:ref(usuario(raw, s.resuelto_por)), resuelto_en:iso(s.resuelto_en), motivo_resolucion:s.motivo_resolucion ?? null,
      usuario: s.user_id ? ref(usuario(raw, s.user_id)) : null,
      acciones
    };
  }

  // Matriz RBAC derivada de las tablas (spec 2.1)
  function celdaMatriz(raw, rol, modulo){
    const porTipo = {};
    raw.role_permissions.filter(rp => rp.rol === rol).forEach(rp => {
      const p = permisoDef(raw, rp.permiso);
      if (p && p.modulo === modulo && (!(p.tipo in porTipo) || AMPLITUD[rp.alcance] < AMPLITUD[porTipo[p.tipo]])) porTipo[p.tipo] = rp.alcance;
    });
    const grupos = ORDEN_GRUPOS.map(a => [a, ORDEN_TIPOS.filter(t => porTipo[t] === a)]).filter(([, ts]) => ts.length);
    return grupos.length ? grupos.map(([a, ts]) => `${ts.join(" ")} (${ALCANCE_TXT[a]})`).join(" · ") : "X";
  }
  const matrizRBAC = raw => FUNCIONALIDADES.map(([modulo, funcionalidad]) => ({
    modulo, funcionalidad, ...Object.fromEntries(raw.roles.map(r => [r.codigo, celdaMatriz(raw, r.codigo, modulo)]))
  }));

  function vistaRol(raw, r, completo){
    const rps = raw.role_permissions.filter(rp => rp.rol === r.codigo);
    const base = {
      id:r.id, codigo:r.codigo, nombre:r.nombre, descripcion:r.descripcion, nivel:r.nivel,
      puede_ser_responsable:!!r.puede_ser_responsable, es_sistema:!!r.es_sistema,
      usuarios_activos: raw.usuarios.filter(u => u.rol === r.codigo && u.estado === "activo").length,
      cantidad_permisos: rps.length
    };
    if (!completo) return base;
    const matriz = {};
    FUNCIONALIDADES.forEach(([modulo]) => {
      const alcance = {};
      rps.forEach(rp => { const p = permisoDef(raw, rp.permiso);
        if (p && p.modulo === modulo && (!(p.tipo in alcance) || AMPLITUD[rp.alcance] < AMPLITUD[alcance[p.tipo]])) alcance[p.tipo] = rp.alcance; });
      matriz[modulo] = { tipos: ORDEN_TIPOS.filter(t => t in alcance), alcance };
    });
    return { ...base, permisos: rps.map(rp => { const p = permisoDef(raw, rp.permiso) || {};
      return { codigo:rp.permiso, modulo:p.modulo, tipo:p.tipo, alcance:rp.alcance, descripcion:p.descripcion }; }), matriz };
  }

  /* ---------- Bloques de plan reutilizables ---------- */
  function planAltaUsuario(k, d, solicitudId = null){
    const id = k.id();
    k.plan.usuarios_ins.push({ id, username:d.username, email:d.email, nombre:d.nombre, rol:d.rol,
      telefono:d.telefono ?? null, telegram_chat_id:d.telegram_chat_id ?? null, clave:d.clave || null });
    const membs = d.equipos.map(team_id => ({ id:k.id(), team_id, user_id:id, es_responsable:false }));
    k.plan.integrantes_ins.push(...membs);
    k.aud("USUARIO_CREADO", "usuario", id, null,
      { antes:null, despues:{ username:d.username, email:d.email, nombre:d.nombre, rol:d.rol, estado:"activo", equipos:d.equipos } },
      { datos:{ solicitud_id:solicitudId } });
    membs.forEach(m => k.aud("EQUIPO_INTEGRANTE_AGREGADO", "team_member", m.id, m.team_id,
      { antes:null, despues:{ user_id:id, usuario:d.nombre, es_responsable:false } }));
    k.plan.correos.push({ user_id:id, para:d.email, asunto:"Tu acceso a Assurance Center", requiere_clave:!d.clave,
      texto:`Hola ${d.nombre}:\n\nSe creó tu usuario "${d.username}" con rol ${rolDef(k.raw, d.rol)?.nombre || d.rol}.\n` +
        (d.clave ? "La clave inicial te la comunica el Administrador; vas a tener que cambiarla al ingresar.\n"
                 : `Clave temporal: {{clave}}\nVence en ${k.plan.clave_horas} horas y vas a tener que cambiarla al ingresar.\n`) });
    return id;
  }

  // Libera asignaciones de incidentes abiertos del usuario (en uno o todos sus equipos)
  function planLiberarAsignaciones(k, userId, teamIds = null){
    // Si trabajaba INC como colaborador, también deja de figurar
    if (arr(k.raw.incidentes_equipo).some(x => arr(x.colaboradores).includes(userId) && (!teamIds || teamIds.includes(x.team_id))))
      k.plan.colaboradores_del.push({ user_id:userId, team_ids:teamIds });
    const libs = arr(k.raw.incidentes_equipo).filter(x => x.asignado_id === userId && (!teamIds || teamIds.includes(x.team_id)));
    libs.forEach(x => {
      k.plan.asignaciones_liberar.push({ incident_id:x.incident_id, team_id:x.team_id });
      k.aud("INCIDENTE_ASIGNACION_LIBERADA", "incidente", x.incident_id, x.team_id,
        { antes:{ asignado_id:userId }, despues:{ asignado_id:null } }, { incident_id:x.incident_id });
      const r = responsable(k.raw, x.team_id);
      k.notificar([r?.user_id], `${x.inc} · asignación liberada`, `${usuario(k.raw, userId)?.nombre || "Un integrante"} ya no está disponible: reasigná el incidente.`, x.team_id);
    });
    return libs.length;
  }

  // Traspasa la responsabilidad de un equipo a otro usuario (agregándolo si no es integrante)
  function planTraspaso(k, teamId, nuevoId){
    const actual = responsable(k.raw, teamId), nuevo = usuario(k.raw, nuevoId);
    if (actual) k.updIntegrante(actual.id, { es_responsable:false });
    const m = membresia(k.raw, teamId, nuevoId);
    let memberId = m?.id;
    if (m) k.updIntegrante(m.id, { es_responsable:true });
    else {
      memberId = k.id();
      k.plan.integrantes_ins.push({ id:memberId, team_id:teamId, user_id:nuevoId, es_responsable:true });
      k.aud("EQUIPO_INTEGRANTE_AGREGADO", "team_member", memberId, teamId, { antes:null, despues:{ user_id:nuevoId, usuario:nuevo.nombre, es_responsable:true } });
    }
    const anterior = actual ? usuario(k.raw, actual.user_id) : null;
    k.aud("EQUIPO_RESPONSABLE_CAMBIADO", "team_member", memberId, teamId,
      { antes:{ responsable:ref(anterior) }, despues:{ responsable:ref(nuevo) } });
    const t = equipo(k.raw, teamId);
    k.notificar([nuevoId], `Sos responsable de ${t.nombre}`, k.just, teamId);
    k.notificar([anterior?.id], `Dejaste de ser responsable de ${t.nombre}`, k.just, teamId);
  }

  const advertenciasMatriz = (raw, userId, teamIds = null) => matricesCon(raw, userId)
    .filter(m => !teamIds || teamIds.includes(m.team_id))
    .map(m => ({ codigo:"MATRIZ_REQUIERE_VERSION", team_id:m.team_id, equipo:equipo(raw, m.team_id)?.nombre || null, version:m.version,
                 mensaje:"El usuario figura como destinatario de la matriz activa: creá una versión nueva" }));

  /* =====================================================================
     OPERACIONES DE ESCRITURA
     ===================================================================== */

  // POST /solicitudes — WF32
  function solicitarAlta(e, auth, raw){
    const k = contexto(e, auth, raw, "solicitud"), b = e.body;
    const equipos = unicos(arr(b.equipos).map(txt).filter(Boolean));
    if (equipos.length === 1) k.team_id = equipos[0];
    const no = sinSesion(k) || k.permiso("solicitar_alta_usuario", equipos.length ? { team_ids:equipos } : {}); if (no) return no;
    const v = datosPersona(raw, b); if (v.error) return k.fallo(...v.error);
    const d = v.datos, rol = txt(b.rol).toUpperCase();
    if (!rolDef(raw, rol)) return k.fallo(404, "ROL_INEXISTENTE", "El rol indicado no existe");
    if (!auth.es_admin && !ROLES_DE_GESTOR.includes(rol)) return k.fallo(403, "ROL_NO_PERMITIDO", "Solo podés solicitar usuarios Operador o Solo Lectura");
    if (nivel(raw, rol) < auth.nivel) return k.fallo(403, "ROL_SUPERIOR", "No podés solicitar un rol superior al tuyo");
    if (!equipos.length) return k.fallo(422, "SIN_EQUIPOS", "Indicá al menos un equipo");
    const malo = equipos.find(id => equipo(raw, id)?.estado !== "activo");
    if (malo) return k.fallo(422, "EQUIPO_INVALIDO", "Uno de los equipos no existe o está inactivo", { team_id:malo });
    if (pendienteCon(raw, d.email, d.username)) return k.fallo(409, "SOLICITUD_PENDIENTE", "Ya hay una solicitud pendiente para ese correo o usuario");
    const id = k.id(), dias = Number(raw.config?.solicitud_vence_dias || 7);
    const s = { id, nombre:d.nombre, email:d.email, username:d.username, rol, equipos, telefono:d.telefono ?? null,
                justificacion:k.just, vence_en:masMs(k.ahora, dias * 86400000) };
    k.plan.solicitudes_ins.push(s);
    k.audEquipos("USUARIO_ALTA_SOLICITADA", "solicitud", id, equipos,
      { antes:null, despues:{ nombre:s.nombre, email:s.email, username:s.username, rol, equipos } });
    k.notificar(admins(raw).map(u => u.id), `Solicitud de alta: ${s.nombre}`, `${auth.nombre} pide alta como ${rolDef(raw, rol).nombre}. ${k.just}`, null, ["app", "email"]);
    return k.exito(201, { tipo:"solicitud", id });
  }

  // POST /solicitudes/:id/resolver — WF33 (la aprobación crea el usuario en el mismo plan)
  function resolverSolicitud(e, auth, raw){
    const k = contexto(e, auth, raw, "solicitud"), b = e.body;
    const motivo = txt(b.motivo || b.justificacion);
    const no = sinSesion(k) || k.permiso("aprobar_alta_usuario", {}, motivo); if (no) return no;
    const s = arr(raw.solicitudes).find(x => x.id === e.params.id);
    if (!s) return k.fallo(404, "SOLICITUD_INEXISTENTE", "La solicitud no existe");
    const decision = txt(b.decision).toLowerCase();
    if (!["aprobar", "rechazar"].includes(decision)) return k.fallo(400, "DECISION_INVALIDA", "La decisión debe ser aprobar o rechazar");
    if (s.estado !== "pendiente") return k.fallo(409, "SOLICITUD_NO_PENDIENTE", `La solicitud ya está ${ESTADO_SOL_TXT[s.estado] || s.estado}`);
    if (new Date(s.vence_en) <= new Date(k.ahora)) return k.fallo(409, "SOLICITUD_VENCIDA", "La solicitud venció: pedí una nueva");
    if (s.solicitado_por === auth.id) return k.fallo(403, "AUTOAPROBACION", "No podés resolver una solicitud que creaste vos");
    if (decision === "rechazar") {
      k.just = motivo;
      k.plan.solicitudes_upd.push({ id:s.id, estado:"rechazada", motivo_resolucion:motivo });
      k.audEquipos("USUARIO_SOLICITUD_RECHAZADA", "solicitud", s.id, s.equipos, { antes:{ estado:"pendiente" }, despues:{ estado:"rechazada", motivo } });
      k.notificar([s.solicitado_por], `Solicitud rechazada: ${s.nombre}`, motivo);
      return k.exito(200, { tipo:"solicitud", id:s.id });
    }
    const uso = enUso(raw, s.email.toLowerCase(), s.username.toLowerCase(), null);
    if (uso) return k.fallo(409, ...uso);
    const malo = s.equipos.find(id => equipo(raw, id)?.estado !== "activo");
    if (malo) return k.fallo(422, "EQUIPO_INVALIDO", "Uno de los equipos de la solicitud ya no está activo", { team_id:malo });
    k.just = s.justificacion;
    const userId = planAltaUsuario(k, { nombre:s.nombre, email:s.email.toLowerCase(), username:s.username.toLowerCase(), rol:s.rol,
      equipos:s.equipos, telefono:s.telefono }, s.id);
    k.just = motivo;
    k.plan.solicitudes_upd.push({ id:s.id, estado:"aprobada", motivo_resolucion:motivo, user_id:userId });
    k.audEquipos("USUARIO_SOLICITUD_APROBADA", "solicitud", s.id, s.equipos, { antes:{ estado:"pendiente" }, despues:{ estado:"aprobada", user_id:userId } });
    k.notificar([s.solicitado_por], `Solicitud aprobada: ${s.nombre}`, motivo);
    return k.exito(200, { tipo:"solicitud", id:s.id, usuario_id:userId });
  }

  // POST /usuarios — WF34 (alta directa)
  function crearUsuario(e, auth, raw){
    const k = contexto(e, auth, raw, "usuario"), b = e.body;
    const no = sinSesion(k) || k.permiso("crear_usuario"); if (no) return no;
    const v = datosPersona(raw, b); if (v.error) return k.fallo(...v.error);
    const d = v.datos, rol = txt(b.rol).toUpperCase();
    if (!rolDef(raw, rol)) return k.fallo(404, "ROL_INEXISTENTE", "El rol indicado no existe");
    if (nivel(raw, rol) < auth.nivel) return k.fallo(403, "ROL_SUPERIOR", "No podés asignar un rol superior al tuyo");
    const equipos = unicos(arr(b.equipos).map(txt).filter(Boolean));
    if (rol !== "ADMIN" && !equipos.length) return k.fallo(422, "SIN_EQUIPOS", "Un usuario que no es Administrador necesita al menos un equipo");
    const malo = equipos.find(id => equipo(raw, id)?.estado !== "activo");
    if (malo) return k.fallo(422, "EQUIPO_INVALIDO", "Uno de los equipos no existe o está inactivo", { team_id:malo });
    const clave = b.clave == null ? "" : String(b.clave);
    if (clave) { const debil = claveDebil(clave, raw.config?.politica_clave); if (debil) return k.fallo(422, "CLAVE_DEBIL", debil); }
    if (pendienteCon(raw, d.email, d.username)) return k.fallo(409, "SOLICITUD_PENDIENTE", "Hay una solicitud pendiente para ese correo o usuario: resolvela");
    const id = planAltaUsuario(k, { ...d, rol, equipos, clave:clave || null });
    return k.exito(201, { tipo:"usuario", id });
  }

  // PATCH /usuarios/:id — WF40
  function modificarUsuario(e, auth, raw){
    const k = contexto(e, auth, raw, "usuario"), b = e.body;
    const no = sinSesion(k) || k.permiso("modificar_usuario"); if (no) return no;
    const u = usuario(raw, e.params.id);
    if (!u) return k.fallo(404, "USUARIO_INEXISTENTE", "El usuario no existe");
    if (u.estado === "baja") return k.fallo(409, "USUARIO_DE_BAJA", "El usuario está dado de baja");
    const prohibido = ["rol", "estado", "equipos", "clave"].find(c => c in b);
    if (prohibido) return k.fallo(400, "CAMPO_NO_MODIFICABLE", `"${prohibido}" se cambia con su operación específica`);
    const v = datosPersona(raw, b, { parcial:true, excluirId:u.id }); if (v.error) return k.fallo(...v.error);
    const cambio = diff(u, v.datos);
    if (!cambio) return k.exito(200, { tipo:"usuario", id:u.id }, { sin_cambios:true });
    k.plan.usuarios_upd.push({ id:u.id, ...cambio.despues, ...(b.version ? { version:b.version } : {}) });
    k.audEquipos("USUARIO_MODIFICADO", "usuario", u.id, membresias(raw, u.id).map(m => m.team_id), cambio);
    return k.exito(200, { tipo:"usuario", id:u.id });
  }

  // POST /usuarios/:id/clave/reset — WF40
  function resetearClave(e, auth, raw){
    const k = contexto(e, auth, raw, "usuario");
    const no = sinSesion(k) || k.permiso("resetear_clave_usuario"); if (no) return no;
    const u = usuario(raw, e.params.id);
    if (!u) return k.fallo(404, "USUARIO_INEXISTENTE", "El usuario no existe");
    if (u.estado !== "activo") return k.fallo(409, "USUARIO_NO_ACTIVO", "Solo se resetea la clave de usuarios activos");
    if (origenClave(u) !== "local") return k.fallo(409, "SIN_CLAVE", origenClave(u) === "codigo"
      ? "Este usuario entra con un código por correo: no tiene clave para resetear" : "Este usuario usa la clave de la empresa");
    k.plan.usuarios_upd.push({ id:u.id, resetear_clave:true });
    k.plan.sesiones_revocar.push(u.id);
    k.audEquipos("USUARIO_CLAVE_RESETEADA", "usuario", u.id, membresias(raw, u.id).map(m => m.team_id),
      { antes:null, despues:{ debe_cambiar_clave:true } });
    k.plan.correos.push({ user_id:u.id, para:u.email, asunto:"Nueva clave temporal de Assurance Center", requiere_clave:true,
      texto:`Hola ${u.nombre}:\n\nSe generó una clave temporal para "${u.username}": {{clave}}\nVence en ${k.plan.clave_horas} horas y vas a tener que cambiarla al ingresar.\n` });
    return k.exito(200, { tipo:"usuario", id:u.id });
  }

  // POST /usuarios/:id/rol — WF37
  function cambiarRol(e, auth, raw){
    const k = contexto(e, auth, raw, "usuario"), b = e.body;
    const no = sinSesion(k) || k.permiso("cambiar_rol_usuario"); if (no) return no;
    const u = usuario(raw, e.params.id);
    if (!u) return k.fallo(404, "USUARIO_INEXISTENTE", "El usuario no existe");
    if (u.estado === "baja") return k.fallo(409, "USUARIO_DE_BAJA", "El usuario está dado de baja");
    if (u.id === auth.id) return k.fallo(403, "AUTOMODIFICACION", "No podés cambiar tu propio rol");
    const rol = txt(b.rol).toUpperCase(), nuevo = rolDef(raw, rol);
    if (!nuevo) return k.fallo(404, "ROL_INEXISTENTE", "El rol indicado no existe");
    if (nuevo.nivel < auth.nivel || nivel(raw, u.rol) < auth.nivel) return k.fallo(403, "ROL_SUPERIOR", "No podés asignar ni modificar un rol superior al tuyo");
    if (rol === u.rol) return k.exito(200, { tipo:"usuario", id:u.id }, { sin_cambios:true, advertencias:[] });
    if (u.rol === "ADMIN" && u.estado === "activo" && admins(raw).length <= 1) return k.fallo(409, "ULTIMO_ADMIN", "Debe quedar al menos un Administrador activo");
    const resp = membresias(raw, u.id).filter(m => m.es_responsable && equipo(raw, m.team_id)?.estado === "activo");
    if (resp.length && !nuevo.puede_ser_responsable) return k.fallo(409, "RESPONSABLE_SIN_REEMPLAZO",
      `${u.nombre} es responsable de equipos: designá otro responsable antes de cambiarle el rol`,
      { equipos: resp.map(m => ({ id:m.team_id, nombre:equipo(raw, m.team_id).nombre })) });
    if (rol !== "ADMIN" && u.estado === "activo" && !activosDe(raw, u.id).length) return k.fallo(422, "SIN_EQUIPOS", "Asignale al menos un equipo activo antes de quitarle el rol Administrador");
    const teams = membresias(raw, u.id).map(m => m.team_id);
    k.plan.usuarios_upd.push({ id:u.id, rol });
    k.audEquipos("USUARIO_ROL_CAMBIADO", "usuario", u.id, teams, { antes:{ rol:u.rol }, despues:{ rol } });
    k.notificar([u.id], "Cambió tu rol", `Ahora sos ${nuevo.nombre}. ${k.just}`, null, ["app", "email"]);
    teams.forEach(t => k.notificar([responsable(raw, t)?.user_id].filter(x => x !== u.id), `${u.nombre} ahora es ${nuevo.nombre}`, k.just, t));
    const advertencias = rol === "LECTURA" ? advertenciasMatriz(raw, u.id) : [];
    return k.exito(200, { tipo:"usuario", id:u.id }, { advertencias });
  }

  // POST /usuarios/:id/estado — WF38 (desactivar · activar · baja lógica)
  function cambiarEstadoUsuario(e, auth, raw){
    const k = contexto(e, auth, raw, "usuario"), b = e.body;
    const no = sinSesion(k) || k.permiso("cambiar_estado_usuario"); if (no) return no;
    const u = usuario(raw, e.params.id);
    if (!u) return k.fallo(404, "USUARIO_INEXISTENTE", "El usuario no existe");
    if (u.id === auth.id) return k.fallo(403, "AUTOMODIFICACION", "No podés cambiar tu propio estado");
    if (nivel(raw, u.rol) < auth.nivel) return k.fallo(403, "ROL_SUPERIOR", "No podés modificar a un usuario de rol superior");
    const estado = txt(b.estado).toLowerCase();
    if (!(estado in TRANSICIONES)) return k.fallo(400, "ESTADO_INVALIDO", "El estado debe ser activo, inactivo o baja");
    if (estado === u.estado) return k.exito(200, { tipo:"usuario", id:u.id }, { sin_cambios:true, advertencias:[] });
    if (!TRANSICIONES[u.estado].includes(estado)) return k.fallo(409, "TRANSICION_INVALIDA", `No se puede pasar de ${ESTADO_USR_TXT[u.estado]} a ${ESTADO_USR_TXT[estado]}`);
    const sale = u.estado === "activo";
    if (sale && u.rol === "ADMIN" && admins(raw).length <= 1) return k.fallo(409, "ULTIMO_ADMIN", "Debe quedar al menos un Administrador activo");

    const reemplazos = arr(b.reemplazos);
    const resp = membresias(raw, u.id).filter(m => m.es_responsable && equipo(raw, m.team_id)?.estado === "activo");
    const faltan = resp.filter(m => !reemplazos.some(r => r.team_id === m.team_id));
    if (faltan.length) return k.fallo(409, "RESPONSABLE_SIN_REEMPLAZO", `${u.nombre} es responsable de equipos: indicá reemplazos`,
      { equipos: faltan.map(m => ({ id:m.team_id, nombre:equipo(raw, m.team_id).nombre })) });
    for (const m of resp) {
      const r = reemplazos.find(x => x.team_id === m.team_id), cand = usuario(raw, r.user_id);
      if (!cand || cand.id === u.id || !puedeSerResp(raw, cand)) return k.fallo(422, "RESPONSABLE_INVALIDO",
        "El reemplazo debe ser un Administrador o Jefe/Gestor activo", { team_id:m.team_id });
    }
    let nuevos = [];
    if (estado === "activo" && u.rol !== "ADMIN" && !activosDe(raw, u.id).length) {
      nuevos = unicos(arr(b.equipos).map(txt).filter(Boolean));
      if (!nuevos.length) return k.fallo(422, "SIN_EQUIPOS", "El usuario no tiene equipos activos: indicá al menos uno para activarlo");
      const malo = nuevos.find(id => equipo(raw, id)?.estado !== "activo");
      if (malo) return k.fallo(422, "EQUIPO_INVALIDO", "Uno de los equipos no existe o está inactivo", { team_id:malo });
    }

    const teamsAntes = membresias(raw, u.id).map(m => m.team_id);
    resp.forEach(m => planTraspaso(k, m.team_id, reemplazos.find(x => x.team_id === m.team_id).user_id));
    k.plan.usuarios_upd.push({ id:u.id, estado, motivo_estado:k.just });
    let liberadas = 0;
    if (sale || estado === "baja") { k.plan.sesiones_revocar.push(u.id); liberadas = planLiberarAsignaciones(k, u.id); }
    if (estado === "baja") membresias(raw, u.id).forEach(m => {
      k.updIntegrante(m.id, { estado:"removido", es_responsable:false, motivo_remocion:`Baja de usuario: ${k.just}` });
      k.aud("EQUIPO_INTEGRANTE_REMOVIDO", "team_member", m.id, m.team_id, { antes:{ user_id:u.id, estado:"activo" }, despues:{ user_id:u.id, estado:"removido" } });
    });
    nuevos.filter(t => !membresia(raw, t, u.id)).forEach(t => {
      const id = k.id();
      k.plan.integrantes_ins.push({ id, team_id:t, user_id:u.id, es_responsable:false });
      k.aud("EQUIPO_INTEGRANTE_AGREGADO", "team_member", id, t, { antes:null, despues:{ user_id:u.id, usuario:u.nombre, es_responsable:false } });
    });
    const accion = { activo:"USUARIO_ACTIVADO", inactivo:"USUARIO_DESACTIVADO", baja:"USUARIO_BAJA" }[estado];
    k.audEquipos(accion, "usuario", u.id, unicos([...teamsAntes, ...nuevos]), { antes:{ estado:u.estado }, despues:{ estado } });
    teamsAntes.forEach(t => k.notificar([responsable(raw, t)?.user_id], `${u.nombre}: ${ESTADO_USR_TXT[estado]}`, k.just, t));
    return k.exito(200, { tipo:"usuario", id:u.id }, {
      sesiones_revocadas: sale || estado === "baja", asignaciones_liberadas: liberadas,
      advertencias: estado === "activo" ? [] : advertenciasMatriz(raw, u.id)
    });
  }

  // POST /equipos/:id/integrantes — WF36
  function agregarIntegrantes(e, auth, raw){
    const k = contexto(e, auth, raw, "team"), b = e.body, t = equipo(raw, e.params.id);
    k.team_id = t?.id || null;
    const no = sinSesion(k) || (t ? k.permiso("gestionar_integrantes", { team_id:t.id }) : null); if (no) return no;
    if (!t) return k.fallo(404, "EQUIPO_INEXISTENTE", "El equipo no existe");
    if (t.estado !== "activo") return k.fallo(409, "EQUIPO_INACTIVO", "El equipo está inactivo");
    const ids = unicos(arr(b.user_ids).map(txt).filter(Boolean));
    if (!ids.length) return k.fallo(400, "SIN_USUARIOS", "Indicá al menos un usuario");
    const agregados = [], sin_cambios = [];
    for (const id of ids) {
      const u = usuario(raw, id);
      if (!u) return k.fallo(404, "USUARIO_INEXISTENTE", "Uno de los usuarios no existe", { user_id:id });
      if (u.estado === "baja") return k.fallo(409, "USUARIO_DE_BAJA", `${u.nombre} está dado de baja`, { user_id:id });
      if (!auth.es_admin && !ROLES_DE_GESTOR.includes(u.rol)) return k.fallo(403, "ROL_NO_PERMITIDO", `Solo podés agregar Operadores o Solo Lectura (${u.nombre} es ${u.rol})`);
      if (membresia(raw, t.id, id)) { sin_cambios.push(id); continue; }
      const mid = k.id();
      k.plan.integrantes_ins.push({ id:mid, team_id:t.id, user_id:id, es_responsable:false });
      k.aud("EQUIPO_INTEGRANTE_AGREGADO", "team_member", mid, t.id, { antes:null, despues:{ user_id:id, usuario:u.nombre, es_responsable:false } });
      k.notificar([id], `Te sumaron al equipo ${t.nombre}`, k.just, t.id);
      agregados.push(mid);
    }
    return k.exito(agregados.length ? 201 : 200, { tipo:"integrantes", team_id:t.id, agregados, removidos:[], sin_cambios });
  }

  // Valida y arma la remoción de un integrante (compartido por remover y reemplazar)
  function planRemocion(k, t, u){
    const m = membresia(k.raw, t.id, u.id);
    if (!m) return { error:[404, "NO_ES_INTEGRANTE", `${u.nombre} no es integrante de ${t.nombre}`] };
    if (!k.auth.es_admin && !ROLES_DE_GESTOR.includes(u.rol)) return { error:[403, "ROL_NO_PERMITIDO", `Solo podés remover Operadores o Solo Lectura (${u.nombre} es ${u.rol})`] };
    if (m.es_responsable) return { error:[409, "ES_RESPONSABLE", `${u.nombre} es responsable de ${t.nombre}: cambiá el responsable primero`] };
    k.updIntegrante(m.id, { estado:"removido", es_responsable:false, motivo_remocion:k.just });
    k.aud("EQUIPO_INTEGRANTE_REMOVIDO", "team_member", m.id, t.id, { antes:{ user_id:u.id, estado:"activo" }, despues:{ user_id:u.id, estado:"removido" } });
    planLiberarAsignaciones(k, u.id, [t.id]);
    k.notificar([u.id, responsable(k.raw, t.id)?.user_id], `${u.nombre} salió del equipo ${t.nombre}`, k.just, t.id);
    return { id:m.id, advertencias:advertenciasMatriz(k.raw, u.id, [t.id]) };
  }

  // POST /equipos/:id/integrantes/:user_id/remover — WF36
  function removerIntegrante(e, auth, raw){
    const k = contexto(e, auth, raw, "team"), t = equipo(raw, e.params.id);
    k.team_id = t?.id || null;
    const no = sinSesion(k) || (t ? k.permiso("gestionar_integrantes", { team_id:t.id }) : null); if (no) return no;
    if (!t) return k.fallo(404, "EQUIPO_INEXISTENTE", "El equipo no existe");
    const u = usuario(raw, e.params.user_id);
    if (!u) return k.fallo(404, "USUARIO_INEXISTENTE", "El usuario no existe");
    if (!membresia(raw, t.id, u.id)) return k.fallo(404, "NO_ES_INTEGRANTE", `${u.nombre} no es integrante de ${t.nombre}`);
    if (u.estado === "activo" && u.rol !== "ADMIN" && t.estado === "activo" && !activosDe(raw, u.id, [t.id]).length)
      return k.fallo(409, "ULTIMO_EQUIPO", `Es el único equipo activo de ${u.nombre}: asignale otro o desactivalo`);
    const r = planRemocion(k, t, u); if (r.error) return k.fallo(...r.error);
    return k.exito(200, { tipo:"integrantes", team_id:t.id, agregados:[], removidos:[r.id], sin_cambios:[] }, { advertencias:r.advertencias });
  }

  // PUT /usuarios/:id/equipos — WF36 (lista completa deseada)
  function reemplazarEquiposUsuario(e, auth, raw){
    const k = contexto(e, auth, raw, "usuario"), b = e.body;
    const u = usuario(raw, e.params.id);
    const deseados = unicos(arr(b.equipos).map(txt).filter(Boolean));
    const actuales = u ? membresias(raw, u.id).map(m => m.team_id) : [];
    const agregar = deseados.filter(t => !actuales.includes(t)), remover = actuales.filter(t => !deseados.includes(t));
    const tocados = [...agregar, ...remover].filter(id => equipo(raw, id));
    if (tocados.length === 1) k.team_id = tocados[0];
    const no = sinSesion(k) || k.permiso("gestionar_integrantes", tocados.length ? { team_ids:tocados } : {}); if (no) return no;
    if (!u) return k.fallo(404, "USUARIO_INEXISTENTE", "El usuario no existe");
    if (u.estado === "baja") return k.fallo(409, "USUARIO_DE_BAJA", "El usuario está dado de baja");
    if (!auth.es_admin && !ROLES_DE_GESTOR.includes(u.rol)) return k.fallo(403, "ROL_NO_PERMITIDO", "Solo podés gestionar Operadores o Solo Lectura");
    const malo = agregar.find(id => equipo(raw, id)?.estado !== "activo");
    if (malo) return k.fallo(422, "EQUIPO_INVALIDO", "Uno de los equipos no existe o está inactivo", { team_id:malo });
    if (u.estado === "activo" && u.rol !== "ADMIN" && !deseados.some(id => equipo(raw, id)?.estado === "activo"))
      return k.fallo(409, "ULTIMO_EQUIPO", "El usuario tiene que conservar al menos un equipo activo");
    const agregados = [], removidos = [], advertencias = [];
    for (const tid of remover) {
      const r = planRemocion(k, equipo(raw, tid), u); if (r.error) return k.fallo(...r.error);
      removidos.push(r.id); advertencias.push(...r.advertencias);
    }
    for (const tid of agregar) {
      const id = k.id(), t = equipo(raw, tid);
      k.plan.integrantes_ins.push({ id, team_id:tid, user_id:u.id, es_responsable:false });
      k.aud("EQUIPO_INTEGRANTE_AGREGADO", "team_member", id, tid, { antes:null, despues:{ user_id:u.id, usuario:u.nombre, es_responsable:false } });
      k.notificar([u.id], `Te sumaron al equipo ${t.nombre}`, k.just, tid);
      agregados.push(id);
    }
    return k.exito(200, { tipo:"usuario_equipos", id:u.id, agregados, removidos, sin_cambios:deseados.filter(t => actuales.includes(t)) }, { advertencias });
  }

  // POST /equipos/:id/responsable — WF36
  function cambiarResponsable(e, auth, raw){
    const k = contexto(e, auth, raw, "team"), t = equipo(raw, e.params.id);
    k.team_id = t?.id || null;
    const no = sinSesion(k) || k.permiso("asignar_responsable", t ? { team_id:t.id } : {}); if (no) return no;
    if (!t) return k.fallo(404, "EQUIPO_INEXISTENTE", "El equipo no existe");
    const u = usuario(raw, txt(e.body.user_id));
    if (!puedeSerResp(raw, u)) return k.fallo(422, "RESPONSABLE_INVALIDO", "El responsable debe ser un Administrador o Jefe/Gestor activo");
    if (responsable(raw, t.id)?.user_id === u.id) return k.exito(200, { tipo:"equipo", id:t.id }, { sin_cambios:true });
    planTraspaso(k, t.id, u.id);
    return k.exito(200, { tipo:"equipo", id:t.id });
  }

  // POST /equipos — WF35
  function crearEquipo(e, auth, raw){
    const k = contexto(e, auth, raw, "team"), b = e.body;
    const no = sinSesion(k) || k.permiso("crear_equipo"); if (no) return no;
    const codigo = txt(b.codigo).toUpperCase(), nombre = txt(b.nombre), descripcion = txt(b.descripcion) || null;
    if (!RE.codigo.test(codigo)) return k.fallo(400, "CODIGO_INVALIDO", "El código debe tener de 2 a 20 caracteres: A-Z, 0-9 o guion");
    if (nombre.length < 3 || nombre.length > 80) return k.fallo(400, "NOMBRE_INVALIDO", "El nombre debe tener entre 3 y 80 caracteres");
    if (descripcion && descripcion.length > 500) return k.fallo(400, "DESCRIPCION_INVALIDA", "La descripción admite hasta 500 caracteres");
    if (raw.equipos.some(t => t.codigo === codigo)) return k.fallo(409, "CODIGO_EN_USO", "Ya existe un equipo con ese código");
    if (raw.equipos.some(t => t.nombre.toLowerCase() === nombre.toLowerCase())) return k.fallo(409, "NOMBRE_EN_USO", "Ya existe un equipo con ese nombre");
    const h = validarHorario(b.horario); if (h.error) return k.fallo(422, "HORARIO_INVALIDO", h.error);
    const resp = usuario(raw, txt(b.responsable_id));
    if (!puedeSerResp(raw, resp)) return k.fallo(422, "RESPONSABLE_INVALIDO", "El responsable debe ser un Administrador o Jefe/Gestor activo");
    const integrantes = unicos(arr(b.integrantes).map(x => txt(typeof x === "object" ? x?.user_id : x)).filter(id => id && id !== resp.id));
    const malU = integrantes.find(id => !usuario(raw, id) || usuario(raw, id).estado === "baja");
    if (malU) return k.fallo(422, "INTEGRANTE_INVALIDO", "Uno de los integrantes no existe o está dado de baja", { user_id:malU });
    const servicios = unicos(arr(b.servicios).map(txt).filter(Boolean)), productos = unicos(arr(b.productos).map(txt).filter(Boolean));
    const malS = servicios.find(id => !raw.servicios.some(s => s.id === id && s.activo !== false));
    if (malS) return k.fallo(422, "SERVICIO_INVALIDO", "Servicio inexistente o inactivo", { service_id:malS });
    const malP = productos.find(id => !raw.productos.some(p => p.id === id && p.estado === "activo"));
    if (malP) return k.fallo(422, "PRODUCTO_INVALIDO", "Producto inexistente o inactivo", { product_id:malP });
    const id = k.id();
    const vm = RN.validarMatriz({ equipo_id:id, niveles:b.matriz?.niveles }, auth, {
      config:raw.config, equipos:[{ id, miembros:[resp.id, ...integrantes].map(x => ({ id:x })) }], admins:admins(raw).map(u => u.id) });
    if (!vm.ok) return k.fallo(vm.http, vm.cuerpo.error.codigo, vm.cuerpo.error.mensaje);

    k.plan.equipos_ins.push({ id, codigo, nombre, descripcion, horario:h.horario, zona_horaria:h.horario.zona_horaria, email_equipo:txt(b.email_equipo) || null });
    k.aud("EQUIPO_CREADO", "team", id, id, { antes:null, despues:{ codigo, nombre, descripcion, estado:"activo", horario:h.horario } });
    const rid = k.id();
    k.plan.integrantes_ins.push({ id:rid, team_id:id, user_id:resp.id, es_responsable:true });
    k.aud("EQUIPO_RESPONSABLE_ASIGNADO", "team_member", rid, id, { antes:null, despues:{ responsable:ref(resp) } });
    integrantes.forEach(uid => {
      const mid = k.id();
      k.plan.integrantes_ins.push({ id:mid, team_id:id, user_id:uid, es_responsable:false });
      k.aud("EQUIPO_INTEGRANTE_AGREGADO", "team_member", mid, id, { antes:null, despues:{ user_id:uid, usuario:usuario(raw, uid).nombre, es_responsable:false } });
    });
    servicios.forEach(s => k.plan.servicios_ins.push({ service_id:s, team_id:id }));
    productos.forEach(p => k.plan.productos_ins.push({ product_id:p, team_id:id }));
    if (servicios.length) k.aud("EQUIPO_SERVICIOS_MODIFICADOS", "team", id, id, { antes:[], despues:servicios });
    if (productos.length) k.aud("EQUIPO_PRODUCTOS_MODIFICADOS", "team", id, id, { antes:[], despues:productos });
    const mxId = k.id();
    k.plan.matrices_ins.push({ id:mxId, team_id:id, version:1, niveles:vm.niveles });
    k.aud("MATRIZ_VERSION_CREADA", "matriz", mxId, id, { antes:null, despues:{ version:1, niveles:vm.niveles.length } });
    k.notificar([resp.id, ...integrantes], `Equipo ${nombre} creado`, `Responsable: ${resp.nombre}`, id);
    return k.exito(201, { tipo:"equipo", id });
  }

  // PATCH /equipos/:id — WF41
  function modificarEquipo(e, auth, raw){
    const k = contexto(e, auth, raw, "team"), b = e.body, t = equipo(raw, e.params.id);
    k.team_id = t?.id || null;
    const no = sinSesion(k) || k.permiso("modificar_equipo", t ? { team_id:t.id } : {}); if (no) return no;
    if (!t) return k.fallo(404, "EQUIPO_INEXISTENTE", "El equipo no existe");
    const prohibido = ["codigo", "estado", "responsable_id", "integrantes", "servicios", "productos", "matriz"].find(c => c in b);
    if (prohibido) return k.fallo(400, "CAMPO_NO_MODIFICABLE", `"${prohibido}" no se cambia por acá`);
    const nuevo = {};
    if ("nombre" in b) {
      nuevo.nombre = txt(b.nombre);
      if (nuevo.nombre.length < 3 || nuevo.nombre.length > 80) return k.fallo(400, "NOMBRE_INVALIDO", "El nombre debe tener entre 3 y 80 caracteres");
      if (raw.equipos.some(x => x.id !== t.id && x.nombre.toLowerCase() === nuevo.nombre.toLowerCase())) return k.fallo(409, "NOMBRE_EN_USO", "Ya existe un equipo con ese nombre");
    }
    if ("descripcion" in b) { nuevo.descripcion = txt(b.descripcion) || null; if ((nuevo.descripcion || "").length > 500) return k.fallo(400, "DESCRIPCION_INVALIDA", "La descripción admite hasta 500 caracteres"); }
    if ("email_equipo" in b) nuevo.email_equipo = txt(b.email_equipo) || null;
    if ("horario" in b) { const h = validarHorario(b.horario); if (h.error) return k.fallo(422, "HORARIO_INVALIDO", h.error); nuevo.horario = h.horario; nuevo.zona_horaria = h.horario.zona_horaria; }
    const cambio = diff(t, nuevo);
    if (!cambio) return k.exito(200, { tipo:"equipo", id:t.id }, { sin_cambios:true });
    k.plan.equipos_upd.push({ id:t.id, ...cambio.despues, ...(b.version ? { version:b.version } : {}) });
    k.aud("EQUIPO_MODIFICADO", "team", t.id, t.id, cambio);
    return k.exito(200, { tipo:"equipo", id:t.id });
  }

  // PUT /equipos/:id/catalogo — WF41 (servicios y productos)
  function modificarCatalogo(e, auth, raw){
    const k = contexto(e, auth, raw, "team"), b = e.body, t = equipo(raw, e.params.id);
    k.team_id = t?.id || null;
    const no = sinSesion(k) || k.permiso("asociar_servicios_productos", t ? { team_id:t.id } : {}); if (no) return no;
    if (!t) return k.fallo(404, "EQUIPO_INEXISTENTE", "El equipo no existe");
    const cambios = [];
    if (Array.isArray(b.servicios)) {
      const desea = unicos(b.servicios.map(txt).filter(Boolean)), tiene = raw.service_teams.filter(x => x.team_id === t.id).map(x => x.service_id);
      const mal = desea.find(id => !raw.servicios.some(s => s.id === id && s.activo !== false));
      if (mal) return k.fallo(422, "SERVICIO_INVALIDO", "Servicio inexistente o inactivo", { service_id:mal });
      const quita = tiene.filter(s => !desea.includes(s));
      const huerfanos = t.estado !== "activo" ? [] : quita.filter(s => raw.servicios.find(x => x.id === s)?.activo !== false &&
        !raw.service_teams.some(x => x.service_id === s && x.team_id !== t.id && equipo(raw, x.team_id)?.estado === "activo"));
      if (huerfanos.length) return k.fallo(409, "SERVICIO_SIN_EQUIPO", "Algunos servicios quedarían sin equipo activo", { servicios:huerfanos });
      desea.filter(s => !tiene.includes(s)).forEach(s => k.plan.servicios_ins.push({ service_id:s, team_id:t.id }));
      quita.forEach(s => k.plan.servicios_del.push({ service_id:s, team_id:t.id }));
      if (!igual([...tiene].sort(), [...desea].sort())) { k.aud("EQUIPO_SERVICIOS_MODIFICADOS", "team", t.id, t.id, { antes:[...tiene].sort(), despues:[...desea].sort() }); cambios.push("servicios"); }
    }
    if (Array.isArray(b.productos)) {
      const desea = unicos(b.productos.map(txt).filter(Boolean)), tiene = raw.team_products.filter(x => x.team_id === t.id).map(x => x.product_id);
      const mal = desea.find(id => !raw.productos.some(p => p.id === id && p.estado === "activo"));
      if (mal) return k.fallo(422, "PRODUCTO_INVALIDO", "Producto inexistente o inactivo", { product_id:mal });
      desea.filter(p => !tiene.includes(p)).forEach(p => k.plan.productos_ins.push({ product_id:p, team_id:t.id }));
      tiene.filter(p => !desea.includes(p)).forEach(p => k.plan.productos_del.push({ product_id:p, team_id:t.id }));
      if (!igual([...tiene].sort(), [...desea].sort())) { k.aud("EQUIPO_PRODUCTOS_MODIFICADOS", "team", t.id, t.id, { antes:[...tiene].sort(), despues:[...desea].sort() }); cambios.push("productos"); }
    }
    return k.exito(200, { tipo:"equipo", id:t.id }, cambios.length ? {} : { sin_cambios:true });
  }

  /* ---------- Matrices de escalamiento: nueva versión por equipo o en bloque ----------
     Cada cambio crea una versión nueva (las anteriores quedan en el historial, inmutables).
     Los escalamientos que ya están corriendo siguen con la versión con la que arrancaron. */
  const miembrosMatriz = (raw, teamId) => delEquipo(raw, teamId).map(m => ({ id:m.user_id }));
  function planMatriz(k, t, niveles, versionEsperada){
    const raw = k.raw, mx = matrizDe(raw, t.id);
    if (versionEsperada != null && mx && Number(versionEsperada) !== mx.version)
      return k.fallo(409, "CONFLICTO_EDICION", `La matriz de ${t.nombre} cambió (ahora v${mx.version}): recargá antes de guardar`, { team_id:t.id, version:mx.version });
    const vm = RN.validarMatriz({ equipo_id:t.id, niveles }, k.auth, {
      config:raw.config, equipos:[{ id:t.id, miembros:miembrosMatriz(raw, t.id) }], admins:admins(raw).map(u => u.id) });
    if (!vm.ok) return k.fallo(vm.http === 403 ? 403 : 422, vm.cuerpo.error.codigo, `${t.nombre}: ${vm.cuerpo.error.mensaje}`, { team_id:t.id });
    const conFranja = [];                    // franja horaria opcional por nivel (validarMatriz no la conoce)
    for (const [j, n] of vm.niveles.entries()) {
      const h = arr(niveles)[j]?.horario;
      if (!h || ["24x7", "siempre"].includes(h.modalidad)) { conFranja.push(n); continue; }
      const v = validarHorario(h);
      if (v.error) return k.fallo(422, "HORARIO_INVALIDO", `${t.nombre} · nivel ${j + 1}: ${v.error}`, { team_id:t.id });
      conFranja.push({ ...n, horario:v.horario });
    }
    vm.niveles = conFranja;
    // Llamada en la matriz pero sin teléfono cargado: se guarda igual, con advertencia
    const advertencias = vm.niveles.flatMap(n => { const st = alcanceNivel(raw, t.id, n, null, k.ahora).sin_telefono;
      return st.length ? [`${t.nombre} · N${n.nivel}: ${st.map(u => u.nombre).join(", ")} no ${st.length === 1 ? "tiene" : "tienen"} teléfono cargado y no ${st.length === 1 ? "recibirá" : "recibirán"} la llamada`] : []; });
    // Un paso que vence después de que arranca el nivel siguiente igual se manda (si nadie tomó el INC), pero conviene saberlo
    vm.niveles.forEach((n, j) => { if (j === vm.niveles.length - 1) return;
      const tarde = n.destinos.flatMap(d => pasosDestino(n, d)).filter(p => p.min >= n.espera_min);
      if (tarde.length) advertencias.push(`${t.nombre} · N${n.nivel}: hay pasos a los ${unicos(tarde.map(p => p.min)).join(", ")} min y el nivel siguiente arranca a los ${n.espera_min} min (se mandan igual mientras nadie tome el INC)`); });
    if (mx && igual(mx.niveles, vm.niveles)) return { sin_cambios:true, advertencias };
    const id = k.id(), version = (mx?.versiones || mx?.version || 0) + 1;
    k.plan.matrices_ver.push({ id, team_id:t.id, version, version_anterior:mx?.version ?? null, niveles:vm.niveles });
    k.aud("MATRIZ_VERSION_CREADA", "matriz", id, t.id, { antes: mx ? { version:mx.version, niveles:mx.niveles } : null, despues:{ version, niveles:vm.niveles } });
    const resp = responsable(raw, t.id);
    if (resp) k.notificar([resp.user_id], `Matriz de ${t.nombre} actualizada (v${version})`,
      vm.niveles.map(n => `N${n.nivel}: ${n.espera_min} min`).join(" → "), t.id, ["app"], { tipo:"general", enlace:"matrices.html?equipo=" + t.id });
    return { version, advertencias };
  }

  // PUT /equipos/:id/matriz — WF46a
  function editarMatriz(e, auth, raw){
    const k = contexto(e, auth, raw, "matriz"), b = e.body, t = equipo(raw, e.params.id);
    k.team_id = t?.id || null;
    const no = sinSesion(k) || k.permiso("editar_matriz", t ? { team_id:t.id } : {}); if (no) return no;
    if (!t) return k.fallo(404, "EQUIPO_INEXISTENTE", "El equipo no existe");
    if (t.estado !== "activo") return k.fallo(409, "EQUIPO_INACTIVO", "El equipo está inactivo");
    const r = planMatriz(k, t, b.niveles, b.version);
    if (r.ok === false) return r;
    return k.exito(200, { tipo:"equipo", id:t.id }, r.sin_cambios ? { sin_cambios:true, advertencias:r.advertencias } : { version:r.version, advertencias:r.advertencias });
  }

  // PUT /matrices — WF46b: la misma matriz para varios equipos o para todos (todo o nada)
  function editarMatrizMasiva(e, auth, raw){
    const k = contexto(e, auth, raw, "matriz"), b = e.body;
    const no = sinSesion(k) || k.permiso("editar_matriz"); if (no) return no;
    const editables = raw.equipos.filter(t => t.estado === "activo" && puede(auth, "editar_matriz", { team_id:t.id }, raw));
    const ids = b.equipos === "todos" ? editables.map(t => t.id) : unicos(arr(b.equipos).map(txt).filter(Boolean));
    if (!ids.length) return k.fallo(400, "SIN_EQUIPOS", "Elegí al menos un equipo");
    const ajeno = ids.find(id => !editables.some(t => t.id === id));
    if (ajeno) return k.fallo(403, "FUERA_DE_ALCANCE", `No podés editar la matriz de ${equipo(raw, ajeno)?.nombre || "ese equipo"}`, { team_id:ajeno });
    if (k.just.length < 10) return k.fallo(422, "JUSTIFICACION_REQUERIDA", "Indicá una justificación (mínimo 10 caracteres)");
    const versiones = b.versiones && typeof b.versiones === "object" ? b.versiones : {};
    const cambiados = [], iguales = [], advertencias = [];
    for (const id of ids) {
      const t = equipo(raw, id), r = planMatriz(k, t, b.niveles, versiones[id]);
      if (r.ok === false) return r;
      advertencias.push(...arr(r.advertencias));
      (r.sin_cambios ? iguales : cambiados).push({ id, nombre:t.nombre, version:r.version ?? matrizDe(raw, id)?.version ?? null });
    }
    return k.exito(200, { tipo:"matrices", ids }, { actualizados:cambiados, sin_cambios:iguales, advertencias });
  }

  // POST /equipos/:id/estado — WF41
  function cambiarEstadoEquipo(e, auth, raw){
    const k = contexto(e, auth, raw, "team"), t = equipo(raw, e.params.id);
    k.team_id = t?.id || null;
    const no = sinSesion(k) || k.permiso("cambiar_estado_equipo", t ? { team_id:t.id } : {}); if (no) return no;
    if (!t) return k.fallo(404, "EQUIPO_INEXISTENTE", "El equipo no existe");
    const estado = txt(e.body.estado).toLowerCase();
    if (!(estado in ESTADO_EQ_TXT)) return k.fallo(400, "ESTADO_INVALIDO", "El estado debe ser activo o inactivo");
    if (estado === t.estado) return k.exito(200, { tipo:"equipo", id:t.id }, { sin_cambios:true });
    if (estado === "inactivo") {
      const incs = arr(raw.incidentes_equipo).filter(x => x.team_id === t.id && ["pendiente", "reconocido"].includes(x.estado_equipo));
      if (incs.length) return k.fallo(409, "EQUIPO_CON_INCIDENTES_ABIERTOS", "El equipo tiene incidentes abiertos: reasignalos antes", { incidentes:unicos(incs.map(x => x.inc)) });
      const huerfanos = raw.service_teams.filter(x => x.team_id === t.id).map(x => x.service_id).filter(s => raw.servicios.find(x => x.id === s)?.activo !== false &&
        !raw.service_teams.some(x => x.service_id === s && x.team_id !== t.id && equipo(raw, x.team_id)?.estado === "activo"));
      if (huerfanos.length) return k.fallo(409, "SERVICIO_SIN_EQUIPO", "Algunos servicios quedarían sin equipo activo", { servicios:huerfanos });
      const solos = delEquipo(raw, t.id).map(m => usuario(raw, m.user_id))
        .filter(u => u && u.estado === "activo" && u.rol !== "ADMIN" && !activosDe(raw, u.id, [t.id]).length);
      if (solos.length) return k.fallo(409, "USUARIOS_SIN_EQUIPO", "Algunos integrantes quedarían sin equipo activo", { usuarios:solos.map(ref) });
      k.plan.escalamientos_detener.push(t.id);
    } else {
      const r = responsable(raw, t.id);
      if (!r || !puedeSerResp(raw, usuario(raw, r.user_id))) return k.fallo(409, "EQUIPO_SIN_RESPONSABLE", "Designá un responsable válido antes de activar el equipo");
      if (!matrizDe(raw, t.id)) return k.fallo(409, "EQUIPO_SIN_MATRIZ", "El equipo necesita una matriz de escalamiento activa");
    }
    k.plan.equipos_upd.push({ id:t.id, estado, motivo_estado:k.just });
    k.aud(estado === "activo" ? "EQUIPO_ACTIVADO" : "EQUIPO_DESACTIVADO", "team", t.id, t.id, { antes:{ estado:t.estado }, despues:{ estado } });
    k.notificar(delEquipo(raw, t.id).map(m => m.user_id), `Equipo ${t.nombre}: ${ESTADO_EQ_TXT[estado]}`, k.just, t.id);
    return k.exito(200, { tipo:"equipo", id:t.id });
  }

  // WF42 (programado): vence solicitudes pendientes
  function vencerSolicitudes(raw, meta = {}){
    const k = contexto({ params:{}, query:{}, body:{}, meta, sistema:true }, null, raw, "solicitud");
    arr(raw.solicitudes).filter(s => s.estado === "pendiente" && new Date(s.vence_en) <= new Date(k.ahora)).forEach(s => {
      k.plan.solicitudes_upd.push({ id:s.id, estado:"vencida", motivo_resolucion:"Vencida sin resolución" });
      k.audEquipos("USUARIO_SOLICITUD_VENCIDA", "solicitud", s.id, s.equipos, { antes:{ estado:"pendiente" }, despues:{ estado:"vencida" } }, { justificacion:null });
      k.plan.notificaciones.push({ user_id:s.solicitado_por, team_id:null, canal:"app", titulo:`Solicitud vencida: ${s.nombre}`, cuerpo:"Venció sin resolución" });
    });
    return k.plan;
  }

  /* =====================================================================
     OPERACIONES DE LECTURA
     ===================================================================== */

  // GET /me (extiende el de reglas-noc.js con rol y responsabilidades)
  function me(e, auth, raw){
    const k = contexto(e, auth, raw, "sesion");
    const no = sinSesion(k); if (no) return no;
    return k.lectura({
      usuario:{ id:auth.id, nombre:auth.nombre, email:auth.email, username:auth.username, rol:auth.rol,
                es_admin:auth.es_admin, debe_cambiar_clave:auth.debe_cambiar_clave,
                telefono: usuario(raw, auth.id).telefono ?? null, origen_clave: origenClave(usuario(raw, auth.id)),
                disponibilidad: usuario(raw, auth.id).disponibilidad ?? null, disponibilidad_txt: textoDisponibilidad(usuario(raw, auth.id).disponibilidad),
                pasos: pasosPropios(usuario(raw, auth.id)) },
      // Mi secuencia de avisos en cada matriz donde figuro: pasos fijos (matriz) + los míos, ya filtrados por perfil y teléfono
      secuencias: misSecuencias(raw, usuario(raw, auth.id)),
      equipos: auth.equipos.map(x => ({ id:x.id, nombre:x.nombre, rol:x.rol, es_responsable:x.es_responsable })),
      permisos: permisosEfectivos(auth),
      notificaciones_perfil: TIPOS_NOTIF.map(([id, nombre]) => ({ id, nombre, canales:canalesPermitidos(raw, auth.rol, id) })),
      config:{ prioridad_critica:Math.max(0, ...clasificacion(raw).categorias.filter(c => sevDe(raw, c.p) === "crit").map(c => c.p)),
               sla_riesgo_pct:raw.config.sla_riesgo_pct, clasificacion:clasificacion(raw), refresco_seg:refrescoSeg(raw) }
    });
  }

  // Cada cuántos segundos se actualizan las pantallas (la barra de "Actualizado"). Lo define el Administrador.
  const REFRESCO_OPCIONES = [5, 10, 15, 20, 30, 60, 120, 300];
  const refrescoSeg = raw => { const v = Number(raw.config?.refresco_seg); return REFRESCO_OPCIONES.includes(v) ? v : 20; };     // 20 s: igual que n8n
  // PUT /config/actualizacion { segundos, justificacion } — solo Administrador
  function editarActualizacion(e, auth, raw){
    const k = contexto(e, auth, raw, "config"), b = e.body;
    const no = sinSesion(k); if (no) return no;
    if (!auth.es_admin) return k.fallo(403, "SOLO_ADMIN", "Solo el Administrador puede cambiar cada cuánto se actualizan las pantallas");
    const seg = Number(b.segundos);
    if (!REFRESCO_OPCIONES.includes(seg)) return k.fallo(422, "VALOR_INVALIDO", `Elegí uno de estos valores (segundos): ${REFRESCO_OPCIONES.join(", ")}`);
    const antes = refrescoSeg(raw);
    if (seg === antes) return k.exito(200, { tipo:"config" }, { sin_cambios:true, segundos:seg });
    if (k.just.length < 10) return k.fallo(422, "JUSTIFICACION_REQUERIDA", "Indicá una justificación (mínimo 10 caracteres)");
    k.plan.config_upd.push({ clave:"refresco_seg", valor:seg });
    k.aud("CONFIG_ACTUALIZACION_MODIFICADA", "config", "refresco_seg", null, { antes:{ segundos:antes }, despues:{ segundos:seg } });
    return k.exito(200, { tipo:"config" }, { segundos:seg });
  }

  const visible = (auth, u) => auth.es_admin || u.id === auth.id ||
    membresias({ integrantes:auth._raw.integrantes }, u.id).some(m => auth.equipos.some(x => x.id === m.team_id));

  // GET /usuarios?estado=&rol=&equipo_id=&q=
  function listarUsuarios(e, auth, raw){
    const k = contexto(e, auth, raw, "usuario"), q = e.query;
    const no = sinSesion(k) || k.permiso("ver_usuarios"); if (no) return no;
    const a = { ...auth, _raw:raw }, busca = txt(q.q).toLowerCase();
    const lista = raw.usuarios.filter(u => visible(a, u))
      .filter(u => !q.estado || u.estado === q.estado)
      .filter(u => !q.rol || u.rol === String(q.rol).toUpperCase())
      .filter(u => !q.equipo_id || membresia(raw, q.equipo_id, u.id))
      .filter(u => !busca || [u.nombre, u.email, u.username].some(x => String(x).toLowerCase().includes(busca)))
      .sort(porNombre);
    return k.lectura({ usuarios: lista.map(u => vistaUsuario(raw, auth, u, false)), total:lista.length,
      puede_crear: puede(auth, "crear_usuario", {}, raw), puede_solicitar: puede(auth, "solicitar_alta_usuario", {}, raw) });
  }

  // GET /usuarios/:id
  function verUsuario(e, auth, raw){
    const k = contexto(e, auth, raw, "usuario"), u = usuario(raw, e.params.id);
    const no = sinSesion(k) || (u && u.id === auth?.id ? null : k.permiso("ver_usuarios")); if (no) return no;
    if (!u) return k.fallo(404, "USUARIO_INEXISTENTE", "El usuario no existe");
    if (!visible({ ...auth, _raw:raw }, u)) return k.fallo(403, "FUERA_DE_ALCANCE", "No compartís equipos con ese usuario");
    return k.lectura({ usuario: vistaUsuario(raw, auth, u) });
  }

  // GET /usuarios/:id/equipos
  function equiposDeUsuario(e, auth, raw){
    const k = contexto(e, auth, raw, "usuario"), u = usuario(raw, e.params.id);
    const no = sinSesion(k) || (u && u.id === auth?.id ? null : k.permiso("ver_usuarios")); if (no) return no;
    if (!u) return k.fallo(404, "USUARIO_INEXISTENTE", "El usuario no existe");
    if (!visible({ ...auth, _raw:raw }, u)) return k.fallo(403, "FUERA_DE_ALCANCE", "No compartís equipos con ese usuario");
    const equipos = vistaUsuario(raw, auth, u, false).equipos.map(x => ({ ...x, matriz_version: matrizDe(raw, x.id)?.version ?? null }));
    return k.lectura({ usuario:{ id:u.id, nombre:u.nombre, rol:u.rol }, equipos });
  }

  // GET /solicitudes?estado=
  function listarSolicitudes(e, auth, raw){
    const k = contexto(e, auth, raw, "solicitud");
    const no = sinSesion(k); if (no) return no;
    const todas = puede(auth, "aprobar_alta_usuario", {}, raw);
    // Ver mis solicitudes no pide justificación (la pide crear una)
    if (!todas) { const d = autorizar(auth, "solicitar_alta_usuario", {}, raw); if (d) return k.fallo(d.http, d.codigo, d.mensaje); }
    const lista = arr(raw.solicitudes).filter(s => todas || s.solicitado_por === auth.id)
      .filter(s => !e.query.estado || s.estado === e.query.estado)
      .sort((a, b) => String(b.solicitado_en).localeCompare(String(a.solicitado_en)));
    return k.lectura({ solicitudes: lista.map(s => vistaSolicitud(raw, auth, s)), total:lista.length });
  }

  // GET /equipos (superset compatible con construirEquipos de reglas-noc.js)
  function listarEquipos(e, auth, raw){
    const k = contexto(e, auth, raw, "team");
    const no = sinSesion(k) || k.permiso("ver_equipos"); if (no) return no;
    const lista = raw.equipos.filter(t => auth.es_admin || auth.equipos.some(x => x.id === t.id))
      .filter(t => !e.query.estado || t.estado === e.query.estado).sort(porNombre);
    const conCatalogo = puede(auth, "crear_equipo", {}, raw) || puede(auth, "asociar_servicios_productos", {}, raw);
    return k.lectura({ equipos: lista.map(t => vistaEquipo(raw, auth, t)), canales:CANALES, roles:ROLES_DESTINO,
      puede_crear: puede(auth, "crear_equipo", {}, raw),
      // Administradores: destinatarios válidos en la matriz de cualquier equipo
      admins_destino: puede(auth, "editar_matriz", {}, raw) ? admins(raw).sort(porNombre).map(ref) : [],
      catalogos: conCatalogo ? {
        servicios: raw.servicios.filter(s => s.activo !== false).sort(porNombre).map(s => ({ id:s.id, nombre:s.nombre, red:s.red })),
        productos: raw.productos.filter(p => p.estado === "activo").sort(porNombre).map(p => ({ id:p.id, nombre:p.nombre }))
      } : null });
  }

  // GET /equipos/:id
  function verEquipo(e, auth, raw){
    const k = contexto(e, auth, raw, "team"), t = equipo(raw, e.params.id);
    k.team_id = t?.id || null;
    const no = sinSesion(k) || k.permiso("ver_equipos", t ? { team_id:t.id } : {}); if (no) return no;
    if (!t) return k.fallo(404, "EQUIPO_INEXISTENTE", "El equipo no existe");
    return k.lectura({ equipo: vistaEquipo(raw, auth, t) });
  }

  // GET /equipos/:id/integrantes?incluir_removidos=
  function integrantesDeEquipo(e, auth, raw){
    const k = contexto(e, auth, raw, "team"), t = equipo(raw, e.params.id);
    k.team_id = t?.id || null;
    const no = sinSesion(k) || k.permiso("ver_equipos", t ? { team_id:t.id } : {}); if (no) return no;
    if (!t) return k.fallo(404, "EQUIPO_INEXISTENTE", "El equipo no existe");
    const todos = ["true", "1", true].includes(e.query.incluir_removidos);
    const lista = raw.integrantes.filter(m => m.team_id === t.id && (todos || m.estado === "activo"))
      .map(m => vistaIntegrante(raw, m.id))
      .sort((a, b) => Number(b.es_responsable) - Number(a.es_responsable) || (a.estado === b.estado ? 0 : a.estado === "activo" ? -1 : 1) ||
        nivel(raw, a.rol) - nivel(raw, b.rol) || String(a.usuario).localeCompare(String(b.usuario), "es"));
    return k.lectura({ equipo:{ id:t.id, codigo:t.codigo, nombre:t.nombre }, integrantes:lista, total:lista.filter(x => x.estado === "activo").length });
  }

  // GET /roles · GET /roles/:codigo
  function listarRoles(e, auth, raw){
    const k = contexto(e, auth, raw, "rol");
    const no = sinSesion(k) || k.permiso("ver_roles"); if (no) return no;
    return k.lectura({ roles: raw.roles.map(r => vistaRol(raw, r, false)), matriz: matrizRBAC(raw),
      leyenda:{ tipos:{ C:"Crear", M:"Modificar", V:"Ver", A:"Aprobar", E:"Ejecutar", X:"Sin acceso" }, alcances:{ G:"global", Eq:"equipos donde es integrante", R:"equipos donde es responsable", P:"registros propios" } } });
  }
  function verRol(e, auth, raw){
    const k = contexto(e, auth, raw, "rol");
    const no = sinSesion(k) || k.permiso("ver_roles"); if (no) return no;
    const r = rolDef(raw, txt(e.params.codigo).toUpperCase());
    if (!r) return k.fallo(404, "ROL_INEXISTENTE", "El rol no existe");
    return k.lectura({ rol: vistaRol(raw, r, true) });
  }

  // GET /auditoria — devuelve el filtro (el backend lo aplica sobre v_auditoria) y el plan que audita la consulta
  function consultarAuditoria(e, auth, raw){
    const k = contexto(e, auth, raw, "sistema"), q = e.query;
    const no = sinSesion(k) || k.permiso("ver_auditoria", q.equipo_id ? { team_id:q.equipo_id } : {}); if (no) return no;
    const ahora = new Date(k.ahora);
    const desde = q.desde && !isNaN(Date.parse(q.desde)) ? iso(q.desde) : new Date(ahora.getTime() - 30 * 86400000).toISOString();
    const hasta = q.hasta && !isNaN(Date.parse(q.hasta)) ? iso(q.hasta) : masMs(k.ahora, 1000);
    const limite = Math.min(500, Math.max(1, Math.trunc(Number(q.limite) || 100))), pagina = Math.max(1, Math.trunc(Number(q.pagina) || 1));
    const consulta = {
      equipo_id:q.equipo_id || null, entidad:q.entidad || null, entidad_id:q.entidad_id || null, usuario_id:q.usuario_id || null,
      accion:q.accion || null, desde, hasta, es_admin:auth.es_admin, equipos:auth.equipos.map(x => x.id), actor_id:auth.id,
      limite, offset:(pagina - 1) * limite
    };
    k.aud("AUDITORIA_CONSULTADA", "auditoria", null, consulta.equipo_id && equipo(raw, consulta.equipo_id) ? consulta.equipo_id : null,
      null, { justificacion:null, datos:{ filtros:{ ...consulta, equipos:undefined, es_admin:undefined, actor_id:undefined } } });
    return { ok:true, http:200, consulta, plan:k.plan, pagina, limite };
  }
  function responderAuditoria(res, filas, sesion, raw, ahora){
    if (!res.ok) return { http:res.http, cuerpo:res.cuerpo };
    const auth = construirAuth(sesion, raw) || {};
    const lista = arr(filas).map(f => ({
      id:Number(f.id), fecha:f.fecha, hora:f.hora, ts:iso(f.ts), usuario:f.usuario, usuario_nombre:f.usuario_nombre ?? null, usuario_id:f.usuario_id ?? null,
      accion:f.accion, entidad:f.entidad, entidad_id:f.entidad_id ?? null, equipo_id:f.equipo_id ?? null, equipo:f.equipo ?? null,
      valor_anterior:f.valor_anterior ?? null, valor_nuevo:f.valor_nuevo ?? null, justificacion:f.justificacion ?? null,
      request_id:f.request_id ?? null, origen:f.origen, execution_id:f.execution_id ?? null
    }));
    return RN.ok({ filas:lista, pagina:res.pagina, limite:res.limite, filtros:{ desde:res.consulta.desde, hasta:res.consulta.hasta } }, auth, raw.config, ahora);
  }

  /* =====================================================================
     DEBATES POR INCIDENTE (chat operativo, spec sección 11)
     · Uno por INC. Lo abre cualquiera con permiso de escribir en el chat.
     · Al abrirse se suman todos los integrantes activos de los equipos del INC.
     · Cualquier usuario puede unirse o salir. Leer y escribir es para participantes
       (el Administrador puede leer sin unirse, para supervisar).
     ===================================================================== */
  const MAX_TEXTO = 4000, MAX_FIJADOS = 10;
  const ADJUNTOS = {
    imagen:  { re:/^image\/(jpeg|png|webp|gif)$/, max:1500000 },
    archivo: { re:/^(application\/pdf|text\/plain|text\/csv|application\/zip|application\/msword|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation))$/, max:2000000 }
  };
  const ESTADO_DEB_TXT = { abierto:"Abierto", cerrado:"Cerrado" };
  const tiene = (auth, p) => !!auth && (auth.es_admin || permisosEfectivos(auth).includes(p));
  const incidenteDe = (raw, inc) => arr(raw.incidentes).find(i => i.inc === inc) || null;
  const debateDe = (raw, id) => arr(raw.debates).find(d => d.id === id) || null;
  const participantes = (raw, id) => arr(raw.debate_participantes).filter(p => p.debate_id === id && p.estado === "activo");
  const participacion = (raw, id, userId) => participantes(raw, id).find(p => p.user_id === userId) || null;
  const mensajesDe = (raw, id) => arr(raw.debate_mensajes).filter(m => m.debate_id === id);   // ya vienen en orden de envío
  const fijadosDe = (raw, id) => mensajesDe(raw, id).filter(m => m.fijado && !m.eliminado_en);
  // Moderar = Administrador, o permiso moderar_chat (alcance equipo) en alguno de los equipos del INC
  const modera = (auth, d) => !!auth && (auth.es_admin || (auth.alcances.moderar_chat && auth.alcances.moderar_chat !== "propio" &&
    d.equipos.some(t => auth.equipos.some(e => e.id === t && e.permisos.includes("moderar_chat")))));
  const RE_MENCION = /(^|[^\w@.])@([a-z0-9._-]{3,40})/gi;
  // Usuarios activos mencionados en un texto (@usuario)
  const mencionesEn = (raw, texto) => unicos([...String(texto || "").matchAll(RE_MENCION)].map(m => m[2].toLowerCase().replace(/[.]+$/, "")))
    .map(un => raw.usuarios.find(u => u.username === un && u.estado === "activo")).filter(Boolean);
  // @equipo (código en minúsculas: @iptv, @noc-fija): avisa a sus integrantes, salvo a los jefes que están en varios equipos
  const alias = t => t.codigo.toLowerCase();
  const equiposEn = (raw, texto) => unicos([...String(texto || "").matchAll(RE_MENCION)].map(m => m[2].toLowerCase().replace(/[.]+$/, "")))
    .map(a => raw.equipos.find(t => t.estado === "activo" && alias(t) === a)).filter(Boolean);
  const jefeMultiEquipo = (raw, u) => !!rolDef(raw, u.rol)?.puede_ser_responsable && activosDe(raw, u.id).length > 1;
  const avisadosPorEquipo = (raw, t) => delEquipo(raw, t.id).map(m => usuario(raw, m.user_id)).filter(u => u && u.estado === "activo" && !jefeMultiEquipo(raw, u));
  const enlaceDebate = (id, mid) => `debate.html?id=${encodeURIComponent(id)}${mid ? "#m-" + mid : ""}`;
  const resumen = t => { const s = txt(t).replace(/\s+/g, " "); return s.length > 80 ? s.slice(0, 79) + "…" : s; };

  function accionesDebate(raw, auth, d, yo){
    const out = [], A = (accion, etiqueta, requiere = []) => out.push({ accion, etiqueta, requiere });
    if (!auth || d.estado !== "abierto") return out;
    if (!yo) A("unirse", "Unirme al chat");
    else A("salir", "Salir del chat");
    if (modera(auth, d)) A("cerrar", "Cerrar chat", ["justificacion"]);
    return out;
  }

  // Fijar: participante que puede escribir. Quitar el fijado: quien lo fijó, el autor o un moderador.
  const puedeFijar = (raw, auth, d) => d.estado === "abierto" && !!participacion(raw, d.id, auth.id) && tiene(auth, "escribir_chat");
  function vistaMensaje(raw, auth, d, m){
    const u = usuario(raw, m.user_id), borrado = !!m.eliminado_en, fijado = !!m.fijado && !borrado;
    const puedeBorrar = m.tipo !== "sistema" && !borrado && d.estado === "abierto" &&
      ((m.user_id === auth.id && tiene(auth, "escribir_chat")) || modera(auth, d));
    const acciones = [];
    if (m.tipo !== "sistema" && !borrado) {
      if (!fijado && puedeFijar(raw, auth, d)) acciones.push({ accion:"fijar", etiqueta:"Fijar", requiere:[] });
      if (fijado && d.estado === "abierto" && (m.fijado_por === auth.id || m.user_id === auth.id || modera(auth, d)) && tiene(auth, "escribir_chat"))
        acciones.push({ accion:"desfijar", etiqueta:"Quitar fijado", requiere:[] });
    }
    if (puedeBorrar) acciones.push({ accion:"eliminar", etiqueta:"Eliminar", requiere:[] });
    return {
      id:m.id, tipo:m.tipo, autor: u ? { id:u.id, nombre:u.nombre, rol:u.rol } : null, mio: m.user_id === auth.id,
      texto: borrado ? null : (m.texto ?? null), adjunto: borrado || !m.adjunto ? null : { ...m.adjunto },
      creado_en:iso(m.creado_en), eliminado:borrado, eliminado_por: borrado ? ref(usuario(raw, m.eliminado_por)) : null,
      fijado, fijado_por: fijado ? ref(usuario(raw, m.fijado_por)) : null, fijado_en: fijado ? iso(m.fijado_en) : null,
      menciones: borrado ? [] : arr(m.menciones).map(id => usuario(raw, id)).filter(Boolean).map(u => ({ id:u.id, username:u.username, nombre:u.nombre })),
      menciones_equipos: borrado ? [] : arr(m.menciones_equipos).map(id => equipo(raw, id)).filter(Boolean).map(t => ({ id:t.id, alias:alias(t), nombre:t.nombre })),
      me_mencionan: !borrado && (arr(m.menciones).includes(auth.id) ||
        arr(m.menciones_equipos).some(tid => { const t = equipo(raw, tid); return t && m.user_id !== auth.id && avisadosPorEquipo(raw, t).some(u => u.id === auth.id); })),
      acciones
    };
  }

  // Datos del INC para tenerlos a mano dentro del debate
  function vistaIncidente(raw, d, auth = null){
    const i = incidenteDe(raw, d.inc);
    const prioridad = i?.prioridad ?? d.prioridad ?? null;
    return {
      inc:d.inc, titulo:i?.titulo || d.titulo, prioridad, severidad: prioridad == null ? null : sevDe(raw, prioridad), categoria: vistaCategoria(raw, prioridad),
      sla: i ? slaDe(raw, i) : null, puede_cambiar_categoria: i ? puedeCambiarCat(raw, auth, i) : false, puede_cerrar: i ? puedeCerrarInc(raw, auth, i) : false,
      abierto:!!i, inicio:iso(i?.inicio), afectados:i?.afectados ?? null, descripcion: txt(i?.descripcion) || null,
      servicios: arr(i?.servicios).map(id => { const s = raw.servicios.find(x => x.id === id); return { id, nombre:s?.nombre || id, red:s?.red || null }; }),
      puedo_sumar_equipo: equiposParaSumar(raw, auth, i), enterado: equiposEnterado(raw, auth, i),
      equipos: i ? equiposInc(raw, auth, i) : d.equipos.map(id => ({ id, nombre:equipo(raw, id)?.nombre || null, responsable:ref(usuario(raw, responsable(raw, id)?.user_id)), acciones:[] }))
    };
  }

  function vistaDebate(raw, auth, d, completo = false){
    const parts = participantes(raw, d.id), yo = parts.find(p => p.user_id === auth.id) || null, msgs = mensajesDe(raw, d.id);
    const reales = msgs.filter(m => m.tipo !== "sistema" && !m.eliminado_en);
    const noLeidos = yo ? reales.filter(m => m.user_id !== auth.id && (!yo.leido_hasta || m.creado_en > yo.leido_hasta)).length : 0;
    const ult = reales.at(-1);
    const puedeLeer = !!yo || auth.es_admin;
    const base = {
      id:d.id, inc:d.inc, titulo:d.titulo, prioridad:incidenteDe(raw, d.inc)?.prioridad ?? d.prioridad ?? null,
      categoria:vistaCategoria(raw, incidenteDe(raw, d.inc)?.prioridad ?? d.prioridad), estado:d.estado, estado_txt:ESTADO_DEB_TXT[d.estado] || d.estado,
      inc_abierto: !!incidenteDe(raw, d.inc), equipos: d.equipos.map(id => ({ id, nombre:equipo(raw, id)?.nombre || null })),
      abierto_por:ref(usuario(raw, d.abierto_por)), abierto_en:iso(d.abierto_en),
      participantes_total:parts.length, mensajes_total:reales.length, fijados_total:reales.filter(m => m.fijado).length, soy_participante:!!yo, no_leidos:noLeidos,
      ultimo: ult && puedeLeer ? { autor:usuario(raw, ult.user_id)?.nombre || null, texto: ult.texto ? (ult.tipo === "nota" ? "📝 " : "") + resumen(ult.texto) : (ult.adjunto ? `📎 ${ult.adjunto.nombre}` : ""), en:iso(ult.creado_en) } : null,
      acciones:accionesDebate(raw, auth, d, yo)
    };
    if (!completo) return base;
    return {
      ...base, puede_leer:puedeLeer,
      puede_escribir: !!yo && d.estado === "abierto" && tiene(auth, "escribir_chat"),
      puede_adjuntar: !!yo && d.estado === "abierto" && tiene(auth, "escribir_chat") && tiene(auth, "subir_adjunto"),
      participantes: parts.map(p => ({ p, u:usuario(raw, p.user_id) })).filter(x => x.u)
        .sort((a, b) => nivel(raw, a.u.rol) - nivel(raw, b.u.rol) || porNombre(a.u, b.u))
        .map(({ p, u }) => ({ id:u.id, nombre:u.nombre, rol:u.rol, origen:p.origen, unido_en:iso(p.unido_en), es_yo:u.id === auth.id })),
      mensajes: puedeLeer ? msgs.map(m => vistaMensaje(raw, auth, d, m)) : [],
      fijados: puedeLeer ? msgs.filter(m => m.fijado && !m.eliminado_en).sort((a, b) => String(b.fijado_en).localeCompare(String(a.fijado_en)))
        .map(m => vistaMensaje(raw, auth, d, m)) : [],
      puede_notas: !!yo && d.estado === "abierto" && tiene(auth, "escribir_chat"),
      puede_convocar: !!yo && d.estado === "abierto" && tiene(auth, "escribir_chat"),
      // Para el autocompletado de @menciones y para convocar
      mencionables: raw.usuarios.filter(u => u.estado === "activo" && u.id !== auth.id).sort(porNombre)
        .map(u => ({ id:u.id, username:u.username, nombre:u.nombre, rol:u.rol, participante:parts.some(p => p.user_id === u.id),
          equipos: activosDe(raw, u.id).map(m => ({ nombre:equipo(raw, m.team_id).nombre, es_responsable:!!m.es_responsable }))
            .sort((a, b) => Number(b.es_responsable) - Number(a.es_responsable) || a.nombre.localeCompare(b.nombre, "es")) })),
      equipos_mencionables: raw.equipos.filter(t => t.estado === "activo").sort(porNombre).map(t => {
        const avisados = avisadosPorEquipo(raw, t).filter(u => u.id !== auth.id);
        const jefes = delEquipo(raw, t.id).map(m => usuario(raw, m.user_id)).filter(u => u && u.estado === "activo" && jefeMultiEquipo(raw, u));
        return { id:t.id, alias:alias(t), nombre:t.nombre, avisados:avisados.length, sin_aviso:jefes.map(u => u.nombre) };
      }),
      equipos_convocables: raw.equipos.filter(t => t.estado === "activo").sort(porNombre)
        .map(t => ({ id:t.id, nombre:t.nombre, pendientes:delEquipo(raw, t.id).filter(m => usuario(raw, m.user_id)?.estado === "activo" && !parts.some(p => p.user_id === m.user_id)).length })),
      incidente: vistaIncidente(raw, d, auth),
      cerrado_por: d.cerrado_por ? ref(usuario(raw, d.cerrado_por)) : null, motivo_cierre:d.motivo_cierre ?? null
    };
  }

  const mensajeSistema = (k, debateId, texto) => k.plan.mensajes_ins.push({ id:k.id(), debate_id:debateId, user_id:k.auth?.id || null, tipo:"sistema", texto, adjunto:null });

  /* =====================================================================
     INC POR EQUIPO: TOMAR / RECONOCER Y ESCALAMIENTO
     Cada equipo del INC tiene su estado (pendiente → reconocido). Mientras siga
     "pendiente", nadie lo tomó: el motor (WF20) avisa nivel por nivel según la matriz.
     A quién se puede molestar lo decide CADA USUARIO (su horario de avisos): la matriz no lo pisa.
     ===================================================================== */
  /* ---------- Clasificación operativa de INC (configurable) ----------
     Categoría = Prioridad × INC Grave. "p" es el orden (1 = más urgente) y es lo que guarda el INC en "prioridad".
     El Administrador puede agregar o modificar prioridades, valores de "INC Grave" y categorías (config clasificacion_inc). */
  const CLASIF_BASE = {
    prioridades:[ { id:"critica", nombre:"Crítica", severidad:"crit" }, { id:"alta", nombre:"Alta", severidad:"warn" } ],
    graves:[ { id:"si", nombre:"Sí", mayor:"si" }, { id:"posible", nombre:"Posible", mayor:"posible" }, { id:"no", nombre:"No", mayor:"no" } ],
    categorias:[
      { p:1, nombre:"Crítico Mayor",     prioridad:"critica", grave:"si",      sla_min:60 },
      { p:2, nombre:"Crítico Potencial", prioridad:"critica", grave:"posible", sla_min:120 },
      { p:3, nombre:"Crítico Menor",     prioridad:"critica", grave:"no",      sla_min:240 },
      { p:4, nombre:"Alto Mayor",        prioridad:"alta",    grave:"si",      sla_min:480 },
      { p:5, nombre:"Alto Potencial",    prioridad:"alta",    grave:"posible", sla_min:720 },
      { p:6, nombre:"Alto Menor",        prioridad:"alta",    grave:"no",      sla_min:1440 } ],
    sla_riesgo_pct:0.8      // "en riesgo" al 80 % del tiempo de SLA
  };
  const clasificacion = raw => raw.config?.clasificacion_inc || CLASIF_BASE;
  const catDe = (raw, p) => clasificacion(raw).categorias.find(c => c.p === Number(p)) || null;
  const sevDe = (raw, p) => { const c = catDe(raw, p);
    return c ? clasificacion(raw).prioridades.find(x => x.id === c.prioridad)?.severidad || "warn" : Number(p) <= Number(raw.config?.prioridad_critica ?? 3) ? "crit" : "warn"; };
  const mayorDe = (raw, p) => { const c = catDe(raw, p); return c ? clasificacion(raw).graves.find(g => g.id === c.grave)?.mayor || "no" : "no"; };
  const pDesde = (raw, prioridad, grave) => clasificacion(raw).categorias.find(c => c.prioridad === prioridad && c.grave === grave)?.p ?? null;
  function vistaCategoria(raw, p){
    const c = catDe(raw, p), C = clasificacion(raw);
    if (!c) return { p:p == null ? null : Number(p), nombre:p == null ? "—" : `P${p}`, prioridad:null, grave:null, severidad:sevDe(raw, p), mayor:"no" };
    return { p:c.p, nombre:c.nombre, prioridad:C.prioridades.find(x => x.id === c.prioridad)?.nombre || c.prioridad,
             grave:C.graves.find(x => x.id === c.grave)?.nombre || c.grave, severidad:sevDe(raw, p), mayor:mayorDe(raw, p) };
  }
  const nombreCat = (raw, p) => catDe(raw, p)?.nombre || `P${p}`;
  const etiquetaCat = (raw, p) => `${nombreCat(raw, p)} (P${p})`;

  // SLA del INC: desde su inicio, con los minutos de su categoría actual (si cambia la categoría, se recalcula)
  function slaDe(raw, i, ahora = raw.ahora || Date.now()){
    const ini = Date.parse(i?.inicio), p = Number(i?.prioridad);
    const min = Number(catDe(raw, p)?.sla_min) || Number(raw.config?.sla_minutos?.[p]) || 0;
    if (!ini || !min) return null;
    const t = new Date(ahora).getTime(), vence = ini + min * 60000;
    const pct = Number(clasificacion(raw).sla_riesgo_pct ?? raw.config?.sla_riesgo_pct ?? 0.8);
    return { minutos:min, vence_en:new Date(vence).toISOString(), vencido: t >= vence, riesgo: t - ini >= min * 60000 * pct,
             restante_min: Math.round((vence - t) / 60000) };
  }
  // ¿Hay algún equipo del INC escalando (nivel 1 o más avisado) sin que nadie lo tome?
  const escaladoInc = (raw, i) => arr(i.equipos).some(t => incEquipo(raw, i.inc, t).estado_equipo === "pendiente" && (corridaDe(raw, i.inc, t)?.nivel_actual || 0) >= 1);
  const puedeCambiarCat = (raw, auth, i) => !!auth && arr(i.equipos).some(t => puede(auth, "editar_inc", { team_id:t }, raw));
  // Jefes/Gestores y Administradores conducen: no toman INC (lo toma un Operador), pero son los que lo cierran
  const jefeOMas = (raw, auth) => !!auth && (auth.es_admin || !!rolDef(raw, auth.rol)?.puede_ser_responsable);
  // Los INC reales (origen n8n) se cierran en la herramienta: su estado lo manda la sincronización (SQL 034)
  // INC cerrado en el NOC que volvió a entrar abierto por la API (SQL 035): deciden Jefes de sus equipos y Administradores
  const puedeDecidirReingreso = (raw, auth, rg) => !!auth && (auth.es_admin
    || (jefeOMas(raw, auth) && arr(rg.equipos).some(t => puede(auth, "reabrir_inc", { team_id:t }, raw))));
  const vistaReingreso = (raw, rg) => ({ id:rg.id, inc:rg.inc, titulo:rg.titulo || null, prioridad:rg.prioridad ?? null,
    categoria: rg.prioridad != null ? vistaCategoria(raw, rg.prioridad) : null, estado_nuevo:rg.estado_nuevo || "abierto",
    detectado_en:iso(rg.detectado_en), cerrado_en:iso(rg.cerrado_en), equipos:arr(rg.equipos).map(t => equipo(raw, t)?.nombre || t) });
  const puedeCerrarInc = (raw, auth, i) => !!auth && i.origen !== "n8n" && (auth.es_admin
    || (jefeOMas(raw, auth) && arr(i.equipos).some(t => puede(auth, "cerrar_inc", { team_id:t }, raw))));

  // POST /incidentes/:inc/categoria { prioridad_tipo, grave, motivo } — WF49c: la categoría de un INC puede cambiar
  function cambiarCategoriaInc(e, auth, raw){
    const k = contexto(e, auth, raw, "incidente"), b = e.body, inc = txt(e.params.inc).toUpperCase();
    const no = sinSesion(k); if (no) return no;
    const i = incidenteDe(raw, inc);
    if (!i) return k.fallo(404, "INC_INEXISTENTE", "El incidente no existe o ya no está abierto");
    k.team_id = i.equipos[0] || null;
    if (!puedeCambiarCat(raw, auth, i)) return k.fallo(403, "SIN_PERMISO", "Tu rol no permite cambiar la categoría de este incidente");
    const motivo = txt(b.motivo).slice(0, 300);
    if (motivo.length < 5) return k.fallo(422, "MOTIVO_REQUERIDO", "Contá por qué cambia la categoría (mínimo 5 caracteres)");
    const p = b.prioridad_tipo != null ? pDesde(raw, txt(b.prioridad_tipo), txt(b.grave)) : Number(b.prioridad);
    if (!catDe(raw, p)) return k.fallo(400, "PRIORIDAD_INVALIDA", "Elegí una prioridad y un valor de INC Grave que formen una categoría");
    const antes = Number(i.prioridad);
    if (p === antes) return k.exito(200, { tipo:"incidente", inc }, { sin_cambios:true });
    k.plan.incidentes_upd.push({ inc, prioridad:p, grave:mayorDe(raw, p) });
    const sube = p < antes, flecha = sube ? "⬆️" : "⬇️";
    const sla = slaDe(raw, { ...i, prioridad:p }, k.ahora);
    k.audEquipos("INCIDENTE_CATEGORIA_CAMBIADA", "incidente", inc, i.equipos,
      { antes:{ prioridad:antes, categoria:nombreCat(raw, antes) }, despues:{ prioridad:p, categoria:nombreCat(raw, p), sla_vence:sla?.vence_en || null } }, { justificacion:motivo });
    const texto = `${flecha} ${auth.nombre} cambió la categoría: ${etiquetaCat(raw, antes)} → ${etiquetaCat(raw, p)}. Motivo: ${motivo}`;
    const d = arr(raw.debates).find(x => x.inc === inc && x.estado === "abierto");
    if (d) mensajeSistema(k, d.id, texto);
    // Avisa a los integrantes de los equipos del INC y a quienes participan del debate
    const avisar = unicos([...i.equipos.flatMap(t => delEquipo(raw, t).map(m => m.user_id)), ...(d ? participantes(raw, d.id).map(x => x.user_id) : [])])
      .filter(id => usuario(raw, id)?.estado === "activo");
    k.notificar(avisar, `${flecha} ${inc} ahora es ${etiquetaCat(raw, p)}`, `Antes: ${etiquetaCat(raw, antes)} · ${auth.nombre}: ${motivo}${sla ? ` · SLA ${sla.vencido ? "vencido" : "vence " + new Date(sla.vence_en).toISOString()}` : ""}`,
      i.equipos[0] || null, ["app", "email"], { tipo:"inc_cambio", enlace: d ? enlaceDebate(d.id) : "incidentes.html" });
    return k.exito(200, { tipo:"incidente", inc });
  }

  // GET /clasificacion — WF49a (todos: arma formularios y etiquetas)
  function verClasificacion(e, auth, raw){
    const k = contexto(e, auth, raw, "config");
    const no = sinSesion(k); if (no) return no;
    const enUso = unicos(arr(raw.incidentes).map(i => Number(i.prioridad)));
    return k.lectura({ ...JSON.parse(JSON.stringify(clasificacion(raw))), en_uso:enUso, puede_editar:auth.es_admin });
  }
  // PUT /clasificacion { prioridades, graves, categorias, justificacion } — WF49b (solo Administrador)
  function editarClasificacion(e, auth, raw){
    const k = contexto(e, auth, raw, "config"), b = e.body;
    const no = sinSesion(k); if (no) return no;
    if (!auth.es_admin) return k.fallo(403, "SOLO_ADMIN", "Solo el Administrador puede cambiar la clasificación de INC");
    if (k.just.length < 10) return k.fallo(422, "JUSTIFICACION_REQUERIDA", "Indicá una justificación (mínimo 10 caracteres)");
    const slug = t => txt(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const lista = (xs, campo, valores, max) => {
      const out = [], ids = new Set();
      for (const x of arr(xs)) {
        const nombre = txt(x.nombre).slice(0, 40), id = slug(x.id || nombre);
        if (!nombre || !id) return `Falta el nombre en ${campo === "severidad" ? "una prioridad" : "un valor de INC Grave"}`;
        if (ids.has(id)) return `"${nombre}" está repetido`;
        if (!valores.includes(x[campo])) return `"${nombre}": valor inválido`;
        ids.add(id); out.push({ id, nombre, [campo]:x[campo] });
      }
      if (!out.length || out.length > max) return `Tiene que haber entre 1 y ${max}`;
      return out;
    };
    const prioridades = lista(b.prioridades, "severidad", ["crit", "warn"], 10);
    if (typeof prioridades === "string") return k.fallo(422, "CLASIFICACION_INVALIDA", "Prioridades: " + prioridades);
    const graves = lista(b.graves, "mayor", ["si", "posible", "no"], 10);
    if (typeof graves === "string") return k.fallo(422, "CLASIFICACION_INVALIDA", "INC Grave: " + graves);
    const pid = new Map(arr(b.prioridades).map((x, j) => [x.id || x.nombre, prioridades[j].id]));
    const gid = new Map(arr(b.graves).map((x, j) => [x.id || x.nombre, graves[j].id]));
    const categorias = [], nombres = new Set(), combos = new Set();
    for (const [j, c] of arr(b.categorias).entries()) {
      const nombre = txt(c.nombre).slice(0, 40), prioridad = pid.get(c.prioridad) || c.prioridad, grave = gid.get(c.grave) || c.grave;
      if (!nombre) return k.fallo(422, "CLASIFICACION_INVALIDA", `Categoría ${j + 1}: falta el nombre`);
      if (nombres.has(nombre.toLowerCase())) return k.fallo(422, "CLASIFICACION_INVALIDA", `La categoría "${nombre}" está repetida`);
      if (!prioridades.some(x => x.id === prioridad) || !graves.some(x => x.id === grave)) return k.fallo(422, "CLASIFICACION_INVALIDA", `"${nombre}": elegí una prioridad y un valor de INC Grave existentes`);
      if (combos.has(prioridad + "|" + grave)) return k.fallo(422, "CLASIFICACION_INVALIDA", `"${nombre}": esa combinación de prioridad e INC Grave ya tiene categoría`);
      nombres.add(nombre.toLowerCase()); combos.add(prioridad + "|" + grave);
      const sla_min = Math.trunc(Number(c.sla_min ?? catDe(raw, j + 1)?.sla_min ?? 1440));
      if (!(sla_min >= 5 && sla_min <= 43200)) return k.fallo(422, "CLASIFICACION_INVALIDA", `"${nombre}": el SLA debe ser de 5 a 43200 minutos`);
      categorias.push({ p:j + 1, nombre, prioridad, grave, sla_min });       // el orden de la lista define P1, P2…
    }
    if (!categorias.length || categorias.length > 30) return k.fallo(422, "CLASIFICACION_INVALIDA", "Tiene que haber entre 1 y 30 categorías");
    // Un INC abierto guarda su P#: esa P# tiene que seguir significando lo mismo (se puede renombrar, no cambiar de combinación)
    const antes = clasificacion(raw);
    for (const p of unicos(arr(raw.incidentes).map(i => Number(i.prioridad)))) {
      const a = antes.categorias.find(c => c.p === p), n = categorias.find(c => c.p === p);
      if (a && (!n || n.prioridad !== a.prioridad || n.grave !== a.grave))
        return k.fallo(409, "CATEGORIA_EN_USO", `Hay INC abiertos en P${p} (${a.nombre}): esa posición no puede cambiar de combinación ni quitarse mientras estén abiertos`, { p });
    }
    const sla_riesgo_pct = Number(b.sla_riesgo_pct ?? antes.sla_riesgo_pct ?? 0.8);
    if (!(sla_riesgo_pct >= 0.3 && sla_riesgo_pct <= 0.99)) return k.fallo(422, "CLASIFICACION_INVALIDA", "El aviso de SLA en riesgo debe estar entre el 30 % y el 99 %");
    const nueva = { prioridades, graves, categorias, sla_riesgo_pct };
    if (igual(antes, nueva)) return k.exito(200, { tipo:"clasificacion" }, { sin_cambios:true });
    k.plan.config_upd.push({ clave:"clasificacion_inc", valor:nueva });
    k.aud("CONFIG_CLASIFICACION_MODIFICADA", "config", "clasificacion_inc", null, { antes, despues:nueva });
    return k.exito(200, { tipo:"clasificacion" });
  }

  /* ---------- Catálogo de servicios (Configuración → Servicios) ---------- */
  const ICONOS_SERVICIO = ["red", "tv", "play", "telefono", "antena", "mensaje", "server", "grafico"];
  const vistaServicio = (raw, s) => ({ id:s.id, nombre:s.nombre, red:s.red, grupo:s.grupo ?? null, icono:s.icono || "server", metodo:s.metodo || "inc",
    activo:s.activo !== false, equipos:arr(raw.service_teams).filter(x => x.service_id === s.id).map(x => equipo(raw, x.team_id)).filter(Boolean)
      .map(t => ({ id:t.id, codigo:t.codigo, nombre:t.nombre })),
    inc_abiertos:arr(raw.incidentes).filter(i => arr(i.servicios).includes(s.id)).length });
  // Equipo que atiende automáticamente cada red (config "equipo_por_red": { "Red Fija":"VOC", "Red Móvil":"SOC" })
  const equipoDeRed = (raw, red) => {
    const cod = (raw.config?.equipo_por_red || {})[red];
    return cod ? arr(raw.equipos).find(t => t.codigo === cod && t.estado === "activo") || null : null;
  };
  // GET /servicios — WF50a (todos: lista de servicios con su red)
  function verServicios(e, auth, raw){
    const k = contexto(e, auth, raw, "config");
    const no = sinSesion(k); if (no) return no;
    const servicios = arr(raw.servicios).slice().sort((a, b) => String(a.red).localeCompare(String(b.red), "es") || porNombre(a, b)).map(s => vistaServicio(raw, s));
    const redes = unicos(servicios.map(s => s.red));
    return k.lectura({ servicios, redes, iconos:ICONOS_SERVICIO, puede_editar:auth.es_admin,
      equipo_por_red: Object.fromEntries(redes.map(r => { const t = equipoDeRed(raw, r); return [r, t ? { id:t.id, codigo:t.codigo, nombre:t.nombre } : null]; })) });
  }
  // POST /servicios { id?, nombre, red, grupo, icono, activo, eliminar, justificacion } — WF50b (solo Administrador)
  //   sin id: alta · con id: modificación (activo:false lo saca del tablero) · eliminar:true lo borra
  //   (solo sin INC abiertos; si tiene INC en el historial, PostgreSQL lo rechaza y hay que desactivarlo)
  function guardarServicio(e, auth, raw){
    const k = contexto(e, auth, raw, "config"), b = e.body;
    const no = sinSesion(k); if (no) return no;
    if (!auth.es_admin) return k.fallo(403, "SOLO_ADMIN", "Solo el Administrador puede cambiar los servicios");
    const slug = t => txt(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    const actual = b.id ? arr(raw.servicios).find(s => s.id === txt(b.id)) : null;
    if (b.id && !actual) return k.fallo(404, "SERVICIO_INEXISTENTE", "El servicio no existe");
    if (b.eliminar === true) {
      if (!actual) return k.fallo(422, "SERVICIO_REQUERIDO", "Indicá qué servicio eliminar");
      const abiertos = vistaServicio(raw, actual).inc_abiertos;
      if (abiertos) return k.fallo(409, "SERVICIO_EN_USO", `${actual.nombre} tiene ${abiertos} INC abierto(s): no se puede eliminar. Sacalo del tablero (desactivar) o esperá a que se cierren.`);
      k.plan.catalogo_servicios.push({ id:actual.id, eliminar:true });
      k.aud("SERVICIO_ELIMINADO", "servicio", actual.id, null, { antes:{ id:actual.id, nombre:actual.nombre, red:actual.red, activo:actual.activo !== false }, despues:null });
      return k.exito(200, { tipo:"servicio", id:actual.id }, { eliminado:true });
    }
    const nombre = txt(b.nombre ?? actual?.nombre).slice(0, 40), red = txt(b.red ?? actual?.red).slice(0, 40);
    const grupo = txt(b.grupo ?? actual?.grupo).slice(0, 40) || null, icono = txt(b.icono ?? actual?.icono) || "server";
    if (nombre.length < 2) return k.fallo(422, "NOMBRE_REQUERIDO", "Indicá el nombre del servicio");
    if (!red) return k.fallo(422, "RED_REQUERIDA", "Indicá la red (por ejemplo Red Fija o Red Móvil)");
    if (!ICONOS_SERVICIO.includes(icono)) return k.fallo(422, "ICONO_INVALIDO", "Ícono inválido");
    const repetido = arr(raw.servicios).find(s => s.id !== actual?.id && txt(s.nombre).toLowerCase() === nombre.toLowerCase() && txt(s.red).toLowerCase() === red.toLowerCase());
    if (repetido) return k.fallo(409, "SERVICIO_EXISTE", `Ya existe "${repetido.nombre}" en ${repetido.red}${repetido.activo === false ? " (desactivado: activalo desde la lista)" : ""}`);
    const id = actual ? actual.id : slug(nombre);
    if (!id) return k.fallo(422, "NOMBRE_REQUERIDO", "El nombre tiene que tener letras o números");
    if (!actual && arr(raw.servicios).some(s => s.id === id)) return k.fallo(409, "SERVICIO_EXISTE", `Ya existe un servicio con el código "${id}"`);
    const activo = b.activo === undefined ? actual?.activo !== false : b.activo !== false;
    const nuevo = { id, nombre, red, grupo, icono, metodo:actual?.metodo || "inc", activo };
    const antes = actual ? { id:actual.id, nombre:actual.nombre, red:actual.red, grupo:actual.grupo ?? null, icono:actual.icono || "server", metodo:actual.metodo || "inc", activo:actual.activo !== false } : null;
    if (antes && igual(antes, nuevo)) return k.exito(200, { tipo:"servicio", id }, { sin_cambios:true });
    k.plan.catalogo_servicios.push(nuevo);
    // Asignación automática: el equipo de la red atiende el servicio (y con él, todos sus INC)
    const deRed = activo ? equipoDeRed(raw, red) : null;
    const asignado = deRed && !arr(raw.service_teams).some(x => x.service_id === id && x.team_id === deRed.id) ? deRed : null;
    if (asignado) {
      k.plan.servicios_ins.push({ service_id:id, team_id:asignado.id });
      k.aud("EQUIPO_SERVICIOS_MODIFICADOS", "team", asignado.id, asignado.id, { antes:null, despues:[id] }, { justificacion:`Asignación automática por red (${red})` });
    }
    k.aud(actual ? (antes.activo !== activo ? (activo ? "SERVICIO_ACTIVADO" : "SERVICIO_DESACTIVADO") : "SERVICIO_MODIFICADO") : "SERVICIO_CREADO",
      "servicio", id, null, { antes, despues:nuevo });
    return k.exito(actual ? 200 : 201, { tipo:"servicio", id }, asignado ? { asignado_a:asignado.nombre } : {});
  }

  /* ---------- Política de notificaciones por perfil ----------
     Qué tipos de aviso recibe cada rol y por qué canales. La define el Administrador; se aplica a TODAS
     las notificaciones (también a las del escalamiento). El horario personal se suma encima. */
  const TIPOS_NOTIF = [
    ["escalamiento", "Escalamientos de INC (nadie lo tomó)"], ["convocatoria_general", "Convocatoria general"],
    ["convocatoria", "Convocatoria a un chat de INC"], ["mencion", "Menciones (@usuario y @equipo)"],
    ["inc_cambio", "Cambio de categoría de un INC"], ["sla", "SLA en riesgo o vencido"],
    ["general", "Avisos (INC tomado, cambios de equipo o de matriz…)"]];
  const TODOS_CANALES = ["app", "email", "telegram", "llamada"];
  const POLITICA_BASE = {
    ADMIN:    { escalamiento:TODOS_CANALES, convocatoria_general:["app", "email"], convocatoria:["app", "email"], mencion:["app"], inc_cambio:["app", "email"], sla:["app", "email"], general:["app"] },
    GESTOR:   { escalamiento:TODOS_CANALES, convocatoria_general:["app", "email"], convocatoria:["app", "email"], mencion:["app"], inc_cambio:["app", "email"], sla:["app", "email"], general:["app"] },
    OPERADOR: { escalamiento:["app", "telegram", "llamada"], convocatoria_general:["app", "email"], convocatoria:["app"], mencion:["app"], inc_cambio:["app"], sla:["app"], general:["app"] },
    LECTURA:  { escalamiento:[], convocatoria_general:["app"], convocatoria:["app"], mencion:["app"], inc_cambio:["app"], sla:[], general:[] }
  };
  const politicaNotif = raw => Object.fromEntries(raw.roles.map(r => [r.codigo, Object.fromEntries(TIPOS_NOTIF.map(([t]) =>
    [t, arr(raw.config?.politica_notificaciones?.[r.codigo]?.[t] ?? POLITICA_BASE[r.codigo]?.[t] ?? ["app"])]))]));
  // La llamada necesita un teléfono cargado; el resto de los canales no tiene requisitos en la app
  const puedeRecibir = (u, canal) => canal !== "llamada" || !!u.telefono;
  /* ---------- Secuencia de avisos por destinatario ----------
     Cada destinatario de un nivel tiene sus pasos [{ canal, min }] (min = minutos desde que arranca el nivel).
     Una matriz vieja sin pasos: todos sus canales a los 0 minutos (igual que antes).
     Cada persona puede SUMAR pasos propios (Perfil → Mi secuencia de avisos): nunca sacan los de la matriz.
     Si un canal está en los dos, vale el minuto más temprano. Después filtran su perfil (política) y su teléfono. */
  const MAX_PASOS = 5;
  const pasosDestino = (n, d) => arr(d.pasos).length ? arr(d.pasos) : arr(n.canales).map(c => ({ canal:c, min:0 }));
  const destinosDe = (u, n) => arr(n.destinos).filter(d => d.tipo === "usuario" ? d.id === u.id : d.rol === u.rol);
  const pasosPropios = u => arr(u?.disponibilidad?.pasos);
  function secuenciaPersona(raw, u, n, { conPropios = true } = {}){
    const m = new Map();
    for (const d of destinosDe(u, n)) for (const p of pasosDestino(n, d)) {
      const y = m.get(p.canal);
      if (!y || p.min < y.min) m.set(p.canal, { canal:p.canal, min:Number(p.min) || 0, origen:"matriz" });
    }
    if (!m.size) return [];                        // no es destinatario de este nivel: sus pasos propios no aplican
    if (conPropios) for (const p of pasosPropios(u)) {
      const y = m.get(p.canal);
      if (!y) m.set(p.canal, { canal:p.canal, min:Number(p.min) || 0, origen:"personal" });
      else if (p.min < y.min) y.min = Number(p.min) || 0;         // lo adelanta, pero sigue siendo de la matriz
    }
    const pol = canalesPermitidos(raw, u.rol, "escalamiento");
    return [...m.values()].sort((a, b) => a.min - b.min || TODOS_CANALES.indexOf(a.canal) - TODOS_CANALES.indexOf(b.canal))
      .map(p => ({ ...p, permitido: pol.includes(p.canal) && puedeRecibir(u, p.canal),
                   motivo: !pol.includes(p.canal) ? "Tu perfil no recibe este canal" : !puedeRecibir(u, p.canal) ? "Sin teléfono cargado" : null }));
  }
  // Pasos que de verdad se mandan: matriz + propios ∩ su perfil ∩ datos de contacto
  const secuenciaEfectiva = (raw, u, n) => secuenciaPersona(raw, u, n).filter(p => p.permitido).map(({ canal, min, origen }) => ({ canal, min, origen }));
  const canalesEfectivos = (raw, u, n) => secuenciaEfectiva(raw, u, n).map(p => p.canal);
  const canalesPermitidos = (raw, rol, tipo) => politicaNotif(raw)[rol]?.[tipo || "general"] || [];
  // Pasos propios: mismo formato que los de la matriz (0 a 5; cada canal una vez)
  function validarPasos(lista){
    if (!Array.isArray(lista)) return { error:"Indicá la lista de pasos" };
    if (lista.length > MAX_PASOS) return { error:`Como máximo ${MAX_PASOS} pasos` };
    const out = [];
    for (const p of lista) {
      const min = Number(p?.min);
      if (!TODOS_CANALES.includes(p?.canal)) return { error:"Los canales son app, email, telegram y llamada" };
      if (!Number.isInteger(min) || min < 0 || min > 1440) return { error:"Cada paso va de 0 a 1440 minutos" };
      if (out.some(q => q.canal === p.canal)) return { error:"Cada canal puede estar una sola vez" };
      out.push({ canal:p.canal, min });
    }
    return { pasos:out.sort((a, b) => a.min - b.min) };
  }
  // Saca del plan las notificaciones que el perfil del destinatario no recibe (por tipo y canal)
  function filtrarNotificaciones(raw, plan){
    if (!plan?.notificaciones?.length) return plan;
    const pol = politicaNotif(raw);
    plan.notificaciones = plan.notificaciones.filter(n => { const u = usuario(raw, n.user_id);
      return !u || (arr(pol[u.rol]?.[n.tipo || "general"]).includes(n.canal) && puedeRecibir(u, n.canal)); });
    return plan;
  }

  const ESTADO_INC_EQ_TXT = { pendiente:"Pendiente", reconocido:"Reconocido", resuelto:"Resuelto" };
  const incEquipo = (raw, inc, teamId) => arr(raw.incidentes_equipo).find(x => x.inc === inc && x.team_id === teamId)
    || { inc, team_id:teamId, incident_id:null, estado_equipo:"pendiente", asignado_id:null, colaboradores:[], reconocido_por:null, reconocido_en:null };
  const corridaDe = (raw, inc, teamId) => arr(raw.escalamientos_vivos).find(x => x.inc === inc && x.team_id === teamId) || null;
  const esCritico = (raw, p) => p != null && sevDe(raw, p) === "crit";

  // ¿Se le puede avisar ahora a esta persona? Solo cuenta su propia configuración.
  function disponible(raw, u, prioridad, ahora){
    const d = u.disponibilidad;
    if (!d || !d.horario) return true;
    if (d.criticos_siempre && esCritico(raw, prioridad)) return true;   // excepción que eligió el usuario, no la matriz
    return enHorario(d.horario, ahora) !== false;
  }
  function destinatariosNivel(raw, teamId, n){
    const ids = new Set();
    for (const d of arr(n.destinos)) {
      if (d.tipo === "rol") delEquipo(raw, teamId).forEach(m => { const u = usuario(raw, m.user_id); if (u && u.estado === "activo" && u.rol === d.rol) ids.add(u.id); });
      else { const u = usuario(raw, d.id); if (u && u.estado === "activo") ids.add(u.id); }
    }
    return [...ids].map(id => usuario(raw, id));
  }
  // Un nivel avisa solo dentro de su franja (si tiene) y solo a quienes están disponibles
  function alcanceNivel(raw, teamId, n, prioridad, ahora){
    const todos = destinatariosNivel(raw, teamId, n), personas = todos.filter(u => canalesEfectivos(raw, u, n).length);
    const en_franja = !n.horario || enHorario(n.horario, ahora) !== false;
    const disponibles = en_franja ? personas.filter(u => disponible(raw, u, prioridad, ahora)) : [];
    // Tienen la llamada en su secuencia de la matriz y en su perfil, pero no cargaron teléfono: no los llaman
    const sin_telefono = todos.filter(u => !u.telefono && canalesPermitidos(raw, u.rol, "escalamiento").includes("llamada")
      && secuenciaPersona(raw, u, n, { conPropios:false }).some(p => p.canal === "llamada"));
    return { personas, disponibles, en_franja, sin_telefono };
  }
  const textoDisponibilidad = d => {
    if (!d || !d.horario) return "Siempre";
    const DIA = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    return d.horario.franjas.map(f => `${f.dias.map(x => DIA[x]).join(" ")} ${f.desde}–${f.hasta}`).join(" · ") + (d.criticos_siempre ? " · críticos siempre" : "");
  };

  // Equipos míos que todavía no están en el INC y que puedo sumarle (permiso agregar_equipo en ese equipo)
  const equiposParaSumar = (raw, auth, i) => !auth || !i || jefeOMas(raw, auth) ? [] : auth.equipos
    .filter(x => !arr(i.equipos).includes(x.id) && equipo(raw, x.id)?.estado === "activo" && arr(x.permisos).includes("agregar_equipo"))
    .map(x => ({ id:x.id, nombre:equipo(raw, x.id)?.nombre || x.nombre || null }));

  // "Enterado" (solo Jefes, no Administradores): equipos del INC donde soy Jefe y que siguen pendientes.
  // Un toque los reconoce a todos: se detiene su escalamiento sin asignarle el INC a nadie.
  const esJefe = (raw, u) => !!u && u.rol !== "ADMIN" && !u.es_admin && !!rolDef(raw, u.rol)?.puede_ser_responsable;
  const equiposEnterado = (raw, auth, i) => !auth || !i || !esJefe(raw, auth) ? [] : arr(i.equipos)
    .filter(t => auth.equipos.some(x => x.id === t) && equipo(raw, t)?.estado === "activo"
      && incEquipo(raw, i.inc, t).estado_equipo === "pendiente" && puede(auth, "ack_inc", { team_id:t }, raw))
    .map(t => ({ id:t, nombre:equipo(raw, t)?.nombre || null }));

  function accionesIncEquipo(raw, auth, st){
    const out = [];
    if (!auth) return out;
    const ctx = { team_id:st.team_id };
    if (["pendiente", "reconocido"].includes(st.estado_equipo) && st.asignado_id !== auth.id && !jefeOMas(raw, auth) && puede(auth, "tomar_inc", ctx, raw)) {
      // Varias personas pueden trabajar el mismo INC: si alguien ya lo tiene, "Unirme" suma sin sacárselo; "Tomarlo yo" lo traspasa
      if (st.asignado_id && !arr(st.colaboradores).includes(auth.id)) out.push({ accion:"unirse", etiqueta:"Unirme" });
      out.push({ accion:"tomar", etiqueta: st.asignado_id ? "Tomarlo yo" : "Tomar" });
    }
    return out;     // "reconocer" sigue disponible por API (integraciones), pero la app solo ofrece Tomar
  }
  // Equipos de un INC abierto con su estado, quién lo tomó, cómo va el escalamiento y qué puede hacer quien mira
  function equiposInc(raw, auth, i){
    return i.equipos.map(id => {
      const t = equipo(raw, id), st = incEquipo(raw, i.inc, id), run = corridaDe(raw, i.inc, id), mx = matrizDe(raw, id);
      return {
        id, nombre:t?.nombre || null, responsable:ref(usuario(raw, responsable(raw, id)?.user_id)),
        estado:st.estado_equipo, estado_txt: st.asignado_id ? "Tomado" : ESTADO_INC_EQ_TXT[st.estado_equipo] || st.estado_equipo,
        asignado:ref(usuario(raw, st.asignado_id)), reconocido_por:ref(usuario(raw, st.reconocido_por)), reconocido_en:iso(st.reconocido_en),
        colaboradores: arr(st.colaboradores).map(uid => ref(usuario(raw, uid))).filter(Boolean),
        escalamiento: run ? { estado:run.estado, motivo:run.motivo || null, nivel:run.nivel_actual, niveles:arr(run.niveles).length,
                              proximo_en: run.estado === "esperando" ? iso(run.proximo_en) : null }
                          : { estado: mx ? "sin_iniciar" : "sin_matriz", motivo:null, nivel:0, niveles:mx?.niveles.length || 0, proximo_en:null },
        mio: !!auth && auth.equipos.some(x => x.id === id),
        acciones: accionesIncEquipo(raw, auth, st)
      };
    });
  }

  // Suma al usuario al chat del INC si todavía no participa (lo hace al unirse o sumar su equipo)
  function planSumarAlChat(k, raw, auth, inc, texto){
    const d = arr(raw.debates).find(x => x.inc === inc && x.estado === "abierto");
    if (!d) return;
    if (!participacion(raw, d.id, auth.id)) k.plan.participantes_ins.push({ id:k.id(), debate_id:d.id, user_id:auth.id, origen:"voluntario" });
    mensajeSistema(k, d.id, texto);
  }

  // "Sumar mi equipo": un equipo que no figuraba en el INC entra con quien lo suma como responsable del trabajo
  function sumarEquipoInc(k, auth, raw, i, teamId){
    const t = equipo(raw, teamId);
    if (!t || t.estado !== "activo") return k.fallo(404, "EQUIPO_INEXISTENTE", "El equipo no existe o está inactivo");
    if (i.equipos.includes(teamId)) return k.fallo(409, "EQUIPO_YA_EN_INC", `${t.nombre} ya está en el incidente`);
    if (!auth.equipos.some(x => x.id === teamId)) return k.fallo(403, "NO_ES_DE_TU_EQUIPO", "Solo podés sumar un equipo al que pertenecés");
    const p = k.permiso("agregar_equipo", { team_id:teamId }); if (p) return p;
    const asignado_id = auth.id;     // solo Operadores (los Jefes y Administradores no se suman: SOLO_OPERADORES)
    k.plan.inc_equipo_upd.push({ inc:i.inc, team_id:teamId, incident_id:null, estado_equipo:"reconocido", asignado_id, reconocido_por:auth.id, reconocido_en:k.ahora });
    k.aud("INC_EQUIPO_SUMADO", "incidente", i.inc, teamId, { antes:{ equipos:i.equipos.length }, despues:{ equipos:i.equipos.length + 1, asignado_id } });
    planSumarAlChat(k, raw, auth, i.inc, `🧩 ${auth.nombre} sumó a ${t.nombre} al incidente`);
    k.notificar(unicos([...i.equipos.map(id => responsable(raw, id)?.user_id), responsable(raw, teamId)?.user_id]).filter(id => id && id !== auth.id),
      `${i.inc} · equipo sumado`, `${auth.nombre} sumó a ${t.nombre} al incidente.`, teamId, ["app"], { tipo:"general", enlace:"incidentes.html" });
    return k.exito(200, { tipo:"incidente", inc:i.inc });
  }

  // POST /incidentes/:inc/acciones { accion: "tomar" | "reconocer" | "unirse" | "sumar_equipo", equipo_id } — WF47a
  //   tomar: me quedo con el INC (el titular anterior sigue como colaborador) · unirse: trabajo el INC junto a quien ya lo tiene
  //   sumar_equipo: mi equipo no estaba en el INC y entra
  function accionIncidente(e, auth, raw){
    const k = contexto(e, auth, raw, "incidente"), b = e.body, inc = txt(e.params.inc).toUpperCase(), teamId = txt(b.equipo_id);
    k.team_id = equipo(raw, teamId) ? teamId : null;
    const no = sinSesion(k); if (no) return no;
    const accion = txt(b.accion).toLowerCase(), PERM = { tomar:"tomar_inc", reconocer:"ack_inc", unirse:"tomar_inc", sumar_equipo:"agregar_equipo", cerrar:"cerrar_inc", reabrir:"reabrir_inc", mantener_cerrado:"reabrir_inc", enterado:"ack_inc" };
    if (!PERM[accion]) return k.fallo(400, "ACCION_INVALIDA", "La acción debe ser tomar, reconocer, unirse, sumar_equipo, enterado, cerrar, reabrir o mantener_cerrado");
    if (accion === "reabrir" || accion === "mantener_cerrado") return decidirReingreso(k, auth, raw, inc, accion);
    const i = incidenteDe(raw, inc);
    if (!i) return k.fallo(404, "INC_INEXISTENTE", "El incidente no existe o ya no está abierto");
    if (accion === "cerrar") return cerrarInc(k, auth, raw, i);
    if (accion === "enterado") return enteradoInc(k, auth, raw, i);
    if (["tomar", "unirse", "sumar_equipo"].includes(accion) && jefeOMas(raw, auth))
      return k.fallo(403, "SOLO_OPERADORES", "Los Jefes y Administradores no toman incidentes: lo toma un Operador del equipo");
    if (accion === "sumar_equipo") return sumarEquipoInc(k, auth, raw, i, teamId);
    if (!i.equipos.includes(teamId)) return k.fallo(422, "EQUIPO_INVALIDO", "Ese equipo no está en el incidente");
    const p = k.permiso(PERM[accion], { team_id:teamId }); if (p) return p;
    const t = equipo(raw, teamId), st = incEquipo(raw, inc, teamId);
    const valida = accion === "reconocer" ? st.estado_equipo === "pendiente" : accionesIncEquipo(raw, auth, st).some(a => a.accion === accion);
    if (!valida)
      return k.fallo(409, "ESTADO_INVALIDO", accion === "reconocer" ? `${t.nombre} ya reconoció este incidente` : accion === "unirse" ? "Ya estás trabajando este incidente" : "Ya lo tenés tomado vos");
    if (accion === "unirse") {
      const antes = arr(st.colaboradores);
      k.plan.inc_colaboradores_ins.push({ inc, incident_id:st.incident_id || null, team_id:teamId, user_id:auth.id });
      k.aud("INC_UNIRSE", "incidente", inc, teamId, { antes:{ colaboradores:antes }, despues:{ colaboradores:[...antes, auth.id] } }, { datos:{ titular_id:st.asignado_id || null } });
      planSumarAlChat(k, raw, auth, inc, `➕ ${auth.nombre} se unió al incidente por ${t.nombre}`);
      k.notificar(unicos([st.asignado_id, responsable(raw, teamId)?.user_id]).filter(id => id && id !== auth.id),
        `${inc} · se sumó ${auth.nombre}`, `${t.nombre}: ${auth.nombre} trabaja el incidente junto al equipo.`, teamId, ["app"], { tipo:"general", enlace:"incidentes.html" });
      return k.exito(200, { tipo:"incidente", inc });
    }
    const asignado_id = accion === "tomar" ? auth.id : (st.asignado_id || null);
    k.plan.inc_equipo_upd.push({ inc, team_id:teamId, incident_id:st.incident_id || null, estado_equipo:"reconocido", asignado_id,
      reconocido_por: st.reconocido_por || auth.id, reconocido_en: st.reconocido_en || k.ahora });
    if (accion === "tomar") {
      // El titular anterior no pierde el INC: pasa a colaborar. Si yo ya colaboraba, dejo de figurar como colaborador.
      if (st.asignado_id && st.asignado_id !== auth.id && !arr(st.colaboradores).includes(st.asignado_id))
        k.plan.inc_colaboradores_ins.push({ inc, incident_id:st.incident_id || null, team_id:teamId, user_id:st.asignado_id });
      if (arr(st.colaboradores).includes(auth.id)) k.plan.colaboradores_del.push({ user_id:auth.id, team_ids:[teamId], inc });
    }
    const run = corridaDe(raw, inc, teamId);
    if (run && run.estado === "esperando") k.plan.escalamientos_upd.push({ ...run, estado:"fin", motivo:"reconocido", proximo_en:null, fin_en:k.ahora });
    // Se corta lo que faltaba de la secuencia: pasos programados y correos o llamadas que n8n todavía no retiró
    k.plan.pasos_cancelar.push({ inc, team_id:teamId });
    k.aud(accion === "tomar" ? "INC_TOMAR" : "INC_ACK", "incidente", inc, teamId,
      { antes:{ estado:st.estado_equipo, asignado_id:st.asignado_id || null }, despues:{ estado:"reconocido", asignado_id } },
      { datos:{ nivel_escalamiento: run?.nivel_actual ?? 0 } });
    const d = arr(raw.debates).find(x => x.inc === inc && x.estado === "abierto");
    if (d) mensajeSistema(k, d.id, accion === "tomar" ? `✋ ${auth.nombre} tomó el incidente por ${t.nombre}`
                                                      : `👀 ${auth.nombre} reconoció el incidente por ${t.nombre}: se detiene el escalamiento`);
    const resp = responsable(raw, teamId);
    if (resp) k.notificar([resp.user_id], `${inc} · ${accion === "tomar" ? "tomado" : "reconocido"} por ${auth.nombre}`,
      `${t.nombre}${run?.estado === "esperando" ? ` · escalamiento detenido en el nivel ${run.nivel_actual}` : ""}`, teamId, ["app"], { tipo:"general", enlace:"incidentes.html" });
    return k.exito(200, { tipo:"incidente", inc });
  }

  // "Enterado" (Jefe): reconoce de una vez todos los equipos del INC donde es Jefe y que seguían pendientes.
  // Se detiene su escalamiento (y lo programado que faltaba), nadie queda asignado y se avisa solo por la app
  // al resto de los Jefes de los equipos del INC. Un Operador lo puede Tomar después igual.
  function enteradoInc(k, auth, raw, i){
    const inc = i.inc;
    if (!esJefe(raw, auth)) return k.fallo(403, "SOLO_JEFES", "Enterado es para los Jefes de los equipos del INC");
    const eqs = equiposEnterado(raw, auth, i);
    k.team_id = eqs[0]?.id || i.equipos.find(t => auth.equipos.some(x => x.id === t)) || null;
    if (!eqs.length) return k.fallo(409, "YA_ENTERADO", "Tus equipos de este INC ya están en Enterado (o no sos Jefe de ninguno)");
    const nombres = eqs.map(t => t.nombre).filter(Boolean).join(", ");
    for (const t of eqs) {
      const st = incEquipo(raw, inc, t.id), run = corridaDe(raw, inc, t.id);
      k.plan.inc_equipo_upd.push({ inc, team_id:t.id, incident_id:st.incident_id || null, estado_equipo:"reconocido", asignado_id:st.asignado_id || null,
        reconocido_por:auth.id, reconocido_en:k.ahora });
      if (run && run.estado === "esperando") k.plan.escalamientos_upd.push({ ...run, estado:"fin", motivo:"reconocido", proximo_en:null, fin_en:k.ahora });
      k.plan.pasos_cancelar.push({ inc, team_id:t.id });
      k.aud("INC_ENTERADO", "incidente", inc, t.id, { antes:{ estado:st.estado_equipo }, despues:{ estado:"reconocido", asignado_id:null } },
        { datos:{ nivel_escalamiento: run?.nivel_actual ?? 0 } });
    }
    const d = arr(raw.debates).find(x => x.inc === inc && x.estado === "abierto");
    if (d) mensajeSistema(k, d.id, `✅ ${auth.nombre} dio Enterado · ${nombres}: se detiene el escalamiento`);
    const jefes = unicos(i.equipos.flatMap(t => delEquipo(raw, t).map(m => m.user_id))
      .filter(id => id !== auth.id && esJefe(raw, usuario(raw, id)) && usuario(raw, id)?.estado === "activo"));
    if (jefes.length) k.notificar(jefes, `${inc} · ${auth.nombre} dio Enterado`, `${i.titulo} · ${nombres}: se detiene el escalamiento.`,
      k.team_id, ["app"], { tipo:"general", enlace:"incidentes.html" });
    return k.exito(200, { tipo:"incidente", inc }, { enterado:eqs.map(t => t.id) });
  }

  // Cerrar el INC (Jefe/Gestor de un equipo del INC, o Administrador): queda cerrado en el NOC aunque la herramienta
  // lo siga mandando abierto (SQL 033), se corta el escalamiento de todos sus equipos y se avisa a quienes lo trabajaban.
  function cerrarInc(k, auth, raw, i){
    const inc = i.inc;
    k.team_id = i.equipos[0] || null;
    if (i.origen === "n8n") return k.fallo(409, "INC_DE_LA_HERRAMIENTA", "Este INC viene de la herramienta: se cierra allá y el NOC copia su estado");
    if (!puedeCerrarInc(raw, auth, i)) return k.fallo(403, "SOLO_JEFES", "Solo los Jefes de los equipos del INC y los Administradores pueden cerrarlo");
    const motivo = txt(k.e.body.motivo || k.e.body.justificacion).slice(0, 300);
    if (motivo.length < 5) return k.fallo(422, "MOTIVO_REQUERIDO", "Contá por qué se cierra el INC (mínimo 5 caracteres)");
    k.plan.incidentes_cerrar.push({ inc, incident_id:i.id || null });
    const avisar = [];
    for (const t of i.equipos) {
      const st = incEquipo(raw, inc, t), run = corridaDe(raw, inc, t);
      if (run && run.estado === "esperando") k.plan.escalamientos_upd.push({ ...run, estado:"fin", motivo:"cerrado", proximo_en:null, fin_en:k.ahora });
      k.plan.pasos_cancelar.push({ inc, team_id:t });
      avisar.push(st.asignado_id, ...arr(st.colaboradores), responsable(raw, t)?.user_id);
    }
    k.audEquipos("INC_CERRAR", "incidente", inc, i.equipos, { antes:{ estado:i.estado || "abierto" }, despues:{ estado:"cerrado" } }, { justificacion:motivo });
    const d = arr(raw.debates).find(x => x.inc === inc && x.estado === "abierto");
    if (d) mensajeSistema(k, d.id, `🔒 ${auth.nombre} cerró el incidente. Motivo: ${motivo}`);
    const ids = unicos(avisar).filter(id => id && id !== auth.id && usuario(raw, id)?.estado === "activo");
    if (ids.length) k.notificar(ids, `${inc} · cerrado por ${auth.nombre}`, `Motivo: ${motivo}`, k.team_id, ["app"], { tipo:"general", enlace:"incidentes.html" });
    return k.exito(200, { tipo:"incidente", inc }, { cerrado:true });
  }

  // Reingreso (SQL 035): el INC que cerraron en el NOC volvió a llegar abierto por la API. Se reabre o se mantiene cerrado.
  function decidirReingreso(k, auth, raw, inc, accion){
    const rg = arr(raw.reingresos).find(x => x.inc === inc);
    if (!rg) return k.fallo(404, "SIN_CONSULTA", "Ese INC no tiene una consulta pendiente (ya la decidió otra persona)");
    k.team_id = arr(rg.equipos)[0] || null;
    if (!puedeDecidirReingreso(raw, auth, rg)) return k.fallo(403, "SOLO_JEFES", "Solo los Jefes de los equipos del INC y los Administradores pueden decidirlo");
    const reabrir = accion === "reabrir";
    k.plan.reingresos_decidir.push({ id:rg.id, decision: reabrir ? "reabrir" : "mantener" });
    k.audEquipos(reabrir ? "INC_REABIERTO" : "INC_REINGRESO_MANTENIDO_CERRADO", "incidente", inc, arr(rg.equipos),
      { antes:{ estado:"cerrado" }, despues:{ estado: reabrir ? "abierto" : "cerrado" } }, { justificacion:"Volvió a entrar abierto por la API" });
    const avisar = unicos(destinatariosReingreso(raw, rg)).filter(id => id !== auth.id);
    if (avisar.length) k.notificar(avisar, `${inc} · ${reabrir ? "reabierto" : "sigue cerrado"} por ${auth.nombre}`,
      reabrir ? "Volvió a entrar abierto por la API y se reabrió: los equipos quedan pendientes y arranca el escalamiento."
              : "Volvió a entrar abierto por la API y se decidió mantenerlo cerrado.", k.team_id, ["app"], { tipo:"general", enlace: reabrir ? "incidentes.html" : "notificaciones.html" });
    return k.exito(200, { tipo:"incidente", inc }, { decision: reabrir ? "reabrir" : "mantener" });
  }
  // A quién se consulta: Jefes (y responsables) de los equipos del INC y Administradores, activos
  const destinatariosReingreso = (raw, rg) => unicos([
    ...raw.usuarios.filter(u => u.rol === "ADMIN").map(u => u.id),
    ...arr(rg.equipos).flatMap(t => delEquipo(raw, t).filter(m => m.es_responsable || rolDef(raw, usuario(raw, m.user_id)?.rol)?.puede_ser_responsable).map(m => m.user_id))
  ]).filter(id => usuario(raw, id)?.estado === "activo");

  // PUT /me/disponibilidad — WF47b: cuándo me pueden avisar (la matriz de escalamiento no lo pisa)
  // PUT /me/telefono — WF47c: mi teléfono para el canal Llamada (vacío = no me llaman)
  function editarTelefono(e, auth, raw){
    const k = contexto(e, auth, raw, "usuario");
    const no = sinSesion(k); if (no) return no;
    const u = usuario(raw, auth.id), tel = normalizarTelefono(e.body.telefono);
    if (tel === false) return k.fallo(422, "TELEFONO_INVALIDO", ERROR_TELEFONO);
    if ((u.telefono ?? null) === tel) return k.exito(200, { tipo:"usuario", id:u.id }, { sin_cambios:true });
    k.plan.usuarios_upd.push({ id:u.id, telefono:tel });
    k.aud("USUARIO_TELEFONO_MODIFICADO", "usuario", u.id, null, { antes:{ telefono:u.telefono ?? null }, despues:{ telefono:tel } });
    return k.exito(200, { tipo:"usuario", id:u.id });
  }

  /* =====================================================================
     INGRESO (WF29) — el usuario se valida en n8n
     La clave NO llega a estas reglas: antes de llamarlas, n8n verifica la credencial y pasa
     entrada.verificacion = { credencial_ok, origen:"local"|"ldap", error? }:
       · origen "local": crypt(clave, users.password_hash) en PostgreSQL
       · origen "ldap":  bind contra el directorio de la empresa (nodo LDAP de n8n)
       · error "DIRECTORIO_NO_DISPONIBLE": el directorio no respondió (no cuenta como intento fallido)
     Las reglas deciden todo lo demás: estado, bloqueo por intentos, clave vencida, sesión y auditoría.
     ===================================================================== */
  const MSJ_CRED = "Usuario, clave o código incorrectos";
  const buscarLogin = (raw, q) => { q = txt(q).toLowerCase(); return q ? raw.usuarios.find(u => u.username === q || u.email.toLowerCase() === q) || null : null; };
  // local: clave propia (cuentas de emergencia) · ldap: clave de la empresa · codigo: sin clave, entra con un código por correo (SQL 019)
  const origenClave = u => u.origen_clave === "ldap" ? "ldap" : u.origen_clave === "codigo" ? "codigo" : "local";
  const configLogin = raw => ({ intentos:Number(raw.config?.login_bloqueo?.intentos || 5), minutos:Number(raw.config?.login_bloqueo?.minutos || 15),
    horas:Number(raw.config?.sesion_horas || 8) });

  // Qué verificador usar para un usuario (n8n lo consulta antes de verificar; sin usuario → "local", sin filtrar si existe)
  function verificadorDe(raw, usuarioOEmail){
    const u = buscarLogin(raw, usuarioOEmail);
    return { user_id:u?.id || null, origen:u ? origenClave(u) : "local", username:u?.username || null, email:u?.email || null };
  }

  // Falla de ingreso que SÍ deja registro (intentos, bloqueo, auditoría): el plan se aplica aunque la respuesta sea error
  function falloIngreso(k, http, codigo, mensaje, extra = {}){
    const r = RN.error(http, codigo, mensaje, {}, k.raw.config || {}, k.ahora);
    if (extra.detalle) r.cuerpo.error.detalle = extra.detalle;
    return { ok:false, http, cuerpo:r.cuerpo, plan:k.plan };
  }

  // POST /auth/login — WF29a  { usuario, clave }  (la clave la usa solo el verificador)
  function ingresar(e, auth, raw){
    const k = contexto(e, null, raw, "sesion"), cfg = configLogin(raw), v = e.verificacion || {};
    const q = txt(e.body.usuario).toLowerCase(), u = buscarLogin(raw, q), ahora = k.ahora;
    const audFallo = (motivo, user) => k.aud("LOGIN_FALLIDO", "usuario", user?.id || null, null, null,
      { justificacion:null, datos:{ usuario:q.slice(0, 120), motivo, origen:v.origen || null } });
    if (!q || !txt(e.body.clave)) return k.fallo(400, "DATOS_INCOMPLETOS", "Ingresá tu usuario y la clave o el código");
    if (!u || u.estado !== "activo") { audFallo(!u ? "usuario_inexistente" : "usuario_" + u.estado, u); return falloIngreso(k, 401, "CREDENCIALES_INVALIDAS", MSJ_CRED); }
    if (u.bloqueado_hasta && Date.parse(u.bloqueado_hasta) > Date.parse(ahora)) {
      const min = Math.max(1, Math.ceil((Date.parse(u.bloqueado_hasta) - Date.parse(ahora)) / 60000));
      audFallo("bloqueado", u);
      return falloIngreso(k, 423, "USUARIO_BLOQUEADO", `Demasiados intentos fallidos. Probá de nuevo en ${min} minuto${min === 1 ? "" : "s"}`, { detalle:{ minutos:min } });
    }
    if (v.error === "DIRECTORIO_NO_DISPONIBLE") {
      audFallo("directorio_no_disponible", u);
      return falloIngreso(k, 503, "DIRECTORIO_NO_DISPONIBLE", "No se pudo validar con el directorio de la empresa. Probá en unos minutos o avisá al Administrador");
    }
    if (v.origen && v.origen !== origenClave(u)) return k.fallo(500, "VERIFICADOR_INCORRECTO", "Error interno de ingreso: avisá al Administrador");
    if (v.credencial_ok !== true) {
      const n = Number(u.intentos_fallidos || 0) + 1, bloquea = n >= cfg.intentos;
      k.plan.usuarios_upd.push({ id:u.id, intentos_fallidos: bloquea ? 0 : n, bloqueado_hasta: bloquea ? masMs(ahora, cfg.minutos * 60000) : null });
      audFallo("clave_incorrecta", u);
      if (bloquea) {
        k.aud("USUARIO_BLOQUEADO", "usuario", u.id, null, { antes:null, despues:{ bloqueado_minutos:cfg.minutos } }, { justificacion:null });
        return falloIngreso(k, 423, "USUARIO_BLOQUEADO", `Demasiados intentos fallidos. Probá de nuevo en ${cfg.minutos} minutos`, { detalle:{ minutos:cfg.minutos } });
      }
      const quedan = cfg.intentos - n;
      return falloIngreso(k, 401, "CREDENCIALES_INVALIDAS", MSJ_CRED + (quedan <= 2 ? `. Te quedan ${quedan} intento${quedan === 1 ? "" : "s"}` : ""));
    }
    if (origenClave(u) === "local" && u.debe_cambiar_clave && u.clave_expira_en && Date.parse(u.clave_expira_en) <= Date.parse(ahora)) {
      audFallo("clave_temporal_vencida", u);
      return falloIngreso(k, 401, "CLAVE_VENCIDA", "Tu clave temporal venció. Pedile al Administrador una nueva");
    }
    const expira_en = masMs(ahora, cfg.horas * 3600000);
    k.plan.usuarios_upd.push({ id:u.id, intentos_fallidos:0, bloqueado_hasta:null, ultimo_login:ahora });
    k.plan.sesiones_ins.push({ user_id:u.id, expira_en, origen:origenClave(u) });
    k.plan.actor_id = u.id;
    k.aud("LOGIN_OK", "usuario", u.id, null, null, { justificacion:null, datos:{ origen:origenClave(u) } });
    k.plan.auditoria[k.plan.auditoria.length - 1].actor_id = u.id;
    k.plan.auditoria[k.plan.auditoria.length - 1].actor_tipo = "usuario";
    return k.exito(200, { tipo:"ingreso", id:u.id }, { expira_en });
  }

  // Respuesta del ingreso: el token lo genera la pieza "Aplicar plan" (en PostgreSQL solo se guarda su hash)
  function responderIngreso(res, aplicado, raw, ahora){
    if (!res.ok) return { http:res.http, cuerpo:res.cuerpo };
    const s = arr(aplicado?.sesiones)[0], u = usuario(raw, res.foco.id);
    if (!s || !u) return RN.error(500, "ERROR_INTERNO", "No se pudo crear la sesión", {}, raw.config || {}, ahora);
    const auth = construirAuth({ user_id:u.id }, raw) || {};
    const cambio = origenClave(u) === "local" && !!u.debe_cambiar_clave;
    return RN.ok({ token:s.token, expira_en:s.expira_en, debe_cambiar_clave:cambio, origen_clave:origenClave(u),
      usuario:{ id:u.id, nombre:u.nombre, username:u.username, email:u.email, rol:u.rol } }, auth, raw.config, ahora);
  }

  // POST /auth/logout — WF29b: cierra la sesión actual
  function cerrarSesion(e, auth, raw, sesion){
    const k = contexto(e, auth, raw, "sesion");
    const no = sinSesion(k); if (no) return no;
    if (sesion?.sesion_id) k.plan.sesiones_cerrar.push(sesion.sesion_id);
    k.aud("LOGOUT", "usuario", auth.id, null, null, { justificacion:null });
    return k.exito(200, { tipo:"usuario", id:auth.id }, { sesion_cerrada:true });
  }

  // POST /me/clave — WF29c  { actual, nueva }: cambio de la propia clave (también cuando es obligatorio).
  // n8n verifica "actual" igual que en el ingreso y pasa entrada.verificacion. Con clave de la empresa (LDAP) no se cambia acá.
  function cambiarClave(e, auth, raw, sesion){
    const k = contexto(e, auth, raw, "usuario"), v = e.verificacion || {};
    const no = sinSesion(k); if (no) return no;
    const u = usuario(raw, auth.id), nueva = String(e.body.nueva ?? "");
    if (origenClave(u) === "ldap") return k.fallo(409, "CLAVE_EXTERNA", "Usás la clave de la empresa: se cambia donde cambiás la clave de tu PC");
    if (origenClave(u) === "codigo") return k.fallo(409, "SIN_CLAVE", "Entrás con un código que te llega por correo: no tenés clave para cambiar");
    if (!txt(e.body.actual) || !nueva) return k.fallo(400, "DATOS_INCOMPLETOS", "Ingresá tu clave actual y la nueva");
    if (v.credencial_ok !== true) return k.fallo(422, "CLAVE_ACTUAL_INCORRECTA", "La clave actual no es correcta");
    const debil = claveDebil(nueva, raw.config?.politica_clave); if (debil) return k.fallo(422, "CLAVE_DEBIL", debil);
    if (nueva === String(e.body.actual)) return k.fallo(422, "CLAVE_REPETIDA", "La clave nueva tiene que ser distinta de la actual");
    const lower = nueva.toLowerCase();
    if ([u.username, u.email.split("@")[0]].some(x => x && x.length >= 3 && lower.includes(x.toLowerCase())))
      return k.fallo(422, "CLAVE_DEBIL", "La clave no puede contener tu usuario");
    k.plan.usuarios_upd.push({ id:u.id, nueva_clave:nueva, debe_cambiar_clave:false, clave_expira_en:null });
    k.plan.sesiones_revocar_otras.push({ user_id:u.id, excepto:sesion?.sesion_id || null });
    k.aud("USUARIO_CLAVE_CAMBIADA", "usuario", u.id, null, { antes:null, despues:{ debe_cambiar_clave:false } }, { justificacion:null });
    return k.exito(200, { tipo:"usuario", id:u.id }, { clave_cambiada:true });
  }

  // Horario y pasos propios van juntos en users.disponibilidad: { horario?, criticos_siempre?, pasos? } (null = siempre y sin pasos)
  const armarDisponibilidad = (horario, pasos) => {
    const d = { ...(horario || {}), ...(arr(pasos).length ? { pasos } : {}) };
    return Object.keys(d).length ? d : null;
  };
  function editarDisponibilidad(e, auth, raw){
    const k = contexto(e, auth, raw, "usuario"), b = e.body;
    const no = sinSesion(k); if (no) return no;
    const u = usuario(raw, auth.id);
    let disp = null;
    if (b.modalidad === "franjas") {
      const h = validarHorario({ modalidad:"franjas", zona_horaria:b.zona_horaria, franjas:b.franjas });
      if (h.error) return k.fallo(422, "HORARIO_INVALIDO", h.error);
      disp = { horario:h.horario, criticos_siempre: b.criticos_siempre === true };
    } else if (b.modalidad !== "siempre") return k.fallo(400, "MODALIDAD_INVALIDA", "La modalidad debe ser siempre o franjas");
    disp = armarDisponibilidad(disp, pasosPropios(u));           // cambiar el horario no borra mis pasos propios
    if (igual(u.disponibilidad ?? null, disp)) return k.exito(200, { tipo:"usuario", id:u.id }, { sin_cambios:true });
    k.plan.usuarios_upd.push({ id:u.id, disponibilidad:disp });
    k.aud("USUARIO_DISPONIBILIDAD_MODIFICADA", "usuario", u.id, null, { antes:u.disponibilidad ?? null, despues:disp });
    return k.exito(200, { tipo:"usuario", id:u.id });
  }

  // PUT /me/pasos { pasos:[{ canal, min }] } — WF47d: pasos que SUMO a mi secuencia de avisos (los de la matriz no se pueden sacar)
  function editarPasos(e, auth, raw){
    const k = contexto(e, auth, raw, "usuario");
    const no = sinSesion(k); if (no) return no;
    const u = usuario(raw, auth.id), v = validarPasos(e.body.pasos);
    if (v.error) return k.fallo(422, "PASOS_INVALIDOS", v.error);
    const d = u.disponibilidad || {}, horario = d.horario ? { horario:d.horario, criticos_siempre:!!d.criticos_siempre } : null;
    const disp = armarDisponibilidad(horario, v.pasos);
    const pol = canalesPermitidos(raw, u.rol, "escalamiento");
    const advertencias = [
      ...v.pasos.filter(p => !pol.includes(p.canal)).map(p => `Tu perfil no recibe escalamientos por ${p.canal}: ese paso no se va a mandar`),
      ...(v.pasos.some(p => p.canal === "llamada") && !u.telefono ? ["No tenés teléfono cargado: la llamada no se va a hacer hasta que lo cargues"] : [])];
    if (igual(pasosPropios(u), v.pasos)) return k.exito(200, { tipo:"usuario", id:u.id }, { sin_cambios:true, advertencias });
    k.plan.usuarios_upd.push({ id:u.id, disponibilidad:disp });
    k.aud("USUARIO_PASOS_MODIFICADOS", "usuario", u.id, null, { antes:{ pasos:pasosPropios(u) }, despues:{ pasos:v.pasos } });
    return k.exito(200, { tipo:"usuario", id:u.id }, { pasos:v.pasos, advertencias });
  }
  // Para GET /me: en cada matriz activa, los niveles donde figuro con mis pasos (matriz y propios) y si se mandan
  function misSecuencias(raw, u){
    if (!u) return [];
    return arr(raw.matrices).map(m => ({ m, t:equipo(raw, m.team_id) })).filter(x => x.t && x.t.estado === "activo").sort((a, b) => porNombre(a.t, b.t))
      .map(({ m, t }) => ({ equipo:{ id:t.id, nombre:t.nombre }, version:m.version,
        niveles: m.niveles.filter(n => destinatariosNivel(raw, t.id, n).some(x => x.id === u.id))
          .map(n => ({ nivel:n.nivel, espera_min:n.espera_min, pasos:secuenciaPersona(raw, u, n) })).filter(n => n.pasos.length) }))
      .filter(x => x.niveles.length);
  }

  /* WF20 (programado): avanza los escalamientos. En producción lo corre n8n (Wait por nivel o cron por minuto);
     en el Demo Local, el simulador lo llama en cada pedido. config.escalamiento_factor acelera los minutos (solo demo). */
  function avanzarEscalamientos(raw, meta = {}){
    const k = contexto({ params:{}, query:{}, body:{}, meta, sistema:true }, null, raw, "escalamiento");
    const ahora = new Date(k.ahora).getTime(), factor = Math.max(1, Number(raw.config?.escalamiento_factor || 1));
    const en = m => new Date(ahora + Number(m) * 60000 / factor).toISOString();
    const abiertos = arr(raw.incidentes), cortes = new Set();
    // Corte de la secuencia de un INC y equipo (una vez por vuelta): pasos programados y avisos externos sin retirar
    const cortar = (inc, teamId) => { const c = inc + "|" + teamId; if (!cortes.has(c)) { cortes.add(c); k.plan.pasos_cancelar.push({ inc, team_id:teamId }); } };
    const fin = (r, motivo) => { k.plan.escalamientos_upd.push({ ...r, estado:"fin", motivo, proximo_en:null, fin_en:k.ahora }); if (motivo !== "agotado") cortar(r.inc, r.team_id); };
    const textos = (i, t, nivelN) => ({
      titulo:`${i.inc} · ${nombreCat(raw, i.prioridad)} · Escalamiento nivel ${nivelN} · ${t.nombre}`,
      cuerpo:`${i.titulo}. Nadie lo tomó todavía: tocá Tomar para detener el escalamiento.`,
      cuerpo_jefe:`${i.titulo}. Nadie lo atendió todavía: tocá Enterado para detener el escalamiento.`,
      // Lo que dice la llamada (texto a voz en n8n). Con el 1 se toma el INC, igual que con el botón Tomar.
      guion:`Escalamiento de Assurance Center. Incidente ${i.inc.replace(/^INC0*/, "")}, ${nombreCat(raw, i.prioridad)}, equipo ${t.nombre}. ` +
        `${i.titulo}. Nadie lo tomó todavía. Presioná 1 para tomarlo o cortá para seguir el escalamiento.` });
    arr(raw.escalamientos_vivos).filter(r => r.estado === "esperando" && !abiertos.some(i => i.inc === r.inc && i.equipos.includes(r.team_id)))
      .forEach(r => fin(r, "incidente_cerrado"));
    for (const i of abiertos) {
      const sla = slaDe(raw, i, k.ahora);
      if (!sla) continue;
      const tipo = sla.vencido ? "vencido" : sla.riesgo ? "riesgo" : null, clave = `${i.inc}|${tipo}|${i.prioridad}`;
      if (!tipo || arr(raw.sla_avisos).includes(clave)) continue;
      k.plan.sla_avisos.push(clave);
      const jefes = unicos(i.equipos.map(t => responsable(raw, t)?.user_id).filter(Boolean));
      const avisar = unicos([...jefes, ...i.equipos.flatMap(t => delEquipo(raw, t).filter(m => incEquipo(raw, i.inc, t).asignado_id === m.user_id).map(m => m.user_id))]);
      const titulo = `${sla.vencido ? "⛔ SLA vencido" : "⏱ SLA en riesgo"} · ${i.inc} · ${nombreCat(raw, i.prioridad)}`;
      const cuerpo = `${i.titulo}. SLA de ${sla.minutos} min ${sla.vencido ? "vencido" : `vence en ${Math.max(0, sla.restante_min)} min`}.`;
      avisar.forEach(uid => ["app", "email"].forEach(canal => k.plan.notificaciones.push({ user_id:uid, team_id:i.equipos[0] || null, canal, titulo, cuerpo, tipo:"sla", enlace:"incidentes.html", inc:i.inc })));
      k.audEquipos(sla.vencido ? "SLA_VENCIDO" : "SLA_EN_RIESGO", "incidente", i.inc, i.equipos, { antes:null, despues:{ inc:i.inc, prioridad:i.prioridad, sla_min:sla.minutos, vence_en:sla.vence_en } }, { justificacion:null });
    }
    for (const i of abiertos) for (const teamId of i.equipos) {
      const t = equipo(raw, teamId);
      if (!t || t.estado !== "activo") continue;
      const st = incEquipo(raw, i.inc, teamId);
      let run = corridaDe(raw, i.inc, teamId);
      if (st.estado_equipo !== "pendiente") { if (run?.estado === "esperando") fin(run, "reconocido"); continue; }
      if (run && run.estado !== "esperando") continue;
      if (!run) {
        const mx = matrizDe(raw, teamId);
        if (!mx || !mx.niveles.length) continue;
        run = { id:k.id(), inc:i.inc, team_id:teamId, matriz_version:mx.version, niveles:mx.niveles, nivel_actual:0,
                estado:"esperando", motivo:null, iniciado_en:k.ahora, proximo_en:en(mx.niveles[0].espera_min), fin_en:null };
        k.plan.escalamientos_upd.push(run);      // el inicio queda en la corrida (escalation_runs), sin fila de auditoría
        continue;
      }
      if (new Date(run.proximo_en).getTime() > ahora) continue;
      run = { ...run };
      while (run.estado === "esperando" && new Date(run.proximo_en).getTime() <= ahora) {
        const n = run.niveles[run.nivel_actual], a = alcanceNivel(raw, teamId, n, i.prioridad, k.ahora);
        const { titulo, cuerpo:cuerpoOp, cuerpo_jefe, guion } = textos(i, t, n.nivel), cuerpoDe = u => esJefe(raw, u) ? cuerpo_jefe : cuerpoOp;
        const silenciados = a.en_franja ? a.personas.filter(u => !a.disponibles.includes(u)) : [];
        const programados = [];
        a.disponibles.forEach(u => {
          // Secuencia de cada persona: lo de los 0 minutos sale ya; el resto queda programado (escalamiento_pasos)
          const seq = secuenciaEfectiva(raw, u, n), cs = seq.filter(p => !p.min).map(p => p.canal);
          cs.forEach(canal => k.plan.notificaciones.push({ user_id:u.id, team_id:teamId, canal, titulo, cuerpo:cuerpoDe(u), tipo:"escalamiento", enlace:"incidentes.html", inc:i.inc,
            ...(canal === "llamada" ? { telefono:u.telefono, guion } : canal === "app" && cs.includes("llamada") ? { con_llamada:true } : {}) }));
          seq.filter(p => p.min > 0).forEach(p => {
            k.plan.pasos_ins.push({ id:k.id(), run_id:run.id, inc:i.inc, team_id:teamId, user_id:u.id, nivel:n.nivel, canal:p.canal, vence_en:en(p.min) });
            programados.push(`${u.nombre}: ${p.canal} ${p.min}′`);
          });
        });
        // Fuera de su horario: queda en la campana, sin aviso emergente ni correo/Telegram
        silenciados.forEach(u => k.plan.notificaciones.push({ user_id:u.id, team_id:teamId, canal:"app", titulo, cuerpo:cuerpoDe(u), tipo:"escalamiento", enlace:"incidentes.html", silenciosa:true, inc:i.inc }));
        k.aud(a.disponibles.length ? "ESC_NIVEL_NOTIFICADO" : "ESC_NIVEL_SIN_DISPONIBLES", "escalamiento", run.id, teamId, { antes:null, despues:{
          inc:i.inc, nivel:n.nivel, avisados:a.disponibles.map(u => u.nombre),
          llamados:a.disponibles.filter(u => canalesEfectivos(raw, u, n).includes("llamada")).map(u => u.nombre), sin_telefono:a.sin_telefono.map(u => u.nombre), fuera_de_su_horario:silenciados.map(u => u.nombre), nivel_en_franja:a.en_franja,
          ...(programados.length ? { programados } : {}) } }, { justificacion:null });
        run.nivel_actual++;
        if (run.nivel_actual >= run.niveles.length) {
          Object.assign(run, { estado:"fin", motivo:"agotado", proximo_en:null, fin_en:k.ahora });
          k.aud("ESC_AGOTADO", "escalamiento", run.id, teamId, { antes:null, despues:{ inc:i.inc, niveles:run.niveles.length } }, { justificacion:null });
          break;
        }
        // Si nadie pudo recibir el aviso, se pasa enseguida al nivel siguiente
        if (a.disponibles.length) run.proximo_en = en(run.niveles[run.nivel_actual].espera_min);
      }
      k.plan.escalamientos_upd.push(run);
    }
    // Pasos programados (el resto de cada secuencia): se mandan al vencer si el equipo sigue sin tomar el INC
    // y la persona sigue habilitada (activa, destinataria, en su horario, en la franja del nivel, con el canal en su perfil)
    const enviados = new Map();
    for (const p of arr(raw.escalamiento_pasos).filter(x => !x.hecho_en && !x.cancelado_en)) {
      const i = abiertos.find(x => x.inc === p.inc), t = equipo(raw, p.team_id);
      if (!i || !i.equipos.includes(p.team_id) || !t || t.estado !== "activo" || incEquipo(raw, p.inc, p.team_id).estado_equipo !== "pendiente") { cortar(p.inc, p.team_id); continue; }
      if (new Date(p.vence_en).getTime() > ahora) continue;
      k.plan.pasos_hechos.push(p.id);
      const u = usuario(raw, p.user_id), run = corridaDe(raw, p.inc, p.team_id), n = arr(run?.niveles).find(x => x.nivel === p.nivel);
      const ok = u && u.estado === "activo" && n && destinatariosNivel(raw, p.team_id, n).some(x => x.id === u.id)
        && disponible(raw, u, i.prioridad, k.ahora) && (!n.horario || enHorario(n.horario, k.ahora) !== false)
        && canalesPermitidos(raw, u.rol, "escalamiento").includes(p.canal) && puedeRecibir(u, p.canal);
      const r = enviados.get(run?.id || p.inc + p.team_id) || { run, i, t, enviados:[], omitidos:[] };
      enviados.set(run?.id || p.inc + p.team_id, r);
      if (!ok) { r.omitidos.push(`${u?.nombre || "?"}: ${p.canal}`); continue; }
      const { titulo, cuerpo:cuerpoOp, cuerpo_jefe, guion } = textos(i, t, p.nivel);
      k.plan.notificaciones.push({ user_id:u.id, team_id:p.team_id, canal:p.canal, titulo, cuerpo: esJefe(raw, u) ? cuerpo_jefe : cuerpoOp, tipo:"escalamiento", enlace:"incidentes.html", inc:i.inc,
        ...(p.canal === "llamada" ? { telefono:u.telefono, guion } : {}) });
      r.enviados.push(`${u.nombre}: ${p.canal}`);
    }
    for (const [id, r] of enviados) k.aud("ESC_PASO_NOTIFICADO", "escalamiento", r.run?.id || id, r.t.id,
      { antes:null, despues:{ inc:r.i.inc, enviados:r.enviados, ...(r.omitidos.length ? { omitidos:r.omitidos } : {}) } }, { justificacion:null });
    // INC cerrados en el NOC que volvieron a entrar abiertos por la API (SQL 035): se informa y se consulta
    for (const rg of arr(raw.reingresos).filter(x => !x.avisado_en)) {
      const ids = destinatariosReingreso(raw, rg);
      if (ids.length) k.notificar(ids, `${rg.inc} volvió a entrar abierto`,
        `${rg.titulo ? rg.titulo + ". " : ""}Lo habían cerrado en el NOC y la herramienta lo manda ${rg.estado_nuevo === "en_curso" ? "en curso" : "abierto"}. Decidí en Notificaciones si se reabre o sigue cerrado.`,
        arr(rg.equipos)[0] || null, ["app", "email"], { tipo:"general", enlace:"notificaciones.html", inc:rg.inc });
      k.plan.reingresos_avisados.push(rg.id);
      k.audEquipos("INC_REINGRESO_AVISADO", "incidente", rg.inc, arr(rg.equipos), { antes:null, despues:{ estado_nuevo:rg.estado_nuevo, avisados:ids.length } }, { justificacion:null });
    }
    return filtrarNotificaciones(raw, k.plan);
  }

  // GET /notificaciones/politica — WF48a: qué recibe cada perfil (todos la ven; solo el Administrador la edita)
  function verPoliticaNotif(e, auth, raw){
    const k = contexto(e, auth, raw, "config");
    const no = sinSesion(k); if (no) return no;
    return k.lectura({ tipos:TIPOS_NOTIF.map(([id, nombre]) => ({ id, nombre })), canales:TODOS_CANALES,
      roles:raw.roles.slice().sort((a, b) => a.nivel - b.nivel).map(r => ({ codigo:r.codigo, nombre:r.nombre })),
      politica:politicaNotif(raw), mi_rol:auth.rol, puede_editar:auth.es_admin });
  }
  // PUT /notificaciones/politica { politica:{ ROL:{ tipo:[canales] } }, justificacion } — WF48b (solo Administrador)
  function editarPoliticaNotif(e, auth, raw){
    const k = contexto(e, auth, raw, "config"), b = e.body;
    const no = sinSesion(k); if (no) return no;
    if (!auth.es_admin) return k.fallo(403, "SOLO_ADMIN", "Solo el Administrador puede cambiar las notificaciones por perfil");
    if (k.just.length < 10) return k.fallo(422, "JUSTIFICACION_REQUERIDA", "Indicá una justificación (mínimo 10 caracteres)");
    const actual = politicaNotif(raw), nueva = JSON.parse(JSON.stringify(actual));
    for (const [rol, tipos] of Object.entries(b.politica || {})) {
      if (!nueva[rol]) return k.fallo(422, "ROL_INVALIDO", `Rol inexistente: ${rol}`);
      for (const [tipo, canales] of Object.entries(tipos || {})) {
        if (!(tipo in nueva[rol])) return k.fallo(422, "TIPO_INVALIDO", `Tipo de notificación inexistente: ${tipo}`);
        const cs = unicos(arr(canales).map(txt));
        if (cs.some(c => !TODOS_CANALES.includes(c))) return k.fallo(422, "CANAL_INVALIDO", "Los canales son app, email, telegram y llamada");
        nueva[rol][tipo] = TODOS_CANALES.filter(c => cs.includes(c));
      }
    }
    if (igual(actual, nueva)) return k.exito(200, { tipo:"politica" }, { sin_cambios:true });
    k.plan.config_upd.push({ clave:"politica_notificaciones", valor:nueva });
    k.aud("CONFIG_NOTIFICACIONES_MODIFICADA", "config", "politica_notificaciones", null, { antes:actual, despues:nueva });
    return k.exito(200, { tipo:"politica" });
  }

  // GET /debates — incidentes abiertos con su debate (o la opción de abrirlo) y debates de INC ya no abiertos
  function listarDebates(e, auth, raw){
    const k = contexto(e, auth, raw, "debate");
    const no = sinSesion(k); if (no) return no;
    const porInc = Object.fromEntries(arr(raw.debates).map(d => [d.inc, d]));
    const incidentes = arr(raw.incidentes).slice().sort((a, b) => a.prioridad - b.prioridad || String(a.inicio).localeCompare(String(b.inicio)))
      .map(i => ({ inc:i.inc, titulo:i.titulo, prioridad:i.prioridad, categoria:vistaCategoria(raw, i.prioridad), inicio:iso(i.inicio), servicios:arr(i.servicios),
        equipos:equiposInc(raw, auth, i), puedo_sumar_equipo:equiposParaSumar(raw, auth, i), enterado:equiposEnterado(raw, auth, i), mio: i.equipos.some(t => auth.equipos.some(x => x.id === t)),
        sla:slaDe(raw, i), escalado:escaladoInc(raw, i), puede_cambiar_categoria:puedeCambiarCat(raw, auth, i), puede_cerrar:puedeCerrarInc(raw, auth, i),
        debate: porInc[i.inc] ? vistaDebate(raw, auth, porInc[i.inc]) : null,
        puede_abrir: !porInc[i.inc] && tiene(auth, "escribir_chat") }));
    const abiertos = new Set(incidentes.map(i => i.inc));
    const otros = arr(raw.debates).filter(d => !abiertos.has(d.inc)).map(d => vistaDebate(raw, auth, d))
      .sort((a, b) => String(b.abierto_en).localeCompare(String(a.abierto_en)));
    return k.lectura({ incidentes, otros_debates:otros,
      resumen:{ escalados:incidentes.filter(i => i.escalado).length, sla_vencidos:incidentes.filter(i => i.sla?.vencido).length,
                sla_riesgo:incidentes.filter(i => i.sla?.riesgo && !i.sla.vencido).length },
      puede_convocatoria_general: auth.es_admin || !!rolDef(raw, auth.rol)?.puede_ser_responsable,
      servicios: raw.servicios.filter(x => x.activo !== false).sort(porNombre).map(x => ({ id:x.id, nombre:x.nombre, red:x.red })),
      no_leidos_total: [...incidentes.map(i => i.debate), ...otros].reduce((n, d) => n + (d?.no_leidos || 0), 0) });
  }

  // POST /debates { inc }
  function abrirDebate(e, auth, raw){
    const k = contexto(e, auth, raw, "debate"), inc = txt(e.body.inc).toUpperCase();
    const no = sinSesion(k); if (no) return no;
    if (!tiene(auth, "escribir_chat")) return k.fallo(403, "SIN_PERMISO", "Tu rol no permite abrir chats de INC (Solo Lectura puede unirse y leer)");
    const i = incidenteDe(raw, inc);
    if (!i) return k.fallo(404, "INC_INEXISTENTE", "El incidente no existe o ya no está abierto");
    const ya = arr(raw.debates).find(d => d.inc === inc);
    if (ya) return k.fallo(409, "DEBATE_YA_EXISTE", "El incidente ya tiene un debate abierto", { debate_id:ya.id });
    const id = planNuevoDebate(k, i);
    return k.exito(201, { tipo:"debate", id });
  }

  // Arma el alta de un debate: creador + integrantes activos de los equipos del INC. Devuelve { id, integrantes }.
  function planNuevoDebate(k, i, avisar = true){
    const { raw, auth } = k, id = k.id();
    const delEquipoActivos = unicos(i.equipos.flatMap(t => delEquipo(raw, t).map(m => m.user_id))).filter(uid => usuario(raw, uid)?.estado === "activo");
    k.plan.debates_ins.push({ id, inc:i.inc, titulo:i.titulo, prioridad:i.prioridad ?? null, equipos:i.equipos });
    k.plan.participantes_ins.push({ id:k.id(), debate_id:id, user_id:auth.id, origen:"creador" });
    delEquipoActivos.filter(uid => uid !== auth.id).forEach(uid => k.plan.participantes_ins.push({ id:k.id(), debate_id:id, user_id:uid, origen:"equipo" }));
    mensajeSistema(k, id, `${auth.nombre} abrió el chat · se sumaron los integrantes de ${i.equipos.map(t => equipo(raw, t)?.nombre).filter(Boolean).join(", ") || "los equipos del INC"}`);
    k.audEquipos("DEBATE_ABIERTO", "debate", id, i.equipos, { antes:null, despues:{ inc:i.inc, participantes:k.plan.participantes_ins.filter(p => p.debate_id === id).length } }, { justificacion:null });
    if (avisar) k.notificar(delEquipoActivos, `${i.inc} · chat abierto`, `${auth.nombre} abrió el chat de “${i.titulo}”.`, i.equipos[0] || null, ["app"], { tipo:"debate", enlace:enlaceDebate(id) });
    return id;
  }

  // POST /convocatorias — solo jefes. Elige un INC abierto o crea uno nuevo, abre (o reutiliza) su debate,
  // suma a TODOS los usuarios activos y les avisa. Exige confirmaciones:3 (el botón se toca 3 veces).
  function convocatoriaGeneral(e, auth, raw){
    const k = contexto(e, auth, raw, "debate"), b = e.body;
    const no = sinSesion(k); if (no) return no;
    if (!auth.es_admin && !rolDef(raw, auth.rol)?.puede_ser_responsable) return k.fallo(403, "SOLO_JEFES", "La convocatoria general es solo para Administradores y Jefes/Gestores");
    if (Number(b.confirmaciones) !== 3) return k.fallo(400, "CONFIRMACION_REQUERIDA", "Confirmá la convocatoria tocando el botón 3 veces");
    const motivo = txt(b.motivo).slice(0, 300);
    let i;
    if (b.nuevo) {
      if (!tiene(auth, "crear_inc")) return k.fallo(403, "SIN_PERMISO", "Tu rol no permite crear incidentes");
      const titulo = txt(b.nuevo.titulo);
      const prioridad = b.nuevo.prioridad_tipo != null ? pDesde(raw, txt(b.nuevo.prioridad_tipo), txt(b.nuevo.grave)) : Number(b.nuevo.prioridad);
      const servicios = unicos(arr(b.nuevo.servicios).map(txt).filter(Boolean));
      if (titulo.length < 3 || titulo.length > 200) return k.fallo(400, "TITULO_INVALIDO", "El título del INC debe tener entre 3 y 200 caracteres");
      if (!catDe(raw, prioridad)) return k.fallo(400, "PRIORIDAD_INVALIDA", "Elegí una prioridad y un valor de INC Grave que formen una categoría");
      if (!servicios.length || servicios.some(s => !raw.servicios.some(x => x.id === s && x.activo !== false))) return k.fallo(400, "SERVICIOS_INVALIDOS", "Indicá al menos un servicio válido");
      const max = Math.max(412000, ...[...arr(raw.incidentes).map(x => x.inc), ...arr(raw.debates).map(x => x.inc)].map(c => Number(/INC0*(\d+)/.exec(c)?.[1] || 0)));
      const inc = "INC" + String(max + 1).padStart(9, "0");
      const equipos = unicos(raw.service_teams.filter(x => servicios.includes(x.service_id) && equipo(raw, x.team_id)?.estado === "activo").map(x => x.team_id));
      i = { inc, titulo, prioridad, servicios, equipos, inicio:k.ahora };
      k.plan.incidentes_ins.push({ inc, titulo, prioridad, servicios, inicio:k.ahora, grave:mayorDe(raw, prioridad) });
      k.audEquipos("INCIDENTE_CREADO", "incidente", inc, equipos, { antes:null, despues:{ inc, titulo, prioridad, servicios, origen:"convocatoria_general" } }, { justificacion:motivo || null });
    } else {
      i = incidenteDe(raw, txt(b.inc).toUpperCase());
      if (!i) return k.fallo(404, "INC_INEXISTENTE", "Elegí un incidente abierto o creá uno nuevo");
    }
    const existente = arr(raw.debates).find(d => d.inc === i.inc);
    if (existente && existente.estado !== "abierto") return k.fallo(409, "DEBATE_CERRADO", "El chat de ese INC está cerrado");
    const debateId = existente ? existente.id : planNuevoDebate(k, i, false);
    const yaEstan = new Set([...participantes(raw, debateId).map(p => p.user_id), ...k.plan.participantes_ins.filter(p => p.debate_id === debateId).map(p => p.user_id)]);
    const todos = raw.usuarios.filter(u => u.estado === "activo" && u.id !== auth.id);
    todos.filter(u => !yaEstan.has(u.id)).forEach(u => k.plan.participantes_ins.push({ id:k.id(), debate_id:debateId, user_id:u.id, origen:"convocado" }));
    if (existente && !yaEstan.has(auth.id)) k.plan.participantes_ins.push({ id:k.id(), debate_id:debateId, user_id:auth.id, origen:"convocado" });
    mensajeSistema(k, debateId, `🚨 ${auth.nombre} lanzó una CONVOCATORIA GENERAL${motivo ? `: “${motivo}”` : ""}`);
    k.notificar(todos.map(u => u.id), `🚨 Convocatoria general · ${i.inc} · ${nombreCat(raw, i.prioridad)} (P${i.prioridad})`, `${auth.nombre}: ${motivo || i.titulo}`, i.equipos[0] || null, ["app", "email"],
      { tipo:"convocatoria_general", enlace:enlaceDebate(debateId) });
    k.aud("DEBATE_CONVOCATORIA_GENERAL", "debate", debateId, i.equipos[0] || null,
      { antes:null, despues:{ inc:i.inc, convocados:todos.length, inc_nuevo:!!b.nuevo, motivo:motivo || null } }, { justificacion:motivo || null });
    return k.exito(201, { tipo:"debate", id:debateId }, { convocados:todos.length, inc:i.inc, inc_nuevo:!!b.nuevo });
  }

  // GET /debates/:id (marca como leído para quien participa)
  function verDebate(e, auth, raw){
    const k = contexto(e, auth, raw, "debate"), d = debateDe(raw, e.params.id);
    const no = sinSesion(k); if (no) return no;
    if (!d) return k.fallo(404, "DEBATE_INEXISTENTE", "El chat no existe");
    const r = k.lectura({ debate:vistaDebate(raw, auth, d, true) });
    const yo = participacion(raw, d.id, auth.id), ultimo = mensajesDe(raw, d.id).at(-1);
    if (yo && ultimo && (!yo.leido_hasta || ultimo.creado_en > yo.leido_hasta)) {
      k.plan.participantes_upd.push({ id:yo.id, leido_hasta:ultimo.creado_en });
      r.plan = k.plan;
    }
    return r;
  }

  function unirseDebate(e, auth, raw){
    const k = contexto(e, auth, raw, "debate"), d = debateDe(raw, e.params.id);
    const no = sinSesion(k); if (no) return no;
    if (!d) return k.fallo(404, "DEBATE_INEXISTENTE", "El chat no existe");
    if (d.estado !== "abierto") return k.fallo(409, "DEBATE_CERRADO", "El chat está cerrado");
    if (participacion(raw, d.id, auth.id)) return k.exito(200, { tipo:"debate", id:d.id }, { sin_cambios:true });
    const pid = k.id();
    k.plan.participantes_ins.push({ id:pid, debate_id:d.id, user_id:auth.id, origen:"voluntario" });
    mensajeSistema(k, d.id, `${auth.nombre} se unió al chat`);
    k.aud("DEBATE_PARTICIPANTE_UNIDO", "debate", d.id, d.equipos[0] || null, { antes:null, despues:{ inc:d.inc, user_id:auth.id, usuario:auth.nombre } }, { justificacion:null });
    return k.exito(200, { tipo:"debate", id:d.id });
  }

  function salirDebate(e, auth, raw){
    const k = contexto(e, auth, raw, "debate"), d = debateDe(raw, e.params.id);
    const no = sinSesion(k); if (no) return no;
    if (!d) return k.fallo(404, "DEBATE_INEXISTENTE", "El chat no existe");
    const yo = participacion(raw, d.id, auth.id);
    if (!yo) return k.exito(200, { tipo:"debate", id:d.id }, { sin_cambios:true });
    k.plan.participantes_upd.push({ id:yo.id, estado:"salio" });
    mensajeSistema(k, d.id, `${auth.nombre} salió del chat`);
    k.aud("DEBATE_PARTICIPANTE_SALIO", "debate", d.id, d.equipos[0] || null, { antes:{ user_id:auth.id, usuario:auth.nombre }, despues:null }, { justificacion:null });
    return k.exito(200, { tipo:"debate", id:d.id });
  }

  // POST /debates/:id/mensajes { texto?, adjunto?: { nombre, tipo, datos: "data:<tipo>;base64,..." } }
  function enviarMensaje(e, auth, raw){
    const k = contexto(e, auth, raw, "debate"), d = debateDe(raw, e.params.id), b = e.body;
    const no = sinSesion(k); if (no) return no;
    if (!d) return k.fallo(404, "DEBATE_INEXISTENTE", "El chat no existe");
    if (d.estado !== "abierto") return k.fallo(409, "DEBATE_CERRADO", "El chat está cerrado: ya no se pueden enviar mensajes");
    const yo = participacion(raw, d.id, auth.id);
    if (!yo) return k.fallo(403, "NO_ES_PARTICIPANTE", "Unite al chat para escribir");
    if (!tiene(auth, "escribir_chat")) return k.fallo(403, "SIN_PERMISO", "Tu rol es de solo lectura: podés leer el chat pero no escribir");
    const texto = String(b.texto ?? "").trim();
    if (texto.length > MAX_TEXTO) return k.fallo(400, "TEXTO_LARGO", `El mensaje admite hasta ${MAX_TEXTO} caracteres`);
    const nota = b.nota === true || b.nota === "true";
    if (nota && (!texto || b.adjunto)) return k.fallo(400, "NOTA_INVALIDA", "La nota lleva solo texto");
    let adjunto = null, tipo = nota ? "nota" : "texto";
    if (b.adjunto) {
      if (!tiene(auth, "subir_adjunto")) return k.fallo(403, "SIN_PERMISO", "Tu rol no permite adjuntar archivos");
      const a = b.adjunto, m = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(a.datos || ""));
      if (!m) return k.fallo(400, "ADJUNTO_INVALIDO", "El adjunto no tiene un formato válido");
      const mime = m[1].toLowerCase(), tamano = Math.floor(m[2].length * 3 / 4) - (m[2].endsWith("==") ? 2 : m[2].endsWith("=") ? 1 : 0);
      const clase = ADJUNTOS.imagen.re.test(mime) ? "imagen" : ADJUNTOS.archivo.re.test(mime) ? "archivo" : null;
      if (!clase) return k.fallo(422, "TIPO_NO_PERMITIDO", "Se aceptan imágenes (JPG, PNG, WEBP, GIF), PDF, Office, TXT, CSV y ZIP");
      if (tamano > ADJUNTOS[clase].max) return k.fallo(422, "ADJUNTO_GRANDE", `El archivo supera ${ADJUNTOS[clase].max / 1e6} MB`);
      const nombre = txt(a.nombre).replace(/[\\/:*?"<>|]/g, "_").slice(0, 120) || (clase === "imagen" ? "foto" : "archivo");
      adjunto = { id:k.id(), nombre, tipo:mime, tamano, datos:a.datos };
      tipo = clase;
    }
    if (!texto && !adjunto) return k.fallo(400, "MENSAJE_VACIO", "Escribí un mensaje o adjuntá un archivo");
    const id = k.id();
    if (nota && fijadosDe(raw, d.id).length >= MAX_FIJADOS) return k.fallo(409, "LIMITE_FIJADOS", `Ya hay ${MAX_FIJADOS} elementos fijados: quitá alguno antes`);
    const menciones = mencionesEn(raw, texto).filter(u => u.id !== auth.id);
    const equiposM = equiposEn(raw, texto);
    k.plan.mensajes_ins.push({ id, debate_id:d.id, user_id:auth.id, tipo, texto: texto || null, adjunto, fijado:nota,
      menciones:menciones.map(u => u.id), menciones_equipos:equiposM.map(t => t.id) });
    // Por equipo: a quienes no fueron mencionados por nombre (esos ya reciben la suya) ni son el autor
    const yaAvisados = new Set([auth.id, ...menciones.map(u => u.id)]);
    equiposM.forEach(t => avisadosPorEquipo(raw, t).filter(u => !yaAvisados.has(u.id)).forEach(u => {
      yaAvisados.add(u.id);
      k.notificar([u.id], `${auth.nombre} mencionó a @${alias(t)} · ${d.inc}`,
        resumen(texto) + (participacion(raw, d.id, u.id) ? "" : " — Tocá para ver el chat y unirte."), t.id, ["app"],
        { tipo:"mencion", enlace:enlaceDebate(d.id, id) });
    }));
    k.plan.participantes_upd.push({ id:yo.id, leido_hasta:k.ahora });
    menciones.forEach(u => k.notificar([u.id], `${auth.nombre} te mencionó · ${d.inc}`,
      resumen(texto) + (participacion(raw, d.id, u.id) ? "" : " — Tocá para ver el chat y unirte."), d.equipos[0] || null, ["app"],
      { tipo:"mencion", enlace:enlaceDebate(d.id, id) }));
    k.aud("DEBATE_MENSAJE_ENVIADO", "debate_mensaje", id, d.equipos[0] || null,
      { antes:null, despues:{ inc:d.inc, tipo, largo:texto.length, adjunto: adjunto ? adjunto.nombre : null, menciones:menciones.map(u => u.username), menciones_equipos:equiposM.map(alias) } }, { justificacion:null, datos:{ debate_id:d.id } });
    return k.exito(201, { tipo:"mensaje", id, debate_id:d.id });
  }

  function eliminarMensaje(e, auth, raw){
    const k = contexto(e, auth, raw, "debate"), d = debateDe(raw, e.params.id);
    const no = sinSesion(k); if (no) return no;
    if (!d) return k.fallo(404, "DEBATE_INEXISTENTE", "El chat no existe");
    const m = mensajesDe(raw, d.id).find(x => x.id === e.params.mid);
    if (!m || m.tipo === "sistema") return k.fallo(404, "MENSAJE_INEXISTENTE", "El mensaje no existe");
    if (!vistaMensaje(raw, auth, d, m).acciones.some(a => a.accion === "eliminar")) return k.fallo(403, "SIN_PERMISO", "Solo el autor o un moderador del equipo puede eliminar el mensaje");
    k.plan.mensajes_upd.push({ id:m.id, eliminado:true });
    k.aud("DEBATE_MENSAJE_ELIMINADO", "debate_mensaje", m.id, d.equipos[0] || null,
      { antes:{ autor:usuario(raw, m.user_id)?.nombre || null, texto:m.texto ?? null, adjunto:m.adjunto?.nombre || null }, despues:{ eliminado:true } }, { justificacion:null, datos:{ debate_id:d.id } });
    return k.exito(200, { tipo:"debate", id:d.id });
  }

  function fijarMensaje(e, auth, raw, fijar = true){
    const k = contexto(e, auth, raw, "debate"), d = debateDe(raw, e.params.id);
    const no = sinSesion(k); if (no) return no;
    if (!d) return k.fallo(404, "DEBATE_INEXISTENTE", "El chat no existe");
    if (d.estado !== "abierto") return k.fallo(409, "DEBATE_CERRADO", "El chat está cerrado");
    const m = mensajesDe(raw, d.id).find(x => x.id === e.params.mid);
    if (!m || m.tipo === "sistema" || m.eliminado_en) return k.fallo(404, "MENSAJE_INEXISTENTE", "El mensaje no existe");
    if (!!m.fijado === fijar) return k.exito(200, { tipo:"debate", id:d.id }, { sin_cambios:true });
    const accion = vistaMensaje(raw, auth, d, m).acciones.find(a => a.accion === (fijar ? "fijar" : "desfijar"));
    if (!accion) return k.fallo(403, "SIN_PERMISO", fijar ? "Unite al chat para fijar mensajes" : "Solo quien lo fijó, el autor o un moderador puede quitarlo");
    if (fijar && fijadosDe(raw, d.id).length >= MAX_FIJADOS) return k.fallo(409, "LIMITE_FIJADOS", `Ya hay ${MAX_FIJADOS} elementos fijados: quitá alguno antes`);
    k.plan.mensajes_upd.push({ id:m.id, fijado:fijar });
    const que = m.tipo === "nota" ? "una nota" : m.user_id === auth.id ? "su mensaje" : `un mensaje de ${usuario(raw, m.user_id)?.nombre || "—"}`;
    mensajeSistema(k, d.id, `${auth.nombre} ${fijar ? "fijó" : "quitó de fijados"} ${que}`);
    k.aud(fijar ? "DEBATE_MENSAJE_FIJADO" : "DEBATE_MENSAJE_DESFIJADO", "debate_mensaje", m.id, d.equipos[0] || null,
      { antes:{ fijado:!fijar }, despues:{ fijado:fijar, texto: m.texto ? resumen(m.texto) : (m.adjunto?.nombre || null) } }, { justificacion:null, datos:{ debate_id:d.id } });
    return k.exito(200, { tipo:"debate", id:d.id });
  }
  const desfijarMensaje = (e, auth, raw) => fijarMensaje(e, auth, raw, false);

  // POST /debates/:id/convocar { user_ids?:[], equipos?:[], mensaje? } — suma personas o equipos y les avisa
  function convocarDebate(e, auth, raw){
    const k = contexto(e, auth, raw, "debate"), d = debateDe(raw, e.params.id), b = e.body;
    const no = sinSesion(k); if (no) return no;
    if (!d) return k.fallo(404, "DEBATE_INEXISTENTE", "El chat no existe");
    if (d.estado !== "abierto") return k.fallo(409, "DEBATE_CERRADO", "El chat está cerrado");
    if (!participacion(raw, d.id, auth.id)) return k.fallo(403, "NO_ES_PARTICIPANTE", "Unite al chat para convocar");
    if (!tiene(auth, "escribir_chat")) return k.fallo(403, "SIN_PERMISO", "Tu rol no permite convocar");
    const equipos = unicos(arr(b.equipos).map(txt).filter(Boolean));
    const malo = equipos.find(t => equipo(raw, t)?.estado !== "activo");
    if (malo) return k.fallo(422, "EQUIPO_INVALIDO", "Uno de los equipos no existe o está inactivo", { team_id:malo });
    const ids = unicos([...arr(b.user_ids).map(txt), ...equipos.flatMap(t => delEquipo(raw, t).map(m => m.user_id))].filter(Boolean));
    const invalido = ids.find(id => !usuario(raw, id));
    if (invalido) return k.fallo(404, "USUARIO_INEXISTENTE", "Uno de los usuarios no existe", { user_id:invalido });
    const nuevos = ids.map(id => usuario(raw, id)).filter(u => u.estado === "activo" && !participacion(raw, d.id, u.id));
    if (!ids.length) return k.fallo(400, "SIN_CONVOCADOS", "Elegí al menos una persona o un equipo");
    if (!nuevos.length) return k.exito(200, { tipo:"debate", id:d.id }, { sin_cambios:true, convocados:[] });
    const mensaje = txt(b.mensaje).slice(0, 300);
    nuevos.forEach(u => k.plan.participantes_ins.push({ id:k.id(), debate_id:d.id, user_id:u.id, origen:"convocado" }));
    const nombres = nuevos.map(u => u.nombre);
    mensajeSistema(k, d.id, `${auth.nombre} convocó a ${nombres.length > 4 ? nombres.slice(0, 4).join(", ") + ` y ${nombres.length - 4} más` : nombres.join(", ")}${mensaje ? `: “${mensaje}”` : ""}`);
    k.notificar(nuevos.map(u => u.id), `${auth.nombre} te convoca · ${d.inc}`, `${d.titulo}${mensaje ? ` — “${mensaje}”` : ""}`, d.equipos[0] || null, ["app", "email"],
      { tipo:"convocatoria", enlace:enlaceDebate(d.id) });
    k.aud("DEBATE_CONVOCATORIA", "debate", d.id, d.equipos[0] || null,
      { antes:null, despues:{ inc:d.inc, convocados:nuevos.map(u => u.username), equipos:equipos.map(t => equipo(raw, t).nombre), mensaje:mensaje || null } }, { justificacion:null });
    return k.exito(200, { tipo:"debate", id:d.id }, { convocados:nuevos.map(ref) });
  }

  /* ---------- Notificaciones del usuario (campana) ---------- */
  function listarNotificaciones(e, auth, raw){
    const k = contexto(e, auth, raw, "notificacion");
    const no = sinSesion(k); if (no) return no;
    const solo = ["1", "true", true].includes(e.query.no_leidas);
    const mias = arr(raw.notificaciones).filter(n => n.user_id === auth.id && n.canal === "app")
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || String(b.id).localeCompare(String(a.id)));
    // "Para atender": una tarjeta por INC que sigue esperando que yo actúe (Enterado si soy Jefe, Tomar si soy Operador)
    // y del que ya me llegó un escalamiento o un aviso de SLA. Los niveles y SLA de ese INC no se repiten como líneas sueltas.
    const AGRUPA = ["escalamiento", "sla"];
    const atender = unicos(mias.filter(n => AGRUPA.includes(n.tipo) && n.inc).map(n => n.inc)).map(inc => incidenteDe(raw, inc)).filter(Boolean)
      .map(i => {
        const ent = equiposEnterado(raw, auth, i);
        const tomar = i.equipos.filter(t => accionesIncEquipo(raw, auth, incEquipo(raw, i.inc, t)).some(a => a.accion === "tomar"));
        const mios = unicos([...ent.map(t => t.id), ...tomar]);
        if (!mios.length) return null;
        const ultimo = mias.find(n => n.inc === i.inc && AGRUPA.includes(n.tipo));
        return { inc:i.inc, titulo:i.titulo, prioridad:i.prioridad, categoria:vistaCategoria(raw, i.prioridad), sla:slaDe(raw, i),
          enterado:ent, tomar:tomar.map(t => ({ id:t, nombre:equipo(raw, t)?.nombre || null })),
          equipos: equiposInc(raw, auth, i).filter(e => mios.includes(e.id)).map(e => ({ id:e.id, nombre:e.nombre, escalamiento:e.escalamiento })),
          ultimo_aviso:iso(ultimo?.created_at), con_llamada:mias.some(n => n.inc === i.inc && n.con_llamada && !n.leida_en) };
      }).filter(Boolean).sort((a, b) => (a.prioridad ?? 9) - (b.prioridad ?? 9) || String(b.ultimo_aviso).localeCompare(String(a.ultimo_aviso)));
    // Un escalamiento o SLA de un INC que ya se atendió o se cerró queda como leído solo (no se borra: sigue en el historial)
    const vigente = n => !(AGRUPA.includes(n.tipo) && n.inc && (!incidenteDe(raw, n.inc)
      || !arr(incidenteDe(raw, n.inc).equipos).some(t => (auth.es_admin || auth.equipos.some(x => x.id === t)) && incEquipo(raw, n.inc, t).estado_equipo === "pendiente")));
    const sinLeer = n => !n.leida_en && vigente(n);
    const lista = (solo ? mias.filter(sinLeer) : mias).slice(0, Math.min(100, Number(e.query.limite) || 50));
    return k.lectura({
      atender,
      campana: atender.length + mias.filter(n => sinLeer(n) && !AGRUPA.includes(n.tipo)).length,
      notificaciones: lista.map(n => ({ id:String(n.id), tipo:n.tipo || "general", titulo:n.titulo, cuerpo:n.cuerpo || "", enlace:n.enlace || null,
        fecha:iso(n.created_at), leida:!!n.leida_en || !vigente(n), agrupada: AGRUPA.includes(n.tipo) && !!n.inc,
        silenciosa:!!n.silenciosa, con_llamada:!!n.con_llamada, inc:n.inc || null, team_id:n.team_id || null,
        puede_enterado: n.tipo === "escalamiento" && !!n.inc && equiposEnterado(raw, auth, incidenteDe(raw, n.inc)).length > 0,
        // Escalamiento de un INC que sigue sin tomar en mi equipo: se puede tomar desde la notificación
        puede_tomar: n.tipo === "escalamiento" && !!n.inc && !!n.team_id && (() => { const i = incidenteDe(raw, n.inc);
          return !!i && i.equipos.includes(n.team_id) && accionesIncEquipo(raw, auth, incEquipo(raw, n.inc, n.team_id)).some(a => a.accion === "tomar"); })(),
        equipo: n.team_id ? equipo(raw, n.team_id)?.nombre || null : null })),
      no_leidas: mias.filter(sinLeer).length,
      reingresos: arr(raw.reingresos).filter(rg => puedeDecidirReingreso(raw, auth, rg)).map(rg => vistaReingreso(raw, rg))
    });
  }
  // POST /notificaciones/leer { ids?:[] } — sin ids marca todas
  function leerNotificaciones(e, auth, raw){
    const k = contexto(e, auth, raw, "notificacion");
    const no = sinSesion(k); if (no) return no;
    const pedidas = Array.isArray(e.body.ids) ? e.body.ids.map(String) : null;
    const ids = arr(raw.notificaciones).filter(n => n.user_id === auth.id && n.canal === "app" && !n.leida_en && (!pedidas || pedidas.includes(String(n.id)))).map(n => String(n.id));
    k.plan.notificaciones_leer.push(...ids);
    return { ...k.lectura({ marcadas:ids.length }), plan:k.plan };
  }

  function cerrarDebate(e, auth, raw){
    const k = contexto(e, auth, raw, "debate"), d = debateDe(raw, e.params.id);
    const no = sinSesion(k); if (no) return no;
    if (!d) return k.fallo(404, "DEBATE_INEXISTENTE", "El chat no existe");
    if (!modera(auth, d)) return k.fallo(403, "SIN_PERMISO", "Solo un Administrador o un Jefe/Gestor de los equipos del INC puede cerrar el chat");
    if (d.estado !== "abierto") return k.exito(200, { tipo:"debate", id:d.id }, { sin_cambios:true });
    if (k.just.length < 10) return k.fallo(422, "JUSTIFICACION_REQUERIDA", "Indicá una justificación (mínimo 10 caracteres)");
    k.plan.debates_upd.push({ id:d.id, estado:"cerrado", motivo_cierre:k.just });
    mensajeSistema(k, d.id, `${auth.nombre} cerró el chat: ${k.just}`);
    k.audEquipos("DEBATE_CERRADO", "debate", d.id, d.equipos, { antes:{ estado:"abierto" }, despues:{ estado:"cerrado" } });
    return k.exito(200, { tipo:"debate", id:d.id });
  }

  // GET /debates/:id/adjuntos/:aid — autoriza; el contenido lo entrega el almacenamiento (simulador o backend)
  function verAdjunto(e, auth, raw){
    const k = contexto(e, auth, raw, "debate"), d = debateDe(raw, e.params.id);
    const no = sinSesion(k); if (no) return no;
    if (!d) return k.fallo(404, "DEBATE_INEXISTENTE", "El chat no existe");
    if (!participacion(raw, d.id, auth.id) && !auth.es_admin) return k.fallo(403, "NO_ES_PARTICIPANTE", "Unite al chat para ver los adjuntos");
    const m = mensajesDe(raw, d.id).find(x => x.adjunto && x.adjunto.id === e.params.aid && !x.eliminado_en);
    if (!m) return k.fallo(404, "ADJUNTO_INEXISTENTE", "El adjunto no existe");
    return { ok:true, http:200, plan:null, adjunto:{ ...m.adjunto } };
  }
  function responderAdjunto(res, datos, sesion, raw, ahora){
    if (!res.ok) return { http:res.http, cuerpo:res.cuerpo };
    if (!datos) return RN.error(404, "ADJUNTO_INEXISTENTE", "El contenido del adjunto no está disponible", construirAuth(sesion, raw) || {}, raw.config, ahora);
    return RN.ok({ adjunto:{ ...res.adjunto, datos } }, construirAuth(sesion, raw) || {}, raw.config, ahora);
  }

  /* =====================================================================
     ENTRADA ÚNICA, RESPUESTAS Y ERRORES
     ===================================================================== */
  const OPERACIONES = {
    solicitarAlta, resolverSolicitud, crearUsuario, modificarUsuario, resetearClave, cambiarRol, cambiarEstadoUsuario,
    agregarIntegrantes, removerIntegrante, reemplazarEquiposUsuario, cambiarResponsable,
    crearEquipo, modificarEquipo, modificarCatalogo, cambiarEstadoEquipo, editarMatriz, editarMatrizMasiva, accionIncidente, editarDisponibilidad, editarTelefono, editarPasos, verPoliticaNotif, editarPoliticaNotif, verClasificacion, editarClasificacion, editarActualizacion, cambiarCategoriaInc, verServicios, guardarServicio,
    me, listarUsuarios, verUsuario, equiposDeUsuario, listarSolicitudes, listarEquipos, verEquipo, integrantesDeEquipo,
    listarRoles, verRol, consultarAuditoria,
    listarDebates, abrirDebate, verDebate, unirseDebate, salirDebate, enviarMensaje, eliminarMensaje, cerrarDebate, verAdjunto,
    fijarMensaje, desfijarMensaje, convocarDebate, listarNotificaciones, leerNotificaciones, convocatoriaGeneral,
    ingresar, cerrarSesion, cambiarClave
  };

  function ejecutar(operacion, entrada, sesion, raw){
    const fn = OPERACIONES[operacion];
    if (!fn) throw new Error(`Operación desconocida: ${operacion}`);
    const e = { ...entrada, operacion, params:entrada.params || {}, query:entrada.query || {}, body:entrada.body || {} };
    const res = fn(e, construirAuth(sesion, raw), raw, sesion);
    if (res?.plan) filtrarNotificaciones(raw, res.plan);   // política de notificaciones por perfil
    return res;
  }

  // Respuesta de una escritura, armada con la foto POSTERIOR al plan
  function responder(res, sesion, raw, ahora){
    if (!res.ok) return { http:res.http, cuerpo:res.cuerpo };
    if (res.cuerpo) return { http:res.http, cuerpo:res.cuerpo };     // lecturas
    const auth = construirAuth(sesion, raw);
    const f = res.foco, x = res.extra || {};
    const U = id => { const u = usuario(raw, id); return u ? vistaUsuario(raw, auth, u) : null; };
    let data;
    if (f.tipo === "usuario") data = { usuario:U(f.id), ...x };
    else if (f.tipo === "equipo") data = { equipo:vistaEquipo(raw, auth, equipo(raw, f.id)), ...x };
    else if (f.tipo === "solicitud") { const s = arr(raw.solicitudes).find(y => y.id === f.id); data = { solicitud:s ? vistaSolicitud(raw, auth, s) : null, usuario:f.usuario_id ? U(f.usuario_id) : null, ...x }; }
    else if (f.tipo === "integrantes") data = { agregados:f.agregados.map(id => vistaIntegrante(raw, id)), removidos:f.removidos.map(id => vistaIntegrante(raw, id)), sin_cambios:f.sin_cambios, advertencias:x.advertencias || [] };
    else if (f.tipo === "incidente") { const i = incidenteDe(raw, f.inc); data = { incidente: i ? { inc:i.inc, titulo:i.titulo, prioridad:i.prioridad,
      categoria:vistaCategoria(raw, i.prioridad), sla:slaDe(raw, i), equipos:equiposInc(raw, auth, i) } : null, ...x }; }
    else if (f.tipo === "config") data = { segundos:refrescoSeg(raw), ...x };
    else if (f.tipo === "clasificacion") data = { ...JSON.parse(JSON.stringify(clasificacion(raw))), ...x };
    else if (f.tipo === "servicio") { const sv = arr(raw.servicios).find(y => y.id === f.id); data = { servicio:sv ? vistaServicio(raw, sv) : null, ...x }; }
    else if (f.tipo === "politica") { const roles = raw.roles.slice().sort((a, b) => a.nivel - b.nivel);
      data = { politica:politicaNotif(raw), roles:roles.map(r => ({ codigo:r.codigo, nombre:r.nombre })), ...x,
        // Aviso: roles que figuran en alguna matriz pero no recibirían escalamientos
        advertencias: unicos(arr(raw.matrices).flatMap(m => m.niveles.flatMap(n => n.destinos.filter(d => d.tipo === "rol").map(d => d.rol))))
          .filter(r => !canalesPermitidos(raw, r, "escalamiento").length)
          .map(r => `${rolDef(raw, r)?.nombre || r} figura en matrices de escalamiento pero ya no recibe escalamientos`) }; }
    else if (f.tipo === "matrices") data = { equipos:f.ids.map(id => vistaEquipo(raw, auth, equipo(raw, id))), ...x };
    else if (f.tipo === "debate") data = { debate:vistaDebate(raw, auth, debateDe(raw, f.id), true), ...x };
    else if (f.tipo === "mensaje") { const d = debateDe(raw, f.debate_id), m = mensajesDe(raw, d.id).find(y => y.id === f.id);
      data = { mensaje:vistaMensaje(raw, auth, d, m), debate:vistaDebate(raw, auth, d) }; }
    else data = { usuario:U(f.id), agregados:f.agregados.map(id => vistaIntegrante(raw, id)), removidos:f.removidos.map(id => vistaIntegrante(raw, id)), sin_cambios:f.sin_cambios, advertencias:x.advertencias || [] };
    return RN.ok(data, auth || {}, raw.config, ahora, res.http);
  }

  // Correos a enviar después de aplicar el plan (la clave temporal la genera PostgreSQL)
  function correos(res, aplicado){
    const claves = Object.fromEntries(arr(aplicado?.claves_temporales).map(c => [c.user_id, c.clave]));
    return arr(res?.plan?.correos).filter(c => !c.requiere_clave || claves[c.user_id])
      .map(c => ({ user_id:c.user_id, para:c.para, asunto:c.asunto, texto:c.texto.replace("{{clave}}", claves[c.user_id] || "") }));
  }
  function planCorreoFallido(meta, correo, error){
    const p = planVacio(null, meta, {});
    p.auditoria.push({ actor_id:null, actor_tipo:"sistema", accion:"NOTIFICACION_FALLIDA", entidad:"usuario", entidad_id:correo.user_id || null,
      team_id:null, incident_id:null, datos:{ canal:"email", para:correo.para, asunto:correo.asunto, error:String(error || "").slice(0, 500), request_id:meta.request_id || null } });
    return p;
  }

  // Error de la sentencia de escritura (guardas de PostgreSQL, unicidad, concurrencia)
  const UNICOS = [[/users_email_uq|lower\(email\)/, "EMAIL_EN_USO", "El correo ya está registrado"],
                  [/users_username_uq|lower\(username\)/, "USERNAME_EN_USO", "El usuario ya existe"],
                  [/teams_codigo_key|codigo/, "CODIGO_EN_USO", "Ya existe un equipo con ese código"],
                  [/teams_nombre_uq/, "NOMBRE_EN_USO", "Ya existe un equipo con ese nombre"],
                  [/un_integrante_activo/, "YA_ES_INTEGRANTE", "El usuario ya es integrante del equipo"],
                  [/un_responsable_por_equipo/, "RESPONSABLE_DUPLICADO", "El equipo ya tiene responsable"]];
  function errorBD(mensaje, sesion, raw, ahora){
    const auth = construirAuth(sesion, raw) || {}, m = txt(mensaje);
    const g = /(?:^|ERROR:\s*)([A-Z][A-Z_]{3,}):\s*(.+)$/m.exec(m);
    if (g) return RN.error(409, g[1], g[2], auth, raw.config || {}, ahora);
    if (/duplicate key|unique|exclusion|conflicting key/i.test(m)) {
      const u = UNICOS.find(([re]) => re.test(m));
      if (u) return RN.error(409, u[1], u[2], auth, raw.config || {}, ahora);
      return RN.error(409, "CONFLICTO", "El cambio choca con datos existentes", auth, raw.config || {}, ahora);
    }
    return RN.error(500, "ERROR_INTERNO", "Error interno: reintentá; si persiste, avisá al Administrador", auth, raw.config || {}, ahora);
  }

  /* ---------- Rutas (las usan el generador de n8n y el simulador) ---------- */
  const RUTAS = [
    { wf:"WF29a", nombre:"Ingreso (login)",                    metodo:"POST",  ruta:"auth/login",                         operacion:"ingresar",                 tipo:"ingreso", publica:true, verifica:"usuario" },
    { wf:"WF29b", nombre:"Cerrar sesión",                      metodo:"POST",  ruta:"auth/logout",                        operacion:"cerrarSesion",             tipo:"escritura" },
    { wf:"WF29c", nombre:"Cambiar mi clave",                   metodo:"POST",  ruta:"me/clave",                           operacion:"cambiarClave",             tipo:"escritura", verifica:"actual" },
    { wf:"WF32",  nombre:"Solicitud de alta de usuario",       metodo:"POST",  ruta:"solicitudes",                        operacion:"solicitarAlta",            tipo:"escritura" },
    { wf:"WF33",  nombre:"Aprobación de usuario",              metodo:"POST",  ruta:"solicitudes/:id/resolver",           operacion:"resolverSolicitud",        tipo:"escritura", correo:true },
    { wf:"WF34",  nombre:"Creación de usuario",                metodo:"POST",  ruta:"usuarios",                           operacion:"crearUsuario",             tipo:"escritura", correo:true },
    { wf:"WF35",  nombre:"Creación de equipo",                 metodo:"POST",  ruta:"equipos",                            operacion:"crearEquipo",              tipo:"escritura" },
    { wf:"WF36a", nombre:"Asignación de usuarios a equipo",    metodo:"POST",  ruta:"equipos/:id/integrantes",            operacion:"agregarIntegrantes",       tipo:"escritura" },
    { wf:"WF36b", nombre:"Remoción de integrante",             metodo:"POST",  ruta:"equipos/:id/integrantes/:user_id/remover", operacion:"removerIntegrante",  tipo:"escritura" },
    { wf:"WF36c", nombre:"Cambio de equipos de un usuario",    metodo:"PUT",   ruta:"usuarios/:id/equipos",               operacion:"reemplazarEquiposUsuario", tipo:"escritura" },
    { wf:"WF36d", nombre:"Cambio de responsable de equipo",    metodo:"POST",  ruta:"equipos/:id/responsable",            operacion:"cambiarResponsable",       tipo:"escritura" },
    { wf:"WF37",  nombre:"Cambio de rol",                      metodo:"POST",  ruta:"usuarios/:id/rol",                   operacion:"cambiarRol",               tipo:"escritura" },
    { wf:"WF38",  nombre:"Desactivación, activación y baja de usuario", metodo:"POST", ruta:"usuarios/:id/estado",         operacion:"cambiarEstadoUsuario",     tipo:"escritura" },
    { wf:"WF39a", nombre:"Mi sesión (GET /me)",                metodo:"GET",   ruta:"me",                                 operacion:"me",                       tipo:"lectura" },
    { wf:"WF39b", nombre:"Listado de usuarios",                metodo:"GET",   ruta:"usuarios",                           operacion:"listarUsuarios",           tipo:"lectura" },
    { wf:"WF39c", nombre:"Ficha de usuario",                   metodo:"GET",   ruta:"usuarios/:id",                       operacion:"verUsuario",               tipo:"lectura" },
    { wf:"WF39d", nombre:"Equipos de un usuario",              metodo:"GET",   ruta:"usuarios/:id/equipos",               operacion:"equiposDeUsuario",         tipo:"lectura" },
    { wf:"WF39e", nombre:"Solicitudes de alta",                metodo:"GET",   ruta:"solicitudes",                        operacion:"listarSolicitudes",        tipo:"lectura" },
    { wf:"WF39f", nombre:"Listado de equipos",                 metodo:"GET",   ruta:"equipos",                            operacion:"listarEquipos",            tipo:"lectura" },
    { wf:"WF39g", nombre:"Ficha de equipo",                    metodo:"GET",   ruta:"equipos/:id",                        operacion:"verEquipo",                tipo:"lectura" },
    { wf:"WF39h", nombre:"Integrantes de un equipo",           metodo:"GET",   ruta:"equipos/:id/integrantes",            operacion:"integrantesDeEquipo",      tipo:"lectura" },
    { wf:"WF39i", nombre:"Roles y matriz RBAC",                metodo:"GET",   ruta:"roles",                              operacion:"listarRoles",              tipo:"lectura" },
    { wf:"WF39j", nombre:"Detalle de rol",                     metodo:"GET",   ruta:"roles/:codigo",                      operacion:"verRol",                   tipo:"lectura" },
    { wf:"WF39k", nombre:"Consulta de auditoría",              metodo:"GET",   ruta:"auditoria",                          operacion:"consultarAuditoria",       tipo:"auditoria" },
    { wf:"WF40a", nombre:"Modificación de usuario",            metodo:"PATCH", ruta:"usuarios/:id",                       operacion:"modificarUsuario",         tipo:"escritura" },
    { wf:"WF40b", nombre:"Reseteo de clave",                   metodo:"POST",  ruta:"usuarios/:id/clave/reset",           operacion:"resetearClave",            tipo:"escritura", correo:true },
    { wf:"WF41a", nombre:"Modificación de equipo",             metodo:"PATCH", ruta:"equipos/:id",                        operacion:"modificarEquipo",          tipo:"escritura" },
    { wf:"WF41b", nombre:"Servicios y productos de equipo",    metodo:"PUT",   ruta:"equipos/:id/catalogo",               operacion:"modificarCatalogo",        tipo:"escritura" },
    { wf:"WF41c", nombre:"Activación y desactivación de equipo", metodo:"POST", ruta:"equipos/:id/estado",                operacion:"cambiarEstadoEquipo",      tipo:"escritura" },
    { wf:"WF46a", nombre:"Editar matriz de escalamiento de un equipo", metodo:"PUT", ruta:"equipos/:id/matriz",           operacion:"editarMatriz",             tipo:"escritura" },
    { wf:"WF46b", nombre:"Matriz de escalamiento en bloque (varios o todos)", metodo:"PUT", ruta:"matrices",                operacion:"editarMatrizMasiva",       tipo:"escritura" },
    { wf:"WF47a", nombre:"Tomar o reconocer un INC (por equipo)",  metodo:"POST",  ruta:"incidentes/:inc/acciones",           operacion:"accionIncidente",          tipo:"escritura" },
    { wf:"WF47b", nombre:"Mi horario de avisos",               metodo:"PUT",   ruta:"me/disponibilidad",                  operacion:"editarDisponibilidad",     tipo:"escritura" },
    { wf:"WF47c", nombre:"Mi teléfono para llamadas",          metodo:"PUT",   ruta:"me/telefono",                        operacion:"editarTelefono",           tipo:"escritura" },
    { wf:"WF47d", nombre:"Mi secuencia de avisos (pasos propios)", metodo:"PUT", ruta:"me/pasos",                        operacion:"editarPasos",              tipo:"escritura" },
    { wf:"WF20",  nombre:"Motor de escalamiento",              metodo:null,    ruta:null,                                 operacion:"avanzarEscalamientos",     tipo:"programado" },
    { wf:"WF48a", nombre:"Notificaciones por perfil (ver)",    metodo:"GET",   ruta:"notificaciones/politica",            operacion:"verPoliticaNotif",         tipo:"lectura" },
    { wf:"WF48b", nombre:"Notificaciones por perfil (editar)", metodo:"PUT",   ruta:"notificaciones/politica",            operacion:"editarPoliticaNotif",      tipo:"escritura" },
    { wf:"WF49a", nombre:"Clasificación de INC (ver)",         metodo:"GET",   ruta:"clasificacion",                      operacion:"verClasificacion",         tipo:"lectura" },
    { wf:"WF49c", nombre:"Actualización de pantallas (editar)", metodo:"PUT",  ruta:"config/actualizacion",               operacion:"editarActualizacion",      tipo:"escritura" },
    { wf:"WF49b", nombre:"Clasificación de INC (editar)",      metodo:"PUT",   ruta:"clasificacion",                      operacion:"editarClasificacion",      tipo:"escritura" },
    { wf:"WF50a", nombre:"Servicios (ver)",                    metodo:"GET",   ruta:"servicios",                          operacion:"verServicios",             tipo:"lectura" },
    { wf:"WF50b", nombre:"Servicios (alta y modificación)",    metodo:"POST",  ruta:"servicios",                          operacion:"guardarServicio",          tipo:"escritura" },
    { wf:"WF49c", nombre:"Cambiar la categoría de un INC",     metodo:"POST",  ruta:"incidentes/:inc/categoria",          operacion:"cambiarCategoriaInc",      tipo:"escritura" },
    { wf:"WF43a", nombre:"Debates de incidentes",              metodo:"GET",   ruta:"debates",                            operacion:"listarDebates",            tipo:"lectura" },
    { wf:"WF43b", nombre:"Abrir debate de incidente",          metodo:"POST",  ruta:"debates",                            operacion:"abrirDebate",              tipo:"escritura" },
    { wf:"WF43c", nombre:"Ver debate",                         metodo:"GET",   ruta:"debates/:id",                        operacion:"verDebate",                tipo:"lectura" },
    { wf:"WF43d", nombre:"Unirse a un debate",                 metodo:"POST",  ruta:"debates/:id/unirse",                 operacion:"unirseDebate",             tipo:"escritura" },
    { wf:"WF43e", nombre:"Salir de un debate",                 metodo:"POST",  ruta:"debates/:id/salir",                  operacion:"salirDebate",              tipo:"escritura" },
    { wf:"WF43f", nombre:"Enviar mensaje al debate",           metodo:"POST",  ruta:"debates/:id/mensajes",               operacion:"enviarMensaje",            tipo:"escritura" },
    { wf:"WF43g", nombre:"Eliminar mensaje del debate",        metodo:"POST",  ruta:"debates/:id/mensajes/:mid/eliminar", operacion:"eliminarMensaje",          tipo:"escritura" },
    { wf:"WF43j", nombre:"Fijar mensaje del debate",           metodo:"POST",  ruta:"debates/:id/mensajes/:mid/fijar",    operacion:"fijarMensaje",             tipo:"escritura" },
    { wf:"WF43k", nombre:"Quitar mensaje de fijados",          metodo:"POST",  ruta:"debates/:id/mensajes/:mid/desfijar", operacion:"desfijarMensaje",          tipo:"escritura" },
    { wf:"WF43l", nombre:"Convocar al debate",                 metodo:"POST",  ruta:"debates/:id/convocar",               operacion:"convocarDebate",           tipo:"escritura" },
    { wf:"WF45",  nombre:"Convocatoria general (solo jefes)",  metodo:"POST",  ruta:"convocatorias",                      operacion:"convocatoriaGeneral",      tipo:"escritura" },
    { wf:"WF44a", nombre:"Mis notificaciones",                 metodo:"GET",   ruta:"notificaciones",                     operacion:"listarNotificaciones",     tipo:"lectura" },
    { wf:"WF44b", nombre:"Marcar notificaciones leídas",       metodo:"POST",  ruta:"notificaciones/leer",                operacion:"leerNotificaciones",       tipo:"lectura" },
    { wf:"WF43h", nombre:"Cerrar chat",                      metodo:"POST",  ruta:"debates/:id/cerrar",                 operacion:"cerrarDebate",             tipo:"escritura" },
    { wf:"WF43i", nombre:"Descargar adjunto del debate",       metodo:"GET",   ruta:"debates/:id/adjuntos/:aid",          operacion:"verAdjunto",               tipo:"adjunto" },
    { wf:"WF42",  nombre:"Vencimiento de solicitudes",         metodo:null,    ruta:null,                                 operacion:"vencerSolicitudes",        tipo:"programado" }
  ];

  return {
    BASE_NOC, RUTAS, FUNCIONALIDADES, LISTAS_PLAN,
    ejecutar, responder, responderIngreso, verificadorDe, responderAuditoria, responderAdjunto, correos, planCorreoFallido, errorBD, vencerSolicitudes, avanzarEscalamientos, planVacio,
    construirAuth, autorizar, permisosEfectivos, matrizRBAC, validarHorario, enHorario, diff, sanitizar
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = ReglasRBAC;

/* ===== demo/datos-demo-rbac.js ===== */
/* =====================================================================
   DATOS DEMO RBAC — estado inicial del Demo Local
   Es la misma foto que debe devolver el backend real (contrato en el Anexo de la especificación) después de
   ejecutar 001 → 002 → 003 → 004 (mismos IDs). Clave de todos: demo123
   El catálogo de permisos se verifica contra 003 con tests/rbac.test.js.
   ===================================================================== */
const DATOS_DEMO_RBAC = (() => {
  const T0 = "2026-03-02T13:00:00.000Z";
  const U = n => "00000000-0000-0000-0000-00000000000" + n;
  const E = n => "10000000-0000-0000-0000-00000000000" + n;
  const M = n => "20000000-0000-0000-0000-00000000000" + n;

  // [codigo, modulo, tipo, descripcion, requiere_justificacion] — mismo orden que 003
  const PERMISOS = [
    ["ver_usuarios", "usuarios", "V", "Listar y ver usuarios", false],
    ["solicitar_alta_usuario", "usuarios", "C", "Solicitar alta de usuario", true],
    ["crear_usuario", "usuarios", "C", "Alta directa de usuario", true],
    ["modificar_usuario", "usuarios", "M", "Modificar datos de usuario", false],
    ["cambiar_rol_usuario", "usuarios", "M", "Cambiar el rol de un usuario", true],
    ["aprobar_alta_usuario", "usuarios", "A", "Aprobar o rechazar solicitudes de alta", true],
    ["cambiar_estado_usuario", "usuarios", "E", "Activar, desactivar o dar de baja", true],
    ["resetear_clave_usuario", "usuarios", "E", "Generar clave temporal", false],
    ["ver_equipos", "equipos", "V", "Ver equipos e integrantes", false],
    ["crear_equipo", "equipos", "C", "Crear equipo", false],
    ["modificar_equipo", "equipos", "M", "Modificar nombre, descripción y horario", false],
    ["gestionar_integrantes", "equipos", "M", "Agregar o remover integrantes", true],
    ["asignar_responsable", "equipos", "M", "Designar responsable", true],
    ["asociar_servicios_productos", "equipos", "M", "Asociar servicios y productos", false],
    ["cambiar_estado_equipo", "equipos", "E", "Activar o desactivar equipo", true],
    ["ver_roles", "roles", "V", "Ver catálogo de roles y permisos", false],
    ["modificar_permisos_rol", "roles", "M", "Ajustar permisos de un rol", true],
    ["ver", "incidentes", "V", "Ver tablero e incidentes", false],
    ["crear_inc", "incidentes", "C", "Crear incidente", false],
    ["editar_inc", "incidentes", "M", "Editar incidente", false],
    ["asignar_inc", "incidentes", "M", "Asignar incidente a un integrante", false],
    ["agregar_equipo", "incidentes", "M", "Agregar equipo a un incidente", false],
    ["tomar_inc", "incidentes", "E", "Tomar incidente", false],
    ["ack_inc", "incidentes", "E", "Reconocer incidente", false],
    ["aprobar_inc_mayor", "incidentes", "A", "Declarar incidente mayor", true],
    ["ver_sla", "sla", "V", "Ver SLA", false],
    ["crear_politica_sla", "sla", "C", "Crear política de SLA", false],
    ["configurar_sla", "sla", "M", "Modificar política de SLA", true],
    ["aprobar_excepcion_sla", "sla", "A", "Aprobar pausa o excepción de SLA", true],
    ["ver_escalamientos", "escalamientos", "V", "Ver matrices y corridas", false],
    ["crear_matriz", "escalamientos", "C", "Crear versión de matriz", false],
    ["editar_matriz", "escalamientos", "M", "Editar matriz (nueva versión)", false],
    ["escalar_inc", "escalamientos", "E", "Escalar manualmente", false],
    ["ver_notificaciones", "notificaciones", "V", "Ver notificaciones", false],
    ["crear_plantilla_notificacion", "notificaciones", "C", "Crear plantilla", false],
    ["configurar_notificaciones", "notificaciones", "M", "Configurar canales y plantillas", false],
    ["enviar_notificacion", "notificaciones", "E", "Enviar notificación manual", false],
    ["ver_tareas", "tareas", "V", "Ver tareas", false],
    ["crear_tarea", "tareas", "C", "Crear tarea", false],
    ["modificar_tarea", "tareas", "M", "Modificar tarea", false],
    ["aprobar_tarea", "tareas", "A", "Aprobar tarea", false],
    ["ejecutar_tarea", "tareas", "E", "Ejecutar tarea", false],
    ["ver_chat", "chat", "V", "Leer chat operativo", false],
    ["escribir_chat", "chat", "C", "Escribir en chat", false],
    ["moderar_chat", "chat", "M", "Editar u ocultar mensajes", false],
    ["ver_notas", "notas", "V", "Ver notas", false],
    ["comentar_inc", "notas", "C", "Agregar nota", false],
    ["modificar_nota", "notas", "M", "Editar nota (versiona)", false],
    ["ver_adjuntos", "adjuntos", "V", "Ver adjuntos", false],
    ["subir_adjunto", "adjuntos", "C", "Subir adjunto", false],
    ["gestionar_adjunto", "adjuntos", "M", "Baja lógica o reclasificación", true],
    ["ver_falsos_positivos", "falsos_positivos", "V", "Ver falsos positivos", false],
    ["proponer_falso_positivo", "falsos_positivos", "C", "Proponer falso positivo", true],
    ["modificar_falso_positivo", "falsos_positivos", "M", "Corregir propuesta", false],
    ["aprobar_falso_positivo", "falsos_positivos", "A", "Aprobar falso positivo", true],
    ["ver_validaciones", "validaciones", "V", "Ver validaciones", false],
    ["crear_checklist_validacion", "validaciones", "C", "Crear checklist", false],
    ["modificar_checklist_validacion", "validaciones", "M", "Modificar checklist", false],
    ["aprobar_validacion", "validaciones", "A", "Aprobar validación", false],
    ["ejecutar_validacion", "validaciones", "E", "Ejecutar validación", false],
    ["ver_cierres", "cierres", "V", "Ver historial de cierres", false],
    ["cerrar_inc", "cierres", "A", "Cierre definitivo", false],
    ["resolver_inc", "cierres", "E", "Resolver (propone cierre)", true],
    ["ver_reaperturas", "reaperturas", "V", "Ver reaperturas", false],
    ["solicitar_reapertura", "reaperturas", "C", "Solicitar reapertura", true],
    ["aprobar_reapertura", "reaperturas", "A", "Aprobar reapertura", true],
    ["reabrir_inc", "reaperturas", "E", "Reabrir incidente", true],
    ["ver_dashboard", "dashboard", "V", "Ver dashboard", false],
    ["ver_auditoria", "auditoria", "V", "Consultar auditoría", false],
    ["exportar_auditoria", "auditoria", "E", "Exportar / verificar integridad", false],
    ["ver_reportes", "reportes", "V", "Ver reportes", false],
    ["crear_reporte", "reportes", "C", "Definir reporte", false],
    ["ejecutar_reporte", "reportes", "E", "Ejecutar / exportar reporte", false],
    ["ver_configuracion", "configuracion", "V", "Ver configuración", false],
    ["crear_configuracion", "configuracion", "C", "Crear parámetro", true],
    ["modificar_configuracion", "configuracion", "M", "Modificar parámetro", true]
  ];
  // Asignación por rol (permiso:alcance; g = global, e = equipo, r = responsable, p = propio). ADMIN = todos, global.
  const ASIGNACION = {
    GESTOR: "ver_usuarios:e solicitar_alta_usuario:r ver_equipos:e modificar_equipo:r gestionar_integrantes:r ver_roles:g " +
      "ver:g crear_inc:e editar_inc:e asignar_inc:e agregar_equipo:e tomar_inc:e " +
      "ack_inc:e aprobar_inc_mayor:e ver_sla:e aprobar_excepcion_sla:e ver_escalamientos:e crear_matriz:r " +
      "editar_matriz:r escalar_inc:e ver_notificaciones:e enviar_notificacion:e ver_tareas:e crear_tarea:e " +
      "modificar_tarea:e aprobar_tarea:e ejecutar_tarea:e ver_chat:e escribir_chat:e moderar_chat:e " +
      "ver_notas:e comentar_inc:e modificar_nota:p ver_adjuntos:e subir_adjunto:e gestionar_adjunto:e " +
      "ver_falsos_positivos:e proponer_falso_positivo:e aprobar_falso_positivo:e ver_validaciones:e aprobar_validacion:e ejecutar_validacion:e " +
      "ver_cierres:e cerrar_inc:e resolver_inc:e ver_reaperturas:e aprobar_reapertura:e reabrir_inc:e " +
      "ver_dashboard:g ver_auditoria:e ver_reportes:e crear_reporte:e ejecutar_reporte:e ver_configuracion:g",
    OPERADOR: "ver_usuarios:e ver_equipos:e ver:g crear_inc:e editar_inc:e tomar_inc:e " +
      "ack_inc:e ver_sla:e ver_escalamientos:e escalar_inc:e ver_notificaciones:p ver_tareas:e " +
      "crear_tarea:e modificar_tarea:p ejecutar_tarea:e ver_chat:e escribir_chat:e moderar_chat:p " +
      "ver_notas:e comentar_inc:e modificar_nota:p ver_adjuntos:e subir_adjunto:e gestionar_adjunto:p " +
      "ver_falsos_positivos:e proponer_falso_positivo:e ver_validaciones:e ejecutar_validacion:e ver_cierres:e resolver_inc:e " +
      "ver_reaperturas:e solicitar_reapertura:e ver_dashboard:g ver_reportes:e",
    LECTURA: "ver:g ver_equipos:e ver_sla:e ver_escalamientos:e ver_notificaciones:p ver_tareas:e " +
      "ver_chat:e ver_notas:e ver_adjuntos:e ver_falsos_positivos:e ver_validaciones:e ver_cierres:e " +
      "ver_reaperturas:e ver_dashboard:g ver_reportes:e"
  };
  const ALC = { g:"global", e:"equipo", r:"responsable", p:"propio" };

  // Teléfonos de ejemplo para el canal Llamada (Martín no tiene: así se ve la advertencia en la matriz)
  const TELEFONOS = { 1:"+5491155550101", 2:"+5491155550102", 3:"+5491155550103", 5:"+5491155550105" };
  const usuario = (n, username, nombre, rol) => ({
    id:U(n), username, email:`${username}@noc.local`, nombre, rol, estado:"activo", debe_cambiar_clave:false,
    telefono:TELEFONOS[n] || null, telegram_chat_id:null, ultimo_login:null, motivo_estado:null,
    origen_clave:"local", intentos_fallidos:0, bloqueado_hasta:null, clave_expira_en:null,
    created_by:null, created_at:T0, updated_by:null, updated_at:T0, desactivado_en:null, baja_en:null
  });
  const equipo = (n, codigo, nombre) => ({
    id:E(n), codigo, nombre, descripcion:null, estado:"activo",
    horario:{ modalidad:"24x7" }, zona_horaria:"America/Argentina/Buenos_Aires", email_equipo:null,
    motivo_estado:null, created_by:null, created_at:T0, updated_by:null, updated_at:T0, desactivado_en:null
  });
  let mi = 0;
  const integrante = (team, user, es_responsable = false) => ({
    id:"50000000-0000-0000-0000-0000000000" + String(++mi).padStart(2, "0"), team_id:E(team), user_id:U(user), es_responsable,
    estado:"activo", agregado_por:null, agregado_en:T0, removido_por:null, removido_en:null, motivo_remocion:null
  });
  const nivel = (nivel, espera_min, canales, destinos) => ({ nivel, espera_min, canales, destinos });
  const R_OP = { tipo:"rol", rol:"OPERADOR" }, R_GE = { tipo:"rol", rol:"GESTOR" }, ADM = { tipo:"usuario", id:U(1) };

  return {
    config: {
      prioridad_critica:3, umbrales_disponibilidad:{ ok:99.5, warn:97 }, orden_redes:["Red Fija", "Red Móvil", "Empresas"],
      equipo_por_red:{ "Red Fija":"VOC", "Red Móvil":"SOC" },
      sla_minutos:{ 1:60, 2:120, 3:240, 4:480, 5:720, 6:1440 }, sla_riesgo_pct:0.8, sesion_horas:8,
      motor_url:"http://localhost:5678/webhook/interno/escalamiento", version_api:"1.1",
      zona_horaria:"America/Argentina/Buenos_Aires",
      politica_clave:{ min:12, mayus:true, minus:true, numero:true, temporal_horas:24 },
      login_bloqueo:{ intentos:5, minutos:15 }, solicitud_vence_dias:7
    },
    roles: [
      { id:1, codigo:"ADMIN",    nombre:"Administrador", descripcion:"Gobierno de la plataforma, identidades y configuración", nivel:1, puede_ser_responsable:true,  es_sistema:true },
      { id:2, codigo:"GESTOR",   nombre:"Jefe/Gestor",   descripcion:"Conducción operativa de sus equipos",                   nivel:2, puede_ser_responsable:true,  es_sistema:true },
      { id:3, codigo:"OPERADOR", nombre:"Operador",      descripcion:"Atención y resolución de incidentes de sus equipos",    nivel:3, puede_ser_responsable:false, es_sistema:true },
      { id:4, codigo:"LECTURA",  nombre:"Solo Lectura",  descripcion:"Visibilidad del estado operativo, sin escritura",       nivel:4, puede_ser_responsable:false, es_sistema:true }
    ],
    permisos: PERMISOS.map(([codigo, modulo, tipo, descripcion, requiere_justificacion]) => ({ codigo, modulo, tipo, descripcion, requiere_justificacion })),
    role_permissions: [
      ...PERMISOS.map(([permiso]) => ({ rol:"ADMIN", permiso, alcance:"global" })),
      ...Object.entries(ASIGNACION).flatMap(([rol, s]) => s.trim().split(/\s+/).map(x => { const [permiso, a] = x.split(":"); return { rol, permiso, alcance:ALC[a] }; }))
    ],
    usuarios: [
      usuario(1, "admin", "Administrador", "ADMIN"), usuario(2, "ana", "Ana Gestora", "GESTOR"), usuario(3, "bruno", "Bruno Operador", "OPERADOR"),
      usuario(4, "carla", "Carla Lectura", "LECTURA"), usuario(5, "diego", "Diego Gestor", "GESTOR"), usuario(7, "martin.rios", "Martín Ríos", "OPERADOR")
    ],
    equipos: [ equipo(1, "VOC", "VOC · Red Fija"), equipo(2, "IPTV", "Plataforma IPTV"), equipo(3, "SOC", "SOC · Red Móvil") ],
    integrantes: [
      integrante(1, 2, true), integrante(2, 2), integrante(1, 3), integrante(3, 3), integrante(1, 4), integrante(2, 4), integrante(3, 4),
      integrante(2, 5, true), integrante(3, 5, true), integrante(1, 7)
    ],
    servicios: [
      { id:"fija", nombre:"Fija", red:"Red Fija", grupo:"Acceso", icono:"red", metodo:"inc", activo:true },
      { id:"television", nombre:"Televisión", red:"Red Fija", grupo:"TV", icono:"tv", metodo:"inc", activo:true },
      { id:"voice-ip", nombre:"Voice IP", red:"Red Fija", grupo:"Voz", icono:"telefono", metodo:"inc", activo:true },
      { id:"datos-movil", nombre:"Datos Móviles", red:"Red Móvil", grupo:"4G/5G", icono:"antena", metodo:"inc", activo:true },
      { id:"voz-movil", nombre:"Voz Móvil", red:"Red Móvil", grupo:"VoLTE", icono:"telefono", metodo:"inc", activo:true },
      { id:"sms", nombre:"SMS", red:"Red Móvil", grupo:"Mensajería", icono:"mensaje", metodo:"inc", activo:true }
    ],
    service_teams: [
      { service_id:"fija", team_id:E(1) }, { service_id:"television", team_id:E(2) }, { service_id:"voice-ip", team_id:E(1) }, { service_id:"television", team_id:E(1) },
      { service_id:"datos-movil", team_id:E(3) }, { service_id:"voz-movil", team_id:E(3) }, { service_id:"sms", team_id:E(3) }
    ],
    productos: [
      { id:"internet-hogar", nombre:"Internet Hogar", descripcion:"Acceso fijo residencial (GPON)", estado:"activo" },
      { id:"movil-pospago",  nombre:"Móvil Pospago",  descripcion:"Planes móviles con factura",     estado:"activo" },
      { id:"movil-prepago",  nombre:"Móvil Prepago",  descripcion:"Planes móviles con recarga",     estado:"activo" },
      { id:"tv-hogar",       nombre:"TV Hogar",       descripcion:"IPTV residencial",               estado:"activo" }
    ],
    team_products: [
      { team_id:E(1), product_id:"internet-hogar" }, { team_id:E(2), product_id:"tv-hogar" },
      { team_id:E(3), product_id:"movil-pospago" }, { team_id:E(3), product_id:"movil-prepago" }
    ],
    matrices: [
      { id:M(1), team_id:E(1), version:1, versiones:1, niveles:[ nivel(1, 5, ["app"], [R_OP]), nivel(2, 10, ["app","email"], [R_GE]), nivel(3, 30, ["app","email","telegram","llamada"], [ADM]) ] },
      { id:M(2), team_id:E(2), version:1, versiones:1, niveles:[ nivel(1, 10, ["app"], [R_OP]), nivel(2, 20, ["app","email"], [R_GE]) ] },
      { id:M(3), team_id:E(3), version:1, versiones:1, niveles:[ nivel(1, 5, ["app"], [R_OP]), nivel(2, 15, ["app","email"], [R_GE]), nivel(3, 30, ["app","email","telegram","llamada"], [ADM]) ] }
    ],
    solicitudes: [],
    incidentes_equipo: [
      { incident_id:"30000000-0000-0000-0000-000000000001", inc:"INC000412301", team_id:E(1), estado_equipo:"pendiente", asignado_id:null },
      { incident_id:"30000000-0000-0000-0000-000000000001", inc:"INC000412301", team_id:E(2), estado_equipo:"pendiente", asignado_id:null },
      { incident_id:"30000000-0000-0000-0000-000000000002", inc:"INC000412355", team_id:E(2), estado_equipo:"pendiente", asignado_id:null },
      { incident_id:"30000000-0000-0000-0000-000000000003", inc:"INC000412360", team_id:E(2), estado_equipo:"pendiente", asignado_id:null },
      { incident_id:"30000000-0000-0000-0000-000000000004", inc:"INC000412371", team_id:E(3), estado_equipo:"pendiente", asignado_id:null }
    ],
    escalamientos_vivos: [],
    debates: [], debate_participantes: [], debate_mensajes: [],
    // Respaldo cuando no está el tablero del demo (pruebas sin navegador): mismos INC que app.js
    incidentes_demo: [
      { inc:"INC000412301", servicios:["fija"],      prioridad:1, titulo:"Corte de fibra troncal OLT Norte" },
      { inc:"INC000412355", servicios:["television"],       prioridad:5, titulo:"Pixelado en canales HD" },
      { inc:"INC000412360", servicios:["television"],       prioridad:6, titulo:"Guía de programación desactualizada" },
      { inc:"INC000412371", servicios:["voz-movil"], prioridad:2, titulo:"Llamadas cortadas zona Norte" }
    ]
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = DATOS_DEMO_RBAC;

/* ===== demo/n8n-simulado-rbac.js ===== */
/* =====================================================================
   N8N-SIMULADO-RBAC.JS — backend del módulo RBAC en el Demo Local
   ---------------------------------------------------------------------
   Responde las mismas rutas que los workflows WF32…WF42 de n8n, con las
   mismas reglas (compartido/reglas-rbac.js) y el mismo JSON.
   Reemplaza a PostgreSQL: guarda el estado en localStorage (o en memoria
   si no hay navegador) y aplica cada "plan" como lo hará producción:
   todo o nada, con las mismas guardas de integridad.

   Uso en el navegador (después de reglas-noc.js, reglas-rbac.js y datos-demo-rbac.js):
     const { token } = SimuladorRBAC.ingresar("admin", "demo123");
     SimuladorRBAC.atender({ metodo:"GET", ruta:"/api/usuarios", token })   → { http, cuerpo }
   ===================================================================== */
const SimuladorRBAC = (() => {
  const RB = typeof ReglasRBAC !== "undefined" ? ReglasRBAC : require("../compartido/reglas-rbac.js");
  const SEMILLA = typeof DATOS_DEMO_RBAC !== "undefined" ? DATOS_DEMO_RBAC : require("./datos-demo-rbac.js");
  const CLAVE_LS = "nocRBAC2";
  const CLAVE_DEMO = "demo123";
  const CLAVES_RAW = ["config","roles","permisos","role_permissions","usuarios","equipos","integrantes","servicios","service_teams",
                      "productos","team_products","matrices","matrices_historial","sla_avisos","solicitudes","incidentes_equipo","escalamientos_vivos",
                      "debates","debate_participantes","debate_mensajes"];
  const CLAVE_ADJ = CLAVE_LS + ":adj:";
  const adjMemoria = {};
  let memoria = null;

  /* ---------- Estado ---------- */
  function inicial(){
    const e = JSON.parse(JSON.stringify(SEMILLA));
    return { debates:[], debate_participantes:[], debate_mensajes:[], ...e, claves:{}, sesiones:{}, audit_log:[], notificaciones:[], correos:[], seq:{ audit:0, req:0 } };
  }
  // Se relee en cada pedido: dos pestañas (dos usuarios) comparten el mismo estado, como con un servidor
  function cargar(){
    try { const s = typeof localStorage !== "undefined" && localStorage.getItem(CLAVE_LS); if (s) { memoria = JSON.parse(s); memoria.debates ||= []; memoria.debate_participantes ||= []; memoria.debate_mensajes ||= []; return memoria; } } catch {}
    return memoria || (memoria = inicial());
  }
  function guardar(e){
    memoria = e;
    try { if (typeof localStorage !== "undefined") localStorage.setItem(CLAVE_LS, JSON.stringify(e)); } catch {}
  }
  function reiniciar(){
    memoria = null;
    Object.keys(adjMemoria).forEach(k => delete adjMemoria[k]);
    try { Object.keys(localStorage).filter(k => k.startsWith(CLAVE_LS)).forEach(k => localStorage.removeItem(k)); } catch {}
    return cargar();
  }
  // Tablero del demo (app.js): ahí viven los INC abiertos que muestra la app
  function tableroDemo(){ try { return JSON.parse(localStorage.getItem("datosRed5") || "null"); } catch { return null; } }
  function sumarAlTablero(incs){
    const t = tableroDemo();
    if (!t || !incs.length) return;
    t.incidentes.push(...incs.filter(i => !t.incidentes.some(x => x.inc === i.inc)));
    try { localStorage.setItem("datosRed5", JSON.stringify(t)); } catch {}
  }
  // Servicios del tablero del demo = servicios activos del catálogo (conserva la disponibilidad simulada)
  function serviciosAlTablero(e){
    const t = tableroDemo();
    if (!t) return;
    t.servicios = e.servicios.filter(s => s.activo !== false).map(s => {
      const ya = (t.servicios || []).find(x => x.id === s.id) || {};
      return { ...ya, id:s.id, nombre:s.nombre, red:s.red, grupo:s.grupo ?? null, icono:s.icono || "server", metodo:s.metodo || ya.metodo || "inc" };
    });
    try { localStorage.setItem("datosRed5", JSON.stringify(t)); } catch {}
  }
  function cambiarEnTablero(cambios){
    const t = tableroDemo();
    if (!t || !cambios.length) return;
    cambios.forEach(c => { const x = t.incidentes.find(y => y.inc === c.inc); if (x) Object.assign(x, { prioridad:c.prioridad, grave:c.grave }); });
    try { localStorage.setItem("datosRed5", JSON.stringify(t)); } catch {}
  }
  // Incidentes abiertos: los del tablero del demo (app.js) con sus equipos (asignados o por servicio)
  function incidentesAbiertos(e){
    let lista = null;
    try { lista = JSON.parse(localStorage.getItem("datosRed5") || "null")?.incidentes; } catch {}
    if (!lista && typeof DATOS_DEMO !== "undefined") lista = DATOS_DEMO.incidentes;
    const cerrados = new Set(e.incidentes_cerrados || []);
    return (lista || e.incidentes_demo || []).filter(i => !cerrados.has(i.inc)).map(i => {
      const asignados = e.incidentes_equipo.filter(x => x.inc === i.inc).map(x => x.team_id);
      const porServicio = e.service_teams.filter(x => (i.servicios || []).includes(x.service_id)).map(x => x.team_id);
      return { inc:i.inc, titulo:i.titulo, prioridad:i.prioridad, grave:i.grave ?? null, inicio:i.inicio || null, servicios:i.servicios || [], afectados:i.afectados ?? null,
               descripcion:i.descripcion ?? null,
               equipos:[...new Set([...asignados, ...porServicio])] };
    });
  }
  const foto = (e, ahora) => ({ ...Object.fromEntries(CLAVES_RAW.map(k => [k, e[k] || []])), config:e.config, incidentes:incidentesAbiertos(e),
    reingresos:(e.reingresos || []).filter(r => !r.decidido_en),
    notificaciones:e.notificaciones.filter(n => n.canal === "app"), ahora,
    // Pasos programados de las secuencias de aviso que todavía no salieron (como noc_foto, SQL 031)
    escalamiento_pasos:(e.escalamiento_pasos || []).filter(p => !p.hecho_en && !p.cancelado_en) });
  // Adjuntos: fuera del estado principal (cada uno en su propia clave)
  function leerAdjunto(id){ try { const v = localStorage.getItem(CLAVE_ADJ + id); if (v) return v; } catch {} return adjMemoria[id] || null; }
  function guardarAdjuntos(lista){
    for (const a of lista) {
      if (typeof localStorage === "undefined") { adjMemoria[a.id] = a.datos; continue; }
      try { localStorage.setItem(CLAVE_ADJ + a.id, a.datos); }
      catch { lista.forEach(x => { try { localStorage.removeItem(CLAVE_ADJ + x.id); } catch {} }); return false; }
    }
    return true;
  }

  /* ---------- Sesión demo (el login real es otro workflow) ---------- */
  function ingresar(usuarioOEmail, clave){
    const e = cargar(), q = String(usuarioOEmail || "").toLowerCase();
    const u = e.usuarios.find(x => x.username === q || x.email === q);
    if (!u || u.estado !== "activo" || (e.claves[u.id] || CLAVE_DEMO) !== clave) return { ok:false };
    const token = "demo-" + u.id + "-" + Math.random().toString(36).slice(2, 10);
    e.sesiones[token] = { user_id:u.id };
    guardar(e);
    return { ok:true, token };
  }
  function sesionDe(e, token){
    const s = token && e.sesiones[token];
    if (!s || s.revocada || (s.expira_en && Date.parse(s.expira_en) <= Date.now())) return null;
    return { user_id:s.user_id, sesion_id:token, no_leidas: e.notificaciones.filter(n => n.user_id === s.user_id && n.canal === "app" && !n.leida_en).length };
  }

  /* Verificación de la credencial (en n8n: crypt() en PostgreSQL o bind LDAP). Las reglas nunca ven la clave.
     Demo: clave local = la guardada (demo123 si nunca se cambió) · "directorio" LDAP simulado con la misma clave demo. */
  function verificar(e, raw, modo, sesion, body){
    const u = modo === "actual" ? e.usuarios.find(x => x.id === sesion?.user_id) : e.usuarios.find(x => x.id === RB.verificadorDe(raw, body.usuario).user_id);
    const clave = String((modo === "actual" ? body.actual : body.clave) ?? "");
    if (!u) return { credencial_ok:false, origen:"local" };
    const origen = u.origen_clave === "ldap" ? "ldap" : "local";
    return { credencial_ok: clave !== "" && clave === (origen === "ldap" ? CLAVE_DEMO : (e.claves[u.id] || CLAVE_DEMO)), origen };
  }

  /* ---------- Aplicar plan (referencia de semántica para la integración con PostgreSQL) ---------- */
  const claveTemporal = () => "Nc7" + Array.from({ length:16 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_"[Math.floor(Math.random() * 59)]).join("");
  const falla = m => { throw new Error(m); };
  const SOLO_ACCESO = ["id", "intentos_fallidos", "bloqueado_hasta", "ultimo_login"];

  function aplicarPlan(estado, plan, ahora){
    const e = JSON.parse(JSON.stringify(estado)), claves = [];
    const actor = plan.actor_id || null;
    const L = n => plan[n] || [];
    const rolOk = r => e.roles.some(x => x.codigo === r) || falla(`ROL_INEXISTENTE: ${r}`);

    for (const c of L("usuarios_ins")) {
      rolOk(c.rol);
      const temporal = !c.clave, clave = c.clave || claveTemporal();
      e.usuarios.push({ id:c.id, username:c.username, email:c.email.toLowerCase(), nombre:c.nombre, rol:c.rol, estado:"activo",
        debe_cambiar_clave:true, telefono:c.telefono ?? null, telegram_chat_id:c.telegram_chat_id ?? null, ultimo_login:null, motivo_estado:null,
        origen_clave:c.origen_clave === "ldap" ? "ldap" : "local", intentos_fallidos:0, bloqueado_hasta:null,
        clave_expira_en: temporal ? new Date(Date.parse(ahora) + Number(plan.clave_horas || 24) * 3600000).toISOString() : null,
        created_by:actor, created_at:ahora, updated_by:actor, updated_at:ahora, desactivado_en:null, baja_en:null });
      e.claves[c.id] = clave;
      if (temporal) claves.push({ user_id:c.id, clave });
    }
    for (const c of L("usuarios_upd")) {
      const u = e.usuarios.find(x => x.id === c.id && x.estado !== "baja" && (!c.version || x.updated_at === c.version));
      if (!u) falla("CONFLICTO_EDICION: el usuario cambió mientras se procesaba la operación; volvé a intentarlo");
      for (const k of ["nombre", "username", "telefono", "telegram_chat_id", "estado", "motivo_estado", "disponibilidad",
        "intentos_fallidos", "bloqueado_hasta", "ultimo_login", "debe_cambiar_clave", "clave_expira_en", "origen_clave"]) if (k in c) u[k] = c[k];
      if ("nueva_clave" in c) e.claves[u.id] = c.nueva_clave;          // en PostgreSQL: password_hash = crypt(nueva, gen_salt('bf', 12))
      if ("email" in c) u.email = c.email.toLowerCase();
      if ("rol" in c) { rolOk(c.rol); u.rol = c.rol; }
      if (c.estado === "inactivo") u.desactivado_en = ahora;
      if (c.estado === "baja") u.baja_en = ahora;
      if (c.resetear_clave) { const clave = claveTemporal(); e.claves[u.id] = clave; u.debe_cambiar_clave = true;
        u.clave_expira_en = new Date(Date.parse(ahora) + Number(plan.clave_horas || 24) * 3600000).toISOString(); claves.push({ user_id:u.id, clave }); }
      // Los datos de acceso (intentos, bloqueo, último ingreso) no cuentan como edición del usuario
      if (Object.keys(c).some(k => !SOLO_ACCESO.includes(k))) { u.updated_by = actor; u.updated_at = ahora; }
    }
    let revocadas = 0;
    for (const id of L("sesiones_revocar")) Object.values(e.sesiones).forEach(s => { if (s.user_id === id && !s.revocada) { s.revocada = true; revocadas++; } });
    for (const c of L("sesiones_revocar_otras")) Object.entries(e.sesiones).forEach(([t, s]) => { if (s.user_id === c.user_id && t !== c.excepto && !s.revocada) { s.revocada = true; revocadas++; } });
    for (const t of L("sesiones_cerrar")) if (e.sesiones[t]) e.sesiones[t].revocada = true;
    // Sesiones nuevas: el token se genera acá (en PostgreSQL se guarda solo sha256(token) en sessions.token_hash)
    const sesiones = L("sesiones_ins").map(c => {
      const token = "demo-" + c.user_id + "-" + Array.from({ length:24 }, () => "abcdefghijkmnopqrstuvwxyz23456789"[Math.floor(Math.random() * 33)]).join("");
      e.sesiones[token] = { user_id:c.user_id, expira_en:c.expira_en, creada_en:ahora };
      return { user_id:c.user_id, token, expira_en:c.expira_en };
    });

    for (const c of L("equipos_ins")) e.equipos.push({ id:c.id, codigo:c.codigo, nombre:c.nombre, descripcion:c.descripcion ?? null, estado:"activo",
      horario:c.horario, zona_horaria:c.zona_horaria || "America/Argentina/Buenos_Aires", email_equipo:c.email_equipo ?? null, motivo_estado:null,
      created_by:actor, created_at:ahora, updated_by:actor, updated_at:ahora, desactivado_en:null });
    for (const c of L("equipos_upd")) {
      const t = e.equipos.find(x => x.id === c.id && (!c.version || x.updated_at === c.version));
      if (!t) falla("CONFLICTO_EDICION: el equipo cambió mientras se procesaba la operación; volvé a intentarlo");
      for (const k of ["nombre", "descripcion", "horario", "zona_horaria", "email_equipo", "estado", "motivo_estado"]) if (k in c) t[k] = c[k];
      if (c.estado === "inactivo") t.desactivado_en = ahora;
      t.updated_by = actor; t.updated_at = ahora;
    }
    for (const c of L("integrantes_ins")) e.integrantes.push({ id:c.id, team_id:c.team_id, user_id:c.user_id, es_responsable:!!c.es_responsable,
      estado:"activo", agregado_por:actor, agregado_en:ahora, removido_por:null, removido_en:null, motivo_remocion:null });
    for (const c of L("integrantes_upd")) {
      const m = e.integrantes.find(x => x.id === c.id && x.estado === "activo");
      if (!m) falla("CONFLICTO_EDICION: un integrante cambió mientras se procesaba la operación; volvé a intentarlo");
      if ("es_responsable" in c) m.es_responsable = !!c.es_responsable;
      if (c.estado === "removido") Object.assign(m, { estado:"removido", removido_por:actor, removido_en:ahora, motivo_remocion:c.motivo_remocion ?? null });
    }
    for (const c of L("servicios_ins")) if (!e.service_teams.some(x => x.service_id === c.service_id && x.team_id === c.team_id)) e.service_teams.push({ service_id:c.service_id, team_id:c.team_id });
    for (const c of L("catalogo_servicios")) {    // Configuración → Servicios (alta o modificación)
      if (c.eliminar) { e.servicios = e.servicios.filter(y => y.id !== c.id); e.service_teams = e.service_teams.filter(y => y.service_id !== c.id); continue; }
      const x = e.servicios.find(y => y.id === c.id);
      if (x) Object.assign(x, c); else e.servicios.push({ ...c });
    }
    for (const c of L("servicios_del")) e.service_teams = e.service_teams.filter(x => !(x.service_id === c.service_id && x.team_id === c.team_id));
    for (const c of L("productos_ins")) if (!e.team_products.some(x => x.product_id === c.product_id && x.team_id === c.team_id)) e.team_products.push({ team_id:c.team_id, product_id:c.product_id });
    for (const c of L("productos_del")) e.team_products = e.team_products.filter(x => !(x.product_id === c.product_id && x.team_id === c.team_id));
    for (const c of L("matrices_ins")) e.matrices.push({ id:c.id, team_id:c.team_id, version:c.version, versiones:c.version, niveles:c.niveles });
    for (const c of L("config_upd")) e.config[c.clave] = c.valor;
    for (const k of L("sla_avisos")) { e.sla_avisos ||= []; if (!e.sla_avisos.includes(k)) e.sla_avisos.push(k); }
    const incidentesCambiados = L("incidentes_upd");      // cambio de categoría: se aplica al tablero (o a los INC del demo)
    for (const c of incidentesCambiados) { const x = (e.incidentes_demo || []).find(y => y.inc === c.inc); if (x) Object.assign(x, { prioridad:c.prioridad, grave:c.grave }); }     // configuración (p. ej. política de notificaciones)
    for (const id of L("reingresos_avisados")) { const r = (e.reingresos || []).find(x => x.id === id); if (r && !r.avisado_en) r.avisado_en = ahora; }
    for (const c of L("reingresos_decidir")) {   // SQL 035: reabrir vuelve a abrir el INC con sus equipos pendientes
      const r = (e.reingresos || []).find(x => x.id === c.id && !x.decidido_en); if (!r) continue;
      Object.assign(r, { decidido_en:ahora, decision:c.decision, decidido_por:plan.actor_id || null });
      if (c.decision === "reabrir") {
        e.incidentes_cerrados = (e.incidentes_cerrados || []).filter(x => x !== r.inc);
        e.incidentes_equipo.filter(x => x.inc === r.inc).forEach(x => Object.assign(x, { estado_equipo:"pendiente", asignado_id:null, reconocido_por:null, reconocido_en:null }));
        e.escalamientos_vivos = e.escalamientos_vivos.filter(x => x.inc !== r.inc);
      }
    }
    for (const c of L("incidentes_cerrar")) { e.incidentes_cerrados ||= []; if (!e.incidentes_cerrados.includes(c.inc)) e.incidentes_cerrados.push(c.inc); }   // SQL 033
    for (const c of L("inc_equipo_upd")) {    // estado del equipo en el INC (tomar / reconocer)
      let x = e.incidentes_equipo.find(y => y.inc === c.inc && y.team_id === c.team_id);
      if (!x) e.incidentes_equipo.push(x = { incident_id:c.incident_id || null, inc:c.inc, team_id:c.team_id });
      Object.assign(x, { estado_equipo:c.estado_equipo, asignado_id:c.asignado_id ?? null, reconocido_por:c.reconocido_por ?? null, reconocido_en:c.reconocido_en ?? null });
    }
    for (const c of L("colaboradores_del")) {  // quien se va deja de figurar como colaborador (en un INC o en todos)
      e.incidentes_equipo.filter(x => (!c.inc || x.inc === c.inc) && (!Array.isArray(c.team_ids) || c.team_ids.includes(x.team_id)))
        .forEach(x => { x.colaboradores = (x.colaboradores || []).filter(u => u !== c.user_id); });
    }
    for (const c of L("inc_colaboradores_ins")) {  // varias personas en el mismo INC
      let x = e.incidentes_equipo.find(y => y.inc === c.inc && y.team_id === c.team_id);
      if (!x) e.incidentes_equipo.push(x = { incident_id:c.incident_id || null, inc:c.inc, team_id:c.team_id, estado_equipo:"reconocido", asignado_id:null });
      x.colaboradores = [...new Set([...(x.colaboradores || []), c.user_id])];
    }
    for (const c of L("escalamientos_upd")) { // corrida de escalamiento por INC y equipo
      const i = e.escalamientos_vivos.findIndex(y => y.inc === c.inc && y.team_id === c.team_id);
      if (i >= 0) e.escalamientos_vivos[i] = { ...c }; else e.escalamientos_vivos.push({ ...c });
    }
    for (const c of L("matrices_ver")) {      // nueva versión: la anterior pasa al historial (inmutable)
      e.matrices_historial ||= [];
      const i = e.matrices.findIndex(x => x.team_id === c.team_id), ant = i >= 0 ? e.matrices[i] : null;
      if ((ant?.version ?? null) !== c.version_anterior) falla("CONFLICTO_EDICION: la matriz cambió mientras se procesaba la operación; volvé a intentarlo");
      if (ant) { e.matrices_historial.push({ ...ant, reemplazada_por:actor, reemplazada_en:ahora }); e.matrices.splice(i, 1); }
      e.matrices.push({ id:c.id, team_id:c.team_id, version:c.version, versiones:c.version, niveles:c.niveles, creada_por:actor, creada_en:ahora });
    }
    for (const c of L("solicitudes_ins")) e.solicitudes.unshift({ ...c, email:c.email.toLowerCase(), estado:"pendiente", solicitado_por:actor, solicitado_en:ahora,
      resuelto_por:null, resuelto_en:null, motivo_resolucion:null, user_id:null });
    for (const c of L("solicitudes_upd")) {
      const s = e.solicitudes.find(x => x.id === c.id && x.estado === "pendiente");
      if (!s) falla("SOLICITUD_NO_PENDIENTE: la solicitud ya fue resuelta");
      Object.assign(s, { estado:c.estado, resuelto_por:c.estado === "vencida" ? null : actor, resuelto_en:ahora,
                         motivo_resolucion:c.motivo_resolucion ?? null, user_id:c.user_id ?? null });
    }
    for (const c of L("asignaciones_liberar")) e.incidentes_equipo.filter(x => x.incident_id === c.incident_id && x.team_id === c.team_id).forEach(x => { x.asignado_id = null; });
    for (const t of L("escalamientos_detener")) e.escalamientos_vivos = e.escalamientos_vivos.filter(x => x.team_id !== t);
    for (const c of L("debates_ins")) e.debates.push({ id:c.id, inc:c.inc, titulo:c.titulo, prioridad:c.prioridad ?? null, equipos:c.equipos,
      estado:"abierto", abierto_por:actor, abierto_en:ahora, cerrado_por:null, cerrado_en:null, motivo_cierre:null });
    for (const c of L("debates_upd")) {
      const d = e.debates.find(x => x.id === c.id && x.estado === "abierto");
      if (!d) falla("CONFLICTO_EDICION: el debate cambió mientras se procesaba la operación; volvé a intentarlo");
      if (c.estado === "cerrado") Object.assign(d, { estado:"cerrado", cerrado_por:actor, cerrado_en:ahora, motivo_cierre:c.motivo_cierre ?? null });
    }
    for (const c of L("participantes_ins")) {
      if (e.debate_participantes.some(x => x.debate_id === c.debate_id && x.user_id === c.user_id && x.estado === "activo"))
        falla("duplicate key value violates unique constraint \"un_participante_activo\"");
      e.debate_participantes.push({ id:c.id, debate_id:c.debate_id, user_id:c.user_id, origen:c.origen, estado:"activo", unido_en:ahora, salio_en:null, leido_hasta:null });
    }
    for (const c of L("participantes_upd")) {
      const p = e.debate_participantes.find(x => x.id === c.id && x.estado === "activo");
      if (!p) continue;
      if ("leido_hasta" in c && (!p.leido_hasta || c.leido_hasta > p.leido_hasta)) p.leido_hasta = c.leido_hasta;
      if (c.estado === "salio") Object.assign(p, { estado:"salio", salio_en:ahora });
    }
    const adjuntos = [];
    for (const c of L("mensajes_ins")) {
      const adjunto = c.adjunto ? { id:c.adjunto.id, nombre:c.adjunto.nombre, tipo:c.adjunto.tipo, tamano:c.adjunto.tamano } : null;
      if (c.adjunto) adjuntos.push({ id:c.adjunto.id, datos:c.adjunto.datos });
      e.debate_mensajes.push({ id:c.id, debate_id:c.debate_id, user_id:c.user_id, tipo:c.tipo, texto:c.texto ?? null, adjunto, creado_en:ahora, eliminado_en:null, eliminado_por:null,
        fijado:!!c.fijado, fijado_por:c.fijado ? actor : null, fijado_en:c.fijado ? ahora : null, menciones:c.menciones || [], menciones_equipos:c.menciones_equipos || [] });
    }
    for (const c of L("mensajes_upd")) {
      const m = e.debate_mensajes.find(x => x.id === c.id && !x.eliminado_en);
      if (m && c.eliminado) Object.assign(m, { eliminado_en:ahora, eliminado_por:actor, fijado:false });
      if (m && "fijado" in c) Object.assign(m, c.fijado ? { fijado:true, fijado_por:actor, fijado_en:ahora } : { fijado:false, fijado_por:null, fijado_en:null });
    }
    const incidentesNuevos = L("incidentes_ins").map(c => ({ inc:c.inc, titulo:c.titulo, prioridad:c.prioridad, servicios:c.servicios, inicio:c.inicio, grave:c.grave || "no" }));
    if (incidentesNuevos.length && !tableroDemo()) e.incidentes_demo = [...(e.incidentes_demo || []), ...incidentesNuevos];
    for (const c of L("notificaciones")) e.notificaciones.push({ id:"n" + (e.notificaciones.length + 1), ...c, created_at:ahora, leida_en:null,
      estado_envio: c.canal === "app" ? "enviada" : "pendiente" });
    // Secuencias de aviso (SQL 031): pasos programados, pasos ya mandados y corte al tomar o cerrar el INC
    e.escalamiento_pasos ||= [];
    for (const c of L("pasos_ins")) if (!e.escalamiento_pasos.some(x => x.id === c.id)) e.escalamiento_pasos.push({ ...c, hecho_en:null, cancelado_en:null });
    for (const id of L("pasos_hechos")) { const x = e.escalamiento_pasos.find(y => y.id === id && !y.hecho_en && !y.cancelado_en); if (x) x.hecho_en = ahora; }
    for (const c of L("pasos_cancelar")) {
      e.escalamiento_pasos.filter(x => x.inc === c.inc && x.team_id === c.team_id && !x.hecho_en && !x.cancelado_en).forEach(x => { x.cancelado_en = ahora; });
      e.notificaciones.filter(n => n.inc === c.inc && n.team_id === c.team_id && n.tipo === "escalamiento" && n.canal !== "app" && n.estado_envio === "pendiente")
        .forEach(n => { n.estado_envio = "cancelada"; });
    }
    // Como noc_limpiar: lo ya resuelto no se guarda para siempre
    e.escalamiento_pasos = e.escalamiento_pasos.filter(x => !(x.hecho_en || x.cancelado_en) || Date.parse(ahora) - Date.parse(x.hecho_en || x.cancelado_en) < 86400000);
    for (const id of L("notificaciones_leer")) { const n = e.notificaciones.find(x => String(x.id) === String(id)); if (n && !n.leida_en) n.leida_en = ahora; }
    for (const c of L("auditoria")) e.audit_log.push({ id:++e.seq.audit, ts:ahora, ...c, origen:plan.origen || "DEMO", execution_id:plan.execution_id || null });

    guardas(e);
    return { estado:e, adjuntos, incidentesNuevos, incidentesCambiados, aplicado:{ consistente:true, auditados:L("auditoria").length, sesiones_revocadas:revocadas, claves_temporales:claves, sesiones } };
  }

  // Mismas guardas que 003 (constraint triggers + EXCLUDE + índices únicos)
  function guardas(e){
    const rol = c => e.roles.find(r => r.codigo === c);
    if (!e.usuarios.some(u => u.rol === "ADMIN" && u.estado === "activo")) falla("ULTIMO_ADMIN: debe existir al menos un Administrador activo");
    const vistos = new Set(), resp = new Set();
    for (const m of e.integrantes.filter(x => x.estado === "activo")) {
      const par = m.team_id + "|" + m.user_id;
      if (vistos.has(par)) falla("duplicate key value violates unique constraint \"un_integrante_activo\""); vistos.add(par);
      if (m.es_responsable) {
        if (resp.has(m.team_id)) falla("conflicting key value violates exclusion constraint \"un_responsable_por_equipo\""); resp.add(m.team_id);
        const u = e.usuarios.find(x => x.id === m.user_id);
        if (!u || u.estado !== "activo" || !rol(u.rol)?.puede_ser_responsable) falla("RESPONSABLE_INVALIDO: el responsable debe ser Administrador o Jefe/Gestor activo");
      }
    }
    for (const t of e.equipos.filter(x => x.estado === "activo")) if (!resp.has(t.id)) falla("EQUIPO_SIN_RESPONSABLE: un equipo activo debe tener responsable");
    const unico = (lista, campo, idx) => { const s = new Set(); lista.forEach(x => { const v = String(x[campo]).toLowerCase(); if (s.has(v)) falla(`duplicate key value violates unique constraint "${idx}"`); s.add(v); }); };
    unico(e.usuarios, "email", "users_email_uq"); unico(e.usuarios, "username", "users_username_uq");
    unico(e.equipos, "codigo", "teams_codigo_key"); unico(e.equipos, "nombre", "teams_nombre_uq");
  }

  /* ---------- Auditoría: misma proyección que v_auditoria y mismo filtro que aplicará producción ---------- */
  function vistaAuditoria(e, a){
    const tz = e.config.zona_horaria || "UTC";
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone:tz, year:"numeric", month:"2-digit", day:"2-digit",
      hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23" }).formatToParts(new Date(a.ts)).map(x => [x.type, x.value]));
    const u = e.usuarios.find(x => x.id === a.actor_id), t = e.equipos.find(x => x.id === a.team_id);
    return { id:a.id, fecha:`${p.year}-${p.month}-${p.day}`, hora:`${p.hour}:${p.minute}:${p.second}`, ts:a.ts,
      usuario_id:a.actor_id, usuario:u ? u.username : a.actor_tipo, usuario_nombre:u ? u.nombre : null,
      accion:a.accion, entidad:a.entidad, entidad_id:a.entidad_id, equipo_id:a.team_id, equipo:t ? t.nombre : null,
      valor_anterior:a.datos?.antes ?? null, valor_nuevo:a.datos?.despues ?? null, justificacion:a.datos?.justificacion ?? null,
      request_id:a.datos?.request_id ?? null, origen:a.origen, execution_id:a.execution_id };
  }
  function consultarAuditoria(e, f){
    return e.audit_log.map(a => vistaAuditoria(e, a)).filter(v =>
      (!f.equipo_id || v.equipo_id === f.equipo_id) && (!f.entidad || v.entidad === f.entidad) &&
      (!f.entidad_id || v.entidad_id === f.entidad_id) && (!f.usuario_id || v.usuario_id === f.usuario_id) &&
      (!f.accion || v.accion === f.accion) && v.ts >= f.desde && v.ts < f.hasta &&
      (f.es_admin || f.equipos.includes(v.equipo_id) || (v.equipo_id == null && v.entidad_id === f.actor_id))
    ).sort((a, b) => b.id - a.id).slice(f.offset, f.offset + f.limite);
  }

  /* ---------- Router: mismas rutas que los webhooks ---------- */
  const RUTAS = RB.RUTAS.filter(r => r.ruta).map(r => ({ ...r,
    re: new RegExp("^" + r.ruta.replace(/:([a-z_]+)/g, "(?<$1>[^/]+)") + "$"), estatica: !r.ruta.includes(":") }))
    .sort((a, b) => Number(b.estatica) - Number(a.estatica));

  // Motor de escalamiento (WF20): en el demo corre antes de atender cada pedido
  function motor(e, t){
    const plan = RB.avanzarEscalamientos(foto(e, t), { origen:"WF20", ahora:t });
    if (!RB.LISTAS_PLAN.some(l => (plan[l] || []).length)) return e;
    try { const r = aplicarPlan(e, plan, t); guardar(r.estado); return r.estado; } catch { return e; }
  }
  // Solo demo: acelera los minutos de la matriz (60 = cada minuto dura un segundo)
  function velocidad(f){
    const e = cargar(), antes = e.config.escalamiento_factor || 1;
    if (f == null) return antes;
    const nuevo = Math.max(1, Number(f) || 1), ahora = Date.now();
    e.config.escalamiento_factor = nuevo;
    // Las esperas en curso se reescalan para que el cambio se note enseguida
    e.escalamientos_vivos.filter(r => r.estado === "esperando" && r.proximo_en).forEach(r => {
      r.proximo_en = new Date(ahora + Math.max(0, Date.parse(r.proximo_en) - ahora) * antes / nuevo).toISOString(); });
    guardar(e);
    return nuevo;
  }

  function atender({ metodo = "GET", ruta, token = null, body = {}, query = {}, ids = [], ahora = null } = {}){
    const t = ahora || new Date().toISOString();
    let e = motor(cargar(), t);
    const [camino, qs] = String(ruta || "").replace(/^\/?(api\/)?/, "").split("?");
    if (qs) new URLSearchParams(qs).forEach((v, k) => { query[k] = v; });
    const r = RUTAS.find(x => x.metodo === metodo.toUpperCase() && x.re.test(camino));
    if (!r) return { ...RB.errorBD("RUTA_INEXISTENTE: la ruta no existe", null, foto(e, t), t), http:404 };
    const params = { ...(camino.match(r.re).groups || {}) };
    const sesion = sesionDe(e, token), raw = foto(e, t);
    const entrada = { params, query, body:body || {}, ids, meta:{ request_id:`demo-${++e.seq.req}`, origen:r.wf, execution_id:null, ahora:t } };
    if (r.verifica) entrada.verificacion = verificar(e, raw, r.verifica, sesion, entrada.body);
    const res = RB.ejecutar(r.operacion, entrada, sesion, raw);
    let aplicado = null;
    // Como en n8n: la consulta de auditoría se lee ANTES de registrar la propia consulta
    const filas = r.tipo === "auditoria" && res.ok ? consultarAuditoria(e, res.consulta) : null;
    if (res.plan) {
      let adjuntos = [], incidentesNuevos = [], incidentesCambiados = [];
      try { ({ estado:e, aplicado, adjuntos, incidentesNuevos, incidentesCambiados } = aplicarPlan(e, res.plan, t)); }
      catch (err) { return RB.errorBD(err.message, sesion, raw, t); }
      sumarAlTablero(incidentesNuevos);
      cambiarEnTablero(incidentesCambiados);
      if ((res.plan.catalogo_servicios || []).length) serviciosAlTablero(e);
      if (!guardarAdjuntos(adjuntos)) return { ...RB.errorBD("ALMACENAMIENTO_LLENO: no hay más espacio en el navegador para adjuntos; reiniciá los datos demo", sesion, raw, t), http:507 };
    }
    guardar(e);
    if (r.tipo === "ingreso") return RB.responderIngreso(res, aplicado, foto(e, t), t);
    if (r.tipo === "adjunto") return RB.responderAdjunto(res, res.ok ? leerAdjunto(res.adjunto.id) : null, sesion, foto(e, t), t);
    if (r.tipo === "auditoria") return res.ok ? RB.responderAuditoria(res, filas, sesion, foto(e, t), t) : { http:res.http, cuerpo:res.cuerpo };
    if (!res.ok || res.cuerpo) return { http:res.http, cuerpo:res.cuerpo };
    const out = RB.responder(res, sesion, foto(e, t), t);
    const enviados = RB.correos(res, aplicado);
    if (enviados.length) { e.correos.push(...enviados.map(c => ({ ...c, enviado_en:t }))); guardar(e); }
    return out;
  }

  function vencerSolicitudes(ahora = new Date().toISOString()){
    let e = cargar();
    const plan = RB.vencerSolicitudes(foto(e, ahora), { origen:"WF42", ahora });
    ({ estado:e } = aplicarPlan(e, plan, ahora));
    guardar(e);
    return plan.solicitudes_upd.length;
  }

  return { atender, ingresar, reiniciar, vencerSolicitudes, velocidad, motor:(t = new Date().toISOString()) => motor(cargar(), t), estado:cargar, aplicarPlan,
    // Para probar los workflows de n8n con el simulador haciendo de PostgreSQL (tests/n8n-api.test.js)
    bd:{ foto:(t = new Date().toISOString()) => foto(cargar(), t), sesion:token => sesionDe(cargar(), token), guardar, guardarAdjuntos, leerAdjunto,
         consultarAuditoria:f => consultarAuditoria(cargar(), f) } };
})();
if (typeof module !== "undefined" && module.exports) module.exports = SimuladorRBAC;
