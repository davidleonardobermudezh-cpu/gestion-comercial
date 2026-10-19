import { $, $$, esc, money, fdate, today, toast, uid, downloadBlob, compressImage, slug } from '../util.js';
import { store, TABLES } from '../store.js';
import { cfg, DEFAULTS, familiaDe, FAMILIAS } from '../domain.js';
import { ICON, formHtml, bindForm, readForm, openModal, confirmar, entregarArchivo } from '../ui.js';
import { APP_VERSION } from '../app.js';
import * as auth from '../auth.js';

const SECCIONES = [['conexion', 'Conexión con Google'], ['perfiles', 'Perfiles de ingreso'], ['miperfil', 'Mi perfil'], ['negocio', 'Datos del negocio'], ['cotizaciones', 'Cotizaciones'], ['plantillas', 'Mensajes de WhatsApp'], ['alarmas', 'Alarmas'], ['listas', 'Listas y categorías'], ['proveedor', 'Proveedor'], ['importar', 'Importar histórico'], ['respaldo', 'Respaldo y datos']];

export function render(main, args = []) {
  let sec = args[0] || 'conexion';
  if (sec === 'bienvenida') return bienvenida(main);
  const admin = auth.esAdmin();
  if (!admin) sec = 'miperfil';
  const secciones = admin ? SECCIONES.filter(([k]) => k !== 'miperfil' || auth.actual()) : SECCIONES.filter(([k]) => k === 'miperfil');
  main.innerHTML = `<div class="page settings">
    <div class="page-h"><div><h1>Ajustes</h1><p class="muted">Versión ${APP_VERSION} · ${store.remote ? 'Conectada a Google Sheets' : 'Modo local (solo este dispositivo)'}</p></div></div>
    <div class="set-layout"><nav class="set-nav">${secciones.map(([k, t]) => `<a href="#ajustes/${k}" class="${k === sec ? 'on' : ''}">${t}</a>`).join('')}</nav>
    <div class="set-body panel" id="set-body"></div></div></div>`;
  const body = $('#set-body', main);
  ({ conexion, perfiles: seccionPerfiles, miperfil, negocio, cotizaciones, plantillas, alarmas, listas, proveedor, importar, respaldo }[sec] || conexion)(body);
}

function bienvenida(main) {
  main.innerHTML = `<div class="page welcome">
    <div class="welcome-card panel">
      <img src="img/logo.jpg" alt="" width="88" height="88">
      <h1>Gestión Comercial</h1>
      <p>Clientes, cartera, cuenta con Medihumana, inventario, cotizaciones y alarmas de WhatsApp. Todo gratis y desde el celular.</p>
      <ol class="steps"><li><b>Conecta tu Google</b> (una sola vez): los datos quedan en una hoja de cálculo de tu Drive, sincronizados entre celular y computador.</li><li><b>Importa el histórico</b> del Excel: 162 pacientes, 123 audífonos entregados y la cuenta con Medihumana ya conciliada.</li><li>Revisa las <b>alarmas</b> y envía mensajes por WhatsApp.</li></ol>
      <div class="stack-btns"><a class="btn btn-primary btn-lg" href="#ajustes/conexion">Conectar con Google</a><button class="btn btn-lg" id="wl-local">Probar en modo local (solo este dispositivo)</button></div>
    </div></div>`;
  $('#wl-local', main).onclick = () => { try { localStorage.setItem('gc.welcomed', '1'); } catch { } location.hash = '#ajustes/importar'; };
}

