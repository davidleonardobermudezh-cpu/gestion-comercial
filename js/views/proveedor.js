import { $, $$, esc, money, fdate, today, uid, toast, addDays, slug, monthKey } from '../util.js';
import { store } from '../store.js';
import { cfg, cuentaProveedor, extractoProveedor, clienteNombre, familiaDe, sum } from '../domain.js';
import { ICON, formModal, confirmar, badge, subirSoporte, entregarArchivo } from '../ui.js';
import { renderTable } from '../table.js';
import { requiere, puede } from '../auth.js';

const view = { tab: 'extracto' };
const EST = { pendiente: 'Pendiente', parcial: 'Abonada', pagada: 'Pagada', vencida: 'Vencida' };

export function render(main) {
  const p = cfg('proveedor');
  const c = cuentaProveedor();
  const hist = store.all('prov_docs').filter(d => d.historico).length;
  main.innerHTML = `<div class="page">
    <div class="page-h"><div><h1>Cuenta ${esc(p.nombre)}</h1><p class="muted">NIT ${esc(p.nit)} · Plazo ${esc(p.plazoDias)} días · Pagos globales aplicados a las facturas más antiguas primero.</p></div>
      <div class="row-btns"><button class="btn" id="pv-nc">Nota crédito</button><button class="btn" id="pv-fac">${ICON.plus} Factura</button><button class="btn btn-primary" id="pv-pago">${ICON.money} Registrar pago</button></div></div>
    <section class="strip">
      <div class="st st-big ${c.vencido ? 'st-warn' : ''}"><span>${c.saldo < 0 ? 'Saldo a favor' : 'Saldo por pagar'}</span><b class="num">${money(Math.abs(c.saldo))}</b></div>
      <div class="st ${c.vencido ? 'st-bad' : ''}"><span>Vencido</span><b class="num">${money(c.vencido)}</b></div>
      <div class="st"><span>Próximo vencimiento</span><b class="num">${c.proxima ? fdate(c.proxima.venc) : '—'}</b><small>${c.proxima ? 'Factura ' + esc(c.proxima.numero) + ' · ' + money(c.proxima.pendiente) : ''}</small></div>
      <div class="st"><span>Facturas abiertas</span><b class="num">${c.abiertas.length}</b></div>
      <div class="st st-good"><span>Pagado este mes</span><b class="num">${money(c.pagosMes)}</b></div>
      <div class="st"><span>Compras este mes</span><b class="num">${money(c.comprasMes)}</b></div>
    </section>
    <nav class="tabs">${[['extracto', 'Estado de cuenta'], ['facturas', 'Facturas'], ['pagos', 'Pagos'], ['historico', `Histórico (${hist})`]].map(([k, t]) => `<button class="${view.tab === k ? 'on' : ''}" data-tab="${k}">${t}</button>`).join('')}</nav>
    <div id="pv-body"></div></div>`;
  $('#pv-fac', main).onclick = () => formFacturaProv({});
  $('#pv-pago', main).onclick = () => formPagoProv({});
  $('#pv-nc', main).onclick = () => formNotaCredito({});
  $$('[data-tab]', main).forEach(b => b.onclick = () => { view.tab = b.dataset.tab; render(main); });
  const host = $('#pv-body', main);
  if (view.tab === 'extracto') extracto(host);
  if (view.tab === 'facturas') facturas(host, c);
  if (view.tab === 'pagos') pagos(host);
  if (view.tab === 'historico') historico(host);
}

