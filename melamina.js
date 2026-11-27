// Calculadora de paneles: cuántos tableros hacen falta para una lista de piezas.
// Las piezas se cargan desde el despiece de un proyecto (estimación por cajas o paneles) o se meten a mano / pegando desde Excel.
// El cálculo coloca las piezas en tableros con un algoritmo MaxRects (mejor ajuste por lado corto), con margen de corte y recorte perimetral.

const LSK = "doinn_melamina";
const DEF = { L: 2800, A: 2050, kerf: 4.4, conRecorte: true, recorte: 10, desp: 10, veta: false, piezas: [] };
const MAT_DEF = "MELAMINA BLANCA 19";
const SIN_MAT = "MATERIAL SIN INDICAR";

const lee = () => { try { return { ...DEF, ...(JSON.parse(localStorage.getItem(LSK)) || {}) }; } catch { return { ...DEF }; } };
const guarda = st => { try { localStorage.setItem(LSK, JSON.stringify(st)); } catch { } };
const n0 = v => { const x = parseFloat(String(v ?? "").replace(",", ".")); return isFinite(x) ? x : 0; };
const fmt = (v, d = 0) => (v || 0).toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });

// ---------- colocación en tableros (MaxRects, mejor ajuste por lado corto) ----------
function empaqueta(piezas, W, H, kerf, rota) {
  // Cada pieza ocupa su medida + el ancho de la sierra; el tablero útil gana ese ancho una vez (el último corte no hace falta)
  const items = [];
  piezas.forEach(p => { for (let i = 0; i < p.n; i++) items.push({ l: p.l, a: p.a, ref: p }); });
  items.sort((x, y) => y.l * y.a - x.l * x.a || Math.max(y.l, y.a) - Math.max(x.l, x.a));
  const Wu = W + kerf, Hu = H + kerf;
  const tableros = [], noCaben = [];
  const nuevo = () => ({ libres: [{ x: 0, y: 0, w: Wu, h: Hu }], puestas: [] });
  const busca = (t, w, h) => {
    let mejor = null;
    for (const f of t.libres) {
      for (const [ww, hh, r] of rota ? [[w, h, false], [h, w, true]] : [[w, h, false]]) {
        if (ww <= f.w && hh <= f.h) {
          const corto = Math.min(f.w - ww, f.h - hh), largo = Math.max(f.w - ww, f.h - hh);
          if (!mejor || corto < mejor.corto || (corto === mejor.corto && largo < mejor.largo)) mejor = { x: f.x, y: f.y, w: ww, h: hh, r, corto, largo };
        }
      }
    }
    return mejor;
  };
  const coloca = (t, c) => {
    const nuevos = [];
    t.libres = t.libres.filter(f => {
      if (c.x >= f.x + f.w || c.x + c.w <= f.x || c.y >= f.y + f.h || c.y + c.h <= f.y) return true;
      if (c.x > f.x) nuevos.push({ x: f.x, y: f.y, w: c.x - f.x, h: f.h });
      if (c.x + c.w < f.x + f.w) nuevos.push({ x: c.x + c.w, y: f.y, w: f.x + f.w - c.x - c.w, h: f.h });
      if (c.y > f.y) nuevos.push({ x: f.x, y: f.y, w: f.w, h: c.y - f.y });
      if (c.y + c.h < f.y + f.h) nuevos.push({ x: f.x, y: c.y + c.h, w: f.w, h: f.y + f.h - c.y - c.h });
      return false;
    });
    t.libres.push(...nuevos);
    // quita huecos contenidos en otros
    t.libres = t.libres.filter((a, i) => !t.libres.some((b, j) => i !== j && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h && (i > j || a.w !== b.w || a.h !== b.h || a.x !== b.x || a.y !== b.y)));
  };
  for (const it of items) {
    const w = it.l + kerf, h = it.a + kerf;
    const cabe = (w <= Wu && h <= Hu) || (rota && h <= Wu && w <= Hu);
    if (!cabe) { noCaben.push(it); continue; }
    let puesto = false;
    for (const t of tableros) { const c = busca(t, w, h); if (c) { coloca(t, c); t.puestas.push({ ...c, it }); puesto = true; break; } }
    if (!puesto) { const t = nuevo(); const c = busca(t, w, h); coloca(t, c); t.puestas.push({ ...c, it }); tableros.push(t); }
  }
  return { tableros, noCaben };
}

