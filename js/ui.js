// Componentes de interfaz: modales, formularios, selector de cliente, diálogos de archivo y WhatsApp.
import { $, $$, esc, uid, money, fdate, today, toast, downloadBlob, shareFile, phoneForWa, norm, compressImage } from './util.js';
import { store } from './store.js';
import { cfg, rellenarPlantilla, firmaTexto, primerNombre, telefonoCliente, saldoCliente, titleCase } from './domain.js';

/* ------------------------------- Modal -------------------------------- */
let modalStack = [];
export function openModal({ title, body, footer = '', size = 'md', onClose, cls = '' }) {
  const root = document.getElementById('modal-root');
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal modal-${size} ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <header class="modal-h"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Cerrar">${ICON.x}</button></header>
    <div class="modal-b"></div>
    ${footer ? `<footer class="modal-f">${footer}</footer>` : ''}
  </div>`;
  const b = $('.modal-b', wrap);
  if (typeof body === 'string') b.innerHTML = body; else if (body) b.appendChild(body);
  const close = () => { wrap.classList.add('out'); setTimeout(() => wrap.remove(), 160); modalStack = modalStack.filter(m => m !== api); onClose && onClose(); };
  wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  root.appendChild(wrap);
  document.body.classList.add('has-modal');
  const api = { el: wrap, body: b, close };
  modalStack.push(api);
  setTimeout(() => { const f = $('input:not([type=hidden]):not([readonly]),select,textarea', b); if (f && window.matchMedia('(min-width: 900px)').matches) f.focus(); }, 60);
  return api;
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && modalStack.length) modalStack[modalStack.length - 1].close(); });
const obs = new MutationObserver(() => { if (!document.querySelector('.modal-wrap')) document.body.classList.remove('has-modal'); });
document.addEventListener('DOMContentLoaded', () => obs.observe(document.getElementById('modal-root'), { childList: true }));

export function confirmar({ title = 'Confirmar', text, ok = 'Confirmar', danger = false, input = null }) {
  return new Promise(res => {
    const m = openModal({
      title, size: 'sm',
      body: `<p class="lead">${esc(text)}</p>${input ? `<label class="fld"><span>${esc(input)}</span><textarea id="cf-input" rows="2" required></textarea></label>` : ''}`,
      footer: `<button class="btn" data-close>Cancelar</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="cf-ok">${esc(ok)}</button>`,
      onClose: () => res(false)
    });
    $('#cf-ok', m.el).onclick = () => {
      if (input) { const v = $('#cf-input', m.el).value.trim(); if (!v) { toast('Escribe el motivo para continuar.', 'warn'); return; } res(v); }
      else res(true);
      m.close();
    };
  });
}

/* ------------------------------ Formularios ------------------------------
 * sections: [{title, fields:[{name,label,type,options,required,hint,full,attrs,show:(vals)=>bool}]}]
 * type: text|number|money|date|select|textarea|checkbox|cliente|producto|file|tel|email|readonly
 */
export function formHtml(sections, values = {}) {
  return sections.map(s => `<fieldset class="fs">${s.title ? `<legend>${esc(s.title)}</legend>` : ''}<div class="grid-f">${s.fields.map(f => fieldHtml(f, values[f.name])).join('')}</div></fieldset>`).join('');
}
function fieldHtml(f, v) {
  const id = 'f-' + f.name;
  const req = f.required ? 'required' : '';
  const lab = `<span>${esc(f.label)}${f.required ? ' <b class="req" aria-hidden="true">*</b>' : ''}</span>`;
  const hint = f.hint ? `<small class="hint">${esc(f.hint)}</small>` : '';
  const cls = 'fld' + (f.full ? ' full' : '') + (f.type === 'checkbox' ? ' chk' : '');
  const dataShow = f.showIf ? ` data-show-if="${esc(JSON.stringify(f.showIf))}"` : '';
  v = v ?? f.default ?? '';
  switch (f.type) {
    case 'select': {
      const opts = (typeof f.options === 'function' ? f.options() : f.options) || [];
      return `<label class="${cls}"${dataShow}>${lab}<select id="${id}" name="${f.name}" ${req}>${f.placeholder !== false ? `<option value="">${esc(f.placeholder || 'Seleccionar…')}</option>` : ''}${opts.map(o => { const [val, txt] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(txt)}</option>`; }).join('')}</select>${hint}</label>`;
    }
    case 'textarea': return `<label class="${cls}"${dataShow}>${lab}<textarea id="${id}" name="${f.name}" rows="${f.rows || 3}" ${req}>${esc(v)}</textarea>${hint}</label>`;
    case 'checkbox': return `<label class="${cls}"${dataShow}><input type="checkbox" id="${id}" name="${f.name}" ${v ? 'checked' : ''}> ${lab}${hint}</label>`;
    case 'money': return `<label class="${cls}"${dataShow}>${lab}<div class="money-in"><i>$</i><input id="${id}" name="${f.name}" inputmode="decimal" data-money value="${v === '' ? '' : esc(Number(v).toLocaleString('es-CO'))}" ${req} autocomplete="off"></div>${hint}</label>`;
    case 'cliente': return `<div class="${cls}"${dataShow}>${lab}${comboHtml(id, f.name, v, 'cliente', f.required)}${hint}</div>`;
    case 'producto': return `<div class="${cls}"${dataShow}>${lab}${comboHtml(id, f.name, v, 'producto', f.required)}${hint}</div>`;
    case 'file': return `<label class="${cls}"${dataShow}>${lab}<input type="file" id="${id}" name="${f.name}" accept="${f.accept || 'image/*,application/pdf'}" ${f.capture ? 'capture="environment"' : ''}>${hint}</label>`;
    case 'readonly': return `<div class="${cls}"${dataShow}>${lab}<div class="ro" id="${id}">${f.html ?? esc(v)}</div>${hint}</div>`;
    default: {
      const t = f.type === 'number' ? 'number' : f.type === 'password' ? 'password' : f.type === 'date' ? 'date' : f.type === 'tel' ? 'tel' : f.type === 'email' ? 'email' : 'text';
      const extra = f.type === 'number' ? `step="${f.step || 'any'}" inputmode="decimal"` : f.type === 'tel' ? 'inputmode="tel"' : '';
      return `<label class="${cls}"${dataShow}>${lab}<input type="${t}" id="${id}" name="${f.name}" value="${esc(v)}" ${extra} ${req} ${f.attrs || ''} ${f.list ? `list="dl-${f.name}"` : ''} autocomplete="off">${f.list ? `<datalist id="dl-${f.name}">${f.list.map(o => `<option value="${esc(o)}">`).join('')}</datalist>` : ''}${hint}</label>`;
    }
  }
}
export function parseMoney(s) {
  if (typeof s === 'number') return s;
  s = String(s || '').replace(/[^\d,.-]/g, '');
  if (!s) return 0;
  // formato colombiano: 1.234.567,89
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/\./g, '');
  return Number(s) || 0;
}
export function bindForm(root) {
  $$('input[data-money]', root).forEach(inp => {
    inp.addEventListener('input', () => {
      const raw = inp.value; const hasComma = raw.includes(',');
      const [ent, dec] = raw.replace(/[^\d,]/g, '').split(',');
      const n = ent ? Number(ent).toLocaleString('es-CO') : '';
      inp.value = n + (hasComma ? ',' + (dec || '').slice(0, 2) : '');
    });
  });
  $$('.combo', root).forEach(bindCombo);
  const upd = () => {
    const vals = readForm(root);
    $$('[data-show-if]', root).forEach(el => {
      const cond = JSON.parse(el.dataset.showIf);
      const ok = Object.entries(cond).every(([k, v]) => Array.isArray(v) ? v.includes(vals[k]) : vals[k] === v);
      el.hidden = !ok;
    });
  };
  root.addEventListener('change', upd); upd();
}
export function readForm(root) {
  const o = {};
  $$('[name]', root).forEach(el => {
    if (el.closest('[hidden]')) { o[el.name] = el.type === 'checkbox' ? false : ''; return; }
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'file') o[el.name] = el.files[0] || null;
    else if (el.dataset.money !== undefined) o[el.name] = el.value === '' ? '' : parseMoney(el.value);
    else if (el.type === 'number') o[el.name] = el.value === '' ? '' : Number(el.value);
    else o[el.name] = el.value.trim();
  });
  return o;
}
export function validate(root) {
  for (const el of $$('[required]', root)) {
    if (el.closest('[hidden]')) continue;
    const empty = el.type === 'checkbox' ? !el.checked : !String(el.value || '').trim();
    if (empty) {
      const lab = el.closest('.fld')?.querySelector('span')?.textContent?.replace('*', '').trim() || 'Este campo';
      const vis = el.type === 'hidden' ? el.parentElement.querySelector('input:not([type=hidden])') : el;
      vis?.focus(); vis?.closest('.fld')?.classList.add('bad');
      setTimeout(() => vis?.closest('.fld')?.classList.remove('bad'), 2500);
      return `Falta: ${lab}`;
    }
  }
  return null;
}

