// Utilidades generales — Gestión Comercial v1.00

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function uid(prefix = '') {
  const a = crypto.getRandomValues(new Uint8Array(8));
  return prefix + Date.now().toString(36) + [...a].map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 10);
}

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let _money = null, _moneyCode = null;
export function setCurrency(code) { _moneyCode = code || 'COP'; _money = null; }
export function money(n, opts = {}) {
  const code = _moneyCode || 'COP';
  if (!_money) {
    try { _money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: code, maximumFractionDigits: code === 'COP' ? 0 : 2, minimumFractionDigits: 0 }); }
    catch { _money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }); }
  }
  const v = Number(n) || 0;
  if (opts.short && Math.abs(v) >= 1e6) return (v < 0 ? '-' : '') + '$' + (Math.abs(v) / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' M';
  return _money.format(Math.round(v * 100) / 100).replace(/ /g, ' ');
}
export function num(n, d = 0) { return (Number(n) || 0).toLocaleString('es-CO', { maximumFractionDigits: d }); }
export function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// Fechas: se guardan como 'AAAA-MM-DD' y se muestran DD/MM/AAAA
export function today() { return iso(new Date()); }
export function iso(d) {
  if (!d) return '';
  if (typeof d === 'string') return d.slice(0, 10);
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
export function parseISO(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}
export function fdate(s) {
  const d = parseISO(s); if (!d) return '—';
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}
export function fdatetime(ms) {
  if (!ms) return '—';
  const d = new Date(Number(ms));
  return fdate(iso(d)) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
export function addDays(s, n) { const d = parseISO(s) || new Date(); d.setDate(d.getDate() + Math.round(n)); return iso(d); }
export function addMonths(s, n) { const d = parseISO(s) || new Date(); d.setMonth(d.getMonth() + n); return iso(d); }
export function daysBetween(a, b) {
  const da = parseISO(a), db = parseISO(b);
  if (!da || !db) return 0;
  return Math.round((db - da) / 86400000);
}
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function monthName(m) { return MESES[m]; }
export function fdateLong(s) { // "Septiembre 10 de 2026" (estilo de las cotizaciones)
  const d = parseISO(s); if (!d) return '';
  const m = MESES[d.getMonth()];
  return m[0].toUpperCase() + m.slice(1) + ' ' + d.getDate() + ' de ' + d.getFullYear();
}
export function fdateLongDe(s) { // "30 de septiembre de 2026"
  const d = parseISO(s); if (!d) return '';
  return d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear();
}
export function monthKey(s) { return String(s || '').slice(0, 7); }

export function norm(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function median(arr) {
  const a = arr.filter(x => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function phoneForWa(tel, country = '57') {
  let d = String(tel || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10 && d.startsWith('3')) d = country + d;
  else if (d.length === 12 && d.startsWith(country)) { /* ok */ }
  else if (d.length < 10) return '';
  return d;
}

export function debounce(fn, ms = 200) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function toast(msg, kind = 'ok', ms = 3800) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast toast-' + kind;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}

export function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = () => rej(new Error('No se pudo leer el archivo'));
    r.readAsDataURL(file);
  });
}
export function blobToBase64(blob) { return fileToBase64(blob); }

// Reduce fotos del celular antes de subirlas (máx. 1600 px, JPEG)
export async function compressImage(file, max = 1600, q = 0.82) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  const img = await new Promise((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file);
  });
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Compartir archivo con el menú nativo (iPhone/Android). Devuelve true si se abrió el menú.
export async function shareFile(blob, name, text = '') {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name, text }); return true; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  }
  return false;
}

export function slug(s) { return norm(s).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase().slice(0, 40); }

export function loadScript(src) {
  return new Promise((res, rej) => {
    if ([...document.scripts].some(s => s.src === src)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar ' + src + '. Revisa la conexión.'));
    document.head.appendChild(s);
  });
}
