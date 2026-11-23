// Escanear: cámara del móvil, pistola Bluetooth (teclado + Enter) o código escrito a mano.
// Entiende la etiqueta de unidad "DOINN|proyecto|REF|nombre|i/n", el código "REF-Pn" y la tarjeta de operario "T-####".
const V = new URL(import.meta.url).search;
const { faltanFases } = await import("./despiece.js" + V);
const MODOS = [["fab", "Fabricar"], ["corte", "Cortar"], ["carga", "Cargar"]];
let stream = null, loopId = null, detector = null, ultimo = { c: "", t: 0 };

function parar() {
  if (loopId) cancelAnimationFrame(loopId), loopId = null;
  if (stream) stream.getTracks().forEach(t => t.stop()), stream = null;
}
window.addEventListener("hashchange", () => { if (!location.hash.startsWith("#/escanear")) parar(); });

function cargaLibQR() {
  if (window.jsQR) return Promise.resolve();
  return new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
}

export function vEscanear(ctx) {
  const { $app, S, esc } = ctx;
  S.scan = S.scan || { modo: "fab", operario: null, log: [] };
  const st = S.scan;
  $app.innerHTML = `
  <div class="card">
    <div class="pj-top"><div><div class="code">Operario</div><b id="sop">${st.operario ? esc(st.operario.nombre) : "Escanea tu tarjeta (T-…)"}</b></div>
    ${st.operario ? `<button class="link" id="sout">Cambiar</button>` : ""}</div>
    <div class="seg3">${MODOS.map(([k, l]) => `<button class="chip ${st.modo === k ? "on" : ""}" data-m="${k}">${l}</button>`).join("")}</div>
  </div>
  <div class="cam card" id="camc">
    <video id="vid" playsinline muted></video><canvas id="cv" hidden></canvas>
    <div class="aim"></div>
    <button class="camtap" id="bcam" type="button"><span class="cmark"><i></i></span><span class="ctxt">Toca aquí para abrir la cámara</span></button>
  </div>
  <form id="fman" class="search"><input id="man" placeholder="Pistola o código a mano (ej. 261123.01-001-P1)" autocomplete="off"><button class="btn">OK</button></form>
  <div id="res"></div>
  <div class="card"><h2>Últimos escaneos</h2><div id="log">${st.log.map(l => `<div class="lg ${l.ok ? "ok" : "ko"}"><span>${l.h}</span> ${esc(l.m)}</div>`).join("") || `<div class="code">Aún no hay escaneos en esta sesión.</div>`}</div></div>`;

  const $ = id => document.getElementById(id);
  $app.querySelectorAll("[data-m]").forEach(b => b.onclick = () => { st.modo = b.dataset.m; vEscanear(ctx); });
  const so = $("sout"); if (so) so.onclick = () => { st.operario = null; vEscanear(ctx); };
  $("fman").onsubmit = ev => { ev.preventDefault(); const v = $("man").value.trim(); $("man").value = ""; if (v) procesa(ctx, v); };
  $("man").focus();
  $("bcam").onclick = () => abrirCamara(ctx);
  if (stream) abrirCamara(ctx);
}