/* Formulario en modal con protección contra doble clic */
export function formModal({ title, sections, values = {}, submitLabel = 'Guardar', onSubmit, size = 'md', extraFooter = '', afterRender }) {
  const m = openModal({
    title, size,
    body: `<form class="form" novalidate>${formHtml(sections, values)}<button type="submit" hidden></button></form>`,
    footer: `${extraFooter}<button class="btn" data-close type="button">Cancelar</button><button class="btn btn-primary" data-submit type="button">${esc(submitLabel)}</button>`
  });
  const form = $('form', m.el);
  bindForm(form);
  let busy = false, done = false;
  const submit = async () => {
    if (busy || done) return;
    const err = validate(form);
    if (err) { toast(err, 'warn'); return; }
    busy = true;
    const btn = $('[data-submit]', m.el); const prev = btn.textContent;
    btn.disabled = true; btn.innerHTML = `<span class="spin"></span> Guardando…`;
    try {
      const r = await onSubmit(readForm(form), form, m);
      if (r !== false) { done = true; m.close(); }
    } catch (e) {
      toast(e.message || String(e), 'error', 6000);
    } finally { busy = false; btn.disabled = false; btn.textContent = prev; }
  };
  $('[data-submit]', m.el).onclick = submit;
  form.addEventListener('submit', e => { e.preventDefault(); submit(); });
  afterRender && afterRender(form, m);
  return m;
}

