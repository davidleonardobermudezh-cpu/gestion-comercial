// PDF (cotizaciones y reportes) y Excel — se generan en el propio dispositivo, sin costo.
import { loadScript, money, fdate, fdateLong, fdateLongDe, today, slug } from './util.js';
import { cfg, totales, titleCase } from './domain.js';
import { store } from './store.js';

const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const AUTOTABLE = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
const XLSXLIB = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

export async function ensurePdf() { await loadScript(JSPDF); await loadScript(AUTOTABLE); return window.jspdf.jsPDF; }
export async function ensureXlsx() { await loadScript(XLSXLIB); return window.XLSX; }

const imgCache = new Map();
export async function imageData(src) {
  if (!src) return null;
  if (src.startsWith('data:')) return src;
  if (imgCache.has(src)) return imgCache.get(src);
  try {
    const r = await fetch(src); if (!r.ok) return null;
    const b = await r.blob();
    const d = await new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(b); });
    imgCache.set(src, d); return d;
  } catch { return null; }
}
function imgSize(data) {
  return new Promise(res => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res({ w: 1, h: 1 }); i.src = data; });
}
const fmt = d => d.startsWith('data:image/png') ? 'PNG' : 'JPEG';

/* ======================= COTIZACIÓN (formato del negocio) ======================= */
export async function cotizacionPdf(q) {
  const jsPDF = await ensurePdf();
  const neg = cfg('negocio');
  const textos = cfg('cotizacionTextos');
  const tipos = cfg('tiposCotizacion');
  const tipo = tipos.find(t => t.id === q.tipo) || tipos[0];
  const cli = q.cliente || store.get('clientes', q.clienteId) || {};
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 22, CW = W - 2 * M, BOTTOM = 280;
  const BLUE = [31, 78, 121], LIGHT = [46, 117, 182], INK = [25, 25, 25], MUTED = [90, 90, 90];
  let y = 20;
  const ensure = h => { if (y + h > BOTTOM) { doc.addPage(); y = 20; } };
  const para = (t, { size = 9.5, bold = false, color = INK, gap = 1.6, x = M, w = CW, align = 'left' } = {}) => {
    if (!t) return;
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color);
    const lines = doc.splitTextToSize(String(t), w);
    const lh = size * 0.42;
    for (const ln of lines) { ensure(lh); doc.text(ln, align === 'justify' ? x : x, y, { align: align === 'justify' ? 'left' : align, maxWidth: w }); y += lh; }
    y += gap;
  };
  const check = (x, yy) => { doc.setDrawColor(...INK); doc.setLineWidth(0.35); doc.line(x, yy - 1.2, x + 0.9, yy - 0.2); doc.line(x + 0.9, yy - 0.2, x + 2.6, yy - 2.6); };

  // Encabezado
  const logo = await imageData(store.cfg('logo', null) || 'img/logo.jpg');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(...BLUE); doc.text(neg.nombre, M, y + 2);
  doc.setFontSize(11); doc.setTextColor(...LIGHT); doc.text(neg.profesion, M, y + 7.5); doc.text('TELF ' + neg.telefono, M, y + 13);
  if (logo) { const s = await imgSize(logo); const lw = 38, lh = lw * s.h / s.w; doc.addImage(logo, fmt(logo), W - M - lw, y - 6, lw, lh); }
  y += 36;
  para(`${neg.ciudad}, ${fdateLong(q.fecha)}`, { gap: 7 });
  para(cli.tratamiento || 'Señor(a)', { gap: 0.4 });
  para((cli.nombre || '').toUpperCase(), { gap: 0.4 });
  if (cli.identificacion) para(`${cli.tipoId || 'C.C.'} ${cli.identificacion}`.replace(/^CC /, 'C.C. '), { gap: 0.4 });
  para(cli.ciudad && cli.ciudad !== neg.ciudad ? cli.ciudad : 'Ciudad', { gap: 6 });
  para('Asunto: ' + (q.asunto || textos.asunto), { bold: true, gap: 6 });
  para(textos.intro1, { gap: 3 }); para(textos.intro2, { gap: 4 });
  if (q.dx) { para('DX AUDIOLOGICO:', { bold: true, gap: 0.8 }); para(q.dx, { gap: 4 }); }
  para(textos.antesTabla, { gap: 4 });

  // Tabla del dispositivo
  const t = totales(q.items || [], q.descuentoGeneral);
  const principal = (q.items || [])[0] || {};
  const otros = t.lines.slice(1);
  const labelW = 58, contW = CW - labelW, pad = 3;
  const row = async (label, drawContent, measure) => {
    const h = Math.max(14, measure() + 2 * pad);
    ensure(h);
    doc.setDrawColor(0); doc.setLineWidth(0.3); doc.rect(M, y, labelW, h); doc.rect(M + labelW, y, contW, h);
    doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(9); doc.setTextColor(...INK);
    doc.text(label, M + labelW / 2, y + h / 2 + 1.2, { align: 'center' });
    const y0 = y; y = y + pad + 3; await drawContent(); y = y0 + h;
  };
  const txtH = (t, size, w = contW - 2 * pad) => { doc.setFontSize(size); return doc.splitTextToSize(String(t || ''), w).length * size * 0.42; };
  const cx = M + labelW + pad, cw = contW - 2 * pad;
  const writeIn = (t, { size = 9, bold = false, align = 'left', gap = 1 } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...INK);
    for (const ln of doc.splitTextToSize(String(t || ''), cw)) { doc.text(ln, align === 'center' ? cx + cw / 2 : cx, y, { align }); y += size * 0.42; }
    y += gap;
  };
  const dispositivo = principal.descripcion || tipo.dispositivo;
  await row('DISPOSITIVO', () => writeIn(dispositivo, { bold: true, align: 'center' }), () => txtH(dispositivo, 9));
  const precioLines = [`CANTIDAD: ${principal.cantidad || 1}`];
  if (otros.length || t.descuentos || t.iva) {
    precioLines.push(`VALOR UNITARIO: ${money(principal.precio)}`);
    if (otros.length) precioLines.push(`SUBTOTAL: ${money(t.subtotal)}`);
    if (t.descuentos) precioLines.push(`DESCUENTO: -${money(t.descuentos)}`);
    if (t.iva) precioLines.push(`IVA: ${money(t.iva)}`);
  }
  await row('PRECIO', () => { writeIn(precioLines.join('\n'), { align: 'center', gap: 2 }); writeIn(`VALOR TOTAL: ${money(t.total)}`, { bold: true, align: 'center' }); }, () => (precioLines.length + 1) * 3.8 + 3);
  const incluye = q.incluye ?? tipo.incluye;
  const prodImg = await imageData(tipo.imagenData || tipo.imagen);
  let imgDim = null; if (prodImg) { const s = await imgSize(prodImg); const iw = 38; imgDim = { w: iw, h: iw * s.h / s.w }; }
  const descTxt = q.descripcion ?? tipo.descripcion;
  await row('DESCRIPCION', () => {
    writeIn(descTxt, { gap: 3 });
    if (incluye?.length) {
      writeIn('Incluye:', { gap: 1 });
      for (const it of incluye) { check(cx + 1, y); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.6); const ls = doc.splitTextToSize(it, cw - 6); for (const l of ls) { doc.text(l, cx + 5, y); y += 3.7; } y += 0.6; }
    }
    if (imgDim) { y += 2; doc.addImage(prodImg, fmt(prodImg), cx + (cw - imgDim.w) / 2, y, imgDim.w, imgDim.h); y += imgDim.h; }
  }, () => txtH(descTxt, 9) + 4 + (incluye?.length ? 5 + incluye.reduce((s, it) => s + txtH(it, 8.6, cw - 6) + 0.6, 0) : 0) + (imgDim ? imgDim.h + 3 : 0));
  if (otros.length) {
    const lineas = otros.map(l => `${l.cantidad} × ${l.descripcion} — ${money(l.total)}`);
    await row('OTROS PRODUCTOS\nY SERVICIOS', () => { for (const l of lineas) writeIn(l, { gap: 1.2 }); }, () => lineas.reduce((s, l) => s + txtH(l, 9) + 1.2, 0));
  }
  const kit = q.kit ?? tipo.kit;
  const garantia = q.garantia ?? tipo.garantia;
  await row('CONDICIONES Y GARANTÍAS', () => {
    if (kit?.length) { writeIn('KIT DE ENTREGA:', { gap: 2 }); for (const it of kit) { check(cx + 1, y); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.6); const ls = doc.splitTextToSize(it, cw - 6); for (const l of ls) { doc.text(l, cx + 5, y); y += 3.7; } y += 0.4; } y += 2; }
    if (garantia) { writeIn('GARANTIA DEL AUDIFONO:', { bold: true, gap: 0.6 }); writeIn(garantia, { gap: 2.5 }); }
    if (tipo.garantiaNota) writeIn(tipo.garantiaNota, { size: 8.4 });
  }, () => (kit?.length ? 6 + kit.reduce((s, it) => s + txtH(it, 8.6, cw - 6) + 0.4, 0) + 2 : 0) + (garantia ? 4 + txtH(garantia, 9) + 2.5 : 0) + (tipo.garantiaNota ? 4 : 0));
  y += 7;

  // Condiciones comerciales
  para('CONDICIONES COMERCIALES', { bold: true, gap: 4 });
  const kv = (k, v) => {
    if (!v) return;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); const kw = doc.getTextWidth(k + ' ') + 1;
    const lines = String(v).split('\n').flatMap(l => doc.splitTextToSize(l, CW - kw));
    ensure(lines.length * 4.2);
    doc.setTextColor(...INK); doc.text(k, M, y); doc.setFont('helvetica', 'normal');
    lines.forEach((l, i) => doc.text(l, M + kw, y + i * 4.2)); y += lines.length * 4.2 + 3.5;
  };
  kv('FORMA DE PAGO:', q.formaPago || textos.formaPago);
  kv('TIEMPO DE ENTREGA:', q.tiempoEntrega || textos.tiempoEntrega);
  kv('VIGENCIA DE OFERTA:', q.vence ? `Hasta el ${fdateLongDe(q.vence)}.` : '');
  para('MEDIOS DE PAGO:', { bold: true, gap: 2.5 });
  for (const m of cfg('mediosPagoTexto')) { ensure(5); check(M + 4, y); para(m, { x: M + 9, w: CW - 9, gap: 1.6 }); }
  y += 2;
  if (q.observaciones) { para('OBSERVACIONES:', { bold: true, gap: 1 }); para(q.observaciones, { gap: 4 }); }
  para(textos.cierre, { gap: 4 }); para('Cordialmente,', { gap: 7 }); para('Atentamente,', { gap: 2 });
  const firma = await imageData(store.cfg('firma', null));
  ensure(34);
  if (firma) { const s = await imgSize(firma); const fw = 30; doc.addImage(firma, fmt(firma), M, y, fw, fw * s.h / s.w); y += fw * s.h / s.w + 2; } else y += 14;
  para(neg.firmaNombre || neg.nombre, { bold: true, gap: 0.4 }); para(neg.registro, { bold: true, gap: 0.4 }); para(neg.profesion, { bold: true, gap: 0 });

  // Pie de página
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    doc.text(`Cotización ${q.numero || ''} · ${fdate(q.fecha)}`, M, 290); doc.text(`Página ${i} de ${n}`, W - M, 290, { align: 'right' });
  }
  return doc.output('blob');
}
export function nombreCotizacion(q) {
  const c = q.cliente || store.get('clientes', q.clienteId) || {};
  return `Cotizacion_${q.numero || 'borrador'}_${slug(c.nombre || 'cliente')}.pdf`;
}

