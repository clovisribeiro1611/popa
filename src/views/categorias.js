// Categorias e orçamentos mensais (barra verde < 80%, amarela 80–100%, vermelha > 100%).

import { store, newId } from '../store.js';
import { periodSummary, budgetState, parseMoney, centsToInput } from '../domain.js';
import {
  $, $$, esc, money, sheet, toast, confirmDialog, catBadge, progressBar, icon, currentPeriod, monthNav, bindMonthNav, settings
} from '../ui.js';
import { setFilters } from './movimentos.js';

export const CORES = ['#E4572E', '#F3A712', '#E64980', '#7950F2', '#4C6EF5', '#1098AD', '#12B886', '#2B8A3E',
  '#5C940D', '#F76707', '#868E96', '#495057'];
export const EMOJIS = ['🛒', '🍽️', '☕', '🍺', '🚌', '🚕', '🚗', '⛽', '🏠', '⚡', '💧', '📱', '📺', '🌐', '💊', '🏥',
  '📚', '🎓', '👶', '🍼', '🐶', '👕', '💇', '🏋️', '🎉', '🎬', '🎮', '✈️', '🎁', '🛍️', '🔧', '🧾', '💳', '🏦', '📦',
  '💼', '💰', '💸', '📈', '🪙', '⛪', '❤️'];

let tipoAtivo = 'despesa';

export function render(host) {
  const el = document.createElement('div');
  host.replaceChildren(el);
  const db = store.get();
  const p = currentPeriod();
  const { porCategoria, receitas } = periodSummary(db, p);
  const porCatReceita = new Map();
  for (const t of db.transactions) if (t.tipo === 'receita' && t.data >= p.start && t.data <= p.end) porCatReceita.set(t.categoriaId, (porCatReceita.get(t.categoriaId) || 0) + t.valor);
  const valores = tipoAtivo === 'despesa' ? porCategoria : porCatReceita;

  const cats = db.categories.filter((c) => c.tipo === tipoAtivo && !c.arquivada)
    .sort((a, b) => (b.orcamentoMensal > 0) - (a.orcamentoMensal > 0) || (valores.get(b.id) || 0) - (valores.get(a.id) || 0) || a.ordem - b.ordem);
  const arquivadas = db.categories.filter((c) => c.tipo === tipoAtivo && c.arquivada);

  const comOrc = cats.filter((c) => c.orcamentoMensal > 0);
  const totalOrc = comOrc.reduce((s, c) => s + c.orcamentoMensal, 0);
  const totalGastoOrc = comOrc.reduce((s, c) => s + (porCategoria.get(c.id) || 0), 0);
  const totalState = budgetState(totalGastoOrc, totalOrc);

  const item = (c) => {
    const v = valores.get(c.id) || 0;
    const b = tipoAtivo === 'despesa' ? budgetState(v, c.orcamentoMensal) : null;
    return `<li><button class="item" data-cat="${c.id}">
      ${catBadge(c)}
      <div class="item-main">
        <div class="item-title">${esc(c.nome)}${c.favorita ? ' <span class="muted">★</span>' : ''}</div>
        <div class="item-sub num">${b
          ? `${money(v)} de ${money(c.orcamentoMensal)} · ${b.restante >= 0 ? 'restam ' + money(b.restante) : 'excedido em ' + money(-b.restante)}`
          : `${money(v)}${tipoAtivo === 'despesa' ? ' · sem orçamento' : ''}`}</div>
        ${b ? progressBar(b.pct, b.estado) : ''}
      </div></button></li>`;
  };

  el.innerHTML = `
    ${monthNav(p)}
    <div class="seg"><button data-t="despesa" class="${tipoAtivo === 'despesa' ? 'sel' : ''}">Despesas</button>
      <button data-t="receita" class="${tipoAtivo === 'receita' ? 'sel' : ''}">Receitas</button></div>
    ${tipoAtivo === 'despesa' && totalState ? `<div class="card">
      <h2><span>Orçamento do mês</span><span class="num">${Math.round(totalState.pct * 100)}%</span></h2>
      ${progressBar(totalState.pct, totalState.estado)}
      <p class="muted small num">${money(totalGastoOrc)} de ${money(totalOrc)} nas categorias com orçamento</p></div>`
      : tipoAtivo === 'receita' ? `<div class="card"><h2><span>Receitas do mês</span><span class="num pos">${money(receitas)}</span></h2></div>` : ''}
    <ul class="list" style="margin-top:12px">${cats.map(item).join('')}</ul>
    <button class="btn wide" id="k-new">${icon('plus')} Nova categoria</button>
    ${arquivadas.length ? `<details><summary>Arquivadas (${arquivadas.length})</summary><ul class="list">${arquivadas.map(item).join('')}</ul></details>` : ''}`;

  bindMonthNav(el, () => render(host));
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-t]');
    if (t) { tipoAtivo = t.dataset.t; render(host); return; }
    const c = e.target.closest('[data-cat]');
    if (c) openCategorySheet(store.get().categories.find((x) => x.id === c.dataset.cat));
  });
  $('#k-new', el).addEventListener('click', () => openCategorySheet(null, tipoAtivo));
}

