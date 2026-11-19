// Pestaña Elementos del proyecto y detalle de elemento (fases, piezas, subelementos)
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
  return { els: e.data, pz: pz.data, sub: sub.data };
}

function estadoPill(x) {
  if (x.estado_carga === "Cargado") return ["Cargado", "ok"];
  if (x.estado_fab === "Hecho") return ["Listo para carga", "ok"];
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
    const [sl, sc] = estadoPill(x);
    const pzs = d.pz.filter(z => z.elemento_id === x.id), subs = d.sub.filter(s => s.elemento_id === x.id);
    return `<a class="card el" href="#/p/${p.id}/el/${x.id}">
      <div class="pj-top"><div><span class="num">${String(x.num_item ?? "").padStart(3, "0")}</span> <b>${esc(x.elemento || x.referencia)}</b> <span class="code">· ${x.cantidad || 1} ud${(x.cantidad || 1) > 1 ? "s" : ""}</span></div><span class="pill ${sc}">${sl}</span></div>
      <div class="pj-meta"><span>${esc(x.referencia || "")}</span>${x.taller ? `<span>${esc(x.taller)}</span>` : ""}${pzs.length ? `<span>QR ${pzs.filter(z => z.fabricada).length}/${pzs.length}</span>` : ""}${subs.length ? `<span>Sub ${subs.filter(s => s.terminado).length}/${subs.length}</span>` : ""}${x.es_extra ? `<span class="pill warn">Extra</span>` : ""}${x.incidencia ? `<span class="pill bad">Incidencia</span>` : ""}</div>
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
  const paso = (titulo, estado, hecho, bloqueado, botones, nota) => `
    <div class="step ${hecho ? "done" : estado === "En curso" ? "run" : ""} ${bloqueado ? "lock" : ""}">
      <div class="dot">${hecho ? "✓" : estado === "En curso" ? "…" : ""}</div>
      <div class="sb"><div class="pj-top"><b>${titulo}</b><span class="pill ${hecho ? "ok" : estado === "En curso" ? "warn" : ""}">${hecho ? "✓ Hecho" : estado || "Pendiente"}</span></div>
      ${bloqueado ? `<div class="code">🔒 Se desbloquea cuando la fase anterior esté hecha</div>` : edita ? `<div class="row">${botones}</div>` : ""}${nota ? `<div class="code">${nota}</div>` : ""}</div>
    </div>`;
  const docH = x.estado_doc === "Hecho", fabH = x.estado_fab === "Hecho", carH = x.estado_carga === "Cargado";
  const pasos = `<div class="card steps"><div class="code">${esc(x.revision ? "Rev. " + x.revision : "")}</div>
    ${paso("Documentación técnica", x.estado_doc, docH, false,
      docH ? `<button class="btn sm ghost" data-a="doc-undo">Deshacer</button>` : `${x.estado_doc !== "En curso" ? `<button class="btn sm ghost" data-a="doc-start">Empezar</button>` : ""}<button class="btn sm lime" data-a="doc-ok">Marcar hecho</button>`,
      x.fecha_doc && docH ? `Hecho ${new Date(x.fecha_doc).toLocaleDateString("es-ES")}${x.por_doc ? " · " + esc(x.por_doc) : ""}` : "")}
    ${paso("Fabricación", x.estado_fab, fabH, !docH,
      fabH ? `<button class="btn sm ghost" data-a="fab-undo">Deshacer</button>` : `<button class="btn sm lime" data-a="fab-ok">Marcar hecho</button>`,
      fabH && x.operario_fab ? "Cerrada por " + esc(x.operario_fab) : "")}
    ${paso("Carga", x.estado_carga, carH, !fabH,
      carH ? `<button class="btn sm ghost" data-a="car-undo">Deshacer</button>` : `<button class="btn sm lime" data-a="car-ok">Marcar cargado</button>`, "")}
  </div>`;

  // botones de fase (elemento o subelemento)
  const botonesFase = (obj, tipo) => {
    const fs = fasesDe(obj);
    if (!fs.length) return "";
    return `<div class="fz">${fs.map(f => { const on = tiene(obj.fases_hechas, f); return `<button class="fzb ${on ? "on" : ""}" data-t="${tipo}" data-id="${obj.id}" data-f="${f}" ${edita ? "" : "disabled"}>${on ? "✓ " : ""}${f}</button>`; }).join("")}</div>`;
  };

  const piezasHtml = pzs.length ? `<div class="card"><div class="pj-top"><h2>Piezas y cajas</h2><span class="pill ${pzs.every(z => z.fabricada) ? "ok" : ""}">${pzs.filter(z => z.fabricada).length}/${pzs.length}</span></div>
    <p class="hint">Cada unidad lleva su etiqueta QR. Se marca fabricada al escanearla (o tocando aquí) y cargada en la carga.</p>
    ${pzs.map(z => `<div class="pz"><span class="num">P${z.num_pieza}</span><div class="pzb"><b>${esc(z.desc_pieza || x.elemento)}</b><div class="code">${esc(z.referencia)} · ${z.num_pieza}/${z.total_piezas}</div></div>
      <button class="fzb ${z.fabricada ? "on" : ""}" data-pz="${z.id}" ${edita ? "" : "disabled"}>${z.fabricada ? "✓ Fabricada" : "Fabricada"}</button>
      ${z.cargada ? `<span class="pill ok">Cargada</span>` : ""}</div>`).join("")}</div>` : "";

  const subsHtml = subs.length ? `<div class="card"><h2>Subelementos <small class="code">${subs.filter(s => s.terminado).length}/${subs.length} terminados</small></h2>
    ${subs.map(s => `<div class="sub"><div class="pj-top"><b>${esc(s.desc_sub || s.titulo)}</b><button class="fzb ${s.terminado ? "on" : ""}" data-term="${s.id}" ${edita ? "" : "disabled"}>${s.terminado ? "✓ Terminado" : "Terminado"}</button></div>
      ${botonesFase(s, "s")}</div>`).join("")}</div>` : "";

  const fabHtml = !subs.length && fasesDe(x).length ? `<div class="card"><h2>Fabricación del elemento</h2>
    <p class="hint">Marca cada fase al terminarla. Toca otra vez para desmarcar.</p>${botonesFase(x, "e")}</div>` : "";

  const dato = (k, v) => `<dt>${k}</dt><dd>${v || "—"}</dd>`;
  $app.innerHTML = `<a class="back" href="#/p/${p.id}/elementos">‹ ${esc(p.nombre)}</a>
  <div class="code">Ref. ${esc(x.referencia || "")}</div><h1>${esc(x.elemento || "")}</h1>
  <div class="code" style="margin:-8px 0 12px">${[x.material, x.acabado, (x.largo || x.ancho || x.alto) ? `${x.largo || "–"}×${x.ancho || "–"}×${x.alto || "–"} mm` : ""].filter(Boolean).map(esc).join(" · ")}</div>
  ${pasos}${fabHtml}${subsHtml}${piezasHtml}
  <div class="card"><dl class="kv">${dato("Taller", esc(x.taller))}${dato("Unidades", x.cantidad)}${dato("Etiquetas", x.num_etiquetas)}${dato("Camión", esc(x.camion))}${dato("Orden de carga", x.orden_carga)}${dato("Ubicación nave", esc(x.ubicacion_nave))}${dato("Observaciones", esc(x.observaciones))}</dl></div>
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
    if (a === "doc-undo" && x.estado_fab !== "Pendiente") return toast("Primero deshaz la fabricación.");
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
    if (await upd(tabla, obj.id, cambios, on ? `${f} desmarcada` : `✓ ${f}`)) {
      if (tabla === "elementos" && !on && fasesDe(x).every(g => g === f || tiene(nueva, g))) toast("Todas las fases hechas: escanea el QR de cada unidad.");
      recarga();
    }
  });
  // subelemento terminado
  $app.querySelectorAll("[data-term]").forEach(b => b.onclick = async () => {
    const s = subs.find(k => k.id === +b.dataset.term), t = !s.terminado;
    if (await upd("subelementos", s.id, { terminado: t, fecha_term: t ? new Date().toISOString() : null, operario_term: t ? yo : null })) recarga();
  });
  // pieza fabricada (sustituye al escaneo hasta tener el lector)
  $app.querySelectorAll("[data-pz]").forEach(b => b.onclick = async () => {
    const z = pzs.find(k => k.id === +b.dataset.pz), t = !z.fabricada;
    if (t && subs.length && !subs.every(s => s.terminado)) return toast("Faltan subelementos por terminar.");
    if (!(await upd("piezas", z.id, { fabricada: t, fecha_fab: t ? new Date().toISOString() : null, operario_fab: t ? yo : null }))) return;
    const resto = pzs.filter(k => k.id !== z.id).every(k => k.fabricada);
    if (t && resto && x.estado_doc === "Hecho" && x.estado_fab !== "Hecho") await upd("elementos", x.id, { estado_fab: "Hecho", fecha_fab: new Date().toISOString(), operario_fab: yo }, "Todas las unidades fabricadas: elemento listo para carga");
    else if (!t && x.estado_fab === "Hecho") await upd("elementos", x.id, { estado_fab: "En curso", fecha_fab: null, operario_fab: null });
    else if (t && x.estado_fab === "Pendiente") await upd("elementos", x.id, { estado_fab: "En curso" });
    recarga();
  });
  const inc = document.getElementById("inc");
  inc.onchange = async () => { if (await upd("elementos", x.id, { incidencia: inc.checked }, inc.checked ? "Incidencia abierta" : "Incidencia cerrada")) recarga(); };
}
