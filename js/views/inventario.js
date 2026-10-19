import { $, $$, esc, money, fdate, today, uid, toast, num } from '../util.js';
import { store } from '../store.js';
import { cfg, inventario, resumenInventario, kardex, TIPOS_MOV, signoMov, validarMovimiento, clienteNombre, FAMILIAS } from '../domain.js';
import { ICON, formModal, confirmar, badge, entregarArchivo, emptyState } from '../ui.js';
import { renderTable } from '../table.js';
import { requiere, puede } from '../auth.js';

const view = { tab: 'productos' };
export function render(main) {
  const r = resumenInventario();
  main.innerHTML = `<div class="page">
    <div class="page-h"><div><h1>Inventario propio</h1><p class="muted">Valorizado a <b>costo promedio ponderado</b> (cada entrada recalcula el costo promedio; las salidas salen a ese costo). Los equipos que ya tienen los pacientes están en su ficha, no aquí.</p></div>
      <div class="row-btns"><button class="btn" id="in-mov">${ICON.plus} Movimiento</button><button class="btn btn-primary" id="in-new">${ICON.plus} Producto</button></div></div>
    <section class="strip"><div class="st"><span>Valor a costo</span><b class="num">${money(r.valor)}</b></div><div class="st"><span>Productos activos</span><b class="num">${r.productos}</b></div><div class="st"><span>Unidades</span><b class="num">${num(r.unidades)}</b></div><div class="st ${r.bajo ? 'st-warn' : ''}"><span>Stock bajo</span><b class="num">${r.bajo}</b></div><div class="st ${r.agotados ? 'st-bad' : ''}"><span>Agotados</span><b class="num">${r.agotados}</b></div></section>
    <nav class="tabs"><button class="${view.tab === 'productos' ? 'on' : ''}" data-tab="productos">Productos</button><button class="${view.tab === 'movs' ? 'on' : ''}" data-tab="movs">Movimientos</button></nav>
    <div id="in-body"></div></div>`;
  $('#in-new', main).onclick = () => formProducto({});
  $('#in-mov', main).onclick = () => formMovimiento({});
  $$('[data-tab]', main).forEach(b => b.onclick = () => { view.tab = b.dataset.tab; render(main); });
  if (view.tab === 'productos') productos($('#in-body', main)); else movimientos($('#in-body', main));
}
function productos(host) {
  const rows = inventario();
  const cats = cfg('categoriasProductos');
  const t = renderTable(host, {
    id: 'prod', rows, defaultSort: 'nombre', defaultDir: 'asc', search: ['nombre', 'sku', 'marca', 'modelo', 'categoria'], searchPlaceholder: 'Nombre, SKU, marca…',
    filters: [{ key: 'categoria', label: 'Categoría', options: Object.keys(cats).map(c => [c, c]) }, { key: 'estadoStock', label: 'Existencias', options: [['ok', 'Normal'], ['bajo', 'Stock bajo'], ['agotado', 'Agotado']] }, { key: 'estado', label: 'Estado', options: [['activo', 'Activos'], ['inactivo', 'Inactivos']], test: (r, v) => (r.estado || 'activo') === v }],
    columns: [
      { key: 'nombre', label: 'Producto', primary: true, render: r => `<b>${esc(r.nombre)}</b><small class="sub">${esc([r.sku, r.categoria, r.subcategoria].filter(Boolean).join(' · '))}</small>` },
      { key: 'stock', label: 'Existencia', num: true, render: r => `<b class="${r.estadoStock === 'agotado' ? 't-bad' : r.estadoStock === 'bajo' ? 't-warn' : ''}">${num(r.stock)}</b> <small class="muted">${esc(r.unidad || 'und')}</small>` },
      { key: 'stockMin', label: 'Mínimo', num: true, hideMobile: true },
      { key: 'costoProm', label: 'Costo prom.', money: true, hideMobile: true },
      { key: 'precio', label: 'Precio venta', money: true, hideMobile: true },
      { key: 'valor', label: 'Valor (costo)', money: true }
    ], rowAction: r => '#producto/' + r.id, totals: { valor: true },
    toolbar: `<button class="btn" id="in-xls">${ICON.download} Excel</button>`,
    empty: 'No hay productos. Crea el primero con "Producto" o impórtalos en Ajustes.'
  });
  $('#in-xls', host).onclick = async () => {
    const { excel } = await import('../output.js');
    const blob = await excel([{ nombre: 'Inventario', columnas: [{ key: 'sku', label: 'SKU' }, { key: 'nombre', label: 'Producto' }, { key: 'marca', label: 'Marca' }, { key: 'modelo', label: 'Modelo' }, { key: 'categoria', label: 'Categoría' }, { key: 'subcategoria', label: 'Subcategoría' }, { key: 'unidad', label: 'Unidad' }, { key: 'stock', label: 'Existencia', num: true }, { key: 'stockMin', label: 'Mínimo', num: true }, { key: 'costoProm', label: 'Costo promedio', money: true }, { key: 'valor', label: 'Valor a costo', money: true }, { key: 'precio', label: 'Precio venta', money: true }, { key: 'ubicacion', label: 'Ubicación' }, { key: 'proveedor', label: 'Proveedor' }, { key: 'estadoStock', label: 'Estado stock' }], filas: rows }]);
    entregarArchivo({ blob, nombre: `Inventario_${today()}.xlsx`, carpeta: '02_Inventarios' });
  };
}
function movimientos(host) {
  const rows = store.all('movimientos').map(m => ({ ...m, prod: store.get('productos', m.productoId)?.nombre || '—', tipoTxt: TIPOS_MOV[m.tipo] || m.tipo, tercero: m.clienteId ? clienteNombre(m.clienteId) : (m.proveedor || '') }));
  renderTable(host, {
    id: 'movs', rows, defaultSort: 'fecha', search: ['prod', 'documento', 'tercero', 'serie', 'observaciones'],
    filters: [{ key: 'tipo', label: 'Tipo', options: Object.entries(TIPOS_MOV) }],
    columns: [
      { key: 'fecha', label: 'Fecha', date: true },
      { key: 'prod', label: 'Producto', primary: true, render: r => `<b>${esc(r.prod)}</b><small class="sub">${esc(r.tipoTxt)}${r.documento ? ' · ' + esc(r.documento) : ''}${r.tercero ? ' · ' + esc(r.tercero) : ''}</small>` },
      { key: 'cantidad', label: 'Cantidad', num: true, render: r => `<b class="${signoMov(r.tipo) < 0 ? 't-bad' : 't-good'}">${signoMov(r.tipo) < 0 ? '−' : '+'}${num(r.cantidad)}</b>` },
      { key: 'costoUnit', label: 'Costo unit.', money: true, hideMobile: true },
      { key: 'responsable', label: 'Registró', hideMobile: true, render: r => esc(r.registradoPor || r.responsable || '') },
      { key: 'acc', label: '', nosort: true, render: r => r.revertido ? badge('anulada', 'Revertido') : r.reversoDe ? badge('parcial', 'Reverso') : !puede('anular') ? '' : `<button class="btn btn-sm btn-ghost" data-rev="${esc(r.id)}" title="Revertir">${ICON.undo}<span class="sr">Revertir</span></button>` }
    ], empty: 'Sin movimientos.'
  });
  host.addEventListener('click', e => { const b = e.target.closest('[data-rev]'); if (b) revertir(store.get('movimientos', b.dataset.rev)); });
}