/* ============================ REPORTES PDF ============================ */
// columns: [{key, label, money?, date?, align?}]
export async function reportePdf({ titulo, subtitulo = '', columnas, filas, totales: tot = null, orientacion = 'portrait', resumen = [] }) {
  const jsPDF = await ensurePdf();
  const neg = cfg('negocio');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: orientacion });
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(23, 58, 99); doc.rect(0, 0, W, 24, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text(titulo, 14, 11);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text(`${titleCase(neg.nombre)} · ${subtitulo || 'Generado el ' + fdate(today())}`, 14, 18);
  let y = 32;
  if (resumen.length) {
    doc.setTextColor(30); doc.setFontSize(9);
    const colW = (W - 28) / Math.min(4, resumen.length);
    resumen.forEach((r, i) => {
      const x = 14 + (i % 4) * colW, yy = y + Math.floor(i / 4) * 13;
      doc.setFont('helvetica', 'normal'); doc.setTextColor(100); doc.text(r[0], x, yy);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(20); doc.setFontSize(11); doc.text(String(r[1]), x, yy + 5.5); doc.setFontSize(9);
    });
    y += Math.ceil(resumen.length / 4) * 13 + 3;
  }
  const fmtCell = (c, v) => v == null || v === '' ? '' : c.money ? money(v) : c.date ? fdate(v) : String(v);
  doc.autoTable({
    startY: y, head: [columnas.map(c => c.label)],
    body: filas.map(f => columnas.map(c => fmtCell(c, f[c.key]))),
    foot: tot ? [columnas.map(c => tot[c.key] != null ? fmtCell(c, tot[c.key]) : '')] : undefined,
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.8, overflow: 'linebreak' },
    headStyles: { fillColor: [232, 238, 247], textColor: 20, fontStyle: 'bold' },
    footStyles: { fillColor: [245, 247, 250], textColor: 20, fontStyle: 'bold' },
    columnStyles: Object.fromEntries(columnas.map((c, i) => [i, { halign: c.money || c.align === 'right' ? 'right' : 'left' }])),
    margin: { left: 14, right: 14 },
    didDrawPage: () => {
      const n = doc.internal.getNumberOfPages();
      doc.setFontSize(7.5); doc.setTextColor(120);
      doc.text(`Página ${n}`, W - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
    }
  });
  return doc.output('blob');
}

