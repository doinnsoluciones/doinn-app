// Planificación (proyectos, personal con pincel, estadísticas, pantalla de taller), ausencias y pestaña Equipo
const V = new URL(import.meta.url).search;
const { ESTADOS_COM, COL_COM, GRUPOS_COM, estadoCom, confirmado, caido, riesgos, neonOn, setNeon } = await import("./estados.js" + V);

const FASES = ["Montaje", "Desmontaje", "Carga", "Descarga", "Fábrica"];
const COL = { Carga: "#E9BA4B", Montaje: "#1DCAD3", Evento: "#93D500", Desmontaje: "#3B4955", Descarga: "#D37B3E", "Fábrica": "#B9DD7A", Ausencia: "#8E9C9C" };
const TIPOS_AUS = ["Vacaciones", "Baja", "Curso", "Otros"];
// Códigos de jornada (pincel)
const COD = {
  MO: ["Montaje", "#1DCAD3"], DM: ["Desmontaje", "#3B4955"], PV: ["Previsión", "#1DCAD3"], FA: ["Fábrica", "#B9DD7A"],
  RE: ["Reunión / visita", "#E9BA4B"], FO: ["Formación", "#D37B3E"], VA: ["Vacaciones", "#8E9C9C"], LIC: ["Licencia / permiso", "#AEB9B9"],
  BA: ["Baja", "#E62643"], LB: ["Libre", "#D5DCDC"],
};
const CON_PROY = ["MO", "DM", "PV", "RE"];
const AUS2COD = { Vacaciones: "VA", Baja: "BA", Curso: "FO", Otros: "LIC" };
const FASE2COD = { Montaje: "MO", Desmontaje: "DM", "Fábrica": "FA" };

const iso = d => d.toLocaleDateString("sv-SE");
const pd = s => s ? new Date(s + "T00:00:00") : null;
const suma = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return iso(d); };
const lunes = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const enR = (dia, a, b) => a && dia >= a && dia <= (b || a);
const corto = (s, n = 14) => (s || "").length > n ? s.slice(0, n - 1) + "…" : (s || "");
const cuando = t => t ? new Date(t).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
const lsGet = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };

