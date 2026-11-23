// Panel de indicadores
const V = new URL(import.meta.url).search;
const { ordenProyectos } = await import("./estados.js" + V);
export function vPanel(ctx, h) {
  const { $app, S, esc, stats, salud, fd, dias } = ctx;
  const act = S.proyectos.filter(p => p.estado !== "Cerrado" && !p.archivado && ((p.estado_com || "Confirmado") === "Confirmado" || (p.estado_com === "Pendiente" && p.fecha_carga))).sort(ordenProyectos);
  const ids = new Set(act.map(p => p.id));
  const els = S.elementos.filter(e => ids.has(e.proyecto_id));
  const grupos = {
    taller: { t: "En taller", e: e => e.estado_doc === "Hecho" && e.estado_fab !== "Hecho" },
    carga: { t: "Listos para carga", e: e => e.estado_fab === "Hecho" && e.estado_carga !== "Cargado" },
    inc: { t: "Incidencias abiertas", e: e => e.incidencia },
  };
  const riesgo = act.filter(p => { const [, c] = salud(p, stats(p.id)); return c === "bad"; });
  const fila = (k, g) => { const e = els.filter(g.e); const pr = new Set(e.map(x => x.proyecto_id)); return `<tr data-k="${k}" class="${h === k ? "sel" : ""}"><td>${g.t}</td><td>${e.length}</td><td>${pr.size}</td></tr>`; };
  const sel = h && (grupos[h] ? act.filter(p => els.some(e => e.proyecto_id === p.id && grupos[h].e(e))) : h === "riesgo" ? riesgo : []);
  const prox = act.filter(p => { const d = dias(p.fecha_carga); return d !== null && d >= 0 && d <= 14; }).sort((a, b) => (a.fecha_carga || "").localeCompare(b.fecha_carga || ""));
  const tile = (k, n, l, c = "") => `<a class="card k kt ${c} ${h === k ? "sel" : ""}" href="#/panel/${h === k ? "" : k}"><b>${n}</b><span>${l}</span></a>`;
  $app.innerHTML = `
  <div class="kgrid">
    ${tile("", act.length, "Proyectos activos")}
    ${tile("taller", els.filter(grupos.taller.e).length, "Elementos en taller")}
    ${tile("carga", els.filter(grupos.carga.e).length, "Listos para carga", "okc")}
    ${tile("riesgo", riesgo.length, "Proyectos en riesgo", riesgo.length ? "badc" : "")}
    ${tile("inc", els.filter(grupos.inc.e).length, "Incidencias abiertas", els.some(grupos.inc.e) ? "badc" : "")}
  </div>
  <div class="card"><h2>Proyectos</h2><table class="f kt2"><tr><th></th><th>Elementos</th><th>Proyectos</th></tr>
    ${fila("taller", grupos.taller)}${fila("carga", grupos.carga)}
    <tr data-k="riesgo" class="${h === "riesgo" ? "sel" : ""}"><td>Proyectos en riesgo</td><td>—</td><td>${riesgo.length}</td></tr>
    ${fila("inc", grupos.inc)}</table></div>
  ${sel ? `<div class="card"><h2>${esc(grupos[h] ? grupos[h].t : "Proyectos en riesgo")}</h2>${sel.map(p => `<a class="lrow" href="#/p/${p.id}/elementos"><b>${esc(p.nombre)}</b><span class="code">${esc(p.codigo)} · carga ${fd(p.fecha_carga)}</span></a>`).join("") || `<div class="code">Ninguno.</div>`}</div>` : ""}
  <div class="card"><h2>Próximas cargas <small class="code">14 días</small></h2>
  ${prox.map(p => { const st = stats(p.id); const d = dias(p.fecha_carga); return `<a class="lrow" href="#/p/${p.id}"><div><b>${esc(p.nombre)}</b><div class="code">${esc(p.codigo)} · ${esc(p.front_nombre || "")}</div></div><div class="r"><b>${d === 0 ? "Hoy" : fd(p.fecha_carga)}</b><div class="code">${st.av}% · ${st.n} elem.</div></div></a>`; }).join("") || `<div class="code">No hay cargas en los próximos 14 días.</div>`}</div>`;
  $app.querySelectorAll("tr[data-k]").forEach(tr => tr.onclick = () => location.hash = `#/panel/${h === tr.dataset.k ? "" : tr.dataset.k}`);
}
