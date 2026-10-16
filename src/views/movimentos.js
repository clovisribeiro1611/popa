// Lista de movimentos agrupada por dia, com pesquisa e filtros (mês, categoria, conta, texto).

import { store } from '../store.js';
import { filterTransactions, groupByDay, formatDate } from '../domain.js';
import {
  $, $$, esc, money, catBadge, category, accountName, currentPeriod, monthNav, bindMonthNav,
  swipeToDelete, emptyState, options, icon
} from '../ui.js';
import { openTransactionSheet, deleteTransaction } from './registo.js';

const PAGE = 200;
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// Filtros mantidos entre renderizações e entre visitas à vista.
const f = { texto: '', categoriaId: '', contaId: '', todos: false, limite: PAGE };

/** Permite a outras vistas abrir os movimentos já filtrados (ex.: tocar numa categoria no resumo). */
export function setFilters(partial) {
  Object.assign(f, { texto: '', categoriaId: '', contaId: '', todos: false, limite: PAGE }, partial);
}

export function txRow(t) {
  const c = category(t.categoriaId);
  const title = t.descricao || (t.tipo === 'transferencia' ? 'Transferência' : c?.nome || '—');
  const sub = t.tipo === 'transferencia'
    ? `${esc(accountName(t.contaId))} → ${esc(accountName(t.contaDestinoId))}`
    : `${t.descricao && c ? esc(c.nome) + ' · ' : ''}${esc(accountName(t.contaId))}`;
  const sign = t.tipo === 'receita' ? 1 : t.tipo === 'despesa' ? -1 : 0;
  return `<li class="swipe-row" data-id="${t.id}">
    <div class="swipe-bg">${icon('trash')} Apagar</div>
    <div class="swipe-content tx">
      ${catBadge(t.tipo === 'transferencia' ? null : c)}
      <div class="tx-main"><div class="tx-title">${esc(title)}${t.recorrenteId ? ` <span class="tag">${icon('repeat')}</span>` : ''}</div>
        <div class="tx-sub">${sub}</div></div>
      <div class="tx-amt ${t.tipo}">${sign ? money(sign * t.valor, { sign: sign > 0 }) : money(t.valor)}</div>
    </div></li>`;
}

/** Liga toque (editar) e deslize (apagar) às linhas de uma lista. */
export function bindTxList(root) {
  $$('.swipe-row', root).forEach((row) => swipeToDelete(row, () => deleteTransaction(row.dataset.id)));
  root.addEventListener('click', (e) => {
    const row = e.target.closest('.swipe-row');
    if (!row || row.dataset.swiped) return;
    const t = store.get().transactions.find((x) => x.id === row.dataset.id);
    if (t) openTransactionSheet(t);
  });
}

export function render(host) {
  const el = document.createElement('div');
  host.replaceChildren(el);
  const db = store.get();
  const p = currentPeriod();
  const list = filterTransactions(db, {
    start: f.todos ? null : p.start, end: f.todos ? null : p.end,
    categoriaId: f.categoriaId, contaId: f.contaId, texto: f.texto
  });
  let receitas = 0, despesas = 0;
  for (const t of list) { if (t.tipo === 'receita') receitas += t.valor; else if (t.tipo === 'despesa') despesas += t.valor; }
  const groups = groupByDay(list.slice(0, f.limite));
  const cats = db.categories.filter((c) => !c.arquivada || c.id === f.categoriaId)
    .sort((a, b) => a.tipo.localeCompare(b.tipo) || a.nome.localeCompare(b.nome, 'pt'));
  const nFiltros = [f.categoriaId, f.contaId, f.todos].filter(Boolean).length;

  el.innerHTML = `
    <div class="sticky-top">
      ${f.todos ? '<div class="month-nav"><span class="month-label">Todos os meses</span></div>' : monthNav(p)}
      <div class="search">${icon('search')}<input id="m-q" type="search" placeholder="Pesquisar descrição, notas, categoria" value="${esc(f.texto)}"></div>
      <details class="filters" ${nFiltros ? 'open' : ''}><summary>Filtros${nFiltros ? ` (${nFiltros})` : ''}</summary>
        <div class="field-row">
          <label class="field grow"><span>Categoria</span><select id="m-cat">${options(cats, f.categoriaId, { empty: 'Todas', label: (c) => `${c.icone} ${c.nome}` })}</select></label>
          <label class="field grow"><span>Conta</span><select id="m-conta">${options(db.accounts, f.contaId, { empty: 'Todas' })}</select></label>
        </div>
        <label class="check"><input type="checkbox" id="m-todos" ${f.todos ? 'checked' : ''}> Todos os meses</label>
        ${nFiltros || f.texto ? '<button class="link" id="m-clear">Limpar filtros</button>' : ''}
      </details>
      <div class="totals"><span class="receita">${money(receitas, { sign: true })}</span><span class="despesa">${money(-despesas)}</span></div>
    </div>
    ${groups.length ? `<div class="tx-groups">${groups.map((g) => `
      <section><h3 class="day"><span>${esc(capitalize(formatDate(g.data, { weekday: true })))}</span><span>${g.total ? money(g.total, { sign: true }) : ''}</span></h3>
        <ul class="tx-list">${g.items.map(txRow).join('')}</ul></section>`).join('')}</div>
      ${list.length > f.limite ? `<button class="btn wide" id="m-more">Mostrar mais (${list.length - f.limite})</button>` : ''}`
      : emptyState(f.texto || nFiltros ? 'Nenhum movimento corresponde aos filtros.' : 'Ainda não há movimentos neste mês.',
        '<button class="btn primary" data-new>Registar movimento</button>')}`;

  const rerender = () => render(host);
  bindMonthNav(el, rerender, el);
  bindTxList(el);

  const q = $('#m-q', el);
  let qTimer;
  q.addEventListener('input', () => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      f.texto = q.value; f.limite = PAGE;
      const pos = q.selectionStart;
      rerender();
      const nq = $('#m-q', host); nq.focus(); nq.setSelectionRange(pos, pos);
    }, 250);
  });
  $('#m-cat', el).addEventListener('change', (e) => { f.categoriaId = e.target.value; rerender(); });
  $('#m-conta', el).addEventListener('change', (e) => { f.contaId = e.target.value; rerender(); });
  $('#m-todos', el).addEventListener('change', (e) => { f.todos = e.target.checked; f.limite = PAGE; rerender(); });
  $('#m-clear', el)?.addEventListener('click', () => { setFilters({}); rerender(); });
  $('#m-more', el)?.addEventListener('click', () => { f.limite += PAGE; rerender(); });
  $('[data-new]', el)?.addEventListener('click', () => openTransactionSheet());
}
