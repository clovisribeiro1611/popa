// Gráficos SVG feitos à mão. Todos devolvem HTML; `bindCharts(root)` liga os tooltips (tocar/arrastar).

import { esc } from './ui.js';

const W = 340; // largura lógica do viewBox; o SVG escala para a largura do cartão

/** Escala "agradável" para o eixo: devolve [max, passo]. */
function niceScale(max, ticks = 4) {
  if (max <= 0) return [1, 1];
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  return [Math.ceil(max / step) * step, step];
}

/** Valor curto para eixos: 1 250 000 → "1,3 M"; 12 500 → "12,5 mil". Recebe centavos. */
export function shortMoney(cents) {
  const v = Math.abs(cents) / 100;
  const sign = cents < 0 ? '−' : '';
  if (v >= 1e6) return sign + (v / 1e6).toLocaleString('pt-PT', { maximumFractionDigits: 1 }) + ' M';
  if (v >= 1e3) return sign + (v / 1e3).toLocaleString('pt-PT', { maximumFractionDigits: 1 }) + ' mil';
  return sign + Math.round(v).toString();
}

/** Retângulo com cantos superiores arredondados (raio 4) apoiado na linha de base. */
function columnPath(x, y, w, h, r = 4) {
  if (h <= 0) return '';
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * Barra horizontal empilhada (parte do todo). segments: [{ label, value, color }].
 * Separação de 2px entre segmentos; extremos arredondados.
 */
export function stackedBar(segments, fmt) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (!total) return '';
  const H = 18, gap = 2;
  let x = 0;
  const usable = W - gap * (segments.length - 1);
  const rects = segments.map((s, i) => {
    const w = Math.max(1, (s.value / total) * usable);
    const r = `<rect x="${x.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${H}" rx="4" fill="${esc(s.color)}"
      data-tip="${esc(s.label)}: ${esc(fmt(s.value))} (${Math.round((s.value / total) * 100)}%)"/>`;
    x += w + (i < segments.length - 1 ? gap : 0);
    return r;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Distribuição do gasto por categoria">${rects}</svg>`;
}

/**
 * Linha acumulada: série atual (destaque) vs. anterior (cinzento tracejado).
 * cur/prev: arrays de valores acumulados por dia (centavos); `curDays` = dias já decorridos.
 */
export function cumulativeLine({ cur, prev, labels, curLabel, prevLabel, fmt }) {
  const H = 150, padL = 44, padR = 8, padT = 10, padB = 22;
  const n = Math.max(cur.length, prev.length, 2);
  const [max, step] = niceScale(Math.max(...cur, ...prev, 1));
  const x = (i) => padL + (i / (n - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - v / max) * (H - padT - padB);
  const path = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  let grid = '';
  for (let v = 0; v <= max + 1e-9; v += step) {
    grid += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/>
      <text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${shortMoney(v)}</text>`;
  }
  const ticks = [0, Math.floor((n - 1) / 2), n - 1].map((i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(labels[i] ?? '')}</text>`).join('');
  const last = cur.length - 1;
  const data = JSON.stringify({ cur, prev, labels, n, padL, padR, W, curLabel, prevLabel });
  return `<div class="legend-inline"><span><i style="background:var(--primary)"></i>${esc(curLabel)}</span>
      <span><i style="background:var(--muted)"></i>${esc(prevLabel)}</span></div>
    <svg class="chart line-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gasto acumulado: ${esc(curLabel)} ${esc(fmt(cur[last] || 0))}, ${esc(prevLabel)} ${esc(fmt(prev[prev.length - 1] || 0))}"
      data-line='${esc(data)}'>
      ${grid}${ticks}
      <path d="${path(prev)}" fill="none" stroke="var(--muted)" stroke-width="2" stroke-dasharray="4 4" stroke-linejoin="round"/>
      ${cur.length ? `<path d="${path(cur)}" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="${x(last)}" cy="${y(cur[last])}" r="4" fill="var(--primary)" stroke="var(--surface)" stroke-width="2"/>` : ''}
      <g class="crosshair" visibility="hidden"><line y1="${padT}" y2="${H - padB}" stroke="var(--muted)" stroke-width="1"/></g>
      <rect x="${padL}" y="0" width="${W - padL - padR}" height="${H}" fill="transparent" class="hit"/>
    </svg>`;
}

/** Colunas agrupadas (receitas vs despesas) por mês. items: [{ label, a, b }]. */
export function groupedColumns(items, { aLabel, bLabel, aColor, bColor, fmt }) {
  const H = 160, padL = 44, padR = 4, padT = 10, padB = 22;
  const [max, step] = niceScale(Math.max(1, ...items.flatMap((d) => [d.a, d.b])));
  const y = (v) => padT + (1 - v / max) * (H - padT - padB);
  const slot = (W - padL - padR) / items.length;
  const bw = Math.min(16, (slot - 12) / 2);
  let grid = '';
  for (let v = 0; v <= max + 1e-9; v += step) {
    grid += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/>
      <text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${shortMoney(v)}</text>`;
  }
  const bars = items.map((d, i) => {
    const cx = padL + slot * i + slot / 2;
    const tip = `${d.label} — ${aLabel}: ${fmt(d.a)} · ${bLabel}: ${fmt(d.b)} · Saldo: ${fmt(d.a - d.b)}`;
    return `<g>
      <path d="${columnPath(cx - bw - 1, y(d.a), bw, y(0) - y(d.a))}" fill="${aColor}"/>
      <path d="${columnPath(cx + 1, y(d.b), bw, y(0) - y(d.b))}" fill="${bColor}"/>
      <text x="${cx}" y="${H - 6}" text-anchor="middle">${esc(d.label)}</text>
      <rect x="${cx - slot / 2}" y="0" width="${slot}" height="${H}" fill="transparent" data-tip="${esc(tip)}"/>
    </g>`;
  }).join('');
  return `<div class="legend-inline"><span><i style="background:${aColor}"></i>${esc(aLabel)}</span>
      <span><i style="background:${bColor}"></i>${esc(bLabel)}</span></div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Receitas e despesas dos últimos ${items.length} meses">${grid}${bars}</svg>`;
}

// ---------- Tooltips ----------

let tipEl;
function showTip(text, clientX, clientY) {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'chart-tip';
    document.body.appendChild(tipEl);
  }
  tipEl.innerHTML = text;
  tipEl.style.display = 'block';
  const r = tipEl.getBoundingClientRect();
  const left = Math.min(window.innerWidth - r.width - 8, Math.max(8, clientX - r.width / 2));
  const top = clientY - r.height - 14 < 60 ? clientY + 18 : clientY - r.height - 14;
  tipEl.style.left = `${left}px`;
  tipEl.style.top = `${top}px`;
}
export function hideTip() { if (tipEl) tipEl.style.display = 'none'; }

/** Liga tooltips: elementos com data-tip (toque) e gráficos de linha (arrastar = cursor). */
export function bindCharts(root, fmt) {
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tip]');
    if (t) { e.stopPropagation(); showTip(esc(t.dataset.tip), e.clientX, e.clientY); } else hideTip();
  });
  root.querySelectorAll('svg[data-line]').forEach((svg) => {
    const d = JSON.parse(svg.dataset.line);
    const cross = svg.querySelector('.crosshair');
    const move = (e) => {
      const box = svg.getBoundingClientRect();
      const sx = ((e.clientX - box.left) / box.width) * d.W;
      const i = Math.max(0, Math.min(d.n - 1, Math.round(((sx - d.padL) / (d.W - d.padL - d.padR)) * (d.n - 1))));
      const px = d.padL + (i / (d.n - 1)) * (d.W - d.padL - d.padR);
      cross.setAttribute('visibility', 'visible');
      cross.setAttribute('transform', `translate(${px},0)`);
      const lines = [`<b>Dia ${esc(d.labels[i] ?? '')}</b>`];
      if (i < d.cur.length) lines.push(`${esc(d.curLabel)}: ${esc(fmt(d.cur[i]))}`);
      if (i < d.prev.length) lines.push(`${esc(d.prevLabel)}: ${esc(fmt(d.prev[i]))}`);
      showTip(lines.join('<br>'), e.clientX, box.top + 10);
    };
    const end = () => { cross.setAttribute('visibility', 'hidden'); hideTip(); };
    svg.addEventListener('pointerdown', (e) => { move(e); svg.setPointerCapture(e.pointerId); });
    svg.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') move(e); });
    svg.addEventListener('pointerup', () => setTimeout(end, 1500));
    svg.addEventListener('pointercancel', end);
  });
}