const CLASE = { saldo_inicial: 'Saldo inicial', factura: 'Factura', nota_credito: 'Nota crédito', pago: 'Pago' };
function extracto(host) {
  const rows = extractoProveedor().reverse().map(m => ({ ...m, claseTxt: CLASE[m.clase] || m.clase }));
  renderTable(host, {
    id: 'pv-ext', rows, search: ['numero', 'paciente', 'descripcion', 'referencia', 'claseTxt'], searchPlaceholder: 'Número, paciente o referencia…',
    filters: [{ key: 'clase', label: 'Tipo', options: Object.entries(CLASE) }, { key: 'mes', label: 'Periodo', options: [['mes', 'Este mes'], ['3m', 'Últimos 3 meses'], ['anio', 'Este año']], test: (r, v) => v === 'mes' ? monthKey(r.fecha) === monthKey(today()) : v === '3m' ? r.fecha >= addDays(today(), -92) : (r.fecha || '').startsWith(today().slice(0, 4)) }],
    columns: [
      { key: 'fecha', label: 'Fecha', date: true, sort: r => (r.fecha || '') + String(r.createdAt || 0).padStart(15, '0') },
      { key: 'claseTxt', label: 'Movimiento', primary: true, render: r => `<b>${esc(r.claseTxt)} ${esc(r.numero || r.referencia || '')}</b><small class="sub">${esc(r.paciente || r.descripcion || r.observaciones || '')}${r.registradoPor ? ' · registró ' + esc(r.registradoPor) : ''}</small>${r.soporteUrl ? ` <a href="${esc(r.soporteUrl)}" target="_blank" rel="noopener">${ICON.clip}</a>` : ''}` },
      { key: 'cargo', label: 'Cargo', money: true, render: r => r.cargo ? money(r.cargo) : '' },
      { key: 'abono', label: 'Abono', money: true, render: r => r.abono ? `<span class="t-good">-${money(r.abono)}</span>` : '' },
      { key: 'saldo', label: 'Saldo', money: true, render: r => `<b>${money(r.saldo)}</b>` },
      { key: 'acc', label: '', nosort: true, render: r => !puede('anular') ? '' : `<button class="btn btn-sm btn-ghost" data-anular="${esc(r.clase === 'pago' ? 'p:' : 'd:')}${esc(r.id)}" title="Anular">${ICON.undo}<span class="sr">Anular</span></button>` }
    ],
    toolbar: `<button class="btn" id="pv-xls">${ICON.download} Excel</button><button class="btn" id="pv-pdf">${ICON.doc} PDF</button>`
  });
  host.addEventListener('click', e => { const b = e.target.closest('[data-anular]'); if (b) anular(b.dataset.anular); });
  $('#pv-xls', host).onclick = async () => {
    const { excel } = await import('../output.js');
    const f = extractoProveedor();
    const blob = await excel([
      { nombre: 'Estado de cuenta', columnas: [{ key: 'fecha', label: 'Fecha', date: true }, { key: 'claseTxt', label: 'Tipo' }, { key: 'numero', label: 'Número' }, { key: 'paciente', label: 'Paciente' }, { key: 'descripcion', label: 'Descripción' }, { key: 'referencia', label: 'Referencia' }, { key: 'cargo', label: 'Cargo', money: true }, { key: 'abono', label: 'Abono', money: true }, { key: 'saldo', label: 'Saldo', money: true }], filas: f.map(m => ({ ...m, claseTxt: CLASE[m.clase] })) },
      { nombre: 'Facturas abiertas', columnas: COLS_FAC, filas: cuentaProveedor().abiertas }
    ]);
    entregarArchivo({ blob, nombre: `Medihumana_estado_cuenta_${today()}.xlsx`, carpeta: '04_Reportes_Excel' });
  };
  $('#pv-pdf', host).onclick = async () => {
    const { reportePdf } = await import('../output.js');
    const c = cuentaProveedor();
    const blob = await reportePdf({ titulo: 'Estado de cuenta Medihumana', subtitulo: 'Corte ' + fdate(today()), resumen: [['Saldo', money(c.saldo)], ['Vencido', money(c.vencido)], ['Facturas abiertas', c.abiertas.length], ['Pagado este mes', money(c.pagosMes)]], columnas: COLS_FAC.filter(x => x.key !== 'descripcion'), filas: c.abiertas, totales: { pendiente: c.abiertas.reduce((s, f) => s + f.pendiente, 0) } });
    entregarArchivo({ blob, nombre: `Medihumana_estado_cuenta_${today()}.pdf`, carpeta: '05_Reportes_PDF' });
  };
}
const COLS_FAC = [{ key: 'numero', label: 'Factura' }, { key: 'fecha', label: 'Fecha', date: true }, { key: 'venc', label: 'Vence', date: true }, { key: 'paciente', label: 'Paciente' }, { key: 'descripcion', label: 'Descripción' }, { key: 'valor', label: 'Valor', money: true }, { key: 'pendiente', label: 'Pendiente', money: true }, { key: 'estado', label: 'Estado' }];