/* ================================ EXCEL ================================ */
// hojas: [{nombre, columnas:[{key,label,money?,date?}], filas}]
export async function excel(hojas) {
  const XLSX = await ensureXlsx();
  const wb = XLSX.utils.book_new();
  for (const h0 of hojas) {
    const h = h0.columnas.length ? h0 : { ...h0, columnas: [{ key: '_', label: 'Sin registros' }], filas: [] };
    const aoa = [h.columnas.map(c => c.label)];
    for (const f of h.filas) aoa.push(h.columnas.map(c => {
      const v = f[c.key];
      if (v == null || v === '') return '';
      if (c.date) { const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)) : v; }
      if (c.money || c.num) return Number(v) || 0;
      if (typeof v === 'object') return JSON.stringify(v);
      return v;
    }));
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true, dateNF: 'dd/mm/yyyy' });
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    h.columnas.forEach((c, ci) => {
      for (let r = 1; r <= range.e.r; r++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c: ci })]; if (!cell) continue;
        if (c.date && cell.t === 'd') cell.z = 'dd/mm/yyyy';
        if (c.money) cell.z = '"$"#,##0';
      }
    });
    ws['!cols'] = h.columnas.map(c => ({ wch: Math.min(48, Math.max(c.label.length + 2, c.money ? 14 : c.date ? 11 : 12, ...h.filas.slice(0, 200).map(f => String(f[c.key] ?? '').length + 1))) }));
    if (ws['!ref'] && h.filas.length) ws['!autofilter'] = { ref: ws['!ref'] };
    XLSX.utils.book_append_sheet(wb, ws, h.nombre.slice(0, 31));
  }
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellDates: true });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// Lectura de Excel (importación)
export async function leerExcel(file) {
  const XLSX = await ensureXlsx();
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  return Object.fromEntries(wb.SheetNames.map(n => [n, XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '' })]));
}