/**
 * Barras por mês (uma só série). `highlight` destaca os meses pesados com a cor de destaque;
 * os restantes ficam na versão suave da mesma cor (ênfase, não categorias).
 */
export function monthBars(items) {
  const H = 130, padL = 40, padR = 4, padT = 8, padB = 20;
  const [max, step] = niceScale(Math.max(1, ...items.map((d) => d.value)));
  const y = (v) => padT + (1 - v / max) * (H - padT - padB);
  const slot = (W - padL - padR) / items.length;
  const bw = Math.min(18, slot - 6);
  let grid = '';
  for (let v = 0; v <= max + 1e-9; v += step) {
    grid += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${shortMoney(v)}</text>`;
  }
  const bars = items.map((d, i) => {
    const cx = padL + slot * i + slot / 2;
    return `<g><path d="${columnPath(cx - bw / 2, y(d.value), bw, y(0) - y(d.value))}" fill="${d.highlight ? 'var(--primary)' : 'color-mix(in srgb, var(--primary) 40%, var(--surface))'}"/>
      <text x="${cx}" y="${H - 5}" text-anchor="middle">${esc(d.label)}</text>
      <rect x="${cx - slot / 2}" y="0" width="${slot}" height="${H}" fill="transparent" data-tip="${esc(d.tip || '')}"/></g>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Custos sazonais por mês">${grid}${bars}</svg>`;
}
