import { $, $$, esc, money, fdate, today, uid, toast, addDays, monthKey, monthName, parseISO, iso } from '../util.js';
import { store } from '../store.js';
import { cfg, totales, estadoCot, ESTADOS_COT, resumenCotizaciones, clienteNombre, cliente, FAMILIAS, inventario, sum } from '../domain.js';
import { ICON, formHtml, bindForm, readForm, validate, openModal, confirmar, badge, entregarArchivo, componerWhatsApp, parseMoney } from '../ui.js';
import { renderTable } from '../table.js';

/* ------------------------------ Lista ------------------------------ */
export function render(main) {
  const r = resumenCotizaciones();
  const tipos = cfg('tiposCotizacion');
  const rows = store.all('cotizaciones').map(q => ({ ...q, est: estadoCot(q), clienteN: q.cliente?.nombre || clienteNombre(q.clienteId), tipoN: (tipos.find(t => t.id === q.tipo) || {}).nombre || q.tipo }));
  main.innerHTML = `<div class="page">
    <div class="page-h"><div><h1>Cotizaciones</h1><p class="muted">Un solo formato con lista desplegable: audífonos recargables o de pila 312.</p></div>
      <div class="row-btns"><a class="btn btn-primary" href="#cotizacion/nueva">${ICON.plus} Nueva cotización</a></div></div>
    <section class="strip">
      <div class="st"><span>Abiertas</span><b class="num">${r.abiertas}</b></div><div class="st"><span>Valor abierto</span><b class="num">${money(r.valorAbiertas)}</b></div>
      <div class="st"><span>Total cotizado</span><b class="num">${money(r.valorTotal)}</b></div><div class="st st-good"><span>Aceptadas</span><b class="num">${money(r.aceptadas)}</b></div>
      <div class="st"><span>Tasa de aceptación</span><b class="num">${r.tasa == null ? '—' : r.tasa.toFixed(0) + '%'}</b></div>
    </section>
    <div id="q-tbl"></div></div>`;
  renderTable($('#q-tbl', main), {
    id: 'cot', rows, defaultSort: 'fecha', search: ['numero', 'clienteN', 'asunto'], searchPlaceholder: 'Número, cliente o asunto…',
    filters: [{ key: 'est', label: 'Estado', options: Object.entries(ESTADOS_COT) }, { key: 'tipo', label: 'Tipo', options: tipos.map(t => [t.id, t.nombre]) },
      { key: 'per', label: 'Periodo', options: [['mes', 'Este mes'], ['3m', 'Últimos 3 meses'], ['anio', 'Este año']], test: (r, v) => v === 'mes' ? monthKey(r.fecha) === monthKey(today()) : v === '3m' ? r.fecha >= addDays(today(), -92) : (r.fecha || '').startsWith(today().slice(0, 4)) }],
    columns: [
      { key: 'numero', label: 'Cotización', primary: true, render: r => `<b>${esc(r.numero)}</b><small class="sub">${esc(r.clienteN)}</small>` },
      { key: 'fecha', label: 'Fecha', date: true }, { key: 'vence', label: 'Vigencia', date: true, hideMobile: true },
      { key: 'tipoN', label: 'Tipo', hideMobile: true },
      { key: 'total', label: 'Total', money: true },
      { key: 'est', label: 'Estado', render: r => badge(r.est, ESTADOS_COT[r.est]) }
    ],
    rowAction: r => '#cotizacion/' + r.id, totals: { total: true }, empty: 'Aún no hay cotizaciones. Crea la primera con "Nueva cotización".'
  });
}

/* ------------------------------ Editor ------------------------------ */
function finDeMes(f) { const d = parseISO(f); const e = iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)); return e < addDays(f, 7) ? addDays(f, 15) : e; }
function itemDeTipo(t) { return { id: uid('it'), descripcion: t.dispositivo, cantidad: t.cantidad || 1, precio: t.precioUnit || 0, descPct: 0, ivaPct: t.ivaPct || 0, principal: true }; }

