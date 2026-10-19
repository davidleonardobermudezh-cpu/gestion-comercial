import { $, $$, esc, money, fdate, today, uid, toast, addDays, monthKey } from '../util.js';
import { store } from '../store.js';
import { cfg, totales, clienteNombre, cliente, familiaDe, kardex, sum, inventario } from '../domain.js';
import { ICON, formModal, openModal, confirmar, badge, parseMoney } from '../ui.js';
import { renderTable } from '../table.js';

export function render(main) {
  const rows = store.all('ventas').map(v => ({ ...v, clienteN: clienteNombre(v.clienteId) }));
  const mes = monthKey(today());
  const vm = rows.filter(v => v.estado !== 'anulada' && monthKey(v.fecha) === mes);
  main.innerHTML = `<div class="page">
    <div class="page-h"><div><h1>Ventas y pedidos</h1><p class="muted">Cada venta crea su cuenta por cobrar, descuenta el inventario y queda en el historial del cliente (para las alarmas). Nada se duplica si se repite la acción.</p></div>
      <div class="row-btns"><button class="btn btn-primary" id="v-new">${ICON.plus} Nueva venta</button></div></div>
    <section class="strip"><div class="st st-good"><span>Ventas del mes</span><b class="num">${money(sum(vm, 'total'))}</b></div><div class="st"><span>Número de ventas</span><b class="num">${vm.length}</b></div><div class="st"><span>Ticket promedio</span><b class="num">${money(vm.length ? sum(vm, 'total') / vm.length : 0)}</b></div></section>
    <div id="v-tbl"></div></div>`;
  $('#v-new', main).onclick = () => formVenta({});
  renderTable($('#v-tbl', main), {
    id: 'ventas', rows, defaultSort: 'fecha', search: ['numero', 'clienteN', 'observaciones'],
    filters: [{ key: 'estado', label: 'Estado', options: [['pedido', 'Pedido'], ['entregada', 'Entregada'], ['anulada', 'Anulada']] }],
    columns: [
      { key: 'numero', label: 'Venta', primary: true, render: r => `<b>${esc(r.numero)}</b><small class="sub">${esc(r.clienteN)}</small>` },
      { key: 'fecha', label: 'Fecha', date: true },
      { key: 'items', label: 'Detalle', hideMobile: true, nosort: true, render: r => esc((r.items || []).map(i => `${i.cantidad}× ${i.descripcion}`).join(' · ').slice(0, 90)) },
      { key: 'registradoPor', label: 'Registró', hideMobile: true },
      { key: 'total', label: 'Total', money: true },
      { key: 'estado', label: 'Estado', render: r => badge(r.estado === 'anulada' ? 'anulada' : r.estado === 'entregada' ? 'pagada' : 'pendiente', r.estado === 'pedido' ? 'Pedido' : r.estado === 'entregada' ? 'Entregada' : 'Anulada') },
      { key: 'acc', label: '', nosort: true, render: r => r.estado === 'pedido' ? `<button class="btn btn-sm" data-entregar="${esc(r.id)}">Marcar entregada</button>` : '' }
    ], totals: { total: true }, empty: 'Sin ventas registradas.'
  });
  main.addEventListener('click', async e => {
    const b = e.target.closest('[data-entregar]'); if (!b) return;
    await store.upsert('ventas', [{ id: b.dataset.entregar, estado: 'entregada' }]); toast('Venta marcada como entregada');
  });
}

