// Gráficos em SVG simples, coloridos pelos tokens do CSS.
import { mins, fmtDate, dur, esc, hm, avg } from './util.js';

export function marker(k, x, y) {
  if (k === 'f') return `<circle cx="${x}" cy="${y}" r="5" fill="var(--feed)" stroke="var(--surface)" stroke-width="2"/>`;
  if (k === 'h') return `<rect x="${x - 5}" y="${y - 5}" width="10" height="10" rx="2" fill="var(--help)" stroke="var(--surface)" stroke-width="2"/>`;
  if (k === 's') return `<path d="M${x} ${y - 6.5} L${x + 6} ${y + 4.5} L${x - 6} ${y + 4.5} Z" fill="var(--self)" stroke="var(--surface)" stroke-width="2" stroke-linejoin="round"/>`;
  return `<circle cx="${x}" cy="${y}" r="4.5" fill="var(--surface)" stroke="var(--ink2)" stroke-width="2"/>`;
}
export const kindOf = w => { const c = w.codes || []; return c.includes('M') ? 'f' : c.includes('S') ? 's' : c.includes('A') ? 'a' : 'h'; };

// Linha do tempo das noites: 18h às 8h.
export function nightTimeline(list) {
  const W = 640, L = 46, R = 44, top = 24, rowH = 20;
  const H = top + list.length * rowH + 6;
  const span = 14 * 60;
  const sx = m => L + Math.max(0, Math.min(span, m)) / span * (W - L - R);
  let s = '';
  for (let h = 0; h <= 14; h += 2) {
    const x = sx(h * 60);
    s += `<line class="gl" x1="${x}" x2="${x}" y1="${top - 4}" y2="${H - 4}"/><text class="tick" x="${x}" y="${top - 9}" text-anchor="middle">${(18 + h) % 24}h</text>`;
  }
  s += `<text class="tick" x="${W - 4}" y="${top - 9}" text-anchor="end">mam.</text>`;
  list.forEach((n, i) => {
    const y = top + i * rowH, cy = y + rowH / 2, base = n.date + 'T18:00';
    const rel = t => mins(base, t);
    s += `<text class="tick" x="${L - 8}" y="${cy + 4}" text-anchor="end">${fmtDate(n.date)}</text>`;
    const a = sx(rel(n.s.t)), z = n.s.end ? sx(rel(n.s.end)) : sx(span);
    s += `<rect x="${a}" y="${cy - 5}" width="${Math.max(2, z - a)}" height="10" rx="3" fill="${n.s.end ? 'var(--wash)' : 'url(#fade)'}"/>`;
    s += `<line x1="${a}" x2="${a}" y1="${cy - 7}" y2="${cy + 7}" stroke="var(--ink)" stroke-width="2" stroke-linecap="round"/>`;
    n.wakes.forEach(w => { if (w.end) { const p = sx(rel(w.t)), q = sx(rel(w.end)); s += `<rect x="${p}" y="${cy - 6}" width="${Math.max(2, q - p)}" height="12" fill="var(--surface)"/>`; } });
    n.wakes.forEach(w => { s += marker(kindOf(w), sx(rel(w.t)), cy); });
    s += `<text class="tick strong" x="${W - 4}" y="${cy + 4}" text-anchor="end">${n.partial ? '…' : n.feeds}</text>`;
  });
  const defs = `<defs><linearGradient id="fade" x1="0" x2="1"><stop offset=".6" style="stop-color:var(--accent);stop-opacity:.2"/><stop offset="1" style="stop-color:var(--accent);stop-opacity:0"/></linearGradient></defs>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Linha do tempo das noites">${defs}${s}</svg>`;
}

