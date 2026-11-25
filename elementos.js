// Pestaña Elementos del proyecto y detalle de elemento (fases, piezas, subelementos)
const V = new URL(import.meta.url).search;
const { origenTxt, medidasTxt, ralChips, ordenEl, faltanFases } = await import("./despiece.js" + V);
const ORD = ["Corte", "Carpintería", "Cerrajería", "Pintura"];
const sigFase = (fases, hechas) => ORD.find(f => tiene(fases, f) && !tiene(hechas, f)) || null;
const tiene = (lista, f) => (lista || "").includes("|" + f + "|");
const fasesDe = x => ORD.filter(f => tiene(x.fases, f));
const ahora = () => new Date().toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

async function datosProyecto(sb, pid) {
  const [e, pz, sub] = await Promise.all([
    sb.from("elementos").select("*").eq("proyecto_id", pid).order("num_item", { ascending: true, nullsFirst: false }).order("referencia"),
    sb.from("piezas").select("*").eq("proyecto_id", pid).order("num_pieza"),
    sb.from("subelementos").select("*").eq("proyecto_id", pid).order("num_sub"),
  ]);
  for (const r of [e, pz, sub]) if (r.error) throw r.error;
  return { els: e.data.sort(ordenEl), pz: pz.data, sub: sub.data };
}

function estadoPill(x, subs = []) {
  if (x.estado_carga === "Cargado") return ["Cargado", "ok"];
  if (x.estado_fab === "Hecho") return ["Listo para carga", "ok"];
  if (x.estado_doc === "Hecho" && (x.fases || subs.length) && !faltanFases(x, subs).length) return ["Fases terminadas · escanear QR", "info"];
  if (x.estado_fab === "En curso") return ["Fab · en curso", "warn"];
  if (x.estado_doc === "Hecho") return ["Pendiente fabricar", "info"];
  return ["Falta doc.", ""];
}

