import { $, $$, esc, money, fdate, today, addDays } from '../util.js';
import { store, TABLES } from '../store.js';
import { docsCxc, resumenCxc, RANGOS, antiguedad, clienteNombre, clientes, cuentaProveedor, inventario, resumenInventario, estadoCot, ESTADOS_COT, oportunidades, TIPOS_OP, FUENTES, sum, cfg, ESTADO_DOC } from '../domain.js';
import { ICON, entregarArchivo } from '../ui.js';

const per = { desde: '', hasta: '' };
export function render(main) {
  if (!per.desde) { per.hasta = today(); per.desde = today().slice(0, 8) + '01'; }
  main.innerHTML = `<div class="page">
    <div class="page-h"><div><h1>Reportes</h1><p class="muted">Cada reporte se genera en este dispositivo en Excel o PDF. Puedes descargarlo, compartirlo o guardarlo en Drive (04_Reportes_Excel / 05_Reportes_PDF).</p></div></div>
    <section class="panel per"><label class="fld"><span>Desde</span><input type="date" id="r-d" value="${per.desde}"></label><label class="fld"><span>Hasta</span><input type="date" id="r-h" value="${per.hasta}"></label>
      <div class="chips">${[['mes', 'Este mes'], ['ant', 'Mes anterior'], ['3m', 'Últimos 3 meses'], ['anio', 'Este año']].map(([k, t]) => `<button class="chip" data-p="${k}">${t}</button>`).join('')}</div>
      <p class="muted small">El periodo aplica a abonos, recaudos, ventas y cotizaciones.</p></section>
    <div class="rep-grid">${REPS.map(r => `<article class="rep"><h3>${esc(r.t)}</h3><p class="muted small">${esc(r.d)}</p><div class="row-btns"><button class="btn btn-sm" data-x="${r.k}">${ICON.download} Excel</button>${r.pdf === false ? '' : `<button class="btn btn-sm" data-pdf="${r.k}">${ICON.doc} PDF</button>`}</div></article>`).join('')}</div>
  </div>`;
  $('#r-d', main).onchange = e => per.desde = e.target.value;
  $('#r-h', main).onchange = e => per.hasta = e.target.value;
  $$('[data-p]', main).forEach(b => b.onclick = () => {
    const h = today(); const k = b.dataset.p;
    if (k === 'mes') { per.desde = h.slice(0, 8) + '01'; per.hasta = h; }
    if (k === 'ant') { const fin = addDays(h.slice(0, 8) + '01', -1); per.desde = fin.slice(0, 8) + '01'; per.hasta = fin; }
    if (k === '3m') { per.desde = addDays(h, -92); per.hasta = h; }
    if (k === 'anio') { per.desde = h.slice(0, 4) + '-01-01'; per.hasta = h; }
    render(main);
  });
  main.onclick = async e => {
    const x = e.target.closest('[data-x]'), p = e.target.closest('[data-pdf]');
    if (!x && !p) return;
    const k = (x || p).dataset.x || (x || p).dataset.pdf;
    const r = REPS.find(r => r.k === k);
    const btn = x || p; btn.disabled = true;
    try {
      const data = r.build();
      const base = r.periodo ? `${r.file}_${per.desde}_a_${per.hasta}` : `${r.file}_${today()}`;
      const out = await import('../output.js');
      if (x) {
        const blob = await out.excel(data.hojas || [{ nombre: r.t.slice(0, 31), columnas: data.columnas, filas: data.filas }]);
        entregarArchivo({ blob, nombre: base + '.xlsx', carpeta: '04_Reportes_Excel' });
      } else {
        const blob = await out.reportePdf({ titulo: r.t, subtitulo: r.periodo ? `Periodo ${fdate(per.desde)} a ${fdate(per.hasta)}` : `Corte ${fdate(today())}`, columnas: data.columnas.filter(c => !c.noPdf), filas: data.filas, totales: data.totales, resumen: data.resumen || [], orientacion: data.columnas.length > 6 ? 'landscape' : 'portrait' });
        entregarArchivo({ blob, nombre: base + '.pdf', carpeta: '05_Reportes_PDF' });
      }
    } catch (err) { (await import('../util.js')).toast(err.message, 'error', 6000); }
    finally { btn.disabled = false; }
  };
}
const inPer = f => f && f >= per.desde && f <= per.hasta;

