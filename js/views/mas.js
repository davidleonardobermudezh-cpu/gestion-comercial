import { esc, money } from '../util.js';
import { store } from '../store.js';
import { cuentaProveedor, resumenCotizaciones, resumenInventario } from '../domain.js';
import { ICON } from '../ui.js';
import * as auth from '../auth.js';

export function render(main) {
  const pv = cuentaProveedor(), cq = resumenCotizaciones(), inv = resumenInventario();
  const yo = auth.actual();
  const items = [
    ['proveedor', 'Cuenta Medihumana', 'truck', `Saldo ${money(pv.saldo)}`],
    ['cotizaciones', 'Cotizaciones', 'doc', `${cq.abiertas} abiertas`],
    ['ventas', 'Ventas y pedidos', 'cart', ''],
    ['inventario', 'Inventario', 'box', `${inv.bajo} con stock bajo`],
    ['reportes', 'Reportes', 'chart', 'Excel y PDF'],
    auth.esAdmin() ? ['ajustes', 'Ajustes', 'gear', store.remote ? 'Google conectado' : 'Modo local'] : ['ajustes/miperfil', 'Mi perfil', 'gear', 'Cambiar mi PIN']
  ];
  main.innerHTML = `<div class="page"><h1 class="sr">Más</h1>
    ${yo ? `<div class="panel me"><span class="avatar">${esc(yo.nombre.slice(0, 2).toUpperCase())}</span><div><b>${esc(yo.nombre)}</b><small class="muted">${esc(auth.ROLES[yo.rol])}</small></div><button class="btn" id="me-out">Cambiar usuario</button></div>` : ''}
    <ul class="more-list">${items.map(([k, t, i, s]) => `<li><a href="#${k}"><span class="qi">${ICON[i]}</span><span><b>${esc(t)}</b>${s ? `<small>${esc(s)}</small>` : ''}</span>${ICON.arrow}</a></li>`).join('')}</ul></div>`;
  main.querySelector('#me-out')?.addEventListener('click', () => auth.cerrarSesion());
}
