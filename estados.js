// Estados comerciales del proyecto y avisos de riesgo (compartido por varias pantallas)
export const ESTADOS_COM = ["Presupuestado", "Pre-confirmado", "Confirmado", "Pospuesto", "Cancelado"];
export const COL_COM = { Presupuestado: "#E9BA4B", "Pre-confirmado": "#D37B3E", Confirmado: "#93D500", Pospuesto: "#8E9C9C", Cancelado: "#E62643" };
export const GRUPOS_COM = [["En negociación", ["Presupuestado", "Pre-confirmado"]], ["En marcha", ["Confirmado"]], ["Caídos", ["Pospuesto", "Cancelado"]]];
export const estadoCom = p => (p && p.estado_com) || "Confirmado";
export const confirmado = p => estadoCom(p) === "Confirmado";
export const caido = p => ["Pospuesto", "Cancelado"].includes(estadoCom(p));

const hoyIso = () => new Date().toLocaleDateString("sv-SE");
const difDias = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 864e5);

// Avisos de riesgo de un proyecto. nElem = nº de elementos del despiece.
export function riesgos(p, nElem) {
  const r = [];
  if (!p || p.estado === "Cerrado" || caido(p)) return r;
  const falta = [["hay_carga", "fecha_carga", "carga"], ["hay_montaje", "fecha_montaje", "montaje"], ["hay_evento", "evento_inicio", "evento"], ["hay_desmontaje", "fecha_desmontaje", "desmontaje"], ["hay_retorno", "fecha_descarga", "descarga"]]
    .filter(([h, f]) => p[h] !== false && !p[f]).map(x => x[2]);
  if (falta.length) r.push("Fechas incompletas: " + falta.join(", "));
  if (!p.fecha_carga) return r;
  const d = difDias(hoyIso(), p.fecha_carga);
  if (d < 0) return r;
  const cuando = d === 0 ? "hoy" : d === 1 ? "mañana" : `en ${d} días`;
  if (d <= 14 && !confirmado(p)) r.push(`${estadoCom(p)} y la carga es ${cuando}`);
  if (d <= 10 && !p.coordinacion_ok) r.push(`Sin coordinación OK y la carga es ${cuando}`);
  if (d <= 7 && !nElem) r.push(`Sin despiece y la carga es ${cuando}`);
  if (d <= 14 && !p.ot_id) r.push("Sin técnico de OT asignado");
  return r;
}

// Parpadeo de avisos (se puede apagar; se guarda en este dispositivo)
export const neonOn = () => { try { return localStorage.getItem("doinn_neon") !== "off"; } catch { return true; } };
export const setNeon = on => { try { localStorage.setItem("doinn_neon", on ? "on" : "off"); } catch { } };
