// Reglas de negocio y cálculos — Gestión Comercial v1.00
import { store } from './store.js';
import { today, addDays, addMonths, daysBetween, parseISO, iso, median, norm, round2, monthKey, fdate } from './util.js';

/* ======================= CONFIGURACIÓN POR DEFECTO ======================= */
export const FAMILIAS = {
  audifono: 'Audífonos', mantenimiento: 'Mantenimiento', bateria: 'Baterías', molde: 'Moldes', domo: 'Domos',
  receptor: 'Receptores / speakers', filtro: 'Filtros', secado: 'Secado / deshumidificador', protector: 'Protectores auditivos',
  repuesto: 'Repuestos', otro: 'Otros'
};
const FAM_RX = [
  ['mantenimiento', /mantenim|revision|reparac|limpieza/], ['audifono', /audifono|kit audif|amplifier|\bcros\b/], ['bateria', /bater|battery|batteries|zenipower|zinc air|pila/],
  ['molde', /molde/], ['domo', /dome|domo/], ['receptor', /speaker|receptor|rec tube|sf2/], ['filtro', /filtro|cerustop|prowax/],
  ['secado', /secado|deshumid/], ['protector', /protector/], ['repuesto', /manguera|maguera|codo|circuito|tubo/]
];
export function familiaDe(texto) {
  const t = norm(texto);
  for (const [f, rx] of FAM_RX) if (rx.test(t)) return f;
  return 'otro';
}
export function esDePila(desc) {
  const t = norm(desc);
  if (/li-?ion|recarg|minirite r\b|minirite t\b| r c0| rite r\b/.test(t)) return false;
  return /\b312\b|\bbte 13\b|\b13 \b|\b675\b|\ba10\b|pila/.test(t);
}