/* ------------------------------ Conexión ------------------------------ */
function conexion(body) {
  const c = store.conn || {};
  body.innerHTML = `<h2>Conexión con Google (gratis)</h2>
    <p>La base de datos es una hoja de cálculo en tu Google Drive con un pequeño script (Apps Script), igual que en Finanzas Familiares. No hay costos ni suscripciones.</p>
    <details class="guide"><summary>Cómo obtener la URL y la clave (5 minutos, una sola vez)</summary><ol class="steps">
      <li>En Google Drive crea una <b>hoja de cálculo nueva</b> llamada "Gestión Comercial BD".</li>
      <li>Menú <b>Extensiones › Apps Script</b>. Borra lo que aparece y pega el archivo <code>Code.gs</code> que viene con la app. Guarda.</li>
      <li>Arriba elige la función <b>instalar</b> y toca <b>Ejecutar</b>. Acepta los permisos (Configuración avanzada › Ir a… si Google lo pide).</li>
      <li>Toca <b>Implementar › Nueva implementación › Aplicación web</b>. Ejecutar como: <b>Yo</b>. Quién tiene acceso: <b>Cualquier usuario</b>. Implementar y copia la URL que termina en <code>/exec</code>.</li>
      <li>La <b>clave</b> está en la pestaña <b>LEEME</b> de la hoja. Pega ambas aquí abajo y toca Probar.</li></ol></details>
    <form class="form" id="cx-f" novalidate>${formHtml([{ fields: [
      { name: 'url', label: 'URL de la aplicación web (/exec)', full: true, required: true, attrs: 'placeholder="https://script.google.com/macros/s/…/exec"' },
      { name: 'token', label: 'Clave de la app', full: true, required: true }
    ] }], c)}</form>
    <div class="row-btns"><button class="btn btn-primary" id="cx-test">Probar y guardar</button>${store.remote ? `<button class="btn" id="cx-sync">${ICON.sync} Sincronizar ahora</button><button class="btn btn-danger-ghost" id="cx-off">Desconectar este dispositivo</button>` : ''}</div>
    <div id="cx-res" class="res" aria-live="polite">${store.remote ? `<p class="t-good">Conectado. ${esc(store.statusMsg || '')}</p>` : ''}</div>
    <p class="muted small">Seguridad: quien tenga la URL y la clave puede leer y escribir. Úsalas solo en tus dispositivos. Para cambiar la clave, borra la propiedad TOKEN del script y vuelve a ejecutar <b>instalar</b>.</p>`;
  bindForm($('#cx-f', body));
  $('#cx-test', body).onclick = async e => {
    const v = readForm($('#cx-f', body));
    if (!/^https:\/\/script\.google(usercontent)?\.com\/.+/.test(v.url)) { toast('La URL debe empezar por https://script.google.com/macros/s/', 'warn'); return; }
    e.target.disabled = true; e.target.innerHTML = '<span class="spin"></span> Probando…';
    const prev = store.conn; const localCount = TABLES.reduce((s, t) => s + store.all(t).length, 0);
    store.setConn({ url: v.url.trim(), token: v.token.trim() });
    try {
      const r = await store.call('ping');
      $('#cx-res', body).innerHTML = `<p class="t-good">Conexión correcta con Google (backend v${esc(r.version)}).</p><p><a href="${esc(r.hoja)}" target="_blank" rel="noopener">Abrir la hoja de cálculo</a> · <a href="${esc(r.carpeta)}" target="_blank" rel="noopener">Abrir carpeta en Drive</a></p>`;
      try { localStorage.setItem('gc.welcomed', '1'); } catch { }
      const localData = !prev && localCount ? await migrarLocal(localCount) : null;
      await store.init();
      toast('Conectado a Google');
      if (localData) await subirLocal(localData);
      setTimeout(() => location.hash = '#ajustes/conexion', 50);
    } catch (err) {
      store.setConn(prev);
      $('#cx-res', body).innerHTML = `<p class="t-bad">No se pudo conectar: ${esc(err.message)}</p>`;
    } finally { e.target.disabled = false; e.target.textContent = 'Probar y guardar'; }
  };
  $('#cx-sync', body)?.addEventListener('click', async () => { await store.sync(true); toast('Datos sincronizados'); });
  $('#cx-off', body)?.addEventListener('click', async () => {
    if (!(await confirmar({ title: 'Desconectar', text: 'Este dispositivo dejará de sincronizar. Los datos siguen en Google y puedes volver a conectar con la misma URL y clave.', ok: 'Desconectar' }))) return;
    store.setConn(null); await store.init(); location.hash = '#ajustes/conexion'; toast('Dispositivo desconectado');
  });
}
async function migrarLocal(n) {
  const ok = await confirmar({ title: 'Datos en modo local', text: `Este dispositivo tiene ${n} registros creados en modo local. ¿Subirlos a Google ahora? (los que ya existan allá no se duplican)`, ok: 'Subir a Google' });
  if (!ok) return null;
  // Copia en memoria antes de cambiar la caché
  return Object.fromEntries(TABLES.map(t => [t, store.all(t).map(r => ({ ...r }))]));
}
async function subirLocal(data) {
  const ops = TABLES.filter(t => data[t].length).map(t => ({ table: t, mode: 'insert', rows: data[t] }));
  for (const op of ops) for (let i = 0; i < op.rows.length; i += 200) await store.batch([{ ...op, rows: op.rows.slice(i, i + 200) }]);
  toast('Datos locales subidos a Google');
}

/* ------------------------------ Negocio ------------------------------ */
function negocio(body) {
  const n = cfg('negocio');
  body.innerHTML = `<h2>Datos del negocio</h2><p class="muted">Aparecen en las cotizaciones, reportes y mensajes.</p>
    <form class="form" id="ng-f" novalidate>${formHtml([{ fields: [
      { name: 'nombre', label: 'Nombre o razón social', full: true, required: true }, { name: 'profesion', label: 'Profesión / actividad' }, { name: 'telefono', label: 'Teléfono', type: 'tel' },
      { name: 'registro', label: 'Registro profesional' }, { name: 'ciudad', label: 'Ciudad' }, { name: 'firmaNombre', label: 'Nombre en la firma' }, { name: 'email', label: 'Correo', type: 'email' },
      { name: 'direccion', label: 'Dirección', full: true }, { name: 'indicativo', label: 'Indicativo WhatsApp', default: '57' }
    ] }, { title: 'Moneda', fields: [{ name: 'moneda', label: 'Moneda', type: 'select', options: [['COP', 'Peso colombiano (COP)'], ['USD', 'Dólar (USD)'], ['EUR', 'Euro (EUR)'], ['MXN', 'Peso mexicano (MXN)']], placeholder: false }] }], { ...n, moneda: cfg('moneda') })}</form>
    <div class="imgs"><div><span>Logo</span><img src="${esc(store.cfg('logo', null) || 'img/logo.jpg')}" alt="Logo" height="80"><label class="btn btn-sm">${ICON.upload} Cambiar<input type="file" accept="image/*" hidden data-img="logo"></label></div>
    <div><span>Firma</span>${store.cfg('firma', null) ? `<img src="${esc(store.cfg('firma', null))}" alt="Firma" height="60">` : '<p class="muted small">Sin firma: se importa con el histórico o súbela aquí.</p>'}<label class="btn btn-sm">${ICON.upload} Cambiar<input type="file" accept="image/*" hidden data-img="firma"></label></div></div>
    <div class="row-btns"><button class="btn btn-primary" id="ng-s">Guardar</button></div>`;
  bindForm($('#ng-f', body));
  $('#ng-s', body).onclick = async () => { const v = readForm($('#ng-f', body)); const { moneda, ...rest } = v; await store.batch([{ table: 'config', mode: 'upsert', rows: [{ id: 'negocio', valor: JSON.stringify(rest) }, { id: 'moneda', valor: JSON.stringify(moneda) }] }]); toast('Datos guardados'); };
  $$('[data-img]', body).forEach(inp => inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    const small = await compressImage(f, 420, 0.85);
    const data = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(small); });
    if (data.length > 45000) { toast('La imagen es muy pesada; usa una más pequeña.', 'warn'); return; }
    await store.setCfg(inp.dataset.img, data); toast('Imagen actualizada'); render(body.closest('#view'), ['negocio']);
  });
}

