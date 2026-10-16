// Plano do mês: cascata de prioridades (detalhe), fundo de emergência, fundos de provisão e calendário anual.

import { store, newId } from '../store.js';
import { cascade, suggestCuts, emergencyStatus, reserveCycle, useEmergency, essentialMonthly } from '../finance.js';
import { formatDate } from '../domain.js';
import {
  $, esc, money, sheet, toast, icon, options, progressBar, today, moneyField, numberField, readMoney, readNumber, DISCLAIMER
} from '../ui.js';
import * as fundos from './fundos.js';

const TABS = [['cascata', 'Cascata'], ['emergencia', 'Emergência'], ['fundos', 'Fundos'], ['calendario', 'Calendário']];
let tab = 'cascata';
export const setTab = (t) => { tab = t; };

const LEVEL_ICON = { essenciais: '🏠', emergencia: '🛟', fundos: '🗓️', dividas: '💳', metas: '🎯', livre: '🙂' };

/** Estado de um nível: texto curto + classe de cor. */
function levelState(l) {
  if (l.deficit > 0) return { cls: 'bad', txt: `Défice ${money(l.deficit)}` };
  if (l.key === 'essenciais') return l.porPagar > 0 ? { cls: 'ok', txt: `Por pagar ${money(l.porPagar)}` } : { cls: 'ok', txt: 'Pago' };
  return l.porReservar > 0 ? { cls: 'warn', txt: `Por reservar ${money(l.porReservar)}` } : { cls: 'ok', txt: 'Reservado' };
}

/** Resumo da cascata (usado no Início e no Plano). */
export function cascadeSummary(c, { detail = false } = {}) {
  const rows = c.levels.filter((l) => l.use > 0 || l.key === 'essenciais').map((l) => {
    const st = levelState(l);
    const pct = l.key === 'essenciais' ? (l.use ? l.coberto / l.use : 1) : (l.use ? Math.min(l.coberto, l.reservado || 0) / l.use : 1);
    return `<li class="level">
      <div class="level-head"><span class="level-n">${l.n}</span><span class="level-ico">${LEVEL_ICON[l.key]}</span>
        <span class="level-title">${esc(l.titulo)}</span><span class="chip ${st.cls}">${esc(st.txt)}</span></div>
      ${progressBar(pct, l.deficit > 0 ? 'excedido' : pct < 1 ? 'aviso' : 'ok')}
      <div class="level-sub muted small num">${money(l.use)} necessários${l.deficit ? ` · coberto ${money(l.coberto)}` : ''}</div>
      ${detail ? `<ul class="level-items">${l.items.map((i) => `<li><span>${esc(i.icone || '')} ${esc(i.nome)}${i.sugerido ? ' <i class="muted">(cesta)</i>' : ''}</span>
        <span class="num small">${l.key === 'essenciais' ? `${money(i.gasto)} / ${money(i.need)}` : `${money(i.reservado)} / ${money(i.need)}`}</span></li>`).join('')}</ul>` : ''}
    </li>`;
  }).join('');

  const livre = c.tudoCoberto
    ? `<div class="livre ${c.livre.paraGastar < 0 ? 'neg' : ''}"><div class="label">Livre para gastar</div>
        <div class="value num">${money(c.livre.paraGastar)}</div>
        <div class="muted small num">${money(c.livre.disponivel)} livres no ciclo · já gastos ${money(c.livre.gasto)}</div></div>`
    : `<div class="livre locked"><div class="label">Livre para gastar</div>
        <div class="muted">Só depois de cobrir os níveis acima. Falta ${money(c.deficit)}.</div></div>`;
  return `<ol class="cascade">${rows}</ol>${livre}`;
}

export function cutsCard(db, c) {
  const cuts = suggestCuts(db, c, today());
  if (!cuts.length) return '';
  const idx = cuts.findIndex((x) => x.cobreDefice);
  const shown = cuts.slice(0, Math.max(4, idx + 1));
  return `<div class="card alert-card bad">
    <h2><span>O dinheiro não chega para tudo</span></h2>
    <p>Falta <b>${money(c.deficit)}</b> a partir do nível “${esc(c.primeiroDefice.titulo)}”. Sugestões, da que liberta mais para a que liberta menos:</p>
    <ol class="cuts">${shown.map((x) => `<li class="${x.nivel === 1 ? 'muted' : ''}"><span>${esc(x.texto)}</span><b class="num">+${money(x.valor)}</b></li>`).join('')}</ol>
    ${idx >= 0 ? `<p class="small muted">Com as primeiras ${idx + 1} sugestões o défice fica coberto.</p>` : '<p class="small">Mesmo com estes cortes não chega: reveja os orçamentos dos essenciais ou procure rendimento extra.</p>'}
  </div>`;
}