export const DEFAULTS = {
  negocio: {
    nombre: 'MARTHA NUBIA CASTAÑEDA CARREÑO', profesion: 'FONOAUDIOLOGA', telefono: '3045719414',
    registro: 'R.P. 03183 S.S.S.', ciudad: 'Socorro', firmaNombre: 'MARTHA NUBIA CASTAÑEDA CARREÑO',
    email: '', direccion: '', lema: 'Volver a disfrutar los sonidos de la vida'
  },
  moneda: 'COP',
  proveedor: { nombre: 'MEDIHUMANA COLOMBIA S.A.', nit: '830.055.758-1', plazoDias: 30, telefono: '915 70 81', email: 'cartera@medihumana.com', ciudad: 'Bogotá D.C.' },
  mediosPago: ['Efectivo', 'Transferencia BBVA', 'Nequi', 'Daviplata', 'Tarjeta', 'Otro'],
  mediosPagoTexto: ['Efectivo', 'Transferencia Bancaria deberá ser realizada a cuenta BBVA con llave: @bbva30457194141'],
  condicionesPago: ['50% al realizar pedido y 50% a la entrega', 'Contado', 'Crédito 30 días', 'Crédito 60 días'],
  categoriasClientes: { 'Paciente': ['Particular', 'EPS / convenio', 'Referido'], 'Institución': ['IPS', 'Empresa'] },
  categoriasCartera: { 'Audífonos': ['Adaptación', 'Cambio de tecnología'], 'Servicios': ['Mantenimiento', 'Consulta'], 'Accesorios': ['Baterías', 'Repuestos', 'Moldes'] },
  categoriasProductos: { 'Audífonos': ['Recargable', 'Pila 312', 'Pila 13', 'CROS'], 'Consumibles': ['Baterías', 'Domos', 'Filtros'], 'Repuestos': ['Receptores', 'Moldes', 'Mangueras / codos'], 'Accesorios': ['Secado', 'Protectores', 'Cargadores'], 'Herramientas': ['Diagnóstico', 'Calibración', 'Limpieza'] },
  permitirNegativo: false,
  ventanaAlarmas: 30,
  // Reglas de respaldo SOLO cuando no hay historial suficiente (se reemplazan por los datos reales)
  reglas: { mantenimiento: 180, bateria: 90, domo: 120, filtro: 90, molde: 365, receptor: 365, secado: 365, renovacionMeses: 60, garantiaMeses: 24, seguimientoCotizacionDias: 3, avisoGarantiaDias: 60, minMuestras: 3 },
  tiposCotizacion: [
    {
      id: 'recargable', nombre: 'Audífonos batería recargable',
      dispositivo: 'AUDIFONOS ULTIMA TECNOLOGIA RUBY 2 MINIRITE MARCA OTICON BATERIA RECARGABLE',
      descripcion: 'TECNOLOGIA, INALAMBRICO, MINIRITE RECARGABLE', cantidad: 2, precioUnit: 3750000, ivaPct: 0,
      incluye: ['ADAPTACIÓN Y ENTREGA DE AUDIFONOS', 'CONTROLES GRATIS DURANTE LOS DOS AÑOS.', 'MANTENIMIENTOS Y LIMPIEZA CADA 6 MESES DURANTE LA GARANTÍA.'],
      kit: ['Estuche', 'Carta de Garantía', 'Kit de limpieza', '1 Base Cargadora', 'Deshumidificador eléctrico', '1 Micro molde por audífono o paquete de domos según solicitud del usuario', 'Aplicaciones compatibles con APP STORE celular a través de Bluetooth', 'Audífono compatible para diagnóstico tinnitus.'],
      garantia: '2 (DOS) años por defecto de fabrica', garantiaNota: '*No cubre mal uso ni maltrato.', garantiaMeses: 24, imagen: 'img/prod_recargable.jpg'
    },
    {
      id: 'pila312', nombre: 'Audífonos batería (pila) 312',
      dispositivo: 'AUDIFONOS ULTIMA TECNOLOGIA RUBY 2 MINIRITE MARCA OTICON BATERIA 312',
      descripcion: 'TECNOLOGIA, INALAMBRICO, MINIRITE 312', cantidad: 2, precioUnit: 3000000, ivaPct: 0,
      incluye: ['ADAPTACIÓN Y ENTREGA DE AUDIFONOS', 'CONTROLES GRATIS DURANTE LOS DOS AÑOS.', 'MANTENIMIENTOS Y LIMPIEZA CADA 6 MESES DURANTE LA GARANTÍA.'],
      kit: ['Estuche', 'Carta de Garantía', 'Kit de limpieza', 'Deshumidificador de pastilla', '1 set de Baterías por audífono', '1 Micro molde por audífono o paquete de domos según solicitud del usuario', 'Aplicaciones compatibles con APP STORE celular a través de Bluetooth', 'Audífono compatible para diagnóstico tinnitus.'],
      garantia: '2 (DOS) años por defecto de fabrica', garantiaNota: '*No cubre mal uso ni maltrato.', garantiaMeses: 24, imagen: 'img/prod_312.jpg'
    }
  ],
  cotizacionTextos: {
    asunto: 'COTIZACIÓN AUDIFONOS BILATERAL',
    intro1: 'Presentamos a su consideración la cotización de audífonos y ofrecemos a nuestros usuarios una atención segura, oportuna y de calidad, suministrando audífonos de tecnología reconocida por su confiabilidad, nitidez del sonido y conectividad que facilitan el uso por parte del paciente.',
    intro2: 'Ofrecemos además apoyo integral en el uso de las prótesis auditivas buscando una rehabilitación auditivo verbal adecuada, así mismo acompañamiento y soporte permanente.',
    antesTabla: 'A continuación, presentamos nuestra oferta de tecnología y de precios:',
    formaPago: 'Pago al realizar pedido 50% del valor total\nDía de la entrega del pedido 50% restante.',
    cierre: 'Quedo atenta a cualquier inquietud',
    tiempoEntrega: '8 a 15 días hábiles después del pedido'
  },
  plantillas: [
    { id: 'mantenimiento', nombre: 'Mantenimiento preventivo', texto: 'Hola {nombre}, le saludamos de parte de {negocio}. Según nuestro registro, a sus audífonos les corresponde el mantenimiento y limpieza preventiva ({fecha}). ¿Le agendamos una cita esta semana?\n\n{firma}' },
    { id: 'bateria', nombre: 'Reposición de baterías', texto: 'Hola {nombre}, ¿cómo le ha ido con sus audífonos? Es posible que ya necesite baterías nuevas. Tenemos disponibilidad; ¿le separamos una caja?\n\n{firma}' },
    { id: 'consumible', nombre: 'Repuestos / consumibles', texto: 'Hola {nombre}, le recordamos que puede ser momento de cambiar {producto} de sus audífonos para que sigan funcionando bien. ¿Desea que se los tengamos listos?\n\n{firma}' },
    { id: 'garantia', nombre: 'Garantía por vencer', texto: 'Hola {nombre}, la garantía de sus audífonos vence el {fecha}. Le recomendamos una revisión completa antes de esa fecha. ¿Cuándo le queda bien venir?\n\n{firma}' },
    { id: 'renovacion', nombre: 'Renovación de tecnología', texto: 'Hola {nombre}, sus audífonos ya llevan {anios} de uso. Hay nuevas tecnologías con mejor sonido y conectividad. ¿Le preparo una cotización sin compromiso?\n\n{firma}' },
    { id: 'cotizacion', nombre: 'Envío / seguimiento de cotización', texto: 'Hola {nombre}, le comparto la cotización {numero} por {total}, vigente hasta el {vence}.\n{enlace}\n\nQuedo atenta a cualquier inquietud.\n{firma}' },
    { id: 'cobro', nombre: 'Recordatorio de saldo', texto: 'Hola {nombre}, le recordamos amablemente que tiene un saldo pendiente de {saldo}. Puede pagar por {mediosPago}. ¡Muchas gracias!\n\n{firma}' },
    { id: 'general', nombre: 'Mensaje general', texto: 'Hola {nombre}, le saludamos de parte de {negocio}. \n\n{firma}' }
  ]
};
export function cfg(key) {
  const d = DEFAULTS[key];
  const v = store.cfg(key, undefined);
  if (v === undefined) return structuredClone(d);
  if (d && typeof d === 'object' && !Array.isArray(d) && v && typeof v === 'object' && !Array.isArray(v)) return { ...structuredClone(d), ...v };
  return v;
}

