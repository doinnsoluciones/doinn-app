// Inventario de material propio (alquiler y reutilización).
// Elemento (modelo de catálogo) → unidades, cada una con su etiqueta QR → salidas, entradas y reservas por proyecto.
const ETIQ = "https://doinnsoluciones.github.io/Etiquetas/";
export const CATS = [["Mostradores", "MOS"], ["Tarimas", "TAR"], ["Tarima rosco", "ROS"], ["Mesas", "MES"], ["Sillas y taburetes", "SIL"], ["Bastidores y traseras", "BAS"], ["Mobiliario", "MOB"], ["Iluminación", "ILU"], ["Estructura", "EST"], ["Varios", "VAR"]];
const pref = c => (CATS.find(k => k[0] === c) || CATS[CATS.length - 1])[1];
const EST = { Disponible: ["En almacén", "ok"], Fuera: ["Fuera", "warn"], "Dañado": ["Dañado", "bad"], Baja: ["Baja", ""] };
const iso = d => d.toLocaleDateString("sv-SE");
const hoy = () => iso(new Date());
const ini = p => p.fecha_carga || p.fecha_montaje || p.evento_inicio || null;
const fin = p => p.fecha_descarga || p.fecha_desmontaje_fin || p.fecha_desmontaje || p.evento_fin || p.evento_inicio || ini(p);
const fdc = d => d ? new Date(String(d).slice(0, 10) + "T00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";
const fh = t => new Date(t).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const med = m => [m.alto, m.ancho, m.fondo].some(v => v) ? `${m.alto || "—"} × ${m.ancho || "—"} × ${m.fondo || "—"} mm` : "";

// Código leído: etiqueta "DOINN|INVENTARIO|MOS-0001|…" o el código a mano "MOS-0001"
export function esCodigoInv(txt) {
  const t = String(txt || "").trim(), p = t.split("|");
  if (p[0] === "DOINN" && p[1] === "INVENTARIO" && p[2]) return p[2].trim().toUpperCase();
  return /^[A-Z]{3}-\d{4}$/i.test(t) ? t.toUpperCase() : null;
}

async function datos(sb) {
  const [m, u, r] = await Promise.all([
    sb.from("inv_modelos").select("*").order("nombre").range(0, 4999),
    sb.from("inv_unidades").select("*").order("codigo").range(0, 9999),
    sb.from("inv_reservas").select("*").order("desde").range(0, 4999),
  ]);
  for (const q of [m, u, r]) if (q.error) throw q.error;
  return { mods: m.data || [], uds: u.data || [], res: r.data || [] };
}

// Unidades libres de un elemento entre d1 y d2 para el proyecto P (sus propias reservas no cuentan)
function libres(S, d, modeloId, d1, d2, exceptP) {
  const uds = d.uds.filter(u => u.modelo_id === modeloId && (u.estado === "Disponible" || u.estado === "Fuera"));
  const proy = id => (S.proyectos || []).find(p => p.id === id);
  let fuera = 0;
  for (const u of uds) if (u.estado === "Fuera") { const p = proy(u.proyecto_id), f = p && fin(p); if (!f || f >= d1) fuera++; }
  const otras = d.res.filter(r => r.modelo_id === modeloId && r.proyecto_id !== exceptP && r.desde <= d2 && r.hasta >= d1);
  // Reserva pendiente = reservado − lo que ese proyecto ya se ha llevado (eso ya cuenta como «fuera»)
  const pend = otras.map(r => ({ r, n: Math.max(0, r.cantidad - uds.filter(u => u.estado === "Fuera" && u.proyecto_id === r.proyecto_id).length) }));
  // Pico diario de reservas dentro del periodo
  let pico = 0;
  const t = new Date(d1 + "T00:00"), tope = new Date(d2 + "T00:00");
  for (let k = 0; t <= tope && k < 400; k++, t.setDate(t.getDate() + 1)) {
    const dia = iso(t); pico = Math.max(pico, pend.filter(x => x.r.desde <= dia && x.r.hasta >= dia).reduce((a, x) => a + x.n, 0));
  }
  return { total: uds.length, libres: uds.length - fuera - pico, otras };
}

// Proyectos a los que se puede sacar o reservar material
function proyectosVivos(S) {
  const h = hoy(), d = new Date(); d.setDate(d.getDate() - 10); const lim = iso(d);
  return (S.proyectos || []).filter(p => !p.archivado && p.estado_com !== "Cancelado" && (!fin(p) || fin(p) >= lim))
    .sort((a, b) => (ini(a) || "9999").localeCompare(ini(b) || "9999") || (a.nombre || "").localeCompare(b.nombre || ""))
    .map(p => ({ ...p, _fut: (ini(p) || h) >= h }));
}
const optsProy = (S, esc, sel) => `<option value="">Elige proyecto…</option>` + proyectosVivos(S).map(p => `<option value="${p.id}" ${p.id === sel ? "selected" : ""}>${esc(p.nombre || "")}${ini(p) ? " · carga " + fdc(ini(p)) : ""}${p.codigo ? " · " + esc(p.codigo) : ""}</option>`).join("");

function urlEtiquetas(d, uds) {
  const nom = id => ((d.mods.find(m => m.id === id) || {}).nombre || "").replace(/[~|]/g, " ");
  const lotes = [];
  for (let i = 0; i < uds.length; i += 100) lotes.push(uds.slice(i, i + 100));
  return lotes.map(l => `${ETIQ}?p=INVENTARIO&n=&e=${encodeURIComponent(l.map(u => [u.codigo, nom(u.modelo_id), 1].join("~")).join("|"))}`);
}
const botonesEtq = (d, uds, txt = "Imprimir etiquetas") => {
  const urls = urlEtiquetas(d, uds);
  return urls.length <= 1 ? `<a class="btn sm ghost" target="_blank" rel="noopener" href="${urls[0] || "#"}">🏷 ${txt} (${uds.length})</a>`
    : urls.map((u, i) => `<a class="btn sm ghost" target="_blank" rel="noopener" href="${u}">🏷 Lote ${i + 1}</a>`).join("");
};

// ---------- operaciones ----------
const quien = S => (S.scan && S.scan.operario && S.scan.operario.nombre) || (S.perfil && S.perfil.nombre) || ((S.user && S.user.email) || "").split("@")[0];

async function sacar(ctx, d, uds, P, nota, forzar) {
  const { sb, S } = ctx;
  const libresYa = uds.filter(u => u.estado === "Disponible");
  if (!libresYa.length) return { ok: false, msg: "No hay unidades en almacén para sacar" };
  if (!forzar) {
    const porMod = {}; libresYa.forEach(u => porMod[u.modelo_id] = (porMod[u.modelo_id] || 0) + 1);
    for (const [mid, n] of Object.entries(porMod)) {
      const l = libres(S, d, +mid, hoy(), fin(P) || hoy(), P.id);
      if (l.libres < n) {
        const m = d.mods.find(k => k.id === +mid), quienes = l.otras.map(r => { const q = (S.proyectos || []).find(p => p.id === r.proyecto_id); return `${q ? q.nombre : "?"} (${r.cantidad} · ${fdc(r.desde)}–${fdc(r.hasta)})`; }).join(", ");
        return { ok: false, reservado: true, msg: `Reservado: no puede salir ${m ? m.nombre : ""}`, det: `Libres para estas fechas: ${Math.max(0, l.libres)}. Reservas: ${quienes || "—"}` };
      }
    }
  }
  const now = new Date().toISOString(), yo = quien(S), ids = libresYa.map(u => u.id);
  const r1 = await sb.from("inv_unidades").update({ estado: "Fuera", proyecto_id: P.id, fecha_salida: now }).in("id", ids);
  if (r1.error) return { ok: false, msg: "No se pudo guardar", det: r1.error.message };
  await sb.from("inv_movimientos").insert(libresYa.map(u => ({ unidad_id: u.id, tipo: "Salida", proyecto_id: P.id, nota: (forzar ? "[Salida forzada pese a reserva] " : "") + (nota || "") || null, usuario: yo })));
  libresYa.forEach(u => Object.assign(u, { estado: "Fuera", proyecto_id: P.id, fecha_salida: now }));
  return { ok: true, msg: `${libresYa.length === 1 ? libresYa[0].codigo + " sale" : libresYa.length + " unidades salen"} a ${P.nombre}` };
}

async function entrar(ctx, uds, danado, nota) {
  const { sb, S } = ctx;
  const fuera = uds.filter(u => u.estado === "Fuera");
  if (!fuera.length) return { ok: false, msg: "Ninguna de esas unidades está fuera" };
  const yo = quien(S), ids = fuera.map(u => u.id);
  const r1 = await sb.from("inv_unidades").update({ estado: danado ? "Dañado" : "Disponible", proyecto_id: null, fecha_salida: null }).in("id", ids);
  if (r1.error) return { ok: false, msg: "No se pudo guardar", det: r1.error.message };
  await sb.from("inv_movimientos").insert(fuera.map(u => ({ unidad_id: u.id, tipo: "Entrada", proyecto_id: u.proyecto_id, estado_retorno: danado ? "Dañado" : "Bueno", nota: nota || null, usuario: yo })));
  fuera.forEach(u => Object.assign(u, { estado: danado ? "Dañado" : "Disponible", proyecto_id: null, fecha_salida: null }));
  return { ok: true, msg: `${fuera.length === 1 ? fuera[0].codigo : fuera.length + " unidades"} de vuelta${danado ? " (dañado)" : ""}` };
}

async function altaUnidades(ctx, d, m, n, ubicacion) {
  const { sb, S } = ctx;
  const pr = pref(m.categoria);
  let max = 0; d.uds.forEach(u => { const k = u.codigo.match(new RegExp("^" + pr + "-(\\d+)$")); if (k) max = Math.max(max, +k[1]); });
  const nuevas = Array.from({ length: n }, (_, i) => ({ modelo_id: m.id, codigo: `${pr}-${String(max + 1 + i).padStart(4, "0")}`, ubicacion: ubicacion || null }));
  const { data, error } = await sb.from("inv_unidades").insert(nuevas).select();
  if (error) return { ok: false, msg: error.message };
  if (data && data.length) await sb.from("inv_movimientos").insert(data.map(u => ({ unidad_id: u.id, tipo: "Alta", usuario: quien(S) })));
  return { ok: true, n: (data || nuevas).length };
}

// Escaneo desde la página Escanear. Con sesión de inventario abierta registra directamente; si no, abre la ficha.
export async function escaneaInv(ctx, codigo) {
  const { S, sb } = ctx;
  const ses = S.invSes;
  if (!ses) return { nav: "#/inv/u/" + encodeURIComponent(codigo) };
  let d; try { d = await datos(sb); } catch (e) { return { ok: false, msg: "Error al leer", det: e.message }; }
  const u = d.uds.find(k => k.codigo === codigo);
  if (!u) return { ok: false, msg: "Código de inventario no encontrado", det: codigo };
  const m = d.mods.find(k => k.id === u.modelo_id) || {};
  if (ses.tipo === "Salida") {
    const P = (S.proyectos || []).find(p => p.id === ses.proyecto_id);
    if (!P) return { ok: false, msg: "Proyecto no encontrado" };
    if (u.estado === "Fuera") return { ok: false, msg: `${codigo} ya está fuera`, det: (S.proyectos.find(p => p.id === u.proyecto_id) || {}).nombre || "" };
    if (u.estado !== "Disponible") return { ok: false, msg: `${codigo} está ${u.estado.toLowerCase()}`, det: "No puede salir" };
    const r = await sacar(ctx, d, [u], P, "");
    if (r.ok) { ses.n = (ses.n || 0) + 1; r.det = m.nombre; }
    return r;
  }
  const r = await entrar(ctx, [u], false, "");
  if (r.ok) { ses.n = (ses.n || 0) + 1; r.det = m.nombre; }
  return r;
}

// ---------- vistas ----------
export async function vInventario(ctx, vista = "lista", a1, a2) {
  const { $app, sb, esc } = ctx;
  $app.innerHTML = `<div class="loading">Cargando…</div>`;
  let d;
  try { d = await datos(sb); } catch (e) { $app.innerHTML = `<div class="empty">No se pudo cargar el inventario: ${esc(e.message)}</div>`; return; }
  if (vista === "nuevo") return vForm(ctx, d, null);
  if (vista === "m" && a2 === "editar") return vForm(ctx, d, d.mods.find(m => m.id === +a1));
  if (vista === "m") return vModelo(ctx, d, +a1);
  if (vista === "u") return vUnidad(ctx, d, decodeURIComponent(a1 || ""));
  if (vista === "reservas") return vReservas(ctx, d);
  if (vista === "movimientos") return vMovs(ctx, d);
  return vLista(ctx, d);
}

const cab = (act, edita) => `<div class="pj-top"><h1>Inventario_</h1>${edita ? `<a class="btn lime" href="#/inv/nuevo">+ Nuevo elemento</a>` : ""}</div>
  <div class="itabs">${[["lista", "Elementos", "#/inventario"], ["reservas", "Reservas", "#/inventario/reservas"], ["movimientos", "Movimientos", "#/inventario/movimientos"]].map(([k, t, h]) => `<a href="${h}" class="${act === k ? "on" : ""}">${t}</a>`).join("")}</div>`;

function vLista(ctx, d) {
  const { $app, S, esc, puede } = ctx;
  const edita = puede("admin", "taller");
  S.invF = S.invF || { q: "", cat: "", est: "" };
  const F = S.invF;
  const n = e => d.uds.filter(u => u.estado === e).length;
  const h = hoy();
  const pinta = () => {
    const q = F.q.trim().toUpperCase();
    const mods = d.mods.filter(m => m.activo !== false && (!F.cat || m.categoria === F.cat) && (!q || (m.nombre || "").toUpperCase().includes(q) || d.uds.some(u => u.modelo_id === m.id && u.codigo.includes(q)) || (m.observaciones || "").toUpperCase().includes(q)));
    const filas = mods.map(m => {
      const us = d.uds.filter(u => u.modelo_id === m.id), alm = us.filter(u => u.estado === "Disponible").length, fue = us.filter(u => u.estado === "Fuera").length, dan = us.filter(u => u.estado === "Dañado").length;
      const prox = d.res.filter(r => r.modelo_id === m.id && r.hasta >= h).slice(0, 2);
      if (F.est === "fuera" && !fue) return ""; if (F.est === "reservado" && !prox.length) return ""; if (F.est === "danado" && !dan) return "";
      const cods = us.filter(u => u.estado !== "Baja").map(u => u.codigo);
      return `<a class="invr card" href="#/inv/m/${m.id}">
        <div class="invn"><b>${esc(m.nombre)}</b><div class="code">${[m.categoria, med(m)].filter(Boolean).map(esc).join(" · ")}${cods.length ? ` · ${esc(cods[0])}${cods.length > 1 ? "…" + esc(cods[cods.length - 1].slice(-4)) : ""}` : ""}</div>
          <div class="invp">${fue ? `<span class="pill warn">${fue} fuera</span>` : ""}${dan ? `<span class="pill bad">${dan} dañad${dan > 1 ? "as" : "a"}</span>` : ""}${prox.map(r => { const p = (S.proyectos || []).find(k => k.id === r.proyecto_id); return `<span class="pill info">Reserva ${r.cantidad} · ${esc(p ? p.nombre : "?")} ${fdc(r.desde)}</span>`; }).join("")}</div></div>
        <div class="invc"><b>${alm}<small>/${us.filter(u => u.estado !== "Baja").length}</small></b><span>en almacén</span></div></a>`;
    }).join("");
    document.getElementById("invl").innerHTML = filas || `<div class="empty">${d.mods.length ? "Nada coincide con el filtro." : "Aún no hay elementos. Pulsa «+ Nuevo elemento» para dar de alta el primero."}</div>`;
  };
  $app.innerHTML = `${cab("lista", edita)}
  <div class="kpis ikp">${[["Elementos", d.mods.filter(m => m.activo !== false).length], ["Unidades (QR)", d.uds.filter(u => u.estado !== "Baja").length], ["En almacén", n("Disponible")], ["Fuera", n("Fuera")], ["Dañadas", n("Dañado")]].map(([t, v]) => `<div class="kpi"><span>${t}</span><b>${v}</b></div>`).join("")}</div>
  ${edita ? `<div class="card invscan"><b>Escanear material</b><div class="code">Abre la cámara o usa la pistola y ve leyendo etiquetas: cada lectura se registra sola.</div>
    <div class="row"><select id="sesp">${optsProy(S, esc)}</select><button class="btn" id="sess">⬆ Salida a proyecto</button><button class="btn ghost" id="sese">⬇ Entrada a almacén</button></div></div>` : ""}
  <div class="row invf"><input id="invq" class="inp" placeholder="Buscar elemento o código (MOS-0001)…" value="${esc(F.q)}">
    <select id="invc"><option value="">Todas las categorías</option>${CATS.map(([c]) => `<option ${F.cat === c ? "selected" : ""}>${c}</option>`).join("")}</select>
    <select id="inve"><option value="">Todos</option><option value="fuera" ${F.est === "fuera" ? "selected" : ""}>Con unidades fuera</option><option value="reservado" ${F.est === "reservado" ? "selected" : ""}>Con reservas</option><option value="danado" ${F.est === "danado" ? "selected" : ""}>Con dañadas</option></select></div>
  <div id="invl"></div>`;
  pinta();
  const $ = id => document.getElementById(id);
  $("invq").oninput = () => { F.q = $("invq").value; pinta(); };
  $("invc").onchange = () => { F.cat = $("invc").value; pinta(); };
  $("inve").onchange = () => { F.est = $("inve").value; pinta(); };
  if ($("sess")) {
    $("sess").onclick = () => { const pid = +$("sesp").value; if (!pid) return ctx.toast("Elige el proyecto al que sale el material"); S.invSes = { tipo: "Salida", proyecto_id: pid, n: 0 }; S.scan = S.scan || { operario: null, log: [] }; S.scan.autoCam = true; location.hash = "#/escanear"; };
    $("sese").onclick = () => { S.invSes = { tipo: "Entrada", n: 0 }; S.scan = S.scan || { operario: null, log: [] }; S.scan.autoCam = true; location.hash = "#/escanear"; };
  }
}

function vModelo(ctx, d, id) {
  const { $app, S, esc, puede, toast } = ctx;
  const m = d.mods.find(k => k.id === id);
  if (!m) { $app.innerHTML = `<div class="empty">Elemento no encontrado.</div>`; return; }
  const edita = puede("admin", "taller");
  const us = d.uds.filter(u => u.modelo_id === id), activas = us.filter(u => u.estado !== "Baja");
  const cnt = e => us.filter(u => u.estado === e).length;
  const h = hoy();
  const res = d.res.filter(r => r.modelo_id === id && r.hasta >= h);
  const pn = pid => { const p = (S.proyectos || []).find(k => k.id === pid); return p ? p.nombre : "—"; };
  const lh = libres(S, d, id, h, h, -1);
  $app.innerHTML = `<a class="back" href="#/inventario">‹ Inventario</a>
  <div class="code">${esc(m.categoria || "")}</div><h1>${esc(m.nombre)}</h1>
  <div class="code" style="margin:-8px 0 12px">${[med(m), m.material, m.peso ? m.peso + " kg" : ""].filter(Boolean).map(esc).join(" · ")}</div>
  ${edita ? `<div class="row" style="margin-bottom:10px"><a class="btn sm ghost" href="#/inv/m/${id}/editar">✎ Editar elemento</a></div>` : ""}
  <div class="kpis ikp">${[["En almacén", cnt("Disponible")], ["Fuera", cnt("Fuera")], ["Dañadas", cnt("Dañado")], ["Libres hoy", Math.max(0, lh.libres)]].map(([t, v]) => `<div class="kpi"><span>${t}</span><b>${v}</b></div>`).join("")}</div>
  ${m.observaciones ? `<div class="card"><div class="code">Observaciones</div><div style="white-space:pre-wrap">${esc(m.observaciones)}</div></div>` : ""}

  <div class="card"><div class="pj-top"><h2>Unidades <small class="code">${activas.length} con etiqueta</small></h2>${edita ? `<span class="row"><input id="nadd" type="number" min="1" max="200" value="1" class="inp" style="width:70px"><button class="btn sm ghost" id="badd">+ Añadir unidades</button></span>` : ""}</div>
    ${us.length ? `<div class="invbar"><label><input type="checkbox" id="uall"> Todas</label><span class="code" id="usel">0 seleccionadas</span></div>
    <div class="invu">${us.map(u => { const [t, c] = EST[u.estado] || [u.estado, ""]; return `<label class="iu ${u.estado === "Baja" ? "baja" : ""}"><input type="checkbox" data-u="${u.id}"><a href="#/inv/u/${encodeURIComponent(u.codigo)}" class="iuc">${esc(u.codigo)}</a><span class="pill ${c}">${t}${u.estado === "Fuera" ? " · " + esc(pn(u.proyecto_id)) : ""}</span><span class="code">${esc(u.ubicacion || "")}</span></label>`; }).join("")}</div>
    <div class="row invact" id="uact">${botonesEtq(d, activas, "Etiquetas de todas")}</div>
    ${edita ? `<div class="invop" id="uop" hidden>
      <div class="row"><select id="op_p">${optsProy(S, esc)}</select><input id="op_n" class="inp" placeholder="Nota (opcional)"><button class="btn" id="op_s">⬆ Sacar a proyecto</button></div>
      <div class="row"><button class="btn ghost" id="op_e">⬇ Entrada: vuelve bien</button><button class="btn ghost" id="op_d">⬇ Entrada: vuelve dañado</button><span id="op_etq"></span></div>
      <div id="op_msg"></div></div>` : ""}` : `<div class="empty">Sin unidades. Añade unidades para generar sus códigos y etiquetas.</div>`}
  </div>

  <div class="card"><div class="pj-top"><h2>Reservas</h2></div>
    ${res.length ? res.map(r => { const ya = us.filter(u => u.estado === "Fuera" && u.proyecto_id === r.proyecto_id).length; return `<div class="ires"><div><b>${esc(pn(r.proyecto_id))}</b><div class="code">${r.cantidad} ud · ${fdc(r.desde)} → ${fdc(r.hasta)}${r.nota ? " · " + esc(r.nota) : ""}${r.usuario ? " · " + esc(r.usuario) : ""}</div></div><span class="pill ${ya >= r.cantidad ? "ok" : ya ? "warn" : "info"}">${ya}/${r.cantidad} servidas</span>${edita ? `<button class="link" data-delres="${r.id}">Anular</button>` : ""}</div>`; }).join("") : `<div class="code">Sin reservas próximas.</div>`}
    ${edita ? `<div class="iresf"><select id="r_p">${optsProy(S, esc)}</select><input id="r_n" type="number" min="1" value="1" class="inp" title="Unidades"><input id="r_d" type="date" class="inp" title="Desde"><input id="r_h" type="date" class="inp" title="Hasta"><input id="r_t" class="inp" placeholder="Nota"><button class="btn sm lime" id="r_ok">Reservar</button><div class="code" id="r_info">Las fechas se rellenan con la carga y la descarga del proyecto.</div></div>` : ""}
  </div>
  <div class="card" id="ihist"><h2>Historial</h2><div class="code">Cargando…</div></div>`;

  const $ = k => document.getElementById(k);
  // historial
  const ids = us.map(u => u.id);
  (ids.length ? ctx.sb.from("inv_movimientos").select("*").in("unidad_id", ids).order("fecha", { ascending: false }).limit(60) : Promise.resolve({ data: [] })).then(({ data }) => {
    const el = $("ihist"); if (!el) return;
    el.innerHTML = `<h2>Historial</h2>${(data || []).map(v => movFila(ctx, d, v)).join("") || `<div class="code">Sin movimientos.</div>`}`;
  });
  // selección
  const sel = () => [...$app.querySelectorAll("[data-u]:checked")].map(c => us.find(u => u.id === +c.dataset.u));
  const actSel = () => {
    const s = sel(); if (!$("usel")) return;
    $("usel").textContent = `${s.length} seleccionada${s.length === 1 ? "" : "s"}`;
    if ($("uop")) { $("uop").hidden = !s.length; $("op_etq").innerHTML = s.length ? botonesEtq(d, s) : ""; }
  };
  $app.querySelectorAll("[data-u]").forEach(c => c.onchange = actSel);
  if ($("uall")) $("uall").onchange = () => { $app.querySelectorAll("[data-u]").forEach(c => c.checked = $("uall").checked); actSel(); };
  const recarga = () => vInventario(ctx, "m", id);
  const msg = (ok, t, det = "") => { $("op_msg").innerHTML = `<div class="scanres ${ok ? "ok" : "ko"}"><b>${ok ? "✓" : "✕"} ${esc(t)}</b>${det ? `<div>${esc(det)}</div>` : ""}</div>`; };
  if ($("op_s")) $("op_s").onclick = async () => {
    const P = (S.proyectos || []).find(p => p.id === +$("op_p").value); if (!P) return toast("Elige el proyecto");
    let r = await sacar(ctx, d, sel(), P, $("op_n").value.trim());
    if (!r.ok && r.reservado) {
      msg(false, r.msg, r.det);
      if (puede("admin") && confirm(`${r.msg}\n${r.det}\n\n¿Sacarlo igualmente? Quedará anotado como salida forzada.`)) r = await sacar(ctx, d, sel(), P, $("op_n").value.trim(), true); else return;
    }
    if (!r.ok) return msg(false, r.msg, r.det || "");
    toast(r.msg); recarga();
  };
  const entrada = dan => async () => { const r = await entrar(ctx, sel(), dan, $("op_n").value.trim()); if (!r.ok) return msg(false, r.msg, r.det || ""); toast(r.msg); recarga(); };
  if ($("op_e")) { $("op_e").onclick = entrada(false); $("op_d").onclick = entrada(true); }
  if ($("badd")) $("badd").onclick = async () => {
    const n = Math.min(200, Math.max(1, +$("nadd").value || 1));
    if (!confirm(`¿Crear ${n} unidad${n > 1 ? "es" : ""} nueva${n > 1 ? "s" : ""} de ${m.nombre} con su código QR?`)) return;
    const r = await altaUnidades(ctx, d, m, n, ""); if (!r.ok) return toast("No se pudo: " + r.msg);
    toast(`${r.n} unidad${r.n > 1 ? "es" : ""} creada${r.n > 1 ? "s" : ""}`); recarga();
  };
  // reservas
  if ($("r_p")) {
    $("r_p").onchange = () => { const P = (S.proyectos || []).find(p => p.id === +$("r_p").value); if (!P) return; $("r_d").value = ini(P) || ""; $("r_h").value = fin(P) || ""; infoRes(); };
    const infoRes = () => { const d1 = $("r_d").value, d2 = $("r_h").value; if (!d1 || !d2) return; const l = libres(S, d, id, d1, d2, +$("r_p").value || -1); $("r_info").textContent = `Libres en esas fechas: ${Math.max(0, l.libres)} de ${l.total}`; };
    $("r_d").onchange = infoRes; $("r_h").onchange = infoRes;
    $("r_ok").onclick = async () => {
      const pid = +$("r_p").value, n = +$("r_n").value || 1, d1 = $("r_d").value, d2 = $("r_h").value;
      if (!pid || !d1 || !d2) return toast("Elige proyecto y fechas");
      if (d2 < d1) return toast("La fecha final es anterior a la inicial");
      const l = libres(S, d, id, d1, d2, pid);
      if (l.libres < n) return toast(`Solo hay ${Math.max(0, l.libres)} libres en esas fechas`);
      const { error } = await ctx.sb.from("inv_reservas").insert({ modelo_id: id, proyecto_id: pid, cantidad: n, desde: d1, hasta: d2, nota: $("r_t").value.trim() || null, usuario: quien(S) });
      if (error) return toast("No se pudo reservar: " + error.message);
      toast("Reserva guardada"); recarga();
    };
  }
  $app.querySelectorAll("[data-delres]").forEach(b => b.onclick = async () => {
    if (!confirm("¿Anular esta reserva?")) return;
    const { error } = await ctx.sb.from("inv_reservas").delete().eq("id", +b.dataset.delres);
    if (error) return toast("No se pudo: " + error.message);
    toast("Reserva anulada"); recarga();
  });
}

function movFila(ctx, d, v) {
  const { S, esc } = ctx;
  const u = d.uds.find(k => k.id === v.unidad_id) || {}, m = d.mods.find(k => k.id === u.modelo_id) || {};
  const p = (S.proyectos || []).find(k => k.id === v.proyecto_id);
  const c = { Salida: "warn", Entrada: "ok", Alta: "info", Estado: "" }[v.tipo] || "";
  return `<div class="imov"><span class="code">${fh(v.fecha)}</span><span class="pill ${c}">${v.tipo}${v.estado_retorno === "Dañado" ? " · dañado" : ""}</span><a href="#/inv/u/${encodeURIComponent(u.codigo || "")}"><b>${esc(u.codigo || "?")}</b></a><span>${esc(m.nombre || "")}</span><span class="code">${p ? esc(p.nombre) : ""}${v.usuario ? " · " + esc(v.usuario) : ""}${v.nota ? " · " + esc(v.nota) : ""}</span></div>`;
}

function vUnidad(ctx, d, codigo) {
  const { $app, S, esc, puede, toast } = ctx;
  const u = d.uds.find(k => k.codigo === codigo.toUpperCase());
  if (!u) { $app.innerHTML = `<a class="back" href="#/inventario">‹ Inventario</a><div class="empty">No existe ninguna unidad con el código ${esc(codigo)}.</div>`; return; }
  const m = d.mods.find(k => k.id === u.modelo_id) || {};
  const edita = puede("admin", "taller");
  const P = (S.proyectos || []).find(p => p.id === u.proyecto_id);
  const [t, c] = EST[u.estado] || [u.estado, ""];
  // Proyecto sugerido: el que tenga reserva de este elemento más próxima
  const h = hoy(), rs = d.res.filter(r => r.modelo_id === m.id && r.hasta >= h).sort((a, b) => a.desde.localeCompare(b.desde));
  const sug = rs[0] ? rs[0].proyecto_id : null;
  $app.innerHTML = `<a class="back" href="#/inv/m/${m.id}">‹ ${esc(m.nombre || "Inventario")}</a>
  <div class="code">${esc(m.categoria || "")}${med(m) ? " · " + med(m) : ""}</div><h1>${esc(u.codigo)}</h1>
  <div class="ust ${c}"><b>${t}</b><span>${u.estado === "Fuera" ? `${esc(P ? P.nombre : "Proyecto")} · desde ${fdc(u.fecha_salida)}` : u.ubicacion ? "Ubicación: " + esc(u.ubicacion) : esc(m.nombre || "")}</span></div>
  ${edita ? `<div class="card">${u.estado === "Disponible" ? `<h2>Sacar a proyecto</h2>
      <select id="up" class="wide">${optsProy(S, esc, sug)}</select>${sug ? `<div class="code">Sugerido: tiene reserva de este elemento.</div>` : ""}
      <input id="un" class="inp wide" placeholder="Nota (opcional)">
      <button class="btn lime big wide" id="usal">⬆ Sacar a proyecto</button>`
      : u.estado === "Fuera" ? `<h2>Registrar entrada</h2><input id="un" class="inp wide" placeholder="Nota (opcional): qué le pasa, qué falta…">
      <div class="row"><button class="btn lime big" id="uok">⬇ Vuelve bien</button><button class="btn ghost big" id="udan">⬇ Vuelve dañado</button></div>`
      : u.estado === "Dañado" ? `<h2>Unidad dañada</h2><input id="un" class="inp wide" placeholder="Nota (opcional)"><div class="row"><button class="btn lime" id="urep">✓ Reparada · vuelve al almacén</button>${puede("admin") ? `<button class="btn ghost" id="ubaja">Dar de baja</button>` : ""}</div>`
      : `<h2>Dada de baja</h2>${puede("admin") ? `<button class="btn ghost" id="urep">Recuperar · vuelve al almacén</button>` : ""}`}
      <div id="umsg"></div></div>
    <div class="card"><h2>Datos de la unidad</h2>
      <label class="fl">Ubicación en nave<input id="uub" class="inp" value="${esc(u.ubicacion || "")}" placeholder="Ej. E3-B2"></label>
      <label class="fl">Observaciones de esta unidad<textarea id="uob" class="inp" rows="2">${esc(u.observaciones || "")}</textarea></label>
      <div class="row"><button class="btn sm" id="ugu">Guardar</button>${botonesEtq(d, [u], "Imprimir etiqueta")}</div></div>` : ""}
  <div class="card" id="uhist"><h2>Historial</h2><div class="code">Cargando…</div></div>`;
  const $ = k => document.getElementById(k);
  ctx.sb.from("inv_movimientos").select("*").eq("unidad_id", u.id).order("fecha", { ascending: false }).limit(50).then(({ data }) => { const el = $("uhist"); if (el) el.innerHTML = `<h2>Historial</h2>${(data || []).map(v => movFila(ctx, d, v)).join("") || `<div class="code">Sin movimientos.</div>`}`; });
  const recarga = () => vInventario(ctx, "u", u.codigo);
  const msg = (ok, t2, det = "") => { $("umsg").innerHTML = `<div class="scanres ${ok ? "ok" : "ko"}"><b>${ok ? "✓" : "✕"} ${esc(t2)}</b>${det ? `<div>${esc(det)}</div>` : ""}</div>`; };
  const nota = () => ($("un") ? $("un").value.trim() : "");
  if ($("usal")) $("usal").onclick = async () => {
    const P2 = (S.proyectos || []).find(p => p.id === +$("up").value); if (!P2) return toast("Elige el proyecto");
    let r = await sacar(ctx, d, [u], P2, nota());
    if (!r.ok && r.reservado) { msg(false, r.msg, r.det); if (puede("admin") && confirm(`${r.msg}\n${r.det}\n\n¿Sacarlo igualmente? Quedará anotado como salida forzada.`)) r = await sacar(ctx, d, [u], P2, nota(), true); else return; }
    if (!r.ok) return msg(false, r.msg, r.det || "");
    toast(r.msg); recarga();
  };
  const ent = dan => async () => { const r = await entrar(ctx, [u], dan, nota()); if (!r.ok) return msg(false, r.msg); toast(r.msg); recarga(); };
  if ($("uok")) { $("uok").onclick = ent(false); $("udan").onclick = ent(true); }
  const cambiaEst = (e, txt) => async () => {
    const { error } = await ctx.sb.from("inv_unidades").update({ estado: e }).eq("id", u.id);
    if (error) return toast("No se pudo: " + error.message);
    await ctx.sb.from("inv_movimientos").insert({ unidad_id: u.id, tipo: "Estado", nota: [txt, nota()].filter(Boolean).join(" · "), usuario: quien(S) });
    toast(txt); recarga();
  };
  if ($("urep")) $("urep").onclick = cambiaEst("Disponible", "Vuelve a estar disponible");
  if ($("ubaja")) $("ubaja").onclick = () => confirm(`¿Dar de baja ${u.codigo}? Deja de contar en el inventario (se conserva el historial).`) && cambiaEst("Baja", "Dada de baja")();
  if ($("ugu")) $("ugu").onclick = async () => {
    const { error } = await ctx.sb.from("inv_unidades").update({ ubicacion: $("uub").value.trim().toUpperCase() || null, observaciones: $("uob").value.trim() || null }).eq("id", u.id);
    if (error) return toast("No se pudo: " + error.message);
    toast("Guardado"); recarga();
  };
}

function vForm(ctx, d, m) {
  const { $app, esc, puede, toast, sb } = ctx;
  if (!puede("admin", "taller")) { $app.innerHTML = `<div class="empty">No tienes permiso para editar el inventario.</div>`; return; }
  const nuevo = !m; m = m || { categoria: CATS[0][0] };
  const f = (k, t, extra = "") => `<label class="fl">${t}<input id="f_${k}" class="inp" value="${esc(m[k] == null ? "" : m[k])}" ${extra}></label>`;
  $app.innerHTML = `<a class="back" href="${nuevo ? "#/inventario" : "#/inv/m/" + m.id}">‹ ${nuevo ? "Inventario" : esc(m.nombre)}</a>
  <h1>${nuevo ? "Nuevo elemento" : "Editar elemento"}</h1>
  <div class="card iform">
    ${f("nombre", "Elemento *", 'placeholder="Ej. MOSTRADOR ALUMINIO MODELO A 200"')}
    <label class="fl">Categoría<select id="f_categoria">${CATS.map(([c, p]) => `<option value="${c}" ${m.categoria === c ? "selected" : ""}>${c} (${p}-…)</option>`).join("")}</select></label>
    <div class="g3">${f("alto", "Alto (mm)", 'type="number" min="0"')}${f("ancho", "Ancho (mm)", 'type="number" min="0"')}${f("fondo", "Fondo (mm)", 'type="number" min="0"')}</div>
    <div class="g3">${f("peso", "Peso (kg)", 'type="number" min="0" step="0.1"')}${f("material", "Material / acabado", 'placeholder="Ej. ALUMINIO + DM LACADO"')}</div>
    <label class="fl">Observaciones<textarea id="f_observaciones" class="inp" rows="3" placeholder="Cómo se monta, piezas que lo componen, cuidados…">${esc(m.observaciones || "")}</textarea></label>
    ${nuevo ? `<div class="g3">${`<label class="fl">Unidades a crear<input id="f_n" class="inp" type="number" min="1" max="200" value="1"></label>`}<label class="fl">Ubicación en nave<input id="f_ub" class="inp" placeholder="Ej. E3-B2"></label></div>
    <div class="code">Cada unidad recibe un código propio (p. ej. MOS-0001) y su etiqueta QR.</div>` : ""}
    <div class="row"><button class="btn lime" id="fok">${nuevo ? "Crear elemento" : "Guardar"}</button>${!nuevo && puede("admin") ? `<button class="btn ghost" id="fdel">Eliminar elemento</button>` : ""}</div>
  </div>`;
  const $ = k => document.getElementById(k);
  const num = k => { const v = $("f_" + k).value; return v === "" ? null : +v; };
  $("fok").onclick = async () => {
    const reg = { nombre: $("f_nombre").value.trim().toUpperCase(), categoria: $("f_categoria").value, alto: num("alto"), ancho: num("ancho"), fondo: num("fondo"), peso: num("peso"), material: $("f_material").value.trim().toUpperCase() || null, observaciones: $("f_observaciones").value.trim() || null };
    if (!reg.nombre) return toast("Falta el nombre del elemento");
    $("fok").disabled = true;
    if (nuevo) {
      const { data, error } = await sb.from("inv_modelos").insert(reg).select().single();
      if (error) { $("fok").disabled = false; return toast("No se pudo crear: " + error.message); }
      const n = Math.min(200, Math.max(1, +$("f_n").value || 1));
      const r = await altaUnidades(ctx, d, data, n, $("f_ub").value.trim().toUpperCase());
      if (!r.ok) toast("Elemento creado, pero falló la creación de unidades: " + r.msg); else toast(`Creado con ${r.n} unidad${r.n > 1 ? "es" : ""}`);
      location.hash = "#/inv/m/" + data.id;
    } else {
      const { error } = await sb.from("inv_modelos").update(reg).eq("id", m.id);
      if (error) { $("fok").disabled = false; return toast("No se pudo guardar: " + error.message); }
      toast("Guardado"); location.hash = "#/inv/m/" + m.id;
    }
  };
  if ($("fdel")) $("fdel").onclick = async () => {
    const us = d.uds.filter(u => u.modelo_id === m.id);
    if (us.some(u => u.estado === "Fuera")) return toast("Tiene unidades fuera: primero registra su entrada");
    if (!confirm(`¿Eliminar ${m.nombre} y sus ${us.length} unidades, reservas e historial? No se puede deshacer.\n\nSi solo está retirado, mejor da de baja las unidades.`)) return;
    const { error } = await sb.from("inv_modelos").delete().eq("id", m.id);
    if (error) return toast("No se pudo: " + error.message);
    toast("Elemento eliminado"); location.hash = "#/inventario";
  };
}

function vReservas(ctx, d) {
  const { $app, S, esc, puede } = ctx;
  const h = hoy();
  const rs = d.res.filter(r => r.hasta >= h);
  const porP = {};
  rs.forEach(r => (porP[r.proyecto_id] = porP[r.proyecto_id] || []).push(r));
  const grupos = Object.entries(porP).map(([pid, l]) => ({ p: (S.proyectos || []).find(k => k.id === +pid), l })).sort((a, b) => (a.l[0].desde).localeCompare(b.l[0].desde));
  $app.innerHTML = `${cab("reservas", puede("admin", "taller"))}
  ${grupos.length ? grupos.map(g => `<div class="card"><div class="pj-top"><div><b>${esc(g.p ? g.p.nombre : "Proyecto")}</b><div class="code">${g.p && ini(g.p) ? "Carga " + fdc(ini(g.p)) : ""}${g.p && fin(g.p) ? " · vuelta " + fdc(fin(g.p)) : ""}</div></div></div>
    ${g.l.map(r => { const m = d.mods.find(k => k.id === r.modelo_id) || {}; const ya = d.uds.filter(u => u.modelo_id === r.modelo_id && u.estado === "Fuera" && u.proyecto_id === r.proyecto_id).length; return `<a class="ires" href="#/inv/m/${m.id}"><div><b>${esc(m.nombre || "?")}</b><div class="code">${r.cantidad} ud · ${fdc(r.desde)} → ${fdc(r.hasta)}${r.nota ? " · " + esc(r.nota) : ""}</div></div><span class="pill ${ya >= r.cantidad ? "ok" : ya ? "warn" : "info"}">${ya}/${r.cantidad} servidas</span></a>`; }).join("")}</div>`).join("")
    : `<div class="empty">No hay reservas próximas. Se reserva desde la ficha de cada elemento.</div>`}`;
}

async function vMovs(ctx, d) {
  const { $app, esc, puede, sb } = ctx;
  $app.innerHTML = `${cab("movimientos", puede("admin", "taller"))}<div class="card" id="imv"><div class="code">Cargando…</div></div>`;
  const { data, error } = await sb.from("inv_movimientos").select("*").order("fecha", { ascending: false }).limit(300);
  const el = document.getElementById("imv"); if (!el) return;
  el.innerHTML = error ? esc(error.message) : (data || []).map(v => movFila(ctx, d, v)).join("") || `<div class="code">Aún no hay movimientos.</div>`;
}
