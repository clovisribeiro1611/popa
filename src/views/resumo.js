// Resumo mensal: totais com comparação ao mês anterior, gasto por categoria, evolução e orçamentos.

import { store } from '../store.js';
import { compareWithPrevious, history, budgets, totalBalance, inPeriod, parts, addDays, filterTransactions } from '../domain.js';
import { esc, money, catBadge, category, progressBar, currentPeriod, cycleDay, monthNav, bindMonthNav, today, emptyState } from '../ui.js';
import { stackedBar, cumulativeLine, groupedColumns, bindCharts, hideTip } from '../charts.js';
import { setFilters, txRow, bindTxList } from './movimentos.js';
import { openTransactionSheet } from './registo.js';

const MAX_SEGMENTS = 6;

function delta(cur, prev, { inverse = false } = {}) {
  if (!prev) return '<div class="delta">—</div>';
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  if (pct === 0) return '<div class="delta">= mês anterior</div>';
  const good = inverse ? pct < 0 : pct > 0;
  return `<div class="delta ${good ? 'pos' : 'neg'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs. anterior</div>`;
}

/** Despesas acumuladas por dia do período (até `until`). */
function cumulative(db, p, until) {
  const len = Math.round((Date.parse(p.end) - Date.parse(p.start)) / 864e5) + 1;
  const daily = new Array(len).fill(0);
  for (const t of db.transactions) {
    if (t.tipo !== 'despesa' || !inPeriod(t, p)) continue;
    daily[Math.round((Date.parse(t.data) - Date.parse(p.start)) / 864e5)] += t.valor;
  }
  let acc = 0;
  const out = daily.map((v) => (acc += v));
  if (until && until >= p.start && until <= p.end) return out.slice(0, Math.round((Date.parse(until) - Date.parse(p.start)) / 864e5) + 1);
  return until && until < p.start ? [] : out;
}