async function abrirCamara(ctx) {
  const vid = document.getElementById("vid"), cv = document.getElementById("cv"), b = document.getElementById("bcam");
  try {
    // Pedimos resolución alta: el QR de la etiqueta (25 × 54 mm) es pequeño y a baja resolución no se lee
    if (!stream) stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    try { const tr = stream.getVideoTracks()[0], cap = tr.getCapabilities ? tr.getCapabilities() : {}; if (cap.focusMode && cap.focusMode.includes("continuous")) await tr.applyConstraints({ advanced: [{ focusMode: "continuous" }] }); } catch { }
    vid.srcObject = stream; await vid.play();
    document.getElementById("camc").classList.add("on"); b.style.display = "none";
    if ("BarcodeDetector" in window) { try { const f = await window.BarcodeDetector.getSupportedFormats(); detector = f.includes("qr_code") ? new window.BarcodeDetector({ formats: ["qr_code"] }) : null; } catch { detector = null; } }
    await cargaLibQR().catch(() => { });
    const g = cv.getContext("2d", { willReadFrequently: true });
    let fallosDet = 0, n = 0;
    const tick = async () => {
      if (!stream || !document.getElementById("vid")) return parar();
      if (vid.readyState >= 2 && vid.videoWidth) {
        let txt = null;
        if (detector && fallosDet < 30) { try { const r = await detector.detect(vid); if (r[0]) txt = r[0].rawValue; } catch { fallosDet++; } }
        // jsQR sobre el centro de la imagen a buena resolución (cada 2 fotogramas, o siempre si no hay detector nativo)
        if (!txt && window.jsQR && (!detector || fallosDet >= 30 || ++n % 2 === 0)) {
          const vw = vid.videoWidth, vh = vid.videoHeight, lado = Math.min(vw, vh) * 0.8, sx = (vw - lado) / 2, sy = (vh - lado) / 2, w = Math.min(800, Math.round(lado));
          cv.width = w; cv.height = w; g.drawImage(vid, sx, sy, lado, lado, 0, 0, w, w);
          const r = window.jsQR(g.getImageData(0, 0, w, w).data, w, w, { inversionAttempts: "attemptBoth" });
          if (r && r.data) txt = r.data;
        }
        if (txt) procesa(ctx, txt);
      }
      loopId = requestAnimationFrame(tick);
    };
    tick();
  } catch (e) {
    ctx.toast("No se pudo abrir la cámara: " + (e.message || e));
  }
}

function resultado(ctx, ok, msg, det = "") {
  const { S, esc } = ctx;
  const h = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  S.scan.log.unshift({ ok, m: msg, h }); S.scan.log = S.scan.log.slice(0, 15);
  const r = document.getElementById("res");
  if (r) { r.innerHTML = `<div class="scanres ${ok ? "ok" : "ko"}"><b>${ok ? "✓" : "✕"} ${esc(msg)}</b>${det ? `<div>${esc(det)}</div>` : ""}</div>`; clearTimeout(resultado.t); resultado.t = setTimeout(() => { if (r) r.innerHTML = ""; }, 8000); }
  const lg = document.getElementById("log");
  if (lg) lg.innerHTML = S.scan.log.map(l => `<div class="lg ${l.ok ? "ok" : "ko"}"><span>${l.h}</span> ${esc(l.m)}</div>`).join("");
  try { navigator.vibrate && navigator.vibrate(ok ? 60 : [80, 60, 80]); } catch { }
}

