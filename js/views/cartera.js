import { $, $$, esc, money, fdate, today, uid, toast, addDays, monthKey, slug } from '../util.js';
import { store } from '../store.js';
import { cfg, docsCxc, docInfo, resumenCxc, ESTADO_DOC, RANGOS, antiguedad, clienteNombre, cliente, abonosDoc, validarAbono, sum } from '../domain.js';
import { ICON, formModal, openModal, confirmar, badge, subirSoporte, entregarArchivo, componerWhatsApp } from '../ui.js';
import { renderTable } from '../table.js';
import { requiere, puede } from '../auth.js';

const view = { tab: 'docs' };
export function render(main, args = []) {
  if (args[0] === 'abonos') view.tab = 'abonos';
  else if (args[0] === 'docs') view.tab = 'docs';
  if (args[0] === 'doc' && args[1]) { view.tab = 'docs'; setTimeout(() => verDocumento(args[1]), 50); }
  const r = resumenCxc();
  main.innerHTML = `<div class="page">
    <div class="page-h"><div><h1>Cartera de clientes</h1><p class="muted">Cuentas por cobrar y abonos de pacientes. La cuenta con Medihumana está aparte, en <a href="#proveedor">Medihumana</a>.</p></div>
      <div class="row-btns"><button class="btn" id="cx-doc">${ICON.plus} Cuenta por cobrar</button><button class="btn btn-primary" id="cx-ab">${ICON.money} Registrar abono</button></div></div>
    <section class="strip">
      ${st('Total pendiente', money(r.total))}${st('Vencida', money(r.vencida), r.vencida ? 'bad' : '')}${st('Vigente', money(r.vigente))}${st('Vence en 7 días', money(r.porVencer7))}
      ${st('Recaudo hoy', money(r.recaudoHoy))}${st('Recaudo del mes', money(r.recaudoMes), 'good')}${st('Clientes deudores', r.deudores)}${st('Docs. vencidos', r.docsVencidos)}${st('% vencida', (r.pctVencida || 0).toFixed(1) + '%')}
    </section>
    <section class="panel aging-panel"><h3>Antigüedad</h3><div class="aging">${RANGOS.map(([k, t]) => `<button class="ag ${k === 'vigente' ? '' : k === '90+' ? 'ag-bad' : 'ag-warn'}" data-rango="${k}"><span>${t}</span><b class="num">${money(r.aging[k])}</b></button>`).join('')}</div></section>
    <nav class="tabs"><button class="${view.tab === 'docs' ? 'on' : ''}" data-tab="docs">Documentos por cobrar</button><button class="${view.tab === 'abonos' ? 'on' : ''}" data-tab="abonos">Abonos y recaudos</button></nav>
    <div id="cx-body"></div></div>`;
  $('#cx-doc', main).onclick = () => formDocumento({});
  $('#cx-ab', main).onclick = () => formAbono({});
  $$('[data-tab]', main).forEach(b => b.onclick = () => { view.tab = b.dataset.tab; render(main); });
  $$('[data-rango]', main).forEach(b => b.onclick = () => { view.rango = b.dataset.rango; view.tab = 'docs'; render(main); });
  if (view.tab === 'docs') tablaDocs($('#cx-body', main)); else tablaAbonos($('#cx-body', main));
}
const st = (l, v, tone = '') => `<div class="st ${tone ? 'st-' + tone : ''}"><span>${esc(l)}</span><b class="num">${esc(String(v))}</b></div>`;

