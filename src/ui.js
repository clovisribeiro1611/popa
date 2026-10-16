// Helpers de interface partilhados pelas vistas: escape de HTML, formatação, folhas inferiores,
// toasts, diálogos de confirmação e gestos.

import { store } from './store.js';
import { formatMoney, todayISO, periodFor, shiftPeriod, parseMoney, centsToInput } from './domain.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const settings = () => store.get().settings;
export const money = (cents, opts) => formatMoney(cents, settings(), opts);
export const today = () => todayISO();

/** Estado de navegação partilhado (mês selecionado no resumo e nos movimentos). */
export const appState = { periodDate: null, persistencia: null, avisoPersistenciaFechado: false };
/** Dia em que começa cada ciclo: o dia do salário (perfil) ou, se não estiver definido, o 1.º dia do mês orçamental. */
export const cycleDay = () => store.get().household?.diaPagamento || settings().primeiroDiaDoMes;
export const currentPeriod = () => periodFor(appState.periodDate || today(), cycleDay());

export const accountName = (id) => store.get().accounts.find((a) => a.id === id)?.nome ?? '—';
export const category = (id) => store.get().categories.find((c) => c.id === id);

export const TIPOS_CONTA = { numerario: 'Numerário', conta: 'Conta bancária', poupanca: 'Poupança' };

export function icon(name) {
  const paths = {
    chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    plus: 'M12 5v14M5 12h14',
    wallet: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm0 0V5a2 2 0 0 1 2-2h11v4M16 13.5h.01',
    more: 'M4 6h16M4 12h16M4 18h16',
    left: 'M15 18l-6-6 6-6',
    right: 'M9 18l6-6-6-6',
    search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35',
    close: 'M18 6 6 18M6 6l12 12',
    trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
    repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
    target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-4a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm0-4a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
    tag: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8ZM7 7h.01',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2.1-1.6-2-3.4-2.5 1a7.3 7.3 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.3 7.3 0 0 0-2 1.2l-2.5-1-2 3.4 2.1 1.6a7.4 7.4 0 0 0 0 2.4l-2.1 1.6 2 3.4 2.5-1a7.3 7.3 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.3 7.3 0 0 0 2-1.2l2.5 1 2-3.4-2.1-1.6c.1-.4.1-.8.1-1.2Z',
    swap: 'M7 16V4M3 8l4-4 4 4M17 8v12M21 16l-4 4-4-4',
    lock: 'M5 11h14v10H5V11Zm3 0V7a4 4 0 0 1 8 0v4',
    finger: 'M12 11v4M8 9a4 4 0 0 1 8 0v5a8 8 0 0 1-1 4M5 12a7 7 0 0 1 14-2M12 21a6 6 0 0 1-4-5.5V13',
    database: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
    backspace: 'M21 5H8l-6 7 6 7h13V5ZM17 9l-6 6M11 9l6 6',
    user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    home: 'M3 11l9-8 9 8M5 9.5V21h5v-6h4v6h5V9.5',
    plan: 'M8 3v4M16 3v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm3 9h3m2 0h3m-8 4h3',
    bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0',
    alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
    debt: 'M2 7h20v10H2zM6 12h.01M18 12h.01M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
    bolt: 'M13 2 3 14h9l-1 8 10-12h-9l1-8Z',
    sim: 'M3 3v18h18M7 14l4-4 4 4 5-5',
    check: 'M20 6 9 17l-5-5'
  };
  return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || ''}"/></svg>`;
}

/** Círculo colorido com o emoji da categoria. */
export function catBadge(c, size = '') {
  if (!c) return `<span class="badge ${size}" style="--c:#868E96">⇄</span>`;
  return `<span class="badge ${size}" style="--c:${esc(c.cor)}">${esc(c.icone || '•')}</span>`;
}

export function progressBar(pct, estado) {
  const w = Math.max(0, Math.min(100, Math.round(pct * 100)));
  return `<div class="progress ${estado || ''}"><span style="width:${w}%"></span></div>`;
}

