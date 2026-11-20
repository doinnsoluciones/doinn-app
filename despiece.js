// Despiece: alta/edición de elementos y subelementos, importación del listado Excel y etiquetas QR
const FASES = ["Corte", "Carpintería", "Cerrajería", "Pintura"];
const TALLERES = ["Carpintería", "Cerrajería", "Pintura", "CNC", "Mixto"];
const MAY = s => String(s ?? "").replace(/\s+/g, " ").trim().toUpperCase();
const num = v => { const n = parseFloat(String(v ?? "").replace(",", ".")); return isNaN(n) ? null : n; };
const pad = n => String(n).padStart(3, "0");
const fasesTxt = arr => arr.length ? "|" + arr.join("|") + "|" : null;
const tiene = (l, f) => (l || "").includes("|" + f + "|");
const ETIQ = "https://doinnsoluciones.github.io/Etiquetas/";
const ORIGENES = ["Fabricación", "Almacén"];
export const origenTxt = o => !o ? "Fabricación" : o === "Inventario" ? "Almacén" : o;
// Colores RAL: se guardan como "9010|7016"; muestra con su color aproximado
const RAL_HEX = { 1013: "#E3D9C6", 1015: "#E6D2B5", 1018: "#F3DA0B", 1021: "#EEC900", 1023: "#F0CA00", 2004: "#E25303", 2008: "#F67828", 3000: "#A72920", 3003: "#8D1D2C", 3020: "#C1121C", 4005: "#76689A", 5002: "#00387B", 5005: "#005387", 5010: "#004F7C", 5012: "#0089B6", 5015: "#007CB0", 5017: "#005B8C", 6005: "#0F4336", 6018: "#48A43F", 6029: "#007243", 7001: "#8C969D", 7004: "#9B9B9B", 7011: "#52595D", 7012: "#575D5E", 7015: "#51565C", 7016: "#383E42", 7021: "#2F3234", 7022: "#4C4A44", 7024: "#474A50", 7030: "#939388", 7035: "#CBD0CC", 7036: "#9A9697", 7038: "#B0B0A9", 7040: "#9DA3A6", 7042: "#8F9695", 7046: "#82898E", 7047: "#D0D0D0", 8014: "#4A3526", 8017: "#45302B", 8019: "#3D3635", 9001: "#E9E0D2", 9002: "#D7D5CB", 9003: "#ECECE7", 9004: "#2B2B2C", 9005: "#0A0A0A", 9006: "#A5A8A6", 9007: "#8F8F8C", 9010: "#F1ECE1", 9011: "#1C1C1C", 9016: "#F1F0EA", 9017: "#29292A", 9018: "#C8CBC4" };
const ralLista = t => String(t || "").split("|").map(x => x.trim()).filter(Boolean);
const ralNorm = t => MAY(t).replace(/^RAL\s*/, "");
export const ralChips = (t, esc = x => x) => ralLista(t).map(c => `<span class="ral"><i style="background:${RAL_HEX[c] || "#C9D1D1"}"></i>RAL ${esc(c)}</span>`).join("");
// Caja de RAL editable: escribe y pulsa Intro (o coma) para añadir; × para quitar
function cajaRal(box, valor, cambia) {
  let lista = ralLista(valor);
  const pinta = () => {
    box.innerHTML = lista.map((c, i) => `<span class="ral"><i style="background:${RAL_HEX[c] || "#C9D1D1"}"></i>RAL ${c}<button type="button" data-q="${i}" title="Quitar">×</button></span>`).join("") + `<input placeholder="${lista.length ? "Otro RAL" : "Añadir RAL (ej. 9010)"}" inputmode="text">`;
    const inp = box.querySelector("input");
    const add = () => { const v = ralNorm(inp.value.replace(/,/g, "")); if (v && !lista.includes(v)) { lista.push(v); cambia(lista.join("|")); pinta(); box.querySelector("input").focus(); } else inp.value = ""; };
    inp.onkeydown = e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } else if (e.key === "Backspace" && !inp.value && lista.length) { lista.pop(); cambia(lista.join("|")); pinta(); box.querySelector("input").focus(); } };
    inp.onblur = () => { if (inp.value.trim()) add(); };
    box.querySelectorAll("[data-q]").forEach(b => b.onclick = () => { lista.splice(+b.dataset.q, 1); cambia(lista.join("|")); pinta(); });
  };
  box.onclick = e => { if (e.target === box) box.querySelector("input").focus(); };
  pinta();
}
// Orden visual del despiece (columna «orden»); sin orden, por número de elemento y al final
export const ordenEl = (a, b) => (a.orden ?? 1e6 + (a.num_item || 0)) - (b.orden ?? 1e6 + (b.num_item || 0));
// Medidas en orden alto × ancho × fondo (el fondo se guarda en la columna «largo»)
export const medidasTxt = x => (x.alto || x.ancho || x.largo) ? `${x.alto || "–"} × ${x.ancho || "–"} × ${x.largo || "–"} mm` : "";

