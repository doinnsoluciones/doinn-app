// Carga y Retorno (por proyecto) y Muelle (calendario de cargas y descargas)
const FAM = ["Material extra", "Subcontratado", "Herramienta"];
const CAMIONES = ["Camión 1", "Camión 2", "Camión 3", "Furgoneta"];
const DESTINOS = ["Almacén", "Reutilizable", "Desechar", "Revisión"];
const MAY = s => String(s ?? "").replace(/\s+/g, " ").trim().toUpperCase();
const iso = d => d.toLocaleDateString("sv-SE");
const pd = s => s ? new Date(s + "T00:00:00") : null;
const suma = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return iso(d); };
const fdl = s => pd(s).toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "2-digit" });

async function datos(sb, pid) {
  const [e, z, c] = await Promise.all([
    sb.from("elementos").select("*").eq("proyecto_id", pid).order("num_item"),
    sb.from("piezas").select("id,elemento_id,cargada").eq("proyecto_id", pid),
    sb.from("cargas").select("*").eq("proyecto_id", pid).order("id"),
  ]);
  for (const r of [e, z, c]) if (r.error) throw r.error;
  return { els: e.data, pz: z.data, cargas: c.data };
}

// ---------- pestaña Carga ----------
export async function vCarga(ctx, p, cont) {
  const { sb, esc, toast, puede, S, fd } = ctx;
  const editaPM = puede("admin");
  const editaLog = puede("admin", "taller");
  cont.innerHTML = `<div class="loading">Cargando…</div>`;
  let d; try { d = await datos(sb, p.id); } catch (e) { cont.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const yo = (S.perfil && S.perfil.nombre) || S.user.email.split("@")[0];
  const limite = p.fecha_carga ? suma(p.fecha_carga, -2) : null;
  const elsC = d.els.filter(x => x.estado_carga === "Cargado").length;
  const famC = d.cargas.filter(c => c.cargado).length;
  const recarga = () => vCarga(ctx, p, cont);

  cont.innerHTML = `
  <div class="kpis">
    <div class="card k"><span>Elementos cargados</span><b>${elsC}/${d.els.length}</b></div>
    <div class="card k"><span>Listado del PM</span><b>${famC}/${d.cargas.length}</b></div>
    <div class="card k"><span>Carga</span><b style="font-size:18px">${p.fecha_carga ? fd(p.fecha_carga) : "—"}${p.hora_carga ? " · " + esc(p.hora_carga) : ""}</b></div>
  </div>
  <div class="card">
    <div class="pj-top"><h2>Listado de carga del PM</h2><span class="pill ${p.listado_cerrado ? "ok" : "warn"}">${p.listado_cerrado ? "Cerrado" : "Abierto"}</span></div>
    <p class="hint">Materiales extra, subcontratados y herramientas que van en el camión.${limite && !p.listado_cerrado ? ` Fecha límite para cerrarlo: <b>${fd(limite)}</b> (48 h antes de la carga).` : ""}${p.listado_cerrado && p.fecha_cierre_listado ? ` Cerrado el ${new Date(p.fecha_cierre_listado).toLocaleDateString("es-ES")}.` : ""}</p>
    ${FAM.map(f => { const its = d.cargas.filter(c => c.familia === f); return `
      <div class="fam"><div class="code">${f} · ${its.filter(c => c.cargado).length}/${its.length}</div>
      ${its.map(c => `<div class="crow"><label class="ck2"><input type="checkbox" data-cc="${c.id}" ${c.cargado ? "checked" : ""} ${editaLog ? "" : "disabled"}><span><b>${esc(c.descripcion)}</b> <span class="code">${c.cantidad ? c.cantidad + " " + esc(c.unidad || "") : ""}${c.proveedor ? " · " + esc(c.proveedor) : ""}${c.cargado && c.operario_carga ? " · cargado por " + esc(c.operario_carga) : ""}</span></span></label>
        ${editaPM && !p.listado_cerrado ? `<button class="link" data-cdel="${c.id}">Quitar</button>` : ""}</div>`).join("") || `<div class="code" style="padding:4px 0">—</div>`}</div>`; }).join("")}
    ${editaPM && !p.listado_cerrado ? `<form id="fc" class="frm addc">
      <select id="c_fam">${FAM.map(f => `<option>${f}</option>`).join("")}</select>
      <input id="c_desc" placeholder="Descripción" required>
      <input id="c_cant" type="number" min="0" step="any" placeholder="Cant.">
      <input id="c_ud" placeholder="Ud.">
      <input id="c_prov" placeholder="Proveedor">
      <button class="btn sm">Añadir</button></form>` : ""}
    ${editaPM ? `<button class="btn ${p.listado_cerrado ? "ghost" : ""} wide" id="ccerrar" style="margin-top:10px">${p.listado_cerrado ? "Reabrir listado" : "Cerrar listado y avisar a Logística"}</button>` : ""}
  </div>
  <div class="card"><h2>Elementos</h2>
    ${d.els.map(x => { const pz = d.pz.filter(z => z.elemento_id === x.id); const n = pz.filter(z => z.cargada).length; const ok = x.estado_carga === "Cargado"; return `
      <div class="lrow2" data-id="${x.id}">
        <div class="lr-main"><a href="#/p/${p.id}/el/${x.id}"><span class="num">${String(x.num_item ?? "").padStart(3, "0")}</span> <b>${esc(x.elemento)}</b></a>
          <div class="code">${pz.length ? `QR ${n}/${pz.length}` : ""} ${x.estado_fab === "Hecho" ? "· fabricado" : "· <span style='color:var(--amber)'>sin fabricar</span>"}</div></div>
        <div class="lr-ctl">
          <select data-f="camion" ${editaLog ? "" : "disabled"}><option value="">Camión</option>${CAMIONES.map(c => `<option ${c === x.camion ? "selected" : ""}>${c}</option>`).join("")}</select>
          <input data-f="orden_carga" type="number" min="1" placeholder="Orden" value="${x.orden_carga ?? ""}" ${editaLog ? "" : "disabled"}>
          <input data-f="ubicacion_nave" placeholder="Ubicación nave" value="${esc(x.ubicacion_nave || "")}" ${editaLog ? "" : "disabled"}>
          <button class="fzb ${ok ? "on" : ""}" data-car="${x.id}" ${editaLog ? "" : "disabled"}>${ok ? "✓ Cargado" : x.estado_carga === "Parcial" ? "Parcial" : "Cargar"}</button>
        </div>
      </div>`; }).join("") || `<div class="code">Sin elementos.</div>`}
    <p class="hint" style="margin-top:8px">También se carga escaneando cada etiqueta en Escanear › Cargar.</p>
  </div>`;

  const $ = id => document.getElementById(id);
  const fc = $("fc");
  if (fc) fc.onsubmit = async ev => {
    ev.preventDefault();
    const row = { proyecto_id: p.id, familia: $("c_fam").value, descripcion: MAY($("c_desc").value), cantidad: parseFloat($("c_cant").value) || null, unidad: MAY($("c_ud").value) || null, proveedor: MAY($("c_prov").value) || null };
    const { error } = await sb.from("cargas").insert(row);
    if (error) return toast("No se pudo añadir: " + error.message);
    recarga();
  };
  cont.querySelectorAll("[data-cc]").forEach(ch => ch.onchange = async () => {
    const on = ch.checked;
    const { error } = await sb.from("cargas").update({ cargado: on, fecha_cargado: on ? new Date().toISOString() : null, operario_carga: on ? yo : null }).eq("id", +ch.dataset.cc);
    if (error) toast(error.message); else recarga();
  });
  cont.querySelectorAll("[data-cdel]").forEach(b => b.onclick = async () => { if (!confirm("¿Quitar esta línea del listado?")) return; await sb.from("cargas").delete().eq("id", +b.dataset.cdel); recarga(); });
  const cc = $("ccerrar");
  if (cc) cc.onclick = async () => {
    const cerrar = !p.listado_cerrado;
    if (cerrar && !confirm("¿Cerrar el listado de carga? Logística lo verá como definitivo.")) return;
    const cambios = { listado_cerrado: cerrar, fecha_cierre_listado: cerrar ? new Date().toISOString() : null };
    const { error } = await sb.from("proyectos").update(cambios).eq("id", p.id);
    if (error) return toast(error.message);
    Object.assign(p, cambios); toast(cerrar ? "Listado cerrado" : "Listado reabierto"); recarga();
  };
  cont.querySelectorAll(".lrow2 [data-f]").forEach(inp => inp.onchange = async () => {
    const id = +inp.closest(".lrow2").dataset.id, f = inp.dataset.f;
    let v = inp.value; if (f === "orden_carga") v = v ? +v : null; else if (f === "ubicacion_nave") v = MAY(v) || null; else v = v || null;
    const { error } = await sb.from("elementos").update({ [f]: v }).eq("id", id);
    toast(error ? error.message : "Guardado");
  });
  cont.querySelectorAll("[data-car]").forEach(b => b.onclick = async () => {
    const x = d.els.find(e => e.id === +b.dataset.car), on = x.estado_carga !== "Cargado";
    if (on && x.estado_fab !== "Hecho" && !confirm("Este elemento no está fabricado. ¿Marcarlo como cargado igualmente?")) return;
    const now = new Date().toISOString();
    const { error } = await sb.from("elementos").update(on ? { estado_carga: "Cargado", fecha_cargado: now, operario_carga: yo } : { estado_carga: "Pendiente", fecha_cargado: null, operario_carga: null, piezas_cargadas: 0 }).eq("id", x.id);
    if (error) return toast(error.message);
    await sb.from("piezas").update(on ? { cargada: true, fecha_cargada: now, operario_carga: yo } : { cargada: false, fecha_cargada: null, operario_carga: null }).eq("elemento_id", x.id);
    S.dirty = true; recarga();
  });
}

// ---------- pestaña Retorno ----------
export async function vRetorno(ctx, p, cont) {
  const { sb, esc, toast, puede, fd } = ctx;
  const edita = puede("admin", "taller");
  cont.innerHTML = `<div class="loading">Cargando…</div>`;
  let d; try { d = await datos(sb, p.id); } catch (e) { cont.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const cuenta = k => d.els.filter(x => x.destino_retorno === k).length;
  cont.innerHTML = `
  <div class="card"><h2>Retorno a fábrica</h2>
    <p class="hint">${p.hay_retorno === false ? "Este proyecto no tiene retorno." : `Descarga en fábrica: <b>${p.fecha_descarga ? fd(p.fecha_descarga) : "sin fecha"}</b>${p.hora_descarga ? " · " + esc(p.hora_descarga) : ""}${p.transporte_vuelta ? " · " + esc(p.transporte_vuelta) : ""}. Indica qué se hace con cada elemento al volver.`}</p>
    <div class="chips">${DESTINOS.map(k => `<span class="chip">${k} · ${cuenta(k)}</span>`).join("")}<span class="chip">Sin decidir · ${d.els.filter(x => !x.destino_retorno).length}</span></div>
  </div>
  <div class="card">${d.els.map(x => `
    <div class="lrow2"><div class="lr-main"><span class="num">${String(x.num_item ?? "").padStart(3, "0")}</span> <b>${esc(x.elemento)}</b> <span class="code">×${x.cantidad || 1}</span></div>
    <div class="lr-ctl"><select data-ret="${x.id}" ${edita ? "" : "disabled"}><option value="">Destino al volver…</option>${DESTINOS.map(k => `<option ${k === x.destino_retorno ? "selected" : ""}>${k}</option>`).join("")}</select></div></div>`).join("") || `<div class="code">Sin elementos.</div>`}</div>`;
  cont.querySelectorAll("[data-ret]").forEach(s => s.onchange = async () => {
    const { error } = await sb.from("elementos").update({ destino_retorno: s.value || null }).eq("id", +s.dataset.ret);
    if (error) toast(error.message); else vRetorno(ctx, p, cont);
  });
}

// ---------- Muelle: calendario de cargas y descargas ----------
export function vMuelle(ctx, ini) {
  const { $app, S, esc } = ctx;
  const base = ini ? pd(ini) : new Date(new Date().setHours(0, 0, 0, 0));
  const dias = Array.from({ length: 7 }, (_, i) => { const d = new Date(base); d.setDate(d.getDate() + i); return iso(d); });
  const enRango = (dia, a, b) => a && dia >= a && dia <= (b || a);
  const movs = dia => {
    const out = [];
    for (const p of S.proyectos) {
      if (p.archivado || (p.estado === "Cerrado" && !(p.fecha_descarga && p.fecha_descarga >= dias[0]))) continue;
      if (p.hay_carga !== false && enRango(dia, p.fecha_carga, p.fecha_carga_fin)) out.push({ t: "Carga", p, h: p.hora_carga, tr: p.transporte_ida });
      if (p.hay_retorno !== false && enRango(dia, p.fecha_descarga, p.fecha_descarga_fin)) out.push({ t: "Descarga", p, h: p.hora_descarga, tr: p.transporte_vuelta || p.transporte_ida });
    }
    return out.sort((a, b) => (a.h || "99").localeCompare(b.h || "99"));
  };
  const hoyI = iso(new Date());
  $app.innerHTML = `<h1>Muelle</h1>
  <p class="hint">Cargas y descargas de montaje en un solo calendario. Las horas que coinciden salen en rojo.</p>
  <div class="row" style="margin-bottom:10px"><a class="btn sm ghost" href="#/muelle/${suma(dias[0], -7)}">‹ Semana</a><a class="btn sm ghost" href="#/muelle">Hoy</a><a class="btn sm ghost" href="#/muelle/${suma(dias[0], 7)}">Semana ›</a></div>
  ${dias.map(dia => { const m = movs(dia); const horas = m.map(x => x.h).filter(Boolean); return `
    <div class="card ${dia === hoyI ? "today" : ""}"><div class="pj-top"><h2 style="margin:0">${fdl(dia)}${dia === hoyI ? " · hoy" : ""}</h2><span class="code">${m.length ? m.length + " movimiento" + (m.length > 1 ? "s" : "") : "Libre"}</span></div>
    ${m.map(x => { const choque = x.h && horas.filter(h => h === x.h).length > 1; return `
      <a class="mv" href="#/p/${x.p.id}/carga"><span class="pill ${x.t === "Carga" ? "ok" : "info"}">${x.t}</span>
      <b class="${choque ? "clash" : ""}">${esc(x.h || "—")}</b><div class="mvb"><b>${esc(x.p.nombre)}</b><div class="code">${esc(x.p.codigo)}${x.tr ? " · " + esc(x.tr) : ""}${x.p.tipo_vehiculo ? " · " + esc(x.p.tipo_vehiculo) : ""}</div></div></a>`; }).join("")}</div>`; }).join("")}`;
}
