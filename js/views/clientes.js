import { $, $$, esc, money, fdate, today, uid, toast, norm, monthKey, addMonths } from '../util.js';
import { store } from '../store.js';
import { cfg, clientes, cliente, saldoCliente, docsCxc, ESTADO_DOC, oportunidades, TIPOS_OP, FUENTES, historialCliente, estadoCot, ESTADOS_COT, sum, FAMILIAS, telefonoCliente } from '../domain.js';
import { ICON, formModal, openModal, confirmar, componerWhatsApp, badge, emptyState } from '../ui.js';
import { renderTable } from '../table.js';
import { requiere } from '../auth.js';

/* ------------------------------ Lista ------------------------------ */
export function render(main) {
  const rows = clientes().map(c => { const s = saldoCliente(c.id); return { ...c, saldo: s.saldo, vencido: s.vencido, tel: telefonoCliente(c) }; });
  main.innerHTML = `<div class="page">
    <div class="page-h"><div><h1>Clientes</h1><p class="muted">${rows.filter(r => r.estado !== 'inactivo').length} activos · ${rows.filter(r => r.saldo > 0).length} con saldo pendiente</p></div>
    <div class="row-btns"><button class="btn" id="cl-xls">${ICON.download} Excel</button><button class="btn btn-primary" id="cl-new">${ICON.plus} Nuevo cliente</button></div></div>
    <div id="cl-tbl"></div></div>`;
  const cats = Object.keys(cfg('categoriasClientes'));
  renderTable($('#cl-tbl', main), {
    id: 'clientes', rows, defaultSort: 'nombre', defaultDir: 'asc', searchPlaceholder: 'Nombre, cédula, teléfono o código…',
    search: ['nombre', 'identificacion', 'tel', 'codigo', 'ciudad'],
    filters: [
      { key: 'estado', label: 'Estado', options: [['activo', 'Activos'], ['inactivo', 'Inactivos']], test: (r, v) => (r.estado || 'activo') === v },
      { key: 'categoria', label: 'Categoría', options: cats.map(c => [c, c]) },
      { key: 'saldo', label: 'Saldo', options: [['con', 'Con saldo'], ['vencido', 'Con saldo vencido'], ['sintel', 'Sin teléfono']], test: (r, v) => v === 'con' ? r.saldo > 0 : v === 'vencido' ? r.vencido > 0 : !r.tel }
    ],
    columns: [
      { key: 'nombre', label: 'Cliente', primary: true, render: r => `<b>${esc(r.nombre)}</b>${r.estado === 'inactivo' ? ' ' + badge('anulada', 'Inactivo') : ''}<small class="sub">${esc([r.codigo, r.identificacion ? 'CC ' + r.identificacion : ''].filter(Boolean).join(' · '))}</small>` },
      { key: 'tel', label: 'Teléfono', render: r => r.tel ? esc(r.tel) : '<span class="muted">—</span>' },
      { key: 'ciudad', label: 'Ciudad', hideMobile: true },
      { key: 'categoria', label: 'Categoría', hideMobile: true },
      { key: 'saldo', label: 'Saldo', money: true, render: r => r.saldo ? `<span class="${r.vencido ? 't-bad' : ''}">${money(r.saldo)}</span>` : '<span class="muted">$ 0</span>' }
    ],
    rowAction: r => '#cliente/' + r.id, totals: { saldo: true }
  });
  $('#cl-new', main).onclick = () => formCliente({});
  $('#cl-xls', main).onclick = async () => {
    const { excel } = await import('../output.js'); const { entregarArchivo } = await import('../ui.js');
    const blob = await excel([{ nombre: 'Clientes', columnas: COLS_XLS, filas: rows }]);
    entregarArchivo({ blob, nombre: `Clientes_${today()}.xlsx`, carpeta: '04_Reportes_Excel' });
  };
}
const COLS_XLS = [{ key: 'codigo', label: 'Código' }, { key: 'nombre', label: 'Nombre' }, { key: 'tipoId', label: 'Tipo ID' }, { key: 'identificacion', label: 'Identificación' }, { key: 'telefono', label: 'Teléfono' }, { key: 'whatsapp', label: 'WhatsApp' }, { key: 'email', label: 'Correo' }, { key: 'direccion', label: 'Dirección' }, { key: 'ciudad', label: 'Ciudad' }, { key: 'departamento', label: 'Departamento' }, { key: 'categoria', label: 'Categoría' }, { key: 'subcategoria', label: 'Subcategoría' }, { key: 'condicionesPago', label: 'Condiciones de pago' }, { key: 'cupo', label: 'Cupo', money: true }, { key: 'estado', label: 'Estado' }, { key: 'fechaRegistro', label: 'Registro', date: true }, { key: 'saldo', label: 'Saldo', money: true }, { key: 'vencido', label: 'Vencido', money: true }, { key: 'observaciones', label: 'Observaciones' }];