export function urlEtiquetas(p, els) {
  const e = els.map(x => [x.referencia, (x.elemento || "").replace(/[~|]/g, " "), x.cantidad || 1].join("~")).join("|");
  return `${ETIQ}?p=${encodeURIComponent(p.codigo)}&n=${encodeURIComponent(p.nombre || "")}&e=${encodeURIComponent(e)}`;
}

async function leer(sb, pid) {
  const [e, s, z] = await Promise.all([
    sb.from("elementos").select("*").eq("proyecto_id", pid).order("num_item"),
    sb.from("subelementos").select("*").eq("proyecto_id", pid).order("num_sub"),
    sb.from("piezas").select("id,elemento_id,num_pieza,fabricada,cargada").eq("proyecto_id", pid),
  ]);
  for (const r of [e, s, z]) if (r.error) throw r.error;
  return { els: e.data.sort(ordenEl), subs: s.data, pz: z.data };
}

// ---------- lista ----------
export async function vDespiece(ctx, p, cont, reordenar = false) {
  const { sb, esc, toast, puede } = ctx;
  const edita = puede("admin");
  cont.innerHTML = `<div class="loading">Cargando despiece…</div>`;
  let d; try { d = await leer(sb, p.id); } catch (e) { cont.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const totalQR = d.els.reduce((a, x) => a + (x.cantidad || 1), 0);
  cont.innerHTML = `
  ${edita ? `<div class="acts2">
    <button class="btn lime" id="dnew">+ Nuevo elemento</button>
    <label class="btn ghost" for="fxl">Importar listado Excel</label><input type="file" id="fxl" accept=".xlsx,.xls" hidden>
  </div>` : ""}
  ${edita && d.els.length > 1 ? `<div class="row" style="justify-content:flex-end;margin:8px 0 0"><button class="btn sm ghost" id="dreord">↕ Reordenar elementos</button></div>` : ""}
  ${d.els.length ? `<a class="btn ghost wide" target="_blank" rel="noopener" href="${urlEtiquetas(p, d.els)}">Imprimir etiquetas QR del proyecto (${totalQR})</a>` : ""}
  <div style="height:10px"></div>
  ${d.els.map(x => { const ss = d.subs.filter(s => s.elemento_id === x.id); const fs = (x.fases || "").split("|").filter(Boolean); return `
    <div class="card el desp" data-href="#/p/${p.id}/desp/${x.id}">
      <div class="pj-top"><div><span class="num">${pad(x.num_item ?? 0)}</span> <b>${esc(x.elemento)}</b> <span class="code">×${x.cantidad || 1}</span></div>
      <span class="row" style="gap:6px">${x.es_extra ? `<span class="pill warn">Extra</span>` : ""}<span class="pill ${origenTxt(x.origen) === "Almacén" ? "info" : ""}">${esc(origenTxt(x.origen))}</span>${edita ? `<button class="link cp" data-copia="${x.id}" title="Crear un elemento nuevo copiando este">⧉ Copiar</button>` : ""}</span></div>
      <div class="pj-meta">${medidasTxt(x) ? `<span>📐 ${medidasTxt(x)}</span>` : ""}${!ss.length && fs.length ? `<span>${esc(fs.join(" · "))}</span>` : ""}${x.acabado ? `<span>${esc(x.acabado)}</span>` : ""}${x.ral ? `<span>${ralChips(x.ral, esc)}</span>` : ""}</div>
      ${x.observaciones ? `<div class="code obs">${esc(x.observaciones)}</div>` : ""}
      ${ss.length ? `<div class="subl">${ss.map(s => `<div><span class="code">S${s.num_sub}</span> <b>${esc(s.desc_sub || s.titulo)}</b> <span class="code">· ${s.cantidad || 1} pieza${(s.cantidad || 1) > 1 ? "s" : ""}${origenTxt(s.origen) === "Almacén" ? " · Almacén" : ""}${s.acabado ? " · " + esc(s.acabado) : ""}${s.fases ? " · " + esc(s.fases.split("|").filter(Boolean).join(" · ")) : ""}</span> ${ralChips(s.ral, esc)}</div>`).join("")}</div>` : ""}
    </div>`; }).join("") || `<div class="empty">Este proyecto aún no tiene despiece. Crea los elementos o importa el listado Excel de oficina técnica.</div>`}`;
  cont.querySelectorAll(".card.desp").forEach(c => c.onclick = () => location.hash = c.dataset.href);
  cont.querySelectorAll("[data-copia]").forEach(b => b.onclick = e => { e.stopPropagation(); location.hash = `#/p/${p.id}/desp/copia-${b.dataset.copia}`; });
  const br = document.getElementById("dreord"); if (br) br.onclick = () => modoOrden(ctx, p, cont, d);
  const nb = document.getElementById("dnew"); if (nb) nb.onclick = () => location.hash = `#/p/${p.id}/desp/nuevo`;
  const fx = document.getElementById("fxl"); if (fx) fx.onchange = () => importar(ctx, p, fx.files[0], d).then(() => vDespiece(ctx, p, cont));
}

// ---------- reordenar (arrastrar o flechas); no cambia referencias ni QR ----------
function modoOrden(ctx, p, cont, d) {
  const { sb, esc, toast } = ctx;
  const lista = d.els.slice();
  let arrastra = null;
  const pinta = () => {
    cont.innerHTML = `<div class="card ordhead"><div><b>Reordenar elementos</b><div class="code">Arrastra cada fila (⠿) o usa las flechas. Solo cambia el orden en pantalla: las referencias y las etiquetas QR no cambian.</div></div>
      <div class="row" style="gap:8px"><button class="btn sm ghost" id="ocan">Cancelar</button><button class="btn sm lime" id="ook">Guardar orden</button></div></div>
      <div id="olist">${lista.map((x, i) => `<div class="ro" draggable="true" data-i="${i}"><span class="hdl" title="Arrastrar">⠿</span><span class="num">${pad(x.num_item ?? 0)}</span><b>${esc(x.elemento)}</b><span class="code">×${x.cantidad || 1}</span>
        <span class="ro-b"><button type="button" data-up="${i}" ${i === 0 ? "disabled" : ""} title="Subir">▲</button><button type="button" data-dn="${i}" ${i === lista.length - 1 ? "disabled" : ""} title="Bajar">▼</button></span></div>`).join("")}</div>`;
    const mueve = (de, a) => { if (a < 0 || a >= lista.length || de === a) return; const [it] = lista.splice(de, 1); lista.splice(a, 0, it); pinta(); };
    cont.querySelectorAll("[data-up]").forEach(b => b.onclick = () => mueve(+b.dataset.up, +b.dataset.up - 1));
    cont.querySelectorAll("[data-dn]").forEach(b => b.onclick = () => mueve(+b.dataset.dn, +b.dataset.dn + 1));
    cont.querySelectorAll(".ro").forEach(r => {
      r.ondragstart = e => { arrastra = +r.dataset.i; r.classList.add("drag"); e.dataTransfer.effectAllowed = "move"; };
      r.ondragend = () => r.classList.remove("drag");
      r.ondragover = e => { e.preventDefault(); const b = r.getBoundingClientRect(); r.classList.toggle("sobre-arr", e.clientY < b.top + b.height / 2); r.classList.toggle("sobre-abj", e.clientY >= b.top + b.height / 2); };
      r.ondragleave = () => r.classList.remove("sobre-arr", "sobre-abj");
      r.ondrop = e => { e.preventDefault(); const i = +r.dataset.i, b = r.getBoundingClientRect(); let a = e.clientY < b.top + b.height / 2 ? i : i + 1; if (arrastra < a) a--; mueve(arrastra, a); };
    });
    document.getElementById("ocan").onclick = () => vDespiece(ctx, p, cont);
    document.getElementById("ook").onclick = async () => {
      const bt = document.getElementById("ook"); bt.disabled = true; bt.textContent = "Guardando…";
      const cambios = lista.map((x, i) => ({ x, o: i + 1 })).filter(({ x, o }) => x.orden !== o);
      for (let k = 0; k < cambios.length; k += 10) {
        const res = await Promise.all(cambios.slice(k, k + 10).map(({ x, o }) => sb.from("elementos").update({ orden: o }).eq("id", x.id)));
        const err = res.find(r => r.error); if (err) { toast("No se pudo guardar el orden: " + err.error.message); bt.disabled = false; bt.textContent = "Guardar orden"; return; }
      }
      toast("Orden guardado"); ctx.S.dirty = true; vDespiece(ctx, p, cont);
    };
  };
  pinta();
}

// ---------- formulario de elemento ----------
export async function vElementoForm(ctx, p, eid) {
  const { $app, sb, esc, toast, puede } = ctx;
  if (!puede("admin")) { $app.innerHTML = `<div class="empty">Solo Fronts y oficina técnica editan el despiece.</div>`; return; }
  $app.innerHTML = `<div class="loading">Cargando…</div>`;
  const d = await leer(sb, p.id);
  // «copia-ID»: elemento nuevo con los datos de otro, para editar solo lo que cambia
  const copiaDe = String(eid).startsWith("copia-") ? d.els.find(e => e.id === +String(eid).slice(6)) : null;
  const nuevo = eid === "nuevo" || !!copiaDe;
  const LIMPIA = ["id", "num_item", "referencia", "estado_doc", "estado_fab", "estado_carga", "fecha_doc", "por_doc", "operario_fab", "fases_hechas", "hist_fases", "incidencia", "camion", "orden_carga", "ubicacion_nave", "orden", "created_at", "updated_at"];
  const sinCampos = (o, ks) => { const c = { ...o }; ks.forEach(k => delete c[k]); return c; };
  const x = copiaDe ? sinCampos(copiaDe, LIMPIA) : eid === "nuevo" ? { cantidad: 1, origen: "Fabricación", fases: "|Corte|Carpintería|" } : d.els.find(e => e.id === +eid);
  if (!x) { $app.innerHTML = `<div class="empty">Elemento no encontrado.</div>`; return; }
  if (x.origen === "Inventario") x.origen = "Almacén";
  let subs = (copiaDe ? d.subs.filter(s => s.elemento_id === copiaDe.id).map(s => sinCampos(s, ["id", "elemento_id", "titulo", "terminado", "fases_hechas"])) : nuevo ? [] : d.subs.filter(s => s.elemento_id === x.id).map(s => ({ ...s })));
  subs.forEach(s => { if (s.origen === "Inventario") s.origen = "Almacén"; });
  let conSub = copiaDe ? subs.length > 0 : nuevo ? false : (x.tiene_sub || subs.length > 0);
  const v = k => esc(x[k] ?? "");
  const chkF = (pref, val) => FASES.map(f => `<label class="ck"><input type="checkbox" data-f="${pref}" value="${f}" ${tiene(val, f) ? "checked" : ""}> ${f}</label>`).join("");

  const pinta = () => {
    $app.innerHTML = `<a class="back" href="#/p/${p.id}/despiece">‹ Despiece</a>
    <h1>${copiaDe ? "Copia de " + pad(copiaDe.num_item) + " · " + esc(copiaDe.elemento) : nuevo ? "Nuevo elemento" : pad(x.num_item) + " · " + esc(x.elemento)}</h1>
    ${copiaDe ? `<p class="hint">Se crea un elemento nuevo con los mismos datos. Cambia lo que sea distinto y pulsa «Crear elemento».</p>` : ""}
    <form id="fe" class="card frm" autocomplete="off">
      <div class="two"><label>Nombre *<input id="e_nom" value="${v("elemento")}" required></label>
      <label>Unidades *<input id="e_cant" type="number" min="1" value="${x.cantidad || 1}" required></label></div>
      <label>Origen<select id="e_ori">${ORIGENES.map(o => `<option ${o === (x.origen || "Fabricación") ? "selected" : ""}>${o}</option>`).join("")}</select></label>
      <div class="code" style="margin-top:6px">Medidas en mm <small>(opcional)</small></div>
      <div class="three med"><label>Alto<input id="e_h" type="number" value="${v("alto")}"></label><label>Ancho<input id="e_a" type="number" value="${v("ancho")}"></label><label>Fondo<input id="e_l" type="number" value="${v("largo")}"></label></div>
      <label>Observaciones<textarea id="e_obs" rows="2">${v("observaciones")}</textarea></label>
      <div class="pj-top"><b>¿Extra (pedido de última hora)?</b><label class="tg"><input type="checkbox" id="e_extra" ${x.es_extra ? "checked" : ""}><span></span><b>${x.es_extra ? "Sí" : "No"}</b></label></div>
      <div class="pj-top" style="margin-top:10px"><b>¿Tiene subelementos?</b><label class="tg"><input type="checkbox" id="e_sub" ${conSub ? "checked" : ""}><span></span><b>${conSub ? "Sí" : "No"}</b></label></div>
      ${conSub ? `<div id="subs">${subs.map((s, i) => `
        <div class="subf" data-i="${i}">
          <div class="pj-top"><b>Subelemento ${i + 1}</b><button type="button" class="link" data-del="${i}">Quitar</button></div>
          <div class="two"><label>Nombre<input data-s="desc_sub" value="${esc(s.desc_sub || "")}"></label><label>Nº de piezas<input data-s="cantidad" type="number" min="1" value="${s.cantidad || 1}"></label></div>
          <div class="two"><label>Origen<select data-s="origen">${ORIGENES.map(o => `<option ${o === (s.origen || "Fabricación") ? "selected" : ""}>${o}</option>`).join("")}</select></label><label>Acabado<input data-s="acabado" value="${esc(s.acabado || "")}"></label></div>
          <label>Color RAL <small>(uno o varios)</small><div class="ralbox" data-sral="${i}"></div></label>
          <div class="fasesck">${chkF("s" + i, s.fases)}</div>
        </div>`).join("")}</div>
        <button type="button" class="btn ghost wide" id="addsub">+ Añadir subelemento</button>`
      : `<div class="two"><label>Acabado<input id="e_acab" value="${v("acabado")}"></label><label>Color RAL <small>(uno o varios)</small><div class="ralbox" id="e_ral"></div></label></div><div class="code">Fases de fabricación</div><div class="fasesck">${chkF("e", x.fases)}</div>`}
      <div class="acts" style="margin-top:14px"><button class="btn lime" type="submit" id="esave">${nuevo ? "Crear elemento" : "Guardar"}</button>
      ${nuevo ? "" : `<button class="btn ghost" type="button" id="ecopia" title="Crear un elemento nuevo con estos mismos datos">⧉ Copiar elemento</button><button class="btn red" type="button" id="edel">Eliminar</button>`}</div>
      ${nuevo ? "" : `<a class="btn ghost wide" target="_blank" rel="noopener" href="${urlEtiquetas(p, [x])}" style="margin-top:10px">Imprimir ${x.cantidad || 1} etiqueta${(x.cantidad || 1) > 1 ? "s" : ""} QR</a>`}
    </form>`;
    const $ = id => document.getElementById(id);
    if ($("e_ral")) cajaRal($("e_ral"), x.ral, t => x.ral = t);
    document.querySelectorAll("[data-sral]").forEach(b => { const s = subs[+b.dataset.sral]; cajaRal(b, s.ral, t => s.ral = t); });
    const leeSubs = () => document.querySelectorAll(".subf").forEach(el => { const s = subs[+el.dataset.i]; el.querySelectorAll("[data-s]").forEach(i => s[i.dataset.s] = i.value); s.fases = fasesTxt([...el.querySelectorAll("input[data-f]:checked")].map(c => c.value)); });
    const guardaCampos = () => { x.elemento = $("e_nom").value; x.cantidad = +$("e_cant").value || 1; x.origen = $("e_ori").value; x.largo = $("e_l").value; x.ancho = $("e_a").value; x.alto = $("e_h").value; x.observaciones = $("e_obs").value; x.es_extra = $("e_extra").checked; if ($("e_acab")) { x.acabado = $("e_acab").value; x.fases = fasesTxt([...document.querySelectorAll("input[data-f=e]:checked")].map(c => c.value)); } if (conSub) leeSubs(); };
    $("e_sub").onchange = () => { guardaCampos(); conSub = $("e_sub").checked; if (conSub && !subs.length) subs.push({ cantidad: 1, origen: "Fabricación", fases: "|Corte|Carpintería|" }); pinta(); };
    $("e_extra").onchange = () => $("e_extra").nextElementSibling.nextElementSibling.textContent = $("e_extra").checked ? "Sí" : "No";
    const as = $("addsub"); if (as) as.onclick = () => { guardaCampos(); subs.push({ cantidad: 1, origen: "Fabricación", fases: "|Corte|Carpintería|" }); pinta(); };
    document.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { guardaCampos(); subs.splice(+b.dataset.del, 1); pinta(); });
    $("fe").onsubmit = async ev => { ev.preventDefault(); guardaCampos(); $("esave").disabled = true; const ok = await guardar(ctx, p, d, x, conSub ? subs : [], nuevo); $("esave").disabled = false; if (ok) location.hash = `#/p/${p.id}/despiece`; };
    const ec = $("ecopia"); if (ec) ec.onclick = () => location.hash = `#/p/${p.id}/desp/copia-${x.id}`;
    const de = $("edel"); if (de) de.onclick = async () => {
      if (d.pz.some(z => z.elemento_id === x.id && (z.fabricada || z.cargada)) && !confirm("Este elemento tiene unidades fabricadas o cargadas. ¿Eliminarlo igualmente?")) return;
      if (!confirm(`¿Eliminar ${pad(x.num_item)} · ${x.elemento}, sus subelementos y sus QR?`)) return;
      const { error } = await sb.from("elementos").delete().eq("id", x.id);
      if (error) return toast("No se pudo eliminar: " + error.message);
      toast("Elemento eliminado"); ctx.S.dirty = true; location.hash = `#/p/${p.id}/despiece`;
    };
  };
  pinta();
}

