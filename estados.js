// Estados comerciales del proyecto y avisos de riesgo (compartido por varias pantallas)
// Solo tres estados, los mismos que la columna «ESTADO PROYECTO» del Excel de planificación
export const ESTADOS_COM = ["Pendiente", "Confirmado", "Cancelado"];
export const COL_COM = { Pendiente: "#E9BA4B", Confirmado: "#93D500", Cancelado: "#E62643" };
export const GRUPOS_COM = [["Activos", ["Pendiente", "Confirmado"]]];
const VIEJOS = { Presupuestado: "Pendiente", "Pre-confirmado": "Pendiente", Pospuesto: "Pendiente" };
export const estadoCom = p => { const e = (p && p.estado_com) || "Confirmado"; return VIEJOS[e] || e; };
export const confirmado = p => estadoCom(p) === "Confirmado";
export const caido = p => estadoCom(p) === "Cancelado";
// Proyectos que cuentan en producción (Muelle, Panel): confirmados, o pendientes que ya tienen fecha de carga
export const enMarcha = p => confirmado(p) || (estadoCom(p) === "Pendiente" && !!p.fecha_carga);
// Orden de los proyectos en toda la app: 1º fecha de carga (sin fecha, al final); 2º código de proyecto
const claveCodigo = p => String(p.codigo || "").replace(/^[A-Z]+-/i, "");
export const ordenProyectos = (a, b) => (a.fecha_carga || "9999").localeCompare(b.fecha_carga || "9999") || claveCodigo(a).localeCompare(claveCodigo(b), "es", { numeric: true });

const hoyIso = () => new Date().toLocaleDateString("sv-SE");
const difDias = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 864e5);

// Avisos de riesgo de un proyecto. nElem = nº de elementos del despiece.
export function riesgos(p, nElem) {
  const r = [];
  if (!p || p.estado === "Cerrado" || p.archivado || caido(p)) return r;
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
  return r;
}

// Parpadeo de avisos (se puede apagar; se guarda en este dispositivo)
export const neonOn = () => { try { return localStorage.getItem("doinn_neon") !== "off"; } catch { return true; } };
export const setNeon = on => { try { localStorage.setItem("doinn_neon", on ? "on" : "off"); } catch { } };