/* ------------------------------ Cotizaciones ------------------------------ */
function cotizaciones(body) {
  const tx = cfg('cotizacionTextos'), tipos = cfg('tiposCotizacion');
  body.innerHTML = `<h2>Cotizaciones</h2><p class="muted">Textos del formato y contenido de los dos tipos (lista desplegable).</p>
    <form class="form" id="ct-f" novalidate>${formHtml([{ title: 'Textos', fields: [
      { name: 'asunto', label: 'Asunto por defecto', full: true }, { name: 'intro1', label: 'Párrafo 1', type: 'textarea', full: true }, { name: 'intro2', label: 'Párrafo 2', type: 'textarea', full: true },
      { name: 'antesTabla', label: 'Texto antes de la tabla', full: true }, { name: 'formaPago', label: 'Forma de pago por defecto', type: 'textarea', full: true, rows: 2 },
      { name: 'tiempoEntrega', label: 'Tiempo de entrega por defecto', full: true }, { name: 'cierre', label: 'Cierre', full: true },
      { name: 'mediosPagoTexto', label: 'Medios de pago (una línea por medio)', type: 'textarea', full: true, rows: 3 }
    ] }], { ...tx, mediosPagoTexto: cfg('mediosPagoTexto').join('\n') })}
    ${tipos.map((t, i) => formHtml([{ title: 'Tipo: ' + t.nombre, fields: [
      { name: `t${i}_nombre`, label: 'Nombre en la lista' }, { name: `t${i}_precioUnit`, label: 'Precio unitario sugerido', type: 'money' }, { name: `t${i}_cantidad`, label: 'Cantidad por defecto', type: 'number' },
      { name: `t${i}_dispositivo`, label: 'Dispositivo', full: true }, { name: `t${i}_descripcion`, label: 'Descripción', full: true },
      { name: `t${i}_incluye`, label: 'Incluye (una línea por ítem)', type: 'textarea', full: true, rows: 3 }, { name: `t${i}_kit`, label: 'Kit de entrega (una línea por ítem)', type: 'textarea', full: true, rows: 6 },
      { name: `t${i}_garantia`, label: 'Garantía', full: true }, { name: `t${i}_garantiaMeses`, label: 'Meses de garantía', type: 'number' }
    ] }], Object.fromEntries(Object.entries(t).map(([k, v]) => [`t${i}_${k}`, Array.isArray(v) ? v.join('\n') : v])))).join('')}</form>
    <div class="row-btns"><button class="btn btn-primary" id="ct-s">Guardar</button><button class="btn btn-ghost" id="ct-r">Restaurar valores originales</button></div>`;
  bindForm($('#ct-f', body));
  $('#ct-s', body).onclick = async () => {
    const v = readForm($('#ct-f', body));
    const textos = Object.fromEntries(Object.keys(DEFAULTS.cotizacionTextos).map(k => [k, v[k]]));
    const nt = tipos.map((t, i) => ({ ...t, nombre: v[`t${i}_nombre`], precioUnit: Number(v[`t${i}_precioUnit`]) || 0, cantidad: Number(v[`t${i}_cantidad`]) || 1, dispositivo: v[`t${i}_dispositivo`], descripcion: v[`t${i}_descripcion`], incluye: lines(v[`t${i}_incluye`]), kit: lines(v[`t${i}_kit`]), garantia: v[`t${i}_garantia`], garantiaMeses: Number(v[`t${i}_garantiaMeses`]) || 24 }));
    await store.batch([{ table: 'config', mode: 'upsert', rows: [{ id: 'cotizacionTextos', valor: JSON.stringify(textos) }, { id: 'tiposCotizacion', valor: JSON.stringify(nt) }, { id: 'mediosPagoTexto', valor: JSON.stringify(lines(v.mediosPagoTexto)) }] }]);
    toast('Configuración de cotizaciones guardada');
  };
  $('#ct-r', body).onclick = async () => { if (await confirmar({ text: '¿Volver a los textos y tipos originales de las cotizaciones?', ok: 'Restaurar' })) { await store.batch([{ table: 'config', mode: 'upsert', rows: [{ id: 'cotizacionTextos', valor: JSON.stringify(DEFAULTS.cotizacionTextos) }, { id: 'tiposCotizacion', valor: JSON.stringify(DEFAULTS.tiposCotizacion) }] }]); toast('Restaurado'); render(body.closest('#view'), ['cotizaciones']); } };
}
const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);