/* ============================== CLIENTES =============================== */
export const clientes = () => store.all('clientes');
export const cliente = id => store.get('clientes', id);
export const clienteNombre = id => cliente(id)?.nombre || '—';
export function clientesActivos() { return clientes().filter(c => c.estado !== 'inactivo').sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')); }
export function telefonoCliente(c) { return c?.whatsapp || c?.telefono || ''; }

/* ============================ CARTERA CLIENTES ========================== */
export function abonosDoc(docId) { return store.all('cxc_abonos').filter(a => a.docId === docId && !a.anulado); }
export function docInfo(d, hoy = today()) {
  const abonado = round2(abonosDoc(d.id).reduce((s, a) => s + (a.valor || 0), 0));
  const saldo = round2((d.valor || 0) - abonado);
  let estado;
  if (d.anulado) estado = 'anulada';
  else if (saldo <= 0.5) estado = 'pagada';
  else if (d.fechaVencimiento && d.fechaVencimiento < hoy) estado = 'vencida';
  else if (abonado > 0) estado = 'parcial';
  else estado = 'pendiente';
  const diasVencido = estado === 'vencida' ? daysBetween(d.fechaVencimiento, hoy) : 0;
  const diasParaVencer = d.fechaVencimiento ? daysBetween(hoy, d.fechaVencimiento) : null;
  return { ...d, abonado, saldo: d.anulado ? 0 : Math.max(0, saldo), estado, diasVencido, diasParaVencer };
}
export function docsCxc() { return store.all('cxc_docs').map(d => docInfo(d)); }
export const ESTADO_DOC = { pendiente: 'Pendiente', parcial: 'Parcialmente pagada', pagada: 'Pagada', vencida: 'Vencida', anulada: 'Anulada' };
export function antiguedad(d) {
  if (d.estado !== 'vencida') return 'vigente';
  const x = d.diasVencido;
  return x <= 30 ? '1-30' : x <= 60 ? '31-60' : x <= 90 ? '61-90' : '90+';
}
export const RANGOS = [['vigente', 'Vigente'], ['1-30', '1-30 días'], ['31-60', '31-60 días'], ['61-90', '61-90 días'], ['90+', 'Más de 90']];

export function resumenCxc(hoy = today()) {
  const docs = docsCxc().filter(d => d.estado !== 'anulada');
  const abiertos = docs.filter(d => d.saldo > 0);
  const total = sum(abiertos, 'saldo');
  const vencida = sum(abiertos.filter(d => d.estado === 'vencida'), 'saldo');
  const porVencer = n => sum(abiertos.filter(d => d.estado !== 'vencida' && d.diasParaVencer !== null && d.diasParaVencer <= n), 'saldo');
  const abonos = store.all('cxc_abonos').filter(a => !a.anulado);
  const mes = monthKey(hoy);
  const aging = Object.fromEntries(RANGOS.map(([k]) => [k, 0]));
  for (const d of abiertos) aging[antiguedad(d)] += d.saldo;
  return {
    total, vencida, vigente: total - vencida, porVencer7: porVencer(7), porVencer30: porVencer(30),
    recaudoHoy: sum(abonos.filter(a => a.fecha === hoy), 'valor'),
    recaudoMes: sum(abonos.filter(a => monthKey(a.fecha) === mes), 'valor'),
    deudores: new Set(abiertos.map(d => d.clienteId)).size,
    docsVencidos: abiertos.filter(d => d.estado === 'vencida').length,
    pctVencida: total ? vencida / total * 100 : 0, aging, abiertos
  };
}
export function saldoCliente(clienteId) {
  const docs = docsCxc().filter(d => d.clienteId === clienteId && d.estado !== 'anulada');
  return { saldo: sum(docs, 'saldo'), vencido: sum(docs.filter(d => d.estado === 'vencida'), 'saldo'), docs };
}
export function validarAbono({ docId, valor, fecha, referencia, id }) {
  const d = store.get('cxc_docs', docId);
  if (!d) return 'Selecciona el documento al que se aplica el abono.';
  const info = docInfo(d);
  if (info.estado === 'anulada') return 'El documento está anulado; no recibe abonos.';
  const v = Number(valor);
  if (!(v > 0)) return 'El valor del abono debe ser mayor que cero.';
  if (v > info.saldo + 0.5) return `El abono supera el saldo del documento (${info.saldo.toLocaleString('es-CO')}).`;
  if (!fecha) return 'Indica la fecha del abono.';
  const dup = abonosDoc(docId).find(a => a.id !== id && a.fecha === fecha && Math.abs(a.valor - v) < 1 && (a.referencia || '') === (referencia || ''));
  if (dup) return 'Ya existe un abono igual (misma fecha, valor y referencia) en este documento. Si es otro pago distinto, cambia la referencia.';
  return null;
}

/* ============================ CUENTA PROVEEDOR ========================== */
// Saldo con Medihumana: saldo inicial + facturas − notas crédito − pagos. Aplicación FIFO a facturas.
export function cuentaProveedor(hoy = today()) {
  const plazo = Number(cfg('proveedor').plazoDias) || 30;
  const docs = store.all('prov_docs').filter(d => !d.historico && !d.anulado);
  const pagos = store.all('prov_abonos').filter(a => !a.historico && !a.anulado);
  const cargos = docs.filter(d => d.tipo !== 'nota_credito').map(d => ({ ...d, venc: d.fechaVencimiento || addDays(d.fecha, d.tipo === 'saldo_inicial' ? 0 : plazo) }))
    .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || String(a.numero).localeCompare(String(b.numero)));
  const creditos = sum(docs.filter(d => d.tipo === 'nota_credito'), 'valor') + sum(pagos, 'valor');
  let disponible = creditos;
  const facturas = cargos.map(c => {
    const aplicado = Math.min(c.valor || 0, Math.max(0, disponible));
    disponible -= aplicado;
    const pendiente = round2((c.valor || 0) - aplicado);
    const estado = pendiente <= 0.5 ? 'pagada' : (c.venc < hoy ? 'vencida' : (aplicado > 0 ? 'parcial' : 'pendiente'));
    return { ...c, aplicado, pendiente: Math.max(0, pendiente), estado, diasVencido: estado === 'vencida' ? daysBetween(c.venc, hoy) : 0 };
  });
  const saldo = round2(sum(cargos, 'valor') - creditos);
  const abiertas = facturas.filter(f => f.pendiente > 0);
  const proxima = abiertas.filter(f => f.estado !== 'vencida').sort((a, b) => a.venc.localeCompare(b.venc))[0];
  const mes = monthKey(hoy);
  return {
    saldo, aFavor: saldo < 0 ? -saldo : 0, facturas, abiertas,
    vencido: sum(abiertas.filter(f => f.estado === 'vencida'), 'pendiente'),
    proxima, pagosMes: sum(pagos.filter(p => monthKey(p.fecha) === mes), 'valor'),
    comprasMes: sum(docs.filter(d => d.tipo === 'factura' && monthKey(d.fecha) === mes), 'valor'),
    movimientos: [...docs.map(d => ({ ...d, clase: d.tipo })), ...pagos.map(p => ({ ...p, clase: 'pago' }))]
      .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.createdAt || 0) - (b.createdAt || 0))
  };
}
export function extractoProveedor() {
  const c = cuentaProveedor();
  let s = 0;
  return c.movimientos.map(m => {
    const signo = m.clase === 'pago' || m.clase === 'nota_credito' ? -1 : 1;
    s = round2(s + signo * (m.valor || 0));
    return { ...m, cargo: signo > 0 ? m.valor : 0, abono: signo < 0 ? m.valor : 0, saldo: s };
  });
}