// Barras simples (uma série), com linha de média.
export function bars(items, { max, step, unit = '', fmt = v => v, color = 'var(--accent)', avgLabel = true } = {}) {
  const W = 640, H = 210, L = 34, B = 26, top = 18, R = 8;
  const vals = items.map(i => i.v).filter(v => v != null);
  max = max || Math.max(1, ...vals) * 1.15;
  step = step || Math.max(1, Math.round(max / 4));
  const band = (W - L - R) / Math.max(1, items.length), bw = Math.min(22, band * 0.62);
  const sy = v => H - B - (v / max) * (H - B - top);
  let s = '';
  for (let v = 0; v <= max; v += step) s += `<line class="${v === 0 ? 'ax' : 'gl'}" x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}"/><text class="tick" x="${L - 6}" y="${sy(v) + 4}" text-anchor="end">${v}${unit}</text>`;
  const every = Math.ceil(items.length / 10);
  items.forEach((it, i) => {
    const cx = L + band * i + band / 2;
    if (i % every === 0 || i === items.length - 1) s += `<text class="tick" x="${cx}" y="${H - B + 15}" text-anchor="middle">${esc(it.label)}</text>`;
    if (it.v == null) return;
    const y = sy(it.v), x = cx - bw / 2, r = Math.min(4, bw / 2, sy(0) - y);
    s += `<path d="M${x} ${sy(0)} V${y + r} Q${x} ${y} ${x + r} ${y} H${x + bw - r} Q${x + bw} ${y} ${x + bw} ${y + r} V${sy(0)} Z" fill="${it.color || color}"><title>${esc(it.label)}: ${esc(fmt(it.v))}</title></path>`;
  });
  if (avgLabel && vals.length) {
    const a = avg(vals), y = sy(a);
    s += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="var(--ink2)" stroke-width="1.5"/><text class="tick strong" x="${W - R}" y="${y - 5}" text-anchor="end" paint-order="stroke" stroke="var(--surface)" stroke-width="4">média ${esc(fmt(a))}</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${s}</svg>`;
}

// Barras empilhadas: despertares com mamada (embaixo) e sem mamada (em cima).
export function stacked(items) {
  const W = 640, H = 200, L = 34, B = 26, top = 14, R = 8;
  const max = Math.max(4, ...items.map(i => i.a + i.b));
  const band = (W - L - R) / Math.max(1, items.length), bw = Math.min(22, band * 0.62);
  const sy = v => H - B - (v / max) * (H - B - top);
  let s = '';
  for (let v = 0; v <= max; v++) s += `<line class="${v === 0 ? 'ax' : 'gl'}" x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}"/><text class="tick" x="${L - 6}" y="${sy(v) + 4}" text-anchor="end">${v}</text>`;
  const every = Math.ceil(items.length / 10);
  items.forEach((it, i) => {
    const cx = L + band * i + band / 2, x = cx - bw / 2;
    if (i % every === 0 || i === items.length - 1) s += `<text class="tick" x="${cx}" y="${H - B + 15}" text-anchor="middle">${esc(it.label)}</text>`;
    const y0 = sy(0), ya = sy(it.a), yb = sy(it.a + it.b);
    if (it.a + it.b === 0) return;
    const r = Math.min(4, bw / 2);
    const round = (yt, fill) => `<path d="M${x} ${y0} V${yt + r} Q${x} ${yt} ${x + r} ${yt} H${x + bw - r} Q${x + bw} ${yt} ${x + bw} ${yt + r} V${y0} Z" fill="${fill}"/>`;
    s += `<g><title>${esc(it.label)}: ${it.a} com mamada, ${it.b} sem</title>`;
    if (it.b) {
      s += round(yb, 'var(--help)');
      if (it.a) s += `<rect x="${x}" y="${ya}" width="${bw}" height="${y0 - ya}" fill="var(--feed)"/><line x1="${x}" x2="${x + bw}" y1="${ya}" y2="${ya}" stroke="var(--surface)" stroke-width="2"/>`;
    } else s += round(ya, 'var(--feed)');
    s += `</g>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${s}</svg>`;
}

// Dia: sonecas como blocos, das 6h às 19h30.
export function dayStrip(d) {
  const W = 640, H = 34, L = 6, R = 6, x0 = 6 * 60, x1 = 19.5 * 60;
  const sx = m => L + (Math.max(x0, Math.min(x1, m)) - x0) / (x1 - x0) * (W - L - R);
  const mm = t => +t.slice(11, 13) * 60 + +t.slice(14, 16);
  let s = `<rect x="${L}" y="12" width="${W - L - R}" height="10" rx="5" fill="var(--track)"/>`;
  if (d.up) s += `<rect x="${sx(x0)}" y="12" width="${sx(mm(d.up)) - sx(x0)}" height="10" rx="5" fill="var(--wash)"/>`;
  if (d.bed) s += `<rect x="${sx(mm(d.bed.t))}" y="12" width="${sx(x1) - sx(mm(d.bed.t))}" height="10" rx="5" fill="var(--wash)"/>`;
  d.naps.forEach(n => { const a = sx(mm(n.t)), z = n.end ? sx(mm(n.end)) : a + 4; s += `<rect x="${a}" y="9" width="${Math.max(3, z - a)}" height="16" rx="4" fill="var(--accent)"/>`; });
  for (const h of [9, 12, 15, 18]) s += `<text class="tick" x="${sx(h * 60)}" y="8" text-anchor="middle" font-size="9">${h}h</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Sonecas do dia">${s}</svg>`;
}