/* ------------------------------ Formulario ------------------------------ */
export function seccionesCliente(v = {}) {
  const cats = cfg('categoriasClientes');
  return [
    { title: 'Datos principales', fields: [
      { name: 'nombre', label: 'Nombre o razón social', required: true, full: true },
      { name: 'tipoId', label: 'Tipo de identificación', type: 'select', options: [['CC', 'Cédula (C.C.)'], ['NIT', 'NIT'], ['CE', 'Cédula de extranjería'], ['TI', 'Tarjeta de identidad'], ['PP', 'Pasaporte']], default: 'CC' },
      { name: 'identificacion', label: 'Número de identificación' },
      { name: 'whatsapp', label: 'WhatsApp / celular', type: 'tel', hint: '10 dígitos, ej. 3001234567' },
      { name: 'telefono', label: 'Otro teléfono', type: 'tel' }
    ] },
    { title: 'Contacto y ubicación', fields: [
      { name: 'email', label: 'Correo', type: 'email' }, { name: 'contacto', label: 'Contacto principal', hint: 'Familiar o acudiente, si aplica' },
      { name: 'direccion', label: 'Dirección', full: true }, { name: 'ciudad', label: 'Ciudad', default: cfg('negocio').ciudad }, { name: 'departamento', label: 'Departamento', default: 'Santander' }
    ] },
    { title: 'Clasificación y condiciones', fields: [
      { name: 'categoria', label: 'Categoría', type: 'select', options: Object.keys(cats), default: 'Paciente' },
      { name: 'subcategoria', label: 'Subcategoría', type: 'select', options: [...new Set(Object.values(cats).flat())] },
      { name: 'condicionesPago', label: 'Condiciones de pago', type: 'select', options: cfg('condicionesPago') },
      { name: 'cupo', label: 'Cupo de crédito (opcional)', type: 'money' },
      { name: 'estado', label: 'Estado', type: 'select', options: [['activo', 'Activo'], ['inactivo', 'Inactivo']], default: 'activo', placeholder: false },
      { name: 'fechaRegistro', label: 'Fecha de registro', type: 'date', default: today() },
      { name: 'observaciones', label: 'Observaciones', type: 'textarea', full: true }
    ] }
  ];
}
export function formCliente(c = {}) {
  const nuevo = !c.id;
  const id = c.id || uid('cl');
  return new Promise(res => {
    formModal({
      title: nuevo ? 'Nuevo cliente' : 'Editar cliente', size: 'lg', sections: seccionesCliente(c), values: c,
      onSubmit: async v => {
        const dup = clientes().find(x => x.id !== id && ((v.identificacion && String(x.identificacion) === String(v.identificacion)) || norm(x.nombre) === norm(v.nombre)));
        if (dup && nuevo) {
          const ok = await confirmar({ title: 'Posible duplicado', text: `Ya existe "${dup.nombre}"${dup.identificacion ? ' (CC ' + dup.identificacion + ')' : ''}. ¿Crear de todas formas?`, ok: 'Crear igual' });
          if (!ok) return false;
        }
        const row = { ...v, id, nombre: v.nombre.toUpperCase() };
        if (nuevo) row.codigo = '__AUTO__:CL-:cliente:4';
        const saved = await store.batch([{ table: 'clientes', mode: nuevo ? 'insert' : 'upsert', rows: [row], base: nuevo ? undefined : { [id]: c.updatedAt } }]);
        toast(nuevo ? 'Cliente creado' : 'Cliente actualizado');
        res(saved.clientes?.[0]);
      }
    });
  });
}
export function nuevoClienteRapido(nombre = '') {
  return formCliente({ nombre: nombre.toUpperCase() });
}
export function elegirClienteWhatsApp() {
  formModal({
    title: 'Mensaje por WhatsApp', size: 'sm', submitLabel: 'Continuar',
    sections: [{ fields: [{ name: 'clienteId', label: 'Cliente', type: 'cliente', required: true, full: true }] }],
    onSubmit: async v => { setTimeout(() => componerWhatsApp({ cliente: cliente(v.clienteId), plantilla: 'general' }), 200); }
  });
}