async function procesa(ctx, raw) {
  const { S, sb } = ctx;
  const txt = raw.trim();
  if (txt === ultimo.c && Date.now() - ultimo.t < 3000) return;
  ultimo = { c: txt, t: Date.now() };
  const st = S.scan;

  // Tarjeta de operario
  if (/^T-\d+$/i.test(txt) || /^OP-\d+$/i.test(txt)) {
    const op = S.operarios.find(o => (o.codigo || "").toUpperCase() === txt.toUpperCase());
    if (!op) return resultado(ctx, false, "Tarjeta no reconocida", txt);
    st.operario = op;
    const pu = (op.puesto || "").toLowerCase();
    st.modo = /cnc|seccionadora/.test(pu) ? "corte" : /expedic|log/.test(pu) ? "carga" : "fab";
    document.getElementById("sop").textContent = op.nombre;
    document.querySelectorAll("[data-m]").forEach(b => b.classList.toggle("on", b.dataset.m === st.modo));
    return resultado(ctx, true, `Hola, ${op.nombre}`, `Modo: ${MODOS.find(m => m[0] === st.modo)[1]}`);
  }

  // Unidad de elemento
  let ref = null;
  const p = txt.split("|");
  if (p[0] === "DOINN" && p.length >= 5) { const i = (p[4] || "").split("/")[0]; ref = `${p[2]}-P${parseInt(i, 10)}`; }
  else if (/-P\d+$/i.test(txt)) ref = txt.toUpperCase();
  if (!ref) return resultado(ctx, false, "Código no reconocido", txt.slice(0, 60));

  const { data: z, error } = await sb.from("piezas").select("*").eq("referencia", ref).maybeSingle();
  if (error) return resultado(ctx, false, "Error al leer", error.message);
  if (!z) return resultado(ctx, false, "Unidad no encontrada", ref);
  const { data: x } = await sb.from("elementos").select("*").eq("id", z.elemento_id).single();
  const nom = `${x.elemento || x.referencia} · ${z.num_pieza}/${z.total_piezas}`;
  const quien = st.operario ? st.operario.nombre : (S.perfil.nombre || S.user.email.split("@")[0]);
  const now = new Date().toISOString();

  if (st.modo === "corte") {
    if (x.estado_doc !== "Hecho") return resultado(ctx, false, "Falta la documentación técnica", nom);
    if (z.cortada) return resultado(ctx, true, "Ya estaba cortada", nom);
    await sb.from("piezas").update({ cortada: true, fecha_corte: now, operario_corte: quien }).eq("id", z.id);
    if (x.estado_fab === "Pendiente") await sb.from("elementos").update({ estado_fab: "En curso" }).eq("id", x.id);
    S.dirty = true;
    return resultado(ctx, true, "Cortada", nom);
  }

  if (st.modo === "fab") {
    if (x.estado_doc !== "Hecho") return resultado(ctx, false, "Falta la documentación técnica", `${nom} · Oficina Técnica debe marcar la documentación como hecha`);
    if (z.fabricada) return resultado(ctx, true, "Ya estaba fabricada", nom);
    const { data: subs } = await sb.from("subelementos").select("id,num_sub,desc_sub,fases,fases_hechas,terminado").eq("elemento_id", x.id).order("num_sub");
    const falta = faltanFases(x, subs || []);
    if (falta.length) return resultado(ctx, false, "Faltan fases por terminar", `Falta: ${falta.join(" · ")} · ${nom}`);
    await sb.from("piezas").update({ fabricada: true, fecha_fab: now, operario_fab: quien, cortada: true }).eq("id", z.id);
    const { data: todas } = await sb.from("piezas").select("id,fabricada").eq("elemento_id", x.id);
    const listas = todas.filter(k => k.fabricada || k.id === z.id).length;
    if (listas === todas.length) await sb.from("elementos").update({ estado_fab: "Hecho", fecha_fab: now, operario_fab: quien }).eq("id", x.id);
    else if (x.estado_fab === "Pendiente") await sb.from("elementos").update({ estado_fab: "En curso" }).eq("id", x.id);
    S.dirty = true;
    return resultado(ctx, true, listas === todas.length ? "Fabricada · elemento listo para carga" : "Fabricada", `${nom} · ${listas}/${todas.length} unidades`);
  }

  // carga
  if (!z.fabricada && x.estado_fab !== "Hecho") return resultado(ctx, false, "Aún no está fabricada", nom);
  if (z.cargada) return resultado(ctx, true, "Ya estaba cargada", nom);
  await sb.from("piezas").update({ cargada: true, fecha_cargada: now, operario_carga: quien }).eq("id", z.id);
  const { data: todas } = await sb.from("piezas").select("id,cargada").eq("elemento_id", x.id);
  const n = todas.filter(k => k.cargada || k.id === z.id).length;
  await sb.from("elementos").update(n === todas.length ? { estado_carga: "Cargado", fecha_cargado: now, operario_carga: quien, piezas_cargadas: n } : { estado_carga: "Parcial", piezas_cargadas: n }).eq("id", x.id);
  S.dirty = true;
  return resultado(ctx, true, n === todas.length ? "Cargada · elemento completo" : "Cargada", `${nom} · ${n}/${todas.length} unidades`);
}
