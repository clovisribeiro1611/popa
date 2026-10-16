// Dívidas: rácio de endividamento (semáforo), registo, pagamentos, estratégia avalanche/bola de neve
// e simulação do impacto de um crédito novo antes de o aceitar.

import { store, newId } from '../store.js';
import { DEBT_TYPES, debtRatio, debtBalance, debtPlan, newCreditImpact, activeDebts, envelopeBalance } from '../finance.js';
import { addMonths, formatDate } from '../domain.js';
import {
  $, esc, money, sheet, toast, confirmDialog, icon, options, progressBar, today, settings, moneyField, numberField, readMoney, readNumber, DISCLAIMER
} from '../ui.js';

const SEMAFORO = { verde: ['ok', '🟢', 'Saudável'], amarelo: ['aviso', '🟡', 'Atenção'], vermelho: ['excedido', '🔴', 'Perigoso'] };
const fmtPct = (p) => `${p.toLocaleString('pt-PT', { maximumFractionDigits: 1 })}%`;
const mesesTxt = (m) => (m == null ? '—' : m < 12 ? `${m} ${m === 1 ? 'mês' : 'meses'}` : `${Math.floor(m / 12)} ${m < 24 ? 'ano' : 'anos'}${m % 12 ? ` e ${m % 12} ${m % 12 === 1 ? 'mês' : 'meses'}` : ''}`);

export function ratioCard(r) {
  if (r.pct == null) return '<div class="card"><p class="muted">Indique o salário no Perfil para calcular o rácio de endividamento.</p></div>';
  const [cls, dot, txt] = SEMAFORO[r.estado];
  return `<div class="card ${r.aviso ? 'alert-card bad' : ''}">
    <h2><span>Rácio de endividamento</span><span class="chip ${r.estado === 'verde' ? 'ok' : r.estado === 'amarelo' ? 'warn' : 'bad'}">${dot} ${txt}</span></h2>
    <div class="hero" style="padding:0"><div class="value">${fmtPct(r.pct)}</div>
      <div class="muted small num">${money(r.prestacoes)} em prestações ÷ ${money(r.salario)} de salário</div></div>
    ${progressBar(Math.min(1, r.pct / 50), cls)}
    <p class="muted small">Verde até ${r.verde}% · amarelo até ${r.amarelo}% · vermelho acima.</p>
    ${r.aviso ? `<p><b>As prestações passam de ${r.amarelo}% do salário.</b> Não aceite crédito novo e use a estratégia abaixo para baixar este valor.</p>` : ''}
  </div>`;
}