/* -------------------------- Combo buscable --------------------------- */
function comboHtml(id, name, value, kind, required) {
  const label = value ? (kind === 'cliente' ? store.get('clientes', value)?.nombre : store.get('productos', value)?.nombre) || '' : '';
  return `<div class="combo" data-kind="${kind}"><input type="hidden" name="${name}" id="${id}" value="${esc(value || '')}" ${required ? 'required' : ''}>
    <input type="search" class="combo-in" placeholder="Buscar ${kind === 'cliente' ? 'cliente por nombre o cédula' : 'producto por nombre o SKU'}…" value="${esc(label)}" autocomplete="off" aria-label="Buscar ${kind}">
    <div class="combo-list" role="listbox" hidden></div></div>`;
}
function bindCombo(box) {
  const hid = $('input[type=hidden]', box), inp = $('.combo-in', box), list = $('.combo-list', box);
  const kind = box.dataset.kind;
  let items = [], idx = -1;
  const source = () => kind === 'cliente'
    ? store.all('clientes').filter(c => c.estado !== 'inactivo').map(c => ({ id: c.id, t: c.nombre, s: [c.identificacion, c.telefono].filter(Boolean).join(' · ') }))
    : store.all('productos').filter(p => p.estado !== 'inactivo').map(p => ({ id: p.id, t: p.nombre, s: [p.sku, p.precio ? money(p.precio) : ''].filter(Boolean).join(' · ') }));
  const render = () => {
    const q = norm(inp.value);
    items = source().filter(x => !q || norm(x.t + ' ' + x.s).includes(q)).sort((a, b) => a.t.localeCompare(b.t, 'es')).slice(0, 40);
    list.innerHTML = items.map((x, i) => `<button type="button" role="option" class="combo-opt ${i === idx ? 'on' : ''}" data-i="${i}"><b>${esc(x.t)}</b>${x.s ? `<small>${esc(x.s)}</small>` : ''}</button>`).join('')
      + (kind === 'cliente' ? `<button type="button" class="combo-opt combo-new" data-new>+ Crear cliente nuevo${inp.value ? ': ' + esc(inp.value) : ''}</button>` : '')
      + (!items.length && kind !== 'cliente' ? '<div class="combo-empty">Sin resultados</div>' : '');
    list.hidden = false;
  };
  const pick = x => { hid.value = x.id; inp.value = x.t; list.hidden = true; hid.dispatchEvent(new Event('change', { bubbles: true })); };
  inp.addEventListener('focus', render);
  inp.addEventListener('input', () => { hid.value = ''; idx = -1; render(); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { idx = Math.min(items.length - 1, idx + 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); render(); e.preventDefault(); }
    else if (e.key === 'Enter' && idx >= 0) { pick(items[idx]); e.preventDefault(); }
  });
  list.addEventListener('mousedown', e => e.preventDefault());
  list.addEventListener('click', async e => {
    const b = e.target.closest('.combo-opt'); if (!b) return;
    if (b.hasAttribute('data-new')) {
      list.hidden = true;
      const { nuevoClienteRapido } = await import('./views/clientes.js');
      const c = await nuevoClienteRapido(inp.value);
      if (c) pick({ id: c.id, t: c.nombre });
      return;
    }
    pick(items[+b.dataset.i]);
  });
  inp.addEventListener('blur', () => setTimeout(() => { list.hidden = true; if (!hid.value) inp.value = ''; }, 150));
}