function tablaDocs(host) {
  const rows = docsCxc().map(d => ({ ...d, cliente: clienteNombre(d.clienteId), rango: antiguedad(d) }));
  const cats = cfg('categoriasCartera');
  const hoy = today();
  const t = renderTable(host, {
    id: 'cxc', rows, defaultSort: 'fechaVencimiento', defaultDir: 'asc', searchPlaceholder: 'Cliente, número o concepto…',
    search: ['cliente', 'numero', 'concepto', 'observaciones'],
    filters: [
      { key: 'estado', label: 'Estado', options: [['abiertos', 'Con saldo'], ...Object.entries(ESTADO_DOC)], test: (r, v) => v === 'abiertos' ? r.saldo > 0 : r.estado === v },
      { key: 'rango', label: 'Antigüedad', options: RANGOS },
      { key: 'categoria', label: 'Categoría', options: Object.keys(cats).map(c => [c, c]) },
      { key: 'subcategoria', label: 'Subcategoría', options: [...new Set(Object.values(cats).flat())].map(c => [c, c]) },
      { key: 'emision', label: 'Emisión', options: [['mes', 'Este mes'], ['3m', 'Últimos 3 meses'], ['anio', 'Este año']], test: (r, v) => v === 'mes' ? monthKey(r.fechaEmision) === monthKey(hoy) : v === '3m' ? r.fechaEmision >= addDays(hoy, -92) : (r.fechaEmision || '').slice(0, 4) === hoy.slice(0, 4) },
      { key: 'venc', label: 'Vencimiento', options: [['7', 'Próximos 7 días'], ['30', 'Próximos 30 días'], ['vencidos', 'Ya vencidos']], test: (r, v) => r.saldo > 0 && (v === 'vencidos' ? r.estado === 'vencida' : r.estado !== 'vencida' && r.diasParaVencer <= +v) }
    ],
    columns: [
      { key: 'cliente', label: 'Cliente', primary: true, render: r => `<b>${esc(r.cliente)}</b><small class="sub">${esc(r.tipoDoc || 'Factura')} ${esc(r.numero || '')} · ${esc(r.concepto || '')}</small>` },
      { key: 'fechaEmision', label: 'Emisión', date: true, hideMobile: true },
      { key: 'fechaVencimiento', label: 'Vence', date: true, render: r => `${fdate(r.fechaVencimiento)}${r.estado === 'vencida' ? `<small class="sub t-bad">${r.diasVencido} días vencida</small>` : ''}` },
      { key: 'valor', label: 'Valor', money: true, hideMobile: true },
      { key: 'abonado', label: 'Abonado', money: true, hideMobile: true },
      { key: 'saldo', label: 'Saldo', money: true, render: r => `<b>${money(r.saldo)}</b>` },
      { key: 'estado', label: 'Estado', render: r => badge(r.estado, ESTADO_DOC[r.estado]) },
      { key: 'acc', label: '', nosort: true, render: r => r.saldo > 0 ? `<button class="btn btn-sm" data-abonar="${esc(r.id)}">Abonar</button>` : '' }
    ],
    rowAction: r => { verDocumento(r.id); return null; }, totals: { valor: true, saldo: true },
    toolbar: `<button class="btn" id="cx-xls">${ICON.download} Excel</button>`
  });
  if (view.rango) { const sel = host.querySelector('.dt-f[data-k="rango"]'); if (sel) { sel.value = view.rango; sel.dispatchEvent(new Event('change')); } view.rango = null; }
  host.addEventListener('click', e => { const b = e.target.closest('[data-abonar]'); if (b) { const d = store.get('cxc_docs', b.dataset.abonar); formAbono({ clienteId: d.clienteId, docId: d.id }); } });
  $('#cx-xls', host).onclick = async () => {
    const { excel } = await import('../output.js');
    const blob = await excel([{ nombre: 'Cartera clientes', columnas: COLS_DOC, filas: t.rows().length ? rows : rows }]);
    entregarArchivo({ blob, nombre: `Cartera_clientes_${today()}.xlsx`, carpeta: '04_Reportes_Excel' });
  };
}
export const COLS_DOC = [{ key: 'cliente', label: 'Cliente' }, { key: 'tipoDoc', label: 'Tipo' }, { key: 'numero', label: 'Número' }, { key: 'fechaEmision', label: 'Emisión', date: true }, { key: 'fechaVencimiento', label: 'Vencimiento', date: true }, { key: 'concepto', label: 'Concepto' }, { key: 'categoria', label: 'Categoría' }, { key: 'subcategoria', label: 'Subcategoría' }, { key: 'valor', label: 'Valor', money: true }, { key: 'abonado', label: 'Abonado', money: true }, { key: 'saldo', label: 'Saldo', money: true }, { key: 'estado', label: 'Estado' }, { key: 'diasVencido', label: 'Días vencido', num: true }, { key: 'observaciones', label: 'Observaciones' }];

