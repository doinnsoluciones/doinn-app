// Alta y edición de la ficha de proyecto (cuadrícula de fechas)
const HORAS = ["—", ...Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`)];
const ESTADOS = ["En preparación", "En taller", "Cargado", "Cerrado"];
const ESTADOS_COM = ["Presupuestado", "Pre-confirmado", "Confirmado", "Pospuesto", "Cancelado"];
const MAY = s => (s ?? "").trim().toUpperCase();
const sumaDias = (s, n) => { if (!s) return null; const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE"); };

// Limpia el enlace de SharePoint ("Copiar vínculo" o barra de direcciones) a una ruta directa
export function limpiaCarpeta(u) {
  u = (u || "").trim();
  if (!u) return null;
  try {
    const url = new URL(u);
    const id = url.searchParams.get("id");
    let out = id ? url.origin + id : url.origin + url.pathname.replace("/:f:/r/", "/").replace(/\/:[a-z]:\/[rs]\//, "/");
    out = decodeURIComponent(out);
    return out.length > 1000 ? out.slice(0, 1000) : out;
  } catch { return u; }
}

// Borrador automático: lo que se va escribiendo se guarda en el navegador y se recupera si la página se recarga
const BKEY = p => "doinn_borrador_ficha_" + (p && p.id ? p.id : "nuevo");
const lsB = { get: k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } }, del: k => { try { localStorage.removeItem(k); } catch { } } };
function borrador(form, key, avisoEl) {
  const campos = () => [...form.querySelectorAll("input[id],select[id],textarea[id]")];
  const guarda = () => { const d = {}; campos().forEach(el => d[el.id] = el.type === "checkbox" ? el.checked : el.value); lsB.set(key, { t: Date.now(), d }); };
  const b = lsB.get(key);
  if (b && b.d && Date.now() - b.t < 7 * 864e5) {
    campos().forEach(el => { if (!(el.id in b.d)) return; if (el.type === "checkbox") el.checked = b.d[el.id]; else el.value = b.d[el.id]; });
    campos().filter(el => el.type === "checkbox").forEach(el => el.dispatchEvent(new Event("change")));
    if (avisoEl) { avisoEl.hidden = false; avisoEl.querySelector("button").onclick = () => { lsB.del(key); location.reload(); }; }
  }
  form.addEventListener("input", guarda); form.addEventListener("change", guarda);
  return () => lsB.del(key);
}

const FASES = [
  // clave, etiqueta, hay, desde, hasta, hora, transporte
  ["carga", "Carga", "hay_carga", "fecha_carga", "fecha_carga_fin", "hora_carga", "transporte_ida"],
  ["montaje", "Montaje", "hay_montaje", "fecha_montaje", "fecha_montaje_fin", "hora_montaje", null],
  ["evento", "Evento", "hay_evento", "evento_inicio", "evento_fin", "hora_evento", null],
  ["desmontaje", "Desmontaje", "hay_desmontaje", "fecha_desmontaje", "fecha_desmontaje_fin", "hora_desmontaje", null],
  ["descarga", "Descarga", "hay_retorno", "fecha_descarga", "fecha_descarga_fin", "hora_descarga", "transporte_vuelta"],
];

export function vFicha(ctx, p) {
  const { $app, S, sb, esc, toast, puede, recargar } = ctx;
  const nuevo = !p;
  p = p || { estado: "En preparación", estado_com: "Confirmado", hay_carga: true, hay_montaje: true, hay_evento: true, hay_desmontaje: true, hay_retorno: true };
  const fronts = S.operarios.filter(o => o.grupo === "Fronts" && o.activo !== false);
  const v = k => esc(p[k] ?? "");
  const sel = (id, ops, val) => `<select id="${id}">${ops.map(o => `<option ${o === (val || "—") ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  const filas = FASES.map(([k, l, hay, d1, d2, h, t]) => `
    <div class="g-row" data-k="${k}">
      <div class="g-l">${l}${k === "carga" ? ' <span class="req">*</span>' : ""}</div>
      <label class="tg"><input type="checkbox" id="${hay}" ${p[hay] !== false ? "checked" : ""}><span></span><b>${p[hay] !== false ? "Sí" : "No"}</b></label>
      <input type="date" id="${d1}" value="${v(d1)}">
      <input type="date" id="${d2}" value="${v(d2)}" placeholder="Hasta">
      ${sel(h, HORAS, p[h])}
      ${t ? `<input id="${t}" value="${v(t)}" placeholder="${k === "descarga" ? "Igual que ida" : "Transporte"}">` : `<div class="g-na">—</div>`}
    </div>`).join("");

  $app.innerHTML = `
  <a class="back" href="${nuevo ? "#/" : `#/p/${p.id}`}">‹ ${nuevo ? "Proyectos" : "Ficha"}</a>
  <h1>${nuevo ? "Nuevo proyecto" : "Ficha " + esc(p.codigo)}</h1>
  <p class="hint">Los campos con * son obligatorios. El resto puedes completarlo más adelante. Lo que escribas se guarda como borrador hasta que pulses Guardar.</p>
  <div class="borr" id="borr" hidden>Hemos recuperado lo que tenías sin guardar. <button type="button" class="link">Descartar borrador</button></div>
  <form id="ff" autocomplete="off">
  <div class="card frm">
    <h2>1 · Proyecto</h2>
    <label>Código * <small>formato AAMMDD.NN (fecha del evento)</small><input id="codigo" value="${v("codigo")}" placeholder="261123.01" required pattern="\\d{6}\\.\\d{2}"></label>
    <label>Nombre del proyecto *<input id="nombre" value="${v("nombre")}" required></label>
    <label>Cliente / agencia<input id="cliente" value="${v("cliente")}"></label>
    <div class="two">
      <label>Front *<select id="front_id" required><option value="">Elige…</option>${fronts.map(o => `<option value="${o.id}" ${o.id === p.front_id ? "selected" : ""}>${esc(o.nombre)}</option>`).join("")}</select></label>
      <label>Estado comercial${sel("estado_com", ESTADOS_COM, p.estado_com || "Confirmado")}</label>
    </div>
    <label>Estado de producción${sel("estado", ESTADOS, p.estado)}</label>
    <label>Carpeta del proyecto <small>pega el enlace de SharePoint</small><input id="carpeta" value="${v("carpeta")}" placeholder="https://somosfirm.sharepoint.com/…"></label>
  </div>
  <div class="card frm">
    <h2>2 · Fechas</h2>
    <p class="ok-hint">Pon la fecha de carga y se proponen las demás. Cambia solo lo que no encaje.</p>
    <div class="grid-f">
      <div class="g-row g-h"><div></div><div>Sí / No</div><div>Desde</div><div>Hasta</div><div>Hora</div><div>Transporte</div></div>
      ${filas}
    </div>
  </div>
  <div class="card frm">
    <h2>3 · Transporte y destino</h2>
    <label>Ubicación del evento<input id="ubicacion" value="${v("ubicacion")}"></label>
    <label>Tipo de vehículo<input id="tipo_vehiculo" value="${v("tipo_vehiculo")}"></label>
    <label>Necesidades especiales<textarea id="necesidades" rows="3">${v("necesidades")}</textarea></label>
  </div>
  <div class="acts">
    <button class="btn lime" id="bsave" type="submit">Guardar</button>
    ${!nuevo && puede("admin") ? `<button class="btn red" id="bdel" type="button">Eliminar</button>` : ""}
  </div>
  </form>`;

  const $ = id => document.getElementById(id);
  // Sí/No: activa o desactiva la fila
  FASES.forEach(([k, , hay, d1, d2, h, t]) => {
    const pinta = () => { const on = $(hay).checked; $(hay).nextElementSibling.nextElementSibling.textContent = on ? "Sí" : "No"; [d1, d2, h, t].forEach(f => f && ($(f).disabled = !on)); };
    $(hay).onchange = pinta; pinta();
  });
  // Propuesta de fechas a partir de la carga
  $("fecha_carga").onchange = () => {
    const c = $("fecha_carga").value; if (!c) return;
    const pon = (id, val) => { if (!$(id).value) $(id).value = val; };
    pon("fecha_montaje", sumaDias(c, 1));
    pon("evento_inicio", sumaDias($("fecha_montaje").value || c, 1));
    pon("evento_fin", $("evento_inicio").value);
    pon("fecha_desmontaje", $("evento_fin").value);
    pon("fecha_descarga", sumaDias($("fecha_desmontaje").value, 1));
  };
  const limpiaBorrador = borrador($("ff"), BKEY(nuevo ? null : p), $("borr"));
  $("evento_inicio").onchange = () => { if (!$("evento_fin").value || $("evento_fin").value < $("evento_inicio").value) $("evento_fin").value = $("evento_inicio").value; };

  $("ff").onsubmit = async ev => {
    ev.preventDefault();
    const codigo = MAY($("codigo").value);
    if (!/^\d{6}\.\d{2}$/.test(codigo)) return toast("El código debe ser AAMMDD.NN, por ejemplo 261123.01");
    if (!$("front_id").value) return toast("Elige el Front del proyecto");
    if (S.proyectos.some(x => x.codigo === codigo && x.id !== p.id)) return toast("Ya existe un proyecto con ese código");
    const front = fronts.find(o => o.id === +$("front_id").value);
    const row = {
      codigo, nombre: MAY($("nombre").value), cliente: MAY($("cliente").value) || null,
      front_id: front.id, front_nombre: front.nombre, estado: $("estado").value, estado_com: $("estado_com").value,
      carpeta: limpiaCarpeta($("carpeta").value),
      ubicacion: MAY($("ubicacion").value) || null, tipo_vehiculo: MAY($("tipo_vehiculo").value) || null,
      necesidades: MAY($("necesidades").value) || null, updated_at: new Date().toISOString(),
    };
    for (const [, , hay, d1, d2, h, t] of FASES) {
      const on = $(hay).checked;
      row[hay] = on;
      const a = on ? $(d1).value || null : null;
      let b = on ? $(d2).value || null : null;
      if (a && b && b < a) b = a;
      row[d1] = a; row[d2] = b;
      row[h] = on && $(h).value !== "—" ? $(h).value : null;
      if (t) row[t] = on ? MAY($(t).value) || null : null;
    }
    if (row.hay_carga && !row.fecha_carga) return toast("Falta la fecha de carga");
    if (!row.transporte_vuelta) row.transporte_vuelta = row.transporte_ida;
    $("bsave").disabled = true;
    const r = nuevo ? await sb.from("proyectos").insert(row).select().single() : await sb.from("proyectos").update(row).eq("id", p.id).select().single();
    $("bsave").disabled = false;
    if (r.error) return toast("No se pudo guardar: " + r.error.message);
    limpiaBorrador();
    toast("Proyecto guardado");
    await recargar();
    location.hash = `#/p/${r.data.id}`;
  };
  const bd = $("bdel");
  if (bd) bd.onclick = async () => {
    if (!confirm(`¿Eliminar el proyecto ${p.codigo} y todos sus elementos? No se puede deshacer.`)) return;
    const { error } = await sb.from("proyectos").delete().eq("id", p.id);
    if (error) return toast("No se pudo eliminar: " + error.message);
    toast("Proyecto eliminado");
    await recargar();
    location.hash = "#/";
  };
}