export function render(host) {
  const el = document.createElement('div');
  host.replaceChildren(el);
  el.innerHTML = `<div class="seg tabs">${TABS.map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'sel' : ''}">${l}</button>`).join('')}</div>
    <div id="tab-body"></div>`;
  el.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) { tab = b.dataset.tab; render(host); }
  });
  const body = $('#tab-body', el);
  if (tab === 'cascata') renderCascata(body);
  else if (tab === 'emergencia') renderEmergencia(body);
  else if (tab === 'fundos') fundos.renderFundos(body);
  else fundos.renderCalendario(body);
}

function renderCascata(el) {
  const db = store.get();
  const c = cascade(db, today());
  el.innerHTML = `
    <p class="muted small">Ciclo ${esc(c.cycle.label)} · rendimento ${money(c.income.total)}${c.income.salarioRecebido ? '' : ' (salário ainda não registado: usa o valor do perfil)'}</p>
    ${cutsCard(db, c)}
    <div class="card">${cascadeSummary(c, { detail: true })}</div>
    ${reserveButton(c)}
    <p class="muted small">Ordem: 1) o essencial é pago primeiro; 2) cada escudo tem um destino; 3) imprevistos e custos sazonais planeados com antecedência; 4) dívida cara combatida por ordem; 5) pequenas mudanças constantes. ${esc(DISCLAIMER)}</p>`;
  bindReserve(el);
}

export function reserveButton(c) {
  const porReservar = c.levels.slice(1).reduce((s, l) => s + Math.min(l.porReservar || 0, Math.max(0, l.coberto - (l.reservado || 0))), 0);
  return porReservar > 0 ? `<button class="btn primary wide big" data-reserve>${icon('target')} Reservar este mês (${money(porReservar)})</button>` : '';
}

export function bindReserve(el) {
  el.querySelector('[data-reserve]')?.addEventListener('click', openReserveSheet);
}

/** Folha "Reservar este mês": valores sugeridos por envelope, editáveis. */
export function openReserveSheet() {
  const c = cascade(store.get(), today());
  const rows = [];
  for (const l of c.levels.slice(1)) {
    let disp = l.coberto - (l.reservado || 0);
    for (const i of l.items) {
      const sug = Math.min(i.porReservar, Math.max(0, disp));
      disp -= sug;
      if (i.porReservar > 0) rows.push({ key: i.key, nome: `${l.titulo}: ${i.nome}`, sug });
    }
  }
  const s = sheet(`<h2>Reservar este mês</h2>
    <p class="muted small">O dinheiro fica na conta; a app marca-o como destinado a cada fundo (envelopes).</p>
    ${rows.map((r, n) => moneyField(`r-${n}`, r.nome, r.sug)).join('')}
    <p class="error" id="r-err"></p>
    <button class="btn primary big wide" id="r-ok">Confirmar reservas</button>`);
  $('#r-ok', s.el).addEventListener('click', () => {
    const amounts = {};
    for (const [n, r] of rows.entries()) {
      const v = readMoney($(`#r-${n}`, s.el));
      if (v === undefined) return ($('#r-err', s.el).textContent = 'Há um valor inválido.');
      amounts[r.key] = v || 0;
    }
    const created = store.update((db) => reserveCycle(db, today(), { newId, amounts }));
    s.close();
    toast(created.length ? `Reservado: ${money(created.reduce((t, a) => t + a.valor, 0))}` : 'Nada reservado');
  });
}

