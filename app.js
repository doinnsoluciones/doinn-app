import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
// Carga los módulos con la misma versión que app.js (evita versiones viejas en caché)
const V = new URL(import.meta.url).search;
const { CONFIG } = await import("./config.js" + V);
const { vFicha } = await import("./ficha.js" + V);
const { vElementos, vElemento } = await import("./elementos.js" + V);
const { vEscanear } = await import("./escanear.js" + V);
const { vPanel } = await import("./panel.js" + V);
const { vDespiece, vElementoForm } = await import("./despiece.js" + V);

const sb = createClient(CONFIG.url, CONFIG.anonKey, { auth: { persistSession: true, detectSessionInUrl: true } });
const $app = document.getElementById("app");
const $me = document.getElementById("me");
const S = { user: null, perfil: null, proyectos: [], elementos: [], operarios: [], verCerrados: false, q: "" };

// ---------- utilidades ----------
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hoy = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const pd = s => s ? new Date(s + "T00:00:00") : null;
const fd = s => s ? pd(s).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" }) : "—";
const dias = s => s ? Math.round((pd(s) - hoy()) / 864e5) : null;
const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
function toast(m) { const t = document.getElementById("toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2600); }
const puede = (...roles) => S.perfil && S.perfil.aprobado && roles.includes(S.perfil.rol);

// ---------- datos ----------
async function cargar() {
  const [p, e, o] = await Promise.all([
    sb.from("proyectos").select("*").order("fecha_carga", { ascending: true, nullsFirst: false }),
    sb.from("elementos").select("id,proyecto_id,cantidad,estado_doc,estado_fab,estado_carga,incidencia"),
    sb.from("operarios").select("id,nombre,grupo,subgrupo,activo,codigo,puesto").order("nombre"),
  ]);
  for (const r of [p, e, o]) if (r.error) throw r.error;
  S.proyectos = p.data; S.elementos = e.data; S.operarios = o.data;
  await autoArchivar();
}
// Proyectos con todas sus fechas pasadas → Cerrado (como en Power Apps)
async function autoArchivar() {
  if (!puede("admin", "front")) return;
  const t = hoy();
  const viejos = S.proyectos.filter(p => p.estado !== "Cerrado").filter(p => {
    const u = p.fecha_descarga || p.fecha_desmontaje_fin || p.fecha_desmontaje || p.evento_fin || p.evento_inicio || p.fecha_carga;
    return u && pd(u) < t;
  });
  if (!viejos.length) return;
  const { error } = await sb.from("proyectos").update({ estado: "Cerrado" }).in("id", viejos.map(p => p.id));
  if (!error) viejos.forEach(p => p.estado = "Cerrado");
}
const ctx = () => ({ $app, S, sb, esc, toast, puede, recargar: cargar, stats, salud, fd, dias });
function stats(pid) {
  const els = S.elementos.filter(x => x.proyecto_id === pid);
  const n = els.length;
  const doc = els.filter(x => x.estado_doc === "Hecho").length;
  const fab = els.filter(x => x.estado_fab === "Hecho").length;
  const car = els.filter(x => x.estado_carga === "Cargado").length;
  return { n, doc: pct(doc, n), fab: pct(fab, n), car: pct(car, n), av: n ? Math.round((pct(doc, n) + pct(fab, n) + pct(car, n)) / 3) : 0, inc: els.some(x => x.incidencia) };
}
function salud(p, st) {
  if (p.estado === "Cerrado") return ["Cerrado", ""];
  const d = dias(p.fecha_carga);
  if (st.n && st.av === 100) return ["Listo", "ok"];
  if (d !== null && d < 0) return ["Retrasado", "bad"];
  if (!st.n) return d !== null && d <= 7 ? ["Sin despiece", "warn"] : ["Sin datos", ""];
  if (d !== null && d <= 3) return ["En riesgo", "bad"];
  return [p.estado || "En preparación", "info"];
}

// ---------- vistas ----------
function vLogin(msg = "") {
  document.body.classList.add("noauth");
  $me.innerHTML = "";
  $app.innerHTML = `<div class="auth">
    <img class="logo-b" src="logo-navy.svg" alt="DOINN">
    <p>Entra con tu email y tu contraseña. Si es la primera vez, pulsa «Crear cuenta».</p>
    <form id="f"><input id="em" type="email" required placeholder="tu@email.com" autocomplete="email">
    <input id="pw" type="password" required minlength="8" placeholder="Contraseña (mínimo 8 caracteres)" autocomplete="current-password" style="margin-top:0">
    <button class="btn" id="bin">Entrar</button>
    <button class="btn ghost" id="bup" type="button" style="margin-top:8px">Crear cuenta</button></form>
    <p id="msg">${esc(msg)}</p></div>`;
  const m = t => document.getElementById("msg").textContent = t;
  const datos = () => ({ email: document.getElementById("em").value.trim().toLowerCase(), password: document.getElementById("pw").value });
  const traduce = e => /Invalid login/i.test(e.message) ? "Email o contraseña incorrectos." : /already registered/i.test(e.message) ? "Ese email ya tiene cuenta: pulsa «Entrar»." : /least 8|Password should/i.test(e.message) ? "La contraseña debe tener al menos 8 caracteres." : e.message;
  document.getElementById("f").onsubmit = async ev => {
    ev.preventDefault(); m("Entrando…");
    const { error } = await sb.auth.signInWithPassword(datos());
    if (error) m(traduce(error));
  };
  document.getElementById("bup").onclick = async () => {
    const d = datos();
    if (!d.email || d.password.length < 8) return m("Escribe tu email y una contraseña de al menos 8 caracteres.");
    m("Creando cuenta…");
    const { data, error } = await sb.auth.signUp(d);
    if (error) return m(traduce(error));
    if (!data.session) m("Cuenta creada. Revisa tu correo para confirmarla y luego pulsa «Entrar».");
  };
}
function vPendiente() {
  $app.innerHTML = `<div class="auth"><img class="logo-b" src="logo-navy.svg" alt="DOINN">
  <p>Tu acceso está <b>pendiente de aprobación</b>. Cuando un administrador te dé de alta podrás entrar.</p>
  <button class="btn ghost" id="rl">Volver a comprobar</button></div>`;
  document.getElementById("rl").onclick = () => location.reload();
}
function vProyectos() {
  const q = S.q.toLowerCase();
  let ps = S.proyectos.filter(p => S.verCerrados || p.estado !== "Cerrado");
  if (q) ps = ps.filter(p => [p.codigo, p.nombre, p.cliente, p.front_nombre].some(v => (v || "").toLowerCase().includes(q)));
  const nCerr = S.proyectos.filter(p => p.estado === "Cerrado").length;
  $app.innerHTML = `
  <p class="hint">Ordenados por fecha de carga. Pulsa uno para ver su ficha, sus elementos y la carga.</p>
  <div class="search"><input id="q" placeholder="Buscar por código, proyecto, cliente o Front…" value="${esc(S.q)}">
  ${puede("admin", "front") ? `<button class="btn lime" id="nuevo">+ Nuevo</button>` : ""}</div>
  <button class="link" id="vc">${S.verCerrados ? "Ocultar" : "Ver"} proyectos terminados (${nCerr}) ▾</button>
  ${ps.map(card).join("") || `<div class="empty">No hay proyectos que coincidan.</div>`}`;
  const qi = document.getElementById("q");
  qi.oninput = () => { S.q = qi.value; const pos = qi.selectionStart; vProyectos(); const n = document.getElementById("q"); n.focus(); n.setSelectionRange(pos, pos); };
  document.getElementById("vc").onclick = () => { S.verCerrados = !S.verCerrados; vProyectos(); };
  const nb = document.getElementById("nuevo"); if (nb) nb.onclick = () => location.hash = "#/nuevo";
}
function card(p) {
  const st = stats(p.id), [sl, sc] = salud(p, st), d = dias(p.fecha_carga);
  const cuando = d === null ? "" : d === 0 ? "carga hoy" : d > 0 ? `faltan ${d} días` : `hace ${-d} días`;
  return `<a class="card" href="#/p/${p.id}">
    <div class="pj-top"><div class="pj-name">${esc(p.nombre || p.codigo)}</div><span class="pill ${sc}">${sl}</span></div>
    <div class="pj-meta"><b>${esc(p.codigo)}</b><span>carga ${fd(p.fecha_carga)}</span><span>${esc(p.front_nombre || "—")}</span><span>${st.n} elem.</span><span>${cuando}</span>
    <span style="color:${p.coordinacion_ok ? "var(--lime-d)" : "var(--amber)"}">${p.coordinacion_ok ? "✓ Coordinado" : "Sin coordinar"}</span></div>
    <div class="prog"><div class="bar"><i style="width:${st.av}%"></i></div><span class="pc">${st.av}% avance</span>
    <span class="mini"><span>Doc ${st.doc}%</span><span>Fab ${st.fab}%</span><span>Carga ${st.car}%</span></span></div></a>`;
}
function vProyecto(id, tab = "ficha") {
  const p = S.proyectos.find(x => x.id === +id);
  if (!p) { $app.innerHTML = `<div class="empty">Proyecto no encontrado.</div>`; return; }
  const tabs = [["ficha", "Ficha"], ["elementos", "Elementos"], ["despiece", "Despiece"], ["carga", "Carga"], ["retorno", "Retorno"], ["equipo", "Equipo"]];
  let body = "";
  if (tab === "ficha") body = fichaLectura(p);
  else if (tab === "elementos" || tab === "despiece") body = `<div id="tabc"></div>`;
  else body = `<div class="card empty">Esta pestaña llega en los próximos días. Mientras tanto, usa la app de Power Apps.</div>`;
  $app.innerHTML = `<a class="back" href="#/">‹ Proyectos</a><div class="code">${esc(p.codigo)}</div><h1>${esc(p.nombre || "")}</h1>
  <div class="seg">${tabs.map(([k, l]) => `<a href="#/p/${p.id}/${k}" class="${k === tab ? "on" : ""}">${l}</a>`).join("")}</div>${body}`;
  if (tab === "elementos") { S.dirty = true; vElementos(ctx(), p, document.getElementById("tabc")); }
  if (tab === "despiece") vDespiece(ctx(), p, document.getElementById("tabc"));
}
function fichaLectura(p) {
  const fila = (on, l, a, b, h, ev) => on === false ? "" : `<tr class="${ev ? "ev" : ""}"><td>${l}</td><td>${fd(a)}${b && b !== a ? "–" + fd(b) : ""}</td><td>${esc(h || "—")}</td></tr>`;
  return `<div class="card"><dl class="kv">
    <dt>Front</dt><dd>${esc(p.front_nombre || "—")}</dd>
    <dt>Cliente</dt><dd>${esc(p.cliente || "—")}</dd>
    <dt>Ubicación</dt><dd>${esc(p.ubicacion || "—")}</dd>
    <dt>Ida</dt><dd>${esc(p.transporte_ida || "—")}</dd>
    <dt>Vuelta</dt><dd>${esc(p.transporte_vuelta || p.transporte_ida || "—")}</dd>
    <dt>Vehículo</dt><dd>${esc(p.tipo_vehiculo || "—")}</dd>
    <dt>Necesidades</dt><dd>${esc(p.necesidades || "—")}</dd>
    <dt>Carpeta</dt><dd>${p.carpeta ? `<a href="${esc(p.carpeta)}" target="_blank" rel="noopener" style="color:var(--lime-d)">Abrir en SharePoint ↗</a>` : "—"}</dd>
  </dl></div>
  <div class="card"><table class="f"><tr><th>Fase</th><th>Fecha</th><th>Hora</th></tr>
    ${fila(p.hay_carga, "Carga en fábrica", p.fecha_carga, p.fecha_carga_fin, p.hora_carga)}
    ${fila(p.hay_montaje, "Montaje", p.fecha_montaje, p.fecha_montaje_fin, p.hora_montaje)}
    ${fila(p.hay_evento, "Evento", p.evento_inicio, p.evento_fin, p.hora_evento, true)}
    ${fila(p.hay_desmontaje, "Desmontaje", p.fecha_desmontaje, p.fecha_desmontaje_fin, p.hora_desmontaje)}
    ${fila(p.hay_retorno, "Descarga en fábrica", p.fecha_descarga, p.fecha_descarga_fin, p.hora_descarga)}
  </table></div>
  ${puede("admin", "front") ? `<a class="btn ghost wide" href="#/p/${p.id}/editar">Editar ficha del proyecto</a>` : ""}`;
}
async function vUsuarios() {
  if (!puede("admin")) { $app.innerHTML = `<div class="empty">Solo administradores.</div>`; return; }
  const { data, error } = await sb.from("perfiles").select("*").order("created_at");
  if (error) { $app.innerHTML = `<div class="empty">${esc(error.message)}</div>`; return; }
  const roles = ["lectura", "taller", "ot", "front", "admin"];
  $app.innerHTML = `<h1>Usuarios</h1><p class="hint">Aprueba a quien se registre y asígnale un rol.</p>
  ${data.map(u => `<div class="card u" data-id="${u.user_id}"><div><b>${esc(u.email)}</b><div class="code">${u.aprobado ? "Aprobado" : "Pendiente"}</div></div>
  <div class="row"><select>${roles.map(r => `<option ${r === u.rol ? "selected" : ""}>${r}</option>`).join("")}</select>
  <button class="btn sm ${u.aprobado ? "ghost" : "lime"}">${u.aprobado ? "Quitar" : "Aprobar"}</button></div></div>`).join("")}`;
  $app.querySelectorAll(".u").forEach(el => {
    const id = el.dataset.id, sel = el.querySelector("select"), b = el.querySelector("button");
    sel.onchange = async () => { const { error } = await sb.from("perfiles").update({ rol: sel.value }).eq("user_id", id); toast(error ? error.message : "Rol guardado"); };
    b.onclick = async () => { const ap = b.textContent === "Aprobar"; const { error } = await sb.from("perfiles").update({ aprobado: ap }).eq("user_id", id); if (error) toast(error.message); else vUsuarios(); };
  });
}
function vProximamente(t) {
  $app.innerHTML = `<h1>${t}</h1><div class="card empty">Esta pantalla llega en los próximos días. Mientras tanto, usa la app de Power Apps.</div>`;
}

// ---------- router ----------
async function route() {
  if (!S.user) return;
  const h = location.hash.replace(/^#\/?/, "").split("/");
  document.querySelectorAll("#tabs a").forEach(a => a.classList.toggle("on", (a.dataset.t === (h[0] || "proyectos")) || (h[0] === "p" && a.dataset.t === "proyectos")));
  if (h[0] === "nuevo") return puede("admin", "front") ? vFicha(ctx(), null) : vProyectos();
  if (h[0] === "p" && h[2] === "editar") { const p = S.proyectos.find(x => x.id === +h[1]); return p && puede("admin", "front") ? vFicha(ctx(), p) : vProyecto(h[1]); }
  if (h[0] === "p" && h[2] === "desp") { const p = S.proyectos.find(x => x.id === +h[1]); return p ? vElementoForm(ctx(), p, h[3]) : vProyectos(); }
  if (h[0] === "p" && h[2] === "el") { const p = S.proyectos.find(x => x.id === +h[1]); S.dirty = true; return p ? vElemento(ctx(), p, h[3]) : vProyectos(); }
  if (h[0] === "p") return vProyecto(h[1], h[2] || "ficha");
  if (h[0] === "usuarios") return vUsuarios();
  if (h[0] === "plan") return vProximamente("Planificación");
  if (h[0] === "escanear") return vEscanear(ctx());
  if (h[0] === "muelle") return vProximamente("Muelle");
  if (h[0] === "panel") { if (S.dirty) { S.dirty = false; try { await cargar(); } catch { } } return vPanel(ctx(), h[1] || ""); }
  if (S.dirty) { S.dirty = false; try { await cargar(); } catch { } }
  return vProyectos();
}
window.addEventListener("hashchange", route);

async function arrancar(session) {
  S.user = session?.user || null;
  if (!S.user) return vLogin();
  document.body.classList.remove("noauth");
  const { data: perfil } = await sb.from("perfiles").select("*").eq("user_id", S.user.id).maybeSingle();
  S.perfil = perfil;
  const ini = (S.user.email || "?")[0].toUpperCase();
  $me.innerHTML = `${puede("admin") ? `<a href="#/usuarios" style="font-size:12px;color:#cfd6d6">Usuarios</a>` : ""}<span class="av">${ini}</span><button id="out">Salir</button>`;
  document.getElementById("out").onclick = async () => { await sb.auth.signOut(); location.hash = ""; location.reload(); };
  if (!perfil || !perfil.aprobado) return vPendiente();
  try { await cargar(); } catch (e) { $app.innerHTML = `<div class="empty">Error cargando datos: ${esc(e.message)}</div>`; return; }
  route();
}
sb.auth.onAuthStateChange((ev, session) => { if (ev === "SIGNED_IN" || ev === "SIGNED_OUT" || ev === "INITIAL_SESSION") setTimeout(() => arrancar(session), 0); });