/* ------------------------- Entregar un archivo ------------------------ */
// Muestra opciones reales: descargar, compartir (menú nativo) y guardar en Drive.
export function entregarArchivo({ blob, nombre, carpeta, titulo = 'Archivo listo', onDrive, waTexto }) {
  const canShare = (() => { try { return !!(navigator.canShare && navigator.canShare({ files: [new File([blob], nombre, { type: blob.type })] })); } catch { return false; } })();
  const m = openModal({
    title: titulo, size: 'sm',
    body: `<div class="file-card"><div class="file-ic">${blob.type.includes('pdf') ? 'PDF' : 'XLSX'}</div><div><b>${esc(nombre)}</b><small>${(blob.size / 1024).toFixed(0)} KB · generado en este dispositivo</small></div></div>
      <div class="stack-btns">
        ${blob.type.includes('pdf') ? `<button class="btn btn-lg" data-a="ver">${ICON.eye} Vista previa</button>` : ''}
        <button class="btn btn-lg" data-a="dl">${ICON.download} Descargar</button>
        ${canShare ? `<button class="btn btn-lg" data-a="share">${ICON.share} Compartir (WhatsApp, correo…)</button>` : ''}
        <button class="btn btn-lg" data-a="drive" ${store.remote ? '' : 'disabled'}>${ICON.drive} Guardar copia en Google Drive</button>
        ${store.remote ? '' : '<small class="muted">Para guardar en Drive conecta la app en Ajustes &gt; Conexión.</small>'}
      </div><p class="drive-res muted" aria-live="polite"></p>`
  });
  m.el.addEventListener('click', async e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'ver') { const url = URL.createObjectURL(blob); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000); }
    if (a === 'dl') { downloadBlob(blob, nombre); toast('Descarga iniciada: ' + nombre); }
    if (a === 'share') { const r = await shareFile(blob, nombre, waTexto || ''); if (r === true) toast('Se abrió el menú para compartir. El envío lo confirmas en la otra app.'); else if (r === false) toast('Este navegador no permite compartir archivos; usa Descargar.', 'warn'); }
    if (a === 'drive') {
      b.disabled = true; b.innerHTML = '<span class="spin"></span> Subiendo a Drive…';
      try {
        const r = await store.upload({ folder: carpeta, name: nombre, blob, replace: true });
        $('.drive-res', m.el).innerHTML = `Guardado en Drive › Gestión Comercial/${esc(r.carpeta)} · <a href="${esc(r.url)}" target="_blank" rel="noopener">abrir</a>`;
        toast('Guardado en Google Drive');
        onDrive && onDrive(r);
        b.innerHTML = `${ICON.check} Guardado en Drive`;
      } catch (err) { toast('No se guardó en Drive: ' + err.message, 'error', 7000); b.disabled = false; b.innerHTML = `${ICON.drive} Reintentar guardar en Drive`; }
    }
  });
  return m;
}