// ---------- Pilha de camadas (para o botão "voltar" do Android) ----------

const layers = [];
/** Fecha a camada mais recente (folha/diálogo). Devolve true se fechou alguma. */
export function closeTopLayer() {
  const top = layers[layers.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

// ---------- Folha inferior ----------

/**
 * Abre uma folha inferior com `html`. Fecha ao tocar fora, ao arrastar para baixo ou com "voltar".
 * Devolve { el, close }.
 */
export function sheet(html, { onClose, className = '' } = {}) {
  $('.toast')?.remove();
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-backdrop"></div>
    <div class="sheet ${className}" role="dialog" aria-modal="true">
      <div class="sheet-handle"></div>
      <div class="sheet-body">${html}</div>
    </div>`;
  document.body.appendChild(wrap);
  const panel = $('.sheet', wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));

  let closed = false;
  const layer = {
    close() {
      if (closed) return;
      closed = true;
      layers.splice(layers.indexOf(layer), 1);
      wrap.classList.remove('open');
      document.activeElement?.blur?.();
      setTimeout(() => wrap.remove(), 250);
      onClose?.();
    }
  };
  layers.push(layer);
  $('.sheet-backdrop', wrap).addEventListener('click', layer.close);

  // Arrastar para baixo pela pega (ou pelo topo quando o conteúdo está no início) fecha a folha.
  let startY = null, dy = 0;
  panel.addEventListener('touchstart', (e) => {
    const body = $('.sheet-body', wrap);
    const onHandle = e.target.closest('.sheet-handle');
    if (onHandle || (body.scrollTop <= 0 && !e.target.closest('input,textarea,select,.chips,.no-drag'))) {
      startY = e.touches[0].clientY; dy = 0;
    }
  }, { passive: true });
  panel.addEventListener('touchmove', (e) => {
    if (startY == null) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    panel.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  panel.addEventListener('touchend', () => {
    if (startY == null) return;
    panel.style.transform = '';
    if (dy > 110) layer.close();
    startY = null;
  });

  return { el: panel, close: layer.close };
}

/** Diálogo de confirmação. Resolve true/false. */
export function confirmDialog(message, { ok = 'Confirmar', danger = false, cancel = 'Cancelar' } = {}) {
  return new Promise((resolve) => {
    let result = false;
    const s = sheet(`<p class="confirm-msg">${esc(message)}</p>
      <div class="row-btns">
        <button class="btn" data-r="0">${esc(cancel)}</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${esc(ok)}</button>
      </div>`, { onClose: () => resolve(result) });
    s.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      result = b.dataset.r === '1';
      s.close();
    });
  });
}

// ---------- Toast ----------

let toastTimer;
export function toast(message, { action, onAction, duration = 3500 } = {}) {
  $('.toast')?.remove();
  clearTimeout(toastTimer);
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button>${esc(action)}</button>` : ''}`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  const hide = () => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); };
  el.querySelector('button')?.addEventListener('click', () => { hide(); onAction?.(); });
  toastTimer = setTimeout(hide, duration);
}

// ---------- Gestos ----------

/**
 * Deslizar uma linha para a esquerda revela "Apagar"; passar o limiar chama onDelete.
 * Usa touch-action: pan-y para não interferir com o scroll vertical.
 */
export function swipeToDelete(row, onDelete) {
  let x0 = null, y0 = 0, dx = 0, horizontal = null;
  const content = $('.swipe-content', row);
  row.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; horizontal = null; }, { passive: true });
  row.addEventListener('touchmove', (e) => {
    if (x0 == null) return;
    const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
    if (horizontal == null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) horizontal = Math.abs(mx) > Math.abs(my);
    if (!horizontal) return;
    dx = Math.min(0, mx);
    content.style.transform = `translateX(${dx}px)`;
    row.classList.toggle('armed', dx < -row.offsetWidth * 0.35);
  }, { passive: true });
  row.addEventListener('touchend', () => {
    if (x0 == null) return;
    const armed = dx < -row.offsetWidth * 0.35;
    content.style.transition = 'transform .2s';
    content.style.transform = armed ? 'translateX(-100%)' : '';
    setTimeout(() => { content.style.transition = ''; if (armed) onDelete(); }, 200);
    row.classList.remove('armed');
    if (horizontal) row.dataset.swiped = '1';
    setTimeout(() => delete row.dataset.swiped, 50);
    x0 = null;
  });
}

/** Deslize horizontal numa área (ex.: mudar de mês). */
export function onHorizontalSwipe(el, { left, right }) {
  let x0 = null, y0 = 0;
  el.addEventListener('touchstart', (e) => {
    if (e.target.closest('.swipe-row, input, select, .chips')) { x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) left?.(); else right?.();
  }, { passive: true });
}

/** Cabeçalho com navegação de mês (◀ mês ▶). */
export function monthNav(period) {
  return `<div class="month-nav">
    <button class="icon-btn" data-month="-1" aria-label="Mês anterior">${icon('left')}</button>
    <button class="month-label" data-month="0">${esc(period.label)}</button>
    <button class="icon-btn" data-month="1" aria-label="Mês seguinte">${icon('right')}</button>
  </div>`;
}

/** Liga os botões de monthNav e o deslize horizontal; `rerender` é chamado após mudar de mês. */
export function bindMonthNav(root, rerender, swipeArea = root) {
  const shift = (n) => {
    appState.periodDate = n === 0 ? null : shiftPeriod(currentPeriod(), n, cycleDay()).start;
    rerender();
  };
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-month]');
    if (b) shift(Number(b.dataset.month));
  });
  onHorizontalSwipe(swipeArea, { left: () => shift(1), right: () => shift(-1) });
}

export function emptyState(text, actionHtml = '') {
  return `<div class="empty"><p>${esc(text)}</p>${actionHtml}</div>`;
}

/** Opções <option> a partir de uma lista. */
export function options(list, selected, { value = (x) => x.id, label = (x) => x.nome, empty } = {}) {
  const head = empty != null ? `<option value="">${esc(empty)}</option>` : '';
  return head + list.map((x) => `<option value="${esc(value(x))}" ${value(x) === selected ? 'selected' : ''}>${esc(label(x))}</option>`).join('');
}

// ---------- Campos de formulário ----------

/** Campo de dinheiro (centavos). `value` null = vazio. */
export function moneyField(id, label, value, { placeholder = '', hint = '' } = {}) {
  return `<label class="field"><span>${esc(label)}${hint ? ` <i class="muted">${esc(hint)}</i>` : ''}</span>
    <input id="${id}" inputmode="decimal" autocomplete="off" placeholder="${esc(placeholder)}" value="${esc(value == null ? '' : centsToInput(value))}"></label>`;
}

/** Campo numérico simples. */
export function numberField(id, label, value, { min = 0, max = 999, step = 1, suffix = '', placeholder = '' } = {}) {
  return `<label class="field"><span>${esc(label)}${suffix ? ` (${esc(suffix)})` : ''}</span>
    <input id="${id}" type="number" inputmode="decimal" min="${min}" max="${max}" step="${step}" placeholder="${esc(placeholder)}" value="${value ?? ''}"></label>`;
}

/** Lê um campo de dinheiro: devolve centavos, null se vazio, ou undefined se inválido. */
export function readMoney(input) {
  const t = input.value.trim();
  if (!t) return null;
  const v = parseMoney(t);
  return v == null || v < 0 ? undefined : v;
}

/** Lê um campo numérico: número, null se vazio, undefined se inválido. */
export function readNumber(input) {
  const t = input.value.trim().replace(',', '.');
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : undefined;
}

export const DISCLAIMER = 'Orientação geral, não substitui aconselhamento profissional.';
