// Planificación (proyectos, personal con pincel, estadísticas, pantalla de taller), ausencias y pestaña Equipo
const V = new URL(import.meta.url).search;
const { ESTADOS_COM, COL_COM, GRUPOS_COM, estadoCom, confirmado, caido, riesgos, neonOn, setNeon, ordenProyectos } = await import("./estados.js" + V);

const FASES = ["Montaje", "Desmontaje", "Carga", "Descarga", "Fábrica"];
// Colores y abreviaturas del Gantt (los mismos que en Power Apps)
const COL = { Carga: "#8A949C", Montaje: "#F2C230", Evento: "#2F8F83", Desmontaje: "#E8833A", Descarga: "#1F3A68", "Fábrica": "#CFE6A8", Ausencia: "#8E9C9C" };
const ABR = { Carga: "C", Montaje: "M", Evento: "E", Desmontaje: "DS", Descarga: "DC", "Fábrica": "F" };
const OSCURO = new Set(["#F2C230", "#CFE6A8", "#AEB9B9", "#D5DCDC"]); // fondos claros: texto oscuro
const MOVS = ["Carga", "Montaje", "Desmontaje", "Descarga"];
const TIPOS_AUS = ["Vacaciones", "Baja", "Curso", "Otros"];
// Códigos de jornada (pincel)
const COD = {
  MO: ["Montaje", "#F2C230", "M"], DM: ["Desmontaje", "#E8833A", "DS"], PV: ["Previsión", "#F2C230", "M"], FA: ["Fábrica", "#CFE6A8", "F"],
  RE: ["Reunión / visita", "#1DCAD3", "R"], FO: ["Formación", "#3B4955", "FO"], VA: ["Vacaciones", "#8E9C9C", "V"], LIC: ["Licencia / permiso", "#AEB9B9", "L"],
  BA: ["Baja", "#E62643", "B"], ND: ["No disponible", "#5B6770", "ND"], LB: ["Libre", "#D5DCDC", "LB"],
  // Viajes: dos violetas parecidos entre sí y distintos del resto
  VI: ["Viaje ida", "#6D3FD1", "VI"], VV: ["Viaje vuelta", "#9B7BE6", "VV"],
};
const CON_PROY = ["MO", "DM", "VI", "VV", "PV", "RE"];
// Leyenda y marcado: producción y resto (ausencias y formación)
const COD_PROD = ["MO", "DM", "VI", "VV", "FA", "RE"], COD_OTROS = ["FO", "VA", "BA", "ND"];
// Códigos retirados: la previsión se ve como montaje; licencia y libre no se muestran
const normCod = c => c === "PV" ? "MO" : c === "LB" || c === "LIC" ? null : c;
// Subcontratas: primero CDF, luego DIMAS, después el resto
const rSub = o => { const e = (o.puesto || "").toUpperCase(); return e === "CDF" ? 0 : e === "DIMAS" ? 1 : 2; };
const ORDEN_PER = (a, b) => (a.grupo === "Taller" && b.grupo === "Taller" ? ((a.subgrupo === "Montaje") - (b.subgrupo === "Montaje")) : 0) || (a.grupo === "Subcontratas" && b.grupo === "Subcontratas" ? (rSub(a) - rSub(b)) || (a.puesto || "").localeCompare(b.puesto || "", "es") : 0) || a.nombre.localeCompare(b.nombre, "es", { numeric: true });
const AUS2COD = { Vacaciones: "VA", Baja: "BA", Curso: "FO", Otros: "LIC" };
const FASE2COD = { Montaje: "MO", Desmontaje: "DM", "Fábrica": "FA" };

const iso = d => d.toLocaleDateString("sv-SE");
const pd = s => s ? new Date(s + "T00:00:00") : null;
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const rotuloMeses = (a, b) => { const x = pd(a), y = pd(b); if (x.getMonth() === y.getMonth() && x.getFullYear() === y.getFullYear()) return `${MESES[x.getMonth()]} ${x.getFullYear()}`; const m = d => MESES[d.getMonth()].slice(0, 3); return x.getFullYear() === y.getFullYear() ? `${m(x)} – ${m(y)} ${y.getFullYear()}` : `${m(x)} ${x.getFullYear()} – ${m(y)} ${y.getFullYear()}`; };
const suma = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return iso(d); };
const lunes = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const fd0 = s => s ? s.slice(8, 10) + "/" + s.slice(5, 7) : "";
const enR = (dia, a, b) => a && dia >= a && dia <= (b || a);
const corto = (s, n = 14) => (s || "").length > n ? s.slice(0, n - 1) + "…" : (s || "");
const cuando = t => t ? new Date(t).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
const lsGet = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };

// Lee todas las filas (Supabase devuelve como máximo 1000 por consulta)
async function todas(sb, tabla) {
  const out = [];
  for (let i = 0; ; i += 1000) {
    const r = await sb.from(tabla).select("*").order("fecha").order("operario_id").range(i, i + 999);
    if (r.error) return { error: r.error, data: out };
    out.push(...r.data);
    if (r.data.length < 1000) return { data: out, error: null };
  }
}
async function cargaPlan(sb) {
  const [a, au, f, j] = await Promise.all([
    sb.from("asignaciones").select("*"),
    sb.from("ausencias").select("*"),
    sb.from("festivos").select("*"),
    todas(sb, "jornadas"),
  ]);
  for (const r of [a, au, f]) if (r.error) throw r.error;
  return { asig: a.data, aus: au.data, fest: f.data.filter(x => x.ambito !== "Comunidad de Madrid"), jor: j.error ? [] : j.data };
}

function fasesProyecto(p) {
  const out = [];
  if (p.hay_carga !== false && p.fecha_carga) out.push(["Carga", p.fecha_carga, p.fecha_carga_fin || p.fecha_carga]);
  if (p.hay_montaje !== false && p.fecha_montaje) out.push(["Montaje", p.fecha_montaje, p.fecha_montaje_fin || (p.evento_inicio ? suma(p.evento_inicio, -1) : p.fecha_montaje)]);
  if (p.hay_evento !== false && p.evento_inicio) out.push(["Evento", p.evento_inicio, p.evento_fin || p.evento_inicio]);
  if (p.hay_desmontaje !== false && p.fecha_desmontaje) out.push(["Desmontaje", p.fecha_desmontaje, p.fecha_desmontaje_fin || p.fecha_desmontaje]);
  if (p.hay_retorno !== false && p.fecha_descarga) out.push(["Descarga", p.fecha_descarga, p.fecha_descarga_fin || p.fecha_descarga]);
  return out.map(([f, a, b]) => [f, a, b < a ? a : b]);
}

function cabecera(dias, fest, etiqueta = "") {
  const meses = []; dias.forEach((d, i) => { const m = pd(d).toLocaleDateString("es-ES", { month: "long", year: "numeric" }).toUpperCase(); if (!meses.length || meses[meses.length - 1].m !== m) meses.push({ m, i, n: 1 }); else meses[meses.length - 1].n++; });
  const hoy = iso(new Date());
  return `<div class="gh gm"><div class="gn"></div>${meses.map(x => `<div class="gmes" style="grid-column:span ${x.n}"><div><span>${x.m}</span></div></div>`).join("")}</div>
  <div class="gh gdias"><div class="gn glab">${etiqueta}</div>${dias.map(d => { const w = pd(d).getDay(); const fe = fest.find(f => f.fecha === d); return `<div class="gd ${w === 0 || w === 6 || fe ? "we" : ""} ${d === hoy ? "hoy" : ""}" title="${fe ? esc0(fe.nombre) : ""}"><b>${"DLMXJVS"[w]}-${pd(d).getDate()}</b></div>`; }).join("")}</div>`;
}
const esc0 = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// Fondo de cada fila: cuadrícula de días, findes/festivos en gris y el día de hoy resaltado
function fondo(dias, fest, fab) {
  const hoy = iso(new Date());
  return dias.map((d, i) => `<div class="bg ${esFestivo(d, fest) ? "we" : ""} ${d === hoy ? "hoy" : ""} ${fab && fab[i] ? "fab" : ""}" style="grid-column:${i + 2}"></div>`).join("");
}
// Día largo para el bocadillo: "lunes 30/11"
const diaTip = d => { const x = pd(d); return `${["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][x.getDay()]} ${x.getDate()}/${x.getMonth() + 1}`; };
// Personal que cuenta como "en taller": Taller y montaje + Externos, sin jefe de taller, team leader ni expediciones
const EN_TALLER = o => o.activo !== false && ["Taller", "Externos"].includes(o.grupo) && !/JEFE|TEAM LEADER|EXPEDIC/i.test(o.puesto || "");
// Barra continua que ocupa varios días (mismo estilo en Proyectos y en Personal)
function barra(i, span, cols, txt, w, extra = "", attrs = "", izq = false) {
  const bg = cols.length > 1 ? `linear-gradient(90deg,${cols[0]} 50%,${cols[1]} 50%)` : cols[0];
  const fg = OSCURO.has(cols[0]) && (cols.length === 1 || OSCURO.has(cols[1])) ? "#131E29" : "#fff";
  const ancho = span * w - 6, cw = cols.length > 1 ? 4.8 : 5.4;
  // Con proyecto: siempre su nombre (recortado con "…" si no cabe), nunca la abreviatura
  const t = izq ? txt.full : txt.abr;
  const cabe = izq || t.length * cw + 6 <= ancho;
  // Con hora: siempre en dos líneas (la hora se ve aunque la barra sea corta)
  if (txt.hora) return `<div class="pc pcs" style="grid-column:${i + 2}/span ${span}"><div class="pl larga l2 ${ancho >= 44 ? "izq" : ""} ${extra}" style="background:${bg};color:${fg}" ${attrs}><span>${t}</span><small>${txt.hora}</small></div></div>`;
  return `<div class="pc pcs" style="grid-column:${i + 2}/span ${span}"><div class="pl larga ${izq && ancho >= 44 ? "izq" : ""} ${cols.length > 1 ? "dos" : ""} ${extra}" style="background:${bg};color:${fg}" ${attrs}>${cabe ? t : ""}</div></div>`;
}
// Píldora de un día: 1 o 2 colores, con abreviatura si cabe
function pildora(cols, txt, w, extra = "", attrs = "") {
  const bg = cols.length > 1 ? `linear-gradient(90deg,${cols[0]} 50%,${cols[1]} 50%)` : cols[0];
  const fg = OSCURO.has(cols[0]) && (cols.length === 1 || OSCURO.has(cols[1])) ? "#131E29" : "#fff";
  const dos = cols.length > 1, cw = dos ? 5.4 : 6.6;
  const cabe = txt.length * cw + 6 <= Math.min(w - 4, 46);
  return `<div class="pl ${dos ? "dos" : ""} ${extra}" style="background:${bg};color:${fg}" ${attrs}>${cabe ? txt : ""}</div>`;
}
const esFestivo = (d, fest) => { const w = pd(d).getDay(); return w === 0 || w === 6 || fest.some(f => f.fecha === d); };

