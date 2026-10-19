// Perfiles de ingreso (v1.01): quién usa la app, con PIN y rol. Se guardan en la hoja de Google (config › perfiles).
import { $, $$, esc, uid, toast } from './util.js';
import { store } from './store.js';

const LS_SES = 'gc.sesion.v1';
export const ROLES = { admin: 'Administrador', usuario: 'Usuario' };
const PERMISOS_USUARIO = new Set(['registrar', 'editar', 'whatsapp', 'cotizar', 'vender', 'exportar', 'alarmas']);

export function perfiles() { return (store.cfg('perfiles', []) || []).filter(p => p && p.id); }
export function perfilesActivos() { return perfiles().filter(p => p.activo !== false); }
export function actual() {
  const s = sesion();
  return s ? perfiles().find(p => p.id === s.id && p.activo !== false) || null : null;
}
export function esAdmin() { const p = actual(); return !perfiles().length || p?.rol === 'admin'; }
/** acciones reservadas al administrador: anular, revertir, desactivar, ajustes, importar, restaurar */
export function puede(accion) { const p = actual(); if (!perfiles().length) return true; if (!p) return false; return p.rol === 'admin' || PERMISOS_USUARIO.has(accion); }
export function requiere(accion) { if (!puede(accion)) { toast('Solo un administrador puede hacer esto. Pide a David que lo haga desde su perfil.', 'warn', 6000); return false; } return true; }

function sesion() { try { return JSON.parse(localStorage.getItem(LS_SES) || 'null'); } catch { return null; } }
function setSesion(s) { try { s ? localStorage.setItem(LS_SES, JSON.stringify(s)) : localStorage.removeItem(LS_SES); } catch { } }
function minutosInactividad() { return Number(store.cfg('minutosInactividad', 30)) || 30; }

