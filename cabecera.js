// Cabecera: fecha y hora, navegación de fechas, sesión, «Más opciones» (tema, avisos, auto-ocultar, ancho de columnas) y Mi perfil.
// Lo que no cabe en la barra pasa al menú de tres puntos (por CSS, según el ancho de pantalla).
const V = new URL(import.meta.url).search;
const { neonOn, setNeon } = await import("./estados.js" + V);

const ROL_TXT = { superadmin: "SuperAdmin", admin: "Admin", taller: "Taller", lectura: "Lectura" };
const ZOOM_TXT = ["2 sem", "4 sem", "6 sem", "12 sem"];
const ls = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } } };
const $ = id => document.getElementById(id);
const ic = {
  ant: `<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>`, sig: `<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>`,
  mas: `<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>`,
  perfil: `<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>`,
  sol: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
  luna: `<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`,
  aviso: `<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg>`,
  avisoNo: `<svg viewBox="0 0 24 24"><path d="M13.7 21a2 2 0 0 1-3.4 0M18.6 13A17 17 0 0 1 18 8M6.3 6.3A6 6 0 0 0 6 8c0 7-3 9-3 9h14M18 8a6 6 0 0 0-9.3-5M2 2l20 20"/></svg>`,
  ocultar: `<svg viewBox="0 0 24 24"><path d="M4 6h16M8 11l4-4 4 4M12 7v12"/></svg>`,
  salir: `<svg viewBox="0 0 24 24"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l4-4-4-4M14 12H4"/></svg>`,
};

let api = null, nav = null;

export function temaActual() { return ls.get("doinn_tema", "claro"); }
export function aplicaTema() { document.documentElement.dataset.theme = temaActual() === "oscuro" ? "dark" : "light"; }
aplicaTema();

// Se llama una vez al arrancar la app
export function iniciaCabecera(a) {
  api = a;
  const top = $("top");
  top.innerHTML = `<a class="logo" href="#/"><img src="logo-white.svg" alt="DOINN"></a>
    <div class="hd-clock" id="hclock"></div>
    <div class="hd-nav" id="hnav"></div>
    <div class="hd-sp"></div>
    <div class="hd-opts" id="hopts"></div>
    <div class="me" id="me"></div>
    <button class="hd-more" id="hmore" aria-label="Más opciones" title="Más opciones">${ic.mas}</button>`;
  reloj(); setInterval(reloj, 15000);
  $("hmore").onclick = e => { e.stopPropagation(); menu(); };
  autoOcultar(ls.get("doinn_autohide", false));
  let tHide;
  document.addEventListener("mousemove", e => { if (!document.body.classList.contains("autohide")) return; if (e.clientY < 10) { top.classList.add("show"); clearTimeout(tHide); } });
  top.addEventListener("mouseleave", () => { if (!document.body.classList.contains("autohide")) return; clearTimeout(tHide); tHide = setTimeout(() => { if (!document.querySelector(".hd-menu")) top.classList.remove("show"); }, 700); });
  $("hpeek").onclick = () => top.classList.toggle("show");
  pintaOpts();
}

// Opciones a la vista (cuando no caben, están en el menú ⋮)
function pintaOpts() {
  const el = $("hopts"); if (!el || !api) return;
  const { S } = api;
  const z = S.zoom == null ? ls.get("doinn_plan_zoom", 2) : S.zoom;
  const oscuro = temaActual() === "oscuro", neon = neonOn(), auto = document.body.classList.contains("autohide");
  el.innerHTML = `${nav && nav.zoom ? `<span class="hd-zoom" title="Ancho de las columnas de día"><button data-o="z-" ${z <= 0 ? "disabled" : ""}>−</button><b>${ZOOM_TXT[z]}</b><button data-o="z+" ${z >= ZOOM_TXT.length - 1 ? "disabled" : ""}>+</button></span>` : ""}
    <button class="hd-ic" data-o="tema" title="${oscuro ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}">${oscuro ? ic.sol : ic.luna}</button>
    <button class="hd-ic ${neon ? "" : "off"}" data-o="neon" title="${neon ? "Apagar avisos parpadeantes" : "Encender avisos parpadeantes"}">${neon ? ic.aviso : ic.avisoNo}</button>
    <button class="hd-ic ${auto ? "on" : ""}" data-o="auto" title="${auto ? "Dejar la cabecera fija" : "Auto-ocultar cabecera"}">${ic.ocultar}</button>`;
  el.querySelectorAll("[data-o]").forEach(b => b.onclick = e => {
    e.stopPropagation();
    const o = b.dataset.o;
    if (o === "tema") { ls.set("doinn_tema", oscuro ? "claro" : "oscuro"); aplicaTema(); }
    if (o === "neon") { setNeon(!neon); api.rerender(); }
    if (o === "auto") { ls.set("doinn_autohide", !auto); autoOcultar(!auto); }
    if (o === "z-" || o === "z+") { S.zoom = Math.min(ZOOM_TXT.length - 1, Math.max(0, z + (o === "z+" ? 1 : -1))); ls.set("doinn_plan_zoom", S.zoom); api.rerender(); }
    pintaOpts();
  });
}

