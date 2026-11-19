import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
// Carga los módulos con la misma versión que app.js (evita versiones viejas en caché)
const V = new URL(import.meta.url).search;
const { CONFIG } = await import("./config.js" + V);
const { vFicha } = await import("./ficha.js" + V);
const { vElementos, vElemento } = await import("./elementos.js" + V);
const { vEscanear } = await import("./escanear.js" + V);
const { vPanel } = await import("./panel.js" + V);
const { vDespiece, vElementoForm } = await import("./despiece.js" + V);
const { vCarga, vRetorno, vMuelle } = await import("./carga.js" + V);
const { vPlan, vEquipo, vTv } = await import("./plan.js" + V);
const { COL_COM, estadoCom, confirmado, riesgos, neonOn } = await import("./estados.js" + V);

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
// Roles: superadmin (todo) · admin (Fronts y OT: proyectos) · taller (estado de producción) · lectura
// puede("admin") incluye al superadmin.
const puede = (...roles) => !!(S.perfil && S.perfil.aprobado && (roles.includes(S.perfil.rol) || (S.perfil.rol === "superadmin" && roles.includes("admin"))));
// Páginas que se pueden ocultar por persona
const PAGINAS = [["proyectos", "Proyectos"], ["plan", "Planificación"], ["escanear", "Escanear"], ["muelle", "Muelle"], ["panel", "Panel"],
  ["ficha", "Ficha"], ["elementos", "Elementos"], ["despiece", "Despiece"], ["carga", "Carga"], ["retorno", "Retorno"], ["equipo", "Equipo"]];