function facturas(host, c) {
  const rows = c.facturas.slice().reverse();
  renderTable(host, {
    id: 'pv-fac', rows, defaultSort: 'fecha', search: ['numero', 'paciente', 'descripcion'],
    filters: [{ key: 'estado', label: 'Estado', options: [['abiertas', 'Con saldo'], ...Object.entries(EST)], test: (r, v) => v === 'abiertas' ? r.pendiente > 0 : r.estado === v }],
    columns: [
      { key: 'numero', label: 'Factura', primary: true, render: r => `<b>${r.tipo === 'saldo_inicial' ? 'Saldo inicial' : 'MH ' + esc(r.numero)}</b><small class="sub">${esc(r.paciente || '')} ${esc(r.descripcion || '')}</small>` },
      { key: 'fecha', label: 'Fecha', date: true }, { key: 'venc', label: 'Vence', date: true },
      { key: 'valor', label: 'Valor', money: true, hideMobile: true }, { key: 'pendiente', label: 'Pendiente', money: true },
      { key: 'estado', label: 'Estado', render: r => badge(r.estado === 'parcial' ? 'parcial' : r.estado, EST[r.estado]) }
    ], totals: { pendiente: true }
  });
}
function pagos(host) {
  const rows = store.all('prov_abonos').filter(a => !a.historico);
  renderTable(host, {
    id: 'pv-pagos', rows, defaultSort: 'fecha', search: ['referencia', 'medio', 'observaciones'],
    columns: [{ key: 'fecha', label: 'Fecha', date: true }, { key: 'medio', label: 'Medio' }, { key: 'referencia', label: 'Referencia', render: r => `${esc(r.referencia || '')}${r.soporteUrl ? ` <a href="${esc(r.soporteUrl)}" target="_blank" rel="noopener">${ICON.clip}</a>` : ''}` },
      { key: 'valor', label: 'Valor', money: true, render: r => r.anulado ? `<s class="muted">${money(r.valor)}</s> ${badge('anulada', 'Anulado')}` : `<b>${money(r.valor)}</b>` },
      { key: 'acc', label: '', nosort: true, render: r => r.anulado ? '' : `<button class="btn btn-sm btn-ghost" data-anular="p:${esc(r.id)}">${ICON.undo}<span class="sr">Anular</span></button>` }],
    totals: { valor: true }
  });
  host.addEventListener('click', e => { const b = e.target.closest('[data-anular]'); if (b) anular(b.dataset.anular); });
}
function historico(host) {
  const docs = store.all('prov_docs').filter(d => d.historico).map(d => ({ ...d, clase: d.tipo }));
  const pag = store.all('prov_abonos').filter(d => d.historico).map(d => ({ ...d, clase: 'pago' }));
  host.innerHTML = `<p class="muted small panel-note">Movimientos anteriores al corte del ${fdate(store.cfg('corteProveedor', ''))} importados del Excel. Sirven como historial de compras por paciente; no afectan el saldo actual, que parte del saldo inicial del corte.</p><div id="pv-h"></div>`;
  renderTable($('#pv-h', host), {
    id: 'pv-hist', rows: [...docs, ...pag], defaultSort: 'fecha', search: ['numero', 'paciente', 'descripcion'],
    columns: [{ key: 'fecha', label: 'Fecha', date: true }, { key: 'clase', label: 'Tipo', render: r => esc(CLASE[r.clase] || r.clase) }, { key: 'numero', label: 'Número' }, { key: 'paciente', label: 'Paciente', primary: true }, { key: 'descripcion', label: 'Descripción', hideMobile: true }, { key: 'valor', label: 'Valor', money: true }]
  });
}

