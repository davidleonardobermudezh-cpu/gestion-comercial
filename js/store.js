// Capa de datos — Google Sheets vía Apps Script (gratis) con copia local para abrir rápido.
// Si no hay conexión configurada, funciona en "modo local" (solo este dispositivo).
import { uid, today } from './util.js';

export const TABLES = ['clientes', 'cxc_docs', 'cxc_abonos', 'prov_docs', 'prov_abonos', 'productos', 'movimientos',
  'equipos', 'entregas', 'ventas', 'cotizaciones', 'contactos', 'oport_estado', 'config', 'auditoria'];
const BOOL = ['anulado', 'historico', 'revertido'];
const JSONF = ['items', 'historial', 'cliente', 'incluye', 'kit'];
const NUM = ['valor', 'cupo', 'costo', 'precio', 'ivaPct', 'stockMin', 'stockMax', 'reposicionDias', 'cantidad', 'costoUnit', 'precioUnit',
  'garantiaMeses', 'subtotal', 'descuento', 'descuentos', 'iva', 'total', 'anticipo', 'descuentoGeneral', 'createdAt', 'updatedAt'];
const STR = ['telefono', 'whatsapp', 'identificacion', 'numero', 'sku', 'referencia', 'documento', 'serie', 'series', 'codigo'];

const LS_CONN = 'gc.conn.v1';
const DB_NAME = 'gestion-comercial';

