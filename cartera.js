// Cartera comercial (sustituye a la pestaña «2026» del Excel). Solo Fronts y dirección (permiso «ve_cartera»).
// Los importes viven en «proyectos_comercial», protegida en la base de datos: OT y taller no la pueden leer.
const V = new URL(import.meta.url).search;
const { COL_COM } = await import("./estados.js" + V);

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const ESTADOS = ["Presupuestado", "Pre-confirmado", "Confirmado", "Pospuesto", "Cancelado"];
const FILTROS = [["Confirmado", ["Confirmado"]], ["Pendiente", ["Presupuestado", "Pre-confirmado"]], ["Pospuesto", ["Pospuesto"]], ["Cancelado", ["Cancelado"]]];
// importes siempre en formato español: 1.234.567,89 (punto de miles, coma decimal, dos decimales)
const num = n => { if (n == null || n === "" || isNaN(n)) return ""; const [e, d] = Math.abs(Number(n)).toFixed(2).split("."); return (Number(n) < 0 ? "-" : "") + e.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + d; };
const eur = n => { const t = num(n); return t ? t + " €" : ""; };
// lee lo que escriba el usuario: «1.234,5», «1234,50», «1234.5» o «1.234»
const leeNum = t => { t = String(t).replace(/[€\s]/g, ""); if (!t) return null; if (t.includes(",")) t = t.replace(/\./g, "").replace(",", "."); else if (!/^\d+\.\d{1,2}$/.test(t)) t = t.replace(/\./g, ""); const n = Number(t); return isFinite(n) ? Math.round(n * 100) / 100 : NaN; };
const pct = n => n == null || !isFinite(n) ? "" : Math.round(n * 100) + " %";
const ls = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } } };

