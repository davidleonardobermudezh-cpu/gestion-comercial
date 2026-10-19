import { $, $$, esc, money, fdate, today, addDays, norm } from '../util.js';
import { store } from '../store.js';
import { oportunidades, TIPOS_OP, FUENTES, cliente, telefonoCliente, cfg, estadisticasIntervalos, FAMILIAS } from '../domain.js';
import { ICON, componerWhatsApp, openModal, emptyState } from '../ui.js';

const st = { tipo: '', prioridad: '', rango: 'ventana', q: '', sel: new Set() };

export function render(main) {
  const todas = oportunidades({ incluirFuturas: true });
  const ventana = Number(cfg('ventanaAlarmas')) || 30;
  const pend = todas.filter(o => !(o.posponerHasta && o.posponerHasta > today()));
  let list = st.rango === 'vencidas' ? pend.filter(o => o.dias <= 0)
    : st.rango === '7' ? pend.filter(o => o.dias <= 7)
      : st.rango === 'ventana' ? pend.filter(o => o.dias <= ventana)
        : st.rango === 'pospuestas' ? todas.filter(o => o.posponerHasta && o.posponerHasta > today())
          : todas;
  if (st.tipo) list = list.filter(o => o.tipo === st.tipo);
  if (st.prioridad) list = list.filter(o => o.prioridad === st.prioridad);
  if (st.q) { const q = norm(st.q); list = list.filter(o => norm(cliente(o.clienteId)?.nombre).includes(q) || norm(o.titulo).includes(q)); }
  const counts = Object.fromEntries(Object.keys(TIPOS_OP).map(k => [k, pend.filter(o => o.tipo === k && o.dias <= ventana).length]));
  const stats = estadisticasIntervalos();

  main.innerHTML = `<div class="page">
    <div class="page-h"><div><h1>Alarmas y oportunidades</h1><p class="muted">Clientes que pueden necesitar mantenimiento, baterías, repuestos, renovación o seguimiento. Las fechas son <b>estimaciones</b>, no certezas: cada alarma indica de dónde sale.</p></div>
      <div class="row-btns"><button class="btn" id="op-serie" ${list.length ? '' : 'disabled'}>${ICON.wa} Envío en serie</button><button class="btn" id="op-como">¿Cómo se calculan?</button></div></div>
    <div class="chips" role="group" aria-label="Tipo">
      <button class="chip ${!st.tipo ? 'on' : ''}" data-tipo="">Todas <em>${pend.filter(o => o.dias <= ventana).length}</em></button>
      ${Object.entries(TIPOS_OP).filter(([k]) => counts[k]).map(([k, t]) => `<button class="chip ${st.tipo === k ? 'on' : ''}" data-tipo="${k}">${t} <em>${counts[k]}</em></button>`).join('')}
    </div>
    <div class="dt-bar">
      <label class="dt-search">${ICON.search}<input type="search" id="op-q" placeholder="Buscar cliente…" value="${esc(st.q)}"></label>
      <select id="op-rango" aria-label="Rango"><option value="vencidas" ${st.rango === 'vencidas' ? 'selected' : ''}>Vencidas (para hoy)</option><option value="7" ${st.rango === '7' ? 'selected' : ''}>Próximos 7 días</option><option value="ventana" ${st.rango === 'ventana' ? 'selected' : ''}>Próximos ${ventana} días</option><option value="todas" ${st.rango === 'todas' ? 'selected' : ''}>Todas, incluso futuras</option><option value="pospuestas" ${st.rango === 'pospuestas' ? 'selected' : ''}>Pospuestas / contactadas</option></select>
      <select id="op-prio" aria-label="Prioridad"><option value="">Prioridad: todas</option><option value="alta" ${st.prioridad === 'alta' ? 'selected' : ''}>Alta</option><option value="media" ${st.prioridad === 'media' ? 'selected' : ''}>Media</option><option value="baja" ${st.prioridad === 'baja' ? 'selected' : ''}>Baja</option></select>
    </div>
    <p class="muted small">${list.length} alarma${list.length === 1 ? '' : 's'} · ${st.sel.size ? `<b>${st.sel.size} seleccionada(s)</b> · <button class="link" id="op-clear">quitar selección</button>` : 'Marca varias para enviarlas en serie'}</p>
    <div class="op-list">${list.length ? list.slice(0, 200).map(card).join('') : emptyState('Sin alarmas en este rango', st.rango === 'vencidas' ? 'No hay nada vencido. Cambia el rango para ver las próximas.' : 'Cuando registres ventas, entregas o cotizaciones aparecerán aquí.')}</div>
  </div>`;

  $$('[data-tipo]', main).forEach(b => b.onclick = () => { st.tipo = b.dataset.tipo; render(main); });
  $('#op-rango', main).onchange = e => { st.rango = e.target.value; render(main); };
  $('#op-prio', main).onchange = e => { st.prioridad = e.target.value; render(main); };
  let t; $('#op-q', main).oninput = e => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value; render(main); $('#op-q', main).focus(); const v = $('#op-q', main).value; $('#op-q', main).setSelectionRange(v.length, v.length); }, 250); };
  $('#op-clear', main)?.addEventListener('click', () => { st.sel.clear(); render(main); });
  $('#op-como', main).onclick = () => explicar(stats);
  $('#op-serie', main).onclick = () => enSerie(st.sel.size ? list.filter(o => st.sel.has(o.key)) : list.slice(0, 30), main);

  main.querySelector('.op-list').addEventListener('click', async e => {
    const el = e.target.closest('[data-k]'); if (!el) return;
    const o = list.find(x => x.key === el.dataset.k); if (!o) return;
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (e.target.matches('input[type=checkbox]')) { e.target.checked ? st.sel.add(o.key) : st.sel.delete(o.key); render(main); return; }
    if (a === 'wa') abrirWa(o, () => render(main));
    if (a === 'cot') location.hash = `#cotizacion/nueva/${o.clienteId}/${o.familia || ''}`;
    if (a === 'pos') posponer(o, main);
    if (a === 'desc') { await store.upsert('oport_estado', [{ id: o.key, clienteId: o.clienteId, estado: 'descartada', nota: 'Descartada' }]); }
    if (a === 'reabrir') { await store.upsert('oport_estado', [{ id: o.key, clienteId: o.clienteId, estado: 'pendiente', posponerHasta: '' }]); }
  });
}