// Qué hace una persona un día: jornada pintada > ausencia > asignación > montaje de sus proyectos (Fronts)
function motorDias(S, D) {
  const J = new Map(D.jor.map(j => [j.operario_id + "|" + j.fecha, j]));
  const P = new Map(S.proyectos.map(p => [p.id, p]));
  const motor = (o, d) => {
    const j = J.get(o.id + "|" + d);
    if (j) return { cod: j.codigo, p: P.get(j.proyecto_id), quien: j.autor, cuando: j.actualizado, src: "Pintado a mano", nota: j.nota };
    const au = D.aus.find(a => a.operario_id === o.id && enR(d, a.desde, a.hasta));
    if (au) return { cod: AUS2COD[au.tipo] || "LIC", quien: au.registrado_por, cuando: au.created_at, src: "Ausencia: " + (au.tipo || "") };
    const as = D.asig.find(a => a.operario_id === o.id && enR(d, a.fecha_inicio, a.fecha_fin) && FASE2COD[a.fase]);
    if (as) { const p = P.get(as.proyecto_id); return { cod: FASE2COD[as.fase], p, quien: as.creado_por, cuando: as.created_at, src: "Asignación: " + as.fase }; }
    if (o.grupo === "Fronts") {
      const p = S.proyectos.find(x => x.front_id === o.id && !x.archivado && !caido(x) && fasesProyecto(x).some(([f, a, b]) => f === "Montaje" && enR(d, a, b)));
      if (p) return { cod: "MO", p, src: "Montaje de su proyecto" + (confirmado(p) ? "" : " (sin confirmar)") };
    }
    return null;
  };
  return (o, d) => { const x = motor(o, d); if (!x) return null; const c = normCod(x.cod); return c ? { ...x, cod: c } : null; };
}

// ---------- Planificación ----------
// Zoom: nº de días visibles y ancho de columna
const ZOOM = [[14, 64], [28, 44], [42, 30], [84, 17]];
// Qué códigos puede marcar cada rol (el resto, solo SuperAdmin)
const COD_TRABAJO = [...COD_PROD, "FO"];
const COD_AUSENCIA = ["VA", "BA"];
const GRUPOS_PER = [["Vehículos", o => o.grupo === "Vehículos"], ["Fronts", o => o.grupo === "Fronts"], ["Oficina técnica", o => o.grupo === "OT"], ["Taller y montaje", o => o.grupo === "Taller"], ["Externos", o => o.grupo === "Externos"], ["Subcontratas", o => o.grupo === "Subcontratas"]];