function tablaAbonos(host) {
  const rows = store.all('cxc_abonos').map(a => { const d = store.get('cxc_docs', a.docId); return { ...a, cliente: clienteNombre(a.clienteId), doc: d ? `${d.tipoDoc || 'Factura'} ${d.numero || ''}` : '—', estadoAb: a.anulado ? 'anulado' : 'vigente' }; });
  const hoy = today();
  renderTable(host, {
    id: 'abonos', rows, defaultSort: 'fecha', search: ['cliente', 'doc', 'referencia', 'medio'], searchPlaceholder: 'Cliente, documento o referencia…',
    filters: [
      { key: 'medio', label: 'Medio', options: cfg('mediosPago').map(m => [m, m]) },
      { key: 'per', label: 'Periodo', options: [['hoy', 'Hoy'], ['mes', 'Este mes'], ['ant', 'Mes anterior'], ['anio', 'Este año']], test: (r, v) => v === 'hoy' ? r.fecha === hoy : v === 'mes' ? monthKey(r.fecha) === monthKey(hoy) : v === 'ant' ? monthKey(r.fecha) === monthKey(addDays(hoy.slice(0, 8) + '01', -1)) : (r.fecha || '').startsWith(hoy.slice(0, 4)) },
      { key: 'estadoAb', label: 'Estado', options: [['vigente', 'Vigentes'], ['anulado', 'Anulados']] }
    ],
    columns: [
      { key: 'fecha', label: 'Fecha', date: true },
      { key: 'cliente', label: 'Cliente', primary: true, render: r => `<b>${esc(r.cliente)}</b><small class="sub">${esc(r.doc)}</small>` },
      { key: 'medio', label: 'Medio' }, { key: 'registradoPor', label: 'Registró', hideMobile: true }, { key: 'referencia', label: 'Referencia', hideMobile: true, render: r => `${esc(r.referencia || '')}${r.soporteUrl ? ` <a href="${esc(r.soporteUrl)}" target="_blank" rel="noopener">${ICON.clip}</a>` : ''}` },
      { key: 'valor', label: 'Valor', money: true, render: r => r.anulado ? `<s class="muted">${money(r.valor)}</s> ${badge('anulada', 'Anulado')}` : `<b>${money(r.valor)}</b>` },
      { key: 'acc', label: '', nosort: true, render: r => r.anulado || !puede('anular') ? '' : `<button class="btn btn-sm btn-ghost" data-anular="${esc(r.id)}" title="Anular abono">${ICON.undo}<span class="sr">Anular</span></button>` }
    ],
    totals: { valor: true }, empty: 'Sin abonos en este periodo.'
  });
  host.addEventListener('click', e => { const b = e.target.closest('[data-anular]'); if (b) anularAbono(store.get('cxc_abonos', b.dataset.anular)); });
}