function card(o) {
  const c = cliente(o.clienteId) || {};
  const tel = telefonoCliente(c);
  const cuando = o.dias < 0 ? `venció hace ${-o.dias} día${o.dias === -1 ? '' : 's'}` : o.dias === 0 ? 'hoy' : `en ${o.dias} día${o.dias === 1 ? '' : 's'}`;
  const pos = o.posponerHasta && o.posponerHasta > today();
  return `<article class="op p-${o.prioridad}" data-k="${esc(o.key)}">
    <label class="op-sel"><input type="checkbox" ${st.sel.has(o.key) ? 'checked' : ''} aria-label="Seleccionar"></label>
    <div class="op-main">
      <div class="op-top"><a href="#cliente/${esc(o.clienteId)}" class="op-name">${esc(c.nombre || '—')}</a><span class="badge b-${o.prioridad}">${o.prioridad === 'alta' ? 'Alta' : o.prioridad === 'media' ? 'Media' : 'Baja'}</span></div>
      <p class="op-t"><b>${esc(o.titulo)}</b> · <span class="${o.dias <= 0 ? 't-bad' : ''}">${fdate(o.fecha)} (${cuando})</span></p>
      ${o.detalle ? `<p class="op-d">${esc(o.detalle)}</p>` : ''}
      <p class="op-meta"><span class="src src-${o.fuente}" title="${esc(o.fuenteTxt)}">${esc(FUENTES[o.fuente])}</span><span class="muted">${esc(o.fuenteTxt)}</span></p>
      <p class="op-meta">${tel ? `<span>${ICON.phone} ${esc(tel)}</span>` : '<span class="t-warn">Sin número de WhatsApp</span>'}
        ${o.ultimoContacto ? `<span class="muted">Último contacto ${fdate(o.ultimoContacto)}</span>` : ''}
        ${o.saldoPendiente ? `<span class="${o.carteraVencida ? 't-bad' : ''}">Saldo ${money(o.saldoPendiente)}${o.carteraVencida && o.tipo !== 'cobro' ? ' · revisar condiciones' : ''}</span>` : ''}
        ${pos ? `<span class="muted">${o.estado === 'contactado' ? 'Contactado' : 'Pospuesta'} hasta ${fdate(o.posponerHasta)}</span>` : ''}</p>
    </div>
    <div class="op-act">
      <button class="btn btn-wa" data-a="wa">${ICON.wa}<span>WhatsApp</span></button>
      ${o.tipo !== 'cobro' ? `<button class="btn" data-a="cot">${ICON.doc}<span>Cotizar</span></button>` : ''}
      ${pos ? `<button class="btn btn-ghost" data-a="reabrir">Reactivar</button>` : `<button class="btn btn-ghost" data-a="pos">${ICON.clock}<span>Posponer</span></button>`}
      <button class="btn btn-ghost" data-a="desc" title="Descartar esta alarma">${ICON.x}<span class="sr">Descartar</span></button>
    </div>
  </article>`;
}