async function cargaPlan(sb) {
  const [a, au, f, j] = await Promise.all([
    sb.from("asignaciones").select("*"),
    sb.from("ausencias").select("*"),
    sb.from("festivos").select("*"),
    sb.from("jornadas").select("*"),
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

function cabecera(dias, fest) {
  const meses = []; dias.forEach((d, i) => { const m0 = pd(d).toLocaleDateString("es-ES", { month: "long", year: "numeric" }); const m = m0[0].toUpperCase() + m0.slice(1); if (!meses.length || meses[meses.length - 1].m !== m) meses.push({ m, i, n: 1 }); else meses[meses.length - 1].n++; });
  const hoy = iso(new Date());
  return `<div class="gh gm"><div class="gn"></div>${meses.map(x => `<div class="gmes" style="grid-column:span ${x.n}">${x.m}</div>`).join("")}</div>
  <div class="gh"><div class="gn"></div>${dias.map(d => { const w = pd(d).getDay(); const fe = fest.find(f => f.fecha === d); return `<div class="gd ${w === 0 || w === 6 ? "we" : ""} ${w === 6 ? "sat" : ""} ${fe ? "fe" : ""} ${d === hoy ? "hoy" : ""}" title="${fe ? fe.nombre : ""}"><span>${"DLMXJVS"[w]}</span><b>${pd(d).getDate()}</b></div>`; }).join("")}</div>`;
}
function fondo(dias, fest) {
  return dias.map((d, i) => { const w = pd(d).getDay(); const fe = fest.some(f => f.fecha === d); return (w === 0 || w === 6 || fe) ? `<div class="bg ${w === 6 ? "sat" : ""}" style="grid-column:${i + 2}"></div>` : ""; }).join("");
}
const esFestivo = (d, fest) => { const w = pd(d).getDay(); return w === 0 || w === 6 || fest.some(f => f.fecha === d); };

// Qué hace una persona un día: jornada pintada > ausencia > asignación > montaje de sus proyectos (Fronts)
function motorDias(S, D) {
  const J = new Map(D.jor.map(j => [j.operario_id + "|" + j.fecha, j]));
  const P = new Map(S.proyectos.map(p => [p.id, p]));
  return (o, d) => {
    const j = J.get(o.id + "|" + d);
    if (j) return { cod: j.codigo, p: P.get(j.proyecto_id), quien: j.autor, cuando: j.actualizado, src: "Pintado a mano", nota: j.nota };
    const au = D.aus.find(a => a.operario_id === o.id && enR(d, a.desde, a.hasta));
    if (au) return { cod: AUS2COD[au.tipo] || "LIC", quien: au.registrado_por, cuando: au.created_at, src: "Ausencia: " + (au.tipo || "") };
    const as = D.asig.find(a => a.operario_id === o.id && enR(d, a.fecha_inicio, a.fecha_fin) && FASE2COD[a.fase]);
    if (as) { const p = P.get(as.proyecto_id); return { cod: p && !confirmado(p) ? "PV" : FASE2COD[as.fase], p, quien: as.creado_por, cuando: as.created_at, src: "Asignación: " + as.fase }; }
    if (o.grupo === "Fronts") {
      const p = S.proyectos.find(x => x.front_id === o.id && !caido(x) && fasesProyecto(x).some(([f, a, b]) => f === "Montaje" && enR(d, a, b)));
      if (p) return { cod: confirmado(p) ? "MO" : "PV", p, src: "Montaje de su proyecto" };
    }
    return null;
  };
}

// ---------- Planificación ----------
// Zoom: nº de días visibles y ancho de columna
const ZOOM = [[14, 64], [28, 44], [42, 30], [84, 17]];
// Qué códigos puede marcar cada rol (el resto, solo SuperAdmin)
const COD_TRABAJO = ["MO", "DM", "PV", "FA", "RE", "FO", "LB"];
const COD_AUSENCIA = ["VA", "LIC", "BA"];
const GRUPOS_PER = [["Fronts", o => o.grupo === "Fronts"], ["Oficina técnica", o => o.grupo === "OT"], ["Taller y montaje", o => o.grupo === "Taller"], ["Externos", o => o.grupo === "Externos"]];

export async function vPlan(ctx, modo, ini, opt = {}) {
  const { $app, S, sb, esc, puede, toast } = ctx;
  modo = ["personal", "stats"].includes(modo) ? modo : "proyectos";
  if (modo === "stats") return vStats(ctx, ini);
  const tv = !!opt.tv;
  if (S.zoom == null) S.zoom = lsGet("doinn_plan_zoom", 2);
  const [NDIAS, ANCHO] = tv ? [28, 0] : ZOOM[S.zoom];
  const paso = Math.max(7, Math.round(NDIAS / 2 / 7) * 7);
  const base = ini ? pd(ini) : (() => { const l = lunes(new Date()); if (NDIAS > 14) l.setDate(l.getDate() - 7); return l; })();
  const dias = Array.from({ length: NDIAS }, (_, i) => { const d = new Date(base); d.setDate(d.getDate() + i); return iso(d); });
  const d0 = dias[0], d1 = dias[NDIAS - 1];
  const scroll0 = opt.scroll;
  if (!opt.silencioso) $app.innerHTML = `<div class="loading">Cargando planificación…</div>`;
  let D; try { D = await cargaPlan(sb); } catch (e) { $app.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  S.planFront = S.planFront || "";
  S.planEst = S.planEst || lsGet("doinn_plan_estados", ["Presupuestado", "Pre-confirmado", "Confirmado"]);
  S.planCerr = S.planCerr || {};
  S.ocultos = S.ocultos || lsGet("doinn_plan_ocultos", []);
  S.perGrupo = S.perGrupo || ""; S.perQ = S.perQ || "";
  const admin = puede("admin"), superA = puede("superadmin"), taller = puede("taller");
  const nElem = id => S.elementos.filter(e => e.proyecto_id === id).length;
  const fronts = S.operarios.filter(o => o.grupo === "Fronts" && o.activo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const neon = neonOn();
  // Permisos de marcado en Personal
  const misCodigos = superA ? Object.keys(COD) : admin ? COD_TRABAJO : taller ? COD_AUSENCIA : [];
  const puedeFila = o => superA || admin || (taller && (o.grupo === "Taller" || o.grupo === "Externos"));
  const marca = !tv && modo === "personal" && misCodigos.length > 0;
  const largo = ANCHO >= 40 ? 18 : ANCHO >= 30 ? 12 : 6;

  const nav = tv ? "" : `<div class="pnav">
    <div class="seg2"><a href="#/plan/proyectos/${d0}" class="${modo === "proyectos" ? "on" : ""}">Proyectos</a><a href="#/plan/personal/${d0}" class="${modo === "personal" ? "on" : ""}">Personal</a>${admin ? `<a href="#/plan/stats">Estadísticas</a>` : ""}</div>
    <div class="row">
      <div class="zoom" title="Zoom: más o menos días a la vista"><button class="btn sm ghost" id="zmenos" ${S.zoom === 0 ? "disabled" : ""}>−</button><span>${NDIAS === 14 ? "2 sem" : NDIAS === 28 ? "4 sem" : NDIAS === 42 ? "6 sem" : "12 sem"}</span><button class="btn sm ghost" id="zmas" ${S.zoom === ZOOM.length - 1 ? "disabled" : ""}>+</button></div>
      <a class="btn sm ghost" href="#/plan/${modo}/${suma(d0, -paso)}">‹</a><a class="btn sm ghost" href="#/plan/${modo}">Hoy</a><a class="btn sm ghost" href="#/plan/${modo}/${suma(d0, paso)}">›</a>
      <a class="btn sm ghost" href="#/tv" title="Pantalla de taller: a pantalla completa y se actualiza sola">📺</a></div>
  </div>`;

  let filtros = "", leyenda = "", filas = "", ayuda = "";
  if (modo === "proyectos") {
    const visibles = S.proyectos.filter(p => p.estado !== "Cerrado" || (p.fecha_descarga && p.fecha_descarga >= d0))
      .filter(p => !S.planFront || p.front_nombre === S.planFront)
      .filter(p => S.planEst.includes(estadoCom(p)))
      .map(p => ({ p, f: fasesProyecto(p) })).filter(x => x.f.some(([, a, b]) => b >= d0 && a <= d1));
    const ocultosAqui = visibles.filter(x => S.ocultos.includes(x.p.id));
    const ps = visibles.filter(x => !S.ocultos.includes(x.p.id)).sort((a, b) => (a.f[0] ? a.f[0][1] : "").localeCompare(b.f[0] ? b.f[0][1] : ""));
    if (!tv) filtros = `<div class="pfil">
      <select id="pfront"><option value="">Todos los Fronts</option>${fronts.map(o => `<option ${o.nombre === S.planFront ? "selected" : ""}>${esc(o.nombre)}</option>`).join("")}</select>
      <div class="ests">${ESTADOS_COM.map(e => `<button class="chip sm ${S.planEst.includes(e) ? "on" : ""}" data-est="${e}"><i style="background:${COL_COM[e]}"></i>${e}</button>`).join("")}</div>
      <div class="row" style="gap:6px">${GRUPOS_COM.map(([g]) => `<button class="link" data-grp="${g}">${g}</button>`).join(" · ")}
      ${ocultosAqui.length ? ` · <button class="link" id="bocu">Ocultos (${ocultosAqui.length})</button>` : ""} · <button class="link" id="btodo">Ver todo</button></div>
    </div>`;
    leyenda = ["Carga", "Montaje", "Evento", "Desmontaje", "Descarga"].map(f => `<span><i style="background:${COL[f]}"></i>${f}</span>`).join("") + `<span><i class="prev-i"></i>Sin confirmar</span><span>⚠ Aviso</span>`;
    filas = ps.map(({ p, f }) => {
      const est = estadoCom(p), rs = riesgos(p, nElem(p.id));
      const cls = caido(p) ? "caido" : !confirmado(p) ? "prev" : "";
      const barras = f.filter(([, a, b]) => b >= d0 && a <= d1).map(([fa, a, b]) => {
        const i = Math.max(0, dias.indexOf(a < d0 ? d0 : a)), j = dias.indexOf(b > d1 ? d1 : b);
        const n = j - i + 1, cab = n * (ANCHO || 40) >= 60;
        return `<div class="bar2 ${cls}" data-pid="${p.id}" style="grid-column:${i + 2}/${j + 3};--c:${COL[fa]}" title="${fa}: ${a}${a !== b ? " → " + b : ""} · ${est}">${cab ? fa : fa[0]}</div>`;
      }).join("");
      return `<div class="gr"><div class="gn pj ${rs.length && neon ? "neon" : ""}" data-pid="${p.id}" title="${esc(p.nombre)}${rs.length ? "\n⚠ " + esc(rs.join("\n⚠ ")) : ""}">
        <b>${rs.length ? `<span class="warn-i">⚠</span>` : ""}${esc(corto(p.nombre, tv ? 22 : 16))}</b><span><i class="dot" style="background:${COL_COM[est]}"></i>${esc(p.codigo)} · ${esc((p.front_nombre || "").split(" ")[0])}</span></div>${fondo(dias, D.fest)}${barras}</div>`;
    }).join("") || `<div class="empty">No hay proyectos con estos filtros en estas fechas.</div>`;
  } else {
    const dia = motorDias(S, D);
    const orden = (a, b) => (a.grupo === "Taller" && b.grupo === "Taller" ? ((a.subgrupo === "Montaje") - (b.subgrupo === "Montaje")) : 0) || a.nombre.localeCompare(b.nombre);
    const q = S.perQ.trim().toLowerCase();
    const activos = S.operarios.filter(o => o.activo !== false).filter(o => !q || o.nombre.toLowerCase().includes(q));
    if (!tv) filtros = `<div class="pfil">
      <input id="perq" class="perq" placeholder="Buscar persona…" value="${esc(S.perQ)}">
      <div class="ests"><button class="chip sm ${!S.perGrupo ? "on" : ""}" data-pg="">Todos</button>${GRUPOS_PER.map(([g]) => `<button class="chip sm ${S.perGrupo === g ? "on" : ""}" data-pg="${g}">${g}</button>`).join("")}</div>
    </div>`;
    leyenda = Object.entries(COD).map(([k, [l, c]]) => `<span><i style="${k === "PV" ? `border:2px dashed ${c};background:transparent` : `background:${c}`}"></i>${l}</span>`).join("") + `<span><b class="fz-i">F</b> montaje en festivo</span>`;
    if (marca) ayuda = `<div class="ayuda">✎ Pulsa un día (o arrastra sobre varios días y personas) y elige qué marcar. ${superA ? "Puedes marcar cualquier cosa." : admin ? "Puedes marcar trabajos: montaje, desmontaje, previsión, fábrica, reunión, formación y libre." : "Puedes marcar vacaciones, licencias y bajas del personal de taller."}</div>`;
    filas = GRUPOS_PER.filter(([g]) => !S.perGrupo || S.perGrupo === g).map(([g, fn]) => {
      const ops = activos.filter(fn).sort(orden);
      if (!ops.length) return "";
      const cerr = S.planCerr[g] && !q;
      return `<div class="gg" data-g="${g}"><span>${cerr ? "▸" : "▾"} ${g} <small class="code">${ops.length}</small></span></div>` + (cerr ? "" : ops.map(o => {
        const info = dias.map(d => dia(o, d));
        let n = 0;
        const cel = info.map((x, i) => {
          if (!x) return "";
          if (["MO", "DM"].includes(x.cod)) n++;
          const [lab, col] = COD[x.cod] || ["?", "#ccc"];
          const prevX = info[i - 1];
          const ini = i === 0 || !prevX || prevX.cod !== x.cod || (prevX.p && prevX.p.id) !== (x.p && x.p.id);
          let span = 1; while (i + span < info.length && info[i + span] && info[i + span].cod === x.cod && (info[i + span].p && info[i + span].p.id) === (x.p && x.p.id)) span++;
          const fz = ["MO", "DM"].includes(x.cod) && esFestivo(dias[i], D.fest);
          const tit = [lab + (x.p ? " · " + x.p.nombre : ""), x.src, x.nota, x.quien || x.cuando ? `${x.quien || "—"} · ${cuando(x.cuando)}` : ""].filter(Boolean).join("\n");
          const txt = ini ? (x.p ? corto(x.p.nombre, Math.max(3, Math.floor(span * (ANCHO || 40) / 7))) : (span * (ANCHO || 40) >= 60 ? lab : x.cod)) : "";
          const st = x.cod === "PV" ? `border:2px dashed ${col};color:var(--ink);background:#fff` : `background:${col};${["LB", "LIC", "FA"].includes(x.cod) ? "color:var(--ink)" : ""}`;
          const nx = info[i + 1], ult = !nx || nx.cod !== x.cod || (nx.p && nx.p.id) !== (x.p && x.p.id);
          return `<div class="cx ${fz ? "fz" : ""} ${ini ? "ini" : ""} ${ult ? "ult" : ""}" style="grid-column:${i + 2};${st}" title="${esc(tit)}">${esc(txt)}</div>`;
        }).join("");
        const hits = marca && puedeFila(o) ? dias.map((d, i) => `<div class="hit" data-o="${o.id}" data-d="${d}" style="grid-column:${i + 2}"></div>`).join("") : "";
        return `<div class="gr" data-row="${o.id}"><div class="gn"><b>${esc(o.nombre)}</b><span>${esc(o.subgrupo === "Montaje" ? "Montaje" : o.puesto || "")}${n ? ` · ${n} d montaje` : ""}</span></div>${fondo(dias, D.fest)}${cel}${hits}</div>`;
      }).join(""));
    }).join("") || `<div class="empty">Nadie coincide con el filtro.</div>`;
  }

  const ajustes = tv ? "" : `<label class="neon-t"><input type="checkbox" id="bneon" ${neon ? "checked" : ""}> Avisos parpadeantes</label>`;
  const cols = tv ? "190px repeat(28,1fr)" : `150px repeat(${NDIAS},minmax(${ANCHO}px,1fr))`;
  $app.innerHTML = `${tv ? `<div class="tvhead"><b>Planificación · ${modo === "proyectos" ? "Proyectos" : "Personal"}</b><span>${new Date().toLocaleString("es-ES", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</span><a href="#/plan" class="btn sm ghost">Salir</a></div>` : `<h1>Planificación</h1>`}
  ${nav}${filtros}${ayuda}<div class="ley">${leyenda}${ajustes}</div>
  <div class="gwrap"><div class="gantt z${tv ? 1 : S.zoom} ${marca ? "marcable" : ""}" style="--cols:${cols}">${cabecera(dias, D.fest)}${filas}</div></div>`;

  const $ = id => document.getElementById(id);
  const re = (o = {}) => vPlan(ctx, modo, d0, { ...opt, ...o });
  const w = $app.querySelector(".gwrap");
  if (scroll0 != null) w.scrollLeft = scroll0;
  else { const h = $app.querySelector(".gd.hoy"); if (w && h && !tv) w.scrollLeft = Math.max(0, h.offsetLeft - 150 - (ANCHO * 3)); }
  if (tv) return D;

  const zoomA = dz => { S.zoom = Math.min(ZOOM.length - 1, Math.max(0, S.zoom + dz)); lsSet("doinn_plan_zoom", S.zoom); vPlan(ctx, modo, ini, opt); };
  $("zmenos").onclick = () => zoomA(-1);
  $("zmas").onclick = () => zoomA(1);
  const bn = $("bneon"); if (bn) bn.onchange = () => { setNeon(bn.checked); re({ scroll: w.scrollLeft }); };
  if (modo === "proyectos") {
    $("pfront").onchange = e => { S.planFront = e.target.value; re(); };
    $app.querySelectorAll("[data-est]").forEach(b => b.onclick = () => { const e = b.dataset.est; S.planEst = S.planEst.includes(e) ? S.planEst.filter(x => x !== e) : [...S.planEst, e]; lsSet("doinn_plan_estados", S.planEst); re(); });
    $app.querySelectorAll("[data-grp]").forEach(b => b.onclick = () => { S.planEst = GRUPOS_COM.find(g => g[0] === b.dataset.grp)[1].slice(); lsSet("doinn_plan_estados", S.planEst); re(); });
    $("btodo").onclick = () => { S.planFront = ""; S.planEst = ESTADOS_COM.slice(); S.ocultos = []; lsSet("doinn_plan_estados", S.planEst); lsSet("doinn_plan_ocultos", []); re(); };
    const bo = $("bocu"); if (bo) bo.onclick = () => { S.ocultos = []; lsSet("doinn_plan_ocultos", []); re(); };
    $app.querySelectorAll("[data-pid]").forEach(el => el.onclick = () => panelProyecto(ctx, S.proyectos.find(p => p.id === +el.dataset.pid), D, () => re({ scroll: w.scrollLeft })));
  } else {
    $app.querySelectorAll(".gg").forEach(g => g.onclick = () => { S.planCerr[g.dataset.g] = !S.planCerr[g.dataset.g]; re({ scroll: w.scrollLeft, silencioso: true }); });
    $app.querySelectorAll("[data-pg]").forEach(b => b.onclick = () => { S.perGrupo = b.dataset.pg; re({ scroll: w.scrollLeft, silencioso: true }); });
    let tq; $("perq").oninput = e => { clearTimeout(tq); tq = setTimeout(() => { S.perQ = e.target.value; re({ scroll: w.scrollLeft, silencioso: true }).then(() => { const i = $("perq"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); }, 250); };
    if (marca) activaMarcado(ctx, D, misCodigos, () => re({ scroll: w.scrollLeft, silencioso: true }));
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
    const ds = sel.map(h => h.dataset.d).sort();
    const nom = ops.length === 1 ? ((S.operarios.find(o => o.id === ops[0]) || {}).nombre || "") : `${ops.length} personas`;
    const fdc = s => s.split("-").reverse().slice(0, 2).join("/");
    const proys = S.proyectos.filter(p => p.estado !== "Cerrado" && !caido(p)).sort((a, b) => (a.fecha_carga || "9").localeCompare(b.fecha_carga || "9"));
    const m = document.createElement("div"); m.className = "mmenu";
    m.innerHTML = `<div class="mm-h"><b>${esc(nom)}</b><span>${ds.length === 1 || ds[0] === ds[ds.length - 1] ? fdc(ds[0]) : `${fdc(ds[0])} → ${fdc(ds[ds.length - 1])}`}</span></div>
      ${ops.length === 1 ? `<div class="mm-r"><label>Hasta <input type="date" id="mmh" value="${ds[ds.length - 1]}" min="${ds[0]}"></label></div>` : ""}
      ${codigos.some(c => CON_PROY.includes(c)) ? `<div class="mm-r"><select id="mmp"><option value="">Proyecto (opcional)</option>${proys.map(p => `<option value="${p.id}" ${String(p.id) === String(S.ultProy || "") ? "selected" : ""}>${esc(p.codigo)} · ${esc(corto(p.nombre, 28))}</option>`).join("")}</select></div>` : ""}
      <div class="mm-g">${codigos.map(c => `<button data-c="${c}" style="--c:${COD[c][1]}" class="${c === "PV" ? "pv" : ""}">${COD[c][0]}</button>`).join("")}</div>
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
    ${p.coordinacion_ok ? `<span class="pill ok">✓ Coordinado</span>` : `<span class="pill warn">Sin coordinar</span>`}
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
      ${puede("admin") ? `<a class="btn ghost" href="#/p/${p.id}/editar">Editar ficha</a><a class="btn ghost" href="#/p/${p.id}/equipo">Asignar equipo</a>` : ""}
      <button class="btn ghost" id="doc">Ocultar del Gantt</button>
    </div>
  </aside>`;
  document.body.appendChild(m);
  const cierra = () => m.remove();
  m.onclick = e => { if (e.target === m) cierra(); };
  m.querySelector("#dx").onclick = cierra;
  m.querySelectorAll("a").forEach(a => a.addEventListener("click", cierra));
  m.querySelector("#doc").onclick = () => { S.ocultos = [...new Set([...(S.ocultos || []), p.id])]; lsSet("doinn_plan_ocultos", S.ocultos); cierra(); fin(); };
  const esc2 = e => { if (e.key === "Escape") { cierra(); document.removeEventListener("keydown", esc2); } };
  document.addEventListener("keydown", esc2);
}

// ---------- Estadísticas anuales por persona ----------
async function vStats(ctx, anio) {
  const { $app, S, sb, esc, puede } = ctx;
  if (!puede("admin")) { $app.innerHTML = `<div class="empty">Solo administradores.</div>`; return; }
  const y = +anio || new Date().getFullYear();
  $app.innerHTML = `<div class="loading">Calculando…</div>`;
  let D; try { D = await cargaPlan(sb); } catch (e) { $app.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const dia = motorDias(S, D);
  const hoy = iso(new Date());
  const dias = []; for (let d = new Date(y, 0, 1); d.getFullYear() === y; d.setDate(d.getDate() + 1)) dias.push(iso(d));
  const COLS = [["MO", "Montaje"], ["DM", "Desmontaje"], ["F", "En festivo / finde"], ["PV", "Previsión"], ["RE", "Reuniones"], ["FO", "Formación"], ["VA", "Vacaciones"], ["LIC", "Licencias"], ["BA", "Baja"]];
  const ops = S.operarios.filter(o => o.activo !== false).sort((a, b) => (a.grupo || "").localeCompare(b.grupo || "") || a.nombre.localeCompare(b.nombre));
  const filas = ops.map(o => {
    const c = {}; COLS.forEach(([k]) => c[k] = 0);
    dias.forEach(d => { const x = dia(o, d); if (!x) return; if (c[x.cod] != null) c[x.cod]++; if (["MO", "DM"].includes(x.cod) && esFestivo(d, D.fest)) c.F++; });
    return { o, c };
  }).filter(f => COLS.some(([k]) => f.c[k]));
  const tot = {}; COLS.forEach(([k]) => tot[k] = filas.reduce((s, f) => s + f.c[k], 0));
  $app.innerHTML = `<h1>Planificación</h1>
  <div class="pnav"><div class="seg2"><a href="#/plan/proyectos">Proyectos</a><a href="#/plan/personal">Personal</a><a class="on">Estadísticas</a></div>
    <div class="row"><a class="btn sm ghost" href="#/plan/stats/${y - 1}">‹ ${y - 1}</a><b>${y}</b><a class="btn sm ghost" href="#/plan/stats/${y + 1}">${y + 1} ›</a><button class="btn sm ghost" id="bcsv">Descargar CSV</button></div></div>
  <p class="hint">Días por persona en ${y}${y === new Date().getFullYear() ? ` (incluye lo planificado después de hoy, ${hoy.split("-").reverse().join("/")})` : ""}. Cuenta asignaciones, ausencias y lo pintado con el pincel. «En festivo / finde» = días de montaje o desmontaje en sábado, domingo o festivo.</p>
  <div class="gwrap"><table class="stats"><thead><tr><th>Persona</th>${COLS.map(([, l]) => `<th>${l}</th>`).join("")}</tr></thead>
  <tbody>${filas.map(f => `<tr><td><b>${esc(f.o.nombre)}</b><span class="code"> ${esc(f.o.grupo || "")}</span></td>${COLS.map(([k]) => `<td class="${k === "F" && f.c[k] ? "fzt" : ""}">${f.c[k] || ""}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${COLS.length + 1}" class="code">Sin datos en ${y}.</td></tr>`}</tbody>
  <tfoot><tr><td>Total</td>${COLS.map(([k]) => `<td>${tot[k] || ""}</td>`).join("")}</tr></tfoot></table></div>`;
  document.getElementById("bcsv").onclick = () => {
    const csv = ["Persona;Grupo;" + COLS.map(c => c[1]).join(";"), ...filas.map(f => [f.o.nombre, f.o.grupo || "", ...COLS.map(([k]) => f.c[k])].join(";"))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })); a.download = `planificacion_${y}.csv`; a.click();
  };
}

// ---------- Pantalla de taller (TV) ----------
export function vTv(ctx) {
  document.body.classList.add("tv");
  let modo = "proyectos", t = 0;
  const pinta = () => vPlan(ctx, modo, "", { tv: true, silencioso: t > 0 });
  pinta();
  const id = setInterval(async () => {
    if (location.hash !== "#/tv") { clearInterval(id); document.body.classList.remove("tv"); return; }
    t++;
    if (t % 10 === 0) { try { await ctx.recargar(); } catch { } } // datos frescos cada ~5 min
    modo = modo === "proyectos" ? "personal" : "proyectos";
    pinta();
  }, 30000);
  const sal = () => { if (location.hash !== "#/tv") { clearInterval(id); document.body.classList.remove("tv"); window.removeEventListener("hashchange", sal); } };
  window.addEventListener("hashchange", sal);
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
  const edita = puede("admin");
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
  const rango = o => o.grupo === "Taller" ? (o.subgrupo === "Montaje" ? 0 : 1) : o.grupo === "Externos" ? 2 : 3;
  const taller = S.operarios.filter(o => o.activo !== false).sort((a, b) => rango(a) - rango(b) || a.nombre.localeCompare(b.nombre));
  const choque = a => D.asig.filter(x => x.id !== a.id && x.operario_id === a.operario_id && x.proyecto_id !== p.id && x.fecha_inicio && a.fecha_inicio && x.fecha_inicio <= (a.fecha_fin || a.fecha_inicio) && (x.fecha_fin || x.fecha_inicio) >= a.fecha_inicio)
    .map(x => (S.proyectos.find(q => q.id === x.proyecto_id) || {}).nombre).filter(Boolean);
  const f0 = fechasDe("Montaje");
  cont.innerHTML = `${!confirmado(p) ? `<div class="card avisos">Proyecto <b>${esc(estadoCom(p))}</b>: lo que asignes aquí aparece como <b>previsión</b> en Planificación hasta que se confirme.</div>` : ""}
  <div class="card"><h2>Personal asignado <small class="code">${mias.length}</small></h2>
    ${mias.map(a => { const c = choque(a); return `<div class="crow"><div><b>${esc(opN(a.operario_id))}</b> <span class="pill" style="background:${COL[a.fase]}22;color:var(--ink)">${esc(a.fase)}</span>
      <div class="code">${a.fecha_inicio ? fd(a.fecha_inicio) : "—"}${a.fecha_fin && a.fecha_fin !== a.fecha_inicio ? " → " + fd(a.fecha_fin) : ""}${a.creado_por ? ` · por ${esc(a.creado_por)}` : ""}${c.length ? ` · <span style="color:var(--red)">también en ${esc(c.join(", "))}</span>` : ""}</div></div>
      ${edita ? `<button class="link" data-qdel="${a.id}">Quitar</button>` : ""}</div>`; }).join("") || `<div class="code">Nadie asignado todavía.</div>`}
  </div>
  ${edita ? `<form id="fa" class="card frm"><h2>+ Asignar personal</h2>
    <div class="two"><label>Persona<select id="q_op">${taller.map(o => `<option value="${o.id}">${esc(o.nombre)}${o.subgrupo === "Montaje" ? " (montaje)" : o.grupo === "Externos" ? " (externo)" : ""}</option>`).join("")}</select></label>
    <label>Fase<select id="q_f">${FASES.map(f => `<option>${f}</option>`).join("")}</select></label></div>
    <div class="two"><label>Desde<input type="date" id="q_d" value="${f0[0] || ""}"></label><label>Hasta<input type="date" id="q_h" value="${f0[1] || ""}"></label></div>
    <div id="q_av" class="code"></div>
    <button class="btn lime wide">Guardar asignación</button></form>` : ""}`;
  const $ = id => document.getElementById(id);
  const avisa = () => { if (!$("q_op")) return; const c = choque({ id: 0, operario_id: +$("q_op").value, fecha_inicio: $("q_d").value, fecha_fin: $("q_h").value }); $("q_av").innerHTML = c.length ? `<span style="color:var(--red)">Aviso: ya está asignado a ${esc(c.join(", "))} en esas fechas.</span>` : ""; };
  if ($("q_f")) {
    $("q_f").onchange = () => { const [a, b] = fechasDe($("q_f").value); $("q_d").value = a || ""; $("q_h").value = b || ""; avisa(); };
    ["q_op", "q_d", "q_h"].forEach(i => $(i).onchange = avisa); avisa();
    $("fa").onsubmit = async ev => {
      ev.preventDefault();
      const row = { proyecto_id: p.id, operario_id: +$("q_op").value, fase: $("q_f").value, fecha_inicio: $("q_d").value || null, fecha_fin: $("q_h").value || $("q_d").value || null, creado_por: (S.perfil && (S.perfil.nombre || S.perfil.email)) || S.user.email };
      if (mias.some(a => a.operario_id === row.operario_id && a.fase === row.fase)) return toast("Esa persona ya está asignada a esa fase.");
      const { error } = await sb.from("asignaciones").insert(row);
      if (error) return toast(error.message);
      toast("Asignación guardada"); vEquipo(ctx, p, cont);
    };
  }
  cont.querySelectorAll("[data-qdel]").forEach(b => b.onclick = async () => { if (!confirm("¿Quitar esta asignación?")) return; await sb.from("asignaciones").delete().eq("id", +b.dataset.qdel); vEquipo(ctx, p, cont); });
}