export function render(host) {
  const el = document.createElement('div');
  host.replaceChildren(el);
  const db = store.get();
  const r = debtRatio(db);
  const debts = db.debts.filter((d) => d.ativa !== false);
  const plan = debtPlan(db);
  const t = today();
  const fim = (m) => (m == null ? '—' : formatDate(addMonths(t, m), { year: true }));

  el.innerHTML = `
    ${ratioCard(r)}
    <h3 class="section-title">Dívidas</h3>
    ${debts.length ? `<ul class="list">${debts.map((d) => {
      const saldo = debtBalance(db, d);
      return `<li><button class="item" data-debt="${d.id}"><span class="badge" style="--c:var(--neg)">💳</span>
        <div class="item-main"><div class="item-title">${esc(d.nome)}</div>
          <div class="item-sub">${esc(DEBT_TYPES[d.tipo] || '')}${d.taxaAnual ? ` · ${fmtPct(d.taxaAnual)}/ano` : ''}${d.credor ? ` · ${esc(d.credor)}` : ''}</div>
          <div class="item-sub num">Prestação ${money(d.prestacao)}${saldo === 0 ? ' · <b>paga</b>' : ''}</div></div>
        <b class="num">${money(saldo)}</b></button></li>`;
    }).join('')}</ul>` : '<p class="muted">Sem dívidas registadas. 👍</p>'}
    <button class="btn wide" id="d-new">${icon('plus')} Registar dívida</button>
    ${envelopeBalance(db, 'divida') > 0 ? `<div class="card alert-card ok"><p>Tem <b>${money(envelopeBalance(db, 'divida'))}</b> reservados para pagar dívidas acima do mínimo.
      Use-os num pagamento à dívida que a estratégia indica em primeiro (${esc(plan.plano.ordem[0]?.nome || '—')}).</p></div>` : ''}

    ${activeDebts(db).length ? `
    <h3 class="section-title">Estratégia de pagamento</h3>
    <div class="card">
      <div class="seg" id="d-met"><button data-m="avalanche" class="${plan.metodo === 'avalanche' ? 'sel' : ''}">Avalanche</button>
        <button data-m="bolaDeNeve" class="${plan.metodo === 'bolaDeNeve' ? 'sel' : ''}">Bola de neve</button></div>
      <p class="muted small">${plan.metodo === 'avalanche'
        ? 'Paga primeiro a dívida com a <b>taxa mais alta</b>: é a que poupa mais juros.'
        : 'Paga primeiro a dívida com o <b>saldo mais pequeno</b>: vitórias rápidas que dão motivação.'} Quando uma dívida acaba, a prestação dela passa para a seguinte.</p>
      ${moneyField('d-extra', 'Valor extra por mês (nível 4 da cascata)', plan.extra || null, { placeholder: '0' })}
      ${plan.plano.impossivel ? '<p class="error">Há uma dívida em que a prestação não chega para os juros: o saldo nunca baixa. Renegoceie ou aumente a prestação.</p>' : `
      <table class="cmp"><thead><tr><th></th><th>Só o mínimo</th><th>${plan.metodo === 'avalanche' ? 'Avalanche' : 'Bola de neve'}${plan.extra ? ' + extra' : ''}</th></tr></thead>
        <tbody><tr><td>Livre de dívidas em</td><td>${plan.minimo.impossivel ? 'nunca' : mesesTxt(plan.minimo.meses)}</td><td><b>${mesesTxt(plan.plano.meses)}</b></td></tr>
        <tr><td>Juros pagos</td><td class="num">${plan.minimo.impossivel ? '—' : money(plan.minimo.totalJuros)}</td><td class="num"><b>${money(plan.plano.totalJuros)}</b></td></tr></tbody></table>
      ${plan.poupa && (plan.poupa.juros > 0 || plan.poupa.meses > 0) ? `<p class="pos">Poupa <b>${money(plan.poupa.juros)}</b> em juros e termina <b>${mesesTxt(plan.poupa.meses)}</b> mais cedo.</p>` : ''}
      <p class="muted small">Com ${plan.metodo === 'avalanche' ? 'bola de neve' : 'avalanche'}: ${mesesTxt(plan.alternativa.meses)}, juros ${money(plan.alternativa.totalJuros || 0)}.</p>
      <h4 class="sub">Ordem de pagamento</h4>
      <ol class="cuts">${plan.plano.ordem.map((d) => `<li><span>${esc(d.nome)}</span><span class="muted small">paga em ${esc(fim(d.mes))}</span></li>`).join('')}</ol>
      ${plan.semTaxa.length ? `<p class="muted small">Sem taxa indicada (contam como 0%): ${plan.semTaxa.map(esc).join(', ')}.</p>` : ''}`}
    </div>` : ''}

    <button class="btn wide" id="d-sim">Antes de aceitar crédito novo: simular</button>
    <p class="muted small">Saldos aproximados: os juros não são somados automaticamente. Atualize o saldo com o extrato. ${esc(DISCLAIMER)}</p>`;

  $('#d-new', el).addEventListener('click', () => openDebtSheet());
  $('#d-sim', el).addEventListener('click', openCreditSim);
  $('#d-met', el)?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]');
    if (b) store.update((db) => { db.settings.dividas.metodo = b.dataset.m; });
  });
  $('#d-extra', el)?.addEventListener('change', (e) => {
    const v = readMoney(e.target);
    if (v === undefined) return toast('Valor inválido');
    store.update((db) => { db.settings.dividas.extraMensal = v || 0; });
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-debt]');
    if (b) openDebtSheet(store.get().debts.find((d) => d.id === b.dataset.debt));
  });
}