/* ------------------------- Formularios ------------------------- */
export function formDocumento(v = {}) {
  const id = v.id || uid('cxc');
  const nuevo = !v.id;
  const cats = cfg('categoriasCartera');
  formModal({
    title: nuevo ? 'Nueva cuenta por cobrar' : 'Editar documento', size: 'lg',
    values: { tipoDoc: 'Factura', fechaEmision: today(), fechaVencimiento: addDays(today(), 30), ...v },
    sections: [
      { title: 'Documento', fields: [
        { name: 'clienteId', label: 'Cliente', type: 'cliente', required: true, full: true },
        { name: 'tipoDoc', label: 'Tipo', type: 'select', options: ['Factura', 'Pedido', 'Remisión', 'Cuenta de cobro', 'Saldo inicial', 'Otro'], placeholder: false },
        { name: 'numero', label: 'Número de factura / documento' },
        { name: 'fechaEmision', label: 'Fecha de emisión', type: 'date', required: true },
        { name: 'fechaVencimiento', label: 'Fecha de vencimiento', type: 'date', required: true, hint: 'El estado "vencida" se calcula solo con esta fecha y el saldo' },
        { name: 'concepto', label: 'Concepto', full: true, required: true, hint: 'Ej.: Audífonos Ruby 2 recargables bilateral' },
        { name: 'categoria', label: 'Categoría', type: 'select', options: Object.keys(cats) },
        { name: 'subcategoria', label: 'Subcategoría', type: 'select', options: [...new Set(Object.values(cats).flat())] },
        { name: 'valor', label: 'Valor total', type: 'money', required: true }
      ] },
      { title: 'Soporte y notas', fields: [
        { name: 'soporte', label: 'Adjuntar factura (PDF o foto)', type: 'file', hint: store.remote ? 'Se guarda en Drive › 01_Cartera' : 'Disponible al conectar Google', full: true },
        { name: 'observaciones', label: 'Observaciones', type: 'textarea', full: true }
      ] },
      ...(nuevo ? [{ title: 'Anticipo (opcional)', fields: [
        { name: 'conAnticipo', label: 'El cliente dejó un abono ahora', type: 'checkbox', full: true },
        { name: 'anticipo', label: 'Valor del abono', type: 'money', showIf: { conAnticipo: true } },
        { name: 'medioAnticipo', label: 'Medio de pago', type: 'select', options: cfg('mediosPago'), showIf: { conAnticipo: true } }
      ] }] : [])
    ],
    onSubmit: async f => {
      if (!(f.valor > 0)) throw new Error('El valor debe ser mayor que cero.');
      if (f.fechaVencimiento < f.fechaEmision) throw new Error('El vencimiento no puede ser anterior a la emisión.');
      if (!nuevo) { const ab = sum(abonosDoc(id), 'valor'); if (f.valor < ab) throw new Error(`El valor no puede ser menor a lo ya abonado (${money(ab)}).`); }
      if (f.numero && store.all('cxc_docs').some(d => d.id !== id && !d.anulado && d.clienteId === f.clienteId && String(d.numero) === String(f.numero) && d.tipoDoc === f.tipoDoc)) throw new Error('Ya existe ese número de documento para este cliente.');
      if (f.conAnticipo && !(f.anticipo > 0 && f.anticipo <= f.valor)) throw new Error('El anticipo debe ser mayor que cero y no superar el valor.');
      let soporteUrl = v.soporteUrl || '';
      if (f.soporte) soporteUrl = await subirSoporte(f.soporte, `CxC_${slug(clienteNombre(f.clienteId))}_${f.numero || id}`, '01_Cartera');
      const row = { id, clienteId: f.clienteId, tipoDoc: f.tipoDoc, numero: f.numero, fechaEmision: f.fechaEmision, fechaVencimiento: f.fechaVencimiento, concepto: f.concepto, categoria: f.categoria, subcategoria: f.subcategoria, valor: f.valor, observaciones: f.observaciones, soporteUrl };
      const ops = [{ table: 'cxc_docs', mode: nuevo ? 'insert' : 'upsert', rows: [row], base: nuevo ? undefined : { [id]: v.updatedAt } }];
      if (nuevo && f.conAnticipo) ops.push({ table: 'cxc_abonos', mode: 'insert', rows: [{ id: 'ab-' + id, clienteId: f.clienteId, docId: id, fecha: f.fechaEmision, valor: f.anticipo, medio: f.medioAnticipo || 'Efectivo', referencia: 'Anticipo', observaciones: 'Registrado con el documento' }] });
      await store.batch(ops);
      toast(nuevo ? 'Cuenta por cobrar registrada' : 'Documento actualizado');
    }
  });
}