/* ============================== INVENTARIO ============================== */
export const TIPOS_MOV = { entrada: 'Entrada (compra)', salida: 'Salida (venta / entrega)', devolucion: 'Devolución de cliente', ajuste_pos: 'Ajuste (+)', ajuste_neg: 'Ajuste (−)' };
export const signoMov = t => (t === 'salida' || t === 'ajuste_neg') ? -1 : 1;
export function kardex(productoId) {
  const p = store.get('productos', productoId);
  const movs = store.all('movimientos').filter(m => m.productoId === productoId)
    .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || (a.createdAt || 0) - (b.createdAt || 0));
  let stock = 0, prom = Number(p?.costo) || 0;
  const rows = movs.map(m => {
    const q = (Number(m.cantidad) || 0) * signoMov(m.tipo);
    if (m.tipo === 'entrada' && q > 0 && Number(m.costoUnit) > 0) {
      prom = stock > 0 ? (stock * prom + q * m.costoUnit) / (stock + q) : m.costoUnit;
    }
    stock = round2(stock + q);
    return { ...m, q, stock, costoProm: prom };
  });
  return { rows, stock, costoProm: prom, valor: Math.max(0, stock) * prom };
}
export function inventario() {
  return store.all('productos').map(p => {
    const k = kardex(p.id);
    const estadoStock = k.stock <= 0 ? 'agotado' : (Number(p.stockMin) > 0 && k.stock <= Number(p.stockMin) ? 'bajo' : 'ok');
    return { ...p, stock: k.stock, costoProm: k.costoProm, valor: k.valor, estadoStock };
  });
}
export function resumenInventario() {
  const inv = inventario().filter(p => p.estado !== 'inactivo');
  return {
    valor: sum(inv, 'valor'), bajo: inv.filter(p => p.estadoStock === 'bajo').length,
    agotados: inv.filter(p => p.estadoStock === 'agotado' && (Number(p.stockMin) > 0 || store.all('movimientos').some(m => m.productoId === p.id))).length,
    productos: inv.length, unidades: inv.reduce((s, p) => s + Math.max(0, p.stock), 0)
  };
}
export function validarMovimiento({ productoId, tipo, cantidad, id }) {
  const p = store.get('productos', productoId);
  if (!p) return 'Selecciona un producto.';
  const q = Number(cantidad);
  if (!(q > 0)) return 'La cantidad debe ser mayor que cero.';
  if (!TIPOS_MOV[tipo]) return 'Selecciona el tipo de movimiento.';
  if (signoMov(tipo) < 0 && !cfg('permitirNegativo')) {
    const st = kardex(productoId).stock;
    if (q > st) return `No hay existencias suficientes de ${p.nombre}: hay ${st}. (Puedes permitir inventario negativo en Ajustes.)`;
  }
  return null;
}