// ---------- despiece → piezas de tablero (estimación) ----------
// caja6: caja cerrada (2 tapas, 2 laterales, frente y trasera) · caja5: sin trasera · panel: una pieza alto × ancho
function piezasDeElemento(x, modo) {
  const H = n0(x.alto), A = n0(x.ancho), F = n0(x.largo), c = Math.max(1, Math.round(n0(x.cantidad) || 1));
  const mat = (x.material || MAT_DEF).toUpperCase(), o = `${x.num_item ? String(x.num_item).padStart(3, "0") + " " : ""}${x.elemento || ""}`;
  const L = (l, a, n, que) => ({ mat, l: Math.max(l, a), a: Math.min(l, a), n: n * c, origen: `${o} · ${que}` });
  if (modo === "panel") return H && A ? [L(H, A, 1, "panel")] : [];
  if (!H || !A || !F) return [];
  const r = [L(A, F, 2, "tapas"), L(H, F, 2, "laterales"), L(H, A, modo === "caja6" ? 2 : 1, modo === "caja6" ? "frente y trasera" : "frente")];
  return r;
}

export async function vMelamina(ctx) {
  const { $app, S, sb, esc, toast } = ctx;
  const st = lee();
  if (st.conRecorte == null) st.conRecorte = (st.recorte || 0) > 0;
  const proys = S.proyectos.filter(p => !p.archivado && S.elementos.some(e => e.proyecto_id === p.id)).sort((a, b) => (b.fecha_carga || "").localeCompare(a.fecha_carga || ""));
  const $ = id => document.getElementById(id);
  const rec = () => st.conRecorte ? st.recorte : 0;
  const tg = (id, on, txt) => `<label class="tg mtg"><input type="checkbox" id="${id}" ${on ? "checked" : ""}><span></span><b>${on ? "Sí" : "No"}</b> ${txt}</label>`;

  // ---------- cálculo y dibujo (se repite con cada cambio, sin tocar los campos que se están escribiendo) ----------
  const calcula = () => {
    guarda(st);
    const r0 = rec(), W = st.L - 2 * r0, H = st.A - 2 * r0, m2t = st.L * st.A / 1e6;
    const grupos = new Map();
    st.piezas.filter(p => p.l > 0 && p.a > 0 && p.n > 0).forEach(p => { const k = (p.mat || SIN_MAT).toUpperCase(); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(p); });
    const res = [...grupos.entries()].map(([mat, ps]) => {
      const { tableros, noCaben } = W > 0 && H > 0 ? empaqueta(ps, W, H, st.kerf, !st.veta) : { tableros: [], noCaben: [] };
      const m2 = tableros.reduce((s, t) => s + t.puestas.reduce((a, c) => a + c.it.l * c.it.a, 0), 0) / 1e6;
      const nT = tableros.length, usado = nT * m2t, desp = Math.max(0, usado - m2);
      return { mat, ps, tableros, noCaben, m2, uds: tableros.reduce((s, t) => s + t.puestas.length, 0), nT, pedir: Math.ceil(nT * (1 + st.desp / 100)), usado, desp, pDesp: usado ? desp / usado * 100 : 0 };
    });
    const T = res.reduce((a, r) => ({ nT: a.nT + r.nT, pedir: a.pedir + r.pedir, usado: a.usado + r.usado, desp: a.desp + r.desp }), { nT: 0, pedir: 0, usado: 0, desp: 0 });
    // Tablero dibujado a escala: piezas en verde con su medida, desperdicio rayado, recorte perimetral en gris
    const svg = (t, i) => {
      const pz = t.puestas.reduce((s, c) => s + c.it.l * c.it.a, 0), pd = 100 - pz / (st.L * st.A) * 100;
      const fs = Math.max(40, Math.min(st.L, st.A) / 22);
      return `<figure class="mtab"><svg viewBox="0 0 ${st.L} ${st.A}" preserveAspectRatio="xMidYMid meet">
        <defs><pattern id="mh" width="60" height="60" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="60" height="60" class="mdes"/><line x1="0" y1="0" x2="0" y2="60" class="mdesl"/></pattern></defs>
        <rect width="${st.L}" height="${st.A}" class="mrec"/><rect x="${r0}" y="${r0}" width="${st.L - 2 * r0}" height="${st.A - 2 * r0}" fill="url(#mh)"/>
        ${t.puestas.map(c => { const w = c.w - st.kerf, h = c.h - st.kerf, x = c.x + r0, y = c.y + r0, lbl = `${c.it.l}×${c.it.a}`, cabe = w > lbl.length * fs * 0.6 && h > fs * 1.4; return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" class="mpz"><title>${esc((c.it.ref.nom || c.it.ref.origen || "") + " ")}${lbl} mm${c.r ? " (girada)" : ""}</title></rect>${cabe ? `<text x="${x + w / 2}" y="${y + h / 2}" font-size="${fs}" class="mtx">${lbl}</text>` : ""}</g>`; }).join("")}</svg>
        <figcaption><b>Tablero ${i + 1}</b> · ${t.puestas.length} pieza${t.puestas.length === 1 ? "" : "s"} · desperdicio ${fmt(pd)} %</figcaption></figure>`;
    };
    $("m_res").innerHTML = !res.length ? `<div class="empty">Añade piezas con largo, ancho y unidades: el corte se dibuja al momento.</div>`
      : `<div class="mkp mtot"><div><span>Tableros necesarios</span><b>${T.nT}</b></div><div><span>A pedir (+${fmt(st.desp)} %)</span><b>${T.pedir}</b></div><div><span>Superficie de tableros</span><b>${fmt(T.usado, 2)} m²</b></div><div class="${T.usado && T.desp / T.usado > 0.25 ? "mbad" : ""}"><span>Desperdicio</span><b>${fmt(T.desp, 2)} m² · ${fmt(T.usado ? T.desp / T.usado * 100 : 0)} %</b></div></div>`
      + res.map(r => `<div class="mres">
          <div class="mres-h"><b>${esc(r.mat)}</b><span class="code">${r.uds} piezas · ${r.nT} tablero${r.nT === 1 ? "" : "s"} · desperdicio ${fmt(r.desp, 2)} m² (${fmt(r.pDesp)} %)</span></div>
          ${r.noCaben.length ? `<div class="pj-warn">⚠ ${r.noCaben.length} pieza${r.noCaben.length > 1 ? "s" : ""} no cabe${r.noCaben.length > 1 ? "n" : ""} en el tablero${st.veta ? " respetando la veta" : ""}: ${[...new Set(r.noCaben.map(c => `${c.l}×${c.a}`))].join(", ")} mm</div>` : ""}
          <div class="mtabs">${r.tableros.slice(0, 30).map(svg).join("")}${r.tableros.length > 30 ? `<div class="code">… y ${r.tableros.length - 30} más</div>` : ""}</div>
        </div>`).join("") + `<button class="btn sm ghost" id="m_csv" type="button">Descargar resumen (CSV)</button>`;
    const bc = $("m_csv"); if (bc) bc.onclick = () => {
      const filas = [["Material", "Piezas", "Tableros necesarios", "m2 tableros", "m2 desperdicio", "Desperdicio %", `Tableros a pedir (+${st.desp}%)`]];
      res.forEach(r => filas.push([r.mat, r.uds, r.nT, r.usado.toFixed(2).replace(".", ","), r.desp.toFixed(2).replace(".", ","), r.pDesp.toFixed(0), r.pedir]));
      filas.push([], ["Tablero", `${st.L} x ${st.A} mm`, "Ancho de sierra", `${st.kerf} mm`, "Recorte perimetral", st.conRecorte ? `${st.recorte} mm por lado` : "No", "Veta", st.veta ? "Sí" : "No"]);
      filas.push([], ["Pieza", "Largo", "Ancho", "Uds", "Material"]); st.piezas.forEach(p => filas.push([p.nom || p.origen || "", p.l, p.a, p.n, p.mat || ""]));
      const csv = "﻿" + filas.map(f => f.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "paneles.csv"; a.click();
    };
  };
  let tCalc; const recalc = () => { clearTimeout(tCalc); tCalc = setTimeout(calcula, 200); };

  // ---------- piezas: una píldora por pieza ----------
  const pintaPiezas = () => {
    const vt = st.veta;
    $("m_n").textContent = st.piezas.length;
    $("m_pz").innerHTML = st.piezas.length ? st.piezas.map((p, i) => `<div class="mpill" data-i="${i}">
        <span class="mpn">${i + 1}</span>
        <label class="mpnl"><small>Pieza</small><input data-f="nom" class="mpnom" placeholder="Nombre (opcional)" value="${esc(p.nom || (p.origen && p.origen !== "A mano" ? p.origen : "") || "")}"></label>
        <label><small>${vt ? "Largo · veta" : "Largo"}</small><input data-f="l" type="number" inputmode="numeric" min="0" placeholder="mm" value="${p.l || ""}"></label>
        <span class="mpx">×</span>
        <label><small>Ancho</small><input data-f="a" type="number" inputmode="numeric" min="0" placeholder="mm" value="${p.a || ""}"></label>
        <label class="mpu"><small>Uds</small><input data-f="n" type="number" inputmode="numeric" min="1" value="${p.n || ""}"></label>
        <label class="mpm"><small>Material</small><input data-f="mat" class="mpmat" placeholder="Indica material" value="${esc(p.mat || "")}"></label>
        <button class="mpdel" data-x="${i}" type="button" title="Quitar pieza" aria-label="Quitar pieza">×</button></div>`).join("")
      : `<div class="empty">Aún no hay piezas. Pulsa «+ Añadir pieza».</div>`;
    $app.querySelectorAll(".mpill input").forEach(inp => inp.oninput = () => {
      const p = st.piezas[+inp.closest(".mpill").dataset.i], f = inp.dataset.f;
      p[f] = f === "mat" ? inp.value.trim().toUpperCase() : f === "nom" ? inp.value : Math.max(0, n0(inp.value)); recalc();
    });
    $app.querySelectorAll("[data-x]").forEach(b => b.onclick = () => { st.piezas.splice(+b.dataset.x, 1); pintaPiezas(); calcula(); });
  };

  $app.innerHTML = `
    <div class="pj-top"><h1 class="h1">Calculadora de paneles<span class="cur">_</span></h1></div>
    <p class="hint">Mete el tablero y las piezas: el corte se dibuja al momento con el desperdicio. Lo que metas se guarda en este dispositivo.</p>
    <div class="mgrid" style="grid-template-columns:1fr"><!-- Carga de piezas desde proyecto: oculta hasta definirla -->
    <div class="card frm"><h2>1 · Tablero</h2>
      <div class="three"><label>Largo (mm)<input id="m_L" type="number" value="${st.L}"></label><label>Ancho (mm)<input id="m_A" type="number" value="${st.A}"></label><label>Ancho de sierra (mm)<input id="m_k" type="number" step="0.1" value="${st.kerf}"></label></div>
      <div class="mtgs">${tg("m_rc", st.conRecorte, "Recorte perimetral")}<label class="mrmm" id="m_rbox" ${st.conRecorte ? "" : "hidden"}><input id="m_r" type="number" min="0" value="${st.recorte}"> mm por lado</label></div>
      <div class="mtgs">${tg("m_v", st.veta, "Respeta veta")}<span class="code" id="m_vtx">${st.veta ? "Las piezas no se giran: el largo va en el sentido de la veta (largo del tablero)." : "Las piezas se pueden girar para aprovechar mejor."}</span></div>
      <label class="msm">Margen de compra (%)<input id="m_d" type="number" min="0" value="${st.desp}"></label>
    </div>
    <div class="card frm" style="display:none"><h2>Cargar piezas de un proyecto <small class="code">opcional</small></h2>
      <label>Proyecto<select id="m_p"><option value="">Elige un proyecto con despiece…</option>${proys.map(p => `<option value="${p.id}">${esc(p.codigo)} · ${esc(p.nombre)}</option>`).join("")}</select></label>
      <div class="two"><label>Cómo convertir cada elemento<select id="m_modo"><option value="caja5">Caja sin trasera (5 piezas)</option><option value="caja6">Caja cerrada (6 piezas)</option><option value="panel">Panel (alto × ancho)</option></select></label>
      <label class="tg" style="margin-top:24px"><input type="checkbox" id="m_solo" checked><span></span>Solo elementos de melamina</label></div>
      <div class="row"><button class="btn sm lime" id="m_cargar" type="button">Añadir piezas del despiece</button><button class="btn sm ghost" id="m_peg" type="button">Pegar desde Excel</button></div>
      <div id="m_pegbox" hidden><p class="code">Columnas <b>largo · ancho · unidades</b> y, opcional, <b>material</b>; una pieza por fila.</p><textarea id="m_txt" rows="4" placeholder="1200	600	4"></textarea><button class="btn sm lime" id="m_pok" type="button">Añadir</button></div>
    </div>
    </div>
    <div class="card"><div class="pj-top"><h2>2 · Piezas <small class="code" id="m_n"></small></h2><div class="row"><button class="btn sm lime" id="m_add" type="button">+ Añadir pieza</button><button class="btn sm ghost" id="m_clr" type="button">Vaciar</button></div></div>
      <div id="m_pz" class="mpzs"></div></div>
    <div class="card"><div class="pj-top"><h2>3 · Corte y desperdicio</h2></div><div id="m_res"></div></div>`;

  const numIn = (id, k) => { $(id).oninput = () => { st[k] = Math.max(0, n0($(id).value)); recalc(); }; };
  numIn("m_L", "L"); numIn("m_A", "A"); numIn("m_k", "kerf"); numIn("m_r", "recorte"); numIn("m_d", "desp");
  const tgl = (id, f) => { const el = $(id); el.onchange = () => { el.nextElementSibling.nextElementSibling.textContent = el.checked ? "Sí" : "No"; f(el.checked); calcula(); }; };
  tgl("m_rc", v => { st.conRecorte = v; $("m_rbox").hidden = !v; });
  tgl("m_v", v => { st.veta = v; $("m_vtx").textContent = v ? "Las piezas no se giran: el largo va en el sentido de la veta (largo del tablero)." : "Las piezas se pueden girar para aprovechar mejor."; pintaPiezas(); });
  $("m_add").onclick = () => { st.piezas.push({ mat: (st.piezas.at(-1) || {}).mat || "", l: 0, a: 0, n: 1, nom: "" }); pintaPiezas(); const ins = $app.querySelectorAll('.mpill [data-f="l"]'); if (ins.length) ins[ins.length - 1].focus(); };
  $("m_clr").onclick = () => { if (st.piezas.length && confirm("¿Vaciar la lista de piezas?")) { st.piezas = []; pintaPiezas(); calcula(); } };
  $("m_peg").onclick = () => { $("m_pegbox").hidden = !$("m_pegbox").hidden; };
  $("m_pok").onclick = () => {
    let k = 0;
    $("m_txt").value.split(/\r?\n/).forEach(fila => {
      const c = fila.split(/\t|;/).map(s => s.trim()); if (c.length < 2) return;
      const l = n0(c[0]), a = n0(c[1]), n = Math.round(n0(c[2]) || 1); if (!l || !a) return;
      st.piezas.push({ mat: (c[3] || "").toUpperCase(), l, a, n, nom: "" }); k++;
    });
    toast(k ? `${k} pieza${k > 1 ? "s" : ""} añadida${k > 1 ? "s" : ""}` : "No se ha reconocido ninguna fila (largo, ancho, unidades)"); $("m_txt").value = ""; pintaPiezas(); calcula();
  };
  $("m_cargar").onclick = async () => {
    const pid = +$("m_p").value; if (!pid) return toast("Elige un proyecto");
    const { data, error } = await sb.from("elementos").select("id,num_item,elemento,cantidad,material,alto,ancho,largo").eq("proyecto_id", pid);
    if (error) return toast(error.message);
    const solo = $("m_solo").checked, modo = $("m_modo").value;
    const els = (data || []).filter(x => !solo || /MELAM/i.test(x.material || ""));
    const nuevas = els.flatMap(x => piezasDeElemento(x, modo)).map(p => ({ ...p, nom: p.origen }));
    const sinMed = els.filter(x => !piezasDeElemento(x, modo).length).length;
    st.piezas.push(...nuevas);
    toast(`${nuevas.length} piezas de ${els.length} elementos${sinMed ? ` · ${sinMed} sin medidas completas` : ""}${solo && !els.length ? " · ningún elemento tiene material de melamina" : ""}`);
    pintaPiezas(); calcula();
  };
  pintaPiezas(); calcula();
}