async function anular(ref) {
  if (!requiere('anular')) return;
  const [k, id] = ref.split(':');
  const table = k === 'p' ? 'prov_abonos' : 'prov_docs';
  const r = store.get(table, id); if (!r) return;
  const motivo = await confirmar({ title: 'Anular movimiento', text: `${CLASE[k === 'p' ? 'pago' : r.tipo]} de ${money(r.valor)} del ${fdate(r.fecha)}. Queda registrado como anulado y el saldo se recalcula.`, ok: 'Anular', danger: true, input: 'Motivo' });
  if (!motivo) return;
  await store.batch([{ table, mode: 'upsert', rows: [{ id, anulado: true, motivoAnulacion: motivo }] }, { table: 'auditoria', mode: 'insert', rows: [{ id: uid('au'), fecha: today(), tabla: table, registroId: id, accion: 'anular', detalle: motivo }] }]);
  toast('Movimiento anulado');
}

/* ------------------------- Formularios ------------------------- */
export function formFacturaProv(v = {}) {
  const id = v.id || uid('pf');
  const plazo = Number(cfg('proveedor').plazoDias) || 30;
  formModal({
    title: 'Factura de Medihumana', size: 'lg', submitLabel: 'Registrar factura',
    values: { fecha: today(), registrarEntrega: true, ...v },
    sections: [
      { title: 'Factura', fields: [
        { name: 'numero', label: 'Número de factura (MH)', required: true },
        { name: 'fecha', label: 'Fecha de la factura', type: 'date', required: true },
        { name: 'fechaVencimiento', label: 'Fecha de vencimiento', type: 'date', hint: `Si la dejas vacía: fecha + ${plazo} días` },
        { name: 'valor', label: 'Total de la factura', type: 'money', required: true, hint: 'Valor TOTAL con IVA' },
        { name: 'descripcion', label: 'Descripción (productos)', full: true, required: true, hint: 'Ej.: KIT AUDIFONO RUBY 2 MINIRITE R ... 96560528 - 96561076' },
        { name: 'soporte', label: 'Adjuntar factura (PDF o foto)', type: 'file', full: true, hint: store.remote ? 'Se guarda en Drive › 01_Cartera' : 'Disponible al conectar Google' }
      ] },
      { title: 'Paciente (opcional)', fields: [
        { name: 'clienteId', label: 'Paciente para quien se pidió', type: 'cliente', full: true },
        { name: 'registrarEntrega', label: 'Registrar como compra del paciente (alimenta las alarmas de mantenimiento, baterías y garantía)', type: 'checkbox', full: true },
        { name: 'series', label: 'Serie(s) del audífono', hint: 'Solo si es audífono', full: true }
      ] }
    ],
    onSubmit: async f => {
      if (!(f.valor > 0)) throw new Error('El valor debe ser mayor que cero.');
      if (store.all('prov_docs').some(d => d.id !== id && !d.anulado && d.tipo === 'factura' && String(d.numero) === String(f.numero))) throw new Error('Esa factura ya está registrada.');
      let soporteUrl = v.soporteUrl || '';
      if (f.soporte) soporteUrl = await subirSoporte(f.soporte, `Medihumana_FAC_${f.numero}`, '01_Cartera');
      const fam = familiaDe(f.descripcion);
      const ops = [{ table: 'prov_docs', mode: 'insert', rows: [{ id, tipo: 'factura', numero: f.numero, fecha: f.fecha, fechaVencimiento: f.fechaVencimiento || addDays(f.fecha, plazo), valor: f.valor, paciente: f.clienteId ? clienteNombre(f.clienteId) : '', clienteId: f.clienteId || '', descripcion: f.descripcion, soporteUrl }] }];
      if (f.clienteId && f.registrarEntrega) {
        ops.push({ table: 'entregas', mode: 'insert', rows: [{ id: 'en-' + id, clienteId: f.clienteId, fecha: f.fecha, documento: 'MH ' + f.numero, descripcion: f.descripcion, familia: fam, cantidad: 1, valor: f.valor, origen: 'proveedor' }] });
        if (fam === 'audifono') ops.push({ table: 'equipos', mode: 'insert', rows: [{ id: 'eq-' + id, clienteId: f.clienteId, descripcion: f.descripcion, series: f.series || '', fechaEntrega: f.fecha, garantiaMeses: cfg('reglas').garantiaMeses, documento: 'MH ' + f.numero, estado: 'activo' }] });
      }
      await store.batch(ops);
      toast('Factura registrada. Saldo Medihumana: ' + money(cuentaProveedor().saldo));
    }
  });
}
export function formNotaCredito(v = {}) {
  const id = uid('pn');
  formModal({
    title: 'Nota crédito de Medihumana', size: 'md', values: { fecha: today() },
    sections: [{ fields: [
      { name: 'numero', label: 'Número de nota crédito', required: true }, { name: 'fecha', label: 'Fecha', type: 'date', required: true },
      { name: 'valor', label: 'Valor', type: 'money', required: true }, { name: 'descripcion', label: 'Motivo / factura afectada', full: true, required: true },
      { name: 'soporte', label: 'Adjuntar soporte', type: 'file', full: true }
    ] }],
    onSubmit: async f => {
      if (!(f.valor > 0)) throw new Error('El valor debe ser mayor que cero.');
      let soporteUrl = ''; if (f.soporte) soporteUrl = await subirSoporte(f.soporte, `Medihumana_NC_${f.numero}`, '01_Cartera');
      await store.insert('prov_docs', [{ id, tipo: 'nota_credito', numero: f.numero, fecha: f.fecha, valor: f.valor, descripcion: f.descripcion, soporteUrl }]);
      toast('Nota crédito registrada');
    }
  });
}
export function formPagoProv(v = {}) {
  const id = uid('pp');
  const c = cuentaProveedor();
  formModal({
    title: 'Pago a Medihumana', size: 'md', submitLabel: 'Registrar pago', values: { fecha: today(), medio: 'Transferencia BBVA' },
    sections: [{ fields: [
      { name: 'info', label: 'Saldo actual', type: 'readonly', full: true, html: `<b class="num">${money(c.saldo)}</b>${c.vencido ? ` · <span class="t-bad">${money(c.vencido)} vencido</span>` : ''}` },
      { name: 'valor', label: 'Valor pagado', type: 'money', required: true }, { name: 'fecha', label: 'Fecha', type: 'date', required: true },
      { name: 'medio', label: 'Medio', type: 'select', options: cfg('mediosPago') }, { name: 'referencia', label: 'Referencia / comprobante' },
      { name: 'soporte', label: 'Comprobante (foto o PDF)', type: 'file', full: true }, { name: 'observaciones', label: 'Observaciones', type: 'textarea', full: true, rows: 2 }
    ] }],
    onSubmit: async f => {
      if (!(f.valor > 0)) throw new Error('El valor debe ser mayor que cero.');
      const dup = store.all('prov_abonos').find(a => !a.anulado && a.fecha === f.fecha && Math.abs(a.valor - f.valor) < 1 && (a.referencia || '') === (f.referencia || ''));
      if (dup) throw new Error('Ya hay un pago igual (misma fecha, valor y referencia). Si es otro pago, cambia la referencia.');
      if (f.valor > c.saldo + 0.5 && !(await confirmar({ title: 'Pago mayor al saldo', text: `El pago supera el saldo (${money(c.saldo)}). La diferencia quedará como saldo a favor. ¿Continuar?`, ok: 'Registrar' }))) return false;
      let soporteUrl = ''; if (f.soporte) soporteUrl = await subirSoporte(f.soporte, `Medihumana_PAGO_${f.fecha}_${id.slice(-4)}`, '01_Cartera');
      await store.insert('prov_abonos', [{ id, fecha: f.fecha, valor: f.valor, medio: f.medio, referencia: f.referencia, observaciones: f.observaciones, soporteUrl }]);
      toast('Pago registrado. Nuevo saldo: ' + money(cuentaProveedor().saldo));
    }
  });
}