const TODAS = PAGINAS.map(x => x[0]);
const DEF_PAG = {
  superadmin: TODAS, admin: TODAS,
  taller: ["proyectos", "plan", "escanear", "ficha", "elementos"],
  lectura: TODAS.filter(x => x !== "escanear"),
};
const ROLES = [["superadmin", "SuperAdmin · control total"], ["admin", "Admin · proyectos (Fronts y OT)"], ["taller", "Taller · estado de producción"], ["lectura", "Lectura · solo consulta"]];
const pagsDe = (rol, pags) => rol === "superadmin" ? TODAS : (pags && pags.length ? pags : DEF_PAG[rol] || []);
const ver = pg => !!S.perfil && pagsDe(S.perfil.rol, S.perfil.paginas).includes(pg);

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
  if (!puede("admin")) return;
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
    <p>Entra con tu email y tu contraseña. Si te han invitado y es la primera vez, pulsa «Crear cuenta» con el email de la invitación.</p>
    <form id="f"><input id="em" type="email" required placeholder="tu@email.com" autocomplete="email">
    <input id="pw" type="password" required minlength="8" placeholder="Contraseña (mínimo 8 caracteres)" autocomplete="current-password" style="margin-top:0">
    <button class="btn" id="bin">Entrar</button>
    <button class="btn ghost" id="bup" type="button" style="margin-top:8px">Crear cuenta</button></form>
    <p id="msg">${esc(msg)}</p><button class="link" id="bolv" type="button">¿Has olvidado la contraseña?</button></div>`;
  const m = t => document.getElementById("msg").textContent = t;
  const datos = () => ({ email: document.getElementById("em").value.trim().toLowerCase(), password: document.getElementById("pw").value });
  const traduce = e => /Invalid login/i.test(e.message) ? "Email o contraseña incorrectos." : /already registered/i.test(e.message) ? "Ese email ya tiene cuenta: pulsa «Entrar»." : /least 8|Password should/i.test(e.message) ? "La contraseña debe tener al menos 8 caracteres." : /Database error|SIN_INVITACION/i.test(e.message) ? "Ese email no tiene invitación. Pide acceso a un administrador de Doinn." : e.message;
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
  document.getElementById("bolv").onclick = () => vRecuperar(document.getElementById("em").value.trim().toLowerCase());
}
// Recuperar contraseña con código de 6 cifras (sin enlaces: el filtro de Microsoft los consume)
function vRecuperar(email = "") {
  $app.innerHTML = `<div class="auth">
    <img class="logo-b" src="logo-navy.svg" alt="DOINN">
    <p>Te enviamos un <b>código de 6 cifras</b> por correo. Escríbelo aquí junto con tu nueva contraseña.</p>
    <form id="f1"><input id="em" type="email" required placeholder="tu@email.com" value="${esc(email)}" autocomplete="email">
    <button class="btn" id="benv">Enviar código</button></form>
    <form id="f2" hidden><input id="cod" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required placeholder="Código de 6 cifras" autocomplete="one-time-code">
    <input id="pw" type="password" required minlength="8" placeholder="Nueva contraseña (mínimo 8)" autocomplete="new-password" style="margin-top:0">
    <button class="btn">Cambiar contraseña</button></form>
    <p id="msg"></p><button class="link" id="bvol" type="button">Volver</button></div>`;
  const $ = id => document.getElementById(id);
  const m = t => { const e = $("msg"); if (e) e.textContent = t; };
  $("bvol").onclick = () => vLogin();
  $("f1").onsubmit = async ev => {
    ev.preventDefault(); m("Enviando…");
    const { error } = await sb.auth.resetPasswordForEmail($("em").value.trim().toLowerCase());
    if (error) return m(/rate limit|seconds/i.test(error.message) ? "Espera un minuto antes de pedir otro código." : error.message);
    $("f1").hidden = true; $("f2").hidden = false; $("cod").focus();
    m("Código enviado a " + $("em").value + ". Mira también en correo no deseado.");
  };
  $("f2").onsubmit = async ev => {
    ev.preventDefault(); m("Comprobando…");
    const email = $("em").value.trim().toLowerCase(), password = $("pw").value;
    S.recuperando = true;
    const { error } = await sb.auth.verifyOtp({ email, token: $("cod").value.trim(), type: "recovery" });
    if (error) { S.recuperando = false; return m(/expired|invalid/i.test(error.message) ? "Código incorrecto o caducado. Pide otro." : error.message); }
    const r = await sb.auth.updateUser({ password });
    S.recuperando = false;
    toast(r.error ? "No se pudo cambiar: " + r.error.message : "Contraseña cambiada");
    arrancar((await sb.auth.getSession()).data.session);
  };
}
function vPendiente() {
  $app.innerHTML = `<div class="auth"><img class="logo-b" src="logo-navy.svg" alt="DOINN">
  <p>Tu acceso a la app está <b>desactivado</b>. Si crees que es un error, habla con el administrador.</p>
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
  ${puede("admin") ? `<button class="btn lime" id="nuevo">+ Nuevo</button>` : ""}</div>
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
    <div class="pj-top"><div class="pj-name">${esc(p.nombre || p.codigo)}</div><span class="row" style="gap:6px">${!confirmado(p) ? `<span class="pill" style="background:${COL_COM[estadoCom(p)]}33;color:var(--ink)">${estadoCom(p)}</span>` : ""}<span class="pill ${sc}">${sl}</span></span></div>
    <div class="pj-meta"><b>${esc(p.codigo)}</b><span>carga ${fd(p.fecha_carga)}</span><span>${esc(p.front_nombre || "—")}</span><span>${st.n} elem.</span><span>${cuando}</span>
    <span style="color:${p.coordinacion_ok ? "var(--lime-d)" : "var(--amber)"}">${p.coordinacion_ok ? "✓ Coordinado" : "Sin coordinar"}</span></div>
    <div class="prog"><div class="bar"><i style="width:${st.av}%"></i></div><span class="pc">${st.av}% avance</span>
    <span class="mini"><span>Doc ${st.doc}%</span><span>Fab ${st.fab}%</span><span>Carga ${st.car}%</span></span></div>
    ${(rs => rs.length ? `<div class="pj-warn" title="${esc(rs.join("\n"))}">⚠ ${esc(rs[0])}${rs.length > 1 ? ` <b>+${rs.length - 1}</b>` : ""}</div>` : "")(riesgos(p, st.n))}</a>`;
}
function vProyecto(id, tab = "ficha") {
  const p = S.proyectos.find(x => x.id === +id);
  if (!p) { $app.innerHTML = `<div class="empty">Proyecto no encontrado.</div>`; return; }
  const tabs = [["ficha", "Ficha"], ["elementos", "Elementos"], ["despiece", "Despiece"], ["carga", "Carga"], ["retorno", "Retorno"], ["equipo", "Equipo"]].filter(([k]) => ver(k));
  if (!tabs.length) { $app.innerHTML = `<div class="empty">No tienes acceso a las fichas de proyecto.</div>`; return; }
  if (!tabs.some(([k]) => k === tab)) tab = tabs[0][0];
  let body = "";
  if (tab === "ficha") body = fichaLectura(p);
  else if (["elementos", "despiece", "carga", "retorno", "equipo"].includes(tab)) body = `<div id="tabc"></div>`;
  else body = `<div class="card empty">Esta pestaña llega en los próximos días.</div>`;
  $app.innerHTML = `<a class="back" href="#/">‹ Proyectos</a><div class="code">${esc(p.codigo)}</div><h1>${esc(p.nombre || "")}</h1>
  <div class="seg">${tabs.map(([k, l]) => `<a href="#/p/${p.id}/${k}" class="${k === tab ? "on" : ""}">${l}</a>`).join("")}</div>${body}`;
  if (tab === "elementos") { S.dirty = true; vElementos(ctx(), p, document.getElementById("tabc")); }
  if (tab === "despiece") vDespiece(ctx(), p, document.getElementById("tabc"));
  if (tab === "carga") vCarga(ctx(), p, document.getElementById("tabc"));
  if (tab === "retorno") vRetorno(ctx(), p, document.getElementById("tabc"));
  if (tab === "equipo") vEquipo(ctx(), p, document.getElementById("tabc"));
}
const opNom = id => (id && (S.operarios.find(o => o.id === id) || {}).nombre) || "—";
function fichaLectura(p) {
  const rs = riesgos(p, S.elementos.filter(e => e.proyecto_id === p.id).length);
  const fila = (on, l, a, b, h, ev) => on === false ? "" : `<tr class="${ev ? "ev" : ""}"><td>${l}</td><td>${fd(a)}${b && b !== a ? "–" + fd(b) : ""}</td><td>${esc(h || "—")}</td></tr>`;
  return `${rs.length ? `<div class="card avisos ${neonOn() ? "neon" : ""}">${rs.map(r => `<div>⚠ ${esc(r)}</div>`).join("")}</div>` : ""}<div class="card"><dl class="kv">
    <dt>Estado</dt><dd><span class="pill" style="background:${COL_COM[estadoCom(p)]}26;color:var(--ink)">${estadoCom(p)}</span></dd>
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
  ${puede("admin") ? `<a class="btn ghost wide" href="#/p/${p.id}/editar">Editar ficha del proyecto</a>` : ""}`;
}
async function vUsuarios() {
  if (!puede("superadmin")) { $app.innerHTML = `<div class="empty">Solo el SuperAdmin gestiona usuarios.</div>`; return; }
  const [u, inv] = await Promise.all([sb.from("perfiles").select("*").order("email"), sb.from("invitaciones").select("*").is("usada", null).order("creada")]);
  if (u.error || inv.error) { $app.innerHTML = `<div class="empty">${esc((u.error || inv.error).message)}</div>`; return; }
  const optRol = r => ROLES.map(([k, l]) => `<option value="${k}" ${k === r ? "selected" : ""}>${l}</option>`).join("");
  const checks = (rol, pags, pref) => rol === "superadmin" ? `<div class="code">Ve todas las páginas.</div>` :
    `<div class="pgs">${PAGINAS.map(([k, l]) => `<label class="pg"><input type="checkbox" data-${pref}="${k}" ${pagsDe(rol, pags).includes(k) ? "checked" : ""}> ${l}</label>`).join("")}</div>`;
  const ops = S.operarios.filter(o => o.activo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const selOp = (id, val) => `<select ${id}><option value="">— Sin vincular —</option>${ops.map(o => `<option value="${o.id}" ${o.id === val ? "selected" : ""}>${esc(o.nombre)} · ${esc(o.grupo || "")}</option>`).join("")}</select>`;
  const opNomU = id => (S.operarios.find(o => o.id === id) || {}).nombre;
  const leeChecks = (el, pref) => [...el.querySelectorAll(`[data-${pref}]`)].filter(c => c.checked).map(c => c.dataset[pref]);
  const yo = S.user.id;
  $app.innerHTML = `<h1>Usuarios</h1>
  <p class="hint">Solo entran las personas invitadas. Invita con su email, elige el rol y qué páginas ve. Después envíale el enlace de la app: entra con «Crear cuenta» usando ese mismo email.</p>
  <form id="finv" class="card frm"><h2>+ Invitar</h2>
    <div class="two"><label>Email<input id="iem" type="email" required placeholder="nombre@doinn.es"></label>
    <label>Nombre<input id="inom" placeholder="Nombre y primer apellido"></label></div>
    <div class="two"><label>Rol<select id="irol">${optRol("taller")}</select></label>
    <label>Su ficha en planificación${selOp('id="iop"', null)}</label></div>
    <label class="pg" style="margin:4px 0 8px"><input type="checkbox" id="igt"> Gestiona al personal de taller (puede marcar días de todo el taller, como el encargado o el team leader)</label>
    <div class="code" style="margin:6px 0 4px">Páginas que verá</div><div id="ipg">${checks("taller", null, "ip")}</div>
    <button class="btn lime wide">Guardar invitación</button></form>
  ${inv.data.length ? `<div class="card"><h2>Invitaciones pendientes <small class="code">${inv.data.length}</small></h2>${inv.data.map(x => `<div class="crow"><div><b>${esc(x.email)}</b> <span class="pill">${esc(x.rol)}</span><div class="code">${esc(x.nombre || "")}${x.operario_id ? " · ficha: " + esc(opNomU(x.operario_id) || "") : ""}${x.gestiona_taller ? " · gestiona taller" : ""} · aún no ha creado su cuenta</div></div><button class="link" data-idel="${esc(x.email)}">Anular</button></div>`).join("")}</div>` : ""}
  <h2 style="margin-top:18px">Con acceso</h2>
  ${u.data.map(x => `<div class="card u" data-id="${x.user_id}"><div class="crow" style="border:0;padding:0"><div><b>${esc(x.nombre || x.email)}</b><div class="code">${esc(x.email)} · ${x.aprobado ? "Activo" : "Sin acceso"}${x.operario_id ? " · ficha: " + esc(opNomU(x.operario_id) || "") : " · sin ficha vinculada"}${x.gestiona_taller ? " · gestiona taller" : ""}</div></div>
    ${x.user_id === yo ? `<span class="pill">Tú</span>` : `<button class="btn sm ${x.aprobado ? "ghost" : "lime"}" data-acc>${x.aprobado ? "Quitar acceso" : "Dar acceso"}</button>`}</div>
    ${x.user_id === yo ? "" : `<div class="two frm" style="margin-top:8px"><label>Rol<select data-rol>${optRol(x.rol)}</select></label><label>Su ficha en planificación${selOp("data-op", x.operario_id)}</label></div>
    <label class="pg" style="margin:6px 0"><input type="checkbox" data-gt ${x.gestiona_taller ? "checked" : ""}> Gestiona al personal de taller</label>
    <details><summary class="link">Páginas que ve</summary><div data-pgs>${checks(x.rol, x.paginas, "up")}</div><button class="btn sm" data-gpg>Guardar páginas</button></details>`}</div>`).join("")}`;
  const $ = id => document.getElementById(id);
  $("irol").onchange = () => $("ipg").innerHTML = checks($("irol").value, null, "ip");
  $("finv").onsubmit = async ev => {
    ev.preventDefault();
    const rol = $("irol").value, pags = rol === "superadmin" ? null : leeChecks($("ipg"), "ip");
    const row = { email: $("iem").value.trim().toLowerCase(), nombre: $("inom").value.trim() || null, rol, paginas: pags, invitado_por: S.user.email, usada: null, operario_id: $("iop").value ? +$("iop").value : null, gestiona_taller: $("igt").checked };
    if (u.data.some(x => x.email === row.email)) return toast("Ese email ya tiene cuenta: cambia su rol abajo.");
    const { error } = await sb.from("invitaciones").upsert(row);
    if (error) return toast(error.message);
    toast("Invitación guardada. Envíale el enlace de la app."); vUsuarios();
  };
  $app.querySelectorAll("[data-idel]").forEach(b => b.onclick = async () => { await sb.from("invitaciones").delete().eq("email", b.dataset.idel); vUsuarios(); });
  $app.querySelectorAll(".u").forEach(el => {
    const id = el.dataset.id, x = u.data.find(z => z.user_id === id);
    const upd = async (c, msg) => { const { error } = await sb.from("perfiles").update(c).eq("user_id", id); toast(error ? error.message : msg); if (!error) vUsuarios(); };
    const a = el.querySelector("[data-acc]"); if (a) a.onclick = () => upd({ aprobado: !x.aprobado }, x.aprobado ? "Acceso retirado" : "Acceso activado");
    const r = el.querySelector("[data-rol]"); if (r) r.onchange = () => upd({ rol: r.value, paginas: null }, "Rol guardado (páginas por defecto del rol)");
    const so = el.querySelector("[data-op]"); if (so) so.onchange = () => upd({ operario_id: so.value ? +so.value : null }, "Ficha vinculada");
    const gt = el.querySelector("[data-gt]"); if (gt) gt.onchange = () => upd({ gestiona_taller: gt.checked }, gt.checked ? "Ahora gestiona al personal de taller" : "Ya no gestiona al personal de taller");
    const g = el.querySelector("[data-gpg]"); if (g) g.onclick = () => upd({ paginas: leeChecks(el.querySelector("[data-pgs]"), "up") }, "Páginas guardadas");
  });
}
function vProximamente(t) {
  $app.innerHTML = `<h1>${t}</h1><div class="card empty">Esta pantalla llega en los próximos días.</div>`;
}

// ---------- router ----------
async function route() {
  if (!S.user) return;
  const h = location.hash.replace(/^#\/?/, "").split("/");
  document.querySelectorAll("#tabs a").forEach(a => a.classList.toggle("on", (a.dataset.t === (h[0] || "proyectos")) || (h[0] === "p" && a.dataset.t === "proyectos")));
  document.querySelectorAll("#tabs a").forEach(a => a.hidden = !ver(a.dataset.t));
  const pag = h[0] === "p" ? (h[2] && ["editar", "desp", "el"].includes(h[2]) ? (h[2] === "editar" ? "ficha" : h[2] === "desp" ? "despiece" : "elementos") : null) : (h[0] === "tv" ? "plan" : h[0] || "proyectos");
  if (pag && pag !== "usuarios" && pag !== "nuevo" && !ver(pag)) { const pri = TODAS.find(x => ver(x) && ["proyectos", "plan", "escanear", "muelle", "panel"].includes(x)); if (pri && pri !== pag) { location.hash = pri === "proyectos" ? "#/" : "#/" + pri; return; } $app.innerHTML = `<div class="empty">No tienes acceso a esta página.</div>`; return; }
  if (h[0] === "nuevo") return puede("admin") ? vFicha(ctx(), null) : vProyectos();
  if (h[0] === "p" && h[2] === "editar") { const p = S.proyectos.find(x => x.id === +h[1]); return p && puede("admin") ? vFicha(ctx(), p) : vProyecto(h[1]); }
  if (h[0] === "p" && h[2] === "desp") { const p = S.proyectos.find(x => x.id === +h[1]); return p ? vElementoForm(ctx(), p, h[3]) : vProyectos(); }
  if (h[0] === "p" && h[2] === "el") { const p = S.proyectos.find(x => x.id === +h[1]); S.dirty = true; return p ? vElemento(ctx(), p, h[3]) : vProyectos(); }
  if (h[0] === "p") return vProyecto(h[1], h[2] || "ficha");
  if (h[0] === "usuarios") return vUsuarios();
  if (h[0] === "plan") return vPlan(ctx(), h[1] || "proyectos", h[2] || "");
  if (h[0] === "tv") return vTv(ctx());
  if (h[0] === "escanear") return vEscanear(ctx());
  if (h[0] === "muelle") return vMuelle(ctx(), h[1] || "");
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
  $me.innerHTML = `${puede("superadmin") ? `<a href="#/usuarios" style="font-size:12px;color:#cfd6d6">Usuarios</a>` : ""}<span class="av">${ini}</span><button id="out">Salir</button>`;
  document.getElementById("out").onclick = async () => { await sb.auth.signOut(); location.hash = ""; location.reload(); };
  if (!perfil || !perfil.aprobado) return vPendiente();
  try { await cargar(); } catch (e) { $app.innerHTML = `<div class="empty">Error cargando datos: ${esc(e.message)}</div>`; return; }
  route();
}
sb.auth.onAuthStateChange((ev, session) => { if (S.recuperando) return; if (ev === "SIGNED_IN" || ev === "SIGNED_OUT" || ev === "INITIAL_SESSION") setTimeout(() => arrancar(session), 0); });