export function formAbono(v = {}) {
  const id = uid('ab'); // id fijo mientras el formulario está abierto: evita duplicados por doble clic
  const docsAbiertos = cid => docsCxc().filter(d => d.clienteId === cid && d.saldo > 0).sort((a, b) => (a.fechaVencimiento || '').localeCompare(b.fechaVencimiento || ''));
  const opts = cid => docsAbiertos(cid).map(d => [d.id, `${d.tipoDoc || 'Factura'} ${d.numero || ''} · saldo ${money(d.saldo)}${d.estado === 'vencida' ? ' · VENCIDA' : ''}`]);
  const first = v.docId || (v.clienteId ? docsAbiertos(v.clienteId)[0]?.id : '');
  formModal({
    title: 'Registrar abono', size: 'md', submitLabel: 'Registrar abono',
    values: { fecha: today(), medio: 'Efectivo', ...v, docId: first },
    sections: [{ fields: [
      { name: 'clienteId', label: 'Cliente', type: 'cliente', required: true, full: true },
      { name: 'docId', label: 'Documento', type: 'select', options: v.clienteId ? opts(v.clienteId) : [], required: true, full: true },
      { name: 'saldoInfo', label: 'Saldo del documento', type: 'readonly', full: true, html: '—' },
      { name: 'valor', label: 'Valor del abono', type: 'money', required: true },
      { name: 'fecha', label: 'Fecha', type: 'date', required: true },
      { name: 'medio', label: 'Medio de pago', type: 'select', options: cfg('mediosPago'), required: true },
      { name: 'referencia', label: 'Referencia / comprobante' },
      { name: 'soporte', label: 'Foto del comprobante (opcional)', type: 'file', full: true, accept: 'image/*,application/pdf' },
      { name: 'observaciones', label: 'Observaciones', type: 'textarea', full: true, rows: 2 }
    ] }],
    afterRender: (form) => {
      const sel = $('[name=docId]', form), cli = $('[name=clienteId]', form), info = $('#f-saldoInfo', form), val = $('[name=valor]', form);
      const showSaldo = () => {
        const d = store.get('cxc_docs', sel.value);
        if (!d) { info.innerHTML = cli.value ? '<span class="t-warn">Este cliente no tiene documentos con saldo. Crea primero la cuenta por cobrar.</span>' : '—'; return; }
        const x = docInfo(d);
        info.innerHTML = `<b class="num">${money(x.saldo)}</b> de ${money(x.valor)} · vence ${fdate(x.fechaVencimiento)} <button type="button" class="link" data-total>Pagar saldo total</button>`;
        $('[data-total]', info).onclick = () => { val.value = x.saldo.toLocaleString('es-CO'); };
      };
      cli.addEventListener('change', () => {
        const o = opts(cli.value);
        sel.innerHTML = `<option value="">Seleccionar…</option>` + o.map(([k, t]) => `<option value="${esc(k)}">${esc(t)}</option>`).join('');
        if (o.length) sel.value = o[0][0];
        showSaldo();
      });
      sel.addEventListener('change', showSaldo); showSaldo();
    },
    onSubmit: async f => {
      const err = validarAbono({ ...f, id }); if (err) throw new Error(err);
      let soporteUrl = '';
      if (f.soporte) soporteUrl = await subirSoporte(f.soporte, `Abono_${slug(clienteNombre(f.clienteId))}_${f.fecha}_${id.slice(-4)}`, '01_Cartera');
      await store.insert('cxc_abonos', [{ id, clienteId: f.clienteId, docId: f.docId, fecha: f.fecha, valor: f.valor, medio: f.medio, referencia: f.referencia, observaciones: f.observaciones, soporteUrl }]);
      const d = docInfo(store.get('cxc_docs', f.docId));
      toast(`Abono registrado. Nuevo saldo: ${money(d.saldo)}`);
    }
  });
}

export async function anularAbono(a) {
  if (!requiere('anular')) return;
  const motivo = await confirmar({ title: 'Anular abono', text: `Abono de ${money(a.valor)} del ${fdate(a.fecha)}. El registro se conserva marcado como anulado y el saldo vuelve a subir.`, ok: 'Anular abono', danger: true, input: 'Motivo de la anulación' });
  if (!motivo) return;
  await store.batch([{ table: 'cxc_abonos', mode: 'upsert', rows: [{ id: a.id, anulado: true, motivoAnulacion: motivo }], base: { [a.id]: a.updatedAt } }, { table: 'auditoria', mode: 'insert', rows: [{ id: uid('au'), fecha: today(), tabla: 'cxc_abonos', registroId: a.id, accion: 'anular', detalle: `${money(a.valor)} · ${motivo}` }] }]);
  toast('Abono anulado');
}

