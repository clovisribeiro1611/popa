// Simulador "e se": cenários rápidos sobre uma cópia dos dados (nunca altera os dados reais).

import { store, newId } from '../store.js';
import { simulateScenario } from '../finance.js';
import { $, esc, money, toast, icon, options, today, moneyField, numberField, readMoney, readNumber, DISCLAIMER } from '../ui.js';

const PRESETS = [
  ['Salário −10%', { salarioPct: -10 }],
  ['Salário +10%', { salarioPct: 10 }],
  ['Alimentação +10%', { alimentacaoPct: 10 }],
  ['Mais um filho', { filhosDelta: 1 }],
  ['Perder rendimentos extra', { perdaExtra: 'todos' }]
];

// Cenário em edição (mantém-se ao navegar).
let atual = {};

const fmtPct = (p) => (p == null ? '—' : `${p.toLocaleString('pt-PT', { maximumFractionDigits: 1 })}%`);
const meses = (m) => m.toLocaleString('pt-PT', { maximumFractionDigits: 1 });
const signed = (v) => (v === 0 ? '=' : money(v, { sign: true }));

function resultTable(r) {
  const row = (label, a, b, d, good) => `<tr><td>${label}</td><td class="num">${a}</td><td class="num"><b>${b}</b></td>
    <td class="num ${d === '=' ? '' : good ? 'pos' : 'neg'}">${d}</td></tr>`;
  const etapa = (m) => (m.emergencia.etapa?.data ? `${m.emergencia.etapa.meses} m. em ${m.emergencia.etapa.data.slice(0, 7)}` : m.emergencia.etapa ? 'sem contribuição' : 'atingidas');
  return `<table class="cmp"><thead><tr><th></th><th>Hoje</th><th>Cenário</th><th>Diferença</th></tr></thead><tbody>
    ${row('Rendimento mensal', money(r.base.rendimento), money(r.cenario.rendimento), signed(r.delta.rendimento), r.delta.rendimento >= 0)}
    ${row('Essenciais', money(r.base.essenciais), money(r.cenario.essenciais), signed(r.cenario.essenciais - r.base.essenciais), r.cenario.essenciais <= r.base.essenciais)}
    ${row('Livre para gastar', money(r.base.livre), money(r.cenario.livre), signed(r.delta.livre), r.delta.livre >= 0)}
    ${r.cenario.deficit || r.base.deficit ? row('Défice', money(r.base.deficit), money(r.cenario.deficit), signed(r.delta.deficit), r.delta.deficit <= 0) : ''}
    ${row('Contribuição emergência', money(r.base.emergencia.contribuicao), money(r.cenario.emergencia.contribuicao), signed(r.delta.contribuicaoEmergencia), r.delta.contribuicaoEmergencia >= 0)}
    ${row('Meses de emergência cobertos', meses(r.base.emergencia.mesesCobertos), meses(r.cenario.emergencia.mesesCobertos), '', r.cenario.emergencia.mesesCobertos >= r.base.emergencia.mesesCobertos)}
    ${row('Próxima etapa', esc(etapa(r.base)), esc(etapa(r.cenario)), '', true)}
    ${row('Rácio de endividamento', fmtPct(r.base.racio.pct), fmtPct(r.cenario.racio.pct), r.delta.racio ? `${r.delta.racio > 0 ? '+' : ''}${fmtPct(r.delta.racio)}` : '=', r.delta.racio <= 0)}
  </tbody></table>`;
}

function verdict(r) {
  if (r.cenario.deficit > 0) return `<p class="neg"><b>Neste cenário o rendimento não chega para tudo: faltam ${money(r.cenario.deficit)} por mês.</b> Prepare-se já: reforce o fundo de emergência e reveja os gastos livres.</p>`;
  if (r.delta.livre < 0) return `<p>Fica com <b>${money(-r.delta.livre)}</b> a menos por mês para gastos livres, mas o essencial e as reservas continuam cobertos.</p>`;
  if (r.delta.livre > 0) return `<p class="pos">Fica com mais <b>${money(r.delta.livre)}</b> por mês. Sugestão: reforce primeiro o fundo de emergência e as dívidas antes de aumentar gastos.</p>`;
  return '<p>Sem impacto no plano mensal.</p>';
}