function openDebtSheet(d = null) {
  const db = store.get();
  const saldo = d ? debtBalance(db, d) : null;
  const s = sheet(`<h2>${d ? esc(d.nome) : 'Nova dívida'}</h2>
    ${d ? `<p class="num">Saldo atual ≈ <b>${money(saldo)}</b></p>
      <div class="row-btns"><button class="btn primary" id="d-pay">Registar pagamento</button></div>` : ''}
    <label class="field"><span>Nome</span><input id="d-nome" maxlength="40" value="${esc(d?.nome)}" placeholder="Ex.: Crédito pessoal BCA"></label>
    <div class="field-row">
      <label class="field"><span>Tipo</span><select id="d-tipo">${options(Object.entries(DEBT_TYPES), d?.tipo || 'banco', { value: (x) => x[0], label: (x) => x[1] })}</select></label>
      <label class="field"><span>Credor (opcional)</span><input id="d-cred" maxlength="40" value="${esc(d?.credor)}"></label>
    </div>
    <div class="field-row">
      ${moneyField('d-saldo', d ? 'Corrigir saldo (extrato)' : 'Saldo em dívida', d ? null : null, { placeholder: d ? money(saldo) : '' })}
      ${moneyField('d-prest', 'Prestação mensal', d?.prestacao ?? null)}
    </div>
    <div class="field-row">
      ${numberField('d-taxa', 'Taxa de juro (opcional)', d?.taxaAnual, { min: 0, max: 200, step: 0.1, suffix: '% ao ano' })}
      ${numberField('d-dia', 'Dia de pagamento', d?.diaPagamento, { min: 1, max: 31 })}
    </div>
    ${numberField('d-prazo', 'Prazo restante (opcional)', d?.prazoMeses, { min: 1, max: 600, suffix: 'meses' })}
    <p class="error" id="d-err"></p>
    <div class="row-btns">${d ? `<button class="btn danger" id="d-del">${icon('trash')}</button>` : ''}<button class="btn primary big" id="d-save">Guardar</button></div>`);
  const el = s.el;

  $('#d-save', el).addEventListener('click', () => {
    const nome = $('#d-nome', el).value.trim();
    const novoSaldo = readMoney($('#d-saldo', el));
    const prest = readMoney($('#d-prest', el));
    const taxa = readNumber($('#d-taxa', el)), dia = readNumber($('#d-dia', el)), prazo = readNumber($('#d-prazo', el));
    if (!nome) return ($('#d-err', el).textContent = 'Indique o nome.');
    if (!d && !novoSaldo) return ($('#d-err', el).textContent = 'Indique o saldo em dívida.');
    if (!prest) return ($('#d-err', el).textContent = 'Indique a prestação mensal (no fiado, quanto conta pagar por mês).');
    if ([novoSaldo, taxa, dia, prazo].includes(undefined)) return ($('#d-err', el).textContent = 'Há um valor inválido.');
    store.update((db) => {
      let x = db.debts.find((y) => y.id === d?.id);
      if (!x) { x = { id: newId(), ativa: true, criadoEm: today() }; db.debts.push(x); }
      Object.assign(x, { nome, tipo: $('#d-tipo', el).value, credor: $('#d-cred', el).value.trim(), prestacao: prest,
        taxaAnual: taxa, diaPagamento: dia, prazoMeses: prazo });
      if (novoSaldo != null) { x.saldo = novoSaldo; x.dataSaldo = addOneDay(today()); }
    });
    s.close();
  });
  $('#d-pay', el)?.addEventListener('click', () => { s.close(); openPaySheet(d); });
  $('#d-del', el)?.addEventListener('click', async () => {
    if (!(await confirmDialog(`Apagar “${d.nome}”? Os pagamentos registados continuam nos movimentos.`, { ok: 'Apagar', danger: true }))) return;
    store.update((db) => { db.debts = db.debts.filter((x) => x.id !== d.id); });
    s.close();
  });
}

// O saldo corrigido hoje já inclui os pagamentos feitos até hoje.
const addOneDay = (iso) => { const dt = new Date(`${iso}T12:00:00Z`); dt.setUTCDate(dt.getUTCDate() + 1); return dt.toISOString().slice(0, 10); };