export function renderProducto(main, [id]) {
  const p = inventario().find(x => x.id === id);
  if (!p) { main.innerHTML = `<div class="page">${emptyState('Producto no encontrado', '', '<a class="btn" href="#inventario">Volver</a>')}</div>`; return; }
  const k = kardex(id);
  main.innerHTML = `<div class="page">
    <div class="page-h"><div><p class="eyebrow">${esc(p.sku || '')}</p><h1>${esc(p.nombre)}</h1><p class="muted">${esc([p.marca, p.modelo, p.categoria, p.subcategoria].filter(Boolean).join(' · '))}</p></div>
      <div class="row-btns"><button class="btn" id="pr-edit">${ICON.edit} Editar</button><button class="btn btn-primary" id="pr-mov">${ICON.plus} Movimiento</button></div></div>
    <section class="strip"><div class="st"><span>Existencia</span><b class="num">${num(k.stock)} ${esc(p.unidad || 'und')}</b></div><div class="st"><span>Costo promedio</span><b class="num">${money(k.costoProm)}</b></div><div class="st"><span>Valor a costo</span><b class="num">${money(k.valor)}</b></div><div class="st"><span>Precio de venta</span><b class="num">${money(p.precio)}</b></div><div class="st"><span>Mín. / Máx.</span><b class="num">${p.stockMin || 0} / ${p.stockMax || '—'}</b></div></section>
    <div class="cols-2"><div class="panel"><h3>Datos</h3><dl class="kv">${[['Descripción', p.descripcion], ['Unidad', p.unidad], ['IVA', (p.ivaPct ?? '') + '%'], ['Ubicación', p.ubicacion], ['Proveedor', p.proveedor], ['Reposición estimada', p.reposicionDias ? p.reposicionDias + ' días' : ''], ['Estado', p.estado || 'activo']].filter(x => x[1]).map(([a, b]) => `<div><dt>${a}</dt><dd>${esc(b)}</dd></div>`).join('')}</dl></div>
    <div class="panel"><h3>Kardex</h3>${k.rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Movimiento</th><th class="r">Cant.</th><th class="r">Saldo</th><th class="r">Costo prom.</th></tr></thead><tbody>${k.rows.slice().reverse().map(m => `<tr><td data-label="Fecha">${fdate(m.fecha)}</td><td data-label="Movimiento">${esc(TIPOS_MOV[m.tipo] || m.tipo)} ${m.documento ? '· ' + esc(m.documento) : ''}</td><td class="r num" data-label="Cant.">${m.q > 0 ? '+' : ''}${num(m.q)}</td><td class="r num" data-label="Saldo">${num(m.stock)}</td><td class="r num" data-label="Costo prom.">${money(m.costoProm)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty-inline">Sin movimientos. Registra una entrada para cargar existencias.</p>'}</div></div></div>`;
  $('#pr-edit', main).onclick = () => formProducto(store.get('productos', id));
  $('#pr-mov', main).onclick = () => formMovimiento({ productoId: id });
}

export function formProducto(p = {}) {
  const nuevo = !p.id;
  const id = p.id || uid('pr');
  const cats = cfg('categoriasProductos');
  formModal({
    title: nuevo ? 'Nuevo producto' : 'Editar producto', size: 'lg', values: { unidad: 'und', ivaPct: 19, estado: 'activo', ...p },
    sections: [
      { title: 'Identificación', fields: [
        { name: 'nombre', label: 'Nombre', required: true, full: true }, { name: 'sku', label: 'Código SKU / referencia' }, { name: 'marca', label: 'Marca' }, { name: 'modelo', label: 'Modelo o referencia' },
        { name: 'categoria', label: 'Categoría', type: 'select', options: Object.keys(cats), required: true }, { name: 'subcategoria', label: 'Subcategoría', type: 'select', options: [...new Set(Object.values(cats).flat())] },
        { name: 'descripcion', label: 'Descripción', type: 'textarea', full: true, rows: 2 }
      ] },
      { title: 'Precios y existencias', fields: [
        { name: 'unidad', label: 'Unidad de medida', type: 'select', options: ['und', 'par', 'caja', 'paquete', 'kit', 'servicio'], placeholder: false },
        { name: 'costo', label: 'Costo unitario de referencia', type: 'money', hint: 'Se usa si aún no hay entradas' }, { name: 'precio', label: 'Precio de venta', type: 'money' },
        { name: 'ivaPct', label: 'IVA %', type: 'select', options: [[0, '0% (exento)'], [5, '5%'], [19, '19%']], placeholder: false },
        { name: 'stockMin', label: 'Stock mínimo', type: 'number' }, { name: 'stockMax', label: 'Stock máximo (opcional)', type: 'number' },
        { name: 'ubicacion', label: 'Ubicación' }, { name: 'proveedor', label: 'Proveedor', default: 'Medihumana' },
        { name: 'reposicionDias', label: 'Tiempo de reposición (días)', type: 'number' },
        { name: 'estado', label: 'Estado', type: 'select', options: [['activo', 'Activo'], ['inactivo', 'Inactivo']], placeholder: false }
      ] },
      ...(nuevo ? [{ title: 'Existencia inicial (opcional)', fields: [{ name: 'stockInicial', label: 'Cantidad inicial', type: 'number', hint: 'Crea una entrada de ajuste con el costo de referencia' }] }] : [])
    ],
    onSubmit: async f => {
      if (f.sku && store.all('productos').some(x => x.id !== id && String(x.sku) === String(f.sku))) throw new Error('Ya existe un producto con ese SKU.');
      const { stockInicial, ...row } = f;
      const ops = [{ table: 'productos', mode: nuevo ? 'insert' : 'upsert', rows: [{ ...row, id, familia: undefined }], base: nuevo ? undefined : { [id]: p.updatedAt } }];
      if (nuevo && Number(stockInicial) > 0) ops.push({ table: 'movimientos', mode: 'insert', rows: [{ id: 'mv-ini-' + id, productoId: id, fecha: today(), tipo: 'entrada', cantidad: Number(stockInicial), costoUnit: Number(f.costo) || 0, documento: 'Existencia inicial', responsable: 'Inventario inicial' }] });
      await store.batch(ops); toast(nuevo ? 'Producto creado' : 'Producto actualizado');
    }
  });
}

export function formMovimiento(pre = {}) {
  const id = uid('mv');
  formModal({
    title: 'Movimiento de inventario', size: 'md', values: { fecha: today(), tipo: 'entrada', ...pre },
    sections: [{ fields: [
      { name: 'productoId', label: 'Producto', type: 'producto', required: true, full: true },
      { name: 'tipo', label: 'Tipo', type: 'select', options: Object.entries(TIPOS_MOV), required: true, placeholder: false },
      { name: 'cantidad', label: 'Cantidad', type: 'number', required: true },
      { name: 'fecha', label: 'Fecha', type: 'date', required: true },
      { name: 'costoUnit', label: 'Costo unitario', type: 'money', showIf: { tipo: ['entrada', 'ajuste_pos', 'devolucion'] }, hint: 'Factura del proveedor (sin IVA si lo descuentas)' },
      { name: 'precioUnit', label: 'Precio de venta unitario', type: 'money', showIf: { tipo: ['salida'] } },
      { name: 'documento', label: 'Documento relacionado', hint: 'Ej.: MH 106250' },
      { name: 'clienteId', label: 'Cliente (si aplica)', type: 'cliente', showIf: { tipo: ['salida', 'devolucion'] }, full: true },
      { name: 'proveedor', label: 'Proveedor', default: 'Medihumana', showIf: { tipo: ['entrada'] } },
      { name: 'serie', label: 'Serie(s)' }, { name: 'responsable', label: 'Responsable' },
      { name: 'observaciones', label: 'Observaciones', type: 'textarea', full: true, rows: 2 }
    ] }],
    onSubmit: async f => {
      const err = validarMovimiento({ ...f, id }); if (err) throw new Error(err);
      if (f.tipo === 'entrada' && !(f.costoUnit > 0)) throw new Error('Indica el costo unitario de la entrada para valorizar el inventario.');
      await store.insert('movimientos', [{ id, ...f, cantidad: Number(f.cantidad) }]);
      toast(`Movimiento registrado. Existencia: ${kardex(f.productoId).stock}`);
    }
  });
}

async function revertir(m) {
  if (!requiere('anular')) return;
  const motivo = await confirmar({ title: 'Revertir movimiento', text: `Se crea un movimiento contrario por ${m.cantidad} unidades. El original queda marcado como revertido (trazabilidad).`, ok: 'Revertir', input: 'Motivo' });
  if (!motivo) return;
  const inv = { entrada: 'ajuste_neg', salida: 'ajuste_pos', devolucion: 'ajuste_neg', ajuste_pos: 'ajuste_neg', ajuste_neg: 'ajuste_pos' }[m.tipo];
  const err = validarMovimiento({ productoId: m.productoId, tipo: inv, cantidad: m.cantidad }); if (err) { toast(err, 'error', 6000); return; }
  await store.batch([
    { table: 'movimientos', mode: 'insert', rows: [{ id: 'rev-' + m.id, productoId: m.productoId, fecha: today(), tipo: inv, cantidad: m.cantidad, costoUnit: m.costoUnit, documento: 'Reverso ' + (m.documento || ''), reversoDe: m.id, observaciones: motivo, responsable: 'Reverso' }] },
    { table: 'movimientos', mode: 'upsert', rows: [{ id: m.id, revertido: true }] },
    { table: 'auditoria', mode: 'insert', rows: [{ id: uid('au'), fecha: today(), tabla: 'movimientos', registroId: m.id, accion: 'revertir', detalle: motivo }] }
  ]);
  toast('Movimiento revertido');
}