export function render(host) {
  const el = document.createElement('div');
  host.replaceChildren(el);
  hideTip();
  const db = store.get();
  const fd = cycleDay();
  const p = currentPeriod();
  const t = today();
  const { cur, prev, prevPeriod, categorias } = compareWithPrevious(db, p, fd);
  const fmt = (v) => money(v);

  // Gasto por categoria: maiores primeiro, o resto agrupado em "Outras".
  const rows = categorias.filter((c) => c.atual > 0 || c.anterior > 0);
  const withSpend = rows.filter((c) => c.atual > 0);
  const top = withSpend.slice(0, MAX_SEGMENTS);
  const rest = withSpend.slice(MAX_SEGMENTS).reduce((s, c) => s + c.atual, 0);
  const segments = top.map((c) => ({ label: category(c.categoriaId)?.nome || '—', value: c.atual, color: category(c.categoriaId)?.cor || '#868E96' }));
  if (rest) segments.push({ label: 'Outras', value: rest, color: '#868E96' });
  const maxCat = Math.max(1, ...rows.map((c) => Math.max(c.atual, c.anterior)));

  const catList = rows.slice(0, 10).map((c) => {
    const cat = category(c.categoriaId);
    const pct = cur.despesas ? Math.round((c.atual / cur.despesas) * 100) : 0;
    return `<li class="cat-row" data-cat="${c.categoriaId}">
      ${catBadge(cat)}
      <div class="item-main">
        <div class="cat-row-top"><span class="name">${esc(cat?.nome || '—')}</span><span class="num"><b>${money(c.atual)}</b></span></div>
        <div class="cat-bar" data-tip="${esc(cat?.nome || '')}: ${esc(money(c.atual))} (${pct}%) · ${esc(prevPeriod.shortLabel)}: ${esc(money(c.anterior))}">
          <span style="width:${(c.atual / maxCat) * 100}%;background:${esc(cat?.cor || '#868E96')}"></span>
          ${c.anterior ? `<i style="left:${(c.anterior / maxCat) * 100}%" title="Mês anterior"></i>` : ''}
        </div>
        <div class="item-sub">${pct}% do total · ${esc(prevPeriod.shortLabel)}: ${money(c.anterior)}</div>
      </div></li>`;
  }).join('');

  const curCum = cumulative(db, p, t);
  const prevCum = cumulative(db, prevPeriod, null);
  const labels = Array.from({ length: Math.max(curCum.length, prevCum.length, cumulative(db, p, null).length) },
    (_, i) => String(parts(addDays(p.start, i))[2]));
  const hist = history(db, p, 6, fd).map((h) => ({ label: h.period.shortLabel, a: h.receitas, b: h.despesas }));
  const bud = budgets(db, p).slice(0, 5);
  const recentes = filterTransactions(db, { start: p.start, end: p.end }).slice(0, 5);
  const noData = !cur.receitas && !cur.despesas && !prev.despesas;

  el.innerHTML = `
    ${monthNav(p)}
    <div class="hero"><div class="label">Saldo do mês</div>
      <div class="value ${cur.saldo < 0 ? 'neg' : ''}">${money(cur.saldo, { sign: true })}</div>
      ${delta(cur.saldo, prev.saldo)}</div>
    <div class="kpis">
      <div class="kpi"><div class="label">Receitas</div><div class="value pos">${money(cur.receitas)}</div>${delta(cur.receitas, prev.receitas)}</div>
      <div class="kpi"><div class="label">Despesas</div><div class="value neg">${money(cur.despesas)}</div>${delta(cur.despesas, prev.despesas, { inverse: true })}</div>
      <a class="kpi wide" href="#/contas"><div class="label">Património (todas as contas)</div><div class="value">${money(totalBalance(db, t))}</div></a>
    </div>
    ${noData ? emptyState('Sem movimentos neste mês.', '<button class="btn primary" data-new>Registar o primeiro</button>') : `
    <div class="card"><h2><span>Gasto por categoria</span><a class="link" href="#/categorias">Orçamentos</a></h2>
      ${segments.length ? stackedBar(segments, fmt) : '<p class="muted">Sem despesas neste mês.</p>'}
      <ul class="cat-rows">${catList}</ul>
      ${rows.length ? `<p class="muted small">A marca <i class="prev-mark"></i> indica o valor do mês anterior.</p>` : ''}
    </div>
    <div class="card"><h2><span>Gasto acumulado</span></h2>
      ${cumulativeLine({ cur: curCum, prev: prevCum, labels, curLabel: cap(p.shortLabel), prevLabel: cap(prevPeriod.shortLabel), fmt })}
    </div>
    ${bud.length ? `<div class="card"><h2><span>Orçamentos</span><a class="link" href="#/categorias">Ver todos</a></h2>
      <ul class="cat-rows">${bud.map((b) => `<li class="cat-row" data-cat="${b.categoria.id}">${catBadge(b.categoria)}
        <div class="item-main"><div class="cat-row-top"><span class="name">${esc(b.categoria.nome)}</span>
          <span class="num small">${Math.round(b.pct * 100)}% ${b.estado === 'excedido' ? '⚠' : ''}</span></div>
          ${progressBar(b.pct, b.estado)}
          <div class="item-sub">${money(b.gasto)} de ${money(b.orcamento)}</div></div></li>`).join('')}</ul></div>` : ''}
    <div class="card"><h2><span>Últimos 6 meses</span></h2>
      ${groupedColumns(hist, { aLabel: 'Receitas', bLabel: 'Despesas', aColor: 'var(--pos)', bColor: 'var(--neg)', fmt })}
    </div>
    ${recentes.length ? `<h3 class="section-title">Movimentos recentes</h3><ul class="tx-list">${recentes.map(txRow).join('')}</ul>
      <a class="btn wide" href="#/movimentos">Ver todos</a>` : ''}`}`;

  bindMonthNav(el, () => render(host));
  bindCharts(el, fmt);
  el.querySelector('.tx-list') && bindTxList(el.querySelector('.tx-list'));
  el.querySelector('[data-new]')?.addEventListener('click', () => openTransactionSheet());
  el.addEventListener('click', (e) => {
    const row = e.target.closest('.cat-row');
    if (!row || e.target.closest('[data-tip]')) return;
    setFilters({ categoriaId: row.dataset.cat });
    location.hash = '#/movimentos';
  });
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