/* ============================= COTIZACIONES ============================= */
export const ESTADOS_COT = { borrador: 'Borrador', enviada: 'Enviada', seguimiento: 'En seguimiento', aceptada: 'Aceptada', rechazada: 'Rechazada', vencida: 'Vencida', convertida: 'Convertida en venta' };
export function totales(items = [], descGeneralPct = 0) {
  let bruto = 0, descLineas = 0, iva = 0, baseTotal = 0;
  const lines = items.map(it => {
    const b = (Number(it.cantidad) || 0) * (Number(it.precio) || 0);
    const dl = b * (Number(it.descPct) || 0) / 100;
    bruto += b; descLineas += dl;
    return { ...it, bruto: b, descLinea: dl, base: b - dl };
  });
  const g = Number(descGeneralPct) || 0;
  const descGen = lines.reduce((s, l) => s + l.base * g / 100, 0);
  for (const l of lines) {
    const base = l.base * (1 - g / 100);
    const iv = base * (Number(l.ivaPct) || 0) / 100;
    l.baseNeta = base; l.ivaValor = iv; l.total = base + iv;
    iva += iv; baseTotal += base;
  }
  return { lines, subtotal: round2(bruto), descuentos: round2(descLineas + descGen), base: round2(baseTotal), iva: round2(iva), total: round2(baseTotal + iva) };
}
export function estadoCot(c, hoy = today()) {
  if (['borrador', 'enviada', 'seguimiento'].includes(c.estado) && c.vence && c.vence < hoy) return 'vencida';
  return c.estado || 'borrador';
}
export function resumenCotizaciones(hoy = today()) {
  const cs = store.all('cotizaciones').map(c => ({ ...c, est: estadoCot(c, hoy) }));
  const abiertas = cs.filter(c => ['borrador', 'enviada', 'seguimiento'].includes(c.est));
  const mes = monthKey(hoy);
  return {
    abiertas: abiertas.length, valorAbiertas: sum(abiertas, 'total'), valorTotal: sum(cs.filter(c => c.est !== 'borrador'), 'total'),
    aceptadas: sum(cs.filter(c => ['aceptada', 'convertida'].includes(c.est)), 'total'),
    aceptadasMes: sum(cs.filter(c => ['aceptada', 'convertida'].includes(c.est) && monthKey(lastStateDate(c, ['aceptada', 'convertida']) || c.fecha) === mes), 'total'),
    tasa: (() => { const cerradas = cs.filter(c => ['aceptada', 'convertida', 'rechazada'].includes(c.est)); return cerradas.length ? cerradas.filter(c => c.est !== 'rechazada').length / cerradas.length * 100 : null; })()
  };
}
function lastStateDate(c, estados) { const h = (c.historial || []).filter(x => estados.includes(x.estado)); return h.length ? h[h.length - 1].fecha : null; }

export function ventasMes(hoy = today()) {
  const mes = monthKey(hoy);
  return sum(store.all('ventas').filter(v => v.estado !== 'anulada' && monthKey(v.fecha) === mes), 'total');
}