function reloj() {
  const d = new Date();
  const h = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  const f = d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" }).replace(".", "");
  const el = $("hclock"); if (el) el.innerHTML = `<b>${h}</b><span>${f[0].toUpperCase() + f.slice(1)}</span>`;
}

// Sesión (tras entrar). Sin usuario: vacía.
// Páginas del menú ⋯ (herramientas), en orden
const herrs = () => [
  api?.verInv?.() && ["#/inventario", "▤ Inventario"],
  api?.verPres?.() && ["#/presupuestos", "€ Presupuestador"],
  api?.verHerr?.() && ["#/melamina", "▦ Calculadora de melamina"],
].filter(Boolean);

export function pintaUsuario() {
  const { S, esc, puede } = api;
  const me = $("me");
  if (!S.user || !S.perfil) { me.innerHTML = ""; return; }
  const nom = S.perfil.nombre || (S.user.email || "").split("@")[0];
  me.innerHTML = `<button class="hd-user" id="hperfil" title="Mi perfil"><span class="av">${esc((nom[0] || "?").toUpperCase())}</span>
      <span class="hd-un"><b>${esc(nom)}</b><i class="rol">${ROL_TXT[S.perfil.rol] || S.perfil.rol}</i></span></button>
    ${herrs().length ? `<span class="hd-tools"><button class="hd-dots" id="hdots" title="Más herramientas" aria-label="Más herramientas">⋯</button></span>` : ""}
    ${puede("superadmin") ? `<a class="hd-lnk" href="#/usuarios">Usuarios</a>` : ""}
    <button class="hd-out" id="hout" title="Cerrar sesión">${ic.salir}<span>Cerrar sesión</span></button>`;
  $("hperfil").onclick = miPerfil;
  const dots = $("hdots");
  if (dots) dots.onclick = e => {
    e.stopPropagation();
    const w = dots.parentElement, old = w.querySelector(".hd-dd");
    if (old) return old.remove();
    w.insertAdjacentHTML("beforeend", `<div class="hd-dd">${herrs().map(([h, t]) => `<a href="${h}">${t}</a>`).join("")}</div>`);
    const cierra = () => { w.querySelector(".hd-dd")?.remove(); document.removeEventListener("click", cierra); };
    setTimeout(() => document.addEventListener("click", cierra), 0);
  };
  $("hout").onclick = salir;
}

// Navegación de fechas de la pantalla actual: { label, prev, next, hoy } (enlaces) o null
export function pintaNav(n) {
  nav = n;
  const el = $("hnav"); if (!el) return;
  pintaOpts();
  el.innerHTML = n ? `<a class="hd-ar" href="${n.prev}" title="Anterior">${ic.ant}</a><span class="hd-lab">${n.label}</span><a class="hd-ar" href="${n.next}" title="Siguiente">${ic.sig}</a><a class="hd-hoy" href="${n.hoy}">Hoy</a>` : "";
}

async function salir() { await api.sb.auth.signOut(); location.hash = ""; location.reload(); }