function openPaySheet(d) {
  const db = store.get();
  const cat = db.categories.find((c) => c.essencialTipo === 'dividas' && !c.arquivada);
  const reserva = envelopeBalance(db, 'divida');
  const s = sheet(`<h2>Pagamento: ${esc(d.nome)}</h2>
    ${moneyField('p-val', 'Valor pago', d.prestacao)}
    <div class="field-row">
      <label class="field"><span>Data</span><input type="date" id="p-data" value="${today()}"></label>
      <label class="field"><span>Conta</span><select id="p-conta">${options(db.accounts.filter((a) => !a.arquivada), settings().contaPorDefeito)}</select></label>
    </div>
    ${reserva > 0 ? `<label class="check"><input type="checkbox" id="p-res" checked> Usar a reserva para dívidas (${money(reserva)} disponíveis)</label>` : ''}
    <p class="muted small">Fica registado como despesa em “${esc(cat?.nome || 'Prestações e dívidas')}” e desconta no saldo da dívida.</p>
    <p class="error" id="p-err"></p><button class="btn primary big wide" id="p-ok">Registar</button>`);
  $('#p-ok', s.el).addEventListener('click', () => {
    const v = readMoney($('#p-val', s.el));
    if (!v) return ($('#p-err', s.el).textContent = 'Indique o valor.');
    const usarReserva = $('#p-res', s.el)?.checked;
    store.update((db) => {
      const data = $('#p-data', s.el).value || today();
      const txId = newId();
      db.transactions.push({ id: txId, data, valor: v, tipo: 'despesa',
        contaId: $('#p-conta', s.el).value, contaDestinoId: null, categoriaId: cat?.id ?? null, descricao: `Pagamento ${d.nome}`,
        notas: '', recorrenteId: null, dividaId: d.id, criadoEm: new Date().toISOString() });
      // Pago com o dinheiro reservado para dívidas: liberta o envelope até ao saldo dele.
      const daReserva = usarReserva ? Math.min(v, reserva) : 0;
      if (daReserva > 0) db.allocations.push({ id: newId(), data, destino: 'divida', destinoId: d.id, valor: -daReserva, origem: 'uso', nota: `Pagamento ${d.nome}`, transacaoId: txId });
    });
    s.close();
    toast(`Pagamento registado. Saldo ≈ ${money(debtBalance(store.get(), store.get().debts.find((x) => x.id === d.id)))}`);
  });
}

function openCreditSim() {
  const s = sheet(`<h2>Crédito novo ou compra a prestações</h2>
    <p class="muted small">Simule antes de assinar. Não altera os seus dados.</p>
    ${moneyField('c-prest', 'Prestação mensal', null)}
    <div class="field-row">${moneyField('c-total', 'Valor total a pagar', null)}${numberField('c-taxa', 'Taxa', null, { min: 0, max: 200, step: 0.1, suffix: '% ao ano' })}</div>
    <button class="btn primary wide" id="c-go">Calcular impacto</button>
    <div id="c-res"></div>`);
  $('#c-go', s.el).addEventListener('click', () => {
    const prestacao = readMoney($('#c-prest', s.el));
    if (!prestacao) return ($('#c-res', s.el).innerHTML = '<p class="error">Indique a prestação.</p>');
    const r = newCreditImpact(store.get(), today(), { prestacao, saldo: readMoney($('#c-total', s.el)) || 0, taxaAnual: readNumber($('#c-taxa', s.el)) || null });
    const veredito = { ok: ['ok', 'O rácio fica dentro do limite saudável.'], cuidado: ['warn', 'O rácio entra na zona amarela: só se for mesmo necessário.'],
      nao: ['bad', 'Não aceite: o rácio passa o limite ou o salário deixa de chegar para o essencial e as reservas.'] }[r.recomendacao];
    $('#c-res', s.el).innerHTML = `<div class="card alert-card ${veredito[0]}">
      <p>Rácio: <b>${fmtPct(r.antes.pct ?? 0)}</b> → <b>${fmtPct(r.depois.pct ?? 0)}</b> (${esc(SEMAFORO[r.depois.estado]?.[2] || '')})</p>
      <p>Livre para gastar planeado: ${money(r.livreAntes)} → <b>${money(r.livreDepois)}</b>${r.deficeDepois ? ` · <span class="neg">défice de ${money(r.deficeDepois)}</span>` : ''}</p>
      <p><b>${esc(veredito[1])}</b></p></div>`;
  });
}