/* ======================= OPORTUNIDADES / ALARMAS ======================== */
// Intervalos dinámicos: 1) historial del propio paciente, 2) mediana de todos los pacientes, 3) regla ajustable.
function historialPorCliente() {
  const map = new Map();
  for (const e of store.all('entregas')) {
    if (e.anulado || !e.clienteId || !e.fecha) continue;
    if (!map.has(e.clienteId)) map.set(e.clienteId, []);
    map.get(e.clienteId).push(e);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return map;
}
function intervalos(fechas) {
  const u = [...new Set(fechas)].sort();
  const out = [];
  // < 30 días entre registros = mismo pedido (ej. molde de cada oído por separado), no es un ciclo
  for (let i = 1; i < u.length; i++) { const d = daysBetween(u[i - 1], u[i]); if (d >= 30) out.push(d); }
  return out;
}
export function estadisticasIntervalos() {
  const hist = historialPorCliente();
  const pob = {};
  const add = (k, arr) => { (pob[k] ||= []).push(...arr); };
  for (const arr of hist.values()) {
    const porFam = {};
    for (const e of arr) (porFam[e.familia] ||= []).push(e.fecha);
    for (const [f, fs] of Object.entries(porFam)) if (f !== 'audifono') add(f, intervalos(fs));
    // mantenimiento: desde la entrega del audífono o el último mantenimiento
    const mt = [...(porFam.audifono || []), ...(porFam.mantenimiento || [])];
    if ((porFam.mantenimiento || []).length) add('mantenimiento_ciclo', intervalos(mt));
    add('audifono', intervalos(porFam.audifono || []).filter(d => d > 365));
  }
  const r = {};
  for (const [k, v] of Object.entries(pob)) r[k] = { mediana: median(v), n: v.length };
  return r;
}
function intervaloPara(fam, fechasCliente, stats) {
  const reg = cfg('reglas');
  const min = Number(reg.minMuestras) || 3;
  const own = intervalos(fechasCliente);
  if (own.length >= 2) return { dias: median(own), fuente: 'historial', txt: `Según su historial (${own.length} intervalos)` };
  const key = fam === 'mantenimiento' ? 'mantenimiento_ciclo' : fam;
  const p = stats[key];
  // Renovación: exige más casos y nunca antes de terminar la garantía (pocos casos = recompras por pérdida o cambio)
  const minN = fam === 'audifono' ? Math.max(min, 10) : min;
  const piso = fam === 'audifono' ? (Number(reg.garantiaMeses) || 24) * 30.4 : 0;
  if (p && p.n >= minN && p.mediana && p.mediana >= piso) return { dias: p.mediana, fuente: 'pacientes', txt: `Mediana real de sus pacientes: cada ${Math.round(p.mediana)} días (${p.n} casos)` };
  const d = fam === 'audifono' ? (Number(reg.renovacionMeses) || 60) * 30.4 : Number(reg[fam]) || 180;
  return { dias: d, fuente: 'regla', txt: `Regla ajustable en Ajustes (${Math.round(d)} días)` };
}

// Ciclos periódicos: si el paciente se saltó un ciclo, la alarma pasa al siguiente (no se acumulan vencidas eternas).
function proximoCiclo(last, dias, hoy) {
  let fecha = addDays(last, dias);
  const gracia = Math.max(15, dias * 0.25);
  const atraso = daysBetween(fecha, hoy);
  let saltados = 0;
  if (atraso > gracia) { saltados = Math.ceil((atraso - gracia) / dias); fecha = addDays(fecha, saltados * dias); }
  return { fecha, saltados, sinRegistro: daysBetween(last, hoy) };
}
const nota = c => c.saltados ? ` · sin registro hace ${c.sinRegistro} días` : '';

export function oportunidades({ incluirFuturas = false, hoy = today() } = {}) {
  const reg = cfg('reglas');
  const ventana = Number(cfg('ventanaAlarmas')) || 30;
  const stats = estadisticasIntervalos();
  const hist = historialPorCliente();
  const equipos = store.all('equipos').filter(e => e.estado !== 'retirado');
  const out = [];
  const push = o => { o.dias = daysBetween(hoy, o.fecha); o.key = `${o.tipo}|${o.clienteId}|${o.fecha}${o.ref ? '|' + o.ref : ''}`; out.push(o); };

  for (const c of clientes()) {
    if (c.estado === 'inactivo') continue;
    const h = hist.get(c.id) || [];
    const eqs = equipos.filter(e => e.clienteId === c.id).sort((a, b) => (a.fechaEntrega || '').localeCompare(b.fechaEntrega || ''));
    const fechas = f => h.filter(e => e.familia === f).map(e => e.fecha);
    const ultimoEq = eqs[eqs.length - 1];

    // Mantenimiento (pacientes con audífono)
    if (ultimoEq) {
      const anclas = [...eqs.map(e => e.fechaEntrega), ...fechas('mantenimiento')].filter(Boolean).sort();
      const last = anclas[anclas.length - 1];
      const iv = intervaloPara('mantenimiento', anclas, stats);
      const garVence = addMonths(ultimoEq.fechaEntrega, Number(ultimoEq.garantiaMeses) || reg.garantiaMeses);
      const cy = proximoCiclo(last, iv.dias, hoy); const fecha = cy.fecha;
      if (daysBetween(last, hoy) < 365 * 6) push({ tipo: 'mantenimiento', clienteId: c.id, fecha, fuente: iv.fuente, fuenteTxt: iv.txt, titulo: fecha <= garVence ? 'Mantenimiento incluido (en garantía)' : 'Mantenimiento preventivo (servicio)', detalle: `Último: ${fdate(last)}${nota(cy)} · ${ultimoEq.descripcion || 'audífono'}`, plantilla: 'mantenimiento', familia: 'mantenimiento', base: last });
    }
    // Baterías: pacientes con audífono de pila o que ya compraron baterías
    const fb = fechas('bateria');
    const eqPila = eqs.filter(e => esDePila(e.descripcion));
    if (fb.length || eqPila.length) {
      const anclas = [...fb, ...eqPila.map(e => e.fechaEntrega)].filter(Boolean).sort();
      const last = anclas[anclas.length - 1];
      const iv = intervaloPara('bateria', fb, stats);
      const cy = proximoCiclo(last, iv.dias, hoy);
      if (daysBetween(last, hoy) < 365 * 4) push({ tipo: 'bateria', clienteId: c.id, fecha: cy.fecha, fuente: iv.fuente, fuenteTxt: iv.txt, titulo: 'Reposición de baterías', detalle: (fb.length ? `Última compra de baterías: ${fdate(fb[fb.length - 1])}` : `Audífono de pila entregado ${fdate(eqPila[eqPila.length - 1].fechaEntrega)} (no hay compras de baterías registradas a su nombre)`) + nota(cy), plantilla: 'bateria', familia: 'bateria', base: last });
    }
    // Consumibles comprados antes
    for (const f of ['domo', 'filtro', 'molde', 'receptor', 'secado']) {
      const fs = fechas(f); if (!fs.length) continue;
      const last = fs[fs.length - 1];
      const iv = intervaloPara(f, fs, stats);
      const cy = proximoCiclo(last, iv.dias, hoy);
      if (daysBetween(last, hoy) < 365 * 4) push({ tipo: 'consumible', clienteId: c.id, fecha: cy.fecha, fuente: iv.fuente, fuenteTxt: iv.txt, titulo: 'Reposición: ' + FAMILIAS[f].toLowerCase(), detalle: `Última compra: ${fdate(last)}${nota(cy)}`, plantilla: 'consumible', familia: f, producto: FAMILIAS[f].toLowerCase(), base: last, ref: f });
    }
    // Garantía y renovación por equipo
    for (const e of eqs) {
      if (!e.fechaEntrega) continue;
      const vence = addMonths(e.fechaEntrega, Number(e.garantiaMeses) || reg.garantiaMeses);
      const dv = daysBetween(hoy, vence);
      if (dv <= (Number(reg.avisoGarantiaDias) || 60) && dv >= -30) push({ tipo: 'garantia', clienteId: c.id, fecha: vence, fuente: 'dato', fuenteTxt: `Entrega ${fdate(e.fechaEntrega)} + ${e.garantiaMeses || reg.garantiaMeses} meses`, titulo: 'Garantía por vencer', detalle: e.descripcion, plantilla: 'garantia', familia: 'mantenimiento', ref: e.id });
    }
    if (ultimoEq && ultimoEq.fechaEntrega) {
      const iv = intervaloPara('audifono', eqs.map(e => e.fechaEntrega), stats);
      const fecha = addDays(ultimoEq.fechaEntrega, iv.dias);
      const anios = (daysBetween(ultimoEq.fechaEntrega, hoy) / 365).toFixed(1).replace('.', ',');
      // Renovación vencida hace más de un año: solo se ve en "Todas" (probablemente ya renovó en otro lado)
      if (daysBetween(fecha, hoy) <= 365 || incluirFuturas) push({ tipo: 'renovacion', clienteId: c.id, fecha, fuente: iv.fuente, fuenteTxt: iv.txt, titulo: 'Renovación de tecnología', detalle: `${ultimoEq.descripcion || 'Audífono'} · ${anios} años de uso`, plantilla: 'renovacion', familia: 'audifono', anios: anios + ' años', ref: ultimoEq.id });
    }
    // Fecha manual
    if (c.proxCompraManual) push({ tipo: 'manual', clienteId: c.id, fecha: c.proxCompraManual, fuente: 'manual', fuenteTxt: 'Fecha registrada manualmente', titulo: 'Próxima compra (manual)', detalle: c.proxCompraNota || '', plantilla: 'general' });
    // Inactivo: más tiempo del habitual sin comprar
    const todas = h.map(e => e.fecha);
    const ivs = intervalos(todas);
    if (ivs.length >= 3) {
      const m = median(ivs); const last = todas[todas.length - 1]; const sin = daysBetween(last, hoy);
      if (sin > m * 1.5 && sin < 365 * 5) push({ tipo: 'inactivo', clienteId: c.id, fecha: addDays(last, Math.round(m * 1.5)), fuente: 'historial', fuenteTxt: `Compra cada ~${Math.round(m)} días; lleva ${sin} sin comprar`, titulo: 'Lleva más tiempo de lo habitual sin comprar', detalle: `Última compra ${fdate(last)}`, plantilla: 'general' });
    }
    // Cobro de cartera vencida
    const sc = saldoCliente(c.id);
    if (sc.vencido > 0) {
      const vieja = sc.docs.filter(d => d.estado === 'vencida').sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento))[0];
      push({ tipo: 'cobro', clienteId: c.id, fecha: vieja.fechaVencimiento, fuente: 'dato', fuenteTxt: `${sc.docs.filter(d => d.estado === 'vencida').length} documento(s) vencido(s)`, titulo: 'Saldo vencido por cobrar', detalle: '', plantilla: 'cobro', saldo: sc.saldo });
    }
  }
  // Seguimiento de cotizaciones abiertas
  const contactos = store.all('contactos');
  for (const q of store.all('cotizaciones')) {
    const est = estadoCot(q, hoy);
    if (!['enviada', 'seguimiento'].includes(est)) continue;
    const ult = contactos.filter(x => x.cotizacionId === q.id).map(x => x.fecha).sort().pop() || q.fecha;
    push({ tipo: 'cotizacion', clienteId: q.clienteId, fecha: addDays(ult, Number(reg.seguimientoCotizacionDias) || 3), fuente: 'dato', fuenteTxt: `Cotización ${q.numero} vence ${fdate(q.vence)}`, titulo: 'Seguimiento de cotización', detalle: `${q.numero} · ${(q.total || 0).toLocaleString('es-CO')}`, plantilla: 'cotizacion', cotizacionId: q.id, ref: q.id });
  }

  // Estado (contactado / pospuesto / descartado) y prioridad
  const estados = new Map(store.all('oport_estado').map(e => [e.id, e]));
  const ultimoContacto = new Map();
  for (const x of contactos) if (!ultimoContacto.has(x.clienteId) || ultimoContacto.get(x.clienteId) < x.fecha) ultimoContacto.set(x.clienteId, x.fecha);
  const res = [];
  for (const o of out) {
    const st = estados.get(o.key);
    o.estado = st?.estado || 'pendiente';
    o.posponerHasta = st?.posponerHasta;
    o.ultimoContacto = ultimoContacto.get(o.clienteId) || null;
    if (o.estado === 'descartada') continue;
    if ((o.estado === 'pospuesta' || o.estado === 'contactado') && o.posponerHasta && o.posponerHasta > hoy) { if (!incluirFuturas) continue; }
    const sc = saldoCliente(o.clienteId);
    o.carteraVencida = sc.vencido; o.saldoPendiente = sc.saldo;
    const w = { cobro: 3, garantia: 3, mantenimiento: 2, bateria: 2, cotizacion: 2, consumible: 1, renovacion: 1, manual: 2, inactivo: 1 }[o.tipo] || 1;
    o.score = w * 10 + Math.max(-30, Math.min(60, -o.dias));
    o.prioridad = o.dias < 0 && w >= 2 ? 'alta' : o.dias <= 15 ? 'media' : 'baja';
    if (o.tipo === 'renovacion' && o.dias < 0) o.prioridad = 'media';
    if (!incluirFuturas && o.dias > ventana) continue;
    res.push(o);
  }
  return res.sort((a, b) => b.score - a.score || a.dias - b.dias);
}
export const TIPOS_OP = { mantenimiento: 'Mantenimiento', bateria: 'Baterías', consumible: 'Repuestos', garantia: 'Garantía', renovacion: 'Renovación', cotizacion: 'Cotización', cobro: 'Cobro', manual: 'Manual', inactivo: 'Sin comprar' };
export const FUENTES = { historial: 'Estimado con su historial', pacientes: 'Estimado con datos de sus pacientes', regla: 'Estimado con regla ajustable', manual: 'Fecha manual', dato: 'Dato registrado' };