const REPS = [
  { k: 'cxcCliente', t: 'Cartera por cliente', d: 'Saldo total, vencido y vigente por cliente.', file: 'Cartera_por_cliente', build() {
    const m = new Map();
    for (const d of docsCxc().filter(d => d.saldo > 0)) { const o = m.get(d.clienteId) || { cliente: clienteNombre(d.clienteId), docs: 0, saldo: 0, vencido: 0, vigente: 0 }; o.docs++; o.saldo += d.saldo; d.estado === 'vencida' ? o.vencido += d.saldo : o.vigente += d.saldo; m.set(d.clienteId, o); }
    const filas = [...m.values()].sort((a, b) => b.saldo - a.saldo);
    return { columnas: [{ key: 'cliente', label: 'Cliente' }, { key: 'docs', label: 'Docs', num: true }, { key: 'vigente', label: 'Vigente', money: true }, { key: 'vencido', label: 'Vencido', money: true }, { key: 'saldo', label: 'Saldo', money: true }], filas, totales: { vigente: sum(filas, 'vigente'), vencido: sum(filas, 'vencido'), saldo: sum(filas, 'saldo') } };
  } },
  { k: 'cxcDocs', t: 'Cartera vencida y vigente', d: 'Todos los documentos con saldo y su estado.', file: 'Cartera_documentos', build() {
    const filas = docsCxc().filter(d => d.saldo > 0).map(d => ({ ...d, cliente: clienteNombre(d.clienteId), estadoTxt: ESTADO_DOC[d.estado] })).sort((a, b) => (a.fechaVencimiento || '').localeCompare(b.fechaVencimiento || ''));
    const r = resumenCxc();
    return { columnas: [{ key: 'cliente', label: 'Cliente' }, { key: 'numero', label: 'Número' }, { key: 'fechaEmision', label: 'Emisión', date: true }, { key: 'fechaVencimiento', label: 'Vence', date: true }, { key: 'concepto', label: 'Concepto', noPdf: true }, { key: 'valor', label: 'Valor', money: true }, { key: 'saldo', label: 'Saldo', money: true }, { key: 'estadoTxt', label: 'Estado' }, { key: 'diasVencido', label: 'Días venc.', num: true }], filas, totales: { saldo: sum(filas, 'saldo') }, resumen: [['Total', money(r.total)], ['Vencida', money(r.vencida)], ['Vigente', money(r.vigente)], ['% vencida', r.pctVencida.toFixed(1) + '%']] };
  } },
  { k: 'aging', t: 'Antigüedad de cartera', d: 'Saldo por cliente en rangos de días vencidos.', file: 'Antiguedad_cartera', build() {
    const m = new Map();
    for (const d of docsCxc().filter(d => d.saldo > 0)) { const o = m.get(d.clienteId) || Object.fromEntries([['cliente', clienteNombre(d.clienteId)], ['total', 0], ...RANGOS.map(([k]) => [k, 0])]); o[antiguedad(d)] += d.saldo; o.total += d.saldo; m.set(d.clienteId, o); }
    const filas = [...m.values()].sort((a, b) => b.total - a.total);
    return { columnas: [{ key: 'cliente', label: 'Cliente' }, ...RANGOS.map(([k, t]) => ({ key: k, label: t, money: true })), { key: 'total', label: 'Total', money: true }], filas, totales: Object.fromEntries([...RANGOS.map(([k]) => [k, sum(filas, k)]), ['total', sum(filas, 'total')]]) };
  } },
  { k: 'abonos', t: 'Abonos por periodo', d: 'Detalle de abonos recibidos en el periodo.', file: 'Abonos', periodo: true, build() {
    const filas = store.all('cxc_abonos').filter(a => !a.anulado && inPer(a.fecha)).map(a => { const d = store.get('cxc_docs', a.docId); return { ...a, cliente: clienteNombre(a.clienteId), doc: d ? `${d.tipoDoc || ''} ${d.numero || ''}` : '' }; }).sort((a, b) => a.fecha.localeCompare(b.fecha));
    return { columnas: [{ key: 'fecha', label: 'Fecha', date: true }, { key: 'cliente', label: 'Cliente' }, { key: 'doc', label: 'Documento' }, { key: 'medio', label: 'Medio' }, { key: 'referencia', label: 'Referencia' }, { key: 'valor', label: 'Valor', money: true }], filas, totales: { valor: sum(filas, 'valor') } };
  } },
  { k: 'medios', t: 'Recaudos por medio de pago', d: 'Total recaudado por medio en el periodo.', file: 'Recaudos_por_medio', periodo: true, build() {
    const m = {}; for (const a of store.all('cxc_abonos').filter(a => !a.anulado && inPer(a.fecha))) { m[a.medio || 'Sin medio'] = m[a.medio || 'Sin medio'] || { medio: a.medio || 'Sin medio', n: 0, valor: 0 }; m[a.medio || 'Sin medio'].n++; m[a.medio || 'Sin medio'].valor += a.valor; }
    const filas = Object.values(m).sort((a, b) => b.valor - a.valor);
    return { columnas: [{ key: 'medio', label: 'Medio de pago' }, { key: 'n', label: 'Abonos', num: true }, { key: 'valor', label: 'Valor', money: true }], filas, totales: { valor: sum(filas, 'valor') } };
  } },
  { k: 'top', t: 'Clientes con mayor saldo', d: 'Los 20 clientes con más saldo pendiente.', file: 'Top_saldos', build() { const r = REPS[0].build(); r.filas = r.filas.slice(0, 20); return r; } },
  { k: 'cats', t: 'Cartera por categoría y subcategoría', d: 'Saldo agrupado por clasificación.', file: 'Cartera_por_categoria', build() {
    const m = {}; for (const d of docsCxc().filter(d => d.saldo > 0)) { const k = (d.categoria || 'Sin categoría') + '|' + (d.subcategoria || '—'); m[k] = m[k] || { categoria: d.categoria || 'Sin categoría', subcategoria: d.subcategoria || '—', docs: 0, saldo: 0, vencido: 0 }; m[k].docs++; m[k].saldo += d.saldo; if (d.estado === 'vencida') m[k].vencido += d.saldo; }
    const filas = Object.values(m).sort((a, b) => b.saldo - a.saldo);
    return { columnas: [{ key: 'categoria', label: 'Categoría' }, { key: 'subcategoria', label: 'Subcategoría' }, { key: 'docs', label: 'Docs', num: true }, { key: 'vencido', label: 'Vencido', money: true }, { key: 'saldo', label: 'Saldo', money: true }], filas, totales: { saldo: sum(filas, 'saldo'), vencido: sum(filas, 'vencido') } };
  } },
  { k: 'prov', t: 'Medihumana: facturas pendientes', d: 'Facturas con saldo según aplicación de pagos (más antiguas primero).', file: 'Medihumana_pendientes', build() {
    const c = cuentaProveedor();
    return { columnas: [{ key: 'numero', label: 'Factura' }, { key: 'fecha', label: 'Fecha', date: true }, { key: 'venc', label: 'Vence', date: true }, { key: 'paciente', label: 'Paciente' }, { key: 'valor', label: 'Valor', money: true }, { key: 'pendiente', label: 'Pendiente', money: true }, { key: 'estado', label: 'Estado' }], filas: c.abiertas, totales: { pendiente: sum(c.abiertas, 'pendiente') }, resumen: [['Saldo', money(c.saldo)], ['Vencido', money(c.vencido)], ['Pagado este mes', money(c.pagosMes)]] };
  } },
  { k: 'inv', t: 'Inventario valorizado', d: 'Existencias, costo promedio y valor por producto.', file: 'Inventario_valorizado', build() {
    const filas = inventario().filter(p => p.estado !== 'inactivo'); const r = resumenInventario();
    return { columnas: [{ key: 'sku', label: 'SKU' }, { key: 'nombre', label: 'Producto' }, { key: 'categoria', label: 'Categoría' }, { key: 'stock', label: 'Existencia', num: true }, { key: 'stockMin', label: 'Mínimo', num: true }, { key: 'costoProm', label: 'Costo prom.', money: true }, { key: 'valor', label: 'Valor', money: true }], filas, totales: { valor: r.valor }, resumen: [['Valor a costo', money(r.valor)], ['Stock bajo', r.bajo], ['Agotados', r.agotados]] };
  } },
  { k: 'cot', t: 'Cotizaciones del periodo', d: 'Cotizaciones con su estado y valor.', file: 'Cotizaciones', periodo: true, build() {
    const filas = store.all('cotizaciones').filter(q => inPer(q.fecha)).map(q => ({ ...q, clienteN: q.cliente?.nombre || clienteNombre(q.clienteId), est: ESTADOS_COT[estadoCot(q)] }));
    return { columnas: [{ key: 'numero', label: 'Número' }, { key: 'fecha', label: 'Fecha', date: true }, { key: 'clienteN', label: 'Cliente' }, { key: 'tipo', label: 'Tipo' }, { key: 'est', label: 'Estado' }, { key: 'total', label: 'Total', money: true }], filas, totales: { total: sum(filas, 'total') } };
  } },
  { k: 'ventas', t: 'Ventas del periodo', d: 'Ventas y pedidos registrados.', file: 'Ventas', periodo: true, build() {
    const filas = store.all('ventas').filter(v => v.estado !== 'anulada' && inPer(v.fecha)).map(v => ({ ...v, clienteN: clienteNombre(v.clienteId), det: (v.items || []).map(i => `${i.cantidad}× ${i.descripcion}`).join(' · ') }));
    return { columnas: [{ key: 'numero', label: 'Número' }, { key: 'fecha', label: 'Fecha', date: true }, { key: 'clienteN', label: 'Cliente' }, { key: 'det', label: 'Detalle', noPdf: true }, { key: 'total', label: 'Total', money: true }], filas, totales: { total: sum(filas, 'total') } };
  } },
  { k: 'ops', t: 'Oportunidades comerciales', d: 'Alarmas de los próximos días con su origen (estimado o manual).', file: 'Oportunidades', build() {
    const filas = oportunidades().map(o => ({ ...o, cliente: clienteNombre(o.clienteId), tipoTxt: TIPOS_OP[o.tipo], fuenteT: FUENTES[o.fuente], tel: store.get('clientes', o.clienteId)?.whatsapp || store.get('clientes', o.clienteId)?.telefono || '' }));
    return { columnas: [{ key: 'fecha', label: 'Fecha estimada', date: true }, { key: 'cliente', label: 'Cliente' }, { key: 'tel', label: 'Teléfono' }, { key: 'tipoTxt', label: 'Tipo' }, { key: 'titulo', label: 'Detalle' }, { key: 'prioridad', label: 'Prioridad' }, { key: 'fuenteT', label: 'Origen' }], filas };
  } },
  { k: 'base', t: 'Base de datos completa', d: 'Todas las tablas en un solo Excel, para cruces.', file: 'BD_GestionComercial', pdf: false, build() {
    return { hojas: TABLES.filter(t => t !== 'config').map(t => { const filas = store.all(t); const keys = [...new Set(filas.flatMap(r => Object.keys(r)))]; return { nombre: t, columnas: keys.map(k => ({ key: k, label: k, date: /fecha|vence|venc$/i.test(k) && !/Ms$/.test(k) })), filas }; }) };
  } }
];