export function openCategorySheet(cat = null, tipo = 'despesa') {
  const db = store.get();
  const st = { cor: cat?.cor || CORES[Math.floor(Math.random() * CORES.length)], icone: cat?.icone || '📦', tipo: cat?.tipo || tipo };
  const used = cat && (db.transactions.some((t) => t.categoriaId === cat.id) || db.recurring.some((r) => r.categoriaId === cat.id));

  const s = sheet(`
    <h2>${cat ? 'Editar categoria' : 'Nova categoria'}</h2>
    <div class="field-row">
      <span id="k-preview">${catBadge(st, 'lg')}</span>
      <label class="field grow"><span>Nome</span><input id="k-nome" maxlength="30" value="${esc(cat?.nome)}"></label>
    </div>
    ${cat ? '' : `<div class="seg"><button data-tipo="despesa">Despesa</button><button data-tipo="receita">Receita</button></div>`}
    <label class="field" id="k-orc-wrap"><span>Orçamento mensal (${esc(settings().moeda)}) — vazio = sem orçamento</span>
      <input id="k-orc" inputmode="decimal" value="${esc(centsToInput(cat?.orcamentoMensal ?? null))}" placeholder="Sem orçamento"></label>
    <label class="check"><input type="checkbox" id="k-fav" ${cat?.favorita ? 'checked' : ''}> Favorita (aparece primeiro no registo rápido)</label>
    <div class="field"><span>Cor</span><div class="swatches">${CORES.map((c) => `<button data-cor="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div></div>
    <div class="field"><span>Ícone</span><div class="emoji-grid no-drag">${EMOJIS.map((e) => `<button data-emoji="${e}">${e}</button>`).join('')}</div>
      <input id="k-emoji" maxlength="4" placeholder="Ou escreva outro emoji" style="margin-top:8px"></div>
    <p class="error" id="k-err"></p>
    <div class="row-btns"><button class="btn primary big" id="k-save">Guardar</button></div>
    ${cat ? `<div class="row-btns">
      <button class="btn" id="k-mov">${icon('list')} Movimentos</button>
      <button class="btn" id="k-arch">${cat.arquivada ? 'Desarquivar' : 'Arquivar'}</button>
      ${used ? '' : `<button class="btn danger" id="k-del">${icon('trash')}</button>`}</div>` : ''}`);
  const el = s.el;

  const refresh = () => {
    $('#k-preview', el).innerHTML = catBadge(st, 'lg');
    $$('[data-cor]', el).forEach((b) => b.classList.toggle('sel', b.dataset.cor === st.cor));
    $$('[data-emoji]', el).forEach((b) => b.classList.toggle('sel', b.dataset.emoji === st.icone));
    $$('[data-tipo]', el).forEach((b) => b.classList.toggle('sel', b.dataset.tipo === st.tipo));
    $('#k-orc-wrap', el).hidden = st.tipo !== 'despesa';
  };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.cor) st.cor = b.dataset.cor;
    else if (b.dataset.emoji) st.icone = b.dataset.emoji;
    else if (b.dataset.tipo) st.tipo = b.dataset.tipo;
    else return;
    refresh();
  });
  $('#k-emoji', el).addEventListener('input', (e) => { if (e.target.value.trim()) { st.icone = e.target.value.trim(); refresh(); } });

  $('#k-save', el).addEventListener('click', () => {
    const nome = $('#k-nome', el).value.trim();
    const orcTxt = $('#k-orc', el).value.trim();
    const orc = orcTxt ? parseMoney(orcTxt) : null;
    if (!nome) return ($('#k-err', el).textContent = 'Indique o nome da categoria.');
    if (orcTxt && (orc == null || orc < 0)) return ($('#k-err', el).textContent = 'Orçamento inválido.');
    if (store.get().categories.some((c) => c.id !== cat?.id && c.tipo === st.tipo && c.nome.toLowerCase() === nome.toLowerCase())) {
      return ($('#k-err', el).textContent = 'Já existe uma categoria com esse nome.');
    }
    store.update((db) => {
      let c = db.categories.find((x) => x.id === cat?.id);
      if (!c) {
        c = { id: newId(), tipo: st.tipo, arquivada: false, ordem: db.categories.filter((x) => x.tipo === st.tipo).length };
        db.categories.push(c);
      }
      Object.assign(c, { nome, cor: st.cor, icone: st.icone, favorita: $('#k-fav', el).checked,
        orcamentoMensal: c.tipo === 'despesa' && orc > 0 ? orc : null });
      delete c.orcamentoExemplo;
    });
    s.close();
  });
  $('#k-mov', el)?.addEventListener('click', () => { setFilters({ categoriaId: cat.id }); s.close(); location.hash = '#/movimentos'; });
  $('#k-arch', el)?.addEventListener('click', () => {
    store.update((db) => { const c = db.categories.find((x) => x.id === cat.id); c.arquivada = !c.arquivada; });
    s.close();
    toast(cat.arquivada ? 'Categoria reativada' : 'Categoria arquivada (os movimentos mantêm-se)');
  });
  $('#k-del', el)?.addEventListener('click', async () => {
    if (!(await confirmDialog(`Apagar a categoria “${cat.nome}”?`, { ok: 'Apagar', danger: true }))) return;
    store.update((db) => { db.categories = db.categories.filter((x) => x.id !== cat.id); });
    s.close();
  });
  refresh();
}
