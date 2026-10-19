// Tabla con búsqueda, filtros y ordenamiento. En celular se muestra como tarjetas (sin scroll horizontal).
import { $, $$, esc, norm, money, fdate, debounce } from './util.js';
import { ICON } from './ui.js';

const state = new Map(); // estado por tabla (búsqueda, orden, filtros) durante la sesión

/**
 * cfg: {id, columns:[{key,label,money?,date?,render?(row),sort?,cls?,primary?,secondary?,hideMobile?}],
 *       rows, search:[keys], filters:[{key,label,options:[[v,t]], test?(row,v)}], rowAction?: (row)=>hash|fn,
 *       empty, pageSize, totals:{key:true}, toolbar: html}
 */
export function renderTable(host, cfg) {
  const st = state.get(cfg.id) || { q: '', sort: cfg.defaultSort || null, dir: cfg.defaultDir || 'desc', f: {}, page: 1 };
  state.set(cfg.id, st);
  host.innerHTML = `<div class="dt">
    <div class="dt-bar">
      <label class="dt-search">${ICON.search}<input type="search" placeholder="${esc(cfg.searchPlaceholder || 'Buscar…')}" value="${esc(st.q)}" aria-label="Buscar"></label>
      ${(cfg.filters || []).map(f => `<select class="dt-f" data-k="${esc(f.key)}" aria-label="${esc(f.label)}"><option value="">${esc(f.label)}: todos</option>${f.options.map(([v, t]) => `<option value="${esc(v)}" ${st.f[f.key] === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`).join('')}
      ${cfg.toolbar || ''}
    </div>
    <div class="dt-meta muted small"></div>
    <div class="dt-body"></div>
    <div class="dt-more"></div>
  </div>`;
  const body = $('.dt-body', host), meta = $('.dt-meta', host), more = $('.dt-more', host);
  const draw = () => {
    let rows = cfg.rows;
    const q = norm(st.q);
    if (q) rows = rows.filter(r => (cfg.search || cfg.columns.map(c => c.key)).some(k => norm(typeof k === 'function' ? k(r) : r[k]).includes(q)));
    for (const f of cfg.filters || []) {
      const v = st.f[f.key]; if (!v) continue;
      rows = rows.filter(r => f.test ? f.test(r, v) : String(r[f.key] ?? '') === v);
    }
    if (st.sort) {
      const col = cfg.columns.find(c => c.key === st.sort);
      const get = col?.sort || (r => r[st.sort]);
      rows = [...rows].sort((a, b) => {
        const x = get(a), y = get(b);
        const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'es', { numeric: true });
        return st.dir === 'asc' ? cmp : -cmp;
      });
    }
    const size = cfg.pageSize || 60;
    const shown = rows.slice(0, size * st.page);
    const tot = cfg.totals ? Object.fromEntries(Object.keys(cfg.totals).map(k => [k, rows.reduce((s, r) => s + (Number(r[k]) || 0), 0)])) : null;
    meta.textContent = `${rows.length} registro${rows.length === 1 ? '' : 's'}${tot ? ' · ' + Object.entries(tot).map(([k, v]) => `${cfg.columns.find(c => c.key === k)?.label || k}: ${money(v)}`).join(' · ') : ''}`;
    if (!rows.length) { body.innerHTML = `<div class="dt-empty">${cfg.empty || 'No hay registros con estos filtros.'}</div>`; more.innerHTML = ''; return; }
    const cell = (c, r) => c.render ? c.render(r) : c.money ? money(r[c.key]) : c.date ? fdate(r[c.key]) : esc(r[c.key] ?? '');
    body.innerHTML = `<table class="tbl"><thead><tr>${cfg.columns.map(c => `<th class="${c.money || c.num ? 'r' : ''} ${c.cls || ''}" ${c.nosort ? '' : `data-sort="${esc(c.key)}" tabindex="0" aria-sort="${st.sort === c.key ? (st.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"`}>${esc(c.label)}${st.sort === c.key ? (st.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
      <tbody>${shown.map((r, i) => `<tr data-i="${i}" ${cfg.rowAction ? 'class="click" tabindex="0"' : ''}>${cfg.columns.map(c => `<td class="${c.money || c.num ? 'r num' : ''} ${c.primary ? 'p' : ''} ${c.secondary ? 's' : ''} ${c.hideMobile ? 'hm' : ''} ${c.cls || ''}" data-label="${esc(c.label)}">${cell(c, r)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    more.innerHTML = rows.length > shown.length ? `<button class="btn" data-more>Ver ${Math.min(size, rows.length - shown.length)} más</button>` : '';
    body._rows = shown;
  };
  draw();
  $('.dt-search input', host).addEventListener('input', debounce(e => { st.q = e.target.value; st.page = 1; draw(); }, 150));
  $$('.dt-f', host).forEach(s => s.addEventListener('change', () => { st.f[s.dataset.k] = s.value; st.page = 1; draw(); }));
  host.addEventListener('click', e => {
    const th = e.target.closest('th[data-sort]');
    if (th) { const k = th.dataset.sort; st.dir = st.sort === k && st.dir === 'desc' ? 'asc' : 'desc'; st.sort = k; draw(); return; }
    if (e.target.closest('[data-more]')) { st.page++; draw(); return; }
    const tr = e.target.closest('tr[data-i]');
    if (tr && cfg.rowAction && !e.target.closest('button,a,input,select')) {
      const r = body._rows[+tr.dataset.i];
      const a = cfg.rowAction(r);
      if (typeof a === 'string') location.hash = a;
    }
  });
  host.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const th = e.target.closest('th[data-sort]'); if (th) th.click();
    const tr = e.target.closest('tr[data-i]'); if (tr) tr.click();
  });
  return { redraw: draw, rows: () => body._rows };
}