/** Registro atómico de una venta (idempotente por id). */
export async function registrarVenta(p) {
  const { idBase, clienteId, fecha, items, descuentoGeneral = 0, cotizacionId = '', fechaVencimiento, anticipo = 0, medio = 'Efectivo', series = '', descontar = true, observaciones = '', estado = 'pedido' } = p;
  const vid = 'v-' + idBase;
  if (store.get('ventas', vid)) throw new Error('Esta venta ya fue registrada. No se duplicó.');
  const t = totales(items, descuentoGeneral);
  if (!(t.total > 0)) throw new Error('El total de la venta debe ser mayor que cero.');
  if (anticipo < 0 || anticipo > t.total) throw new Error('El anticipo no puede ser mayor que el total.');
  // Validación de inventario
  if (descontar && !cfg('permitirNegativo')) {
    const req = {};
    for (const it of items) if (it.productoId) req[it.productoId] = (req[it.productoId] || 0) + Number(it.cantidad || 0);
    for (const [pid, q] of Object.entries(req)) { const st = kardex(pid).stock; if (q > st) throw new Error(`No hay existencias suficientes de ${store.get('productos', pid)?.nombre}: hay ${st}, se necesitan ${q}.`); }
  }
  const c = cliente(clienteId);
  const ops = [];
  ops.push({ table: 'ventas', mode: 'insert', rows: [{ id: vid, numero: `__AUTO__:V-:venta:5`, clienteId, fecha, items: items.map(({ id, productoId, descripcion, cantidad, precio, descPct, ivaPct }) => ({ id, productoId: productoId || '', descripcion, cantidad, precio, descPct, ivaPct })), subtotal: t.subtotal, descuento: t.descuentos, iva: t.iva, total: t.total, cotizacionId, cxcDocId: 'cxc-' + vid, anticipo, estado, observaciones }] });
  ops.push({ table: 'cxc_docs', mode: 'insert', rows: [{ id: 'cxc-' + vid, clienteId, tipoDoc: 'Venta', numero: '', fechaEmision: fecha, fechaVencimiento: fechaVencimiento || fecha, concepto: items.map(i => i.descripcion).join(' · ').slice(0, 180), categoria: items.some(i => familiaDe(i.descripcion) === 'audifono') ? 'Audífonos' : 'Accesorios', valor: t.total, ventaId: vid, cotizacionId, observaciones }] });
  if (anticipo > 0) ops.push({ table: 'cxc_abonos', mode: 'insert', rows: [{ id: 'ab-' + vid, clienteId, docId: 'cxc-' + vid, fecha, valor: anticipo, medio, referencia: 'Anticipo venta', observaciones: '' }] });
  const movs = [], entregas = [], equipos = [];
  items.forEach((it, i) => {
    const fam = familiaDe(it.descripcion);
    if (descontar && it.productoId && Number(it.cantidad) > 0) {
      const k = kardex(it.productoId);
      movs.push({ id: `mv-${vid}-${i}`, productoId: it.productoId, fecha, tipo: 'salida', cantidad: Number(it.cantidad), costoUnit: k.costoProm, precioUnit: it.precio, documento: 'Venta', clienteId, responsable: 'Venta', ventaId: vid, observaciones: c?.nombre || '' });
    }
    entregas.push({ id: `en-${vid}-${i}`, clienteId, fecha, documento: 'Venta', descripcion: it.descripcion, familia: fam, cantidad: it.cantidad, valor: totales([it], descuentoGeneral).total, origen: 'venta', ventaId: vid });
    if (fam === 'audifono') equipos.push({ id: `eq-${vid}-${i}`, clienteId, descripcion: it.descripcion, series, fechaEntrega: fecha, garantiaMeses: cfg('reglas').garantiaMeses, documento: 'Venta', estado: 'activo' });
  });
  ops.push({ table: 'movimientos', mode: 'insert', rows: movs }, { table: 'entregas', mode: 'insert', rows: entregas }, { table: 'equipos', mode: 'insert', rows: equipos });
  if (cotizacionId) {
    const q = store.get('cotizaciones', cotizacionId);
    ops.push({ table: 'cotizaciones', mode: 'upsert', rows: [{ id: cotizacionId, estado: 'convertida', ventaId: vid, historial: [...(q?.historial || []), { estado: 'convertida', fecha: today() }] }] });
  }
  const saved = await store.batch(ops);
  return saved.ventas?.[0];
}

function anticipoSugerido(texto, total) {
  const m = String(texto || '').match(/(\d{1,3})\s*%/);
  return m ? Math.round(total * Number(m[1]) / 100) : 0;
}

export function convertirCotizacion(q) {
  if (!q) return;
  if (q.ventaId) { toast('Esta cotización ya se convirtió en venta.', 'warn'); location.hash = '#ventas'; return; }
  const t = totales(q.items || [], q.descuentoGeneral);
  const tieneAud = (q.items || []).some(i => familiaDe(i.descripcion) === 'audifono');
  formModal({
    title: `Convertir ${q.numero} en venta`, size: 'md', submitLabel: 'Crear venta',
    values: { fecha: today(), fechaVencimiento: addDays(today(), 15), conAnticipo: true, anticipo: anticipoSugerido(q.formaPago, t.total), medio: 'Efectivo', descontar: true },
    sections: [{ fields: [
      { name: 'resumen', label: 'Cliente y total', type: 'readonly', full: true, html: `<b>${esc(clienteNombre(q.clienteId))}</b> · <span class="num">${money(t.total)}</span> · ${(q.items || []).length} línea(s)` },
      { name: 'fecha', label: 'Fecha del pedido / venta', type: 'date', required: true },
      { name: 'fechaVencimiento', label: 'Fecha límite de pago del saldo', type: 'date', required: true, hint: 'Ej.: día de entrega (50% restante)' },
      { name: 'conAnticipo', label: 'Registrar anticipo recibido ahora', type: 'checkbox', full: true },
      { name: 'anticipo', label: 'Valor del anticipo', type: 'money', showIf: { conAnticipo: true }, hint: 'Sugerido según la forma de pago de la cotización' },
      { name: 'medio', label: 'Medio de pago', type: 'select', options: cfg('mediosPago'), showIf: { conAnticipo: true } },
      ...(tieneAud ? [{ name: 'series', label: 'Serie(s) de los audífonos', full: true, hint: 'Puedes completarlas después en la ficha del cliente' }] : []),
      { name: 'descontar', label: 'Descontar del inventario los productos vinculados', type: 'checkbox', full: true }
    ] }],
    onSubmit: async f => {
      const v = await registrarVenta({ idBase: q.id, clienteId: q.clienteId, fecha: f.fecha, items: q.items, descuentoGeneral: q.descuentoGeneral, cotizacionId: q.id, fechaVencimiento: f.fechaVencimiento, anticipo: f.conAnticipo ? Number(f.anticipo) || 0 : 0, medio: f.medio, series: f.series || '', descontar: f.descontar });
      toast(`Venta ${v?.numero || ''} creada: cuenta por cobrar e inventario actualizados`);
      location.hash = '#cliente/' + q.clienteId;
    }
  });
}