/* ---------- IndexedDB mínimo ---------- */
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(key) {
  try {
    const db = await idb();
    return await new Promise((res, rej) => {
      const q = db.transaction('kv').objectStore('kv').get(key);
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
  } catch { return undefined; }
}
async function idbSet(key, val) {
  try {
    const db = await idb();
    await new Promise((res, rej) => {
      const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(val, key);
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
  } catch { /* sin almacenamiento local: la app sigue funcionando en memoria */ }
}

function normalizeRow(r) {
  const o = { ...r };
  for (const k of BOOL) if (k in o) o[k] = o[k] === true || o[k] === 'SI' || o[k] === 'TRUE' || o[k] === 'true';
  for (const k of JSONF) if (typeof o[k] === 'string' && /^[\[{]/.test(o[k])) { try { o[k] = JSON.parse(o[k]); } catch { } }
  for (const k of NUM) if (k in o && o[k] !== '' && o[k] !== null && typeof o[k] !== 'number') { const n = Number(String(o[k]).replace(',', '.')); if (Number.isFinite(n)) o[k] = n; }
  for (const k of STR) if (k in o && typeof o[k] === 'number') o[k] = String(o[k]);
  if (o.id != null) o.id = String(o.id);
  return o;
}

class Store {
  constructor() {
    this.data = Object.fromEntries(TABLES.map(t => [t, new Map()]));
    this._arr = {};
    this.lastSync = 0;
    this.counters = {};
    this.listeners = new Set();
    this.conn = this.loadConn();
    this.status = 'idle'; // idle | syncing | offline | error
    this.statusMsg = '';
    this.usuario = null;
  }
  loadConn() { try { return JSON.parse(localStorage.getItem(LS_CONN) || 'null'); } catch { return null; } }
  setConn(c) {
    this.conn = c && c.url ? c : null;
    try { c ? localStorage.setItem(LS_CONN, JSON.stringify(c)) : localStorage.removeItem(LS_CONN); } catch { }
  }
  get remote() { return !!(this.conn && this.conn.url && this.conn.token); }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(kind) { this._arr = {}; for (const f of this.listeners) f(kind); }
  setStatus(s, msg = '') { this.status = s; this.statusMsg = msg; for (const f of this.listeners) f('status'); }

  all(t) {
    if (!this._arr[t]) this._arr[t] = [...this.data[t].values()];
    return this._arr[t];
  }
  get(t, id) { return this.data[t].get(String(id)); }

  async init() {
    const cache = await idbGet(this.cacheKey());
    if (cache && cache.tables) {
      for (const t of TABLES) for (const r of cache.tables[t] || []) this.data[t].set(String(r.id), normalizeRow(r));
      this.lastSync = cache.lastSync || 0;
      this.counters = cache.counters || {};
    }
    this.emit('load');
    if (this.remote) await this.sync(true);
  }
  cacheKey() { return 'cache:' + (this.remote ? this.conn.url.slice(-24) : 'local'); }
  async persist() {
    const tables = Object.fromEntries(TABLES.map(t => [t, this.all(t)]));
    await idbSet(this.cacheKey(), { tables, lastSync: this.lastSync, counters: this.counters, savedAt: Date.now() });
  }

  async call(action, payload = {}, timeoutMs = 45000) {
    if (!this.remote) throw new Error('La app no está conectada a Google. Ve a Ajustes > Conexión.');
    if (!navigator.onLine) { this.setStatus('offline', 'Sin internet'); throw new Error('Sin conexión a internet. No se guardó nada; intenta cuando vuelva la señal.'); }
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(this.conn.url, {
        method: 'POST', redirect: 'follow', signal: ctl.signal,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ token: this.conn.token, action, ...payload })
      });
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? 'Google tardó demasiado en responder. Revisa la señal e intenta de nuevo.' : 'No se pudo conectar con Google. Revisa la URL en Ajustes > Conexión y tu internet.');
    } finally { clearTimeout(to); }
    let json;
    try { json = await res.json(); } catch { throw new Error('Respuesta inesperada de Google. Verifica que la implementación tenga acceso "Cualquier usuario".'); }
    if (!json.ok) { const e = new Error(json.error || 'Error del servidor'); e.code = json.code; throw e; }
    return json;
  }

  async sync(full = false) {
    if (!this.remote) return;
    this.setStatus('syncing', 'Sincronizando…');
    try {
      const since = full && !this.lastSync ? 0 : this.lastSync;
      const r = await this.call('pull', { since: since ? since - 2000 : 0 });
      let changed = 0;
      for (const t of TABLES) for (const row of r.tables[t] || []) { this.data[t].set(String(row.id), normalizeRow(row)); changed++; }
      this.lastSync = r.ahora;
      if (changed || !since) { this.emit('sync'); await this.persist(); }
      this.setStatus('idle', 'Sincronizado ' + new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      this.setStatus(navigator.onLine ? 'error' : 'offline', e.message);
      if (e.code === 'AUTH') throw e;
    }
  }

  /**
   * ops: [{table, mode:'insert'|'upsert', rows:[...], base?:{id:updatedAt}}]
   * Devuelve los registros guardados por tabla.
   */
  async batch(ops) {
    ops = ops.filter(o => o.rows && o.rows.length);
    if (!ops.length) return {};
    for (const op of ops) for (const r of op.rows) {
      if (!r.id) r.id = uid();
      // Trazabilidad (v1.01): quién registró / modificó
      if (this.usuario && op.table !== 'config') { if (op.mode === 'insert') { if (!r.registradoPor) r.registradoPor = this.usuario; } else r.modificadoPor = this.usuario; }
      if (this.usuario && op.table === 'config') r.modificadoPor = this.usuario;
    }
    if (this.remote) {
      this.setStatus('syncing', 'Guardando…');
      try {
        const r = await this.call('batch', { ops });
        for (const [t, rows] of Object.entries(r.saved || {})) for (const row of rows) this.data[t].set(String(row.id), normalizeRow(row));
        this.emit('save'); await this.persist();
        this.setStatus('idle', 'Guardado en Google ' + new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }));
        return r.saved;
      } catch (e) {
        this.setStatus(navigator.onLine ? 'error' : 'offline', e.message);
        if (e.code === 'CONFLICT') await this.sync(true);
        throw e;
      }
    }
    // modo local
    const now = Date.now(); const saved = {};
    for (const op of ops) {
      saved[op.table] = [];
      for (const row of op.rows) {
        const ex = this.data[op.table].get(String(row.id));
        if (ex && op.mode === 'insert') { saved[op.table].push(ex); continue; }
        if (ex && op.base && op.base[row.id] && ex.updatedAt !== op.base[row.id]) {
          const e = new Error('Este registro cambió mientras lo editabas. Revisa y vuelve a guardar.'); e.code = 'CONFLICT'; throw e;
        }
        const r = { ...(ex || {}), ...row };
        for (const k of Object.keys(r)) if (typeof r[k] === 'string' && r[k].startsWith('__AUTO__:')) r[k] = this.localNumber(r[k]);
        r.createdAt = ex?.createdAt || now; r.updatedAt = now;
        const n = normalizeRow(r);
        this.data[op.table].set(String(r.id), n); saved[op.table].push(n);
      }
    }
    this.emit('save'); await this.persist();
    return saved;
  }
  localNumber(spec) {
    const [, prefix = '', key = 'general', pad = 4] = spec.split(':');
    this.counters[key] = (this.counters[key] || 0) + 1;
    return prefix + String(this.counters[key]).padStart(Number(pad), '0');
  }
  insert(table, rows) { return this.batch([{ table, mode: 'insert', rows: [].concat(rows) }]); }
  upsert(table, rows, base) { return this.batch([{ table, mode: 'upsert', rows: [].concat(rows), base }]); }

  async upload({ folder, name, blob, share = false, replace = false }) {
    if (!this.remote) throw new Error('Para guardar archivos en Google Drive conecta la app en Ajustes > Conexión.');
    const { blobToBase64 } = await import('./util.js');
    const base64 = await blobToBase64(blob);
    if (base64.length > 35e6) throw new Error('El archivo es demasiado grande (máx. ~25 MB).');
    return this.call('upload', { folder, name, mimeType: blob.type || 'application/octet-stream', base64, share, replace }, 120000);
  }

  // Configuración del negocio guardada en la pestaña "config" (fila por clave)
  cfg(key, def) {
    const r = this.data.config.get(key);
    if (!r) return def;
    let v = r.valor;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { } }
    return v ?? def;
  }
  async setCfg(key, value) {
    return this.upsert('config', [{ id: key, valor: JSON.stringify(value) }]);
  }

  async audit(tabla, registroId, accion, detalle) {
    try { await this.insert('auditoria', [{ id: uid('au'), fecha: today(), tabla, registroId, accion, detalle }]); } catch { }
  }

  exportAll() { return Object.fromEntries(TABLES.map(t => [t, this.all(t)])); }
  async resetLocal() { for (const t of TABLES) this.data[t].clear(); this.lastSync = 0; this.counters = {}; await this.persist(); this.emit('load'); }
}

export const store = new Store();