function menu() {
  const ya = document.querySelector(".hd-menu"); if (ya) { ya.remove(); return; }
  const { S, esc, puede } = api;
  const nom = S.perfil ? (S.perfil.nombre || (S.user.email || "").split("@")[0]) : "";
  const z = S.zoom == null ? ls.get("doinn_plan_zoom", 2) : S.zoom;
  const m = document.createElement("div"); m.className = "hd-menu";
  const d = new Date();
  m.innerHTML = `
    <div class="m-x m-clock"><b>${d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</b> ${d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
    ${nav ? `<div class="m-x m-nav"><a class="hd-ar" href="${nav.prev}">${ic.ant}</a><span>${nav.label}</span><a class="hd-ar" href="${nav.next}">${ic.sig}</a><a class="hd-hoy" href="${nav.hoy}">Hoy</a></div>` : ""}
    ${S.perfil ? `<div class="m-x m-user"><div><b>${esc(nom)}</b> <i class="rol">${ROL_TXT[S.perfil.rol] || S.perfil.rol}</i><div class="code">${esc(S.user.email || "")}</div></div>
      <div class="m-acts"><button class="m-btn" data-a="perfil">${ic.perfil} Mi perfil</button>${puede("superadmin") ? `<a class="m-btn" href="#/usuarios">Usuarios</a>` : ""}<button class="m-btn" data-a="salir">${ic.salir} Cerrar sesión</button></div></div>` : ""}
    ${S.perfil && puede("superadmin") ? `<div class="m-x m-usu"><a href="#/usuarios">Gestión de usuarios ›</a></div>` : ""}
    ${S.perfil && herrs().length ? `<div class="m-x m-herr"><div class="code">Herramientas</div>${herrs().map(([h, t]) => `<a class="m-btn" href="${h}">${t}</a>`).join("")}</div>` : ""}
    <div class="m-opts">
    <label class="m-row"><span>Tema oscuro</span><input type="checkbox" class="sw" data-a="tema" ${temaActual() === "oscuro" ? "checked" : ""}></label>
    <label class="m-row"><span>Avisos parpadeantes</span><input type="checkbox" class="sw" data-a="neon" ${neonOn() ? "checked" : ""}></label>
    <label class="m-row"><span>Auto-ocultar cabecera</span><input type="checkbox" class="sw" data-a="auto" ${document.body.classList.contains("autohide") ? "checked" : ""}></label>
    <div class="m-row"><span>Ancho de las columnas de día</span><span class="m-zoom"><button data-a="z-" ${z <= 0 ? "disabled" : ""}>−</button><b>${ZOOM_TXT[z]}</b><button data-a="z+" ${z >= ZOOM_TXT.length - 1 ? "disabled" : ""}>+</button></span></div></div>`;
  document.body.appendChild(m);
  const cierra = () => { m.remove(); document.removeEventListener("click", fuera); pintaOpts(); };
  const fuera = e => { if (!m.contains(e.target)) cierra(); };
  setTimeout(() => document.addEventListener("click", fuera), 0);
  m.querySelectorAll("a").forEach(a => a.addEventListener("click", cierra));
  m.querySelector('[data-a="tema"]').onchange = e => { ls.set("doinn_tema", e.target.checked ? "oscuro" : "claro"); aplicaTema(); };
  m.querySelector('[data-a="neon"]').onchange = e => { setNeon(e.target.checked); api.rerender(); };
  m.querySelector('[data-a="auto"]').onchange = e => { ls.set("doinn_autohide", e.target.checked); autoOcultar(e.target.checked); };
  m.querySelectorAll('[data-a="z-"],[data-a="z+"]').forEach(b => b.onclick = () => {
    const nz = Math.min(ZOOM_TXT.length - 1, Math.max(0, z + (b.dataset.a === "z+" ? 1 : -1)));
    S.zoom = nz; ls.set("doinn_plan_zoom", nz); cierra(); api.rerender();
  });
  const bp = m.querySelector('[data-a="perfil"]'); if (bp) bp.onclick = () => { cierra(); miPerfil(); };
  const bs = m.querySelector('[data-a="salir"]'); if (bs) bs.onclick = salir;
}

function autoOcultar(on) {
  document.body.classList.toggle("autohide", !!on);
  $("top").classList.remove("show");
}

function miPerfil() {
  const { S, sb, esc, toast } = api;
  const p = S.perfil || {};
  const ficha = p.operario_id ? (S.operarios.find(o => o.id === p.operario_id) || {}).nombre : null;
  const m = document.createElement("div"); m.className = "modal";
  m.innerHTML = `<div class="card mbox perfil">
    <div class="row" style="justify-content:space-between"><h2 style="margin:0">Mi perfil</h2><button class="link" id="px">Cerrar ✕</button></div>
    <div class="pf-sec"><div class="code">USUARIO</div><b>${esc(S.user.email || "")}</b>${p.nombre ? `<div>${esc(p.nombre)}</div>` : ""}
      <div style="margin-top:6px"><i class="rol">${ROL_TXT[p.rol] || p.rol || ""}</i>${p.gestiona_taller ? ` <i class="rol">Gestiona taller</i>` : ""}</div>
      ${ficha ? `<div class="code" style="margin-top:6px">Ficha en planificación: ${esc(ficha)}</div>` : ""}</div>
    <form class="pf-sec frm" id="pfpw"><b>Contraseña</b>
      <label>Nueva contraseña<input type="password" id="pw1" minlength="8" required autocomplete="new-password"></label>
      <label>Repite la contraseña<input type="password" id="pw2" minlength="8" required autocomplete="new-password"></label>
      <button class="btn sm">Cambiar contraseña</button></form>
    <div class="pf-sec"><b>Sesiones</b><p class="hint" style="margin:4px 0 8px">Si has entrado desde un dispositivo que no es tuyo, cierra la sesión en todos.</p>
      <button class="btn sm red" id="pfall">Cerrar sesión en todos los dispositivos</button></div>
  </div>`;
  document.body.appendChild(m);
  const cierra = () => m.remove();
  m.onclick = e => { if (e.target === m) cierra(); };
  m.querySelector("#px").onclick = cierra;
  m.querySelector("#pfpw").onsubmit = async ev => {
    ev.preventDefault();
    const a = m.querySelector("#pw1").value, b = m.querySelector("#pw2").value;
    if (a !== b) return toast("Las contraseñas no coinciden");
    const { error } = await sb.auth.updateUser({ password: a });
    if (error) return toast(/different from the old/i.test(error.message) ? "La nueva contraseña debe ser distinta de la actual" : error.message);
    toast("Contraseña cambiada"); cierra();
  };
  m.querySelector("#pfall").onclick = async () => {
    if (!confirm("¿Cerrar la sesión en todos los dispositivos, incluido este?")) return;
    await sb.auth.signOut({ scope: "global" }); location.hash = ""; location.reload();
  };
}