/* ============================== MENSAJES =============================== */
export function rellenarPlantilla(texto, vars) {
  return String(texto || '').replace(/\{(\w+)\}/g, (m, k) => vars[k] != null && vars[k] !== '' ? String(vars[k]) : (k === 'enlace' ? '' : m)).replace(/\n{3,}/g, '\n\n').trim();
}
export function firmaTexto() {
  const n = cfg('negocio');
  return `${titleCase(n.firmaNombre || n.nombre)}\n${titleCase(n.profesion)} · Tel. ${n.telefono}`;
}
export function titleCase(s) { return String(s || '').toLowerCase().replace(/(^|\s)\S/g, x => x.toUpperCase()); }
export function primerNombre(c) {
  const n = titleCase(c?.nombre || '').split(' ');
  return n.length >= 3 ? n.slice(0, 1).join(' ') : n[0] || '';
}

/* ============================== VARIOS ================================= */
export function sum(arr, k) { return round2(arr.reduce((s, x) => s + (Number(typeof k === 'function' ? k(x) : x[k]) || 0), 0)); }
export function serieMensual(n = 6, hoy = today()) {
  const d = parseISO(hoy); const meses = [];
  for (let i = n - 1; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); meses.push(iso(x).slice(0, 7)); }
  const ab = store.all('cxc_abonos').filter(a => !a.anulado);
  const pp = store.all('prov_abonos').filter(a => !a.anulado);
  return meses.map(m => ({ mes: m, recaudos: sum(ab.filter(a => monthKey(a.fecha) === m), 'valor'), pagosProv: sum(pp.filter(a => monthKey(a.fecha) === m), 'valor') }));
}
export function historialCliente(clienteId) {
  const ev = [];
  for (const d of store.all('cxc_docs').filter(x => x.clienteId === clienteId)) ev.push({ fecha: d.fechaEmision, tipo: 'Documento', texto: `${d.tipoDoc || 'Factura'} ${d.numero || ''} · ${d.concepto || ''}`, valor: d.valor });
  for (const a of store.all('cxc_abonos').filter(x => x.clienteId === clienteId && !x.anulado)) ev.push({ fecha: a.fecha, tipo: 'Abono', texto: `${a.medio || ''} ${a.referencia || ''}${a.registradoPor ? ' · registró ' + a.registradoPor : ''}`, valor: a.valor });
  for (const q of store.all('cotizaciones').filter(x => x.clienteId === clienteId)) ev.push({ fecha: q.fecha, tipo: 'Cotización', texto: `${q.numero} · ${ESTADOS_COT[estadoCot(q)]}${q.registradoPor ? ' · por ' + q.registradoPor : ''}`, valor: q.total });
  for (const e of store.all('entregas').filter(x => x.clienteId === clienteId && !x.anulado)) ev.push({ fecha: e.fecha, tipo: 'Compra/entrega', texto: e.descripcion, valor: e.valor });
  for (const x of store.all('contactos').filter(x => x.clienteId === clienteId)) ev.push({ fecha: x.fecha, tipo: 'Contacto', texto: `${x.canal} · ${x.motivo || ''} · ${x.resultado || ''}${x.registradoPor ? ' · ' + x.registradoPor : ''}`, valor: null });
  return ev.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
}