async function guardar(ctx, p, d, x, subs, nuevo) {
  const { sb, toast, S } = ctx;
  if (!MAY(x.elemento)) return toast("Falta el nombre");
  const usados = new Set(d.els.filter(e => e.id !== x.id).map(e => e.num_item));
  let n = x.num_item; if (!n) { n = 1; while (usados.has(n)) n++; }
  const ref = `${p.codigo}-${pad(n)}`;
  const fasesEl = subs.length ? null : x.fases;
  const row = {
    proyecto_id: p.id, num_item: n, referencia: ref, elemento: MAY(x.elemento), cantidad: x.cantidad, origen: x.origen,
    taller: x.taller || null, zona: MAY(x.zona) || null, material: MAY(x.material) || null, acabado: subs.length ? null : (MAY(x.acabado) || null), ral: subs.length ? null : (x.ral || null),
    largo: num(x.largo), ancho: num(x.ancho), alto: num(x.alto), observaciones: MAY(x.observaciones) || null,
    es_extra: !!x.es_extra, tiene_sub: subs.length > 0, fases: fasesEl, pasa_pintura: tiene(fasesEl, "Pintura") || subs.some(s => tiene(s.fases, "Pintura")),
    num_etiquetas: x.cantidad, updated_at: new Date().toISOString(),
  };
  if (nuevo) Object.assign(row, { estado_doc: "Pendiente", estado_fab: "Pendiente", estado_carga: "Pendiente", fecha_pedido_extra: x.es_extra ? new Date().toLocaleDateString("sv-SE") : null });
  const r = nuevo ? await sb.from("elementos").insert(row).select().single() : await sb.from("elementos").update(row).eq("id", x.id).select().single();
  if (r.error) return toast("No se pudo guardar: " + r.error.message);
  const el = r.data;
  // subelementos: borra los quitados, actualiza y crea
  const prev = d.subs.filter(s => s.elemento_id === el.id);
  const quitar = prev.filter(s => !subs.some(k => k.id === s.id)).map(s => s.id);
  if (quitar.length) await sb.from("subelementos").delete().in("id", quitar);
  for (let i = 0; i < subs.length; i++) {
    const s = subs[i];
    const sr = { elemento_id: el.id, proyecto_id: p.id, num_sub: i + 1, total_sub: subs.length, titulo: `${ref}-S${i + 1}`, desc_sub: MAY(s.desc_sub) || `SUBELEMENTO ${i + 1}`, cantidad: +s.cantidad || 1, origen: s.origen || "Fabricación", acabado: MAY(s.acabado) || null, ral: s.ral || null, fases: s.fases || null, pasa_pintura: tiene(s.fases, "Pintura") };
    const q = s.id ? await sb.from("subelementos").update(sr).eq("id", s.id) : await sb.from("subelementos").insert(sr);
    if (q.error) return toast("Error en subelemento " + (i + 1) + ": " + q.error.message);
  }
  // unidades con QR (P1…Pn)
  const pz = d.pz.filter(z => z.elemento_id === el.id);
  const sobran = pz.filter(z => z.num_pieza > el.cantidad);
  if (sobran.some(z => z.fabricada || z.cargada)) toast("Hay unidades fabricadas por encima de la nueva cantidad: no se han borrado.");
  else if (sobran.length) await sb.from("piezas").delete().in("id", sobran.map(z => z.id));
  const nuevas = [];
  for (let i = 1; i <= el.cantidad; i++) if (!pz.some(z => z.num_pieza === i)) nuevas.push({ elemento_id: el.id, proyecto_id: p.id, num_pieza: i, total_piezas: el.cantidad, referencia: `${ref}-P${i}`, desc_pieza: el.elemento, taller: el.taller === "Cerrajería" ? "Calderería" : "Carpintería", pasa_pintura: el.pasa_pintura });
  if (nuevas.length) { const q = await sb.from("piezas").insert(nuevas); if (q.error) return toast("Error creando QR: " + q.error.message); }
  await sb.from("piezas").update({ total_piezas: el.cantidad, desc_pieza: el.elemento }).eq("elemento_id", el.id);
  // recalcula fabricación según unidades
  const { data: todas } = await sb.from("piezas").select("fabricada").eq("elemento_id", el.id);
  const hechas = todas.filter(z => z.fabricada).length;
  const est = hechas && hechas >= el.cantidad ? "Hecho" : hechas ? "En curso" : (el.estado_fab === "Hecho" ? "En curso" : el.estado_fab);
  if (est !== el.estado_fab) await sb.from("elementos").update({ estado_fab: est }).eq("id", el.id);
  S.dirty = true;
  toast(nuevo ? `Elemento ${pad(n)} creado` : "Elemento guardado");
  return true;
}