/* ---------------------------- WhatsApp ---------------------------- */
// Abre WhatsApp con el texto listo. No se puede confirmar el envío: eso ocurre dentro de WhatsApp.
export function waLink(tel, texto) {
  const n = phoneForWa(tel, cfg('negocio').indicativo || '57');
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : `https://wa.me/?text=${encodeURIComponent(texto)}`;
}
export function variablesMensaje(c, extra = {}) {
  const neg = cfg('negocio');
  const sc = c ? saldoCliente(c.id) : { saldo: 0 };
  return {
    nombre: primerNombre(c) || 'cliente', nombreCompleto: titleCase(c?.nombre || ''), negocio: titleCase(neg.nombre) + ' — ' + titleCase(neg.profesion),
    firma: firmaTexto(), saldo: money(sc.saldo), mediosPago: cfg('mediosPago').slice(0, 3).join(', '), ...extra
  };
}
/**
 * Compositor: elige plantilla o cotización, edita el texto y abre WhatsApp.
 * opts: {cliente, plantilla, vars, oportunidad, cotizacionId, onSent}
 */
export async function componerWhatsApp(opts) {
  const c = opts.cliente;
  const plantillas = cfg('plantillas');
  const cots = store.all('cotizaciones').filter(q => q.clienteId === c.id).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  let tel = telefonoCliente(c);
  const vars = variablesMensaje(c, opts.vars || {});
  const pid = opts.plantilla || 'general';
  const textoDe = id => rellenarPlantilla((plantillas.find(p => p.id === id) || plantillas[0]).texto, vars);
  const m = openModal({
    title: 'Enviar por WhatsApp', size: 'md',
    body: `<div class="wa">
      <div class="wa-to"><div><b>${esc(titleCase(c.nombre))}</b><small>${opts.oportunidad ? esc(opts.oportunidad.titulo) : 'Mensaje directo'}</small></div></div>
      <label class="fld"><span>Número de WhatsApp</span><input id="wa-tel" type="tel" inputmode="tel" value="${esc(tel)}" placeholder="Ej. 3001234567"><small class="hint" id="wa-tel-h">${tel ? '' : 'Este cliente no tiene número. Escríbelo y se guardará en su ficha.'}</small></label>
      <div class="seg" role="tablist"><button type="button" class="on" data-mode="msg">Mensaje</button><button type="button" data-mode="cot">Cotización</button></div>
      <div data-pane="msg">
        <label class="fld"><span>Mensaje predefinido</span><select id="wa-pl">${plantillas.map(p => `<option value="${esc(p.id)}" ${p.id === pid ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></label>
      </div>
      <div data-pane="cot" hidden>
        ${cots.length ? `<label class="fld"><span>Cotización</span><select id="wa-cot">${cots.map(q => `<option value="${esc(q.id)}" ${q.id === opts.cotizacionId ? 'selected' : ''}>${esc(q.numero)} · ${fdate(q.fecha)} · ${money(q.total)}</option>`).join('')}</select></label>
        <label class="fld chk"><input type="checkbox" id="wa-link" ${store.remote ? 'checked' : 'disabled'}> <span>Incluir enlace al PDF (se guarda en Drive con acceso por enlace)</span></label>
        <p class="muted small">También puedes adjuntar el PDF con "Compartir PDF" desde el celular.</p>`
        : `<p class="empty-inline">Este cliente no tiene cotizaciones. <button type="button" class="link" data-newcot>Crear una cotización</button></p>`}
      </div>
      <label class="fld"><span>Texto a enviar (puedes editarlo)</span><textarea id="wa-txt" rows="8">${esc(textoDe(pid))}</textarea></label>
    </div>`,
    footer: `<button class="btn" data-close>Cancelar</button><button class="btn" id="wa-share" hidden>${ICON.share} Compartir PDF</button><a class="btn btn-wa" id="wa-go" href="#" target="_blank" rel="noopener">${ICON.wa} Abrir WhatsApp</a>`
  });
  const el = m.el;
  let mode = opts.cotizacionId ? 'cot' : 'msg';
  const setMode = md => {
    mode = md;
    $$('.seg button', el).forEach(b => b.classList.toggle('on', b.dataset.mode === md));
    $$('[data-pane]', el).forEach(p => p.hidden = p.dataset.pane !== md);
    $('#wa-share', el).hidden = !(md === 'cot' && cots.length);
    if (md === 'cot' && cots.length) cotText(); else $('#wa-txt', el).value = textoDe($('#wa-pl', el).value);
  };
  const cotSel = () => store.get('cotizaciones', $('#wa-cot', el)?.value);
  const cotText = (enlace = '') => {
    const q = cotSel(); if (!q) return;
    const pl = plantillas.find(p => p.id === 'cotizacion') || plantillas[0];
    $('#wa-txt', el).value = rellenarPlantilla(pl.texto, { ...vars, numero: q.numero, total: money(q.total), vence: fdate(q.vence), enlace: enlace || (q.pdfUrl && $('#wa-link', el)?.checked ? 'Cotización: ' + q.pdfUrl : '') });
  };
  $$('.seg button', el).forEach(b => b.onclick = () => setMode(b.dataset.mode));
  $('#wa-pl', el).onchange = e => { $('#wa-txt', el).value = textoDe(e.target.value); };
  $('#wa-cot', el)?.addEventListener('change', () => cotText());
  $('#wa-link', el)?.addEventListener('change', () => cotText());
  $('[data-newcot]', el)?.addEventListener('click', () => { m.close(); location.hash = '#cotizacion/nueva/' + c.id; });
  if (mode === 'cot') setMode('cot');

  $('#wa-share', el).onclick = async () => {
    const q = cotSel(); if (!q) return;
    const { cotizacionPdf, nombreCotizacion } = await import('./output.js');
    const blob = await cotizacionPdf(q);
    const r = await shareFile(blob, nombreCotizacion(q), $('#wa-txt', el).value);
    if (r === true) { await registrarContacto(c, opts, 'PDF compartido desde el menú del celular', q.id); toast('Menú de compartir abierto. Elige WhatsApp y confirma el envío allí.'); }
    else if (r === false) { downloadBlob(blob, nombreCotizacion(q)); toast('Este navegador no comparte archivos: se descargó el PDF para adjuntarlo.', 'warn', 6000); }
  };
  $('#wa-go', el).addEventListener('click', async e => {
    e.preventDefault();
    const t = $('#wa-tel', el).value.trim();
    if (!phoneForWa(t)) { toast('Escribe un número de celular válido (10 dígitos).', 'warn'); $('#wa-tel', el).focus(); return; }
    let texto = $('#wa-txt', el).value.trim();
    // Abrimos la ventana dentro del clic para que el navegador no la bloquee
    const win = window.open('about:blank', '_blank');
    try {
      if (mode === 'cot' && $('#wa-link', el)?.checked) {
        const q = cotSel();
        if (q && !q.pdfUrl) {
          const { cotizacionPdf, nombreCotizacion } = await import('./output.js');
          const r = await store.upload({ folder: '03_Cotizaciones', name: nombreCotizacion(q), blob: await cotizacionPdf(q), share: true, replace: true });
          await store.upsert('cotizaciones', [{ id: q.id, pdfUrl: r.url }]);
          q.pdfUrl = r.url; cotText(); texto = $('#wa-txt', el).value.trim();
        }
      }
      if (t !== tel) { await store.upsert('clientes', [{ id: c.id, whatsapp: t }]); tel = t; }
      const url = waLink(t, texto);
      if (win) win.location.href = url; else location.href = url;
      await registrarContacto(c, opts, 'WhatsApp abierto con el mensaje', mode === 'cot' ? cotSel()?.id : opts.cotizacionId, texto);
      m.close();
      toast('WhatsApp abierto con el mensaje listo. Toca enviar allí para completarlo.', 'ok', 6000);
      opts.onSent && opts.onSent();
    } catch (err) { if (win) win.close(); toast(err.message, 'error', 7000); }
  });
  return m;
}
async function registrarContacto(c, opts, resultado, cotizacionId, texto = '') {
  const o = opts.oportunidad;
  const rows = [{ id: uid('ct'), clienteId: c.id, fecha: today(), canal: 'WhatsApp', motivo: o ? o.titulo : 'Mensaje directo', texto: texto.slice(0, 1000), oportunidadKey: o?.key || '', cotizacionId: cotizacionId || '', resultado }];
  const ops = [{ table: 'contactos', mode: 'insert', rows }];
  if (o) ops.push({ table: 'oport_estado', mode: 'upsert', rows: [{ id: o.key, clienteId: c.id, estado: 'contactado', posponerHasta: (await import('./util.js')).addDays(today(), 7), nota: resultado }] });
  if (cotizacionId) {
    const q = store.get('cotizaciones', cotizacionId);
    if (q && (q.estado === 'borrador' || q.estado === 'enviada')) {
      const est = q.estado === 'borrador' ? 'enviada' : 'seguimiento';
      ops.push({ table: 'cotizaciones', mode: 'upsert', rows: [{ id: q.id, estado: est, historial: [...(q.historial || []), { estado: est, fecha: today(), nota: 'WhatsApp' }] }] });
    }
  }
  try { await store.batch(ops); } catch (e) { toast('El mensaje se abrió, pero no se pudo registrar el contacto: ' + e.message, 'warn', 6000); }
}

/* -------------------------- Archivos soporte -------------------------- */
export async function subirSoporte(file, nombreBase, carpeta = '07_Soportes') {
  if (!file) return null;
  const f = await compressImage(file);
  const ext = (f.name.match(/\.\w+$/) || ['.jpg'])[0];
  const r = await store.upload({ folder: carpeta, name: `${nombreBase}${ext}`, blob: f, replace: true });
  return r.url;
}

/* ------------------------------ Iconos ------------------------------- */
const s = p => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
export const ICON = {
  home: s('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>'),
  bell: s('<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>'),
  users: s('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.8.7 3 2.4 3.5 5.2"/>'),
  wallet: s('<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/><path d="M6 6l9-3 1 3"/>'),
  doc: s('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>'),
  box: s('<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>'),
  truck: s('<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>'),
  chart: s('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  gear: s('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>'),
  plus: s('<path d="M12 5v14M5 12h14"/>'),
  x: s('<path d="M6 6l12 12M18 6L6 18"/>'),
  menu: s('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  search: s('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>'),
  download: s('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  share: s('<path d="M12 15V3M8 7l4-4 4 4"/><path d="M5 12v8h14v-8"/>'),
  drive: s('<path d="M8 3h8l6 10-4 7H6l-4-7z"/><path d="M8 3l6 10h8M2 13h12l-4 7"/>'),
  eye: s('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  check: s('<path d="M5 12l5 5 9-10"/>'),
  edit: s('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>'),
  copy: s('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
  money: s('<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>'),
  clip: s('<path d="M20 11.5l-8.2 8.2a5 5 0 0 1-7-7L13 4.4a3.3 3.3 0 0 1 4.7 4.7l-8.1 8.1a1.7 1.7 0 0 1-2.4-2.4l7.4-7.4"/>'),
  clock: s('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  sync: s('<path d="M20 11a8 8 0 0 0-14.3-4.3L4 9M4 4v5h5M4 13a8 8 0 0 0 14.3 4.3L20 15M20 20v-5h-5"/>'),
  wa: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 2.2a9.7 9.7 0 0 0-8.3 14.8L2.4 21.8l4.9-1.3A9.7 9.7 0 1 0 12 2.2zm0 17.6c-1.5 0-3-.4-4.2-1.2l-.3-.2-2.9.8.8-2.8-.2-.3A7.9 7.9 0 1 1 12 19.8zm4.4-5.9c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8 1c-.1.2-.3.2-.5.1a6.5 6.5 0 0 1-3.2-2.8c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 2s.8 2.3 1 2.5c.1.2 1.7 2.6 4.1 3.6 1.5.7 2.1.7 2.9.6.5-.1 1.4-.6 1.6-1.1.2-.6.2-1 .1-1.1l-.5-.5z"/></svg>',
  arrow: s('<path d="M9 6l6 6-6 6"/>'),
  back: s('<path d="M15 6l-6 6 6 6"/>'),
  alert: s('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>'),
  phone: s('<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z"/>'),
  trash: s('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  undo: s('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  upload: s('<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>'),
  more: s('<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'),
  filter: s('<path d="M3 5h18l-7 8v6l-4 2v-8z"/>'),
  cart: s('<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12.4a1 1 0 0 0 1 .8h9.7a1 1 0 0 0 1-.8L21 7H6"/>')
};

/* ----------------------------- Badges ------------------------------ */
export function badge(estado, txt) { return `<span class="badge b-${esc(estado)}">${esc(txt || estado)}</span>`; }
export function emptyState(title, text, action = '') {
  return `<div class="empty"><div class="empty-ic">${ICON.doc}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
}
