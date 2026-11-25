// Calculadora de paneles: cuántos tableros hacen falta para una lista de piezas.
// Las piezas se cargan desde el despiece de un proyecto (estimación por cajas o paneles) o se meten a mano / pegando desde Excel.
// El cálculo coloca las piezas en tableros con un algoritmo MaxRects (mejor ajuste por lado corto), con margen de corte y recorte perimetral.

const LSK = "doinn_melamina";
const DEF = { L: 2800, A: 2050, kerf: 4.4, recorte: 5, desp: 10, veta: false, piezas: [] };
const MAT_DEF = "MELAMINA BLANCA 19";

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
  const proys = S.proyectos.filter(p => !p.archivado && S.elementos.some(e => e.proyecto_id === p.id)).sort((a, b) => (b.fecha_carga || "").localeCompare(a.fecha_carga || ""));

  const pinta = () => {
    guarda(st);
    const W = st.L - 2 * st.recorte, H = st.A - 2 * st.recorte;
    const grupos = new Map();
    st.piezas.filter(p => p.l > 0 && p.a > 0 && p.n > 0).forEach(p => { const k = (p.mat || MAT_DEF).toUpperCase(); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(p); });
    const res = [...grupos.entries()].map(([mat, ps]) => {
      const { tableros, noCaben } = empaqueta(ps, W, H, st.kerf, !st.veta);
      const m2 = ps.reduce((s, p) => s + p.l * p.a * p.n, 0) / 1e6, m2t = st.L * st.A / 1e6;
      const nT = tableros.length, pedir = Math.ceil(nT * (1 + st.desp / 100));
      return { mat, ps, tableros, noCaben, m2, uds: ps.reduce((s, p) => s + p.n, 0), nT, pedir, aprov: nT ? m2 / (nT * m2t) * 100 : 0 };
    });
    const tot = res.reduce((s, r) => s + r.pedir, 0);
    const svg = (t, i) => {
      const k = 150 / st.L;
      return `<figure class="mtab"><svg viewBox="0 0 ${st.L} ${st.A}" width="150" height="${Math.round(st.A * k)}"><rect width="${st.L}" height="${st.A}" class="mfondo"/>
        ${t.puestas.map(c => `<rect x="${c.x + st.recorte}" y="${c.y + st.recorte}" width="${c.w - st.kerf}" height="${c.h - st.kerf}" class="mpz"><title>${esc(c.it.ref.origen || "")} ${c.it.l}×${c.it.a}</title></rect>`).join("")}</svg>
        <figcaption>Tablero ${i + 1} · ${fmt(t.puestas.reduce((s, c) => s + c.it.l * c.it.a, 0) / (st.L * st.A) * 100)} %</figcaption></figure>`;
    };
    $app.innerHTML = `
    <div class="pj-top"><h1 class="h1">Calculadora de paneles<span class="cur">_</span></h1></div>
    <p class="hint">Calcula cuántos tableros hacen falta. Carga las piezas desde el despiece de un proyecto o mételas a mano (también puedes pegarlas desde Excel). Lo que metas se guarda en este dispositivo.</p>

    <div class="mgrid">
    <div class="card frm"><h2>1 · Tablero</h2>
      <div class="two"><label>Largo (mm)<input id="m_L" type="number" value="${st.L}"></label><label>Ancho (mm)<input id="m_A" type="number" value="${st.A}"></label></div>
      <div class="two"><label>Margen de corte (sierra, mm)<input id="m_k" type="number" step="0.1" value="${st.kerf}"></label><label>Recorte perimetral (mm por lado)<input id="m_r" type="number" value="${st.recorte}"></label></div>
      <div class="two"><label>Desperdicio extra (%)<input id="m_d" type="number" value="${st.desp}"></label><label class="tg" style="margin-top:24px"><input type="checkbox" id="m_v" ${st.veta ? "checked" : ""}><span></span>Respetar veta (no girar piezas)</label></div>
    </div>

    <div class="card frm"><h2>2 · Cargar desde un proyecto</h2>
      <label>Proyecto<select id="m_p"><option value="">Elige un proyecto con despiece…</option>${proys.map(p => `<option value="${p.id}">${esc(p.codigo)} · ${esc(p.nombre)}</option>`).join("")}</select></label>
      <div class="two"><label>Cómo convertir cada elemento<select id="m_modo"><option value="caja5">Caja sin trasera (5 piezas)</option><option value="caja6">Caja cerrada (6 piezas)</option><option value="panel">Panel (alto × ancho)</option></select></label>
      <label class="tg" style="margin-top:24px"><input type="checkbox" id="m_solo" checked><span></span>Solo elementos de melamina</label></div>
      <button class="btn lime" id="m_cargar" type="button">Añadir piezas del despiece</button>
      <p class="code" style="margin-top:6px">Es una estimación a partir de las medidas del elemento (alto × ancho × fondo). Si tienes el listado de corte real, pégalo abajo.</p>
    </div>
    </div>

    <div class="card"><div class="pj-top"><h2>3 · Piezas (${st.piezas.length})</h2><div class="row"><button class="btn sm ghost" id="m_peg" type="button">Pegar desde Excel</button><button class="btn sm ghost" id="m_add" type="button">+ Añadir pieza</button>${st.piezas.length ? `<button class="btn sm ghost" id="m_clr" type="button">Vaciar</button>` : ""}</div></div>
      <div id="m_pegbox" hidden><p class="code">Copia en Excel las columnas <b>largo · ancho · cantidad</b> y, opcional, <b>material</b> (una pieza por fila) y pégalas aquí.</p><textarea id="m_txt" rows="5" placeholder="1200	600	4	MELAMINA BLANCA 19"></textarea><button class="btn sm lime" id="m_pok" type="button">Añadir</button></div>
      ${st.piezas.length ? `<div class="mtw"><table class="mtbl"><thead><tr><th>Material</th><th>Largo</th><th>Ancho</th><th>Uds</th><th>Origen</th><th></th></tr></thead><tbody>
        ${st.piezas.map((p, i) => `<tr data-i="${i}"><td><input data-f="mat" value="${esc(p.mat || "")}"></td><td><input data-f="l" type="number" value="${p.l || ""}"></td><td><input data-f="a" type="number" value="${p.a || ""}"></td><td><input data-f="n" type="number" value="${p.n || ""}"></td><td class="code">${esc(p.origen || "")}</td><td><button class="link" data-x="${i}" title="Quitar">✕</button></td></tr>`).join("")}
      </tbody></table></div>` : `<div class="empty">Aún no hay piezas.</div>`}
    </div>

    <div class="card"><div class="pj-top"><h2>4 · Resultado</h2>${res.length ? `<b>${tot} tablero${tot === 1 ? "" : "s"} a pedir</b>` : ""}</div>
      ${!res.length ? `<div class="empty">Añade piezas para calcular.</div>` : res.map(r => `
        <div class="mres">
          <div class="mres-h"><b>${esc(r.mat)}</b><span class="pill ok">${r.pedir} tablero${r.pedir === 1 ? "" : "s"} a pedir</span></div>
          <div class="mkp"><div><span>Piezas</span><b>${fmt(r.uds)}</b></div><div><span>Superficie de piezas</span><b>${fmt(r.m2, 2)} m²</b></div><div><span>Tableros necesarios</span><b>${r.nT}</b></div><div><span>Aprovechamiento</span><b>${fmt(r.aprov)} %</b></div><div><span>Con ${st.desp} % extra</span><b>${r.pedir}</b></div></div>
          ${r.noCaben.length ? `<div class="pj-warn">⚠ ${r.noCaben.length} pieza${r.noCaben.length > 1 ? "s" : ""} no cabe${r.noCaben.length > 1 ? "n" : ""} en el tablero: ${[...new Set(r.noCaben.map(c => `${c.l}×${c.a}`))].join(", ")} mm</div>` : ""}
          <div class="mtabs">${r.tableros.slice(0, 24).map(svg).join("")}${r.tableros.length > 24 ? `<div class="code">… y ${r.tableros.length - 24} más</div>` : ""}</div>
        </div>`).join("")}
      ${res.length ? `<button class="btn sm ghost" id="m_csv" type="button">Descargar resumen (CSV)</button>` : ""}
    </div>`;

    const $ = id => document.getElementById(id);
    const num = (id, k) => { const el = $(id); el.onchange = () => { st[k] = Math.max(0, n0(el.value)); pinta(); }; };
    num("m_L", "L"); num("m_A", "A"); num("m_k", "kerf"); num("m_r", "recorte"); num("m_d", "desp");
    $("m_v").onchange = e => { st.veta = e.target.checked; pinta(); };
    $("m_add").onclick = () => { st.piezas.push({ mat: (st.piezas.at(-1) || {}).mat || MAT_DEF, l: 0, a: 0, n: 1, origen: "A mano" }); pinta(); };
    if ($("m_clr")) $("m_clr").onclick = () => { if (confirm("¿Vaciar la lista de piezas?")) { st.piezas = []; pinta(); } };
    $("m_peg").onclick = () => { $("m_pegbox").hidden = !$("m_pegbox").hidden; };
    $("m_pok").onclick = () => {
      let k = 0;
      $("m_txt").value.split(/\r?\n/).forEach(fila => {
        const c = fila.split(/\t|;/).map(s => s.trim()); if (c.length < 2) return;
        const l = n0(c[0]), a = n0(c[1]), n = Math.round(n0(c[2]) || 1); if (!l || !a) return;
        st.piezas.push({ mat: (c[3] || MAT_DEF).toUpperCase(), l: Math.max(l, a), a: Math.min(l, a), n, origen: "Pegado" }); k++;
      });
      toast(k ? `${k} pieza${k > 1 ? "s" : ""} añadida${k > 1 ? "s" : ""}` : "No se ha reconocido ninguna fila (largo, ancho, cantidad)"); pinta();
    };
    $app.querySelectorAll(".mtbl input").forEach(inp => inp.onchange = () => {
      const p = st.piezas[+inp.closest("tr").dataset.i], f = inp.dataset.f;
      p[f] = f === "mat" ? inp.value.toUpperCase() : Math.max(0, n0(inp.value)); pinta();
    });
    $app.querySelectorAll("[data-x]").forEach(b => b.onclick = () => { st.piezas.splice(+b.dataset.x, 1); pinta(); });
    $("m_cargar").onclick = async () => {
      const pid = +$("m_p").value; if (!pid) return toast("Elige un proyecto");
      const { data, error } = await sb.from("elementos").select("id,num_item,elemento,cantidad,material,alto,ancho,largo").eq("proyecto_id", pid);
      if (error) return toast(error.message);
      const solo = $("m_solo").checked, modo = $("m_modo").value;
      const els = (data || []).filter(x => !solo || /MELAM/i.test(x.material || ""));
      const nuevas = els.flatMap(x => piezasDeElemento(x, modo));
      const sinMed = els.filter(x => !piezasDeElemento(x, modo).length).length;
      st.piezas.push(...nuevas);
      toast(`${nuevas.length} piezas de ${els.length} elementos${sinMed ? ` · ${sinMed} sin medidas completas` : ""}${solo && !els.length ? " · ningún elemento tiene material de melamina" : ""}`);
      pinta();
    };
    if ($("m_csv")) $("m_csv").onclick = () => {
      const filas = [["Material", "Piezas", "m2 piezas", "Tableros necesarios", "Aprovechamiento %", `Tableros a pedir (+${st.desp}%)`]];
      res.forEach(r => filas.push([r.mat, r.uds, r.m2.toFixed(2).replace(".", ","), r.nT, r.aprov.toFixed(0), r.pedir]));
      filas.push([], ["Tablero", `${st.L} x ${st.A} mm`, "Sierra", `${st.kerf} mm`, "Recorte", `${st.recorte} mm`]);
      const csv = "﻿" + filas.map(f => f.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "paneles.csv"; a.click();
    };
  };
  pinta();
}