/* ------------------------------ Plantillas ------------------------------ */
function plantillas(body) {
  const pl = cfg('plantillas');
  body.innerHTML = `<h2>Mensajes de WhatsApp</h2><p class="muted">Variables disponibles: <code>{nombre}</code> <code>{nombreCompleto}</code> <code>{negocio}</code> <code>{firma}</code> <code>{fecha}</code> <code>{saldo}</code> <code>{producto}</code> <code>{anios}</code> <code>{numero}</code> <code>{total}</code> <code>{vence}</code> <code>{enlace}</code> <code>{mediosPago}</code></p>
    <form class="form" id="pl-f">${pl.map((p, i) => `<fieldset class="fs"><legend>${esc(p.nombre)}</legend><label class="fld full"><span>Nombre</span><input name="n${i}" value="${esc(p.nombre)}"></label><label class="fld full"><span>Texto</span><textarea name="t${i}" rows="5">${esc(p.texto)}</textarea></label></fieldset>`).join('')}</form>
    <div class="row-btns"><button class="btn btn-primary" id="pl-s">Guardar</button><button class="btn" id="pl-add">${ICON.plus} Nuevo mensaje</button><button class="btn btn-ghost" id="pl-r">Restaurar originales</button></div>`;
  $('#pl-s', body).onclick = async () => { const v = readForm($('#pl-f', body)); await store.setCfg('plantillas', pl.map((p, i) => ({ ...p, nombre: v['n' + i], texto: v['t' + i] }))); toast('Mensajes guardados'); };
  $('#pl-add', body).onclick = async () => { await store.setCfg('plantillas', [...pl, { id: uid('pl'), nombre: 'Nuevo mensaje', texto: 'Hola {nombre}, \n\n{firma}' }]); render(body.closest('#view'), ['plantillas']); };
  $('#pl-r', body).onclick = async () => { if (await confirmar({ text: '¿Restaurar los mensajes originales?', ok: 'Restaurar' })) { await store.setCfg('plantillas', DEFAULTS.plantillas); render(body.closest('#view'), ['plantillas']); } };
}

/* ------------------------------ Alarmas ------------------------------ */
function alarmas(body) {
  const r = cfg('reglas');
  body.innerHTML = `<h2>Alarmas</h2><p class="muted">Las fechas se calculan primero con el historial real (del paciente o de todos sus pacientes). Estas reglas solo se usan cuando no hay datos suficientes.</p>
    <form class="form" id="al-f">${formHtml([{ title: 'General', fields: [
      { name: 'ventana', label: 'Mostrar alarmas de los próximos (días)', type: 'number' }, { name: 'minMuestras', label: 'Casos mínimos para usar el promedio de pacientes', type: 'number' },
      { name: 'garantiaMeses', label: 'Garantía por defecto (meses)', type: 'number' }, { name: 'avisoGarantiaDias', label: 'Avisar garantía con anticipación (días)', type: 'number' },
      { name: 'seguimientoCotizacionDias', label: 'Seguimiento de cotización (días después del contacto)', type: 'number' }
    ] }, { title: 'Reglas de respaldo (días)', fields: [
      { name: 'mantenimiento', label: 'Mantenimiento', type: 'number' }, { name: 'bateria', label: 'Baterías', type: 'number' }, { name: 'domo', label: 'Domos', type: 'number' }, { name: 'filtro', label: 'Filtros', type: 'number' },
      { name: 'molde', label: 'Moldes', type: 'number' }, { name: 'receptor', label: 'Receptores', type: 'number' }, { name: 'secado', label: 'Secado', type: 'number' }, { name: 'renovacionMeses', label: 'Renovación de audífono (meses)', type: 'number' }
    ] }, { title: 'Inventario', fields: [{ name: 'permitirNegativo', label: 'Permitir inventario negativo (no recomendado)', type: 'checkbox', full: true }] }], { ...r, ventana: cfg('ventanaAlarmas'), permitirNegativo: cfg('permitirNegativo') })}</form>
    <div class="row-btns"><button class="btn btn-primary" id="al-s">Guardar</button></div>`;
  $('#al-s', body).onclick = async () => {
    const v = readForm($('#al-f', body)); const { ventana, permitirNegativo, ...reg } = v;
    for (const k of Object.keys(reg)) reg[k] = Number(reg[k]) || DEFAULTS.reglas[k];
    await store.batch([{ table: 'config', mode: 'upsert', rows: [{ id: 'reglas', valor: JSON.stringify(reg) }, { id: 'ventanaAlarmas', valor: JSON.stringify(Number(ventana) || 30) }, { id: 'permitirNegativo', valor: JSON.stringify(!!permitirNegativo) }] }]);
    toast('Reglas guardadas');
  };
}