export function formVenta(pre = {}) {
  const idBase = uid('d');
  let items = [{ id: uid('it'), productoId: '', descripcion: '', cantidad: 1, precio: 0, descPct: 0, ivaPct: 0 }];
  const m = formModal({
    title: 'Nueva venta / pedido', size: 'lg', submitLabel: 'Registrar venta',
    values: { fecha: today(), fechaVencimiento: today(), medio: 'Efectivo', descontar: true, ...pre },
    sections: [
      { title: 'Cliente', fields: [{ name: 'clienteId', label: 'Cliente', type: 'cliente', required: true, full: true }, { name: 'fecha', label: 'Fecha', type: 'date', required: true }, { name: 'fechaVencimiento', label: 'Fecha límite de pago', type: 'date', required: true }] },
      { title: 'Productos', fields: [{ name: 'itemsHost', label: '', type: 'readonly', full: true, html: '<div id="vi-host"></div>' }] },
      { title: 'Pago', fields: [
        { name: 'conAnticipo', label: 'Recibí un pago ahora', type: 'checkbox', full: true },
        { name: 'anticipo', label: 'Valor recibido', type: 'money', showIf: { conAnticipo: true } },
        { name: 'medio', label: 'Medio de pago', type: 'select', options: cfg('mediosPago'), showIf: { conAnticipo: true } },
        { name: 'series', label: 'Serie(s) si es audífono', full: true },
        { name: 'descontar', label: 'Descontar del inventario', type: 'checkbox', full: true },
        { name: 'observaciones', label: 'Observaciones', type: 'textarea', full: true, rows: 2 }
      ] }
    ],
    afterRender: (form) => {
      const host = $('#vi-host', form);
      const prods = inventario().filter(p => p.estado !== 'inactivo');
      const draw = () => {
        const t = totales(items);
        host.innerHTML = items.map((it, i) => `<div class="item" data-i="${i}">
          <label class="fld full"><span>Producto</span><select data-k="productoId"><option value="">— Línea libre —</option>${prods.map(p => `<option value="${esc(p.id)}" ${p.id === it.productoId ? 'selected' : ''}>${esc(p.nombre)} (exist. ${p.stock})</option>`).join('')}</select></label>
          <label class="fld full"><span>Descripción</span><input data-k="descripcion" value="${esc(it.descripcion)}"></label>
          <label class="fld"><span>Cant.</span><input type="number" data-k="cantidad" value="${it.cantidad}" min="0" inputmode="numeric"></label>
          <label class="fld"><span>Precio unit.</span><input data-k="precio" inputmode="decimal" value="${Number(it.precio || 0).toLocaleString('es-CO')}"></label>
          <label class="fld"><span>IVA %</span><select data-k="ivaPct">${[0, 5, 19].map(v => `<option ${Number(it.ivaPct) === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <div class="item-tot"><button type="button" class="btn btn-sm btn-ghost" data-del="${i}" aria-label="Quitar">${ICON.trash}</button></div></div>`).join('')
          + `<div class="row-btns"><button type="button" class="btn btn-sm" data-add>${ICON.plus} Agregar línea</button><span class="num"><b>Total: ${money(t.total)}</b></span></div>`;
      };
      host.addEventListener('change', e => {
        const row = e.target.closest('.item'); if (!row) return;
        const i = +row.dataset.i, k = e.target.dataset.k;
        if (k === 'productoId') { const p = prods.find(x => x.id === e.target.value); items[i] = { ...items[i], productoId: e.target.value, descripcion: p?.nombre || items[i].descripcion, precio: p?.precio || items[i].precio, ivaPct: Number(p?.ivaPct ?? items[i].ivaPct) }; }
        else items[i][k] = k === 'descripcion' ? e.target.value : k === 'precio' ? parseMoney(e.target.value) : Number(e.target.value) || 0;
        draw();
      });
      host.addEventListener('click', e => {
        if (e.target.closest('[data-add]')) { items.push({ id: uid('it'), productoId: '', descripcion: '', cantidad: 1, precio: 0, descPct: 0, ivaPct: 0 }); draw(); }
        const d = e.target.closest('[data-del]'); if (d && items.length > 1) { items.splice(+d.dataset.del, 1); draw(); }
      });
      draw();
    },
    onSubmit: async f => {
      const its = items.filter(i => i.descripcion && i.cantidad > 0);
      if (!its.length) throw new Error('Agrega al menos un producto con descripción y cantidad.');
      const v = await registrarVenta({ idBase, clienteId: f.clienteId, fecha: f.fecha, items: its, fechaVencimiento: f.fechaVencimiento, anticipo: f.conAnticipo ? Number(f.anticipo) || 0 : 0, medio: f.medio, series: f.series, descontar: f.descontar, observaciones: f.observaciones });
      toast(`Venta ${v?.numero || ''} registrada`);
    }
  });
}
