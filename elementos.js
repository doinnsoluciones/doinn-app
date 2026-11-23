// Pestaña Elementos del proyecto y detalle de elemento (fases, piezas, subelementos)
const V = new URL(import.meta.url).search;
const { origenTxt, medidasTxt, ralChips, ordenEl, faltanFases } = await import("./despiece.js" + V);
const ORD = ["Corte", "Carpintería", "Cerrajería", "Pintura"];
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
  const barras = ORD.map(fa => { const req = els.filter(x => tiene(x.fases, fa)); const ok = req.filter(x => tiene(x.fases_hechas, fa) || x.estado_fab === "Hecho"); return req.length ? `<div class="fb"><span>${fa}</span><div class="bar"><i style="width:${Math.round(100 * ok.length / req.length)}%"></i></div><b>${ok.length}/${req.length}</b></div>` : ""; }).join("");
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
  const yo = (S.perfil && S.perfil.nombre) || (S.user.email || "").split("@")[0];
  const edita = puede("admin", "taller");
  const recarga = () => vElemento(ctx, p, eid);
  const upd = async (tabla, id, cambios, msg) => {
    const { error } = await sb.from(tabla).update(cambios).eq("id", id);
    if (error) { toast("No se pudo guardar: " + error.message); return false; }
    if (msg) toast(msg);
    return true;
  };

  // pasos Doc → Fab → Carga
  // Un paso bloqueado (la fase anterior no está hecha) se pinta siempre en gris, aunque tuviera avance
  const paso = (titulo, estado, hecho, bloqueado, botones, nota) => {
    const pausa = bloqueado && (hecho || estado === "En curso");
    if (bloqueado) { hecho = false; estado = ""; }
    return `
    <div class="step ${hecho ? "done" : estado === "En curso" ? "run" : ""} ${bloqueado ? "lock" : ""}">
      <div class="dot">${hecho ? "✓" : estado === "En curso" ? "…" : ""}</div>
      <div class="sb"><div class="pj-top"><b>${titulo}</b><span class="pill ${hecho ? "ok" : estado === "En curso" ? "warn" : ""}">${hecho ? "✓ Hecho" : pausa ? "En pausa" : estado || "Pendiente"}</span></div>
      ${bloqueado ? `<div class="code">🔒 ${pausa ? "En pausa: se reanuda cuando la fase anterior vuelva a estar hecha. El avance se conserva." : "Se desbloquea cuando la fase anterior esté hecha"}</div>` : edita ? `<div class="row">${botones}</div>` : ""}${nota && !bloqueado ? `<div class="code">${nota}</div>` : ""}</div>
    </div>`;
  };
  const faltan = faltanFases(x, subs);
  const docH = x.estado_doc === "Hecho", fabH = x.estado_fab === "Hecho", carH = x.estado_carga === "Cargado";
  const pasos = `<div class="card steps"><div class="code">${esc(x.revision ? "Rev. " + x.revision : "")}</div>
    ${paso("Documentación técnica", x.estado_doc, docH, false,
      docH ? `<button class="btn sm ghost" data-a="doc-undo">Deshacer</button>` : `${x.estado_doc !== "En curso" ? `<button class="btn sm ghost" data-a="doc-start">Empezar</button>` : ""}<button class="btn sm lime" data-a="doc-ok">Marcar hecho</button>`,
      x.fecha_doc && docH ? `Hecho ${new Date(x.fecha_doc).toLocaleDateString("es-ES")}${x.por_doc ? " · " + esc(x.por_doc) : ""}` : "")}
    ${paso("Fabricación", x.estado_fab, fabH, !docH,
      fabH && puede("admin") ? `<button class="btn sm ghost" data-a="fab-undo">Deshacer</button>` : "",
      fabH ? (x.operario_fab ? "Fabricado (QR escaneado) · " + esc(x.operario_fab) : "Fabricado (QR escaneado)")
        : faltan.length ? `<span class="falta">Falta: ${faltan.map(esc).join(" · ")}</span>` : `<span class="ok-t">✓ Todas las fases terminadas. Se marca como fabricado al escanear el QR de cada unidad.</span>`)}
    ${paso("Carga", x.estado_carga, carH, !fabH,
      carH ? `<button class="btn sm ghost" data-a="car-undo">Deshacer</button>` : `<button class="btn sm lime" data-a="car-ok">Marcar cargado</button>`, "")}
  </div>`;

  // botones de fase (elemento o subelemento)
  const botonesFase = (obj, tipo) => {
    const fs = fasesDe(obj);
    if (!fs.length) return "";
    return `<div class="fz">${fs.map(f => { const on = tiene(obj.fases_hechas, f); return `<button class="fzb ${on ? "on" : ""}" data-t="${tipo}" data-id="${obj.id}" data-f="${f}" ${edita ? "" : "disabled"}>${on ? "✓ " : ""}${f}</button>`; }).join("")}</div>`;
  };

  // Avance de piezas: cada unidad pasa por Sin cortar → Cortada → Fabricada → Cargada
  const ETAPAS = ["Sin cortar", "Cortada", "Fabricada", "Cargada"];
  const etapa = z => z.cargada ? 3 : z.fabricada ? 2 : z.cortada ? 1 : 0;
  const cuenta = k => pzs.filter(z => etapa(z) >= k).length;
  const deScan = S.scan && S.scan.vuelta && S.scan.vuelta.id === x.id && Date.now() - S.scan.vuelta.t < 10 * 60e3 ? S.scan.vuelta : null;
  const barraAv = (t, k) => { const n = cuenta(k), tot = pzs.length; return `<div class="avb ${n === tot ? "full" : ""}"><div class="avt"><span>${t}</span><b>${n}/${tot}</b></div><div class="avl"><i style="width:${tot ? Math.round(n / tot * 100) : 0}%"></i></div></div>`; };
  const piezasHtml = pzs.length ? `<div class="card" id="cpz"><div class="pj-top"><h2>Avance de piezas</h2><span class="code">${pzs.length} unidad${pzs.length > 1 ? "es" : ""}</span></div>
    <div class="av3">${barraAv("Cortadas", 1)}${barraAv("Fabricadas", 2)}${barraAv("Cargadas", 3)}</div>
    ${pzs.map(z => { const e = etapa(z); return `<div class="pz2 ${deScan && deScan.zid === z.id ? "hl" : ""}" data-pz="${z.id}">
      <div class="pzh"><span class="num">P${z.num_pieza}</span><div class="pzb"><b>${esc(z.desc_pieza || x.elemento)}</b><div class="code">${esc(z.referencia)}</div></div><span class="pill ${e === 3 ? "ok" : e === 2 ? "ok" : e === 1 ? "warn" : ""}">${ETAPAS[e]}</span></div>
      <div class="pzs">${ETAPAS.slice(1).map((t, k) => `<span class="pst ${e > k ? "on" : ""}"><i></i>${t}</span>`).join("")}</div>
      ${edita ? `<div class="pza" hidden>${e > 0 ? `<button class="btn sm ghost" data-pzm="${z.id}" data-to="${e - 1}">↶ Volver a «${ETAPAS[e - 1]}»</button>` : ""}${e < 3 ? `<button class="btn sm lime" data-pzm="${z.id}" data-to="${e + 1}">Marcar «${ETAPAS[e + 1]}»</button>` : ""}</div>` : ""}
    </div>`; }).join("")}
    <p class="hint" style="margin-top:8px">Lo normal es avanzar escaneando la etiqueta en Escanear. ${edita ? "Toca una unidad para corregir su estado a mano." : ""}</p></div>` : "";

  const subsHtml = subs.length ? `<div class="card"><h2>Subelementos <small class="code">${subs.filter(s => s.terminado).length}/${subs.length} terminados</small></h2>
    ${subs.map(s => `<div class="sub"><div class="pj-top"><div><b>${esc(s.desc_sub || s.titulo)}</b><div class="code">${[`${s.cantidad || 1} pieza${(s.cantidad || 1) > 1 ? "s" : ""}`, origenTxt(s.origen), s.acabado].filter(Boolean).map(esc).join(" · ")} ${ralChips(s.ral, esc)}</div></div>${fasesDe(s).length ? `<span class="pill ${s.terminado ? "ok" : ""}">${s.terminado ? "✓ Terminado" : `${fasesDe(s).filter(f => tiene(s.fases_hechas, f)).length}/${fasesDe(s).length} fases`}</span>` : `<button class="fzb ${s.terminado ? "on" : ""}" data-term="${s.id}" ${edita ? "" : "disabled"}>${s.terminado ? "✓ Listo" : "Marcar listo"}</button>`}</div>
      ${botonesFase(s, "s")}</div>`).join("")}</div>` : "";

  const fabHtml = !subs.length && fasesDe(x).length ? `<div class="card"><h2>Fabricación del elemento</h2>
    <p class="hint">Marca cada fase al terminarla. Toca otra vez para desmarcar.</p>${botonesFase(x, "e")}</div>` : "";

  const dato = (k, v) => `<dt>${k}</dt><dd>${v || "—"}</dd>`;
  // Resultado del último escaneo (solo informativo; se muestra unos minutos)
  const verScan = deScan && Date.now() - deScan.t < 3 * 60e3;
  $app.innerHTML = `${verScan ? `<div class="scanres ${deScan.ok ? "ok" : "ko"} scanvuelta"><b>${deScan.ok ? "✓" : "✕"} ${esc(deScan.msg)}</b>${deScan.det ? `<div>${esc(deScan.det)}</div>` : ""}</div>` : ""}<a class="back" href="#/p/${p.id}/elementos">‹ ${esc(p.nombre)}</a>
  <div class="code">Ref. ${esc(x.referencia || "")}</div><h1>${esc(x.elemento || "")}</h1>
  <div class="code" style="margin:-8px 0 12px">${[medidasTxt(x) ? "Alto × ancho × fondo: " + medidasTxt(x) : "", x.acabado, origenTxt(x.origen)].filter(Boolean).map(esc).join(" · ")}</div>
  ${pasos}${piezasHtml}${fabHtml}${subsHtml}
  <div class="card"><dl class="kv">${dato("Unidades", x.cantidad)}${dato("Origen", esc(origenTxt(x.origen)))}${dato("Medidas (alto × ancho × fondo)", medidasTxt(x))}${dato("Acabado", esc(x.acabado))}${x.ral ? dato("Color RAL", ralChips(x.ral, esc)) : ""}${dato("Fases", esc(fasesDe(x).join(" · ")))}${x.es_extra ? dato("Extra", "Sí, pedido de última hora") : ""}${dato("Etiquetas", x.num_etiquetas)}${dato("Camión", esc(x.camion))}${dato("Orden de carga", x.orden_carga)}${dato("Ubicación nave", esc(x.ubicacion_nave))}${dato("Observaciones", esc(x.observaciones))}</dl></div>
  <div class="card"><div class="pj-top"><div><b>Incidencia</b><div class="code">${x.incidencia ? "Abierta" : "Sin incidencia"}</div></div>
    <label class="tg"><input type="checkbox" id="inc" ${x.incidencia ? "checked" : ""} ${edita ? "" : "disabled"}><span></span><b>${x.incidencia ? "Sí" : "No"}</b></label></div></div>
  ${x.hist_fases ? `<details class="card"><summary>Historial de fases</summary><pre class="hist">${esc(x.hist_fases)}</pre></details>` : ""}`;

  // acciones de pasos
  $app.querySelectorAll("[data-a]").forEach(b => b.onclick = async () => {
    const now = new Date().toISOString(), a = b.dataset.a;
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
    if (await upd("elementos", x.id, C)) recarga();
  });
  // fases (toggle) de elemento o subelemento
  $app.querySelectorAll(".fzb[data-f]").forEach(b => b.onclick = async () => {
    const tabla = b.dataset.t === "s" ? "subelementos" : "elementos";
    const obj = b.dataset.t === "s" ? subs.find(s => s.id === +b.dataset.id) : x;
    const f = b.dataset.f, h = obj.fases_hechas || "|", on = tiene(h, f);
    const nueva = on ? h.replace("|" + f + "|", "|") : h + f + "|";
    const cambios = { fases_hechas: nueva, hist_fases: (obj.hist_fases || "") + `${ahora()} · ${on ? "Desmarca " : ""}${f} · ${yo}\n` };
    if (tabla === "elementos" && !on && x.estado_fab === "Pendiente") cambios.estado_fab = "En curso";
    if (tabla === "subelementos") { const todas = fasesDe(obj).every(g => tiene(nueva, g)); if (todas !== !!obj.terminado) Object.assign(cambios, { terminado: todas, fecha_term: todas ? new Date().toISOString() : null, operario_term: todas ? yo : null }); }
    if (on && x.estado_fab === "Hecho") return toast("El elemento ya está fabricado: deshaz la fabricación antes de desmarcar fases.");
    if (await upd(tabla, obj.id, cambios, on ? `${f} desmarcada` : `✓ ${f}`)) {
      const subs2 = tabla === "subelementos" ? subs.map(k => k.id === obj.id ? { ...k, ...cambios } : k) : subs;
      const x2 = tabla === "elementos" ? { ...x, fases_hechas: nueva } : x;
      if (!on && !faltanFases(x2, subs2).length) toast("✓ Todas las fases terminadas: escanea el QR de cada unidad.");
      recarga();
    }
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
  const inc = document.getElementById("inc");
  inc.onchange = async () => { if (await upd("elementos", x.id, { incidencia: inc.checked }, inc.checked ? "Incidencia abierta" : "Incidencia cerrada")) recarga(); };
}