export async function vPlan(ctx, modo, ini, opt = {}) {
  const { $app, S, sb, esc, puede, toast } = ctx;
  // Estadísticas: por defecto solo SuperAdmin
  const verStats = ctx.can("stats");
  modo = ["personal", "stats"].includes(modo) ? modo : "proyectos";
  if (modo === "stats" && !verStats) modo = "proyectos";
  if (modo === "stats") return vStats(ctx, ini);
  const tv = !!opt.tv;
  $app.classList.add("ancho"); // la planificación usa todo el ancho de la pantalla
  if (S.zoom == null) S.zoom = lsGet("doinn_plan_zoom", 2);
  const [NDIAS, ANCHO] = tv ? [14, 0] : ZOOM[S.zoom];
  const paso = Math.max(7, Math.round(NDIAS / 2 / 7) * 7);
  // Empieza en el día actual; la pantalla de taller muestra dos semanas completas desde el lunes
  const base = ini ? pd(ini) : (() => { const t = new Date(); t.setHours(0, 0, 0, 0); if (tv) t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return t; })();
  const dias = Array.from({ length: NDIAS }, (_, i) => { const d = new Date(base); d.setDate(d.getDate() + i); return iso(d); });
  const d0 = dias[0], d1 = dias[NDIAS - 1];
  const movil = ($app.clientWidth || 1000) < 600;
  const NW = tv ? 300 : modo === "proyectos" ? (movil ? 130 : 300) : (movil ? 110 : 220);
  const COLW = tv ? Math.floor((($app.clientWidth || 1600) - NW - 4) / 14) : Math.max(ANCHO, Math.floor((($app.clientWidth || 1000) - NW - 2) / NDIAS));
  const scroll0 = opt.scroll;
  if (!opt.silencioso) $app.innerHTML = `<div class="loading">Cargando planificación…</div>`;
  // Pantalla de taller: rota cada 15 s, así que reutiliza los datos durante 1 minuto
  let D; try { D = tv && S._tvD && Date.now() - S._tvT < 60000 ? S._tvD : await cargaPlan(sb); if (tv) { S._tvD = D; S._tvT = Date.now(); } } catch (e) { $app.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  S.planFront = S.planFront || "";
  S.planEst = S.planEst || lsGet("doinn_plan_estados", ["Pendiente", "Confirmado"]).filter(e => ESTADOS_COM.includes(e));
  if (!S.planEst.length) S.planEst = ["Pendiente", "Confirmado"];
  S.planCerr = S.planCerr || {};
  // La pantalla de taller recuerda sus propios grupos plegados (por defecto solo se ven Taller y montaje y Externos)
  const CERR = tv ? (S.planCerrTv = S.planCerrTv || { Fronts: true, "Oficina técnica": true, Subcontratas: true }) : S.planCerr;
  S.ocultos = S.ocultos || lsGet("doinn_plan_ocultos", []);
  S.perGrupo = S.perGrupo || ""; S.perQ = S.perQ || ""; S.perProy = S.perProy || "";
  if (S.planMin == null) S.planMin = lsGet("doinn_plan_min", false);
  const admin = puede("admin"), superA = puede("superadmin"), taller = puede("taller");
  const nElem = id => S.elementos.filter(e => e.proyecto_id === id).length;
  const fronts = S.operarios.filter(o => o.grupo === "Fronts" && o.activo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const neon = neonOn();
  // Permisos de marcado en Personal
  // Permisos de marcado: superadmin todo · Front/encargado/TL producción en taller, externos y subcontratas · cada uno sus vacaciones y bajas
  const yo = S.perfil && S.perfil.operario_id, gestor = ctx.can("marcarProd"), propio = ctx.can("escaner");
  const PROD_G = ["Vehículos", "Taller", "Externos", "Subcontratas"], COD_P = [...COD_PROD, "FO", "ND"];
  const codigosFila = o => superA ? [...COD_PROD, ...COD_OTROS] : [...(gestor && PROD_G.includes(o.grupo) ? COD_P : []), ...(propio && yo && o.id === yo ? COD_AUSENCIA : [])];
  const puedeFila = o => codigosFila(o).length > 0;
  const misCodigos = ids => { const ls = ids.map(id => codigosFila(S.operarios.find(o => o.id === id) || {})); return [...COD_PROD, ...COD_OTROS].filter(c => ls.every(l => l.includes(c))); };
  const marca = !tv && modo === "personal" && (superA || gestor || (propio && !!yo));
  const largo = ANCHO >= 40 ? 18 : ANCHO >= 30 ? 12 : 6;

  // Pestañas, filtros (en el centro, siempre visibles) y botones en una sola línea
  const navDe = f => tv ? "" : `<div class="pnav">
    <div class="seg2"><a href="#/plan/proyectos/${d0}" class="${modo === "proyectos" ? "on" : ""}">Proyectos</a><a href="#/plan/personal/${d0}" class="${modo === "personal" ? "on" : ""}">Recursos</a>${verStats ? `<a href="#/plan/stats">Estadísticas</a>` : ""}</div>
    ${f}
    <div class="row">
      <button class="btn sm ghost" id="bmin" type="button" title="${S.planMin ? "Mostrar leyenda y barra inferior" : "Ocultar leyenda y barra inferior para ver más filas"}">${S.planMin ? "▾ Mostrar leyenda" : "▴ Ocultar leyenda"}</button>
      <a class="btn sm ghost" href="#/tv" title="Pantalla de taller: a pantalla completa y se actualiza sola">📺</a></div>
  </div>`;

  let filtros = "", leyenda = "", filas = "", ayuda = "";
  const TIP = {}; // bocadillos: clave de fila → texto por día
  if (modo === "proyectos") {
    const visibles = S.proyectos.filter(p => !p.archivado).filter(p => p.estado !== "Cerrado" || (p.fecha_descarga && p.fecha_descarga >= d0))
      .filter(p => { if (!S.planFront) return true; const f = fronts.find(o => o.nombre === S.planFront); return f ? p.front_id === f.id : p.front_nombre === S.planFront; })
      .filter(p => S.planEst.includes(estadoCom(p)))
      // Se listan todos los proyectos que no han terminado antes del periodo visible, aunque no tengan fases en estas fechas
      .map(p => ({ p, f: fasesProyecto(p) })).filter(x => !x.f.length || x.f.some(([, , b]) => b >= d0));
    const ocultosAqui = visibles.filter(x => S.ocultos.includes(x.p.id));
    const ps = visibles.filter(x => !S.ocultos.includes(x.p.id)).sort((a, b) => ordenProyectos(a.p, b.p));
    if (!tv) filtros = `<div class="pfil">
      <select id="pfront"><option value="">Todos los Fronts</option>${fronts.map(o => `<option ${o.nombre === S.planFront ? "selected" : ""}>${esc(o.nombre)}</option>`).join("")}</select>
      <div class="ests">${ESTADOS_COM.map(e => `<button class="chip sm ${S.planEst.includes(e) ? "on" : ""}" data-est="${e}"><i style="background:${COL_COM[e]}"></i>${e}</button>`).join("")}</div>
      <div class="row" style="gap:6px">${GRUPOS_COM.map(([g]) => `<button class="link" data-grp="${g}">${g}</button>`).join(" · ")}
      ${ocultosAqui.length ? ` · <button class="link" id="bocu">Ocultos (${ocultosAqui.length})</button>` : ""} · <button class="link" id="btodo">Ver todo</button></div>
    </div>`;
    leyenda = `<div class="ley1">${["Carga", "Montaje", "Evento", "Desmontaje", "Descarga"].map(f => `<span><i style="background:${COL[f]}"></i>${f}</span>`).join("")}<span><i class="prev-i"></i>Sin confirmar</span><span><b class="warn-i">⚠</b>Aviso</span></div>
      <div class="ley2"><span class="code">Movimientos al día:</span>${["0", "1", "2", "3 o más"].map((t, k) => `<span><i class="mvk m${k}"></i>${t}</span>`).join("")}</div>`;
    // Movimientos al día = inicios de carga, montaje, desmontaje y descarga de los proyectos visibles
    const mov = dias.map(d => ps.reduce((n, { p, f }) => n + (caido(p) ? 0 : f.filter(([fa, a]) => MOVS.includes(fa) && a === d).length), 0));
    const filaMov = `<div class="gr gmov"><div class="gn glab">MOVIMIENTOS/DÍA</div>${fondo(dias, D.fest)}${mov.map((n, i) => `<div class="mv m${Math.min(n, 3)}" style="grid-column:${i + 2}">${n || "·"}</div>`).join("")}</div>`;
    filas = filaMov + ps.map(({ p, f }) => {
      const est = estadoCom(p), rs = riesgos(p, nElem(p.id));
      const cls = caido(p) ? "caido" : !confirmado(p) ? "prev" : "";
      // Tramos de días seguidos con las mismas fases → una barra
      const fd = dias.map(d => f.filter(([, a, b]) => enR(d, a, b)).slice(0, 2));
      const clave = k => fd[k] ? fd[k].map(x => x[0]).join("/") : "";
      let pills = "";
      for (let k = 0; k < dias.length; k++) {
        if (!fd[k].length || (k > 0 && clave(k - 1) === clave(k))) continue;
        let span = 1; while (k + span < dias.length && clave(k + span) === clave(k)) span++;
        const fs = fd[k];
        const tit = fs.map(([fa, a, b]) => `${fa}: ${fd0(a)}${a !== b ? " → " + fd0(b) : ""}`).join("\n") + ` · ${est}`;
        pills += barra(k, span, fs.map(x => COL[x[0]]), { abr: fs.map(x => ABR[x[0]]).join("/") }, COLW, cls, `data-pid="${p.id}"`);
      }
      TIP["p" + p.id] = dias.map(d => { const fs = f.filter(([, a, b]) => enR(d, a, b)); return fs.length ? `${p.nombre}\n${diaTip(d)}\n` + fs.map(([fa, a, b]) => `${fa}: ${fd0(a)}${a !== b ? " → " + fd0(b) : ""}`).join("\n") + `\n${est}${p.front_nombre ? " · " + p.front_nombre : ""}` : ""; });
      const sub = [p.codigo, p.front_nombre, p.transporte_ida].filter(Boolean).map(esc).join(" · ");
      return `<div class="gr" data-tip="p${p.id}"><div class="gn pj ${rs.length && neon ? "neon" : ""}" data-pid="${p.id}" title="${esc(p.nombre)}${rs.length ? "\n⚠ " + esc(rs.join("\n⚠ ")) : ""}">
        <b>${rs.length ? `<span class="warn-i">⚠</span>` : ""}${esc(p.nombre)}</b><span><i class="dot" style="background:${COL_COM[est]}"></i>${sub}</span></div>${fondo(dias, D.fest)}${pills}</div>`;
    }).join("") || `<div class="empty">No hay proyectos con estos filtros en estas fechas.</div>`;
  } else {
    const dia = motorDias(S, D);
    const orden = ORDEN_PER;
    const q = S.perQ.trim().toLowerCase();
    // Filtro por proyecto: solo los recursos con algo de ese proyecto en las fechas visibles (marcado en Recursos o asignado en Equipo)
    const pid = +S.perProy || 0;
    const delProy = o => D.asig.some(a => a.proyecto_id === pid && a.operario_id === o.id) || dias.some(d => { const x = dia(o, d); return x && x.p && x.p.id === pid; });
    const proysFil = S.proyectos.filter(p => !p.archivado && (p.estado !== "Cerrado" || (p.fecha_descarga && p.fecha_descarga >= d0)) && !caido(p)).sort(ordenProyectos);
    const activos = S.operarios.filter(o => o.activo !== false).filter(o => !q || o.nombre.toLowerCase().includes(q)).filter(o => !pid || delProy(o));
    if (!tv) filtros = `<div class="pfil">
      <input id="perq" class="perq" placeholder="Buscar persona o vehículo…" value="${esc(S.perQ)}">
      <select id="perp" class="perp"><option value="">Todos los proyectos</option>${proysFil.map(p => `<option value="${p.id}" ${p.id === pid ? "selected" : ""}>${esc(p.codigo || "")} · ${esc(p.nombre)}</option>`).join("")}</select>
      <div class="ests"><button class="chip sm ${!S.perGrupo ? "on" : ""}" data-pg="">Todos</button>${GRUPOS_PER.map(([g]) => `<button class="chip sm ${S.perGrupo === g ? "on" : ""}" data-pg="${g}">${g}</button>`).join("")}</div>
      ${superA || ctx.can("equipo") ? `<button class="chip sm" id="bsub">+ Subcontrata</button>` : ""}
    </div>`;
    const lg = cs => cs.map(k => `<span><i style="background:${COD[k][1]}"></i>${COD[k][0]}</span>`).join("");
    leyenda = `<div class="ley1"><span class="code"><b>Producción:</b></span>${lg(COD_PROD)}</div><div class="ley2"><span class="code"><b>Ausencias y formación:</b></span>${lg(COD_OTROS)}</div>`;
    if (marca) ayuda = `<div class="ayuda">✎ Pulsa un día (o arrastra sobre varios días y personas) y elige qué marcar. ${superA ? "Puedes marcar a cualquier persona." : gestor ? "Puedes marcar producción al personal de taller, externos, subcontratas y vehículos, y tus vacaciones y bajas en tu fila." : "Puedes marcar tus vacaciones, licencias y bajas en tu fila."}</div>`;
    else if (!tv && taller && !yo) ayuda = `<div class="ayuda">Tu usuario aún no está vinculado a tu ficha de operario. Pide al administrador que lo vincule para poder marcar tus vacaciones y permisos.</div>`;
    // En la pantalla de taller solo Taller y montaje y Externos (sin subcontratas), todos visibles
    // Fila "En taller": cuántos están en fábrica cada día laborable (sin marcar nada o marcados en Fábrica)
    const enTaller = S.operarios.filter(EN_TALLER);
    const libres = dias.map(d => esFestivo(d, D.fest) ? null : enTaller.filter(o => { const x = dia(o, d); return !x || x.cod === "FA"; }));
    TIP.tl = libres.map((l, i) => l ? `En taller · ${diaTip(dias[i])}: ${l.length} de ${enTaller.length}\n${l.map(o => o.nombre).join(", ") || "Nadie"}` : "");
    const filaTaller = `<div class="gr gmov" data-tip="tl"><div class="gn glab">EN TALLER</div>${fondo(dias, D.fest)}${libres.map((l, i) => `<div class="mv tl ${!l ? "we" : !l.length ? "cero" : ""}" style="grid-column:${i + 2}">${l ? l.length : "·"}</div>`).join("")}</div>`;
    filas = filaTaller + GRUPOS_PER.filter(([g]) => tv ? ["Taller y montaje", "Externos"].includes(g) : !S.perGrupo || S.perGrupo === g).map(([g, fn]) => {
      const ops = activos.filter(fn).sort(orden);
      if (!ops.length) return "";
      const cerr = !tv && CERR[g] && !q && !pid;
      return `<div class="gg" data-g="${g}"><span>${cerr ? "▸" : "▾"} ${g} <small class="code">${ops.length}</small></span></div>` + (cerr ? "" : ops.map(o => {
        const info = dias.map(d => dia(o, d));
        // Taller y montaje y Externos: un día laborable sin nada marcado = en fábrica (fondo verde)
        const fab = ["Taller", "Externos"].includes(o.grupo) ? dias.map((d, i) => !info[i] && !esFestivo(d, D.fest)) : null;
        TIP["o" + o.id] = info.map((x, i) => { if (!x) return fab && fab[i] ? `${o.nombre}\n${diaTip(dias[i])}\nEn fábrica` : ""; const [lab] = COD[x.cod] || ["?"]; const h = x.p ? (x.cod === "MO" ? x.p.hora_montaje : x.cod === "DM" ? x.p.hora_desmontaje : "") : ""; return [o.nombre, diaTip(dias[i]), lab + (x.p ? " · " + x.p.nombre : "") + (h ? " · inicio " + h : ""), x.nota && (!x.p || x.nota !== x.p.nombre) ? x.nota : "", x.src, x.quien || x.cuando ? `${x.quien || "—"} · ${cuando(x.cuando)}` : ""].filter(Boolean).join("\n"); });
        let n = 0;
        const cel = info.map((x, i) => {
          // En fábrica: una píldora verde por día, con la misma forma que el resto de acciones y sin texto
          if (!x) return fab && fab[i] ? barra(i, 1, [COD.FA[1]], { abr: "", full: "" }, COLW, "fabv") : "";
          if (["MO", "DM"].includes(x.cod)) n++;
          const [lab, col, ab] = COD[x.cod] || ["?", "#ccc", "?"];
          // Días seguidos con el mismo código (y el mismo proyecto) → una barra
          const mismo = y => y && y.cod === x.cod && (y.p && y.p.id) === (x.p && x.p.id);
          if (mismo(info[i - 1])) return "";
          let span = 1; while (mismo(info[i + span])) span++;
          // Viajes: el nombre del proyecto solo si la barra es larga; si no, "VI"/"VV"
          const viajeLargo = ["VI", "VV"].includes(x.cod) && span * COLW >= 70;
          const conProy = (["MO", "DM"].includes(x.cod) || viajeLargo) && x.p;
          const hora = conProy ? (x.cod === "MO" ? x.p.hora_montaje : x.p.hora_desmontaje) : "";
          const tit = [lab + (x.p ? " · " + x.p.nombre : "") + (hora ? " · inicio " + hora : ""), x.src, x.nota, x.quien || x.cuando ? `${x.quien || "—"} · ${cuando(x.cuando)}` : ""].filter(Boolean).join("\n");
          // Sin proyecto vinculado, el montaje/desmontaje muestra el texto del Excel en lugar de "M"/"DS"
          const conNota = !conProy && (["MO", "DM"].includes(x.cod) || viajeLargo) && x.nota;
          return barra(i, span, [col], { abr: ab, full: esc(conProy ? x.p.nombre : conNota ? x.nota : ab), hora: conProy && ["MO", "DM"].includes(x.cod) ? (hora || "--:--") : "" }, COLW, pid && !(x.p && x.p.id === pid) ? "otro" : "", "", !!(conProy || conNota));
        }).join("");
        const hits = marca && puedeFila(o) ? dias.map((d, i) => `<div class="hit" data-o="${o.id}" data-d="${d}" style="grid-column:${i + 2}"></div>`).join("") : "";
        return `<div class="gr" data-row="${o.id}" data-tip="o${o.id}"><div class="gn"><b>${esc(o.nombre)}</b><span>${esc(o.subgrupo === "Montaje" ? "Montaje" : o.puesto || "")}</span></div>${fondo(dias, D.fest)}${cel}${hits}</div>`;
      }).join(""));
    }).join("") || `<div class="empty">${pid ? "Nadie tiene marcado ni asignado ese proyecto en estas fechas." : "Nadie coincide con el filtro."}</div>`;
  }

  const ajustes = "";
  if (!tv && ctx.cabNav) ctx.cabNav({ label: rotuloMeses(d0, d1), prev: `#/plan/${modo}/${suma(d0, -paso)}`, next: `#/plan/${modo}/${suma(d0, paso)}`, hoy: `#/plan/${modo}`, zoom: true });
  const cols = tv ? `${NW}px repeat(14,${COLW}px)` : `${NW}px repeat(${NDIAS},${COLW}px)`;
  $app.innerHTML = `${tv ? `<div class="tvhead"><b>Planificación · ${modo === "proyectos" ? "Proyectos" : "Recursos"}</b><span>${new Date().toLocaleString("es-ES", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</span><a href="#/plan" class="btn sm ghost">Salir</a></div>` : ""}
  ${tv ? "" : navDe(filtros)}${S.planMin && !tv ? "" : `<div class="pinfo ver">${ayuda}<div class="ley">${leyenda}${ajustes}</div></div>`}
  <div class="gwrap"><div class="gantt z${tv ? 1 : S.zoom} ${marca ? "marcable" : ""}" style="--cols:${cols};--nw:${NW}px">${cabecera(dias, D.fest, modo === "proyectos" ? (NW < 200 ? "PROYECTO" : "PROYECTO · Front · TRANSPORTE") : "RECURSO")}${filas}</div></div>`;

  const $ = id => document.getElementById(id);
  const re = (o = {}) => vPlan(ctx, modo, d0, { ...opt, ...o });
  const w = $app.querySelector(".gwrap");
  // Bocadillo al pasar por encima de una casilla: fila (data-tip) + columna del día según la posición del ratón
  if (!tv && w) {
    let tip = document.getElementById("gtip"); if (!tip) { tip = document.createElement("div"); tip.id = "gtip"; document.body.appendChild(tip); }
    const oculta = () => { tip.style.display = "none"; };
    w.onmousemove = e => {
      const r = e.target.closest && e.target.closest("[data-tip]"); const wr = w.getBoundingClientRect();
      if (!r || e.clientX < wr.left + NW) return oculta();
      const i = Math.floor((e.clientX - r.getBoundingClientRect().left - NW) / COLW), t = (TIP[r.dataset.tip] || [])[i];
      if (!t) return oculta();
      const [h, ...resto] = t.split("\n");
      tip.innerHTML = `<b>${esc(h)}</b>${resto.map(l => `<div>${esc(l)}</div>`).join("")}`; tip.style.display = "block";
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      tip.style.left = Math.min(innerWidth - tw - 8, e.clientX + 14) + "px"; tip.style.top = (e.clientY + 16 + th > innerHeight ? e.clientY - th - 10 : e.clientY + 16) + "px";
    };
    w.onmouseleave = oculta; w.addEventListener("scroll", oculta, { passive: true });
  }
  // La rejilla ocupa el alto disponible y hace scroll dentro: meses, días y movimientos quedan fijos arriba
  document.body.classList.toggle("plan-min", !!S.planMin && !tv);
  const ajustaAlto = () => { const g = document.querySelector(".gwrap.fija"); if (!g) return; const tb = document.getElementById("tabs"); g.style.maxHeight = Math.max(260, innerHeight - g.getBoundingClientRect().top - (tb ? tb.offsetHeight : 0) - 10) + "px"; };
  { w.classList.add("fija"); ajustaAlto(); if (!window.__altoPlan) { window.__altoPlan = 1; addEventListener("resize", () => { const g = document.querySelector(".gwrap.fija"); if (g) { ajustaAlto(); } }); } }
  if (opt.scrollTop) w.scrollTop = opt.scrollTop;
  if (scroll0 != null) w.scrollLeft = scroll0;
  else { const h = $app.querySelector(".gd.hoy"); if (w && h && !tv && w.scrollWidth - w.clientWidth > COLW * 4) w.scrollLeft = Math.min(w.scrollWidth - w.clientWidth, Math.max(0, h.offsetLeft - NW - (COLW * 3))); }
  const bmn = $("bmin"); if (bmn) bmn.onclick = () => { S.planMin = !S.planMin; lsSet("doinn_plan_min", S.planMin); re({ scroll: w.scrollLeft, scrollTop: w.scrollTop, silencioso: true }); };
  const bm = $("bmas"); if (bm) bm.onclick = () => { S.verInfo = !S.verInfo; const pi = $app.querySelector(".pinfo"); if (pi) pi.classList.toggle("ver", S.verInfo); ajustaAlto(); };
  if (tv) {
    // Se ajusta al alto de la pantalla para que se vea a todo el personal sin hacer scroll
    const gt = w.querySelector(".gantt"); w.style.maxHeight = "none"; w.style.overflow = "hidden";
    const disp = innerHeight - w.getBoundingClientRect().top - 8, alto = gt.scrollHeight;
    // Reparte el alto disponible entre todas las filas (crecen si hay pocas, se compactan si hay muchas); el ancho no cambia
    const rs = gt.querySelectorAll(".gr:not(.gmov)"), n = rs.length || 1, resto = alto - [...rs].reduce((t, r) => t + r.offsetHeight, 0);
    const h = Math.max(20, Math.min(modo === "personal" ? 110 : 90, Math.floor((disp - resto) / n)));
    gt.style.setProperty("--tvh", h + "px"); gt.classList.add("fit"); gt.classList.toggle("comp", h < 38);
    return D;
  }

  if (modo === "proyectos") {
    const pf = $("pfront"); if (pf) pf.onchange = e => { S.planFront = e.target.value; re(); };
    $app.querySelectorAll("[data-est]").forEach(b => b.onclick = () => { const e = b.dataset.est; S.planEst = S.planEst.includes(e) ? S.planEst.filter(x => x !== e) : [...S.planEst, e]; lsSet("doinn_plan_estados", S.planEst); re(); });
    $app.querySelectorAll("[data-grp]").forEach(b => b.onclick = () => { S.planEst = GRUPOS_COM.find(g => g[0] === b.dataset.grp)[1].slice(); lsSet("doinn_plan_estados", S.planEst); re(); });
    if ($("btodo")) $("btodo").onclick = () => { S.planFront = ""; S.planEst = ESTADOS_COM.slice(); S.ocultos = []; lsSet("doinn_plan_estados", S.planEst); lsSet("doinn_plan_ocultos", []); re(); };
    const bo = $("bocu"); if (bo) bo.onclick = () => { S.ocultos = []; lsSet("doinn_plan_ocultos", []); re(); };
    $app.querySelectorAll("[data-pid]").forEach(el => el.onclick = () => panelProyecto(ctx, S.proyectos.find(p => p.id === +el.dataset.pid), D, () => re({ scroll: w.scrollLeft })));
  } else {
    $app.querySelectorAll(".gg").forEach(g => g.onclick = () => { CERR[g.dataset.g] = !CERR[g.dataset.g]; re({ scroll: w.scrollLeft, silencioso: true }); });
    $app.querySelectorAll("[data-pg]").forEach(b => b.onclick = () => { S.perGrupo = b.dataset.pg; re({ scroll: w.scrollLeft, silencioso: true }); });
    const pp = $("perp"); if (pp) pp.onchange = e => { S.perProy = e.target.value; re({ scroll: w.scrollLeft, silencioso: true }); };
    let tq; if ($("perq")) $("perq").oninput = e => { clearTimeout(tq); tq = setTimeout(() => { S.perQ = e.target.value; re({ scroll: w.scrollLeft, silencioso: true }).then(() => { const i = $("perq"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); }, 250); };
    if (marca) activaMarcado(ctx, D, misCodigos, () => re({ scroll: w.scrollLeft, silencioso: true }));
    const bs = $("bsub"); if (bs) bs.onclick = () => formSubcontrata(ctx, async () => { await ctx.recargar(); re({ scroll: w.scrollLeft, silencioso: true }); });
  }
  return D;
}

// Marcar días: seleccionar (pulsar o arrastrar) y elegir qué poner en un menú
function activaMarcado(ctx, D, codigos, fin) {
  const { S, sb, toast, esc } = ctx;
  const filas = [...document.querySelectorAll(".gr[data-row]")].map(r => +r.dataset.row);
  let ini = null, fin2 = null, activo = false;
  const celdas = () => {
    if (!ini) return [];
    const r1 = filas.indexOf(ini.o), r2 = filas.indexOf(fin2.o);
    const [a, b] = [Math.min(r1, r2), Math.max(r1, r2)];
    const [da, db] = ini.d <= fin2.d ? [ini.d, fin2.d] : [fin2.d, ini.d];
    return [...document.querySelectorAll(".hit")].filter(h => { const ri = filas.indexOf(+h.dataset.o); return ri >= a && ri <= b && h.dataset.d >= da && h.dataset.d <= db; });
  };
  const pinta = () => { document.querySelectorAll(".hit.sel").forEach(h => h.classList.remove("sel")); celdas().forEach(h => h.classList.add("sel")); };
  const hitEn = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest && el.closest(".hit"); };
  document.querySelectorAll(".hit").forEach(h => {
    h.onpointerdown = e => { if (e.button > 0) return; activo = true; ini = fin2 = { o: +h.dataset.o, d: h.dataset.d }; pinta(); if (e.pointerType === "mouse") e.preventDefault(); };
  });
  const mueve = e => { if (!activo || e.pointerType !== "mouse") return; const h = hitEn(e.clientX, e.clientY); if (h) { fin2 = { o: +h.dataset.o, d: h.dataset.d }; pinta(); } };
  const suelta = e => { if (!activo) return; activo = false; const sel = celdas(); if (sel.length) menu(e.clientX, e.clientY, sel); };
  const cancela = () => { activo = false; ini = null; pinta(); };
  document.addEventListener("pointermove", mueve);
  document.addEventListener("pointerup", suelta);
  document.addEventListener("pointercancel", cancela);
  const limpia = () => { document.removeEventListener("pointermove", mueve); document.removeEventListener("pointerup", suelta); document.removeEventListener("pointercancel", cancela); };
  if (S._limpiaMarca) S._limpiaMarca();
  S._limpiaMarca = limpia;

  function menu(x, y, sel) {
    document.querySelectorAll(".mmenu").forEach(m => m.remove());
    const ops = [...new Set(sel.map(h => +h.dataset.o))];
    const cods = typeof codigos === "function" ? codigos(ops) : codigos;
    if (!cods.length) { toast("No puedes marcar a esas personas a la vez."); ini = null; pinta(); return; }
    const ds = sel.map(h => h.dataset.d).sort();
    const nom = ops.length === 1 ? ((S.operarios.find(o => o.id === ops[0]) || {}).nombre || "") : `${ops.length} personas`;
    const fdc = s => s.split("-").reverse().slice(0, 2).join("/");
    const proys = S.proyectos.filter(p => p.estado !== "Cerrado" && !p.archivado && !caido(p)).sort(ordenProyectos);
    const m = document.createElement("div"); m.className = "mmenu";
    m.innerHTML = `<div class="mm-h"><b>${esc(nom)}</b><span>${ds.length === 1 || ds[0] === ds[ds.length - 1] ? fdc(ds[0]) : `${fdc(ds[0])} → ${fdc(ds[ds.length - 1])}`}</span></div>
      ${ops.length === 1 ? `<div class="mm-r"><label>Hasta <input type="date" id="mmh" value="${ds[ds.length - 1]}" min="${ds[0]}"></label></div>` : ""}
      ${cods.some(c => CON_PROY.includes(c)) ? `<div class="mm-r"><select id="mmp"><option value="">Proyecto (opcional)</option>${proys.map(p => `<option value="${p.id}" ${String(p.id) === String(S.ultProy || "") ? "selected" : ""}>${esc(p.codigo)} · ${esc(corto(p.nombre, 28))}</option>`).join("")}</select></div>` : ""}
      <div class="mm-g">${cods.map(c => `<button data-c="${c}" style="--c:${COD[c][1]}" >${COD[c][0]}</button>`).join("")}</div>
      <div class="mm-f"><button class="link" id="mmq">Quitar marca</button><button class="link" id="mmx">Cancelar</button></div>`;
    document.body.appendChild(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(x + 6, innerWidth - r.width - 8)) + "px";
    m.style.top = Math.max(8, Math.min(y + 6, innerHeight - r.height - 8)) + "px";
    const cierra = () => { m.remove(); ini = null; pinta(); document.removeEventListener("keydown", tecla); };
    const tecla = e => { if (e.key === "Escape") cierra(); };
    document.addEventListener("keydown", tecla);
    setTimeout(() => document.addEventListener("pointerdown", function fuera(e) { if (!m.contains(e.target)) { cierra(); document.removeEventListener("pointerdown", fuera); } }), 0);
    const objetivo = () => {
      const h = m.querySelector("#mmh");
      if (ops.length === 1 && h && h.value && h.value !== ds[ds.length - 1]) { const out = []; for (let d = ds[0]; d <= h.value; d = suma(d, 1)) out.push({ o: ops[0], d }); return out; }
      return sel.map(x => ({ o: +x.dataset.o, d: x.dataset.d }));
    };
    const autor = (S.perfil && (S.perfil.nombre || S.perfil.email)) || S.user.email;
    m.querySelector("#mmx").onclick = cierra;
    m.querySelector("#mmq").onclick = async () => {
      const t = objetivo(); const porOp = {}; t.forEach(f => (porOp[f.o] = porOp[f.o] || []).push(f.d));
      let error; for (const [o, d] of Object.entries(porOp)) { const r = await sb.from("jornadas").delete().eq("operario_id", +o).in("fecha", d); if (r.error) error = r.error; }
      cierra(); toast(error ? "No se pudo quitar: " + error.message : "Marca quitada (las asignaciones y ausencias se gestionan en Equipo)"); fin();
    };
    m.querySelectorAll("[data-c]").forEach(b => b.onclick = async () => {
      const c = b.dataset.c, sp = m.querySelector("#mmp"), pid = sp && sp.value && CON_PROY.includes(c) ? +sp.value : null;
      if (sp) S.ultProy = sp.value;
      const t = objetivo();
      const { error } = await sb.from("jornadas").upsert(t.map(f => ({ operario_id: f.o, fecha: f.d, codigo: c, proyecto_id: pid, autor, actualizado: new Date().toISOString() })));
      cierra();
      toast(error ? (/row-level|policy/i.test(error.message) ? "No tienes permiso para cambiar alguno de esos días." : "No se pudo guardar: " + error.message) : `${COD[c][0]}: ${t.length} día${t.length > 1 ? "s" : ""}`);
      fin();
    });
  }
}

// Panel lateral del proyecto (desde el Gantt)
function panelProyecto(ctx, p, D, fin) {
  const { S, esc, puede, fd } = ctx;
  if (!p) return;
  const opN = id => (S.operarios.find(o => o.id === id) || {}).nombre || "—";
  const est = estadoCom(p);
  const els = S.elementos.filter(e => e.proyecto_id === p.id);
  const fab = els.length ? Math.round(100 * els.filter(e => e.estado_fab === "Hecho").length / els.length) : 0;
  const rs = riesgos(p, els.length);
  const equipo = D.asig.filter(a => a.proyecto_id === p.id).sort((a, b) => FASES.indexOf(a.fase) - FASES.indexOf(b.fase));
  const dur = (a, b) => Math.round((pd(b) - pd(a)) / 864e5) + 1;
  const m = document.createElement("div"); m.className = "drawer-bg";
  m.innerHTML = `<aside class="drawer">
    <div class="row" style="justify-content:space-between"><span class="code">${esc(p.codigo)}</span><button class="link" id="dx">Cerrar ✕</button></div>
    <h2 style="margin:4px 0 6px">${esc(p.nombre || "")}</h2>
    <span class="pill" style="background:${COL_COM[est]}26;color:var(--ink)"><i class="dot" style="background:${COL_COM[est]}"></i>${est}</span>
    ${ctx.can("coord") ? `<button class="pill ${p.coordinacion_ok ? "ok" : "warn"} pbtn" id="dcoord" title="Pulsa para ${p.coordinacion_ok ? "quitar" : "marcar"} la coordinación OK">${p.coordinacion_ok ? "✓ Coordinado" : "Sin coordinar · marcar OK"}</button>` : p.coordinacion_ok ? `<span class="pill ok">✓ Coordinado</span>` : `<span class="pill warn">Sin coordinar</span>`}
    ${rs.length ? `<div class="avisos">${rs.map(r => `<div>⚠ ${esc(r)}</div>`).join("")}</div>` : ""}
    <dl class="kv">
      <dt>Cliente</dt><dd>${esc(p.cliente || "—")}</dd>
      <dt>Ubicación</dt><dd>${esc(p.ubicacion || "—")}</dd>
      <dt>Front</dt><dd>${esc(p.front_nombre || "—")}</dd>
      <dt>Despiece</dt><dd>${els.length} elementos · ${fab}% fabricado</dd>
    </dl>
    <table class="f">${fasesProyecto(p).map(([f, a, b]) => `<tr><td><i class="dot" style="background:${COL[f]}"></i>${f}</td><td>${fd(a)}${b !== a ? " → " + fd(b) : ""}</td><td>${dur(a, b)} d</td></tr>`).join("")}</table>
    <h3 style="margin:14px 0 4px;font-size:14px">Equipo <small class="code">${equipo.length}</small></h3>
    ${equipo.map(a => `<div class="crow"><span>${esc(opN(a.operario_id))}</span><span class="code">${esc(a.fase)} · ${fd(a.fecha_inicio)}${a.fecha_fin && a.fecha_fin !== a.fecha_inicio ? "→" + fd(a.fecha_fin) : ""}</span></div>`).join("") || `<div class="code">Nadie asignado.</div>`}
    <div class="acts" style="margin-top:14px;flex-wrap:wrap">
      <a class="btn lime" href="#/p/${p.id}">Abrir proyecto</a>
      ${ctx.can("proyEditar") ? `<a class="btn ghost" href="#/p/${p.id}/editar">Editar ficha</a>` : ""}${ctx.can("equipo") ? `<a class="btn ghost" href="#/p/${p.id}/equipo">Asignar equipo</a>` : ""}
      <button class="btn ghost" id="doc">Ocultar del Gantt</button>
    </div>
  </aside>`;
  document.body.appendChild(m);
  const cierra = () => m.remove();
  m.onclick = e => { if (e.target === m) cierra(); };
  m.querySelector("#dx").onclick = cierra;
  m.querySelectorAll("a").forEach(a => a.addEventListener("click", cierra));
  const dc = m.querySelector("#dcoord");
  if (dc) dc.onclick = async () => { dc.disabled = true; if (await ctx.marcaCoordinacion(p, !p.coordinacion_ok)) { cierra(); fin(); panelProyecto(ctx, p, D, fin); } else dc.disabled = false; };
  m.querySelector("#doc").onclick = () => { S.ocultos = [...new Set([...(S.ocultos || []), p.id])]; lsSet("doinn_plan_ocultos", S.ocultos); cierra(); fin(); };
  const esc2 = e => { if (e.key === "Escape") { cierra(); document.removeEventListener("keydown", esc2); } };
  document.addEventListener("keydown", esc2);
}

// ---------- Estadísticas anuales por persona ----------
async function vStats(ctx, anio) {
  const { $app, S, sb, esc, puede } = ctx;
  if (!ctx.can("stats")) { $app.innerHTML = `<div class="empty">Solo el SuperAdmin ve las estadísticas.</div>`; return; }
  const y = +anio || new Date().getFullYear();
  $app.innerHTML = `<div class="loading">Calculando…</div>`;
  let D; try { D = await cargaPlan(sb); } catch (e) { $app.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const dia = motorDias(S, D);
  const hoy = iso(new Date());
  const dias = []; for (let d = new Date(y, 0, 1); d.getFullYear() === y; d.setDate(d.getDate() + 1)) dias.push(iso(d));
  const COLS = [...COD_PROD, ...COD_OTROS].map(k => [k, COD[k][0], COD[k][1]]);
  const cuenta = o => { const c = {}; COLS.forEach(([k]) => c[k] = 0); dias.forEach(d => { const x = dia(o, d); if (x && c[x.cod] != null) c[x.cod]++; }); return c; };
  const activos = S.operarios.filter(o => o.activo !== false);
  const grupos = GRUPOS_PER.map(([g, fn]) => ({ g, filas: activos.filter(fn).sort(ORDEN_PER).map(o => ({ o, c: cuenta(o) })) })).filter(x => x.filas.length);
  const suma0 = fs => { const t = {}; COLS.forEach(([k]) => t[k] = fs.reduce((s, f) => s + f.c[k], 0)); return t; };
  const tot = suma0(grupos.flatMap(x => x.filas));
  S.statCerr = S.statCerr || {};
  const celdas = c => COLS.map(([k], i) => `<td class="${i === COD_PROD.length ? "sep" : ""}">${c[k] || ""}</td>`).join("");
  if (ctx.cabNav) ctx.cabNav({ label: String(y), prev: `#/plan/stats/${y - 1}`, next: `#/plan/stats/${y + 1}`, hoy: `#/plan/stats` });
  const pinta = () => {
    $app.innerHTML = `<div class="pnav"><div class="seg2"><a href="#/plan/proyectos">Proyectos</a><a href="#/plan/personal">Recursos</a><a class="on">Estadísticas</a></div>
    <div class="row"><button class="btn sm ghost" id="bcsv">Descargar CSV</button></div></div>
  <p class="hint">Días por persona en ${y}${y === new Date().getFullYear() ? ` (incluye lo planificado después de hoy, ${hoy.split("-").reverse().join("/")})` : ""}. Cuenta asignaciones, ausencias y lo marcado en Personal.</p>
  <div class="gwrap swrap" id="swrap"><table class="stats"><thead><tr><th class="sth-g"></th><th colspan="${COD_PROD.length}" class="sth-g">Producción</th><th colspan="${COD_OTROS.length}" class="sth-g sep">Ausencias y formación</th></tr>
  <tr><th>Persona</th>${COLS.map(([k, l, c], i) => `<th class="${i === COD_PROD.length ? "sep" : ""}"><i class="sw2" style="background:${c}"></i>${l}</th>`).join("")}</tr></thead>
  <tbody>${grupos.map(({ g, filas }) => { const cerr = S.statCerr[g], st = suma0(filas); return `<tr class="sgr" data-sg="${g}"><td>${cerr ? "▸" : "▾"} ${g} <small class="code">${filas.length}</small></td>${celdas(st)}</tr>` + (cerr ? "" : filas.map(f => `<tr><td class="spn">${esc(f.o.nombre)}</td>${celdas(f.c)}</tr>`).join("")); }).join("") || `<tr><td colspan="${COLS.length + 1}" class="code">Sin datos en ${y}.</td></tr>`}</tbody>
  <tfoot><tr><td>Total</td>${celdas(tot)}</tr></tfoot></table></div>`;
    // Cabecera fija: la tabla hace scroll dentro de su caja, que ocupa el alto disponible
    const sw = document.getElementById("swrap"), alto = () => { const tb = document.getElementById("tabs"); sw.style.maxHeight = Math.max(260, innerHeight - sw.getBoundingClientRect().top - (tb ? tb.offsetHeight : 0) - 10) + "px"; };
    alto(); if (!window.__altoStats) { window.__altoStats = 1; addEventListener("resize", () => { const w = document.getElementById("swrap"); if (w) w.dispatchEvent(new Event("alto")); }); }
    sw.addEventListener("alto", alto);
    $app.querySelectorAll("[data-sg]").forEach(tr => tr.onclick = () => { S.statCerr[tr.dataset.sg] = !S.statCerr[tr.dataset.sg]; pinta(); });
    document.getElementById("bcsv").onclick = () => {
      const csv = ["Grupo;Persona;" + COLS.map(c => c[1]).join(";"), ...grupos.flatMap(({ g, filas }) => filas.map(f => [g, f.o.nombre, ...COLS.map(([k]) => f.c[k])].join(";")))].join("\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" })); a.download = `planificacion_${y}.csv`; a.click();
    };
  };
  pinta();
}

// ---------- Pantalla de taller (TV) ----------
export function vTv(ctx) {
  document.body.classList.add("tv");
  // Pantalla del taller: alterna cada 15 s la planificación de Proyectos y la de Personal. Datos frescos cada minuto.
  const SEC = ["proyectos", "personal"];
  let t = 0, k = 0;
  const rota = () => lsGet("doinn_tv_rota", true);
  const pinta = () => {
    const vista = rota() ? SEC[k % SEC.length] : "personal";
    vPlan(ctx, vista, "", { tv: true, silencioso: t > 0 });
    marcaRota();
  };
  // botón para activar/desactivar la rotación (esquina inferior derecha)
  const marcaRota = () => {
    let b = document.getElementById("tvrota");
    if (!b) { b = document.createElement("button"); b.id = "tvrota"; b.className = "tvrota"; document.body.appendChild(b); b.onclick = () => { lsSet("doinn_tv_rota", !rota()); k = 0; pinta(); }; }
    const vista = rota() ? SEC[k % SEC.length] : "personal";
    b.innerHTML = `${SEC.map(v => `<i class="${v === vista ? "on" : ""}"></i>`).join("")} ${rota() ? "Rotación activa" : "Solo Recursos"}`;
  };
  pinta();
  const id = setInterval(async () => {
    if (location.hash !== "#/tv") return fin();
    t++; k++;
    if (t % 4 === 0) { try { await ctx.recargar(); } catch { } }
    pinta();
  }, 15000);
  const fin = () => { clearInterval(id); document.body.classList.remove("tv"); const b = document.getElementById("tvrota"); if (b) b.remove(); window.removeEventListener("hashchange", sal); };
  const sal = () => { if (location.hash !== "#/tv") fin(); };
  window.addEventListener("hashchange", sal);
}

// Pantallas de la TV con letra grande: cargas y descargas de los próximos 7 días, y elementos listos para cargar
function tvLista(ctx, vista) {
  const { S, $app, esc } = ctx;
  const hoy = iso(new Date()), fin7 = suma(hoy, 6);
  const dia = d => { const x = pd(d), dd = Math.round((x - pd(hoy)) / 864e5); return dd === 0 ? "HOY" : dd === 1 ? "MAÑANA" : x.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" }).toUpperCase(); };
  const els = pid => S.elementos.filter(e => e.proyecto_id === pid);
  const vivos = S.proyectos.filter(p => !p.archivado && !caido(p));
  const reloj = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  let titulo, filas;
  if (vista === "cargas") {
    titulo = "Cargas y descargas · próximos 7 días";
    const mov = [];
    vivos.forEach(p => {
      if (p.hay_carga !== false && p.fecha_carga && p.fecha_carga >= hoy && p.fecha_carga <= fin7) mov.push({ d: p.fecha_carga, h: p.hora_carga, t: "CARGA", p });
      if (p.hay_retorno !== false && p.fecha_descarga && p.fecha_descarga >= hoy && p.fecha_descarga <= fin7) mov.push({ d: p.fecha_descarga, h: p.hora_descarga, t: "DESCARGA", p });
    });
    mov.sort((a, b) => (a.d + (a.h || "99")).localeCompare(b.d + (b.h || "99")));
    filas = mov.map(m => { const e = els(m.p.id), lis = e.filter(x => x.estado_fab === "Hecho" || x.estado_carga === "Cargado").length;
      return `<div class="tvf ${m.t === "CARGA" ? "c" : "d"}"><span class="tvd">${dia(m.d)}${m.h && m.h !== "—" ? `<small>${esc(m.h)}</small>` : ""}</span><span class="tvt">${m.t}</span><b>${esc(m.p.nombre || m.p.codigo)}</b>${m.t === "CARGA" && e.length ? `<span class="tvn ${lis === e.length ? "ok" : "ko"}">${lis}/${e.length} listos</span>` : "<span></span>"}</div>`; }).join("") || `<div class="tvv">Sin cargas ni descargas esta semana</div>`;
  } else {
    titulo = "Listos para cargar";
    const ps = vivos.filter(p => p.fecha_carga && p.fecha_carga >= suma(hoy, -30) && p.hay_carga !== false).map(p => { const e = els(p.id); return { p, e, lis: e.filter(x => x.estado_fab === "Hecho" && x.estado_carga !== "Cargado"), falt: e.filter(x => x.estado_fab !== "Hecho") }; })
      .filter(x => x.e.length && x.e.some(y => y.estado_carga !== "Cargado")).sort((a, b) => a.p.fecha_carga.localeCompare(b.p.fecha_carga)).slice(0, 8);
    filas = ps.map(x => `<div class="tvf l ${x.p.fecha_carga < hoy ? "venc" : ""}"><span class="tvd">${x.p.fecha_carga < hoy ? `VENCIDA<small>${dia(x.p.fecha_carga)}</small>` : dia(x.p.fecha_carga)}</span><b>${esc(x.p.nombre || x.p.codigo)}</b><span class="tvn ok">${x.lis.length} listos</span><span class="tvn ${x.falt.length ? "ko" : "ok"}">${x.falt.length ? x.falt.length + " por fabricar" : "Todo fabricado"}</span></div>`).join("") || `<div class="tvv">Nada pendiente de cargar</div>`;
  }
  $app.innerHTML = `<div class="tvs"><div class="tvh"><h1>${titulo}</h1><span class="tvr">${reloj}</span></div>${filas}</div>`;
}

// Alta y baja de personal de subcontratas (equipos externos que no son los autónomos de "Externos")
function formSubcontrata(ctx, fin) {
  const { S, sb, esc, toast } = ctx;
  const subs = S.operarios.filter(o => o.grupo === "Subcontratas").sort(ORDEN_PER);
  const emps = [...new Set(subs.map(o => o.puesto).filter(Boolean))].sort();
  const m = document.createElement("div"); m.className = "modal";
  m.innerHTML = `<form class="card frm mbox"><h2>Nueva persona de subcontrata</h2>
    <div class="two"><label>Empresa <small class="code">(si la hay)</small><input id="s_e" list="s_el" placeholder="CDF, Dimas…"><datalist id="s_el">${emps.map(e => `<option value="${esc(e)}">`).join("")}</datalist></label>
    <label>Nombre <small class="code">(vacío = siguiente número)</small><input id="s_n" placeholder="Oscar"></label></div>
    <label>Oficio <small class="code">(opcional)</small><input id="s_o" placeholder="Carpintería, pintura…"></label>
    <div class="code" id="s_pv" style="margin:4px 0 8px"></div>
    <div class="acts"><button class="btn lime">Guardar</button><button type="button" class="btn ghost" id="s_x">Cerrar</button></div>
    ${subs.length ? `<div class="code" style="margin-top:12px">Personal de subcontratas (${subs.length})</div>${subs.map(o => `<div class="crow"><span>${esc(o.nombre)} · ${esc(o.puesto || "")}${o.activo === false ? " · <i>inactivo</i>" : ""}</span><button type="button" class="link" data-sact="${o.id}" data-v="${o.activo === false ? 1 : 0}">${o.activo === false ? "Reactivar" : "Desactivar"}</button></div>`).join("")}` : ""}
  </form>`;
  document.body.appendChild(m);
  const $ = id => m.querySelector("#" + id);
  $("s_x").onclick = () => m.remove();
  m.onclick = e => { if (e.target === m) m.remove(); };
  m.querySelectorAll("[data-sact]").forEach(b => b.onclick = async () => {
    const { error } = await sb.from("operarios").update({ activo: b.dataset.v === "1" }).eq("id", +b.dataset.sact);
    if (error) return toast(error.message);
    toast(b.dataset.v === "1" ? "Reactivado" : "Desactivado (se conserva su histórico)"); m.remove(); fin();
  });
  // Formato: "EMPRESA - NOMBRE"; sin nombre o con número: "EMPRESA 01"; sin empresa: "NOMBRE"
  // Primera letra en mayúscula y resto en minúscula; las siglas cortas escritas en mayúsculas (CDF, BCN) se respetan
  const tc = v => v.trim().replace(/\s+/g, " ").split(" ").map(w => /^[A-ZÁÉÍÓÚÑ]{2,3}$/.test(w.replace(/[()]/g, "")) ? w : w.toLowerCase().replace(/(^|[(\-\/])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())).join(" ");
  const compone = () => {
    const e = tc($("s_e").value), n = tc($("s_n").value);
    if (!e) return n;
    if (!n || /^\d+$/.test(n)) {
      let k = n ? +n : 1;
      if (!n) { const usados = S.operarios.map(o => (o.nombre.toUpperCase().match(new RegExp("^" + e.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " (\\d+)$")) || [])[1]).filter(Boolean).map(Number); k = usados.length ? Math.max(...usados) + 1 : 1; }
      return `${e} ${String(k).padStart(2, "0")}`;
    }
    return `${e} - ${n}`;
  };
  const pv = () => { const c = compone(); $("s_pv").textContent = c ? "Se guardará como: " + c : ""; };
  $("s_e").oninput = pv; $("s_n").oninput = pv;
  m.querySelector("form").onsubmit = async ev => {
    ev.preventDefault();
    const nombre = compone(), puesto = tc($("s_e").value) || null;
    if (!nombre) return toast("Pon al menos la empresa o el nombre");
    if (S.operarios.some(o => o.nombre.toUpperCase() === nombre)) return toast("Ya existe una persona con ese nombre");
    const { error } = await sb.from("operarios").insert({ nombre, puesto, grupo: "Subcontratas", subgrupo: $("s_o").value.trim() || null, activo: true });
    if (error) return toast(error.message);
    toast("Añadido a Subcontratas"); m.remove(); fin();
  };
}

function formAusencia(ctx, fin, D) {
  const { S, sb, esc, toast } = ctx;
  const ops = S.operarios.filter(o => o.activo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const m = document.createElement("div"); m.className = "modal";
  m.innerHTML = `<form class="card frm mbox"><h2>Nueva ausencia</h2>
    <label>Persona<select id="a_op">${ops.map(o => `<option value="${o.id}">${esc(o.nombre)}</option>`).join("")}</select></label>
    <label>Tipo<select id="a_t">${TIPOS_AUS.map(t => `<option>${t}</option>`).join("")}</select></label>
    <div class="two"><label>Desde<input type="date" id="a_d" required></label><label>Hasta<input type="date" id="a_h" required></label></div>
    <div class="acts"><button class="btn lime">Guardar</button><button type="button" class="btn ghost" id="a_x">Cancelar</button></div>
    ${D.aus.length ? `<div class="code" style="margin-top:12px">Ausencias registradas</div>${D.aus.slice().sort((a, b) => (b.desde || "").localeCompare(a.desde || "")).slice(0, 12).map(a => `<div class="crow"><span>${esc(a.persona || "")} · ${esc(a.tipo || "")} · ${a.desde}${a.hasta && a.hasta !== a.desde ? " → " + a.hasta : ""}</span><button type="button" class="link" data-adel="${a.id}">Borrar</button></div>`).join("")}` : ""}
  </form>`;
  document.body.appendChild(m);
  const $ = id => m.querySelector("#" + id);
  $("a_d").onchange = () => { if (!$("a_h").value || $("a_h").value < $("a_d").value) $("a_h").value = $("a_d").value; };
  $("a_x").onclick = () => m.remove();
  m.onclick = e => { if (e.target === m) m.remove(); };
  m.querySelectorAll("[data-adel]").forEach(b => b.onclick = async () => { if (!confirm("¿Borrar esta ausencia?")) return; await sb.from("ausencias").delete().eq("id", +b.dataset.adel); m.remove(); fin(); });
  m.querySelector("form").onsubmit = async ev => {
    ev.preventDefault();
    const op = ops.find(o => o.id === +$("a_op").value);
    const { error } = await sb.from("ausencias").insert({ operario_id: op.id, persona: op.nombre, tipo: $("a_t").value, desde: $("a_d").value, hasta: $("a_h").value || $("a_d").value, registrado_por: (S.perfil.nombre || S.user.email) });
    if (error) return toast(error.message);
    toast("Ausencia guardada"); m.remove(); fin();
  };
}

// ---------- pestaña Equipo del proyecto ----------
export async function vEquipo(ctx, p, cont) {
  const { S, sb, esc, toast, puede, fd } = ctx;
  const edita = ctx.can("equipo");
  cont.innerHTML = `<div class="loading">Cargando…</div>`;
  let D; try { D = await cargaPlan(sb); } catch (e) { cont.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const mias = D.asig.filter(a => a.proyecto_id === p.id).sort((a, b) => FASES.indexOf(a.fase) - FASES.indexOf(b.fase) || (a.fecha_inicio || "").localeCompare(b.fecha_inicio || ""));
  const opN = id => (S.operarios.find(o => o.id === id) || {}).nombre || "—";
  const fechasDe = fase => {
    const hoy = iso(new Date());
    if (fase === "Montaje") return [p.fecha_montaje, p.fecha_montaje_fin || (p.evento_inicio ? suma(p.evento_inicio, -1) : p.fecha_montaje)];
    if (fase === "Desmontaje") return [p.fecha_desmontaje, p.fecha_desmontaje_fin || p.fecha_desmontaje];
    if (fase === "Carga") return [p.fecha_carga, p.fecha_carga_fin || p.fecha_carga];
    if (fase === "Descarga") return [p.fecha_descarga, p.fecha_descarga_fin || p.fecha_descarga];
    return [hoy, p.fecha_carga ? suma(p.fecha_carga, -1) : hoy];
  };
  const rango = o => o.grupo === "Vehículos" ? -1 : o.grupo === "Taller" ? (o.subgrupo === "Montaje" ? 0 : 1) : o.grupo === "Externos" ? 2 : o.grupo === "Subcontratas" ? 3 : 4;
  const taller = S.operarios.filter(o => o.activo !== false).sort((a, b) => rango(a) - rango(b) || a.nombre.localeCompare(b.nombre));
  // Choques: otras asignaciones, ausencias (vacaciones, baja, curso…) y días pintados a mano en Recursos
  const J = new Map(D.jor.map(j => [j.operario_id + "|" + j.fecha, j]));
  const pN = id => (S.proyectos.find(q => q.id === id) || {}).nombre || "otro proyecto";
  const fdc = d => pd(d).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
  const choque = a => {
    if (!a.operario_id || !a.fecha_inicio) return [];
    const fin = a.fecha_fin && a.fecha_fin >= a.fecha_inicio ? a.fecha_fin : a.fecha_inicio;
    const M = new Map(), add = (k, d) => { if (!M.has(k)) M.set(k, []); M.get(k).push(d); };
    for (let d = a.fecha_inicio, n = 0; d <= fin && n < 120; d = suma(d, 1), n++) {
      D.asig.filter(x => x.id !== a.id && x.operario_id === a.operario_id && x.proyecto_id !== p.id && enR(d, x.fecha_inicio, x.fecha_fin)).forEach(x => add(`asignado a ${pN(x.proyecto_id)}`, d));
      const au = D.aus.find(x => x.operario_id === a.operario_id && enR(d, x.desde, x.hasta));
      if (au) add((au.tipo || "Ausencia").toLowerCase(), d);
      const j = J.get(a.operario_id + "|" + d);
      if (j && j.proyecto_id !== p.id && normCod(j.codigo)) add(`${(COD[normCod(j.codigo)] || [j.codigo])[0].toLowerCase()}${j.proyecto_id ? " en " + pN(j.proyecto_id) : ""} (pintado en Recursos)`, d);
    }
    return [...M].map(([k, ds]) => `${k} ${ds.length > 1 ? fdc(ds[0]) + "–" + fdc(ds[ds.length - 1]) : fdc(ds[0])}`);
  };
  const f0 = fechasDe("Montaje");
  cont.innerHTML = `${!confirmado(p) ? `<div class="card avisos">Proyecto <b>${esc(estadoCom(p))}</b>: lo que asignes aquí aparece como <b>previsión</b> en Planificación hasta que se confirme.</div>` : ""}
  <div class="card"><h2>Recursos asignados <small class="code">${mias.length}</small></h2>
    ${mias.map(a => { const c = choque(a); return `<div class="crow"><div><b>${esc(opN(a.operario_id))}</b> <span class="pill" style="background:${COL[a.fase]}22;color:var(--ink)">${esc(a.fase)}</span>
      <div class="code">${a.fecha_inicio ? fd(a.fecha_inicio) : "—"}${a.fecha_fin && a.fecha_fin !== a.fecha_inicio ? " → " + fd(a.fecha_fin) : ""}${a.creado_por ? ` · por ${esc(a.creado_por)}` : ""}${c.length ? `<div class="choq">⚠ ${esc(c.join(" · "))}</div>` : ""}</div></div>
      ${edita ? `<button class="link" data-qdel="${a.id}">Quitar</button>` : ""}</div>`; }).join("") || `<div class="code">Nadie asignado todavía.</div>`}
  </div>
  ${edita ? `<form id="fa" class="card frm"><h2>+ Asignar persona o vehículo</h2>
    <div class="two"><label>Persona o vehículo<select id="q_op">${taller.map(o => `<option value="${o.id}">${esc(o.nombre)}${o.grupo === "Vehículos" ? " (vehículo)" : o.subgrupo === "Montaje" ? " (montaje)" : o.grupo === "Externos" ? " (externo)" : o.grupo === "Subcontratas" ? ` (subcontrata${o.puesto ? " · " + esc(o.puesto) : ""})` : ""}</option>`).join("")}</select></label>
    <label>Fase<select id="q_f">${FASES.map(f => `<option>${f}</option>`).join("")}</select></label></div>
    <div class="two"><label>Desde<input type="date" id="q_d" value="${f0[0] || ""}"></label><label>Hasta<input type="date" id="q_h" value="${f0[1] || ""}"></label></div>
    <div id="q_av" class="code"></div>
    <button class="btn lime wide">Guardar asignación</button></form>` : ""}`;
  const $ = id => document.getElementById(id);
  const avisa = () => { if (!$("q_op")) return; const c = choque({ id: 0, operario_id: +$("q_op").value, fecha_inicio: $("q_d").value, fecha_fin: $("q_h").value }); $("q_av").innerHTML = c.length ? `<div class="choq">⚠ En esas fechas: ${esc(c.join(" · "))}</div>` : ""; };
  if ($("q_f")) {
    $("q_f").onchange = () => { const [a, b] = fechasDe($("q_f").value); $("q_d").value = a || ""; $("q_h").value = b || ""; avisa(); };
    ["q_op", "q_d", "q_h"].forEach(i => $(i).onchange = avisa); avisa();
    $("fa").onsubmit = async ev => {
      ev.preventDefault();
      const row = { proyecto_id: p.id, operario_id: +$("q_op").value, fase: $("q_f").value, fecha_inicio: $("q_d").value || null, fecha_fin: $("q_h").value || $("q_d").value || null, creado_por: (S.perfil && (S.perfil.nombre || S.perfil.email)) || S.user.email };
      if (mias.some(a => a.operario_id === row.operario_id && a.fase === row.fase)) return toast("Ya está asignado a esa fase.");
      const ch = choque({ id: 0, ...row });
      if (ch.length && !confirm(`${opN(row.operario_id)} en esas fechas tiene:\n· ${ch.join("\n· ")}\n\n¿Asignar igualmente?`)) return;
      const { error } = await sb.from("asignaciones").insert(row);
      if (error) return toast(error.message);
      toast("Asignación guardada"); vEquipo(ctx, p, cont);
    };
  }
  cont.querySelectorAll("[data-qdel]").forEach(b => b.onclick = async () => { if (!confirm("¿Quitar esta asignación?")) return; await sb.from("asignaciones").delete().eq("id", +b.dataset.qdel); vEquipo(ctx, p, cont); });
}
