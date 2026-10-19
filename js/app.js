// Gestión Comercial v1.00 — arranque, navegación y acciones rápidas
import { $, $$, esc, toast, setCurrency, money } from './util.js';
import { store } from './store.js';
import { cfg, oportunidades } from './domain.js';
import { ICON, openModal } from './ui.js';

export const APP_VERSION = '1.01';
import * as auth from './auth.js';

const ROUTES = {
  inicio: { title: 'Inicio', load: () => import('./views/inicio.js') },
  alarmas: { title: 'Alarmas y oportunidades', load: () => import('./views/alarmas.js') },
  clientes: { title: 'Clientes', load: () => import('./views/clientes.js') },
  cliente: { title: 'Ficha del cliente', load: () => import('./views/clientes.js'), fn: 'renderFicha', parent: 'clientes' },
  cartera: { title: 'Cartera', load: () => import('./views/cartera.js') },
  proveedor: { title: 'Cuenta Medihumana', load: () => import('./views/proveedor.js') },
  cotizaciones: { title: 'Cotizaciones', load: () => import('./views/cotizaciones.js') },
  cotizacion: { title: 'Cotización', load: () => import('./views/cotizaciones.js'), fn: 'renderEditor', parent: 'cotizaciones', sticky: true },
  ventas: { title: 'Ventas y pedidos', load: () => import('./views/ventas.js') },
  inventario: { title: 'Inventario', load: () => import('./views/inventario.js') },
  producto: { title: 'Producto', load: () => import('./views/inventario.js'), fn: 'renderProducto', parent: 'inventario' },
  reportes: { title: 'Reportes', load: () => import('./views/reportes.js') },
  ajustes: { title: 'Ajustes', load: () => import('./views/ajustes.js'), sticky: true },
  mas: { title: 'Más', load: () => import('./views/mas.js') }
};
const NAV = [
  ['inicio', 'Inicio', 'home'], ['alarmas', 'Alarmas', 'bell'], ['clientes', 'Clientes', 'users'], ['cartera', 'Cartera clientes', 'wallet'],
  ['proveedor', 'Medihumana', 'truck'], ['cotizaciones', 'Cotizaciones', 'doc'], ['ventas', 'Ventas', 'cart'], ['inventario', 'Inventario', 'box'],
  ['reportes', 'Reportes', 'chart'], ['ajustes', 'Ajustes', 'gear']
];
const TABS = [['inicio', 'Inicio', 'home'], ['alarmas', 'Alarmas', 'bell'], ['clientes', 'Clientes', 'users'], ['cartera', 'Cartera', 'wallet'], ['mas', 'Más', 'menu']];

let current = { name: null, args: [] };

function shell() {
  $('#side-nav').innerHTML = NAV.map(([k, t, i]) => `<a href="#${k}" data-nav="${k}">${ICON[i]}<span>${t}</span>${k === 'alarmas' ? '<em class="count" data-count></em>' : ''}</a>`).join('');
  $('#tabbar').innerHTML = TABS.map(([k, t, i]) => `<a href="#${k}" data-nav="${k}">${ICON[i]}<span>${t}</span>${k === 'alarmas' ? '<em class="count" data-count></em>' : ''}</a>`).join('');
  $('#fab').innerHTML = ICON.plus;
  $('#quick-btn').innerHTML = ICON.plus + '<span>Nuevo</span>';
  $('#sync-btn').innerHTML = ICON.sync;
  $('#fab').onclick = quickMenu; $('#quick-btn').onclick = quickMenu;
  $('#sync-btn').onclick = async () => { if (!store.remote) { location.hash = '#ajustes'; toast('Modo local: conecta Google en Ajustes > Conexión para sincronizar.', 'warn'); return; } await store.sync(); };
  $('#back-btn').innerHTML = ICON.back;
  $('#user-btn').onclick = menuUsuario;
  $('#side-user').onclick = menuUsuario;
  $('#back-btn').onclick = () => { const r = ROUTES[current.name]; location.hash = '#' + (r?.parent || 'inicio'); };
}

export async function quickMenu() {
  const items = [
    ['abono', 'Registrar abono de cliente', 'money', 'Pago recibido de un paciente'],
    ['doc', 'Cuenta por cobrar', 'wallet', 'Factura o saldo a cargo de un cliente'],
    ['cotizacion', 'Nueva cotización', 'doc', 'Recargable o pila 312'],
    ['venta', 'Nueva venta / pedido', 'cart', 'Descuenta inventario y crea la cuenta por cobrar'],
    ['provFactura', 'Factura de Medihumana', 'truck', 'Adjunta el PDF o la foto'],
    ['provPago', 'Pago a Medihumana', 'money', 'Abono a la cuenta del proveedor'],
    ['cliente', 'Nuevo cliente', 'users', ''],
    ['movimiento', 'Movimiento de inventario', 'box', 'Entrada, salida, ajuste'],
    ['whatsapp', 'Mensaje por WhatsApp', 'wa', 'A cualquier cliente']
  ];
  const m = openModal({
    title: 'Crear', size: 'sm', cls: 'quick',
    body: `<div class="quick-list">${items.map(([k, t, i, d]) => `<button class="quick-item" data-q="${k}"><span class="qi">${ICON[i]}</span><span><b>${t}</b>${d ? `<small>${d}</small>` : ''}</span></button>`).join('')}</div>`
  });
  m.el.addEventListener('click', async e => {
    const b = e.target.closest('[data-q]'); if (!b) return;
    m.close();
    const k = b.dataset.q;
    if (k === 'abono') (await import('./views/cartera.js')).formAbono({});
    if (k === 'doc') (await import('./views/cartera.js')).formDocumento({});
    if (k === 'cotizacion') location.hash = '#cotizacion/nueva';
    if (k === 'venta') (await import('./views/ventas.js')).formVenta({});
    if (k === 'provFactura') (await import('./views/proveedor.js')).formFacturaProv({});
    if (k === 'provPago') (await import('./views/proveedor.js')).formPagoProv({});
    if (k === 'cliente') (await import('./views/clientes.js')).formCliente({});
    if (k === 'movimiento') (await import('./views/inventario.js')).formMovimiento({});
    if (k === 'whatsapp') (await import('./views/clientes.js')).elegirClienteWhatsApp();
  });
}

