// Saturación de taller: reparte lo pendiente de fabricar entre los días que quedan hasta cada carga,
// respetando el orden de las fases, y lo compara con la capacidad de cada sección según el personal en fábrica.
const V = new URL(import.meta.url).search;
const { enMarcha } = await import("./estados.js" + V);

const SECC = [
  { k: "corte", t: "Corte", fase: "Corte", sub: "CNC y seccionadora", pue: /CNC|SECCIONAD|CORTE/i },
  { k: "carpinteria", t: "Carpintería", fase: "Carpintería", sub: "por carpintero", pue: /CARPINT|MONTA/i },
  { k: "caldereria", t: "Calderería", fase: "Cerrajería", sub: "", pue: /CALDER|CERRAJ|SOLDAD/i },
  { k: "pintura", t: "Pintura", fase: "Pintura", sub: "", pue: /PINT|LACA/i },
  { k: "cargas", t: "Cargas", fase: null, sub: "", pue: /EXPEDIC|LOGIST|CARGA/i },
];
// Capacidad provisional (unidades/día). Carpintería es por cada carpintero en fábrica; el resto, por sección con la plantilla completa.
export const CAP_DEF = { corte: 10, carpinteria: 4, caldereria: 3, pintura: 6, cargas: 30 };
// Márgenes antes de la carga (días laborables). Pintura: secado 1 día; si es laca, 2.
const M = { corte: 3, carp: 1, secado: 1, secadoLaca: 2 };
const AUSENTE = ["VA", "BA", "LIC", "MO", "DM", "FO", "ND", "LB"];
const HORIZ = 10; // días laborables que se muestran (2 semanas)

const tiene = (l, f) => (l || "").includes("|" + f + "|");
const iso = d => d.toISOString().slice(0, 10);
const pd = s => new Date(s + "T12:00:00Z");
const esLaca = x => /LACA/i.test(x || "");

async function todas(sb, tabla, cols, f) {
  const out = []; for (let i = 0; ; i += 1000) { let q = sb.from(tabla).select(cols).range(i, i + 999); if (f) q = f(q); const { data, error } = await q; if (error) throw error; out.push(...data); if (data.length < 1000) break; } return out;
}

export async function cargaSaturacion(ctx) {
  const { sb, S } = ctx;
  const hoy = iso(new Date());
  const act = S.proyectos.filter(p => p.estado !== "Cerrado" && !p.archivado && enMarcha(p) && p.fecha_carga);
  const pasados = act.filter(p => p.fecha_carga < hoy);
  const vivos = act.filter(p => p.fecha_carga >= hoy);
  const ids = vivos.map(p => p.id);
  const [els, subs, pzs, fest, jor, aj] = await Promise.all([
    ids.length ? todas(sb, "elementos", "id,proyecto_id,cantidad,fases,fases_hechas,estado_fab,estado_carga,acabado,origen", q => q.in("proyecto_id", ids)) : [],
    ids.length ? todas(sb, "subelementos", "elemento_id,proyecto_id,cantidad,fases,fases_hechas,terminado,acabado,origen", q => q.in("proyecto_id", ids)) : [],
    ids.length ? todas(sb, "piezas", "elemento_id,cortada,fabricada", q => q.in("proyecto_id", ids)).catch(() => []) : [],
    sb.from("festivos").select("*").then(r => (r.data || []).filter(x => x.ambito !== "Comunidad de Madrid")),
    todas(sb, "jornadas", "operario_id,fecha,codigo", q => q.gte("fecha", hoy)).catch(() => []),
    sb.from("ajustes").select("valor").eq("clave", "capacidad_taller").maybeSingle().then(r => r.error ? null : r.data, () => null),
  ]);
  const cap = { ...CAP_DEF, ...((aj && aj.valor) || {}) };
  return calcula({ S, hoy, vivos, pasados, els, subs, pzs, fest, jor, cap });
}