/* ------------------------------ Listas ------------------------------ */
function listas(body) {
  const toTxt = o => Object.entries(o).map(([k, v]) => `${k}: ${v.join(', ')}`).join('\n');
  const fromTxt = s => Object.fromEntries(lines(s).map(l => { const [k, rest = ''] = l.split(':'); return [k.trim(), rest.split(',').map(x => x.trim()).filter(Boolean)]; }).filter(([k]) => k));
  body.innerHTML = `<h2>Listas y categorías</h2><p class="muted">Una categoría por línea: <code>Categoría: subcategoría 1, subcategoría 2</code>. Puedes crear las tuyas sin tocar el código.</p>
    <form class="form" id="ls-f">${formHtml([{ fields: [
      { name: 'cc', label: 'Categorías de clientes', type: 'textarea', full: true, rows: 4 }, { name: 'ca', label: 'Categorías de cartera', type: 'textarea', full: true, rows: 4 },
      { name: 'cp', label: 'Categorías de productos', type: 'textarea', full: true, rows: 6 }, { name: 'mp', label: 'Medios de pago (uno por línea)', type: 'textarea', full: true, rows: 5 },
      { name: 'cdp', label: 'Condiciones de pago (una por línea)', type: 'textarea', full: true, rows: 4 }
    ] }], { cc: toTxt(cfg('categoriasClientes')), ca: toTxt(cfg('categoriasCartera')), cp: toTxt(cfg('categoriasProductos')), mp: cfg('mediosPago').join('\n'), cdp: cfg('condicionesPago').join('\n') })}</form>
    <div class="row-btns"><button class="btn btn-primary" id="ls-s">Guardar</button></div>`;
  $('#ls-s', body).onclick = async () => {
    const v = readForm($('#ls-f', body));
    await store.batch([{ table: 'config', mode: 'upsert', rows: [{ id: 'categoriasClientes', valor: JSON.stringify(fromTxt(v.cc)) }, { id: 'categoriasCartera', valor: JSON.stringify(fromTxt(v.ca)) }, { id: 'categoriasProductos', valor: JSON.stringify(fromTxt(v.cp)) }, { id: 'mediosPago', valor: JSON.stringify(lines(v.mp)) }, { id: 'condicionesPago', valor: JSON.stringify(lines(v.cdp)) }] }]);
    toast('Listas guardadas');
  };
}

function proveedor(body) {
  body.innerHTML = `<h2>Proveedor</h2><form class="form" id="pv-f">${formHtml([{ fields: [{ name: 'nombre', label: 'Nombre', full: true }, { name: 'nit', label: 'NIT' }, { name: 'plazoDias', label: 'Plazo de pago (días)', type: 'number', hint: 'La factura MH 106250 muestra 30 días (08/10 → 08/11)' }, { name: 'telefono', label: 'Teléfono' }, { name: 'email', label: 'Correo de cartera', type: 'email' }, { name: 'ciudad', label: 'Ciudad' }] }], cfg('proveedor'))}</form><div class="row-btns"><button class="btn btn-primary" id="pv-s">Guardar</button></div>`;
  $('#pv-s', body).onclick = async () => { const v = readForm($('#pv-f', body)); v.plazoDias = Number(v.plazoDias) || 30; await store.setCfg('proveedor', v); toast('Proveedor guardado'); };
}

