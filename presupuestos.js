// Presupuestador (en construcción): se definirá con Rafa a partir de presupuestos y costes reales
export function vPresupuestos(ctx) {
  const { $app } = ctx;
  $app.innerHTML = `<h1>Presupuestador_</h1>
  <div class="card"><span class="pill warn">En construcción</span>
    <p>Aquí irá el generador de presupuestos de Doinn. Lo estamos definiendo; la idea de partida:</p>
    <ol class="hint" style="line-height:1.7">
      <li>Partidas tipo (tarima, mostrador, trasera, rotulación, transporte, montaje…) con su coste por unidad o m².</li>
      <li>Presupuesto por proyecto a partir de partidas, con margen y precio de venta.</li>
      <li>Material de almacén (Inventario) como partida de alquiler.</li>
      <li>Comparar lo presupuestado con el coste real al cerrar el proyecto.</li>
    </ol></div>`;
}