async function route() {
  document.querySelectorAll('.modal-wrap').forEach(m => m.remove());
  document.body.classList.remove('has-modal');
  const h = decodeURIComponent(location.hash.slice(1) || 'inicio');
  const [name, ...args] = h.split('/');
  const r = ROUTES[name] || ROUTES.inicio;
  current = { name: ROUTES[name] ? name : 'inicio', args };
  document.body.dataset.route = current.name;
  auth.verificarAcceso();
  userChip();
  $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === current.name || a.dataset.nav === r.parent || (current.name === 'proveedor' && a.dataset.nav === 'cartera' && a.closest('#tabbar'))));
  $('#page-title').textContent = r.title;
  $('#back-btn').hidden = !r.parent;
  document.title = r.title + ' · Gestión Comercial';
  await render();
  window.scrollTo(0, 0);
}
async function render() {
  const r = ROUTES[current.name];
  const main = $('#view');
  main.onclick = null; main.onchange = null; main.oninput = null;
  try {
    const mod = await r.load();
    await mod[r.fn || 'render'](main, current.args);
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="panel err"><h3>No se pudo mostrar esta sección</h3><p>${esc(e.message)}</p><button class="btn" onclick="location.reload()">Recargar</button></div>`;
  }
  updateBadges();
}
function updateBadges() {
  try {
    const n = oportunidades().filter(o => o.dias <= 0).length;
    $$('[data-count]').forEach(e => { e.textContent = n ? (n > 99 ? '99+' : n) : ''; e.hidden = !n; });
  } catch { }
}
function statusChip() {
  const el = $('#sync-status');
  const st = store.remote ? store.status : 'local';
  el.className = 'sync-chip s-' + st;
  el.textContent = !store.remote ? 'Modo local' : st === 'syncing' ? 'Sincronizando…' : st === 'offline' ? 'Sin internet' : st === 'error' ? 'Error de conexión' : 'Google conectado';
  el.title = store.statusMsg || '';
  $('#sync-btn').classList.toggle('spinning', st === 'syncing');
}

let renderTimer;
store.on(kind => {
  if (kind === 'status') { statusChip(); return; }
  if (kind === 'sync' || kind === 'load') { auth.verificarAcceso(); userChip(); }
  setCurrency(cfg('moneda'));
  // No redibujar mientras se edita una cotización o hay un formulario abierto
  if (ROUTES[current.name]?.sticky || document.querySelector('.modal-wrap')) { updateBadges(); return; }
  clearTimeout(renderTimer); renderTimer = setTimeout(render, 60);
});

window.addEventListener('hashchange', route);
window.addEventListener('online', () => { statusChip(); store.sync(); });
window.addEventListener('offline', () => store.setStatus('offline', 'Sin internet'));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && store.remote) store.sync(); });
setInterval(() => { if (document.visibilityState === 'visible' && store.remote && !document.querySelector('.modal-wrap')) store.sync(); }, 90000);

function userChip() {
  const p = auth.actual();
  const ini = p ? p.nombre.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase() : '·';
  $('#user-btn').textContent = ini; $('#user-btn').hidden = !p;
  $('#side-user').innerHTML = p ? `<span class="avatar sm">${esc(ini)}</span><span><b>${esc(p.nombre)}</b><small>${esc(auth.ROLES[p.rol])} · cambiar</small></span>` : '';
  $('#side-user').hidden = !p;
  document.body.classList.toggle('rol-usuario', !!p && p.rol !== 'admin');
}
async function menuUsuario() {
  const p = auth.actual(); if (!p) return;
  const m = openModal({ title: p.nombre, size: 'sm', body: `<p class="muted">${esc(auth.ROLES[p.rol])}. Todo lo que registres queda a tu nombre.</p><div class="stack-btns"><a class="btn btn-lg" href="#ajustes/miperfil" data-close>Cambiar mi PIN</a><button class="btn btn-lg" id="um-out">Cambiar de usuario / salir</button></div>` });
  m.el.querySelector('#um-out').onclick = () => { m.close(); auth.cerrarSesion(); };
}
document.addEventListener('gc:sesion', () => { userChip(); render(); });

(async function boot() {
  shell();
  statusChip();
  try { await store.init(); } catch (e) { toast(e.message, 'error', 8000); }
  setCurrency(cfg('moneda'));
  if (!store.all('clientes').length && !store.remote && !localStorage.getItem('gc.welcomed')) {
    location.hash = '#ajustes/bienvenida';
  }
  auth.iniciarControl(userChip);
  await route();
  statusChip();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
})();
