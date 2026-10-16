// Folha de registo/edição de movimentos. Fluxo rápido: (+) → valor → categoria → Guardar.

import { store, newId } from '../store.js';
import { parseMoney, centsToInput, quickCategories, validateTransaction, addDays, formatDate } from '../domain.js';
import { $, $$, esc, sheet, toast, confirmDialog, catBadge, today, options, icon, settings } from '../ui.js';
import { offerRule } from './extra.js';

const TIPOS = [['despesa', 'Despesa'], ['receita', 'Receita'], ['transferencia', 'Transferência']];

/**
 * Abre a folha. `tx` = movimento a editar (opcional); `preset` = valores iniciais para um novo
 * movimento (ex.: { tipo: 'transferencia', contaId }).
 */
export function openTransactionSheet(tx = null, preset = {}) {
  const db = store.get();
  const editing = !!tx;
  const accounts = db.accounts.filter((a) => !a.arquivada || a.id === tx?.contaId || a.id === tx?.contaDestinoId);
  const defaultAcc = db.accounts.find((a) => a.id === settings().contaPorDefeito && !a.arquivada) || accounts[0];
  const st = {
    tipo: tx?.tipo || preset.tipo || 'despesa',
    categoriaId: tx?.categoriaId || preset.categoriaId || null,
    contaId: tx?.contaId || preset.contaId || defaultAcc?.id,
    contaDestinoId: tx?.contaDestinoId || preset.contaDestinoId || accounts.find((a) => a.id !== (preset.contaId || defaultAcc?.id))?.id || null,
    data: tx?.data || today(),
    showAll: false
  };
  const rec = tx?.recorrenteId ? db.recurring.find((r) => r.id === tx.recorrenteId) : null;

  const s = sheet(`
    <div class="seg" role="tablist">${TIPOS.map(([k, l]) => `<button data-tipo="${k}">${l}</button>`).join('')}</div>
    <label class="amount">
      <input id="f-valor" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(centsToInput(tx?.valor))}">
      <span>${esc(settings().moeda)}</span>
    </label>
    <div id="f-cats"></div>
    <div id="f-transfer" class="field-row">
      <label class="field"><span>De</span><select id="f-de">${options(accounts, st.contaId)}</select></label>
      <button class="icon-btn" id="f-swap" aria-label="Trocar contas">${icon('swap')}</button>
      <label class="field"><span>Para</span><select id="f-para">${options(accounts, st.contaDestinoId)}</select></label>
    </div>
    <div class="field-row">
      <label class="field grow"><span>Data</span><input type="date" id="f-data" value="${st.data}"></label>
      <div class="chips small" id="f-quickdate">
        <button data-d="0">Hoje</button><button data-d="-1">Ontem</button>
      </div>
    </div>
    <label class="field" id="f-conta-wrap"><span>Conta</span><select id="f-conta">${options(accounts, st.contaId)}</select></label>
    <label class="field" id="f-divida-wrap" hidden><span>Que dívida está a pagar?</span><select id="f-divida"></select></label>
    <label class="field"><span>Descrição</span><input id="f-desc" maxlength="120" placeholder="Opcional" value="${esc(tx?.descricao)}"></label>
    <details ${tx?.notas ? 'open' : ''}><summary>Notas</summary>
      <textarea id="f-notas" rows="3" maxlength="1000">${esc(tx?.notas)}</textarea></details>
    ${rec ? `<p class="muted small">${icon('repeat')} Gerado pela recorrência “${esc(rec.descricao)}”.</p>` : ''}
    <p class="error" id="f-err" role="alert"></p>
    <div class="row-btns">
      ${editing ? `<button class="btn danger" id="f-del">${icon('trash')} Apagar</button>` : ''}
      <button class="btn primary big" id="f-save">Guardar</button>
    </div>`, { className: 'tx-sheet' });

  const el = s.el;
  const valorInput = $('#f-valor', el);

  function renderCats() {
    const box = $('#f-cats', el);
    if (st.tipo === 'transferencia') { box.innerHTML = ''; return; }
    const all = store.get().categories.filter((c) => c.tipo === st.tipo && (!c.arquivada || c.id === st.categoriaId));
    let list = st.showAll ? all.sort((a, b) => a.nome.localeCompare(b.nome, 'pt')) : quickCategories(store.get(), st.tipo, today(), 8);
    if (st.categoriaId && !list.some((c) => c.id === st.categoriaId)) {
      const sel = all.find((c) => c.id === st.categoriaId);
      if (sel) list = [sel, ...list.slice(0, 7)];
    }
    box.innerHTML = `<div class="cat-grid">${list.map((c) => `
      <button class="cat-chip ${c.id === st.categoriaId ? 'sel' : ''}" data-cat="${c.id}">
        ${catBadge(c)}<span>${esc(c.nome)}</span></button>`).join('')}
      ${all.length > list.length || st.showAll ? `<button class="cat-chip more" data-more>
        <span class="badge">${st.showAll ? '−' : '⋯'}</span><span>${st.showAll ? 'Menos' : 'Todas'}</span></button>` : ''}
    </div>`;
    renderDebtField();
  }

  // Pagamento de dívida: escolher a dívida para o saldo descontar automaticamente.
  function renderDebtField() {
    const db = store.get();
    const cat = db.categories.find((c) => c.id === st.categoriaId);
    const debts = db.debts.filter((d) => d.ativa !== false || d.id === tx?.dividaId);
    const show = st.tipo === 'despesa' && cat?.essencialTipo === 'dividas' && debts.length > 0;
    const wrap = $('#f-divida-wrap', el);
    wrap.hidden = !show;
    if (show && !wrap.dataset.filled) {
      $('#f-divida', el).innerHTML = options(debts, tx?.dividaId || debts[0].id, { empty: 'Nenhuma em particular' });
      wrap.dataset.filled = '1';
    }
  }

  function renderTipo() {
    $$('[data-tipo]', el).forEach((b) => b.classList.toggle('sel', b.dataset.tipo === st.tipo));
    el.dataset.tipo = st.tipo;
    $('#f-transfer', el).hidden = st.tipo !== 'transferencia';
    $('#f-conta-wrap', el).hidden = st.tipo === 'transferencia';
    renderCats();
  }

  function setDate(iso) {
    st.data = iso;
    $('#f-data', el).value = iso;
    $$('#f-quickdate button', el).forEach((b) => b.classList.toggle('sel', addDays(today(), Number(b.dataset.d)) === iso));
  }

  el.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.tipo) {
      if (st.tipo !== t.dataset.tipo) st.categoriaId = null;
      st.tipo = t.dataset.tipo;
      renderTipo();
    } else if (t.dataset.cat) {
      st.categoriaId = t.dataset.cat;
      renderCats();
    } else if ('more' in t.dataset) {
      st.showAll = !st.showAll;
      renderCats();
    } else if (t.dataset.d != null) {
      setDate(addDays(today(), Number(t.dataset.d)));
    } else if (t.id === 'f-swap') {
      const de = $('#f-de', el), para = $('#f-para', el);
      [de.value, para.value] = [para.value, de.value];
    } else if (t.id === 'f-save') save();
    else if (t.id === 'f-del') remove();
  });
  $('#f-data', el).addEventListener('change', (e) => setDate(e.target.value || today()));
  valorInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });

  function save() {
    const valor = parseMoney(valorInput.value);
    const debtVisible = !$('#f-divida-wrap', el).hidden;
    const t = {
      ...(tx || {}),
      id: tx?.id || newId(),
      data: st.data,
      valor: valor == null ? 0 : Math.abs(valor),
      tipo: st.tipo,
      contaId: st.tipo === 'transferencia' ? $('#f-de', el).value : $('#f-conta', el).value,
      contaDestinoId: st.tipo === 'transferencia' ? $('#f-para', el).value : null,
      categoriaId: st.tipo === 'transferencia' ? null : st.categoriaId,
      descricao: $('#f-desc', el).value.trim(),
      notas: $('#f-notas', el).value.trim(),
      recorrenteId: tx?.recorrenteId || null,
      dividaId: debtVisible ? $('#f-divida', el).value || null : null,
      criadoEm: tx?.criadoEm || new Date().toISOString()
    };
    const errs = validateTransaction(t, store.get());
    if (errs.length) {
      $('#f-err', el).textContent = errs[0];
      if (!t.valor) valorInput.focus();
      return;
    }
    const before = tx ? { ...tx } : null;
    store.update((db) => {
      const i = db.transactions.findIndex((x) => x.id === t.id);
      if (i >= 0) db.transactions[i] = t; else db.transactions.push(t);
    });
    s.close();
    if (!editing && offerRule(t)) return;
    toast(editing ? 'Movimento atualizado' : `Registado: ${formatDate(t.data, { year: false })}`, {
      action: 'Anular',
      onAction: () => store.update((db) => {
        const i = db.transactions.findIndex((x) => x.id === t.id);
        if (i < 0) return;
        if (before) db.transactions[i] = before; else db.transactions.splice(i, 1);
      })
    });
  }

  async function remove() {
    if (!(await confirmDialog('Apagar este movimento?', { ok: 'Apagar', danger: true }))) return;
    s.close();
    deleteTransaction(tx.id);
  }

  setDate(st.data);
  renderTipo();
  if (!editing) setTimeout(() => valorInput.focus(), 280);
}

/** Apaga um movimento com opção de anular. */
export function deleteTransaction(id) {
  let removed, index;
  store.update((db) => {
    index = db.transactions.findIndex((x) => x.id === id);
    if (index >= 0) [removed] = db.transactions.splice(index, 1);
  });
  if (removed) toast('Movimento apagado', {
    action: 'Anular',
    onAction: () => store.update((db) => db.transactions.splice(Math.min(index, db.transactions.length), 0, removed))
  });
}