// ---------- lista de elementos ----------
export async function vElementos(ctx, p, cont) {
  const { sb, esc, S } = ctx;
  cont.innerHTML = `<div class="loading">Cargando elementos…</div>`;
  let d;
  try { d = await datosProyecto(sb, p.id); } catch (e) { cont.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const els = d.els;
  const filtros = [
    ["todos", "Todos", () => true],
    ["doc", "Falta doc.", x => x.estado_doc !== "Hecho"],
    ["fab", "Falta fabricar", x => x.estado_doc === "Hecho" && x.estado_fab !== "Hecho"],
    ["carga", "Listo para carga", x => x.estado_fab === "Hecho" && x.estado_carga !== "Cargado"],
    ["inc", "Incidencias", x => x.incidencia],
  ];
  const f = S.filtroEl || "todos";
  const fn = (filtros.find(x => x[0] === f) || filtros[0])[2];
  const n = els.length, cnt = k => els.filter(k).length;
  // avance por fase de fabricación (elementos que la necesitan)
  // Avance por fase: cuenta el elemento si necesita la fase (él o alguno de sus subelementos);
  // hecha si la marcó el elemento, todos sus subelementos que la llevan, o ya está fabricado. Corte también si todas sus unidades están cortadas.
  const faseEl = (x, fa) => {
    const ss = d.sub.filter(k => k.elemento_id === x.id), conF = ss.filter(k => tiene(k.fases, fa));
    const req = tiene(x.fases, fa) || conF.length > 0;
    if (!req) return null;
    const pzs = d.pz.filter(z => z.elemento_id === x.id);
    const hecha = x.estado_fab === "Hecho" || tiene(x.fases_hechas, fa) || (conF.length > 0 && conF.every(k => tiene(k.fases_hechas, fa))) || (fa === "Corte" && pzs.length > 0 && pzs.every(z => z.cortada || z.fabricada));
    const curso = !hecha && (tiene(x.fases_curso, fa) || conF.some(k => tiene(k.fases_hechas, fa) || tiene(k.fases_curso, fa)) || (fa === "Corte" && pzs.some(z => z.cortada)));
    return hecha ? "done" : curso ? "run" : "pend";
  };
  const barras = ORD.map(fa => { const st = els.map(x => faseEl(x, fa)).filter(Boolean); if (!st.length) return ""; const ok = st.filter(v => v === "done").length, run = st.filter(v => v === "run").length; return `<div class="fb"><span>${fa === "Cerrajería" ? "Calderería" : fa}</span><div class="bar"><i style="width:${Math.round(100 * ok / st.length)}%"></i><i class="run" style="width:${Math.round(100 * run / st.length)}%"></i></div><b>${ok}/${st.length}</b>${run ? `<small class="code">${run} en curso</small>` : ""}</div>`; }).join("");
  cont.innerHTML = `
  ${barras ? `<div class="card"><h2>Avance por fases <small class="code">elementos</small></h2>${barras}</div>` : ""}
  <div class="kpis">
    <div class="card k"><span>Doc. técnica</span><b>${cnt(x => x.estado_doc === "Hecho")}/${n}</b></div>
    <div class="card k"><span>Fabricación</span><b>${cnt(x => x.estado_fab === "Hecho")}/${n}</b></div>
    <div class="card k"><span>Carga</span><b>${cnt(x => x.estado_carga === "Cargado")}/${n}</b></div>
  </div>
  <div class="chips">${filtros.map(([k, l, g]) => `<button class="chip ${k === f ? "on" : ""}" data-f="${k}">${l} · ${cnt(g)}</button>`).join("")}</div>
  ${els.filter(fn).map(x => {
    const pzs = d.pz.filter(z => z.elemento_id === x.id), subs = d.sub.filter(s => s.elemento_id === x.id);
    const [sl, sc] = estadoPill(x, subs);
    return `<a class="card el" href="#/p/${p.id}/el/${x.id}">
      <div class="pj-top"><div><span class="num">${String(x.num_item ?? "").padStart(3, "0")}</span> <b>${esc(x.elemento || x.referencia)}</b> <span class="code">· ${x.cantidad || 1} ud${(x.cantidad || 1) > 1 ? "s" : ""}</span></div><span class="pill ${sc}">${sl}</span></div>
      <div class="pj-meta"><span>${esc(x.referencia || "")}</span>${medidasTxt(x) ? `<span>📐 ${medidasTxt(x)}</span>` : ""}${origenTxt(x.origen) === "Almacén" ? `<span class="pill info">Almacén</span>` : ""}${x.acabado ? `<span>${esc(x.acabado)}</span>` : ""}${x.ral ? `<span>${ralChips(x.ral, esc)}</span>` : ""}${pzs.length ? `<span>QR ${pzs.filter(z => z.fabricada).length}/${pzs.length}</span>` : ""}${subs.length ? `<span>Sub ${subs.filter(s => s.terminado).length}/${subs.length}</span>` : ""}${x.es_extra ? `<span class="pill warn">Extra</span>` : ""}${x.incidencia ? `<span class="pill bad">Incidencia</span>` : ""}</div>
    </a>`;
  }).join("") || `<div class="empty">${n ? "Ningún elemento con este filtro." : "Este proyecto aún no tiene despiece."}</div>`}`;
  cont.querySelectorAll(".chip").forEach(b => b.onclick = () => { S.filtroEl = b.dataset.f; vElementos(ctx, p, cont); });
}

// ---------- detalle de elemento ----------
export async function vElemento(ctx, p, eid) {
  const { $app, sb, esc, toast, puede, S } = ctx;
  $app.innerHTML = `<div class="loading">Cargando…</div>`;
  let d;
  try { d = await datosProyecto(sb, p.id); } catch (e) { $app.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const x = d.els.find(e => e.id === +eid);
  if (!x) { $app.innerHTML = `<div class="empty">Elemento no encontrado.</div>`; return; }
  const pzs = d.pz.filter(z => z.elemento_id === x.id), subs = d.sub.filter(s => s.elemento_id === x.id);
  let incs = [];
  try { const r = await sb.from("incidencias").select("*").eq("elemento_id", x.id).order("fecha", { ascending: false }); incs = r.data || []; } catch { }
  const yo = (S.perfil && S.perfil.nombre) || (S.user.email || "").split("@")[0];
  const edita = puede("admin", "taller");
  // La documentación técnica solo la cambian Oficina Técnica y administración (el taller la ve en solo lectura)
  // Documentación técnica y qué fases lleva cada elemento: solo Oficina Técnica (ficha OT vinculada) y SuperAdmin
  const editaDoc = puede("superadmin") || (S.operarios || []).some(o => o.id === (S.perfil && S.perfil.operario_id) && o.grupo === "OT");
  const recarga = () => vElemento(ctx, p, eid);
  const upd = async (tabla, id, cambios, msg) => {
    const { error } = await sb.from(tabla).update(cambios).eq("id", id);
    if (error) { toast("No se pudo guardar: " + error.message); return false; }
    if (msg) toast(msg);
    return true;
  };

  // Estado en 3 fases horizontales (Doc → Fab → Carga). Blanco = pendiente, naranja = en curso, verde = hecho.
  const faltan = faltanFases(x, subs);
  const docH = x.estado_doc === "Hecho", fabH = x.estado_fab === "Hecho", carH = x.estado_carga === "Cargado";
  const est = (hecho, estado, lock) => hecho && !lock ? "done" : !lock && (estado === "En curso" || estado === "Parcial") ? "run" : "pend";
  const FASES3 = [
    { k: "doc", t: "Documentación", c: "Doc. técnica", e: est(docH, x.estado_doc, false), lock: false },
    { k: "fab", t: "Fabricación", c: "Fabricación", e: est(fabH, x.estado_fab, !docH), lock: !docH },
    { k: "car", t: "Carga", c: "Carga", e: est(carH, x.estado_carga, !fabH), lock: !fabH },
  ];
  S.elTab = S.elTab || {};
  const sel = S.elTab[x.id] || (FASES3.find(f => f.e !== "done") || FASES3[2]).k;
  const iSel = FASES3.findIndex(f => f.k === sel);
  const TXT = { done: "Hecho", run: "En curso", pend: "Pendiente" };
  const LBL = f => f === "Cerrajería" ? "Calderería" : f;
  const editF = !!S.elEditF && editaDoc;
  // Subfases de fabricación: salen las 4; solo las del elemento están activas. Tocar: pendiente → en curso → hecho
  const subfases = (obj, tipo, lock) => {
    const fs = fasesDe(obj);
    return `<div class="sf4">${ORD.map(f => {
      const act = fs.includes(f), on = act && tiene(obj.fases_hechas, f), cur = act && !on && tiene(obj.fases_curso, f);
      const cls = !act ? "na" : on ? "done" : cur ? "run" : "pend";
      const attr = editF ? `data-ef="${f}" data-t="${tipo}" data-id="${obj.id}"` : act ? `data-f="${f}" data-t="${tipo}" data-id="${obj.id}"` : "";
      const dis = editF ? "" : !act || !edita || lock ? "disabled" : "";
      const tit = editF ? (act ? "Quitar de este elemento" : "Añadir a este elemento") : !act ? "No aplica" : on ? "Hecho" : cur ? "En curso" : "Pendiente";
      return `<button class="sf ${cls} ${editF ? "ed" : ""}" ${attr} ${dis} title="${tit}"><i>${editF ? (act ? "−" : "+") : on ? "✓" : ""}</i><span><b>${LBL(f)}</b><small>${tit}</small></span></button>`;
    }).join("")}</div>`;
  };
  let det = "";
  if (sel === "doc") det = `
      <div class="f3s">${docH ? `✓ Hecho${x.fecha_doc ? " el " + new Date(x.fecha_doc).toLocaleDateString("es-ES") : ""}${x.por_doc ? " · " + esc(x.por_doc) : ""}` : x.estado_doc === "En curso" ? "Oficina Técnica la está preparando" : "Pendiente de Oficina Técnica"}${x.revision ? ` · Rev. ${esc(x.revision)}` : ""}</div>
      ${editaDoc ? `<div class="row">${docH ? `<button class="btn sm ghost" data-a="doc-undo">Deshacer</button>` : `${x.estado_doc !== "En curso" ? `<button class="btn sm ghost" data-a="doc-start">Empezar</button>` : ""}<button class="btn sm lime" data-a="doc-ok">Marcar hecho</button>`}</div>` : ""}`;
  if (sel === "fab") {
    const lock = !docH;
    det = `
      ${subs.length ? subs.map(s => `<div class="sfsub"><div class="pj-top"><div><b>${esc(s.desc_sub || s.titulo)}</b><div class="code">${[`${s.cantidad || 1} pieza${(s.cantidad || 1) > 1 ? "s" : ""}`, origenTxt(s.origen), s.acabado].filter(Boolean).map(esc).join(" · ")} ${ralChips(s.ral, esc)}</div></div>${origenTxt(s.origen) === "Almacén" ? `<span class="pill info">📦 De almacén · sin fabricación</span>` : fasesDe(s).length || editF ? "" : `<button class="fzb ${s.terminado ? "on" : ""}" data-term="${s.id}" ${edita && !lock ? "" : "disabled"}>${s.terminado ? "✓ Listo" : "Marcar listo"}</button>`}</div>${origenTxt(s.origen) !== "Almacén" && (fasesDe(s).length || editF) ? subfases(s, "s", lock) : ""}</div>`).join("") : origenTxt(x.origen) === "Almacén" ? `<div class="f3s">📦 Sale del almacén (inventario): no pasa por fabricación. Se valida escaneando al cargar.</div>` : subfases(x, "e", lock)}
      <div class="f3s ${lock ? "lk" : ""}">${lock ? "🔒 Se desbloquea cuando la documentación esté hecha" : fabH ? `✓ Fabricado${x.operario_fab ? " · " + esc(x.operario_fab) : ""}` : editF ? "Toca una fase para añadirla o quitarla de este elemento." : faltan.length ? `Falta: <b>${faltan.map(f => esc(LBL(f))).join(" · ")}</b> <span class="code">· toca una fase: 1 vez en curso, 2 veces hecha</span>` : `<span class="ok-t">✓ Fases terminadas · escanea el QR de cada unidad</span>`}</div>
      <div class="row">${editaDoc && !fabH ? `<button class="btn sm ghost" data-a="editf">${editF ? "✓ Listo" : "✎ Editar fases"}</button>` : ""}${fabH && puede("admin") ? `<button class="btn sm ghost" data-a="fab-undo">Deshacer fabricado</button>` : ""}</div>`;
  }
  if (sel === "car") det = !fabH ? `<div class="f3s lk">🔒 Se desbloquea cuando esté fabricado</div>` : `<div class="f3s">${carH ? `✓ Cargado${x.operario_carga ? " · " + esc(x.operario_carga) : ""}` : x.estado_carga === "Parcial" ? `Carga parcial · ${x.piezas_cargadas || 0}/${pzs.length || x.cantidad || 1} unidades` : "Pendiente de cargar"}${x.camion ? ` · Camión ${esc(x.camion)}` : ""}</div>
      ${carH ? "" : `<div class="f3s">📷 Se valida escaneando cada unidad al subirla al camión.</div>`}
      ${puede("superadmin") ? `<div class="row">${carH ? `<button class="btn sm ghost" data-a="car-undo">Deshacer</button>` : `<button class="btn sm ghost" data-a="car-ok" title="Solo SuperAdmin: corrección manual">Marcar cargado a mano</button>`}</div>` : ""}`;
  const pasos = `<div class="ftw big"><div class="ftabs">${FASES3.map(f => `<button class="ftab ${f.e} ${sel === f.k ? "on" : ""}" data-tab="${f.k}" title="${f.t}: ${TXT[f.e]}"><i class="dot">${f.e === "done" ? "✓" : ""}</i><span><b><span class="tl">${f.t}</span><span class="tc">${f.c}</span></b><small>${f.lock ? "🔒 " : ""}${TXT[f.e]}</small></span></button>`).join("")}</div><div class="fpanel">${det}</div></div>`;

  // Avance de piezas: cada unidad pasa por Sin cortar → Cortada → Fabricada → Cargada
  const ETAPAS = ["Sin cortar", "Cortada", "Fabricada", "Cargada"];
  const etapa = z => z.cargada ? 3 : z.fabricada ? 2 : z.cortada ? 1 : 0;
  const cuenta = k => pzs.filter(z => etapa(z) >= k).length;
  const deScan = S.scan && S.scan.vuelta && S.scan.vuelta.id === x.id && Date.now() - S.scan.vuelta.t < 10 * 60e3 ? S.scan.vuelta : null;
  const barraAv = (t, k) => { const n = cuenta(k), tot = pzs.length; return `<div class="avb ${n === tot ? "full" : ""}"><div class="avt"><span>${t}</span><b>${n}/${tot}</b></div><div class="avl"><i style="width:${tot ? Math.round(n / tot * 100) : 0}%"></i></div></div>`; };
  const piezasHtml = pzs.length ? `<div class="card" id="cpz"><div class="pj-top"><h2>Unidades <small class="code">avance por QR</small></h2><span class="code">${pzs.length} unidad${pzs.length > 1 ? "es" : ""}</span></div>
    <div class="av3">${barraAv("Cortadas", 1)}${barraAv("Fabricadas", 2)}${barraAv("Cargadas", 3)}</div>
    <details class="pzdet" ${deScan ? "open" : ""}><summary>Ver unidades${edita ? " y corregir a mano" : ""}</summary>
    ${pzs.map(z => { const e = etapa(z); return `<div class="pz2 ${deScan && deScan.zid === z.id ? "hl" : ""}" data-pz="${z.id}">
      <div class="pzh"><span class="num">P${z.num_pieza}</span><div class="pzb"><b>${esc(z.desc_pieza || x.elemento)}</b><div class="code">${esc(z.referencia)}</div></div><span class="pill ${e === 3 ? "ok" : e === 2 ? "ok" : e === 1 ? "warn" : ""}">${ETAPAS[e]}</span></div>
      <div class="pzs">${ETAPAS.slice(1).map((t, k) => `<span class="pst ${e > k ? "on" : ""}"><i></i>${t}</span>`).join("")}</div>
      ${edita ? `<div class="pza" hidden>${e > 0 ? `<button class="btn sm ghost" data-pzm="${z.id}" data-to="${e - 1}">↶ Volver a «${ETAPAS[e - 1]}»</button>` : ""}${e < 3 && (e + 1 < 2 || puede("superadmin")) ? `<button class="btn sm lime" data-pzm="${z.id}" data-to="${e + 1}">Marcar «${ETAPAS[e + 1]}»</button>` : e < 3 ? `<span class="code">«${ETAPAS[e + 1]}» se valida escaneando la etiqueta</span>` : ""}</div>` : ""}
    </div>`; }).join("")}
    <p class="hint" style="margin-top:8px">Lo normal es avanzar escaneando la etiqueta. ${edita ? "Toca una unidad para corregir su estado a mano." : ""}</p></details></div>` : "";

  // Incidencias: comentario + foto (varias por elemento)
  const abiertas = incs.filter(i => !i.resuelta).length;
  const fh = t => new Date(t).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const incHtml = `<div class="card" id="cinc"><div class="pj-top"><h2>Incidencias</h2><span class="pill ${abiertas ? "bad" : ""}">${abiertas ? `${abiertas} abierta${abiertas > 1 ? "s" : ""}` : "Sin incidencias abiertas"}</span></div>
    ${incs.map(i => `<div class="inc ${i.resuelta ? "res" : ""}">
      ${i.foto ? `<a class="incf" data-foto="${esc(i.foto)}" target="_blank" rel="noopener"><img alt="Foto de la incidencia"></a>` : ""}
      <div class="incb"><div class="code">${i.tipo ? `<span class="pill bad">${esc(i.tipo)}</span> ` : ""}${i.para && i.para !== "Nadie" ? `<span class="pill">→ ${esc(i.para)}</span> ` : ""}${fh(i.fecha)}${i.usuario ? " · " + esc(i.usuario) : ""}${i.resuelta ? " · ✓ Resuelta" : ""}</div><div>${esc(i.texto || "(sin comentario)")}</div>
      ${edita ? `<button class="link" data-incres="${i.id}">${i.resuelta ? "Reabrir" : "✓ Marcar resuelta"}</button>` : ""}</div></div>`).join("")}
    ${edita ? `<div class="incn"><div class="inct">${TIPOS_INC.map(([t], i) => `<label class="chipr"><input type="radio" name="inctipo" value="${t}" ${i === 0 ? "checked" : ""}><span>${t}</span></label>`).join("")}</div>
      <label class="incpara">Avisar a <select id="incpara">${["Oficina técnica", "Front", "Taller", "Nadie"].map(x => `<option>${x}</option>`).join("")}</select></label>
      <textarea id="inctx" rows="2" placeholder="Describe la incidencia (qué pasa, qué falta…)"></textarea>
      <div class="row"><label class="btn sm ghost incfoto">📷 Foto<input type="file" id="incfile" accept="image/*" capture="environment" hidden></label><span class="code" id="incfn"></span><span style="flex:1"></span><button class="btn sm lime" id="incok">Guardar incidencia</button></div>
      <img id="incprev" class="incprev" hidden alt=""></div>` : ""}</div>`;

  // Plano: botón visible y aviso si la revisión cambió con la fabricación ya empezada
  const empezado = !!(x.fases_hechas && x.fases_hechas !== "|") || !!(x.fases_curso && x.fases_curso !== "|") || (x.estado_fab && x.estado_fab !== "Pendiente") || pzs.some(z => z.cortada || z.fabricada);
  const revNueva = x.revision_fecha && empezado && (Date.now() - new Date(x.revision_fecha)) < 21 * 864e5;
  const planoHtml = `<div class="plano ${revNueva ? "rev" : ""}">${x.plano_url ? `<a class="btn" href="${esc(x.plano_url)}" target="_blank" rel="noopener">📄 Ver plano${x.revision ? " · Rev. " + esc(x.revision) : ""}</a>` : p.carpeta ? `<a class="btn ghost" href="${esc(p.carpeta)}" target="_blank" rel="noopener">📁 Carpeta del proyecto</a><span class="code">Sin enlace al plano${editaDoc ? " · añádelo en Editar elemento" : ""}</span>` : `<span class="code">Sin enlace al plano${editaDoc ? " · añádelo en Editar elemento" : ""}</span>`}
    ${revNueva ? `<div class="revav">⚠ Plano cambiado a <b>Rev. ${esc(x.revision)}</b> el ${new Date(x.revision_fecha).toLocaleDateString("es-ES")}. Comprueba que el taller trabaja con esta revisión.</div>` : ""}</div>`;
  const dato = (k, v) => `<dt>${k}</dt><dd>${v || "—"}</dd>`;
  // Resultado del último escaneo (solo informativo; se muestra unos minutos)
  const verScan = deScan && Date.now() - deScan.t < 3 * 60e3;
  $app.innerHTML = `${verScan ? `<div class="scanres ${deScan.ok ? "ok" : "ko"} scanvuelta"><b>${deScan.ok ? "✓" : "✕"} ${esc(deScan.msg)}</b>${deScan.det ? `<div>${esc(deScan.det)}</div>` : ""}</div>` : ""}<a class="back" href="#/p/${p.id}/elementos">‹ ${esc(p.nombre)}</a>
  <div class="code">Ref. ${esc(x.referencia || "")}</div><h1>${esc(x.elemento || "")}</h1>
  <div class="code" style="margin:-8px 0 12px">${[medidasTxt(x) ? "Alto × ancho × fondo: " + medidasTxt(x) : "", x.acabado, origenTxt(x.origen)].filter(Boolean).map(esc).join(" · ")}</div>
  ${planoHtml}
  ${pasos}${piezasHtml}${incHtml}
  <div class="card"><dl class="kv">${dato("Unidades", x.cantidad)}${dato("Origen", esc(origenTxt(x.origen)))}${dato("Medidas (alto × ancho × fondo)", medidasTxt(x))}${dato("Acabado", esc(x.acabado))}${x.ral ? dato("Color RAL", ralChips(x.ral, esc)) : ""}${dato("Fases", esc((subs.length ? ORD.filter(f => subs.some(k => tiene(k.fases, f))) : fasesDe(x)).map(f => f === "Cerrajería" ? "Calderería" : f).join(" · ")))}${x.es_extra ? dato("Extra", "Sí, pedido de última hora") : ""}${dato("Etiquetas", x.num_etiquetas)}${dato("Camión", esc(x.camion))}${dato("Orden de carga", x.orden_carga)}${dato("Ubicación nave", esc(x.ubicacion_nave))}${dato("Observaciones", esc(x.observaciones))}</dl></div>
  ${x.hist_fases ? `<details class="card"><summary>Historial de fases</summary><pre class="hist">${esc(x.hist_fases)}</pre></details>` : ""}`;

  $app.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { S.elTab[x.id] = b.dataset.tab; S.elEditF = false; recarga(); });
  // acciones de pasos
  $app.querySelectorAll("[data-a]").forEach(b => b.onclick = async () => {
    const now = new Date().toISOString(), a = b.dataset.a;
    if (a === "editf") { S.elEditF = !S.elEditF; return recarga(); }
    const C = {
      "doc-start": { estado_doc: "En curso" },
      "doc-ok": { estado_doc: "Hecho", fecha_doc: now, por_doc: yo },
      "doc-undo": { estado_doc: "En curso", fecha_doc: null, por_doc: null },
      "fab-ok": { estado_fab: "Hecho", fecha_fab: now, operario_fab: yo },
      "fab-undo": { estado_fab: "En curso", fecha_fab: null, operario_fab: null },
      "car-ok": { estado_carga: "Cargado", fecha_cargado: now, operario_carga: yo },
      "car-undo": { estado_carga: "Pendiente", fecha_cargado: null, operario_carga: null },
    }[a];
    // Oficina Técnica puede reabrir la documentación aunque el taller ya haya empezado (solo se bloquea si ya está cargado)
    if (a === "doc-undo" && x.estado_carga === "Cargado") return toast("El elemento ya está cargado: primero deshaz la carga.");
    if (a === "doc-undo" && x.estado_fab !== "Pendiente" && !confirm("El taller ya ha empezado este elemento. Si reabres la documentación, no se podrá seguir escaneando como fabricado hasta que la vuelvas a marcar como hecha. Las fases y piezas ya hechas se conservan. ¿Reabrir?")) return;
    if (a === "fab-undo" && x.estado_carga === "Cargado") return toast("Primero deshaz la carga.");
    // Documentación hecha → el elemento pasa solo a su primera fase de fabricación (en curso)
    if (a === "doc-ok" && x.estado_fab !== "Hecho") {
      if (subs.length) {
        for (const s of subs) { const f = sigFase(s.fases, s.fases_hechas); if (f && !tiene(s.fases_curso, f)) await sb.from("subelementos").update({ fases_curso: "|" + f + "|" }).eq("id", s.id); }
        if (subs.some(s => sigFase(s.fases, s.fases_hechas))) C.estado_fab = "En curso";
      } else { const f = sigFase(x.fases, x.fases_hechas); if (f) Object.assign(C, { estado_fab: "En curso", fases_curso: "|" + f + "|" }); }
    }
    if (await upd("elementos", x.id, C)) { if (a === "doc-ok") S.elTab[x.id] = "fab"; recarga(); }
  });
  // fases (toggle) de elemento o subelemento
  $app.querySelectorAll(".sf[data-f]").forEach(b => b.onclick = async () => {
    const tabla = b.dataset.t === "s" ? "subelementos" : "elementos";
    const obj = b.dataset.t === "s" ? subs.find(s => s.id === +b.dataset.id) : x;
    const f = b.dataset.f, h = obj.fases_hechas || "|", c = obj.fases_curso || "|", on = tiene(h, f), cur = tiene(c, f);
    if (on && x.estado_fab === "Hecho") return toast("El elemento ya está fabricado: deshaz la fabricación antes de desmarcar fases.");
    if (on && !confirm(`¿Desmarcar ${LBL(f)}? Volverá a pendiente.`)) return;
    // pendiente → en curso → hecho → pendiente
    const sig = on ? "pend" : cur ? "hecho" : "curso";
    const quita = (l, g) => (l || "|").replace("|" + g + "|", "|");
    const nueva = sig === "hecho" ? h + f + "|" : quita(h, f);
    let nCur = sig === "curso" ? c + f + "|" : quita(c, f);
    // Fase terminada → la siguiente pasa sola a «en curso»
    if (sig === "hecho") { const sg = ORD.find(g => tiene(obj.fases, g) && !tiene(nueva, g)); if (sg && !tiene(nCur, sg)) nCur = (nCur || "|") + sg + "|"; }
    const cambios = { fases_hechas: nueva, fases_curso: nCur === "|" ? null : nCur, hist_fases: (obj.hist_fases || "") + `${ahora()} · ${sig === "curso" ? "Empieza" : sig === "hecho" ? "Termina" : "Desmarca"} ${f} · ${yo}\n` };
    if (tabla === "elementos" && sig !== "pend" && x.estado_fab === "Pendiente") cambios.estado_fab = "En curso";
    if (tabla === "subelementos") { const todas = fasesDe(obj).every(g => tiene(nueva, g)); if (todas !== !!obj.terminado) Object.assign(cambios, { terminado: todas, fecha_term: todas ? new Date().toISOString() : null, operario_term: todas ? yo : null }); }
    // Corte terminado a mano en el elemento → sus unidades cuentan como cortadas (mismo dato que el escaneo)
    if (sig === "hecho" && f === "Corte" && tabla === "elementos" && pzs.some(z => !z.cortada)) await sb.from("piezas").update({ cortada: true, fecha_corte: new Date().toISOString(), operario_corte: yo }).eq("elemento_id", x.id).eq("cortada", false);
    if (await upd(tabla, obj.id, cambios, sig === "curso" ? `▶ ${LBL(f)} en curso` : sig === "hecho" ? `✓ ${LBL(f)} hecha` : `${LBL(f)} desmarcada`)) {
      const subs2 = tabla === "subelementos" ? subs.map(k => k.id === obj.id ? { ...k, ...cambios } : k) : subs;
      const x2 = tabla === "elementos" ? { ...x, fases_hechas: nueva } : x;
      if (sig === "hecho" && !faltanFases(x2, subs2).length) toast("✓ Todas las fases terminadas: escanea el QR de cada unidad.");
      recarga();
    }
  });
  // Editar qué subfases tiene el elemento / subelemento
  $app.querySelectorAll("[data-ef]").forEach(b => b.onclick = async () => {
    if (!editaDoc) return toast("Solo Oficina Técnica cambia las fases de un elemento.");
    const tabla = b.dataset.t === "s" ? "subelementos" : "elementos";
    const obj = b.dataset.t === "s" ? subs.find(s => s.id === +b.dataset.id) : x;
    const f = b.dataset.ef, act = tiene(obj.fases, f);
    const fases = "|" + ORD.filter(g => g === f ? !act : tiene(obj.fases, g)).join("|") + "|";
    const cambios = { fases: fases === "||" ? null : fases, hist_fases: (obj.hist_fases || "") + `${ahora()} · ${act ? "Quita fase" : "Añade fase"} ${f} · ${yo}\n` };
    if (act && tiene(obj.fases_hechas, f)) cambios.fases_hechas = obj.fases_hechas.replace("|" + f + "|", "|");
    if (act && tiene(obj.fases_curso, f)) cambios.fases_curso = obj.fases_curso.replace("|" + f + "|", "|");
    if (await upd(tabla, obj.id, cambios, `${LBL(f)} ${act ? "quitada" : "añadida"}`)) recarga();
  });
  // subelemento terminado
  $app.querySelectorAll("[data-term]").forEach(b => b.onclick = async () => {
    const s = subs.find(k => k.id === +b.dataset.term), t = !s.terminado;
    if (await upd("subelementos", s.id, { terminado: t, fecha_term: t ? new Date().toISOString() : null, operario_term: t ? yo : null })) recarga();
  });
  // Unidades: tocar abre las acciones para corregir su estado a mano
  $app.querySelectorAll(".pz2").forEach(row => row.onclick = ev => { if (ev.target.closest("button")) return; const a = row.querySelector(".pza"); if (a) { a.hidden = !a.hidden; row.classList.toggle("abierta", !a.hidden); } });
  $app.querySelectorAll("[data-pzm]").forEach(b => b.onclick = async () => {
    const z = pzs.find(k => k.id === +b.dataset.pzm), to = +b.dataset.to, now = new Date().toISOString();
    if (to >= 1 && x.estado_doc !== "Hecho") return toast("No se puede: falta la documentación técnica");
    if (to === 2 && etapa(z) < 2 && faltan.length) return toast("No se puede marcar como fabricada · falta: " + faltan.join(" · "));
    const c = {};
    if (to >= 1 && !z.cortada) Object.assign(c, { cortada: true, fecha_corte: now, operario_corte: yo }); if (to < 1) Object.assign(c, { cortada: false, fecha_corte: null, operario_corte: null });
    if (to >= 2 && !z.fabricada) Object.assign(c, { fabricada: true, fecha_fab: now, operario_fab: yo }); if (to < 2) Object.assign(c, { fabricada: false, fecha_fab: null, operario_fab: null });
    if (to >= 3 && !z.cargada) Object.assign(c, { cargada: true, fecha_cargada: now, operario_carga: yo }); if (to < 3) Object.assign(c, { cargada: false, fecha_cargada: null, operario_carga: null });
    if (!(await upd("piezas", z.id, c))) return;
    // Recalcula el estado del elemento con todas sus unidades
    Object.assign(z, c);
    const nF = pzs.filter(k => etapa(k) >= 2).length, nC = pzs.filter(k => etapa(k) >= 3).length, alguna = pzs.some(k => etapa(k) >= 1);
    const ce = {};
    if (nF === pzs.length) { if (x.estado_fab !== "Hecho") Object.assign(ce, { estado_fab: "Hecho", fecha_fab: now, operario_fab: yo }); }
    else if (x.estado_fab === "Hecho") Object.assign(ce, { estado_fab: "En curso", fecha_fab: null, operario_fab: null });
    else if (alguna && x.estado_fab === "Pendiente") ce.estado_fab = "En curso";
    if (nC === pzs.length) { if (x.estado_carga !== "Cargado") Object.assign(ce, { estado_carga: "Cargado", fecha_cargado: now, operario_carga: yo, piezas_cargadas: nC }); }
    else Object.assign(ce, { estado_carga: nC ? "Parcial" : "Pendiente", piezas_cargadas: nC, fecha_cargado: null, operario_carga: null });
    if (!subs.length && tiene(x.fases, "Corte") && !tiene(x.fases_hechas, "Corte") && pzs.every(k => etapa(k) >= 1)) ce.fases_hechas = (x.fases_hechas || "|") + "Corte|";
    if (Object.keys(ce).length) await upd("elementos", x.id, ce);
    S.dirty = true; toast(`P${z.num_pieza}: ${ETAPAS[to]}`); recarga();
  });
  // Fotos de incidencias (enlace firmado, 1 h)
  const fotos = [...$app.querySelectorAll("[data-foto]")];
  if (fotos.length && sb.storage) sb.storage.from("fotos").createSignedUrls(fotos.map(a => a.dataset.foto), 3600).then(({ data }) => (data || []).forEach((u, k) => { if (u && u.signedUrl) { fotos[k].href = u.signedUrl; fotos[k].querySelector("img").src = u.signedUrl; } })).catch(() => { });
  let fichero = null;
  // Tipo de incidencia → a quién avisar por defecto
  $app.querySelectorAll("[name=inctipo]").forEach(r => r.onchange = () => { const t = TIPOS_INC.find(k => k[0] === r.value); if (t) document.getElementById("incpara").value = t[1]; });
  const fi = document.getElementById("incfile");
  if (fi) fi.onchange = () => { fichero = fi.files[0] || null; const pv = document.getElementById("incprev"); document.getElementById("incfn").textContent = fichero ? "Foto lista" : ""; if (fichero) { pv.src = URL.createObjectURL(fichero); pv.hidden = false; } else pv.hidden = true; };
  const ok = document.getElementById("incok");
  if (ok) ok.onclick = async () => {
    const texto = document.getElementById("inctx").value.trim();
    if (!texto && !fichero) return toast("Escribe un comentario o añade una foto");
    ok.disabled = true; ok.textContent = "Guardando…";
    let foto = null;
    try {
      if (fichero) {
        const blob = await reduceFoto(fichero);
        foto = `incidencias/${p.id}/${x.id}/${Date.now()}.jpg`;
        const { error } = await sb.storage.from("fotos").upload(foto, blob, { contentType: "image/jpeg" });
        if (error) throw error;
      }
      const tipo = (document.querySelector("[name=inctipo]:checked") || {}).value || null, para = document.getElementById("incpara").value;
      const { error } = await sb.from("incidencias").insert({ elemento_id: x.id, proyecto_id: p.id, texto: texto || null, foto, usuario: yo, tipo, para });
      if (error) throw error;
      if (!x.incidencia) await upd("elementos", x.id, { incidencia: true });
      S.dirty = true; toast("Incidencia guardada"); recarga();
    } catch (e) { toast("No se pudo guardar: " + (e.message || e)); ok.disabled = false; ok.textContent = "Guardar incidencia"; }
  };
  $app.querySelectorAll("[data-incres]").forEach(b => b.onclick = async () => {
    const i = incs.find(k => k.id === +b.dataset.incres), r = !i.resuelta;
    const { error } = await sb.from("incidencias").update({ resuelta: r }).eq("id", i.id);
    if (error) return toast("No se pudo guardar: " + error.message);
    const quedan = incs.filter(k => k.id !== i.id && !k.resuelta).length + (r ? 0 : 1);
    if (!!x.incidencia !== quedan > 0) await upd("elementos", x.id, { incidencia: quedan > 0 });
    S.dirty = true; toast(r ? "Incidencia resuelta" : "Incidencia reabierta"); recarga();
  });
}

const TIPOS_INC = [["Medida", "Oficina técnica"], ["Plano / documentación", "Oficina técnica"], ["Material", "Front"], ["Falta pieza", "Front"], ["Golpe / daño", "Taller"], ["Acabado", "Taller"], ["Otro", "Taller"]];
// Reduce la foto del móvil (máx. 1600 px, JPEG) antes de subirla
async function reduceFoto(f) {
  try {
    const img = await createImageBitmap(f);
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(ok => c.toBlob(b => ok(b || f), "image/jpeg", 0.82));
  } catch { return f; }
}