export function render(host) {
  const el = document.createElement('div');
  host.replaceChildren(el);
  const db = store.get();
  const a = atual;
  const r = simulateScenario(db, today(), a);
  const extras = db.household.rendimentosExtra;

  el.innerHTML = `
    <p class="muted small">Experimente cenários sem mexer nos seus dados. Os cálculos usam o plano do perfil (salário e rendimentos esperados).</p>
    <div class="chips wrap">${PRESETS.map(([l], i) => `<button data-preset="${i}">${esc(l)}</button>`).join('')}<button data-preset="clear">Limpar</button></div>
    <div class="card">
      <div class="field-row">
        ${numberField('s-sal', 'Salário', a.salarioPct ?? null, { min: -100, max: 300, step: 1, suffix: '% de variação', placeholder: '0' })}
        ${numberField('s-ali', 'Preço da alimentação', a.alimentacaoPct ?? null, { min: -100, max: 300, step: 1, suffix: '%', placeholder: '0' })}
      </div>
      <div class="field-row">
        ${numberField('s-fil', 'Filhos a mais', a.filhosDelta ?? null, { min: 0, max: 10, placeholder: '0' })}
        <label class="field"><span>Perder rendimento extra</span><select id="s-ext">${options([['todos', 'Todos'], ...extras.map((x) => [x.id, x.descricao])], a.perdaExtra || '', { value: (x) => x[0], label: (x) => x[1], empty: 'Nenhum' })}</select></label>
      </div>
      <div class="field-row">
        ${moneyField('s-dprest', 'Dívida nova: prestação', a.novaDivida?.prestacao ?? null)}
        ${numberField('s-dtaxa', 'taxa', a.novaDivida?.taxaAnual ?? null, { min: 0, max: 200, step: 0.1, suffix: '%' })}
      </div>
    </div>
    <div class="card"><h2><span>Impacto</span></h2>${resultTable(r)}${verdict(r)}</div>
    <div class="row-btns"><input id="s-nome" class="grow" placeholder="Nome do cenário" maxlength="40" style="min-height:48px;border-radius:12px;border:1px solid var(--border);background:var(--surface-2);padding:0 12px">
      <button class="btn" id="s-save">${icon('plus')} Guardar</button></div>
    ${db.scenarios.length ? `<h3 class="section-title">Cenários guardados</h3><ul class="list">${db.scenarios.map((s) => {
      const rr = simulateScenario(db, today(), s.ajustes);
      return `<li class="item"><button class="item-main link" style="text-align:left;color:inherit" data-load="${s.id}">
        <div class="item-title">${esc(s.nome)}</div><div class="item-sub num">Livre ${signed(rr.delta.livre)}${rr.cenario.deficit ? ` · défice ${money(rr.cenario.deficit)}` : ''}</div></button>
        <button class="icon-btn" data-del="${s.id}" aria-label="Apagar">${icon('trash')}</button></li>`;
    }).join('')}</ul>` : ''}
    <p class="muted small">${esc(DISCLAIMER)}</p>`;

  const rerender = () => render(host);
  const readAll = () => {
    const sal = readNumber($('#s-sal', el)), ali = readNumber($('#s-ali', el)), fil = readNumber($('#s-fil', el));
    const prest = readMoney($('#s-dprest', el)), taxa = readNumber($('#s-dtaxa', el));
    if ([sal, ali, fil, prest, taxa].includes(undefined)) return toast('Há um valor inválido');
    atual = {
      ...(sal ? { salarioPct: sal } : {}), ...(ali ? { alimentacaoPct: ali } : {}), ...(fil ? { filhosDelta: Math.round(fil) } : {}),
      ...($('#s-ext', el).value ? { perdaExtra: $('#s-ext', el).value } : {}),
      ...(prest ? { novaDivida: { prestacao: prest, taxaAnual: taxa || null } } : {})
    };
    rerender();
  };
  for (const id of ['#s-sal', '#s-ali', '#s-fil', '#s-ext', '#s-dprest', '#s-dtaxa']) $(id, el).addEventListener('change', readAll);
  el.addEventListener('click', (e) => {
    const p = e.target.closest('[data-preset]');
    if (p) { atual = p.dataset.preset === 'clear' ? {} : { ...atual, ...PRESETS[Number(p.dataset.preset)][1] }; rerender(); }
    const l = e.target.closest('[data-load]');
    if (l) { atual = structuredClone(store.get().scenarios.find((s) => s.id === l.dataset.load).ajustes); rerender(); }
    const d = e.target.closest('[data-del]');
    if (d) store.update((db) => { db.scenarios = db.scenarios.filter((s) => s.id !== d.dataset.del); });
  });
  $('#s-save', el).addEventListener('click', () => {
    const nome = $('#s-nome', el).value.trim();
    if (!nome) return toast('Dê um nome ao cenário');
    if (!Object.keys(atual).length) return toast('Defina pelo menos um ajuste');
    store.update((db) => db.scenarios.push({ id: newId(), nome, ajustes: structuredClone(atual), criadoEm: today() }));
    toast('Cenário guardado');
  });
}
