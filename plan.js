// Planificación (proyectos y personal), ausencias y pestaña Equipo del proyecto
const FASES = ["Montaje", "Desmontaje", "Carga", "Descarga", "Fábrica"];
const COL = { Carga: "#E9BA4B", Montaje: "#1DCAD3", Evento: "#93D500", Desmontaje: "#3B4955", Descarga: "#D37B3E", "Fábrica": "#B9DD7A", Ausencia: "#8E9C9C" };
const TIPOS_AUS = ["Vacaciones", "Baja", "Curso", "Otros"];
const iso = d => d.toLocaleDateString("sv-SE");
const pd = s => s ? new Date(s + "T00:00:00") : null;
const suma = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return iso(d); };
const lunes = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const NDIAS = 42;
const enR = (dia, a, b) => a && dia >= a && dia <= (b || a);
const corto = s => (s || "").length > 14 ? s.slice(0, 13) + "…" : (s || "");

async function cargaPlan(sb) {
  const [a, au, f] = await Promise.all([
    sb.from("asignaciones").select("*"),
    sb.from("ausencias").select("*"),
    sb.from("festivos").select("*"),
  ]);
  for (const r of [a, au, f]) if (r.error) throw r.error;
  return { asig: a.data, aus: au.data, fest: f.data.filter(x => x.ambito !== "Comunidad de Madrid") };
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
  <div class="gh"><div class="gn"></div>${dias.map(d => { const w = pd(d).getDay(); const fe = fest.some(f => f.fecha === d); return `<div class="gd ${w === 0 || w === 6 ? "we" : ""} ${w === 6 ? "sat" : ""} ${fe ? "fe" : ""} ${d === hoy ? "hoy" : ""}" title="${fe ? fest.find(f => f.fecha === d).nombre : ""}"><span>${"DLMXJVS"[w]}</span><b>${pd(d).getDate()}</b></div>`; }).join("")}</div>`;
}

// ---------- Planificación ----------
export async function vPlan(ctx, modo, ini) {
  const { $app, S, sb, esc, puede, toast } = ctx;
  modo = modo === "personal" ? "personal" : "proyectos";
  const base = ini ? pd(ini) : lunes(new Date());
  const dias = Array.from({ length: NDIAS }, (_, i) => { const d = new Date(base); d.setDate(d.getDate() + i); return iso(d); });
  const d0 = dias[0], d1 = dias[NDIAS - 1];
  $app.innerHTML = `<div class="loading">Cargando planificación…</div>`;
  let D; try { D = await cargaPlan(sb); } catch (e) { $app.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  S.planFront = S.planFront || "";
  S.planCerr = S.planCerr || {};
  const fronts = S.operarios.filter(o => o.grupo === "Fronts" && o.activo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const nav = `<div class="pnav">
    <div class="seg2"><a href="#/plan/proyectos/${d0}" class="${modo === "proyectos" ? "on" : ""}">Proyectos</a><a href="#/plan/personal/${d0}" class="${modo === "personal" ? "on" : ""}">Personal</a></div>
    <div class="row"><a class="btn sm ghost" href="#/plan/${modo}/${suma(d0, -14)}">‹</a><a class="btn sm ghost" href="#/plan/${modo}">Hoy</a><a class="btn sm ghost" href="#/plan/${modo}/${suma(d0, 14)}">›</a></div>
    ${modo === "proyectos" ? `<select id="pfront"><option value="">Todos los Fronts</option>${fronts.map(o => `<option ${o.nombre === S.planFront ? "selected" : ""}>${esc(o.nombre)}</option>`).join("")}</select>` : (puede("admin", "front") ? `<button class="btn sm ghost" id="baus">+ Ausencia</button>` : "")}
  </div>`;
  const leyenda = (modo === "proyectos" ? ["Carga", "Montaje", "Evento", "Desmontaje", "Descarga"] : ["Montaje", "Desmontaje", "Fábrica", "Ausencia"]).map(f => `<span><i style="background:${COL[f]}"></i>${f}</span>`).join("");
  let filas = "";

  if (modo === "proyectos") {
    const ps = S.proyectos.filter(p => p.estado !== "Cerrado" || (p.fecha_descarga && p.fecha_descarga >= d0))
      .filter(p => !S.planFront || p.front_nombre === S.planFront)
      .map(p => ({ p, f: fasesProyecto(p) })).filter(x => x.f.some(([, a, b]) => b >= d0 && a <= d1))
      .sort((a, b) => (a.f[0] ? a.f[0][1] : "").localeCompare(b.f[0] ? b.f[0][1] : ""));
    filas = ps.map(({ p, f }) => {
      const barras = f.filter(([, a, b]) => b >= d0 && a <= d1).map(([fa, a, b]) => {
        const i = Math.max(0, dias.indexOf(a < d0 ? d0 : a)), j = dias.indexOf(b > d1 ? d1 : b);
        return `<div class="bar2" style="grid-column:${i + 2}/${j + 3};background:${COL[fa]}" title="${fa}: ${a}${a !== b ? " → " + b : ""}">${j - i >= 1 ? fa : fa[0]}</div>`;
      }).join("");
      return `<div class="gr"><a class="gn" href="#/p/${p.id}" title="${esc(p.nombre)}"><b>${esc(corto(p.nombre))}</b><span>${esc(p.codigo)} · ${esc((p.front_nombre || "").split(" ")[0])}</span></a>${fondo(dias, D.fest)}${barras}</div>`;
    }).join("") || `<div class="empty">No hay proyectos en estas fechas.</div>`;
  } else {
    const grupos = [
      ["Oficina", o => o.grupo === "Fronts" || o.grupo === "OT"],
      ["Taller y montaje", o => o.grupo === "Taller"],
      ["Externos", o => o.grupo === "Externos"],
    ];
    const orden = (a, b) => (a.grupo === "Taller" && b.grupo === "Taller" ? ((a.subgrupo === "Montaje") - (b.subgrupo === "Montaje")) : 0) || a.nombre.localeCompare(b.nombre);
    const activos = S.operarios.filter(o => o.activo !== false);
    filas = grupos.map(([g, fn]) => {
      const ops = activos.filter(fn).sort(orden);
      if (!ops.length) return "";
      const cerr = S.planCerr[g];
      return `<div class="gg" data-g="${g}"><span>${cerr ? "▸" : "▾"} ${g} <small class="code">${ops.length}</small></span></div>` + (cerr ? "" : ops.map(o => {
        const cel = dias.map((d, i) => {
          const au = D.aus.find(a => a.operario_id === o.id && enR(d, a.desde, a.hasta));
          if (au) return `<div class="cx" style="grid-column:${i + 2};background:${COL.Ausencia}" title="${esc(au.tipo || "Ausencia")}">${esc((au.tipo || "A")[0])}</div>`;
          let as = D.asig.find(a => a.operario_id === o.id && enR(d, a.fecha_inicio, a.fecha_fin) && a.fase !== "Carga" && a.fase !== "Descarga");
          let p = as && S.proyectos.find(x => x.id === as.proyecto_id);
          let fa = as && as.fase;
          if (!as && o.grupo === "Fronts") { // el Front ve los días de montaje de sus proyectos
            p = S.proyectos.find(x => x.front_id === o.id && fasesProyecto(x).some(([f, a, b]) => f === "Montaje" && enR(d, a, b)));
            fa = p ? "Montaje" : null;
          }
          if (!p) return "";
          const ini = i === 0 || !(D.asig.some(a => a.operario_id === o.id && a.proyecto_id === p.id && enR(dias[i - 1], a.fecha_inicio, a.fecha_fin)) || (o.grupo === "Fronts" && fasesProyecto(p).some(([f, a, b]) => f === "Montaje" && enR(dias[i - 1], a, b))));
          return `<div class="cx" style="grid-column:${i + 2};background:${COL[fa] || COL.Montaje}" title="${esc(p.nombre)} · ${fa}">${ini ? esc(corto(p.nombre)) : ""}</div>`;
        }).join("");
        const n = dias.filter(d => D.asig.some(a => a.operario_id === o.id && enR(d, a.fecha_inicio, a.fecha_fin))).length;
        return `<div class="gr"><div class="gn"><b>${esc(o.nombre)}</b><span>${esc(o.subgrupo === "Montaje" ? "Montaje" : o.puesto || o.grupo || "")}${n ? ` · ${n} d` : ""}</span></div>${fondo(dias, D.fest)}${cel}</div>`;
      }).join(""));
    }).join("");
  }

  $app.innerHTML = `<h1>Planificación</h1>${nav}<div class="ley">${leyenda}</div>
  <div class="gwrap"><div class="gantt" style="--cols:150px repeat(${NDIAS},30px)">${cabecera(dias, D.fest)}${filas}</div></div>`;
  const pf = document.getElementById("pfront"); if (pf) pf.onchange = () => { S.planFront = pf.value; vPlan(ctx, modo, d0); };
  $app.querySelectorAll(".gg").forEach(g => g.onclick = () => { S.planCerr[g.dataset.g] = !S.planCerr[g.dataset.g]; vPlan(ctx, modo, d0); });
  const ba = document.getElementById("baus"); if (ba) ba.onclick = () => formAusencia(ctx, () => vPlan(ctx, modo, d0), D);
  // desplaza a hoy
  const w = $app.querySelector(".gwrap"), h = $app.querySelector(".gd.hoy"); if (w && h) w.scrollLeft = Math.max(0, h.offsetLeft - 150 - 60);
}
function fondo(dias, fest) {
  return dias.map((d, i) => { const w = pd(d).getDay(); const fe = fest.some(f => f.fecha === d); return (w === 0 || w === 6 || fe) ? `<div class="bg ${w === 6 ? "sat" : ""}" style="grid-column:${i + 2}"></div>` : ""; }).join("");
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
  const edita = puede("admin", "front");
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
  cont.innerHTML = `<div class="card"><h2>Personal asignado <small class="code">${mias.length}</small></h2>
    ${mias.map(a => { const c = choque(a); return `<div class="crow"><div><b>${esc(opN(a.operario_id))}</b> <span class="pill" style="background:${COL[a.fase]}22;color:var(--ink)">${esc(a.fase)}</span>
      <div class="code">${a.fecha_inicio ? fd(a.fecha_inicio) : "—"}${a.fecha_fin && a.fecha_fin !== a.fecha_inicio ? " → " + fd(a.fecha_fin) : ""}${c.length ? ` · <span style="color:var(--red)">también en ${esc(c.join(", "))}</span>` : ""}</div></div>
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
      const row = { proyecto_id: p.id, operario_id: +$("q_op").value, fase: $("q_f").value, fecha_inicio: $("q_d").value || null, fecha_fin: $("q_h").value || $("q_d").value || null };
      if (mias.some(a => a.operario_id === row.operario_id && a.fase === row.fase)) return toast("Esa persona ya está asignada a esa fase.");
      const { error } = await sb.from("asignaciones").insert(row);
      if (error) return toast(error.message);
      toast("Asignación guardada"); vEquipo(ctx, p, cont);
    };
  }
  cont.querySelectorAll("[data-qdel]").forEach(b => b.onclick = async () => { if (!confirm("¿Quitar esta asignación?")) return; await sb.from("asignaciones").delete().eq("id", +b.dataset.qdel); vEquipo(ctx, p, cont); });
}
