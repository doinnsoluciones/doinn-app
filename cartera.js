// Cartera comercial (sustituye a la pestaña «2026» del Excel). Solo Fronts y dirección (permiso «ve_cartera»).
// Los importes viven en «proyectos_comercial», protegida en la base de datos: OT y taller no la pueden leer.
const V = new URL(import.meta.url).search;
const { COL_COM } = await import("./estados.js" + V);

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const ESTADOS = ["Presupuestado", "Pre-confirmado", "Confirmado", "Pospuesto", "Cancelado"];
const FILTROS = [["Confirmado", ["Confirmado"]], ["Pendiente", ["Presupuestado", "Pre-confirmado"]], ["Pospuesto", ["Pospuesto"]], ["Cancelado", ["Cancelado"]]];
const eur = n => n == null || n === "" || isNaN(n) ? "" : Number(n).toLocaleString("es-ES", { maximumFractionDigits: 0 }) + " €";
const pct = n => n == null || !isFinite(n) ? "" : Math.round(n * 100) + " %";
const ls = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } } };

export async function vCartera(ctx) {
  const { $app, S, sb, esc, toast } = ctx;
  $app.innerHTML = `<div class="loading">Cargando cartera…</div>`;
  const { data: com, error } = await sb.from("proyectos_comercial").select("*");
  if (error) { $app.innerHTML = `<div class="empty">No se pudo leer la cartera: ${esc(error.message)}</div>`; return; }
  const C = new Map(com.map(c => [c.proyecto_id, c]));
  const fronts = S.operarios.filter(o => o.grupo === "Fronts" && o.activo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const yo = S.perfil.operario_id && fronts.find(f => f.id === S.perfil.operario_id);
  S.cart = S.cart || { anio: String(new Date().getFullYear()), front: yo ? String(yo.id) : "", est: ls.get("doinn_cart_est", ["Confirmado", "Pendiente"]), q: "" };
  const st = S.cart;
  const anios = [...new Set(S.proyectos.filter(p => C.has(p.id) && p.evento_inicio).map(p => p.evento_inicio.slice(0, 4)))].sort();
  if (!anios.includes(st.anio)) anios.push(st.anio);

  const pinta = () => {
    const filas = S.proyectos.filter(p => !p.archivado)
      .filter(p => st.anio === "todos" || (p.evento_inicio || "").startsWith(st.anio) || (!p.evento_inicio && st.anio === String(new Date().getFullYear())))
      .filter(p => !st.front || (st.front === "otros" ? !p.front_id : String(p.front_id) === st.front))
      .filter(p => !st.q || [p.nombre, p.cliente, p.codigo, p.front_nombre].some(v => (v || "").toLowerCase().includes(st.q.toLowerCase())));
    const v = p => { const c = C.get(p.id); return c && c.venta != null ? Number(c.venta) : null; };
    const k = p => { const c = C.get(p.id); return c && c.coste_est != null ? Number(c.coste_est) : null; };
    const suma = (arr, f) => arr.reduce((s, p) => s + (f(p) || 0), 0);
    // indicadores (año y Front elegidos, todos los estados)
    const conf = filas.filter(p => p.estado_com === "Confirmado"), pend = filas.filter(p => ["Presupuestado", "Pre-confirmado"].includes(p.estado_com)), canc = filas.filter(p => p.estado_com === "Cancelado");
    const conCoste = conf.filter(p => k(p) != null && v(p));
    const margen = conCoste.length ? (suma(conCoste, v) - suma(conCoste, k)) / suma(conCoste, v) : null;
    const decididos = conf.length + canc.length;
    const estSel = FILTROS.filter(f => st.est.includes(f[0])).flatMap(f => f[1]);
    const vis = filas.filter(p => estSel.includes(p.estado_com)).sort((a, b) => (a.evento_inicio || "9999").localeCompare(b.evento_inicio || "9999"));
    const grupos = []; vis.forEach(p => { const m = p.evento_inicio ? p.evento_inicio.slice(0, 7) : "sin"; let g = grupos.find(x => x.m === m); if (!g) grupos.push(g = { m, ps: [] }); g.ps.push(p); });
    const rot = m => m === "sin" ? "Sin fecha" : `${MESES[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
    const selFront = p => `<select data-f="front" data-id="${p.id}"><option value="">${p.front_id ? "—" : esc(p.front_nombre || "—")}</option>${fronts.map(f => `<option value="${f.id}" ${p.front_id === f.id ? "selected" : ""}>${esc(f.nombre)}</option>`).join("")}</select>`;
    const fila = p => {
      const vv = v(p), kk = k(p), mg = vv != null && kk != null ? vv - kk : null;
      return `<tr class="${p.estado_com === "Cancelado" ? "canc" : ""}">
        <td><input type="date" data-f="fecha" data-id="${p.id}" value="${p.evento_inicio || ""}"></td>
        <td class="cn"><a href="#/p/${p.id}">${esc(p.nombre || p.codigo)}</a><small class="code">${esc(p.codigo)}</small></td>
        <td><input data-f="cliente" data-id="${p.id}" value="${esc(p.cliente || "")}"></td>
        <td>${selFront(p)}</td>
        <td><select data-f="estado" data-id="${p.id}" class="cest" style="--c:${COL_COM[p.estado_com] || "#ccc"}">${ESTADOS.map(e => `<option ${e === p.estado_com ? "selected" : ""}>${e}</option>`).join("")}</select></td>
        <td class="nr"><input type="number" step="0.01" data-f="venta" data-id="${p.id}" value="${vv ?? ""}" placeholder="—"></td>
        <td class="nr"><input type="number" step="0.01" data-f="coste" data-id="${p.id}" value="${kk ?? ""}" placeholder="—"></td>
        <td class="nr">${eur(mg)}</td><td class="nr">${vv && mg != null ? pct(mg / vv) : ""}</td></tr>`;
    };
    $app.innerHTML = `<div class="cart-top"><h1>Cartera</h1><div class="row" style="gap:8px"><button class="btn sm ghost" id="ccsv">Descargar Excel (CSV)</button><button class="btn sm lime" id="cnew">+ Oportunidad</button></div></div>
    <div class="kpis">
      <div class="kpi"><span>Venta confirmada</span><b>${eur(suma(conf, v))}</b><small>${conf.length} proyectos</small></div>
      <div class="kpi"><span>Cartera pendiente</span><b>${eur(suma(pend, v))}</b><small>${pend.length} presupuestos abiertos</small></div>
      <div class="kpi"><span>Cancelado</span><b>${eur(suma(canc, v))}</b><small>${canc.length} proyectos</small></div>
      <div class="kpi"><span>Tasa de éxito</span><b>${decididos ? pct(conf.length / decididos) : "—"}</b><small>confirmados / decididos</small></div>
      <div class="kpi"><span>Margen medio</span><b>${margen != null ? pct(margen) : "—"}</b><small>${conCoste.length ? `${conCoste.length} con coste estimado` : "falta el coste estimado"}</small></div>
    </div>
    <div class="cart-fil">
      <select id="canio">${anios.map(a => `<option ${a === st.anio ? "selected" : ""}>${a}</option>`).join("")}<option value="todos" ${st.anio === "todos" ? "selected" : ""}>Todos los años</option></select>
      <select id="cfront"><option value="">Todos los Fronts</option>${fronts.map(f => `<option value="${f.id}" ${String(f.id) === st.front ? "selected" : ""}>${esc(f.nombre)}${yo && yo.id === f.id ? " (yo)" : ""}</option>`).join("")}<option value="otros" ${st.front === "otros" ? "selected" : ""}>Externos y antiguos</option></select>
      ${FILTROS.map(([f]) => `<button class="chip ${st.est.includes(f) ? "on" : ""}" data-est="${f}">${f}</button>`).join("")}
      <input id="cq" class="cq" placeholder="Buscar proyecto o cliente…" value="${esc(st.q)}">
    </div>
    <div class="gwrap"><table class="cart"><thead><tr><th>Fecha evento</th><th>Proyecto</th><th>Cliente</th><th>Front</th><th>Estado</th><th class="nr">Venta</th><th class="nr">Coste est.</th><th class="nr">Margen</th><th class="nr">%</th></tr></thead>
    <tbody>${grupos.map(g => `<tr class="mes"><td colspan="5">${rot(g.m)} <small class="code">${g.ps.length}</small></td><td class="nr">${eur(suma(g.ps, v))}</td><td class="nr">${eur(suma(g.ps, k)) }</td><td colspan="2"></td></tr>${g.ps.map(fila).join("")}`).join("") || `<tr><td colspan="9" class="empty">No hay proyectos con estos filtros.</td></tr>`}</tbody>
    <tfoot><tr><td colspan="5">Total (${vis.length})</td><td class="nr">${eur(suma(vis, v))}</td><td class="nr">${eur(suma(vis, k))}</td><td colspan="2"></td></tr></tfoot></table></div>`;

    const $ = id => document.getElementById(id);
    $("canio").onchange = e => { st.anio = e.target.value; pinta(); };
    $("cfront").onchange = e => { st.front = e.target.value; pinta(); };
    $app.querySelectorAll("[data-est]").forEach(b => b.onclick = () => { const e = b.dataset.est; st.est = st.est.includes(e) ? st.est.filter(x => x !== e) : [...st.est, e]; ls.set("doinn_cart_est", st.est); pinta(); });
    let tq; $("cq").oninput = e => { clearTimeout(tq); tq = setTimeout(() => { st.q = e.target.value; pinta(); const i = $("cq"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); };
    $("ccsv").onclick = () => csv(vis, v, k);
    $("cnew").onclick = () => nueva(ctx, fronts, yo, C, pinta);
    // edición en la tabla
    $app.querySelectorAll("[data-f]").forEach(el => el.onchange = async () => {
      const p = S.proyectos.find(x => x.id === +el.dataset.id), f = el.dataset.f, val = el.value;
      let r;
      if (f === "venta" || f === "coste") {
        const c = C.get(p.id) || { proyecto_id: p.id };
        const fila = { proyecto_id: p.id, venta: f === "venta" ? (val === "" ? null : +val) : c.venta ?? null, coste_est: f === "coste" ? (val === "" ? null : +val) : c.coste_est ?? null, updated_at: new Date().toISOString(), updated_por: S.perfil.nombre || S.user.email };
        r = await sb.from("proyectos_comercial").upsert(fila);
        if (!r.error) C.set(p.id, { ...c, ...fila });
      } else {
        const cambios = f === "estado" ? { estado_com: val }
          : f === "cliente" ? { cliente: val.trim().toUpperCase() || null }
          : f === "fecha" ? { evento_inicio: val || null, evento_fin: !p.evento_fin || p.evento_fin === p.evento_inicio || (val && p.evento_fin < val) ? (val || null) : p.evento_fin }
          : { front_id: val ? +val : null, front_nombre: val ? fronts.find(x => x.id === +val).nombre : p.front_nombre };
        r = await sb.from("proyectos").update(cambios).eq("id", p.id);
        if (!r.error) Object.assign(p, cambios);
      }
      if (r.error) return toast("No se pudo guardar: " + r.error.message);
      toast(f === "estado" && val === "Confirmado" ? "Confirmado: ya aparece en Proyectos y Planificación" : "Guardado");
      pinta();
    });
  };
  pinta();
}

function csv(vis, v, k) {
  const q = s => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const n = x => x == null ? "" : String(x).replace(".", ",");
  const lin = [["Fecha evento", "Mes", "Proyecto", "Código", "Cliente", "Front", "Estado", "Venta", "Coste estimado", "Margen"].map(q).join(";"),
    ...vis.map(p => [p.evento_inicio || "", p.evento_inicio ? MESES[+p.evento_inicio.slice(5, 7) - 1] : "", p.nombre, p.codigo, p.cliente, p.front_nombre, p.estado_com, n(v(p)), n(k(p)), v(p) != null && k(p) != null ? n(v(p) - k(p)) : ""].map((x, i) => i >= 7 ? x : q(x)).join(";"))];
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + lin.join("\n")], { type: "text/csv" })); a.download = "cartera_doinn.csv"; a.click();
}

// Nueva oportunidad: crea el proyecto (código provisional OP-aammdd.nn) y su línea de cartera
function nueva(ctx, fronts, yo, C, pinta) {
  const { S, sb, esc, toast } = ctx;
  const m = document.createElement("div"); m.className = "modal";
  m.innerHTML = `<form class="card mbox frm" id="fop"><div class="row" style="justify-content:space-between"><h2 style="margin:0">Nueva oportunidad</h2><button type="button" class="link" id="ox">Cerrar ✕</button></div>
    <label>Proyecto<input id="o_nom" required placeholder="Nombre del proyecto"></label>
    <div class="two"><label>Cliente<input id="o_cli"></label><label>Fecha del evento<input id="o_fec" type="date"></label></div>
    <div class="two"><label>Front<select id="o_fr">${fronts.map(f => `<option value="${f.id}" ${yo && yo.id === f.id ? "selected" : ""}>${esc(f.nombre)}</option>`).join("")}</select></label>
    <label>Estado<select id="o_est">${ESTADOS.map(e => `<option ${e === "Presupuestado" ? "selected" : ""}>${e}</option>`).join("")}</select></label></div>
    <div class="two"><label>Venta (€)<input id="o_ven" type="number" step="0.01"></label><label>Coste estimado (€)<input id="o_cos" type="number" step="0.01"></label></div>
    <p class="hint">Se crea con un código provisional (OP-…). Cuando se confirme, pon el código definitivo en la ficha del proyecto.</p>
    <button class="btn lime wide">Crear oportunidad</button></form>`;
  document.body.appendChild(m);
  const $ = id => m.querySelector("#" + id);
  const cierra = () => m.remove();
  $("ox").onclick = cierra; m.onclick = e => { if (e.target === m) cierra(); };
  $("o_nom").focus();
  $("fop").onsubmit = async ev => {
    ev.preventDefault();
    const fec = $("o_fec").value || null, f = fronts.find(x => x.id === +$("o_fr").value);
    const base = "OP-" + (fec ? fec.slice(2).replace(/-/g, "") : new Date().toISOString().slice(2, 10).replace(/-/g, ""));
    let n = 1; while (S.proyectos.some(p => p.codigo === `${base}.${String(n).padStart(2, "0")}`)) n++;
    const est = $("o_est").value;
    const row = { codigo: `${base}.${String(n).padStart(2, "0")}`, nombre: $("o_nom").value.trim().toUpperCase(), cliente: $("o_cli").value.trim().toUpperCase() || null, front_id: f ? f.id : null, front_nombre: f ? f.nombre : null, evento_inicio: fec, evento_fin: fec, estado_com: est, estado: "En preparación" };
    const { data: p, error } = await sb.from("proyectos").insert(row).select().single();
    if (error) return toast("No se pudo crear: " + error.message);
    const ven = $("o_ven").value, cos = $("o_cos").value;
    const c = { proyecto_id: p.id, venta: ven === "" ? null : +ven, coste_est: cos === "" ? null : +cos, updated_at: new Date().toISOString(), updated_por: S.perfil.nombre || S.user.email };
    const r = await sb.from("proyectos_comercial").insert(c);
    if (r.error) toast("Proyecto creado, pero no se guardó el importe: " + r.error.message);
    S.proyectos.push(p); C.set(p.id, c);
    toast("Oportunidad creada"); cierra(); pinta();
  };
}