export async function vCartera(ctx) {
  const { $app, S, sb, esc, toast } = ctx;
  $app.innerHTML = `<div class="loading">Cargando cartera…</div>`;
  const { data: com, error } = await sb.from("proyectos_comercial").select("*");
  if (error) { $app.innerHTML = `<div class="empty">No se pudo leer la cartera: ${esc(error.message)}</div>`; return; }
  const C = new Map(com.map(c => [c.proyecto_id, c]));
  const fronts = S.operarios.filter(o => o.grupo === "Fronts" && o.activo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const PAL = ["#2E7CF6", "#E8833A", "#8B5CF6", "#16A085", "#D9467A", "#C9A227", "#0EA5C6", "#7C9A2E"];
  const colF = new Map(fronts.slice().sort((a, b) => a.id - b.id).map((f, i) => [f.id, PAL[i % PAL.length]]));
  const cF = p => colF.get(p.front_id) || "#A0A8B0";
  const corto = f => { const [n, a] = f.nombre.split(" "); return fronts.filter(x => x.nombre.split(" ")[0] === n).length > 1 && a ? `${n} ${a[0]}.` : n; };
  const yo = S.perfil.operario_id && fronts.find(f => f.id === S.perfil.operario_id);
  S.cart = S.cart || { anio: String(new Date().getFullYear()), front: yo ? String(yo.id) : "", est: ls.get("doinn_cart_est", ["Confirmado", "Pendiente"]), q: "", cli: "", meses: [], desde: "", hasta: "", ord: "fecha", dir: 1, pleg: ls.get("doinn_cart_pleg", []) };
  const st = S.cart;
  const anios = [...new Set(S.proyectos.filter(p => C.has(p.id) && p.evento_inicio).map(p => p.evento_inicio.slice(0, 4)))].sort();
  if (!anios.includes(st.anio)) anios.push(st.anio);
  const hoy = new Date().toISOString().slice(0, 10);
  const v = p => { const c = C.get(p.id); return c && c.venta != null ? Number(c.venta) : null; };
  const k = p => { const c = C.get(p.id); return c && c.coste_est != null ? Number(c.coste_est) : null; };
  const suma = (arr, f) => arr.reduce((s, p) => s + (f(p) || 0), 0);
  const sumaK = arr => arr.some(p => k(p) != null) ? eur(suma(arr, k)) : "";
  const ORD = { fecha: p => p.evento_inicio || "9999", nombre: p => p.nombre || "", cliente: p => p.cliente || "", front: p => p.front_nombre || "", estado: p => ESTADOS.indexOf(p.estado_com), venta: p => v(p) ?? -1, coste: p => k(p) ?? -1, margen: p => v(p) != null && k(p) != null ? v(p) - k(p) : -1e12, pct: p => v(p) && k(p) != null ? (v(p) - k(p)) / v(p) : -1e12 };

  const pinta = () => {
    const scroll = document.querySelector(".cart-wrap")?.scrollTop || 0;
    // base: año + Front + texto + cliente (sin mes ni fechas ni estado) → alimenta la tira mensual
    const base = S.proyectos.filter(p => !p.archivado)
      .filter(p => st.anio === "todos" || (p.evento_inicio || "").startsWith(st.anio) || (!p.evento_inicio && st.anio === String(new Date().getFullYear())))
      .filter(p => !st.front || (st.front === "otros" ? !p.front_id : String(p.front_id) === st.front))
      .filter(p => !st.cli || (p.cliente || "") === st.cli)
      .filter(p => !st.q || [p.nombre, p.cliente, p.codigo, p.front_nombre].some(x => (x || "").toLowerCase().includes(st.q.toLowerCase())));
    // filas: además mes(es) y rango de días
    const filas = base.filter(p => !st.meses.length || (p.evento_inicio && st.meses.includes(p.evento_inicio.slice(5, 7))))
      .filter(p => !st.desde || (p.evento_inicio && p.evento_inicio >= st.desde))
      .filter(p => !st.hasta || (p.evento_inicio && p.evento_inicio <= st.hasta));
    const conf = filas.filter(p => p.estado_com === "Confirmado"), pend = filas.filter(p => ["Presupuestado", "Pre-confirmado"].includes(p.estado_com)), canc = filas.filter(p => p.estado_com === "Cancelado");
    const real = conf.filter(p => p.evento_inicio && p.evento_inicio <= hoy);
    const conCoste = conf.filter(p => k(p) != null && v(p));
    const margen = conCoste.length ? (suma(conCoste, v) - suma(conCoste, k)) / suma(conCoste, v) : null;
    const decididos = conf.length + canc.length;
    const estSel = FILTROS.filter(f => st.est.includes(f[0])).flatMap(f => f[1]);
    const of = ORD[st.ord] || ORD.fecha;
    const vis = filas.filter(p => estSel.includes(p.estado_com)).sort((a, b) => { const x = of(a), y = of(b); return (x < y ? -1 : x > y ? 1 : (a.evento_inicio || "").localeCompare(b.evento_inicio || "")) * st.dir; });
    const grupos = []; vis.forEach(p => { const m = p.evento_inicio ? p.evento_inicio.slice(0, 7) : "sin"; let g = grupos.find(x => x.m === m); if (!g) grupos.push(g = { m, ps: [] }); g.ps.push(p); });
    grupos.sort((a, b) => a.m.localeCompare(b.m) * (st.ord === "fecha" ? st.dir : 1));
    const rot = m => m === "sin" ? "Sin fecha" : `${MESES[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
    // tira mes a mes (solo con un año concreto)
    const mesHoy = hoy.slice(0, 7);
    const tira = st.anio === "todos" ? "" : `<div class="cmes">${MESES.map((n, i) => {
      const mm = String(i + 1).padStart(2, "0"), clave = `${st.anio}-${mm}`;
      const ps = base.filter(p => (p.evento_inicio || "").startsWith(clave) && p.estado_com === "Confirmado");
      const re = ps.filter(p => p.evento_inicio <= hoy).length, prev = ps.length - re;
      return `<button class="cm ${st.meses.includes(mm) ? "on" : ""} ${clave === mesHoy ? "hoy" : ""} ${clave > mesHoy ? "fut" : ""}" data-mes="${mm}" title="Filtrar ${n}">
        <span>${n.slice(0, 3)}</span><b>${ps.length ? eur(suma(ps, v)) : "—"}</b><small>${re ? `${re} realizado${re > 1 ? "s" : ""}` : ""}${re && prev ? " · " : ""}${prev ? `${prev} previsto${prev > 1 ? "s" : ""}` : ""}${!ps.length ? "sin eventos" : ""}</small></button>`;
    }).join("")}</div>`;
    const selFront = p => `<select data-f="front" data-id="${p.id}" class="cfr" style="--c:${cF(p)}"><option value="">${p.front_id ? "—" : esc(p.front_nombre || "—")}</option>${fronts.map(f => `<option value="${f.id}" ${p.front_id === f.id ? "selected" : ""}>${esc(f.nombre)}</option>`).join("")}</select>`;
    const fila = p => {
      const vv = v(p), kk = k(p), mg = vv != null && kk != null ? vv - kk : null;
      return `<tr class="${p.estado_com === "Cancelado" ? "canc" : ""}" style="--fc:${cF(p)}">
        <td><input type="date" data-f="fecha" data-id="${p.id}" value="${p.evento_inicio || ""}"></td>
        <td class="cn"><a href="#/p/${p.id}">${esc(p.nombre || p.codigo)}</a><small class="code">${esc(p.codigo)}</small></td>
        <td><input data-f="cliente" data-id="${p.id}" value="${esc(p.cliente || "")}"></td>
        <td>${selFront(p)}</td>
        <td><select data-f="estado" data-id="${p.id}" class="cest" style="--c:${COL_COM[p.estado_com] || "#ccc"}">${ESTADOS.map(e => `<option ${e === p.estado_com ? "selected" : ""}>${e}</option>`).join("")}</select></td>
        <td class="nr"><input inputmode="decimal" data-f="venta" data-id="${p.id}" value="${num(vv)}" placeholder="—"></td>
        <td class="nr"><input inputmode="decimal" data-f="coste" data-id="${p.id}" value="${num(kk)}" placeholder="—"></td>
        <td class="nr">${eur(mg)}</td><td class="nr">${vv && mg != null ? pct(mg / vv) : ""}</td></tr>`;
    };
    const th = (c, t, cls = "") => `<th class="so ${cls} ${st.ord === c ? "act" : ""}" data-ord="${c}">${t}<i>${st.ord === c ? (st.dir > 0 ? "▲" : "▼") : ""}</i></th>`;
    const clientes = [...new Set(S.proyectos.filter(p => C.has(p.id) && p.cliente).map(p => p.cliente))].sort();
    const anioHoy = String(new Date().getFullYear());
    const hayFil = st.meses.length || st.desde || st.hasta || st.q || st.cli || st.front || st.anio !== anioHoy || st.est.join() !== "Confirmado,Pendiente";
    const todosPleg = grupos.length && grupos.every(g => st.pleg.includes(g.m));
    const grupo = g => {
      const cerr = st.pleg.includes(g.m), cf = g.ps.filter(p => p.estado_com === "Confirmado");
      return `<tr class="mes" data-g="${g.m}"><td colspan="5"><span class="tg">${cerr ? "▸" : "▾"}</span> ${rot(g.m)} <small class="code">${g.ps.length} proyecto${g.ps.length > 1 ? "s" : ""}${cf.length !== g.ps.length && cf.length ? ` · confirmado ${eur(suma(cf, v))}` : ""}</small></td><td class="nr">${eur(suma(g.ps, v))}</td><td class="nr">${sumaK(g.ps)}</td><td colspan="2"></td></tr>${cerr ? "" : g.ps.map(fila).join("")}`;
    };
    $app.innerHTML = `<div class="cart-top"><div class="row" style="gap:8px;margin-left:auto"><button class="btn sm ghost" id="ccsv">Descargar Excel (CSV)</button><button class="btn sm lime" id="cnew">+ Oportunidad</button></div></div>
    <div class="kpis">
      <div class="kpi"><span>Venta confirmada</span><b>${eur(suma(conf, v))}</b><small>${conf.length} proyectos</small></div>
      <div class="kpi"><span>Eventos realizados</span><b>${real.length}</b><small>${eur(suma(real, v))} · ${conf.length - real.length} previstos</small></div>
      <div class="kpi"><span>Cartera pendiente</span><b>${eur(suma(pend, v))}</b><small>${pend.length} presupuestos abiertos</small></div>
      <div class="kpi"><span>Cancelado</span><b>${eur(suma(canc, v))}</b><small>${canc.length} proyectos</small></div>
      <div class="kpi"><span>Tasa de éxito</span><b>${decididos ? pct(conf.length / decididos) : "—"}</b><small>confirmados / decididos</small></div>
      <div class="kpi"><span>Margen medio</span><b>${margen != null ? pct(margen) : "—"}</b><small>${conCoste.length ? `${conCoste.length} con coste estimado` : "falta el coste estimado"}</small></div>
    </div>
    ${tira}
    <div class="cart-fil">
      <select id="canio">${anios.map(a => `<option ${a === st.anio ? "selected" : ""}>${a}</option>`).join("")}<option value="todos" ${st.anio === "todos" ? "selected" : ""}>Todos los años</option></select>
      <select id="cfront"><option value="">Todos los Fronts</option>${fronts.map(f => `<option value="${f.id}" ${String(f.id) === st.front ? "selected" : ""}>${esc(f.nombre)}${yo && yo.id === f.id ? " (yo)" : ""}</option>`).join("")}<option value="otros" ${st.front === "otros" ? "selected" : ""}>Externos y antiguos</option></select>
      <select id="ccli"><option value="">Todos los clientes</option>${clientes.map(c => `<option ${c === st.cli ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
      <label class="cdate">Desde<input type="date" id="cdes" value="${st.desde}"></label>
      <label class="cdate">Hasta<input type="date" id="chas" value="${st.hasta}"></label>
      <input id="cq" class="cq" placeholder="Buscar proyecto, código o cliente…" value="${esc(st.q)}">
    </div>
    <div class="cart-fil cleg">${fronts.map(f => `<button class="chip sm ${String(f.id) === st.front ? "on" : ""}" data-fr="${f.id}"><i style="background:${colF.get(f.id)}"></i>${esc(corto(f))}</button>`).join("")}<button class="chip sm ${st.front === "otros" ? "on" : ""}" data-fr="otros"><i style="background:#A0A8B0"></i>Externos y antiguos</button></div>
    <div class="cart-fil">
      ${FILTROS.map(([f]) => `<button class="chip sm ${st.est.includes(f) ? "on" : ""}" data-est="${f}">${f}</button>`).join("")}
      ${st.meses.length ? `<span class="cfm">Meses: ${st.meses.map(m => MESES[+m - 1].slice(0, 3)).join(", ")}</span>` : ""}
      <button class="btn sm ghost cbor" id="climp" ${hayFil ? "" : "disabled"}>✕ Borrar filtros</button>
      <span style="flex:1"></span>
      ${grupos.length ? `<button class="link" id="cpleg">${todosPleg ? "▾ Desplegar todo" : "▸ Plegar todo"}</button>` : ""}
    </div>
    <div class="gwrap cart-wrap"><table class="cart"><thead><tr>${th("fecha", "Fecha evento")}${th("nombre", "Proyecto")}${th("cliente", "Cliente")}${th("front", "Front")}${th("estado", "Estado")}${th("venta", "Venta", "nr")}${th("coste", "Coste est.", "nr")}${th("margen", "Margen", "nr")}${th("pct", "%", "nr")}</tr></thead>
    <tbody>${grupos.map(grupo).join("") || `<tr><td colspan="9" class="empty">No hay proyectos con estos filtros.</td></tr>`}</tbody>
    <tfoot><tr><td colspan="5">Total (${vis.length})</td><td class="nr">${eur(suma(vis, v))}</td><td class="nr">${sumaK(vis)}</td><td colspan="2"></td></tr></tfoot></table></div>`;

    const $ = id => document.getElementById(id);
    const w = $app.querySelector(".cart-wrap");
    const alto = () => { if (w && innerWidth > 700) w.style.maxHeight = Math.max(380, innerHeight - w.getBoundingClientRect().top - 14) + "px"; };
    alto(); window._cartAlto = alto; if (!window._cartRs) { window._cartRs = 1; addEventListener("resize", () => document.querySelector(".cart-wrap") && window._cartAlto()); } if (w) w.scrollTop = scroll;
    $("canio").onchange = e => { st.anio = e.target.value; st.meses = []; pinta(); };
    $("cfront").onchange = e => { st.front = e.target.value; pinta(); };
    $app.querySelectorAll("[data-fr]").forEach(b => b.onclick = () => { st.front = st.front === b.dataset.fr ? "" : b.dataset.fr; pinta(); });
    $("ccli").onchange = e => { st.cli = e.target.value; pinta(); };
    $("cdes").onchange = e => { st.desde = e.target.value; pinta(); };
    $("chas").onchange = e => { st.hasta = e.target.value; pinta(); };
    $app.querySelectorAll("[data-mes]").forEach(b => b.onclick = () => { const m = b.dataset.mes; st.meses = st.meses.includes(m) ? st.meses.filter(x => x !== m) : [...st.meses, m].sort(); pinta(); });
    $app.querySelectorAll("[data-est]").forEach(b => b.onclick = () => { const e = b.dataset.est; st.est = st.est.includes(e) ? st.est.filter(x => x !== e) : [...st.est, e]; ls.set("doinn_cart_est", st.est); pinta(); });
    $app.querySelectorAll("[data-ord]").forEach(h => h.onclick = () => { const c = h.dataset.ord; if (st.ord === c) st.dir = -st.dir; else { st.ord = c; st.dir = ["venta", "coste", "margen", "pct"].includes(c) ? -1 : 1; } pinta(); });
    $app.querySelectorAll("tr.mes").forEach(r => r.onclick = () => { const g = r.dataset.g; st.pleg = st.pleg.includes(g) ? st.pleg.filter(x => x !== g) : [...st.pleg, g]; ls.set("doinn_cart_pleg", st.pleg); pinta(); });
    if ($("cpleg")) $("cpleg").onclick = () => { st.pleg = todosPleg ? st.pleg.filter(m => !grupos.some(g => g.m === m)) : [...new Set([...st.pleg, ...grupos.map(g => g.m)])]; ls.set("doinn_cart_pleg", st.pleg); pinta(); };
    $("climp").onclick = () => { Object.assign(st, { anio: anioHoy, front: "", est: ["Confirmado", "Pendiente"], meses: [], desde: "", hasta: "", q: "", cli: "" }); ls.set("doinn_cart_est", st.est); pinta(); };
    let tq; $("cq").oninput = e => { clearTimeout(tq); tq = setTimeout(() => { st.q = e.target.value; pinta(); const i = $("cq"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); };
    $("ccsv").onclick = () => csv(vis, v, k);
    $("cnew").onclick = () => nueva(ctx, fronts, yo, C, pinta);
    // edición en la tabla
    $app.querySelectorAll("[data-f]").forEach(el => el.onchange = async () => {
      const p = S.proyectos.find(x => x.id === +el.dataset.id), f = el.dataset.f, val = el.value;
      let r;
      if (f === "venta" || f === "coste") {
        const c = C.get(p.id) || { proyecto_id: p.id }, nv = leeNum(val);
        if (Number.isNaN(nv)) { toast("Importe no válido: usa 1.234,56"); el.value = num(f === "venta" ? c.venta : c.coste_est); return; }
        const fila = { proyecto_id: p.id, venta: f === "venta" ? nv : c.venta ?? null, coste_est: f === "coste" ? nv : c.coste_est ?? null, updated_at: new Date().toISOString(), updated_por: S.perfil.nombre || S.user.email };
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
  const n = x => x == null ? "" : Number(x).toFixed(2).replace(".", ",");
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
    <div class="two"><label>Venta (€)<input id="o_ven" inputmode="decimal" placeholder="0,00"></label><label>Coste estimado (€)<input id="o_cos" inputmode="decimal" placeholder="0,00"></label></div>
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
    const ven = leeNum($("o_ven").value), cos = leeNum($("o_cos").value);
    const c = { proyecto_id: p.id, venta: Number.isNaN(ven) ? null : ven, coste_est: Number.isNaN(cos) ? null : cos, updated_at: new Date().toISOString(), updated_por: S.perfil.nombre || S.user.email };
    const r = await sb.from("proyectos_comercial").insert(c);
    if (r.error) toast("Proyecto creado, pero no se guardó el importe: " + r.error.message);
    S.proyectos.push(p); C.set(p.id, c);
    toast("Oportunidad creada"); cierra(); pinta();
  };
}