export function verDocumento(id) {
  const raw = store.get('cxc_docs', id); if (!raw) return;
  const d = docInfo(raw);
  const abs = store.all('cxc_abonos').filter(a => a.docId === id).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
  const m = openModal({
    title: `${d.tipoDoc || 'Factura'} ${d.numero || ''}`, size: 'md',
    body: `<p><a href="#cliente/${esc(d.clienteId)}" data-close><b>${esc(clienteNombre(d.clienteId))}</b></a> · ${badge(d.estado, ESTADO_DOC[d.estado])}</p>
      <dl class="kv two">${[['Concepto', d.concepto], ['Emisión', fdate(d.fechaEmision)], ['Vencimiento', fdate(d.fechaVencimiento)], ['Categoría', [d.categoria, d.subcategoria].filter(Boolean).join(' › ')], ['Valor', money(d.valor)], ['Abonado', money(d.abonado)], ['Saldo', money(d.saldo)], ['Observaciones', d.observaciones], ['Registrado por', d.registradoPor], ['Modificado por', d.modificadoPor], ['Motivo anulación', d.motivoAnulacion]].filter(x => x[1]).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      ${d.soporteUrl ? `<p><a class="btn btn-sm" href="${esc(d.soporteUrl)}" target="_blank" rel="noopener">${ICON.clip} Ver soporte en Drive</a></p>` : ''}
      <h3>Abonos (${abs.length})</h3>
      ${abs.length ? `<ul class="list-links">${abs.map(a => `<li><span><b class="num">${money(a.valor)}</b><small>${fdate(a.fecha)} · ${esc(a.medio || '')} ${esc(a.referencia || '')}${a.registradoPor ? ' · registró ' + esc(a.registradoPor) : ''}${a.anulado ? ' · ANULADO: ' + esc(a.motivoAnulacion || '') : ''}</small></span>${a.anulado ? badge('anulada', 'Anulado') : !puede('anular') ? '' : `<button class="btn btn-sm btn-ghost" data-anular="${esc(a.id)}">${ICON.undo} Anular</button>`}</li>`).join('')}</ul>` : '<p class="empty-inline">Sin abonos.</p>'}`,
    footer: `${puede('anular') && !d.anulado && !abs.some(a => !a.anulado) ? `<button class="btn btn-danger-ghost" id="dv-anular">Anular documento</button>` : ''}
      ${!d.anulado ? `<button class="btn" id="dv-edit">${ICON.edit} Editar</button>` : ''}
      ${d.saldo > 0 ? `<button class="btn btn-wa" id="dv-wa">${ICON.wa} Recordar saldo</button><button class="btn btn-primary" id="dv-ab">${ICON.money} Abonar</button>` : ''}`
  });
  m.el.addEventListener('click', async e => {
    const an = e.target.closest('[data-anular]'); if (an) { m.close(); anularAbono(store.get('cxc_abonos', an.dataset.anular)); }
  });
  $('#dv-ab', m.el)?.addEventListener('click', () => { m.close(); formAbono({ clienteId: d.clienteId, docId: d.id }); });
  $('#dv-edit', m.el)?.addEventListener('click', () => { m.close(); formDocumento(raw); });
  $('#dv-wa', m.el)?.addEventListener('click', () => { m.close(); componerWhatsApp({ cliente: cliente(d.clienteId), plantilla: 'cobro' }); });
  $('#dv-anular', m.el)?.addEventListener('click', async () => {
    const motivo = await confirmar({ title: 'Anular documento', text: 'El documento queda anulado (no se borra) y deja de contar en la cartera.', ok: 'Anular', danger: true, input: 'Motivo' });
    if (!motivo) return;
    await store.batch([{ table: 'cxc_docs', mode: 'upsert', rows: [{ id, anulado: true, motivoAnulacion: motivo }] }, { table: 'auditoria', mode: 'insert', rows: [{ id: uid('au'), fecha: today(), tabla: 'cxc_docs', registroId: id, accion: 'anular', detalle: motivo }] }]);
    m.close(); toast('Documento anulado');
  });
}