export function calcula({ S, hoy, vivos, pasados, els, subs, pzs, fest, jor, cap }) {
  // Días laborables desde hoy hasta la última carga (mínimo el horizonte)
  const festS = new Set(fest.map(f => f.fecha));
  const lab = s => { const w = pd(s).getUTCDay(); return w !== 0 && w !== 6 && !festS.has(s); };
  const ultima = vivos.reduce((m, p) => p.fecha_carga > m ? p.fecha_carga : m, hoy);
  const dias = []; for (let d = pd(hoy); dias.length < HORIZ || iso(d) <= ultima; d.setUTCDate(d.getUTCDate() + 1)) { const s = iso(d); if (lab(s)) dias.push(s); if (dias.length > 400) break; }
  const N = dias.length;
  const carga = Object.fromEntries(SECC.map(s => [s.k, new Array(N).fill(0)]));
  const porProy = Object.fromEntries(SECC.map(s => [s.k, new Map()]));
  const pend = Object.fromEntries(SECC.map(s => [s.k, 0]));
  const reparte = (k, p, uds, a, b) => {
    if (!uds) return;
    b = Math.min(Math.max(b, 0), N - 1); a = Math.min(Math.max(a, 0), b);
    const n = b - a + 1; for (let i = a; i <= b; i++) carga[k][i] += uds / n;
    pend[k] += uds; const m = porProy[k]; const x = m.get(p.id) || { p, uds: 0, ini: dias[a], fin: dias[b] }; x.uds += uds; if (dias[a] < x.ini) x.ini = dias[a]; if (dias[b] > x.fin) x.fin = dias[b]; m.set(p.id, x);
  };
  const subsDe = new Map(); subs.forEach(s => { const l = subsDe.get(s.elemento_id) || []; l.push(s); subsDe.set(s.elemento_id, l); });
  const pzDe = new Map(); pzs.forEach(z => { const l = pzDe.get(z.elemento_id) || []; l.push(z); pzDe.set(z.elemento_id, l); });
  const P = new Map(vivos.map(p => [p.id, p]));
  for (const e of els) {
    const p = P.get(e.proyecto_id); if (!p || e.estado_carga === "Cargado") continue;
    const cant = +e.cantidad || 1;
    // Nº de días laborables antes del día de carga (el día de carga es para Cargas)
    const k = dias.filter(d => d < p.fecha_carga).length;
    const iC = dias.indexOf(p.fecha_carga);
    reparte("cargas", p, cant, iC >= 0 ? iC : Math.max(0, k), iC >= 0 ? iC : Math.max(0, k));
    if (e.estado_fab === "Hecho" || /^Almac/i.test(e.origen || "")) continue;
    const ss = (subsDe.get(e.id) || []).filter(s => !/^Almac/i.test(s.origen || ""));
    const pz = pzDe.get(e.id) || [];
    // Unidades pendientes de cada fase: con subelementos, las de cada subelemento pendiente (× unidades del elemento); sin ellos, las del elemento
    const udsFase = fa => {
      const conF = ss.filter(s => tiene(s.fases, fa));
      if (conF.length) return conF.filter(s => !s.terminado && !tiene(s.fases_hechas, fa)).reduce((t, s) => t + (+s.cantidad || 1) * cant, 0) * (tiene(e.fases_hechas, fa) ? 0 : 1);
      if (!tiene(e.fases, fa) || tiene(e.fases_hechas, fa)) return 0;
      if (fa === "Corte" && pz.length && pz.every(z => z.cortada || z.fabricada)) return 0;
      return cant;
    };
    const u = { corte: udsFase("Corte"), carp: udsFase("Carpintería"), cald: udsFase("Cerrajería"), pint: udsFase("Pintura") };
    const laca = esLaca(e.acabado) || ss.some(s => tiene(s.fases, "Pintura") && esLaca(s.acabado));
    // Último día (índice) en que puede hacerse cada fase, contando hacia atrás desde la carga
    const finPint = k - 1 - (laca ? M.secadoLaca : M.secado);
    const finCarp = u.pint ? finPint - 1 : k - M.carp;
    const sig = (u.carp || u.cald) ? finCarp : u.pint ? finPint : Infinity;
    const finCorte = Math.min(k - M.corte, sig - 1);
    // Flujo en cadena: cada fase puede empezar el día siguiente a que empiece la anterior (si sigue pendiente) y debe acabar antes de su límite
    const iniCarp = u.corte ? 1 : 0;
    const iniPint = (u.carp || u.cald) ? iniCarp + 1 : u.corte ? 1 : 0;
    reparte("corte", p, u.corte, 0, finCorte);
    reparte("carpinteria", p, u.carp, iniCarp, finCarp);
    reparte("caldereria", p, u.cald, iniCarp, finCarp);
    reparte("pintura", p, u.pint, iniPint, finPint);
  }
  // Capacidad diaria según quién está en fábrica
  const fab = S.operarios.filter(o => o.activo !== false && ["Taller", "Externos"].includes(o.grupo));
  const ausente = new Set(jor.filter(j => AUSENTE.includes(j.codigo)).map(j => j.operario_id + "|" + j.fecha));
  const capDia = {};
  for (const s of SECC) {
    const gente = fab.filter(o => s.pue.test(o.puesto || ""));
    capDia[s.k] = dias.map(d => {
      if (!gente.length) return cap[s.k];
      const n = gente.filter(o => !ausente.has(o.id + "|" + d)).length;
      return s.k === "carpinteria" ? cap[s.k] * n : cap[s.k] * n / gente.length;
    });
    capDia[s.k + "_n"] = gente.length;
  }
  const H = Math.min(HORIZ, N);
  const res = SECC.map(s => {
    const c = carga[s.k].slice(0, H), cp = capDia[s.k].slice(0, H);
    const tc = c.reduce((a, b) => a + b, 0), tp = cp.reduce((a, b) => a + b, 0);
    return { ...s, pend: pend[s.k], uds: tc, cap: tp, pct: tp ? tc / tp * 100 : tc ? 999 : 0, diario: c.map((x, i) => ({ d: dias[i], uds: x, cap: cp[i], pct: cp[i] ? x / cp[i] * 100 : x ? 999 : 0 })),
      proys: [...porProy[s.k].values()].sort((a, b) => a.p.fecha_carga.localeCompare(b.p.fecha_carga)), personas: capDia[s.k + "_n"] };
  });
  return { res, dias: dias.slice(0, H), cap, pasados, conDespiece: new Set(els.map(e => e.proyecto_id)).size, vivos: vivos.length };
}