/* ------------------------------ Ficha ------------------------------ */
const fichaTab = { t: 'resumen' };
export async function renderFicha(main, [id]) {
  const c = cliente(id);
  if (!c) { main.innerHTML = `<div class="page">${emptyState('Cliente no encontrado', 'Puede que aún no se haya sincronizado.', '<a class="btn" href="#clientes">Volver</a>')}</div>`; return; }
  const sc = saldoCliente(id);
  const abonos = store.all('cxc_abonos').filter(a => a.clienteId === id && !a.anulado).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  const entregas = store.all('entregas').filter(e => e.clienteId === id && !e.anulado).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  const equipos = store.all('equipos').filter(e => e.clienteId === id).sort((a, b) => (b.fechaEntrega || '').localeCompare(a.fechaEntrega || ''));
  const cots = store.all('cotizaciones').filter(q => q.clienteId === id).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  const ops = oportunidades({ incluirFuturas: true }).filter(o => o.clienteId === id).sort((a, b) => a.dias - b.dias);
  const ventas = store.all('ventas').filter(v => v.clienteId === id && v.estado !== 'anulada');
  const tel = telefonoCliente(c);
  const porAnio = {};
  for (const a of abonos) { const y = (a.fecha || '').slice(0, 4); porAnio[y] = (porAnio[y] || 0) + a.valor; }
  const tabs = [['resumen', 'Resumen'], ['cartera', `Cartera (${sc.docs.filter(d => d.saldo > 0).length})`], ['abonos', `Abonos (${abonos.length})`], ['compras', `Compras (${entregas.length})`], ['equipos', `Equipos (${equipos.length})`], ['cotizaciones', `Cotizaciones (${cots.length})`], ['necesidades', `Próximas necesidades (${ops.length})`], ['actividad', 'Actividad']];

  main.innerHTML = `<div class="page ficha">
    <section class="ficha-h">
      <div class="ficha-id"><div class="avatar" aria-hidden="true">${esc(initials(c.nombre))}</div>
        <div><h1>${esc(c.nombre)}</h1><p class="muted">${esc([c.codigo, c.identificacion ? (c.tipoId || 'CC') + ' ' + c.identificacion : '', c.ciudad].filter(Boolean).join(' · '))} ${c.estado === 'inactivo' ? badge('anulada', 'Inactivo') : ''}</p>
        <p>${tel ? `${ICON.phone} ${esc(tel)}` : '<span class="t-warn">Sin número de WhatsApp</span>'}${c.email ? ` · ${esc(c.email)}` : ''}</p></div></div>
      <div class="ficha-act">
        <button class="btn btn-wa" data-a="wa">${ICON.wa} WhatsApp</button>
        <button class="btn btn-primary" data-a="abono" ${sc.saldo > 0 ? '' : 'disabled title="No tiene saldo pendiente"'}>${ICON.money} Registrar abono</button>
        <a class="btn" href="#cotizacion/nueva/${esc(id)}">${ICON.doc} Cotizar</a>
        <button class="btn" data-a="more">${ICON.more}<span class="sr">Más acciones</span></button>
      </div>
    </section>
    <section class="mini-kpis">
      <div><span>Saldo pendiente</span><b class="num ${sc.vencido ? 't-bad' : ''}">${money(sc.saldo)}</b></div>
      <div><span>Vencido</span><b class="num">${money(sc.vencido)}</b></div>
      <div><span>Total abonado</span><b class="num">${money(sum(abonos, 'valor'))}</b></div>
      <div><span>Compras registradas</span><b class="num">${entregas.length + ventas.length}</b></div>
    </section>
    <nav class="tabs" role="tablist">${tabs.map(([k, t]) => `<button role="tab" class="${fichaTab.t === k ? 'on' : ''}" data-tab="${k}" aria-selected="${fichaTab.t === k}">${t}</button>`).join('')}</nav>
    <div class="tab-body">${tabBody()}</div>
  </div>`;

  function tabBody() {
    switch (fichaTab.t) {
      case 'resumen': return `<div class="cols-2"><div class="panel"><h3>Información general</h3><dl class="kv">
          ${kv('Código', c.codigo)}${kv('Identificación', c.identificacion ? (c.tipoId || 'CC') + ' ' + c.identificacion : '')}${kv('WhatsApp', c.whatsapp)}${kv('Teléfono', c.telefono)}${kv('Correo', c.email)}
          ${kv('Dirección', c.direccion)}${kv('Ciudad', [c.ciudad, c.departamento].filter(Boolean).join(', '))}${kv('Contacto', c.contacto)}${kv('Categoría', [c.categoria, c.subcategoria].filter(Boolean).join(' › '))}
          ${kv('Condiciones de pago', c.condicionesPago)}${kv('Cupo', c.cupo ? money(c.cupo) : '')}${kv('Registro', fdate(c.fechaRegistro))}${kv('Observaciones', c.observaciones)}</dl></div>
        <div class="panel"><h3>Próximas necesidades</h3>${ops.length ? `<ul class="need">${ops.slice(0, 5).map(needLi).join('')}</ul>` : '<p class="empty-inline">Sin necesidades estimadas.</p>'}
          <h3 class="mt">Equipos en su poder</h3>${equipos.length ? `<ul class="need">${equipos.slice(0, 3).map(e => `<li><b>${esc(e.descripcion)}</b><small>Entregado ${fdate(e.fechaEntrega)} · Serie ${esc(e.series || '—')}</small></li>`).join('')}</ul>` : '<p class="empty-inline">Sin equipos registrados.</p>'}</div></div>`;
      case 'cartera': return `<div class="panel"><div class="panel-h"><h3>Documentos por cobrar</h3><button class="btn btn-sm" data-a="doc">${ICON.plus} Cuenta por cobrar</button></div>
        ${sc.docs.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Documento</th><th>Emisión</th><th>Vence</th><th class="r">Valor</th><th class="r">Abonado</th><th class="r">Saldo</th><th>Estado</th><th></th></tr></thead><tbody>
        ${sc.docs.sort((a, b) => (b.fechaEmision || '').localeCompare(a.fechaEmision || '')).map(d => `<tr><td data-label="Documento" class="p"><b>${esc(d.tipoDoc || 'Factura')} ${esc(d.numero || '')}</b><small class="sub">${esc(d.concepto || '')}</small></td><td data-label="Emisión">${fdate(d.fechaEmision)}</td><td data-label="Vence">${fdate(d.fechaVencimiento)}</td><td class="r num" data-label="Valor">${money(d.valor)}</td><td class="r num" data-label="Abonado">${money(d.abonado)}</td><td class="r num" data-label="Saldo"><b>${money(d.saldo)}</b></td><td data-label="Estado">${badge(d.estado, ESTADO_DOC[d.estado])}</td>
        <td class="acts">${d.saldo > 0 ? `<button class="btn btn-sm" data-abonar="${esc(d.id)}">Abonar</button>` : ''}${d.soporteUrl ? `<a class="btn btn-sm btn-ghost" href="${esc(d.soporteUrl)}" target="_blank" rel="noopener">${ICON.clip}</a>` : ''}<a class="btn btn-sm btn-ghost" href="#cartera/doc/${esc(d.id)}">Ver</a></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty-inline">Sin documentos.</p>'}</div>`;
      case 'abonos': return `<div class="panel"><h3>Historial de abonos</h3>
        ${Object.keys(porAnio).length ? `<div class="chips">${Object.entries(porAnio).sort().reverse().map(([y, v]) => `<span class="chip static">${y}: <b>${money(v)}</b></span>`).join('')}</div>` : ''}
        ${abonos.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Documento</th><th>Medio</th><th>Referencia</th><th class="r">Valor</th></tr></thead><tbody>${abonos.map(a => { const d = store.get('cxc_docs', a.docId); return `<tr><td data-label="Fecha">${fdate(a.fecha)}</td><td data-label="Documento">${esc(d ? (d.tipoDoc || '') + ' ' + (d.numero || '') : '—')}</td><td data-label="Medio">${esc(a.medio || '')}</td><td data-label="Referencia">${esc(a.referencia || '')}${a.soporteUrl ? ` <a href="${esc(a.soporteUrl)}" target="_blank" rel="noopener">soporte</a>` : ''}</td><td class="r num" data-label="Valor"><b>${money(a.valor)}</b></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="empty-inline">Sin abonos registrados.</p>'}</div>`;
      case 'compras': return `<div class="panel"><h3>Productos comprados o entregados</h3>
        ${entregas.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Producto / servicio</th><th>Tipo</th><th>Documento</th><th class="r">Valor</th></tr></thead><tbody>${entregas.map(e => `<tr><td data-label="Fecha">${fdate(e.fecha)}</td><td class="p" data-label="Producto">${esc(e.descripcion)}</td><td data-label="Tipo">${esc(FAMILIAS[e.familia] || e.familia || '')}</td><td data-label="Documento">${esc(e.documento || '')}${e.origen === 'importado' ? ' <small class="muted">(histórico)</small>' : ''}</td><td class="r num" data-label="Valor">${e.valor ? money(e.valor) : ''}</td></tr>`).join('')}</tbody></table></div>
        <p class="muted small">En el histórico importado, el valor corresponde a la factura de Medihumana (costo), no al precio de venta al paciente.</p>` : '<p class="empty-inline">Sin compras registradas.</p>'}</div>`;
      case 'equipos': return `<div class="panel"><div class="panel-h"><h3>Herramientas e instrumentos en su poder</h3><button class="btn btn-sm" data-a="equipo">${ICON.plus} Agregar equipo</button></div>
        <p class="muted small">Inventario que está en poder del cliente (no cuenta en el inventario propio).</p>
        ${equipos.length ? `<ul class="eq-list">${equipos.map(e => { const vence = addMonths(e.fechaEntrega, e.garantiaMeses || 24); const vig = vence >= today(); return `<li><div><b>${esc(e.descripcion)}</b><small>Serie: ${esc(e.series || '—')} · Entregado ${fdate(e.fechaEntrega)} · ${esc(e.documento || '')}</small></div><div>${badge(vig ? 'pagada' : 'anulada', vig ? 'Garantía hasta ' + fdate(vence) : 'Garantía vencida ' + fdate(vence))} ${e.estado === 'retirado' ? badge('anulada', 'Retirado') : ''}<button class="btn btn-sm btn-ghost" data-eq="${esc(e.id)}">${ICON.edit}</button></div></li>`; }).join('')}</ul>` : '<p class="empty-inline">Sin equipos registrados.</p>'}</div>`;
      case 'cotizaciones': {
        const ac = cots.filter(q => ['aceptada', 'convertida'].includes(estadoCot(q))), re = cots.filter(q => estadoCot(q) === 'rechazada');
        return `<div class="panel"><div class="panel-h"><h3>Cotizaciones</h3><a class="btn btn-sm" href="#cotizacion/nueva/${esc(id)}">${ICON.plus} Nueva</a></div>
        <p class="muted small">Aceptadas: ${ac.length} (${money(sum(ac, 'total'))}) · Rechazadas: ${re.length} (${money(sum(re, 'total'))})</p>
        ${cots.length ? `<ul class="list-links">${cots.map(q => `<li><a href="#cotizacion/${esc(q.id)}"><b>${esc(q.numero)}</b><small>${fdate(q.fecha)} · ${esc((cfg('tiposCotizacion').find(t => t.id === q.tipo) || {}).nombre || '')}</small></a>${badge(estadoCot(q), ESTADOS_COT[estadoCot(q)])}<span class="num">${money(q.total)}</span></li>`).join('')}</ul>` : '<p class="empty-inline">Sin cotizaciones.</p>'}</div>`;
      }
      case 'necesidades': return `<div class="panel"><div class="panel-h"><h3>Próximas necesidades estimadas</h3><button class="btn btn-sm" data-a="manual">${ICON.clock} Fecha manual</button></div>
        <p class="muted small">Son estimaciones. Cada una indica si viene del historial, del promedio de sus pacientes, de una regla o de una fecha manual.</p>
        ${ops.length ? `<ul class="need">${ops.map(needLi).join('')}</ul>` : '<p class="empty-inline">Sin necesidades estimadas.</p>'}</div>`;
      case 'actividad': { const h = historialCliente(id); return `<div class="panel"><h3>Historial de actividad comercial</h3>${h.length ? `<ul class="timeline">${h.slice(0, 150).map(e => `<li><time>${fdate(e.fecha)}</time><div><b>${esc(e.tipo)}</b> ${esc(e.texto || '')}${e.valor ? ` · <span class="num">${money(e.valor)}</span>` : ''}</div></li>`).join('')}</ul>` : '<p class="empty-inline">Sin actividad.</p>'}</div>`; }
    }
    return '';
  }
  function needLi(o) { return `<li class="p-${o.prioridad}"><b>${esc(o.titulo)}</b> · ${fdate(o.fecha)} <span class="${o.dias <= 0 ? 't-bad' : 'muted'}">(${o.dias < 0 ? 'hace ' + -o.dias + ' días' : o.dias === 0 ? 'hoy' : 'en ' + o.dias + ' días'})</span><small><span class="src src-${o.fuente}">${esc(FUENTES[o.fuente])}</span> ${esc(o.fuenteTxt)}</small></li>`; }

  main.onclick = async e => {
    const t = e.target.closest('[data-tab]'); if (t) { fichaTab.t = t.dataset.tab; renderFicha(main, [id]); return; }
    const ab = e.target.closest('[data-abonar]'); if (ab) { (await import('./cartera.js')).formAbono({ clienteId: id, docId: ab.dataset.abonar }); return; }
    const eq = e.target.closest('[data-eq]'); if (eq) { formEquipo(store.get('equipos', eq.dataset.eq)); return; }
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'wa') componerWhatsApp({ cliente: c, plantilla: sc.vencido ? 'cobro' : 'general' });
    if (a === 'abono') (await import('./cartera.js')).formAbono({ clienteId: id });
    if (a === 'doc') (await import('./cartera.js')).formDocumento({ clienteId: id });
    if (a === 'equipo') formEquipo({ clienteId: id });
    if (a === 'manual') formManual(c);
    if (a === 'more') masAcciones(c);
  };
}
function kv(k, v) { return v ? `<div><dt>${esc(k)}</dt><dd>${esc(String(v))}</dd></div>` : ''; }
function initials(n) { return String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join(''); }

function masAcciones(c) {
  const m = openModal({
    title: 'Acciones', size: 'sm',
    body: `<div class="stack-btns">
      <button class="btn btn-lg" data-x="edit">${ICON.edit} Editar datos</button>
      <button class="btn btn-lg" data-x="doc">${ICON.wallet} Nueva cuenta por cobrar</button>
      <button class="btn btn-lg" data-x="venta">${ICON.cart} Registrar venta</button>
      <button class="btn btn-lg" data-x="equipo">${ICON.box} Agregar equipo en su poder</button>
      <button class="btn btn-lg" data-x="manual">${ICON.clock} Fecha estimada de próxima compra</button>
      <button class="btn btn-lg" data-x="estado">${c.estado === 'inactivo' ? 'Reactivar cliente' : 'Desactivar cliente'}</button></div>`
  });
  m.el.onclick = async e => {
    const x = e.target.closest('[data-x]')?.dataset.x; if (!x) return;
    m.close();
    if (x === 'edit') formCliente(c);
    if (x === 'doc') (await import('./cartera.js')).formDocumento({ clienteId: c.id });
    if (x === 'venta') (await import('./ventas.js')).formVenta({ clienteId: c.id });
    if (x === 'equipo') formEquipo({ clienteId: c.id });
    if (x === 'manual') formManual(c);
    if (x === 'estado') {
      if (!requiere('desactivar')) return;
      const inactivar = c.estado !== 'inactivo';
      if (inactivar && !(await confirmar({ title: 'Desactivar cliente', text: 'El cliente no aparecerá en listas ni alarmas. Su historial se conserva. ¿Continuar?', ok: 'Desactivar' }))) return;
      await store.upsert('clientes', [{ id: c.id, estado: inactivar ? 'inactivo' : 'activo' }]);
      toast(inactivar ? 'Cliente desactivado' : 'Cliente reactivado');
    }
  };
}
export function formEquipo(e = {}) {
  const nuevo = !e.id;
  formModal({
    title: nuevo ? 'Equipo en poder del cliente' : 'Editar equipo', sections: [{ fields: [
      { name: 'descripcion', label: 'Equipo / instrumento', required: true, full: true },
      { name: 'series', label: 'Serie(s)', hint: 'Separe varias con guion' }, { name: 'fechaEntrega', label: 'Fecha de entrega', type: 'date', required: true, default: today() },
      { name: 'garantiaMeses', label: 'Garantía (meses)', type: 'number', default: cfg('reglas').garantiaMeses }, { name: 'documento', label: 'Documento relacionado' },
      { name: 'estado', label: 'Estado', type: 'select', options: [['activo', 'En uso'], ['retirado', 'Retirado / devuelto']], default: 'activo', placeholder: false },
      { name: 'observaciones', label: 'Observaciones', type: 'textarea', full: true }
    ] }], values: e,
    onSubmit: async v => { await store.batch([{ table: 'equipos', mode: nuevo ? 'insert' : 'upsert', rows: [{ ...v, id: e.id || uid('eq'), clienteId: e.clienteId }] }]); toast('Equipo guardado'); }
  });
}
function formManual(c) {
  formModal({
    title: 'Próxima compra estimada (manual)', size: 'sm', sections: [{ fields: [
      { name: 'proxCompraManual', label: 'Fecha estimada', type: 'date', full: true },
      { name: 'proxCompraNota', label: 'Qué necesitaría', full: true, hint: 'Ej.: baterías 312, cambio de domos' }
    ] }], values: c,
    onSubmit: async v => { await store.upsert('clientes', [{ id: c.id, ...v }]); toast(v.proxCompraManual ? 'Fecha manual guardada (se mostrará como "Fecha manual")' : 'Fecha manual eliminada'); }
  });
}
