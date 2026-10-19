import { esc, money, fdate, today, num, fdateLong, addDays } from '../util.js';
import { store } from '../store.js';
import { resumenCxc, cuentaProveedor, resumenInventario, resumenCotizaciones, oportunidades, serieMensual, RANGOS, clienteNombre, ventasMes, TIPOS_OP, cfg, cliente } from '../domain.js';
import { ICON, componerWhatsApp } from '../ui.js';

export function render(main) {
  const hoy = today();
  const cx = resumenCxc(hoy), pv = cuentaProveedor(hoy), inv = resumenInventario(), cq = resumenCotizaciones(hoy);
  const ops = oportunidades();
  const vencidasOps = ops.filter(o => o.dias <= 0);
  const clientesOp = new Set(ops.filter(o => o.tipo !== 'cobro').map(o => o.clienteId)).size;
  const serie = serieMensual(6);
  const proximos = cx.abiertos.filter(d => d.estado !== 'vencida' && d.diasParaVencer !== null && d.diasParaVencer <= 7).sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));
  const vacia = !store.all('clientes').length;

  main.innerHTML = `
  <div class="page">
    <div class="hello">
      <div><p class="eyebrow">${esc(fdateLong(hoy))}</p><h1>Resumen del negocio</h1></div>
      ${!store.remote ? `<a class="pill-warn" href="#ajustes">${ICON.alert}<span>Modo local: los datos solo están en este dispositivo. Conectar Google</span></a>` : ''}
    </div>
    ${vacia ? `<div class="panel onboard"><h3>Empecemos</h3><p>Importa el histórico del Excel (pacientes, audífonos entregados y cuenta con Medihumana) o crea tu primer cliente.</p><div class="row-btns"><a class="btn btn-primary" href="#ajustes/importar">Importar histórico</a><a class="btn" href="#clientes">Ir a clientes</a></div></div>` : ''}
    <section class="kpis" aria-label="Indicadores principales">
      ${kpi('#cartera', 'Cartera de clientes', money(cx.total), cx.vencida ? `<b class="t-bad">${money(cx.vencida)}</b> vencida · ${cx.deudores} cliente${cx.deudores === 1 ? '' : 's'}` : `${cx.deudores} cliente${cx.deudores === 1 ? '' : 's'} con saldo`, cx.vencida ? 'bad' : '')}
      ${kpi('#cartera/abonos', 'Recaudos del mes', money(cx.recaudoMes), `Hoy: ${money(cx.recaudoHoy)}`, 'good')}
      ${kpi('#proveedor', 'Deuda con Medihumana', money(pv.saldo), pv.vencido ? `<b class="t-bad">${money(pv.vencido)}</b> vencido` : pv.proxima ? `Próximo vence ${fdate(pv.proxima.venc)}` : 'Sin facturas pendientes', pv.vencido ? 'warn' : '')}
      ${kpi('#alarmas', 'Alarmas para atender', num(vencidasOps.length), `${ops.length} en los próximos ${cfg('ventanaAlarmas')} días · ${clientesOp} clientes`, vencidasOps.length ? 'accent' : '')}
      ${kpi('#inventario', 'Inventario (a costo)', money(inv.valor), `${inv.bajo} con stock bajo · ${inv.agotados} agotados`, inv.agotados ? 'warn' : '')}
      ${kpi('#cotizaciones', 'Cotizaciones abiertas', money(cq.valorAbiertas), `${cq.abiertas} abiertas · aceptadas este mes ${money(cq.aceptadasMes)}`, '')}
    </section>

    <div class="cols-2">
      <section class="panel">
        <header class="panel-h"><h2>Atender hoy</h2><a href="#alarmas" class="link">Ver todas ${ICON.arrow}</a></header>
        ${vencidasOps.length ? `<ul class="op-mini">${vencidasOps.slice(0, 6).map(o => `<li>
          <span class="dot p-${o.prioridad}" aria-hidden="true"></span>
          <a href="#cliente/${esc(o.clienteId)}" class="op-mini-t"><b>${esc(clienteNombre(o.clienteId))}</b><small>${esc(o.titulo)} · ${o.dias < 0 ? `hace ${-o.dias} días` : 'hoy'}</small></a>
          <button class="btn btn-wa btn-sm" data-wa="${esc(o.key)}" aria-label="WhatsApp a ${esc(clienteNombre(o.clienteId))}">${ICON.wa}</button></li>`).join('')}</ul>`
      : `<p class="empty-inline">Nada vencido para hoy. ${ops.length ? `Hay ${ops.length} oportunidades próximas en <a href="#alarmas">Alarmas</a>.` : ''}</p>`}
      </section>
      <section class="panel">
        <header class="panel-h"><h2>Vencen en los próximos 7 días</h2><a href="#cartera" class="link">Cartera ${ICON.arrow}</a></header>
        ${proximos.length || pv.proxima ? `<ul class="due-list">
          ${proximos.slice(0, 5).map(d => `<li><a href="#cliente/${esc(d.clienteId)}"><b>${esc(clienteNombre(d.clienteId))}</b><small>${esc(d.tipoDoc || 'Factura')} ${esc(d.numero || '')} · vence ${fdate(d.fechaVencimiento)}</small></a><span class="num">${money(d.saldo)}</span></li>`).join('')}
          ${pv.proxima && (pv.proxima.venc <= addDays(hoy, 7)) ? `<li class="due-prov"><a href="#proveedor"><b>Medihumana · factura ${esc(pv.proxima.numero)}</b><small>Por pagar · vence ${fdate(pv.proxima.venc)}</small></a><span class="num">${money(pv.proxima.pendiente)}</span></li>` : ''}
        </ul>` : '<p class="empty-inline">No hay documentos por vencer esta semana.</p>'}
        <p class="muted small">Por vencer en 30 días: ${money(cx.porVencer30)}</p>
      </section>
    </div>

    <div class="cols-2">
      <section class="panel">
        <header class="panel-h"><h2>Recaudos de clientes y pagos a Medihumana</h2><span class="muted small">últimos 6 meses</span></header>
        ${barras(serie)}
        <div class="legend"><span><i class="sw sw-a"></i>Recaudos de clientes</span><span><i class="sw sw-b"></i>Pagos a Medihumana</span></div>
      </section>
      <section class="panel">
        <header class="panel-h"><h2>Antigüedad de la cartera de clientes</h2><span class="muted small">${cx.total ? Math.round(cx.pctVencida) + '% vencida' : ''}</span></header>
        ${aging(cx)}
      </section>
    </div>

    <details class="panel more-kpis">
      <summary><h2>Todos los indicadores</h2>${ICON.arrow}</summary>
      <dl class="kv-grid">
        ${kv('Cartera total pendiente', money(cx.total))}${kv('Cartera vencida', money(cx.vencida))}${kv('Cartera vigente', money(cx.vigente))}
        ${kv('Por vencer (7 días)', money(cx.porVencer7))}${kv('Por vencer (30 días)', money(cx.porVencer30))}${kv('Recaudos de hoy', money(cx.recaudoHoy))}
        ${kv('Recaudos del mes', money(cx.recaudoMes))}${kv('Clientes con saldo', cx.deudores)}${kv('Documentos vencidos', cx.docsVencidos)}
        ${kv('% de cartera vencida', (cx.pctVencida || 0).toFixed(1) + '%')}${kv('Valor del inventario (costo promedio)', money(inv.valor))}${kv('Productos con stock bajo', inv.bajo)}
        ${kv('Productos agotados', inv.agotados)}${kv('Cotizaciones pendientes', cq.abiertas)}${kv('Valor total cotizado', money(cq.valorTotal))}
        ${kv('Cotizaciones aceptadas (valor)', money(cq.aceptadas))}${kv('Tasa de aceptación', cq.tasa == null ? '—' : cq.tasa.toFixed(0) + '%')}${kv('Ventas del mes', money(ventasMes()))}
        ${kv('Clientes con oportunidades', clientesOp)}${kv('Deuda Medihumana', money(pv.saldo))}${kv('Pagado a Medihumana este mes', money(pv.pagosMes))}
        ${kv('Compras a Medihumana este mes', money(pv.comprasMes))}
      </dl>
    </details>
  </div>`;

  main.querySelectorAll('[data-wa]').forEach(b => b.onclick = () => {
    const o = ops.find(x => x.key === b.dataset.wa);
    const c = cliente(o.clienteId);
    componerWhatsApp({ cliente: c, plantilla: o.plantilla, oportunidad: o, cotizacionId: o.cotizacionId, vars: { fecha: fdate(o.fecha), producto: o.producto, anios: o.anios } });
  });
}
function kpi(href, label, value, sub, tone) {
  return `<a class="kpi ${tone ? 'k-' + tone : ''}" href="${href}"><span class="kpi-l">${esc(label)}</span><span class="kpi-v num">${value}</span><span class="kpi-s">${sub}</span></a>`;
}
function kv(k, v) { return `<div><dt>${esc(k)}</dt><dd class="num">${esc(String(v))}</dd></div>`; }