// ---------- importar listado Excel (plantilla "Listado de elementos") ----------
function cargaXLSX() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
}
async function importar(ctx, p, file, d) {
  const { sb, toast } = ctx;
  if (!file) return;
  try { await cargaXLSX(); } catch { return toast("No se pudo cargar el lector de Excel"); }
  const wb = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
  const ws = wb.Sheets["Listado"] || wb.Sheets[wb.SheetNames[0]];
  const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const cod = MAY(rows[2] && rows[2][2]);
  if (cod && cod !== p.codigo && !confirm(`El Excel es del proyecto ${cod} y estás en ${p.codigo}. ¿Importar aquí igualmente?`)) return;
  const TAL = { CARPINTERIA: "Carpintería", "CARPINTERÍA": "Carpintería", CERRAJERIA: "Cerrajería", "CERRAJERÍA": "Cerrajería", PINTURA: "Pintura", CNC: "CNC", MIXTO: "Mixto" };
  const errs = [], items = [];
  for (let r = 7; r < rows.length; r++) {
    const v = rows[r] || []; const nombre = MAY(v[1]); if (!nombre) continue;
    const ref = num(v[0]) ? Math.round(num(v[0])) : null, uds = num(v[3]), taller = TAL[MAY(v[6])] || null, pinta = ["SÍ", "SI", "S", "X", "1"].includes(MAY(v[7]));
    if (!uds || uds < 1) { errs.push(`Fila ${r + 1} (${nombre}): faltan las unidades`); continue; }
    items.push({ ref, nombre, zona: MAY(v[2]), uds: Math.round(uds), taller, pinta, acabado: MAY(v[8]), material: MAY(v[9]), largo: num(v[10]), ancho: num(v[11]), alto: num(v[12]), obs: MAY(v[13]) });
  }
  if (errs.length) return alert("No se ha importado nada. Corrige el Excel:\n\n" + errs.join("\n"));
  if (!items.length) return toast("No hay elementos en la hoja «Listado»");
  if (!confirm(`Se van a importar ${items.length} elementos en ${p.codigo}. Los que ya existan con el mismo número se actualizan. ¿Continuar?`)) return;
  let creados = 0, act = 0;
  const usados = new Set(d.els.map(e => e.num_item));
  for (const it of items) {
    let n = it.ref; if (!n) { n = 1; while (usados.has(n)) n++; } usados.add(n);
    const ex = d.els.find(e => e.num_item === n);
    const fases = ["Corte", it.taller === "Cerrajería" ? "Cerrajería" : "Carpintería"].concat(it.pinta ? ["Pintura"] : []);
    const x = { ...(ex || {}), num_item: n, elemento: it.nombre, cantidad: it.uds, zona: it.zona, material: it.material, acabado: it.acabado, largo: it.largo, ancho: it.ancho, alto: it.alto, observaciones: it.obs, taller: it.taller, origen: (ex && ex.origen) || "Fabricación", fases: (ex && ex.fases) || fasesTxt(fases) };
    await guardar({ ...ctx, toast: () => { } }, p, d, x, ex ? d.subs.filter(s => s.elemento_id === ex.id) : [], !ex);
    ex ? act++ : creados++;
    const dd = await leer(sb, p.id); d.els = dd.els; d.subs = dd.subs; d.pz = dd.pz;
  }
  toast(`Importado: ${creados} nuevos, ${act} actualizados`);
}