export function abrirWa(o, onSent) {
  const c = cliente(o.clienteId);
  return componerWhatsApp({ cliente: c, plantilla: o.plantilla, oportunidad: o, cotizacionId: o.cotizacionId, vars: { fecha: fdate(o.fecha), producto: o.producto || 'los repuestos', anios: o.anios || '' }, onSent });
}

function posponer(o, main) {
  const m = openModal({
    title: 'Posponer alarma', size: 'sm',
    body: `<p>${esc(cliente(o.clienteId)?.nombre)} · ${esc(o.titulo)}</p><div class="stack-btns">${[7, 15, 30, 60].map(d => `<button class="btn btn-lg" data-d="${d}">${d} días (hasta ${fdate(addDays(today(), d))})</button>`).join('')}</div>
      <label class="fld"><span>O elige una fecha</span><input type="date" id="pos-f" min="${today()}"></label>`,
    footer: `<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="pos-ok">Posponer a la fecha</button>`
  });
  const go = async f => { await store.upsert('oport_estado', [{ id: o.key, clienteId: o.clienteId, estado: 'pospuesta', posponerHasta: f, nota: 'Pospuesta' }]); m.close(); };
  m.el.querySelectorAll('[data-d]').forEach(b => b.onclick = () => go(addDays(today(), +b.dataset.d)));
  $('#pos-ok', m.el).onclick = () => { const f = $('#pos-f', m.el).value; if (f) go(f); };
}

function enSerie(lista, main) {
  if (!lista.length) return;
  const sinTel = lista.filter(o => !telefonoCliente(cliente(o.clienteId))).length;
  const m = openModal({
    title: 'Envío en serie por WhatsApp', size: 'sm',
    body: `<p>Se abrirá el mensaje de cada cliente, uno por uno (${lista.length}). En cada uno revisas el texto y tocas <b>Abrir WhatsApp</b>; al volver, aparece el siguiente.</p>
      ${sinTel ? `<p class="t-warn">${sinTel} no tienen número: podrás escribirlo en el momento.</p>` : ''}
      <p class="muted small">WhatsApp no permite envíos masivos automáticos desde enlaces gratuitos: cada envío lo confirmas tú.</p>`,
    footer: `<button class="btn" data-close>Cancelar</button><button class="btn btn-wa" id="ser-go">${ICON.wa} Empezar</button>`
  });
  $('#ser-go', m.el).onclick = () => {
    m.close(); let i = 0;
    const next = () => { if (i >= lista.length) { st.sel.clear(); render(main); return; } const o = lista[i++]; abrirWa(o, () => setTimeout(next, 400)); };
    next();
  };
}

function explicar(stats) {
  const r = cfg('reglas');
  const fila = (k, label) => { const s = stats[k]; return `<tr><td>${label}</td><td class="r">${s && s.n ? Math.round(s.mediana) + ' días' : '—'}</td><td class="r">${s?.n || 0}</td><td class="r">${r[k.replace('_ciclo', '')] ? r[k.replace('_ciclo', '')] + ' días' : ''}</td></tr>`; };
  openModal({
    title: '¿Cómo se calculan las alarmas?', size: 'md',
    body: `<p>Cada fecha se estima en este orden, y la alarma muestra cuál se usó:</p>
    <ol class="steps"><li><b>Historial del propio cliente</b>: si tiene 2 o más intervalos de compra de ese producto, se usa su mediana.</li>
    <li><b>Datos reales de todos sus pacientes</b>: si hay al menos ${r.minMuestras} casos, la mediana entre todos.</li>
    <li><b>Regla ajustable</b> (Ajustes &gt; Alarmas) solo si no hay datos suficientes. Ej.: mantenimiento cada 6 meses, como dicen sus cotizaciones.</li></ol>
    <p>Garantía: fecha de entrega + meses de garantía del equipo. Cobro: documentos vencidos. Cotizaciones: seguimiento ${r.seguimientoCotizacionDias} días después del último contacto.</p>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Producto</th><th class="r">Mediana real</th><th class="r">Casos</th><th class="r">Regla</th></tr></thead><tbody>
    ${fila('mantenimiento_ciclo', 'Mantenimiento')}${fila('bateria', 'Baterías')}${fila('domo', 'Domos')}${fila('filtro', 'Filtros')}${fila('molde', 'Moldes')}${fila('receptor', 'Receptores')}${fila('audifono', 'Renovación de audífono')}</tbody></table></div>
    <p class="muted small">Entre más ventas y entregas registre, más precisas son las estimaciones.</p>`
  });
}