/* ------------------------------ Importar ------------------------------ */
function importar(body) {
  body.innerHTML = `<h2>Importar histórico</h2>
    <p>Elige el archivo <b>historico_importacion.json</b> (se entrega aparte, conciliado desde <i>CARTERA_Y_PACIENTES_2025.xlsx</i>). No va en GitHub porque tiene datos de pacientes: guárdalo en tu Drive o en el celular. Puedes repetir la importación: lo que ya existe no se duplica.</p>
    <div class="row-btns"><label class="btn btn-primary">${ICON.upload} Elegir historico_importacion.json<input type="file" accept=".json,application/json" hidden id="im-file"></label></div>
    <div id="im-prev"></div>`;
  $('#im-file', body).onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const data = JSON.parse(await f.text()); if (data.tables) restaurar(data, body); else previsualizar(data, body); } catch { toast('El archivo no es un JSON válido.', 'error'); } };
}
function previsualizar(d, body) {
  const rc = d.reconciliacion || {};
  const vig = d.cxpDocs.filter(x => !x.historico), hist = d.cxpDocs.filter(x => x.historico);
  $('#im-prev', body).innerHTML = `<div class="panel note">
    <h3>Vista previa</h3>
    <dl class="kv two">${[['Pacientes', d.clientes.length], ['Compras / entregas por paciente', d.entregas.length], ['Audífonos en poder de pacientes', d.equipos.length], ['Productos del catálogo', d.productos.length], ['Movimientos Medihumana desde el corte', vig.length + d.cxpAbonos.filter(a => !a.historico).length], ['Movimientos históricos (antes del corte)', hist.length + d.cxpAbonos.filter(a => a.historico).length], ['Fechas con día/mes corregidos', (d.fechasCorregidas || []).length]].map(([a, b]) => `<div><dt>${a}</dt><dd class="num">${b}</dd></div>`).join('')}</dl>
    <h3>Conciliación de la cuenta Medihumana</h3>
    <p>Saldo inicial al corte del <b>${fdate(rc.corte_fecha)}</b>: <b class="num">${money(rc.saldo_inicial_corte)}</b> (fila ${rc.corte_fila} del Excel).</p>
    <p>Saldo según el Excel: <b class="num">${money(rc.saldo_excel)}</b> · Saldo recalculado movimiento a movimiento: <b class="num">${money(rc.saldo_recalculado)}</b> · Diferencia: <b class="num t-warn">${money(rc.diferencia)}</b></p>
    <ul>${(rc.errores || []).map(e => `<li>Fila ${e.fila}: <code>${esc(e.formula)}</code>. ${esc(e.efecto)}</li>`).join('')}</ul>
    <p class="muted small">La app usará el saldo recalculado. Si Medihumana reporta otro valor, registra una nota crédito o un ajuste.</p>
    <p class="muted small">Teléfonos: el Excel no trae números de celular. Agrégalos en la ficha de cada paciente o al enviar el primer WhatsApp.</p>
    <div class="row-btns"><button class="btn btn-primary" id="im-go">Importar ahora</button></div><div id="im-prog" aria-live="polite"></div></div>`;
  $('#im-go', body).onclick = async e => {
    e.target.disabled = true;
    try { await ejecutarImportacion(d, msg => $('#im-prog', body).innerHTML = `<p>${esc(msg)}</p>`); $('#im-prog', body).innerHTML = '<p class="t-good">Importación completa. Revisa <a href="#alarmas">Alarmas</a> y <a href="#proveedor">Medihumana</a>.</p>'; toast('Histórico importado'); }
    catch (err) { $('#im-prog', body).innerHTML = `<p class="t-bad">Se detuvo: ${esc(err.message)}. Puedes volver a intentarlo; lo ya importado no se duplica.</p>`; e.target.disabled = false; }
  };
}
const CAT_FAM = { audifono: ['Audífonos', ''], bateria: ['Consumibles', 'Baterías'], domo: ['Consumibles', 'Domos'], filtro: ['Consumibles', 'Filtros'], receptor: ['Repuestos', 'Receptores'], molde: ['Repuestos', 'Moldes'], repuesto: ['Repuestos', 'Mangueras / codos'], secado: ['Accesorios', 'Secado'], protector: ['Accesorios', 'Protectores'], otro: ['Accesorios', ''], mantenimiento: ['Accesorios', ''] };
export async function ejecutarImportacion(d, progress = () => { }) {
  const cid = k => 'cl-imp-' + slug(k).toLowerCase();
  const clientes = d.clientes.map((c, i) => ({ id: cid(c.key), codigo: 'CL-H' + String(i + 1).padStart(4, '0'), nombre: c.nombre.toUpperCase(), tipoId: c.tipoId || (c.identificacion ? 'CC' : ''), identificacion: c.identificacion || '', telefono: c.telefono || '', ciudad: c.ciudad || '', departamento: c.departamento || '', categoria: 'Paciente', subcategoria: 'Particular', estado: 'activo', origen: 'Importado Excel', fechaRegistro: (d.entregas.filter(e => e.clienteKey === c.key).map(e => e.fecha).sort()[0]) || today() }));
  const provDocs = [{ id: 'pd-saldo-inicial', tipo: 'saldo_inicial', numero: 'SALDO INICIAL', fecha: d.saldoInicial.fecha, fechaVencimiento: d.saldoInicial.fecha, valor: d.saldoInicial.valor, descripcion: d.saldoInicial.nota }]
    .concat(d.cxpDocs.map(x => ({ id: 'pd-imp-' + x.fila, tipo: x.tipo, numero: x.tipo === 'nota_credito' ? (x.ncNumero || x.numero) : x.numero, fecha: x.fecha, valor: x.valor, paciente: x.paciente, clienteId: x.clienteKey ? cid(x.clienteKey) : '', descripcion: x.descripcion, historico: !!x.historico })));
  const provAb = d.cxpAbonos.map(a => ({ id: 'pa-imp-' + a.fila, fecha: a.fecha, valor: a.valor, medio: a.medio, referencia: a.referencia, observaciones: a.observaciones, historico: !!a.historico }));
  const entregas = d.entregas.map((e, i) => ({ id: `en-imp-${slug(e.documento).toLowerCase()}-${i}`, clienteId: cid(e.clienteKey), fecha: e.fecha, documento: e.documento, descripcion: e.descripcion, familia: e.familia, cantidad: 1, valor: e.costo, origen: 'importado' }));
  const equipos = d.equipos.map((e, i) => ({ id: `eq-imp-${slug(e.documento).toLowerCase()}-${i}`, clienteId: cid(e.clienteKey), descripcion: e.descripcion, series: (e.series || []).join(' - '), fechaEntrega: e.fechaEntrega, garantiaMeses: e.garantiaMeses || 24, documento: e.documento, estado: 'activo' }));
  const productos = d.productos.map(p => ({ id: 'pr-imp-' + slug(p.sku).toLowerCase(), sku: p.sku, nombre: p.nombre, categoria: (CAT_FAM[p.familia] || CAT_FAM.otro)[0], subcategoria: (CAT_FAM[p.familia] || CAT_FAM.otro)[1], unidad: 'und', costo: p.costo, precio: 0, ivaPct: p.familia === 'audifono' ? 0 : 19, stockMin: 0, proveedor: 'Medihumana', estado: 'activo' }));
  const config = [{ id: 'corteProveedor', valor: JSON.stringify(d.saldoInicial.fecha) }, { id: 'proveedor', valor: JSON.stringify({ ...cfg('proveedor'), ...d.proveedor }) }];
  if (d.firma && !store.cfg('firma', null)) config.push({ id: 'firma', valor: JSON.stringify(d.firma) });
  const plan = [['clientes', clientes], ['prov_docs', provDocs], ['prov_abonos', provAb], ['entregas', entregas], ['equipos', equipos], ['productos', productos], ['config', config]];
  for (const [t, rows] of plan) {
    for (let i = 0; i < rows.length; i += 250) {
      progress(`Importando ${t}: ${Math.min(i + 250, rows.length)} de ${rows.length}…`);
      await store.batch([{ table: t, mode: t === 'config' ? 'upsert' : 'insert', rows: rows.slice(i, i + 250) }]);
    }
  }
}