function barras(serie) {
  const max = Math.max(1, ...serie.flatMap(s => [s.recaudos, s.pagosProv]));
  const nice = niceMax(max);
  const W = 520, H = 200, L = 52, B = 26, T = 10, bw = (W - L - 10) / serie.length;
  const y = v => T + (H - T - B) * (1 - v / nice);
  const ticks = [0, nice / 2, nice];
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Recaudos y pagos por mes">
    ${ticks.map(t => `<line x1="${L}" x2="${W - 6}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${L - 6}" y="${y(t) + 4}" class="ax" text-anchor="end">${money(t, { short: true })}</text>`).join('')}
    ${serie.map((s, i) => {
    const x = L + i * bw + bw * 0.16, w = bw * 0.32;
    return `<rect x="${x}" y="${y(s.recaudos)}" width="${w}" height="${Math.max(0, y(0) - y(s.recaudos))}" class="bar-a" rx="2"><title>Recaudos ${s.mes}: ${money(s.recaudos)}</title></rect>
        <rect x="${x + w + 2}" y="${y(s.pagosProv)}" width="${w}" height="${Math.max(0, y(0) - y(s.pagosProv))}" class="bar-b" rx="2"><title>Pagos Medihumana ${s.mes}: ${money(s.pagosProv)}</title></rect>
        <text x="${L + i * bw + bw / 2}" y="${H - 8}" class="ax" text-anchor="middle">${MES[+s.mes.slice(5, 7) - 1]}</text>`;
  }).join('')}
  </svg>`;
}
function niceMax(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
function aging(cx) {
  if (!cx.total) return '<p class="empty-inline">No hay cartera pendiente de clientes.</p>';
  const max = Math.max(...Object.values(cx.aging));
  return `<ul class="hbars">${RANGOS.map(([k, t]) => `<li><span class="hb-l">${t}</span><span class="hb-track"><span class="hb-fill ${k === 'vigente' ? 'hb-ok' : k === '90+' ? 'hb-bad' : 'hb-warn'}" style="width:${max ? (cx.aging[k] / max * 100).toFixed(1) : 0}%"></span></span><span class="hb-v num">${money(cx.aging[k])}</span></li>`).join('')}</ul>`;
}