// Estado de un día o una sección: holgado (<80 %), justo (80-100 %), saturado (>100 %)
const est = pct => pct > 100 ? "sat" : pct >= 80 ? "jus" : "hol";
const EST_TXT = { hol: "Con holgura", jus: "Justo", sat: "Saturado" };
const DS = ["D", "L", "M", "X", "J", "V", "S"];
const DL = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const r1 = x => x >= 10 ? Math.round(x) : Math.round(x * 10) / 10;
const pctTxt = p => p >= 999 ? "sin personal" : Math.round(p) + " %";
const listaY = l => l.length <= 1 ? l.join("") : l.slice(0, -1).join(", ") + " y " + l[l.length - 1];

export function pintaSaturacion(ctx, el, D, abierta) {
  const { esc, fd, can } = ctx;
  const puedeAjustar = can && can("capacidad");
  // Para cada sección: peor estado de los próximos días y qué días se pasa de capacidad
  const R = D.res.map(s => {
    const malos = s.diario.filter(x => x.uds > 0.05 && est(x.pct) === "sat");
    const justos = s.diario.filter(x => x.uds > 0.05 && est(x.pct) === "jus");
    const pico = s.diario.reduce((m, x) => x.pct > m.pct ? x : m, { pct: 0 });
    const e = malos.length ? "sat" : justos.length ? "jus" : "hol";
    return { ...s, malos, justos, pico, e };
  });
  const dia = d => `${DL[pd(d).getUTCDay()]} ${pd(d).getUTCDate()}`;
  const satur = R.filter(s => s.e === "sat"), just = R.filter(s => s.e === "jus");
  const resumen = satur.length
    ? `<b class="t-sat">⚠ ${listaY(satur.map(s => s.t))} ${satur.length > 1 ? "van" : "va"} por encima de su capacidad</b> algún día de las próximas dos semanas.${just.length ? ` ${listaY(just.map(s => s.t))} ${just.length > 1 ? "van" : "va"} justo.` : ""} El resto, con holgura.`
    : just.length ? `<b class="t-jus">${listaY(just.map(s => s.t))} ${just.length > 1 ? "van" : "va"} justo</b> algún día. El resto, con holgura.`
    : `<b class="t-hol">✓ Todo el taller va con holgura</b> las próximas dos semanas.`;
  el.innerHTML = `<div class="sat-h"><h2>Saturación de taller <small class="code">próximas 2 semanas</small></h2>${puedeAjustar ? `<button class="link" id="satcfg">⚙ Capacidad</button>` : ""}</div>
  <p class="sat-res">${resumen}</p>
  <div class="sat-ley"><span><i class="c-hol"></i>Con holgura · menos del 80 %</span><span><i class="c-jus"></i>Justo · 80-100 %</span><span><i class="c-sat"></i>Saturado · más del 100 %</span><span><i class="c-vac"></i>Sin trabajo</span></div>
  <div class="sat2">
    <div class="sat2-r sat2-cab"><div></div><div class="sat2-cal">${D.dias.map(d => `<span><b>${DS[pd(d).getUTCDay()]}</b>${pd(d).getUTCDate()}</span>`).join("")}</div></div>
    ${R.map(s => `<div class="sat2-r ${abierta === s.k ? "sel" : ""}" data-s="${s.k}" title="Pulsa para ver qué proyectos cargan ${s.t}">
      <div class="sat2-n"><b>${s.t}</b><span class="sat-pill p-${s.e}">${EST_TXT[s.e]}</span>
        <small>${s.malos.length ? `Se pasa ${s.malos.length === 1 ? "el " + dia(s.malos[0].d) : s.malos.length + " días (desde el " + dia(s.malos[0].d) + ")"}` : s.pend > 0.05 ? `Pico ${pctTxt(s.pico.pct)} el ${dia(s.pico.d)}` : "Nada pendiente"}</small></div>
      <div class="sat2-cal">${s.diario.map(x => { const v = x.uds <= 0.05; const e = v ? "vac" : est(x.pct); return `<span class="c-${e}" title="${s.t} · ${dia(x.d)}: ${v ? "sin trabajo" : `${r1(x.uds)} uds de ${r1(x.cap)} posibles (${pctTxt(x.pct)})`}">${v ? "" : x.pct >= 999 ? "!" : Math.round(x.pct)}</span>`; }).join("")}</div>
    </div>`).join("")}
  </div>
  <p class="code sat-nota">Cada casilla es un día laborable; el número es el % de su capacidad que ocupa ese día. Pulsa una sección para ver qué proyectos la cargan.</p>
  ${abierta ? (() => { const s = R.find(x => x.k === abierta); return `<div class="sat-det"><h3>${s.t} · ${r1(s.pend)} unidades pendientes${s.personas ? ` · ${s.personas} persona${s.personas > 1 ? "s" : ""} en la sección` : ""}</h3>
    ${s.proys.length ? s.proys.map(x => `<a class="lrow" href="#/p/${x.p.id}/elementos"><div><b>${esc(x.p.nombre)}</b><div class="code">${esc(x.p.codigo)} · carga ${fd(x.p.fecha_carga)}</div></div><div class="r"><b>${r1(x.uds)} uds</b><div class="code">${x.ini === x.fin ? fd(x.ini) : fd(x.ini) + " → " + fd(x.fin)}</div></div></a>`).join("") : `<p class="hint">Nada pendiente en esta sección.</p>`}</div>`; })() : ""}
  ${D.conDespiece < D.vivos || D.pasados.length ? `<p class="sat-av">${D.conDespiece < D.vivos ? `ⓘ ${D.vivos - D.conDespiece} de ${D.vivos} proyectos con fecha de carga aún no tienen despiece en la app y no cuentan.` : ""}${D.pasados.length ? ` ${D.pasados.length} proyecto${D.pasados.length > 1 ? "s" : ""} con la carga ya pasada no se cuentan.` : ""}</p>` : ""}
  <details class="sat-como"><summary class="link">¿Cómo se calcula?</summary><p class="hint">Cada unidad pendiente cuenta 1, sea simple o compleja. Se reparte entre los días que quedan hasta la carga respetando el orden de las fases: corte terminado ${M.corte} días antes de la carga, carpintería y calderería ${M.carp} día antes (o antes de pintar), y pintura con ${M.secado} día de secado (${M.secadoLaca} si es laca). La capacidad de cada día depende de quién está en fábrica: baja si hay vacaciones, bajas, montajes o personas no disponibles. Capacidad actual (unidades/día): corte ${D.cap.corte}, carpintería ${D.cap.carpinteria} por carpintero, calderería ${D.cap.caldereria}, pintura ${D.cap.pintura}, cargas ${D.cap.cargas}.</p></details>
  <div id="satform"></div>`;
  el.querySelectorAll("[data-s]").forEach(r => r.onclick = () => pintaSaturacion(ctx, el, D, abierta === r.dataset.s ? null : r.dataset.s));
  const b = el.querySelector("#satcfg");
  if (b) b.onclick = () => {
    const f = el.querySelector("#satform");
    f.innerHTML = `<div class="card frm"><h3>Capacidad (unidades al día)</h3><div class="two">${SECC.map(s => `<label>${s.t}${s.sub ? ` <small class="code">${s.sub}</small>` : ""}<input type="number" min="0" step="0.5" data-c="${s.k}" value="${D.cap[s.k]}"></label>`).join("")}</div>
      <p class="hint">Valores provisionales para empezar: ajústalos según lo que veáis en taller.</p><div class="row"><button class="btn lime" id="satok">Guardar</button><button class="btn ghost" id="satx">Cancelar</button></div></div>`;
    f.querySelector("#satx").onclick = () => f.innerHTML = "";
    f.querySelector("#satok").onclick = async () => {
      const valor = Object.fromEntries([...f.querySelectorAll("[data-c]")].map(i => [i.dataset.c, Math.max(0, +i.value || 0)]));
      const { error } = await ctx.sb.from("ajustes").upsert({ clave: "capacidad_taller", valor, actualizado: new Date().toISOString(), autor: (ctx.S.perfil && (ctx.S.perfil.nombre || ctx.S.perfil.email)) || null });
      if (error) return ctx.toast("No se pudo guardar: " + error.message);
      ctx.toast("Capacidad guardada"); const D2 = await cargaSaturacion(ctx); pintaSaturacion(ctx, el, D2, abierta);
    };
  };
}