/* ------------------------------ Respaldo ------------------------------ */
function respaldo(body) {
  const n = TABLES.reduce((s, t) => s + store.all(t).length, 0);
  body.innerHTML = `<h2>Respaldo y datos</h2>
    <p>${n.toLocaleString('es-CO')} registros en total. ${store.remote ? 'La hoja de Google se respalda sola todos los días a las 11 p.m. en Drive › Gestión Comercial › 06_Backups.' : '<b class="t-warn">Modo local: los datos están solo en este navegador. Descarga respaldos con frecuencia o conecta Google.</b>'}</p>
    <div class="stack-btns">
      <button class="btn btn-lg" id="bk-drive" ${store.remote ? '' : 'disabled'}>${ICON.drive} Hacer copia de la hoja en Drive ahora</button>
      <button class="btn btn-lg" id="bk-xls">${ICON.download} Excel con toda la base (para cruces)</button>
      <button class="btn btn-lg" id="bk-json">${ICON.download} Descargar respaldo completo (.json)</button>
      <label class="btn btn-lg">${ICON.upload} Restaurar desde respaldo .json<input type="file" accept=".json" hidden id="bk-rest"></label>
      ${!store.remote ? `<button class="btn btn-lg btn-danger-ghost" id="bk-reset">Borrar datos de este dispositivo</button>` : ''}
    </div><div id="bk-res" aria-live="polite"></div>`;
  $('#bk-drive', body).onclick = async e => { e.target.disabled = true; try { const r = await store.call('backup'); $('#bk-res', body).innerHTML = `<p class="t-good">Copia creada: <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.nombre)}</a></p>`; } catch (err) { toast(err.message, 'error'); } finally { e.target.disabled = false; } };
  $('#bk-xls', body).onclick = async () => {
    const { excel } = await import('../output.js');
    const hojas = TABLES.filter(t => t !== 'config').map(t => { const filas = store.all(t); const keys = [...new Set(filas.flatMap(r => Object.keys(r)))]; return { nombre: t, columnas: keys.map(k => ({ key: k, label: k, date: /^fecha|vence$|Vencimiento$|Entrega$/.test(k) })), filas }; });
    entregarArchivo({ blob: await excel(hojas), nombre: 'BD_GestionComercial.xlsx', carpeta: '06_Backups' });
  };
  $('#bk-json', body).onclick = () => { const blob = new Blob([JSON.stringify({ app: 'gestion-comercial', version: APP_VERSION, fecha: today(), tables: store.exportAll() })], { type: 'application/json' }); entregarArchivo({ blob, nombre: `Respaldo_GestionComercial_${today()}.json`, carpeta: '06_Backups' }); };
  $('#bk-rest', body).onchange = async e => { const f = e.target.files[0]; if (!f) return; try { restaurar(JSON.parse(await f.text()), body); } catch { toast('Archivo inválido', 'error'); } };
  $('#bk-reset', body)?.addEventListener('click', async () => { if (await confirmar({ title: 'Borrar datos locales', text: 'Se eliminan todos los datos de este dispositivo. Descarga un respaldo antes. ¿Continuar?', ok: 'Borrar todo', danger: true })) { await store.resetLocal(); toast('Datos locales borrados'); } });
}
async function restaurar(data, body) {
  if (!data.tables) { toast('No es un respaldo de Gestión Comercial.', 'error'); return; }
  const n = Object.values(data.tables).reduce((s, a) => s + a.length, 0);
  if (!(await confirmar({ title: 'Restaurar respaldo', text: `Respaldo del ${fdate(data.fecha)} con ${n} registros. Se agregan los que no existan; los existentes no se modifican.`, ok: 'Restaurar' }))) return;
  for (const t of TABLES) { const rows = data.tables[t] || []; for (let i = 0; i < rows.length; i += 250) await store.batch([{ table: t, mode: 'insert', rows: rows.slice(i, i + 250) }]); }
  toast('Respaldo restaurado');
}