async function hash(pin, salt) {
  const data = new TextEncoder().encode(salt + ':' + pin);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function nuevoPinCon(pin, salt) { return hash(pin, salt); }
export async function nuevoPin(pin) { const salt = uid('s'); return { salt, pinHash: await hash(pin, salt) }; }
async function verificar(p, pin) { return p.pinHash && (await hash(pin, p.salt)) === p.pinHash; }

export async function guardarPerfiles(lista) { await store.setCfg('perfiles', lista); }

/* ---------------------------- Sesión ---------------------------- */
let lastTouch = Date.now();
export function iniciarControl(onChange) {
  const touch = () => { lastTouch = Date.now(); const s = sesion(); if (s) { s.last = lastTouch; setSesion(s); } };
  ['click', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, touch, { passive: true }));
  const check = () => {
    const s = sesion(); if (!s || !perfiles().length) return;
    if (Date.now() - (s.last || 0) > minutosInactividad() * 60000) { bloquear('Sesión cerrada por inactividad'); onChange && onChange(); }
  };
  setInterval(check, 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
}
export function cerrarSesion() { setSesion(null); store.usuario = null; mostrarIngreso(); }
function bloquear(msg) { const s = sesion(); setSesion(null); store.usuario = null; mostrarIngreso(s?.id, msg); }
function entrar(p) { setSesion({ id: p.id, last: Date.now() }); store.usuario = p.nombre; cerrarPuerta(); document.dispatchEvent(new CustomEvent('gc:sesion')); }

/** Llamar al arrancar y después de cada sincronización. Devuelve true si hay que esperar ingreso. */
export function verificarAcceso() {
  const lista = perfilesActivos();
  const p = actual();
  if (p) { store.usuario = p.nombre; cerrarPuerta(); return false; }
  if (lista.length) { mostrarIngreso(sesion()?.id); return true; }
  // Sin perfiles: primero conectar (para traer los perfiles existentes), luego crear el administrador
  const h = location.hash;
  if (!store.remote && (h.startsWith('#ajustes/bienvenida') || h.startsWith('#ajustes/conexion') || h.startsWith('#ajustes/importar'))) { cerrarPuerta(); return false; }
  mostrarCrearAdmin(); return true;
}

/* ---------------------------- Pantallas ---------------------------- */
function puerta() {
  let el = document.getElementById('gate');
  if (!el) { el = document.createElement('div'); el.id = 'gate'; el.className = 'gate'; document.body.appendChild(el); }
  document.body.classList.add('locked');
  return el;
}
function cerrarPuerta() { if (keyHandler) document.removeEventListener('keydown', keyHandler); keyHandler = null; document.getElementById('gate')?.remove(); document.body.classList.remove('locked'); }
let keyHandler = null;
const iniciales = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();

export function mostrarIngreso(preId, msg = '') {
  const lista = perfilesActivos();
  const el = puerta();
  el.innerHTML = `<div class="gate-card" role="dialog" aria-modal="true" aria-label="Ingreso">
    <img src="img/logo.jpg" alt="" width="64" height="64" class="gate-logo">
    <h1>¿Quién ingresa?</h1>
    ${msg ? `<p class="muted">${esc(msg)}</p>` : ''}
    <div class="gate-users">${lista.map(p => `<button type="button" class="gate-user" data-id="${esc(p.id)}"><span class="avatar">${esc(iniciales(p.nombre))}</span><b>${esc(p.nombre)}</b><small>${esc(ROLES[p.rol] || p.rol)}${p.pinHash ? '' : ' · crear PIN'}</small></button>`).join('')}</div>
    <div class="gate-pin" hidden></div>
    <p class="gate-foot muted small">${store.remote ? 'Conectado a Google' : 'Modo local'} · <button type="button" class="link" data-forgot>Olvidé mi PIN</button></p>
  </div>`;
  el.querySelectorAll('.gate-user').forEach(b => b.onclick = () => pedirPin(lista.find(p => p.id === b.dataset.id)));
  el.querySelector('[data-forgot]').onclick = olvidoPin;
  const pre = lista.find(p => p.id === preId) || (lista.length === 1 ? lista[0] : null);
  if (pre) pedirPin(pre);
}

function teclado(titulo, sub, onPin, { volver = true } = {}) {
  const el = puerta();
  const box = el.querySelector('.gate-pin') || el.querySelector('.gate-card');
  el.querySelector('.gate-users') && (el.querySelector('.gate-users').hidden = true);
  box.hidden = false;
  let pin = '';
  box.innerHTML = `<h2>${esc(titulo)}</h2><p class="muted small">${esc(sub)}</p>
    <div class="pin-dots" aria-live="polite">${'<i></i>'.repeat(4)}</div>
    <input class="pin-hidden" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="one-time-code" aria-label="PIN de 4 dígitos">
    <div class="pin-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" data-n="${n}">${n}</button>`).join('')}<button type="button" data-back aria-label="Volver" ${volver ? '' : 'disabled'}>${volver ? '‹' : ''}</button><button type="button" data-n="0">0</button><button type="button" data-del aria-label="Borrar">⌫</button></div>
    <p class="pin-err" aria-live="assertive"></p>`;
  const dots = [...box.querySelectorAll('.pin-dots i')];
  const draw = () => dots.forEach((d, i) => d.classList.toggle('on', i < pin.length));
  const err = m => { box.querySelector('.pin-err').textContent = m; box.querySelector('.pin-dots').classList.add('shake'); setTimeout(() => box.querySelector('.pin-dots')?.classList.remove('shake'), 400); };
  const push = async d => {
    if (pin.length >= 4) return;
    pin += d; draw();
    if (pin.length === 4) { const p = pin; pin = ''; setTimeout(draw, 180); const r = await onPin(p); if (r) err(r); }
  };
  box.querySelectorAll('[data-n]').forEach(b => b.onclick = () => push(b.dataset.n));
  box.querySelector('[data-del]').onclick = () => { pin = pin.slice(0, -1); draw(); };
  box.querySelector('[data-back]').onclick = () => { if (volver) mostrarIngreso(null); };
  const hid = box.querySelector('.pin-hidden');
  const onKey = e => { if (e.target && e.target.matches && e.target.matches('input:not(.pin-hidden)')) return; if (/^\d$/.test(e.key)) push(e.key); if (e.key === 'Backspace') { pin = pin.slice(0, -1); draw(); } };
  if (keyHandler) document.removeEventListener('keydown', keyHandler);
  keyHandler = onKey; document.addEventListener('keydown', onKey);
  hid.addEventListener('input', () => { const v = hid.value.replace(/\D/g, ''); hid.value = ''; for (const c of v) push(c); });
}

const intentos = {};
function pedirPin(p) {
  if (!p.pinHash) return crearPinPrimeraVez(p);
  teclado(p.nombre, 'Escribe tu PIN de 4 dígitos', async pin => {
    const k = intentos[p.id] ||= { n: 0, hasta: 0 };
    if (Date.now() < k.hasta) return `Demasiados intentos. Espera ${Math.ceil((k.hasta - Date.now()) / 1000)} segundos.`;
    if (await verificar(p, pin)) { k.n = 0; entrar(p); toast(`Hola, ${p.nombre}`); return null; }
    k.n++; if (k.n >= 5) { k.hasta = Date.now() + 60000; k.n = 0; return 'PIN incorrecto. Bloqueado 1 minuto.'; }
    return `PIN incorrecto (${k.n} de 5)`;
  });
}
function crearPinPrimeraVez(p) {
  let primero = null;
  const pedir = () => teclado(primero ? 'Confirma tu PIN' : `Hola, ${p.nombre}`, primero ? 'Escríbelo otra vez' : 'Es tu primer ingreso: crea un PIN de 4 dígitos', async pin => {
    if (!primero) { primero = pin; pedir(); return null; }
    if (pin !== primero) { primero = null; pedir(); return 'No coinciden. Empieza de nuevo.'; }
    const { salt, pinHash } = await nuevoPin(pin);
    try { await guardarPerfiles(perfiles().map(x => x.id === p.id ? { ...x, salt, pinHash } : x)); }
    catch (e) { return 'No se pudo guardar: ' + e.message; }
    entrar({ ...p, salt, pinHash }); toast('PIN creado. Bienvenida/o.'); return null;
  });
  pedir();
}

export function mostrarCrearAdmin() {
  const el = puerta();
  el.innerHTML = `<div class="gate-card" role="dialog" aria-modal="true" aria-label="Crear perfiles">
    <img src="img/logo.jpg" alt="" width="64" height="64" class="gate-logo">
    <h1>Crea los perfiles de ingreso</h1>
    <p class="muted">Cada persona entra con su nombre y un PIN de 4 dígitos. Todo lo que registre queda marcado con su nombre.</p>
    ${!store.remote ? `<p class="gate-note">Si ya tienes la app conectada en otro dispositivo, <a href="#ajustes/conexion" data-conn>conecta primero con Google</a> para usar los perfiles que ya existen.</p>` : ''}
    <form class="form gate-form" novalidate>
      <label class="fld"><span>Administrador (control total)</span><input name="admin" value="David" required></label>
      <label class="fld"><span>PIN del administrador (4 dígitos)</span><input name="pin1" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" required autocomplete="new-password"></label>
      <label class="fld"><span>Repite el PIN</span><input name="pin2" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" required autocomplete="new-password"></label>
      <label class="fld"><span>Usuario (registra, cotiza, envía WhatsApp)</span><input name="usuario" value="Martha"></label>
      <p class="muted small">El usuario crea su propio PIN la primera vez que ingrese.</p>
      <button class="btn btn-primary btn-lg" type="submit">Crear perfiles y entrar</button>
    </form></div>`;
  el.querySelector('[data-conn]')?.addEventListener('click', () => setTimeout(() => cerrarPuerta(), 0));
  el.querySelector('form').onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (!f.admin.trim()) return toast('Escribe el nombre del administrador.', 'warn');
    if (!/^\d{4}$/.test(f.pin1)) return toast('El PIN debe tener 4 números.', 'warn');
    if (f.pin1 !== f.pin2) return toast('Los PIN no coinciden.', 'warn');
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try {
      const { salt, pinHash } = await nuevoPin(f.pin1);
      const admin = { id: uid('pf'), nombre: f.admin.trim(), rol: 'admin', salt, pinHash, activo: true };
      const lista = [admin];
      if (f.usuario.trim()) lista.push({ id: uid('pf'), nombre: f.usuario.trim(), rol: 'usuario', activo: true });
      await guardarPerfiles(lista);
      entrar(admin); toast('Perfiles creados');
    } catch (err) { toast(err.message, 'error', 6000); btn.disabled = false; }
  };
}

function olvidoPin() {
  const el = puerta();
  const box = el.querySelector('.gate-pin'); el.querySelector('.gate-users').hidden = true; box.hidden = false;
  box.innerHTML = `<h2>¿Olvidaste tu PIN?</h2>
    <p class="muted small">El administrador puede asignarte uno nuevo en Ajustes › Perfiles. Si el administrador olvidó el suyo, escribe la <b>clave de la app</b> (pestaña LEEME de la hoja de Google) para crear un PIN nuevo.</p>
    <form class="form" novalidate><label class="fld"><span>Clave de la app</span><input name="clave" autocomplete="off"></label>
    <div class="row-btns"><button type="button" class="btn" data-back>Volver</button><button class="btn btn-primary" type="submit">Continuar</button></div></form>`;
  box.querySelector('[data-back]').onclick = () => mostrarIngreso(null);
  box.querySelector('form').onsubmit = e => {
    e.preventDefault();
    const clave = new FormData(e.target).get('clave').trim();
    const ok = store.conn?.token ? clave === store.conn.token : false;
    if (!ok) return toast(store.conn ? 'La clave no coincide.' : 'Este dispositivo no está conectado a Google: la recuperación con clave no está disponible en modo local.', 'error', 6000);
    const admins = perfilesActivos().filter(p => p.rol === 'admin');
    const p = admins[0];
    if (!p) return toast('No hay administrador activo.', 'error');
    let primero = null;
    const pedir = () => teclado(primero ? 'Confirma el PIN nuevo' : `PIN nuevo para ${p.nombre}`, '4 dígitos', async pin => {
      if (!primero) { primero = pin; pedir(); return null; }
      if (pin !== primero) { primero = null; pedir(); return 'No coinciden.'; }
      const n = await nuevoPin(pin);
      await guardarPerfiles(perfiles().map(x => x.id === p.id ? { ...x, ...n } : x));
      entrar({ ...p, ...n }); toast('PIN actualizado'); return null;
    });
    pedir();
  };
}
