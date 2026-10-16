// Contas: saldos atuais, criação/edição, arquivo e transferências.

import { store, newId } from '../store.js';
import { accountBalances, parseMoney, centsToInput } from '../domain.js';
import { $, esc, money, sheet, toast, confirmDialog, icon, today, settings, TIPOS_CONTA, options } from '../ui.js';
import { openTransactionSheet } from './registo.js';
import { setFilters } from './movimentos.js';

const EMOJI_TIPO = { numerario: '💵', conta: '🏦', poupanca: '🐷' };

function accountItem(a, bal) {
  return `<li><button class="item" data-acc="${a.id}">
    <span class="badge" style="--c:var(--primary)">${EMOJI_TIPO[a.tipo] || '🏦'}</span>
    <div class="item-main"><div class="item-title">${esc(a.nome)}${a.id === settings().contaPorDefeito ? ' <span class="muted small">· por defeito</span>' : ''}</div>
      <div class="item-sub">${esc(TIPOS_CONTA[a.tipo] || a.tipo)}</div></div>
    <div class="num ${bal < 0 ? 'neg' : ''}"><b>${money(bal)}</b></div>
  </button></li>`;
}

export function render(host) {
  const el = document.createElement('div');
  host.replaceChildren(el);
  const db = store.get();
  const bal = accountBalances(db, today());
  const ativas = db.accounts.filter((a) => !a.arquivada).sort((a, b) => a.ordem - b.ordem);
  const arquivadas = db.accounts.filter((a) => a.arquivada);
  const total = ativas.reduce((s, a) => s + bal.get(a.id), 0);
  const futuros = db.transactions.some((t) => t.data > today());

  el.innerHTML = `
    <div class="hero"><div class="label">Saldo total</div><div class="value ${total < 0 ? 'neg' : ''}">${money(total)}</div>
      ${futuros ? '<div class="muted small">Não inclui movimentos com data futura.</div>' : ''}</div>
    <div class="row-btns">
      <button class="btn" id="c-transf">${icon('swap')} Transferir</button>
      <button class="btn primary" id="c-new">${icon('plus')} Nova conta</button>
    </div>
    <h3 class="section-title">Contas</h3>
    <ul class="list">${ativas.map((a) => accountItem(a, bal.get(a.id))).join('')}</ul>
    ${arquivadas.length ? `<details><summary>Arquivadas (${arquivadas.length})</summary>
      <ul class="list">${arquivadas.map((a) => accountItem(a, bal.get(a.id))).join('')}</ul></details>` : ''}`;

  el.addEventListener('click', (e) => {
    const acc = e.target.closest('[data-acc]');
    if (acc) openAccountSheet(store.get().accounts.find((a) => a.id === acc.dataset.acc));
  });
  $('#c-new', el).addEventListener('click', () => openAccountSheet());
  $('#c-transf', el).addEventListener('click', () => {
    if (ativas.length < 2) return toast('Precisa de pelo menos duas contas para transferir.');
    openTransactionSheet(null, { tipo: 'transferencia' });
  });
}

function openAccountSheet(acc = null) {
  const db = store.get();
  const used = acc && db.transactions.some((t) => t.contaId === acc.id || t.contaDestinoId === acc.id)
    || acc && db.recurring.some((r) => r.contaId === acc.id || r.contaDestinoId === acc.id);
  const isDefault = acc && settings().contaPorDefeito === acc.id;
  const s = sheet(`
    <h2>${acc ? 'Editar conta' : 'Nova conta'}</h2>
    <label class="field"><span>Nome</span><input id="a-nome" maxlength="40" value="${esc(acc?.nome)}" placeholder="Ex.: BCA conta à ordem"></label>
    <label class="field"><span>Tipo</span><select id="a-tipo">${options(Object.entries(TIPOS_CONTA), acc?.tipo || 'conta', { value: (x) => x[0], label: (x) => x[1] })}</select></label>
    <label class="field"><span>Saldo inicial (${esc(settings().moeda)})</span><input id="a-saldo" inputmode="decimal" value="${esc(centsToInput(acc?.saldoInicial ?? 0))}"></label>
    <label class="check"><input type="checkbox" id="a-def" ${isDefault || !db.accounts.length ? 'checked' : ''}> Conta por defeito no registo rápido</label>
    <p class="error" id="a-err"></p>
    <div class="row-btns"><button class="btn primary big" id="a-save">Guardar</button></div>
    ${acc ? `<div class="row-btns">
      <button class="btn" id="a-mov">${icon('list')} Movimentos</button>
      <button class="btn" id="a-arch">${acc.arquivada ? 'Desarquivar' : 'Arquivar'}</button>
      ${used ? '' : `<button class="btn danger" id="a-del">${icon('trash')}</button>`}
    </div>` : ''}`);
  const el = s.el;

  $('#a-save', el).addEventListener('click', () => {
    const nome = $('#a-nome', el).value.trim();
    const saldo = parseMoney($('#a-saldo', el).value || '0');
    if (!nome) return ($('#a-err', el).textContent = 'Indique o nome da conta.');
    if (saldo == null) return ($('#a-err', el).textContent = 'Saldo inicial inválido.');
    store.update((db) => {
      let a = db.accounts.find((x) => x.id === acc?.id);
      if (!a) {
        a = { id: newId(), arquivada: false, ordem: db.accounts.length };
        db.accounts.push(a);
      }
      Object.assign(a, { nome, tipo: $('#a-tipo', el).value, saldoInicial: saldo });
      if ($('#a-def', el).checked) db.settings.contaPorDefeito = a.id;
      else if (db.settings.contaPorDefeito === a.id) db.settings.contaPorDefeito = db.accounts.find((x) => x.id !== a.id && !x.arquivada)?.id ?? a.id;
    });
    s.close();
  });
  $('#a-mov', el)?.addEventListener('click', () => {
    setFilters({ contaId: acc.id });
    s.close();
    location.hash = '#/movimentos';
  });
  $('#a-arch', el)?.addEventListener('click', () => {
    const ativas = store.get().accounts.filter((a) => !a.arquivada);
    if (!acc.arquivada && ativas.length <= 1) return toast('Tem de existir pelo menos uma conta ativa.');
    store.update((db) => {
      const a = db.accounts.find((x) => x.id === acc.id);
      a.arquivada = !a.arquivada;
      if (a.arquivada && db.settings.contaPorDefeito === a.id) db.settings.contaPorDefeito = db.accounts.find((x) => !x.arquivada)?.id;
    });
    s.close();
  });
  $('#a-del', el)?.addEventListener('click', async () => {
    if (store.get().accounts.length <= 1) return toast('Tem de existir pelo menos uma conta.');
    if (!(await confirmDialog(`Apagar a conta “${acc.nome}”?`, { ok: 'Apagar', danger: true }))) return;
    store.update((db) => {
      db.accounts = db.accounts.filter((x) => x.id !== acc.id);
      if (db.settings.contaPorDefeito === acc.id) db.settings.contaPorDefeito = db.accounts[0]?.id;
    });
    s.close();
  });
  if (!acc) setTimeout(() => $('#a-nome', el).focus(), 280);
}