/* ------------------------------ Perfiles ------------------------------ */
function seccionPerfiles(body) {
  const lista = auth.perfiles();
  const yo = auth.actual();
  body.innerHTML = `<h2>Perfiles de ingreso</h2>
    <p class="muted">Cada persona entra con su PIN. Lo que registra queda a su nombre (columna "registradoPor" en la hoja). El <b>Administrador</b> puede todo; el <b>Usuario</b> registra clientes, abonos, cotizaciones, ventas y WhatsApp, pero no anula, no revierte ni cambia ajustes.</p>
    ${lista.length ? `<ul class="list-links prof">${lista.map(p => `<li><span><b>${esc(p.nombre)}</b><small>${esc(auth.ROLES[p.rol] || p.rol)} · ${p.pinHash ? 'PIN creado' : 'PIN pendiente (lo crea al ingresar)'}${p.activo === false ? ' · INACTIVO' : ''}${yo && yo.id === p.id ? ' · tú' : ''}</small></span>
      <span class="row-btns"><button class="btn btn-sm" data-ed="${esc(p.id)}">${ICON.edit} Editar</button><button class="btn btn-sm btn-ghost" data-pin="${esc(p.id)}">Restablecer PIN</button></span></li>`).join('')}</ul>` : '<p class="empty-inline">Aún no hay perfiles. Se crean al ingresar por primera vez.</p>'}
    <div class="row-btns"><button class="btn btn-primary" id="pf-add">${ICON.plus} Agregar perfil</button></div>
    <form class="form" id="pf-cfg">${formHtml([{ title: 'Seguridad', fields: [{ name: 'min', label: 'Cerrar sesión tras minutos sin uso', type: 'number', default: store.cfg('minutosInactividad', 30), hint: 'Al volver se pide solo el PIN' }] }])}</form>
    <div class="row-btns"><button class="btn" id="pf-save">Guardar</button></div>`;
  const editar = p => {
    const nuevo = !p;
    const m = openModal({ title: nuevo ? 'Nuevo perfil' : 'Editar perfil', size: 'sm',
      body: `<form class="form" novalidate>${formHtml([{ fields: [
        { name: 'nombre', label: 'Nombre', required: true, full: true },
        { name: 'rol', label: 'Rol', type: 'select', options: Object.entries(auth.ROLES), placeholder: false, full: true },
        { name: 'activo', label: 'Activo (puede ingresar)', type: 'checkbox', full: true },
        { name: 'pin', label: nuevo ? 'PIN (opcional, 4 dígitos)' : 'PIN nuevo (opcional)', full: true, hint: 'Si lo dejas vacío, la persona crea su PIN al primer ingreso', attrs: 'inputmode="numeric" maxlength="4"' }
      ] }], p ? { ...p, activo: p.activo !== false } : { rol: 'usuario', activo: true })}</form>`,
      footer: `<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="pe-ok">Guardar</button>` });
    bindForm(m.el.querySelector('form'));
    m.el.querySelector('#pe-ok').onclick = async () => {
      const v = readForm(m.el.querySelector('form'));
      if (!v.nombre) return toast('Escribe el nombre.', 'warn');
      if (v.pin && !/^\d{4}$/.test(v.pin)) return toast('El PIN debe tener 4 números.', 'warn');
      let row = { ...(p || { id: uid('pf') }), nombre: v.nombre, rol: v.rol, activo: v.activo };
      if (v.pin) Object.assign(row, await auth.nuevoPin(v.pin));
      const nl = nuevo ? [...lista, row] : lista.map(x => x.id === row.id ? row : x);
      if (!nl.some(x => x.rol === 'admin' && x.activo !== false)) return toast('Debe quedar al menos un administrador activo.', 'warn');
      if (lista.some(x => x.id !== row.id && x.nombre.toLowerCase() === row.nombre.toLowerCase())) return toast('Ya existe un perfil con ese nombre.', 'warn');
      await auth.guardarPerfiles(nl); m.close(); toast('Perfil guardado'); render(body.closest('#view'), ['perfiles']);
    };
  };
  body.querySelector('#pf-add').onclick = () => editar(null);
  body.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => editar(lista.find(p => p.id === b.dataset.ed)));
  body.querySelectorAll('[data-pin]').forEach(b => b.onclick = async () => {
    const p = lista.find(x => x.id === b.dataset.pin);
    if (!(await confirmar({ title: 'Restablecer PIN', text: `${p.nombre} creará un PIN nuevo la próxima vez que ingrese.`, ok: 'Restablecer' }))) return;
    await auth.guardarPerfiles(lista.map(x => x.id === p.id ? { ...x, pinHash: '', salt: '' } : x)); toast('PIN restablecido'); render(body.closest('#view'), ['perfiles']);
  });
  body.querySelector('#pf-save').onclick = async () => { const v = readForm(body.querySelector('#pf-cfg')); await store.setCfg('minutosInactividad', Math.max(1, Number(v.min) || 30)); toast('Guardado'); };
}
function miperfil(body) {
  const yo = auth.actual();
  if (!yo) { body.innerHTML = '<p class="empty-inline">No hay una sesión activa.</p>'; return; }
  body.innerHTML = `<h2>Mi perfil</h2><p><b>${esc(yo.nombre)}</b> · ${esc(auth.ROLES[yo.rol])}</p>
    <form class="form" id="mp-f" novalidate>${formHtml([{ title: 'Cambiar PIN', fields: [
      { name: 'actual', label: 'PIN actual', type: 'password', required: true, attrs: 'inputmode="numeric" maxlength="4"' },
      { name: 'nuevo', label: 'PIN nuevo', required: true, attrs: 'inputmode="numeric" maxlength="4"' },
      { name: 'nuevo2', label: 'Repite el PIN nuevo', required: true, attrs: 'inputmode="numeric" maxlength="4"' }
    ] }])}</form>
    <div class="row-btns"><button class="btn btn-primary" id="mp-ok">Cambiar PIN</button><button class="btn" id="mp-out">Cambiar de usuario / salir</button></div>`;
  body.querySelector('#mp-out').onclick = () => auth.cerrarSesion();
  body.querySelector('#mp-ok').onclick = async () => {
    const v = readForm(body.querySelector('#mp-f'));
    const okActual = yo.pinHash && (await auth.nuevoPinCon(v.actual, yo.salt)) === yo.pinHash;
    if (!okActual) return toast('El PIN actual no es correcto.', 'error');
    if (!/^\d{4}$/.test(v.nuevo) || v.nuevo !== v.nuevo2) return toast('El PIN nuevo debe tener 4 números y coincidir.', 'warn');
    const n = await auth.nuevoPin(v.nuevo);
    await auth.guardarPerfiles(auth.perfiles().map(x => x.id === yo.id ? { ...x, ...n } : x));
    toast('PIN cambiado'); render(body.closest('#view'), ['miperfil']);
  };
}