export function renderEditor(main, args) {
  const tipos = cfg('tiposCotizacion');
  const textos = cfg('cotizacionTextos');
  let q;
  if (args[0] === 'nueva' || !args[0]) {
    const cid = args[1] || '';
    const fam = args[2] || '';
    const c = cid ? cliente(cid) : null;
    // sugerencia según el equipo actual del paciente
    let tipo = tipos[0];
    const eq = cid ? store.all('equipos').filter(e => e.clienteId === cid).sort((a, b) => (b.fechaEntrega || '').localeCompare(a.fechaEntrega || ''))[0] : null;
    if (eq && /312|pila| 13 /i.test(eq.descripcion || '')) tipo = tipos.find(t => t.id === 'pila312') || tipo;
    const f = today();
    const d = parseISO(f);
    q = {
      id: uid('q'), _nuevo: true, fecha: f, vence: finDeMes(f), clienteId: cid, tipo: tipo.id, estado: 'borrador',
      asunto: `${textos.asunto} — ${monthName(d.getMonth()).toUpperCase()} ${d.getFullYear()}`, dx: '', items: [], descuentoGeneral: 0,
      formaPago: textos.formaPago, tiempoEntrega: textos.tiempoEntrega, observaciones: '', historial: []
    };
    if (!fam || fam === 'audifono' || fam === 'mantenimiento') q.items.push(itemDeTipo(tipo));
    if (fam && fam !== 'audifono') {
      const prod = inventario().find(p => p.categoria && (p.familia === fam || (p.nombre || '').toLowerCase().includes((FAMILIAS[fam] || '').toLowerCase().slice(0, 5))));
      q.items.push({ id: uid('it'), productoId: prod?.id || '', descripcion: prod?.nombre || FAMILIAS[fam] || 'Producto', cantidad: 1, precio: prod?.precio || 0, descPct: 0, ivaPct: prod?.ivaPct ?? 19 });
    }
    if (c) q.asunto = q.asunto;
  } else {
    const src = store.get('cotizaciones', args[0]);
    if (!src) { main.innerHTML = `<div class="page"><p>No se encontró la cotización.</p><a class="btn" href="#cotizaciones">Volver</a></div>`; return; }
    q = structuredClone(src);
    q.items = Array.isArray(q.items) ? q.items : [];
  }
  const bloqueada = ['convertida'].includes(q.estado);
  const tipoActual = () => tipos.find(t => t.id === q.tipo) || tipos[0];

  const draw = () => {
    const t = totales(q.items, q.descuentoGeneral);
    const est = q._nuevo ? 'borrador' : estadoCot(q);
    main.innerHTML = `<div class="page editor">
      <div class="page-h"><div><p class="eyebrow">${q._nuevo ? 'Nueva cotización' : esc(q.numero) + (q.registradoPor ? ' · creada por ' + esc(q.registradoPor) : '') + (q.modificadoPor && q.modificadoPor !== q.registradoPor ? ' · modificada por ' + esc(q.modificadoPor) : '')}</p><h1>${q._nuevo ? 'Cotización' : esc(q.numero)} ${q._nuevo ? '' : badge(est, ESTADOS_COT[est])}</h1>
        ${bloqueada ? `<p class="t-warn">Convertida en venta: solo lectura. Puedes duplicarla.</p>` : ''}</div>
        <div class="row-btns">${q._nuevo ? '' : `<button class="btn" data-a="dup">${ICON.copy} Duplicar</button><button class="btn" data-a="estado">Cambiar estado</button>`}</div></div>
      <form class="form ed-form" novalidate ${bloqueada ? 'inert' : ''}>
        ${formHtml([
          { title: 'Cliente y tipo', fields: [
            { name: 'clienteId', label: 'Cliente', type: 'cliente', required: true, full: true },
            { name: 'tipo', label: 'Tipo de cotización', type: 'select', options: tipos.map(x => [x.id, x.nombre]), required: true, placeholder: false, hint: 'Cambia el dispositivo, el precio sugerido y el kit de entrega' },
            { name: 'fecha', label: 'Fecha de elaboración', type: 'date', required: true },
            { name: 'vence', label: 'Vigencia hasta', type: 'date', required: true },
            { name: 'asunto', label: 'Asunto', full: true, required: true },
            { name: 'dx', label: 'DX audiológico (opcional)', type: 'textarea', full: true, rows: 3, hint: 'Aparece en el PDF bajo "DX AUDIOLOGICO"' }
          ] }], q)}
        <fieldset class="fs"><legend>Productos y servicios</legend>
          <div class="items">${q.items.map((it, i) => itemRow(it, i)).join('')}</div>
          <div class="row-btns"><button type="button" class="btn btn-sm" data-a="addprod">${ICON.plus} Producto del inventario</button><button type="button" class="btn btn-sm" data-a="addfree">${ICON.plus} Línea libre</button>${!q.items.some(x => x.principal) ? `<button type="button" class="btn btn-sm" data-a="adddev">${ICON.plus} Dispositivo del tipo</button>` : ''}</div>
          <div class="totals">
            <label class="fld inline"><span>Descuento general %</span><input type="number" name="descuentoGeneral" min="0" max="100" step="0.5" value="${esc(q.descuentoGeneral || 0)}" inputmode="decimal"></label>
            <dl>${totalsDl(t)}</dl>
          </div>
        </fieldset>
        ${formHtml([{ title: 'Condiciones comerciales', fields: [
          { name: 'formaPago', label: 'Forma de pago', type: 'textarea', rows: 2, full: true },
          { name: 'tiempoEntrega', label: 'Tiempo de entrega' },
          { name: 'garantia', label: 'Garantía', default: tipoActual().garantia },
          { name: 'observaciones', label: 'Observaciones comerciales', type: 'textarea', rows: 2, full: true }
        ] }], q)}
        <details class="fs det"><summary>Contenido del tipo "${esc(tipoActual().nombre)}" (descripción, incluye, kit)</summary>
          <label class="fld full"><span>Descripción</span><input name="descripcion" value="${esc(q.descripcion ?? tipoActual().descripcion)}"></label>
          <label class="fld full"><span>Incluye (una línea por ítem)</span><textarea name="incluye" rows="3">${esc((q.incluye ?? tipoActual().incluye).join('\n'))}</textarea></label>
          <label class="fld full"><span>Kit de entrega (una línea por ítem)</span><textarea name="kit" rows="6">${esc((q.kit ?? tipoActual().kit).join('\n'))}</textarea></label>
          <p class="muted small">Los valores por defecto de cada tipo se cambian en Ajustes &gt; Cotizaciones.</p>
        </details>
      </form>
      <div class="ed-bar">
        <span class="ed-total"><small>Total</small><b class="num">${money(t.total)}</b></span>
        <button class="btn" data-a="pdf">${ICON.eye}<span>PDF</span></button>
        ${q._nuevo ? '' : `<button class="btn btn-wa" data-a="wa">${ICON.wa}<span>WhatsApp</span></button>`}
        ${!q._nuevo && ['aceptada', 'enviada', 'seguimiento'].includes(est) && !q.ventaId ? `<button class="btn" data-a="venta">${ICON.cart}<span>Convertir en venta</span></button>` : ''}
        ${bloqueada ? '' : `<button class="btn btn-primary" data-a="save">${ICON.check}<span>Guardar</span></button>`}
      </div>
    </div>`;
    const form = $('form', main);
    bindForm(form);
    form.addEventListener('change', e => {
      const n = e.target.name;
      if (n === 'tipo') {
        sync(); const nt = tipoActual();
        const i = q.items.findIndex(x => x.principal);
        const it = itemDeTipo(nt);
        if (i >= 0) q.items[i] = { ...q.items[i], descripcion: it.descripcion, precio: it.precio, ivaPct: it.ivaPct };
        delete q.descripcion; delete q.incluye; delete q.kit; q.garantia = nt.garantia;
        draw(); toast('Tipo cambiado: se actualizaron dispositivo, precio sugerido y kit.');
      }
    });
    form.addEventListener('input', e => { const n = e.target.name || ''; if (n.startsWith('it_') || n === 'descuentoGeneral') { sync(); updateTotals(); } });
  };
  const updateTotals = () => {
    const t = totales(q.items, q.descuentoGeneral);
    $$('.item', main).forEach((el, i) => { const l = t.lines[i]; if (l) $('.item-tot .num', el).textContent = money(l.total); });
    $('.totals dl', main).innerHTML = totalsDl(t);
    $('.ed-total b', main).textContent = money(t.total);
  };
  const totalsDl = t => `<div><dt>Subtotal</dt><dd class="num">${money(t.subtotal)}</dd></div>${t.descuentos ? `<div><dt>Descuentos</dt><dd class="num">-${money(t.descuentos)}</dd></div>` : ''}${t.iva ? `<div><dt>IVA</dt><dd class="num">${money(t.iva)}</dd></div>` : ''}<div class="tot"><dt>Total</dt><dd class="num">${money(t.total)}</dd></div>`;
  const itemRow = (it, i) => `<div class="item" data-i="${i}">
      <label class="fld full"><span>Descripción</span><input name="it_desc_${i}" value="${esc(it.descripcion)}" required></label>
      <label class="fld"><span>Cant.</span><input type="number" name="it_cant_${i}" value="${esc(it.cantidad)}" min="0" step="1" inputmode="numeric"></label>
      <label class="fld"><span>Precio unit.</span><div class="money-in"><i>$</i><input name="it_precio_${i}" data-money inputmode="decimal" value="${esc(Number(it.precio || 0).toLocaleString('es-CO'))}"></div></label>
      <label class="fld"><span>Desc. %</span><input type="number" name="it_desc_pct_${i}" value="${esc(it.descPct || 0)}" min="0" max="100" step="0.5" inputmode="decimal"></label>
      <label class="fld"><span>IVA %</span><select name="it_iva_${i}">${[0, 5, 19].map(v => `<option ${Number(it.ivaPct) === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <div class="item-tot"><span class="num">${money((it.cantidad || 0) * (it.precio || 0) * (1 - (it.descPct || 0) / 100) * (1 + (it.ivaPct || 0) / 100))}</span><button type="button" class="btn btn-sm btn-ghost" data-del="${i}" aria-label="Quitar línea">${ICON.trash}</button></div>
    </div>`;
  const sync = () => {
    const form = $('form', main); if (!form) return;
    const v = readForm(form);
    Object.assign(q, { clienteId: v.clienteId, tipo: v.tipo, fecha: v.fecha, vence: v.vence, asunto: v.asunto, dx: v.dx, formaPago: v.formaPago, tiempoEntrega: v.tiempoEntrega, garantia: v.garantia, observaciones: v.observaciones, descuentoGeneral: Number(v.descuentoGeneral) || 0 });
    if (v.descripcion !== undefined) { q.descripcion = v.descripcion; q.incluye = v.incluye.split('\n').map(s => s.trim()).filter(Boolean); q.kit = v.kit.split('\n').map(s => s.trim()).filter(Boolean); }
    q.items = q.items.map((it, i) => ({ ...it, descripcion: v['it_desc_' + i] ?? it.descripcion, cantidad: Number(v['it_cant_' + i]) || 0, precio: typeof v['it_precio_' + i] === 'number' ? v['it_precio_' + i] : parseMoney(v['it_precio_' + i]), descPct: Number(v['it_desc_pct_' + i]) || 0, ivaPct: Number(v['it_iva_' + i]) || 0 }));
  };

  let saving = false;
  const guardar = async () => {
    if (saving) return null;
    sync();
    const err = validate($('form', main)); if (err) { toast(err, 'warn'); return null; }
    if (!q.items.length || !q.items.some(i => i.cantidad > 0)) { toast('Agrega al menos un producto con cantidad.', 'warn'); return null; }
    if (q.vence < q.fecha) { toast('La vigencia no puede ser anterior a la fecha.', 'warn'); return null; }
    const c = cliente(q.clienteId);
    const t = totales(q.items, q.descuentoGeneral);
    const row = {
      id: q.id, fecha: q.fecha, vence: q.vence, clienteId: q.clienteId, tipo: q.tipo, asunto: q.asunto, dx: q.dx,
      cliente: { nombre: c.nombre, tipoId: c.tipoId === 'CC' || !c.tipoId ? 'C.C.' : c.tipoId, identificacion: c.identificacion || '', ciudad: c.ciudad || '', telefono: c.whatsapp || c.telefono || '' },
      items: q.items.map(({ id, productoId, descripcion, cantidad, precio, descPct, ivaPct, principal }) => ({ id, productoId: productoId || '', descripcion, cantidad, precio, descPct, ivaPct, principal: !!principal })),
      descuentoGeneral: q.descuentoGeneral, subtotal: t.subtotal, descuentos: t.descuentos, iva: t.iva, total: t.total,
      formaPago: q.formaPago, tiempoEntrega: q.tiempoEntrega, garantia: q.garantia, observaciones: q.observaciones,
      descripcion: q.descripcion, incluye: q.incluye, kit: q.kit, estado: q.estado || 'borrador'
    };
    if (q._nuevo) { row.numero = `__AUTO__:COT-${q.fecha.slice(0, 4)}-:cot${q.fecha.slice(0, 4)}:4`; row.historial = [{ estado: 'borrador', fecha: today() }]; }
    saving = true;
    const btn = $('[data-a=save]', main); if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>'; }
    try {
      const saved = await store.batch([{ table: 'cotizaciones', mode: q._nuevo ? 'insert' : 'upsert', rows: [row], base: q._nuevo ? undefined : { [q.id]: q.updatedAt } }]);
      const s = saved.cotizaciones[0];
      toast(q._nuevo ? `Cotización ${s.numero} guardada` : 'Cotización actualizada');
      if (q._nuevo) { history.replaceState(null, '', '#cotizacion/' + s.id); }
      q = structuredClone(store.get('cotizaciones', s.id)); q.items = Array.isArray(q.items) ? q.items : [];
      draw();
      return q;
    } catch (e) { toast(e.message, 'error', 7000); if (btn) { btn.disabled = false; btn.innerHTML = ICON.check + '<span>Guardar</span>'; } return null; }
    finally { saving = false; }
  };

  main.onclick = async e => {
    const del = e.target.closest('[data-del]');
    if (del) { sync(); q.items.splice(+del.dataset.del, 1); draw(); return; }
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'addfree') { sync(); q.items.push({ id: uid('it'), descripcion: '', cantidad: 1, precio: 0, descPct: 0, ivaPct: 0 }); draw(); $$('.item input[name^=it_desc_]', main).pop()?.focus(); }
    if (a === 'adddev') { sync(); q.items.unshift(itemDeTipo(tipoActual())); draw(); }
    if (a === 'addprod') { sync(); elegirProducto(p => { q.items.push({ id: uid('it'), productoId: p.id, descripcion: p.nombre, cantidad: 1, precio: p.precio || 0, descPct: 0, ivaPct: Number(p.ivaPct ?? 19) }); draw(); }); }
    if (a === 'save') await guardar();
    if (a === 'pdf') {
      const s = bloqueada ? q : await guardar(); if (!s) return;
      const { cotizacionPdf, nombreCotizacion } = await import('../output.js');
      toast('Generando PDF…', 'ok', 1500);
      const blob = await cotizacionPdf(s);
      entregarArchivo({ blob, nombre: nombreCotizacion(s), carpeta: '03_Cotizaciones', titulo: 'PDF de la cotización', onDrive: r => store.upsert('cotizaciones', [{ id: s.id, pdfUrl: r.url }]).catch(() => { }) });
    }
    if (a === 'wa') { const s = bloqueada ? q : await guardar(); if (s) componerWhatsApp({ cliente: cliente(s.clienteId), cotizacionId: s.id, plantilla: 'cotizacion' }); }
    if (a === 'dup') duplicar(q);
    if (a === 'estado') cambiarEstado(q, () => { q = structuredClone(store.get('cotizaciones', q.id)); draw(); });
    if (a === 'venta') { const { convertirCotizacion } = await import('./ventas.js'); convertirCotizacion(store.get('cotizaciones', q.id)); }
  };
  draw();
}

function elegirProducto(cb) {
  const prods = inventario().filter(p => p.estado !== 'inactivo').sort((a, b) => a.nombre.localeCompare(b.nombre));
  const m = openModal({
    title: 'Agregar producto', size: 'md',
    body: `<label class="dt-search">${ICON.search}<input type="search" id="ep-q" placeholder="Buscar por nombre o SKU…"></label><ul class="list-links pick" id="ep-l"></ul>
      ${prods.length ? '' : '<p class="empty-inline">El inventario está vacío. Agrega productos en Inventario o usa "Línea libre".</p>'}`
  });
  const draw = q => { $('#ep-l', m.el).innerHTML = prods.filter(p => !q || (p.nombre + ' ' + (p.sku || '')).toLowerCase().includes(q.toLowerCase())).slice(0, 60).map(p => `<li><button type="button" data-id="${esc(p.id)}"><span><b>${esc(p.nombre)}</b><small>${esc(p.sku || '')} · existencia ${p.stock}</small></span><span class="num">${money(p.precio)}</span></button></li>`).join(''); };
  draw(''); $('#ep-q', m.el).oninput = e => draw(e.target.value);
  m.el.addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) { cb(prods.find(p => p.id === b.dataset.id)); m.close(); } });
}

export async function duplicar(q) {
  const f = today();
  const row = { ...structuredClone(q), id: uid('q'), numero: `__AUTO__:COT-${f.slice(0, 4)}-:cot${f.slice(0, 4)}:4`, fecha: f, vence: finDeMes(f), estado: 'borrador', historial: [{ estado: 'borrador', fecha: f, nota: 'Duplicada de ' + q.numero }], ventaId: '', pdfUrl: '' };
  delete row.createdAt; delete row.updatedAt; delete row._nuevo;
  const s = await store.insert('cotizaciones', [row]);
  toast(`Copia creada: ${s.cotizaciones[0].numero} (la original no cambió)`);
  location.hash = '#cotizacion/' + s.cotizaciones[0].id;
}

function cambiarEstado(q, done) {
  const opts = ['borrador', 'enviada', 'seguimiento', 'aceptada', 'rechazada'];
  const m = openModal({
    title: 'Cambiar estado', size: 'sm',
    body: `<div class="stack-btns">${opts.map(s => `<button class="btn btn-lg ${q.estado === s ? 'on' : ''}" data-s="${s}">${badge(s, ESTADOS_COT[s])}</button>`).join('')}</div>
      <label class="fld"><span>Nota (opcional)</span><input id="ce-n"></label>
      <h3>Historial</h3><ul class="timeline">${(q.historial || []).map(h => `<li><time>${fdate(h.fecha)}</time><div>${esc(ESTADOS_COT[h.estado] || h.estado)} ${h.nota ? '· ' + esc(h.nota) : ''}</div></li>`).join('') || '<li>Sin cambios registrados</li>'}</ul>`
  });
  m.el.addEventListener('click', async e => {
    const b = e.target.closest('[data-s]'); if (!b) return;
    const s = b.dataset.s;
    if (q.ventaId) { toast('Ya fue convertida en venta.', 'warn'); return; }
    await store.upsert('cotizaciones', [{ id: q.id, estado: s, historial: [...(q.historial || []), { estado: s, fecha: today(), nota: $('#ce-n', m.el).value }] }]);
    m.close(); toast('Estado: ' + ESTADOS_COT[s]);
    if (s === 'aceptada' && await confirmar({ title: 'Cotización aceptada', text: '¿Quieres convertirla ya en venta? (crea la cuenta por cobrar y descuenta inventario)', ok: 'Convertir en venta' })) {
      const { convertirCotizacion } = await import('./ventas.js'); convertirCotizacion(store.get('cotizaciones', q.id));
    }
    done && done();
  });
}