function renderEmergencia(el) {
  const db = store.get();
  const ef = db.emergencyFund;
  const st = emergencyStatus(db, today());
  const meses = st.mesesCobertos.toLocaleString('pt-PT', { maximumFractionDigits: 1 });
  el.innerHTML = `
    <div class="hero"><div class="label">Fundo de emergência</div><div class="value num">${money(st.saldo)}</div>
      <div class="muted">cobre <b>${meses}</b> ${st.mesesCobertos >= 1 && st.mesesCobertos < 2 ? 'mês' : 'meses'} de despesas essenciais (${money(st.base)}/mês)</div></div>
    <div class="card"><h2><span>Etapas</span></h2>
      <ul class="cat-rows">${st.etapas.map((e) => `<li class="cat-row"><span class="badge" style="--c:var(--primary)">${e.atingida ? '✅' : e.meses}</span>
        <div class="item-main"><div class="cat-row-top"><span class="name">${e.meses} ${e.meses === 1 ? 'mês' : 'meses'}</span><span class="num">${money(e.alvo)}</span></div>
          ${progressBar(e.alvo ? st.saldo / e.alvo : 0, e.atingida ? 'ok' : 'meta')}
          <div class="item-sub">${e.atingida ? 'Atingida' : e.data ? `Faltam ${money(e.falta)} · previsto para ${esc(formatDate(e.data))}` : `Faltam ${money(e.falta)} · defina a contribuição`}</div></div></li>`).join('')}</ul></div>
    ${st.reposicao?.ativa ? `<div class="card alert-card warn"><h2><span>Plano de reposição</span></h2>
      <p>Usou ${money(st.reposicao.total)} em ${esc(formatDate(st.reposicao.inicio))}. Reposto: ${money(st.reposicao.reposto)} · faltam ${money(st.reposicao.falta)}.</p>
      ${progressBar(st.reposicao.reposto / st.reposicao.total, 'meta')}<p class="small">Reserve <b>${money(st.reposicao.valorMensal)}</b> por mês até repor.</p></div>` : ''}
    <div class="card"><h2><span>Regras</span></h2>
      ${numberField('e-pct', 'Contribuição mensal', ef.percentagemSalario, { min: 0, max: 100, step: 0.5, suffix: '% do salário' })}
      <p class="muted small num">= ${money(st.contribuicao)} por mês</p>
      <label class="field"><span>Ligar a uma conta de poupança (opcional)</span><select id="e-conta">${options(db.accounts.filter((a) => !a.arquivada), ef.contaId, { empty: 'Não: usar envelope virtual' })}</select></label>
      ${moneyField('e-base', 'Despesas essenciais por mês (vazio = calcular)', ef.baseMensalManual, { placeholder: money(essentialMonthly(db)) })}
      <p class="small">Só se mexe neste fundo para <b>imprevistos</b> (saúde, avaria, perda de rendimento). Para custos que se sabem com antecedência use os fundos de provisão.</p>
    </div>
    <div class="row-btns">
      <button class="btn" id="e-use">Usar num imprevisto</button>
      ${ef.contaId ? '' : `<button class="btn primary" id="e-add">${icon('plus')} Reservar</button>`}
    </div>`;

  $('#e-pct', el).addEventListener('change', (e) => {
    const v = readNumber(e.target);
    if (v === undefined || v < 0 || v > 100) return toast('Percentagem inválida');
    store.update((db) => { db.emergencyFund.percentagemSalario = v ?? 0; });
  });
  $('#e-conta', el).addEventListener('change', (e) => store.update((db) => { db.emergencyFund.contaId = e.target.value || null; }));
  $('#e-base', el).addEventListener('change', (e) => {
    const v = readMoney(e.target);
    if (v === undefined) return toast('Valor inválido');
    store.update((db) => { db.emergencyFund.baseMensalManual = v; });
  });
  $('#e-add', el)?.addEventListener('click', () => amountSheet('Reservar no fundo de emergência', (v) => {
    store.update((db) => db.allocations.push({ id: newId(), data: today(), destino: 'emergencia', destinoId: null, valor: v, origem: 'manual', nota: '' }));
    toast(`Reservado: ${money(v)}`);
  }));
  $('#e-use', el).addEventListener('click', openUseSheet);
}

function openUseSheet() {
  const s = sheet(`<h2>Usar o fundo de emergência</h2>
    <p class="small">Use apenas para imprevistos. A app cria um plano para repor o valor.</p>
    ${moneyField('u-val', 'Valor usado', null)}
    <label class="field"><span>Motivo</span><input id="u-nota" maxlength="60" placeholder="Ex.: consulta, avaria do frigorífico"></label>
    ${numberField('u-meses', 'Repor em', 6, { min: 1, max: 24, suffix: 'meses' })}
    <p class="error" id="u-err"></p>
    <button class="btn primary big wide" id="u-ok">Registar uso</button>`);
  $('#u-ok', s.el).addEventListener('click', () => {
    const v = readMoney($('#u-val', s.el));
    const meses = readNumber($('#u-meses', s.el)) || 6;
    if (!v) return ($('#u-err', s.el).textContent = 'Indique o valor.');
    const plan = store.update((db) => useEmergency(db, v, today(), { newId, nota: $('#u-nota', s.el).value.trim(), meses }));
    s.close();
    toast(`Plano de reposição: ${money(plan.valorMensal)} por mês`, { duration: 5000 });
  });
}

/** Folha simples para pedir um valor. */
export function amountSheet(title, onOk, { label = 'Valor', hint = '' } = {}) {
  const s = sheet(`<h2>${esc(title)}</h2>${hint ? `<p class="muted small">${esc(hint)}</p>` : ''}
    <label class="amount"><input id="a-val" inputmode="decimal" placeholder="0" aria-label="${esc(label)}"><span>CVE</span></label>
    <p class="error" id="a-err"></p><button class="btn primary big wide" id="a-ok">Confirmar</button>`);
  const ok = () => {
    const v = readMoney($('#a-val', s.el));
    if (!v) return ($('#a-err', s.el).textContent = 'Indique um valor maior que zero.');
    s.close();
    onOk(v);
  };
  $('#a-ok', s.el).addEventListener('click', ok);
  $('#a-val', s.el).addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  setTimeout(() => $('#a-val', s.el).focus(), 280);
}

