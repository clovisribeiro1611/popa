// Custos variáveis do dia a dia: luz/água pré-pagas, gás, cesta alimentar semanal e telefone/internet.

import { store, newId } from '../store.js';
import { UTILITIES, utilityEstimate, weeklyFood, servicesVariation } from '../finance.js';
import { formatDate } from '../domain.js';
import {
  $, esc, money, sheet, toast, confirmDialog, icon, options, progressBar, today, moneyField, numberField, readMoney, readNumber, settings
} from '../ui.js';

function utilityCard(db, tipo) {
  const u = UTILITIES[tipo];
  const st = utilityEstimate(db, tipo, today());
  const e = st.estimativa;
  let body;
  if (!st.registos) body = '<p class="muted small">Sem registos. Registe o próximo carregamento para a app começar a estimar.</p>';
  else if (!e) body = `<p class="small">Último ${u.acao}: ${esc(formatDate(st.ultimo.data))} · ${money(st.ultimo.valor)}</p>
    <p class="muted small">Com mais um registo a app estima quanto tempo dura.</p>`;
  else body = `
    <div class="stat-row">
      <div class="stat ${e.aviso ? 'critical' : ''}"><div class="label">Acaba por volta de</div><div class="value">${esc(formatDate(e.acabaEm, { year: false }))}</div>
        <div class="muted small">${e.diasRestantes === 0 ? 'hoje ou já acabou' : `faltam ~${e.diasRestantes} dias`}</div></div>
      <div class="stat"><div class="label">Reservar por semana</div><div class="value">${money(e.reservaSemana, { symbol: false })}</div>
        <div class="muted small">≈ ${money(e.custoMes)}/mês</div></div>
    </div>
    <p class="muted small">Último ${u.acao}: ${esc(formatDate(st.ultimo.data))} · ${money(st.ultimo.valor)} · dura ~${e.duracao} dias</p>`;
  return `<div class="card ${e?.aviso ? 'alert-card bad' : ''}"><h2><span>${u.icone} ${esc(u.nome)}</span>
      <button class="link" data-log="${tipo}">${icon('plus')} Registar</button></h2>${body}</div>`;
}

export function render(host) {
  const el = document.createElement('div');
  el.className = 'cols-wide';
  host.replaceChildren(el);
  const db = store.get();
  const w = weeklyFood(db, today());
  const servicos = servicesVariation(db, today());
  const recent = [...db.utilityLogs].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 8);
  const estadoTxt = { ok: 'Dentro do ritmo', acima: 'Acima do ritmo', excedido: 'Orçamento da semana ultrapassado' };

  el.innerHTML = `
    <div class="card ${w.estado === 'excedido' ? 'alert-card bad' : w.estado === 'acima' ? 'alert-card' : ''}">
      <h2><span>🛒 Cesta alimentar da semana</span><span class="muted small">${esc(formatDate(w.inicio, { year: false }))} – ${esc(formatDate(w.fim, { year: false }))}</span></h2>
      ${w.orcamento ? `
        ${progressBar(w.gasto / w.orcamento, w.estado === 'ok' ? 'ok' : w.estado === 'acima' ? 'aviso' : 'excedido')}
        <p class="num"><b>${money(w.gasto)}</b> de ${money(w.orcamento)} · ${esc(estadoTxt[w.estado])}</p>
        <p class="small">${w.restante >= 0 ? `Restam ${money(w.restante)}: cerca de <b>${money(w.porDiaRestante)}</b> por dia até domingo.` : `Passou ${money(-w.restante)} do orçamento semanal.`}</p>
        ${w.meioDaSemana ? `<p class="small muted">Ponto de meio da semana: o esperado até hoje era ${money(w.esperado)}.</p>` : ''}`
      : '<p class="muted small">Defina a cesta por pessoa no Perfil (ou um orçamento para a alimentação) para acompanhar a semana.</p>'}
    </div>
    ${utilityCard(db, 'eletricidade')}
    ${utilityCard(db, 'agua')}
    ${utilityCard(db, 'gas')}
    ${servicos.map((s) => `<div class="card ${s.alerta ? 'alert-card' : ''}"><h2><span>${esc(s.categoria.icone)} ${esc(s.categoria.nome)}</span></h2>
      ${s.fixo ? `<p class="num">${money(s.gasto)} este ciclo · valor fixo ${money(s.fixo)}</p>
        ${s.alerta ? `<p class="small"><b>Subiu ${Math.round(s.variacao * 100)}%</b> face ao valor habitual. Verifique o tarifário ou o consumo.</p>` : ''}`
      : `<p class="muted small">Defina o valor mensal habitual (orçamento da categoria) para ser avisado de variações.</p>`}</div>`).join('')}
    ${recent.length ? `<h3 class="section-title">Últimos registos</h3><ul class="list">${recent.map((l) => `<li><button class="item" data-logid="${l.id}">
      <span class="badge" style="--c:var(--primary)">${UTILITIES[l.tipo].icone}</span>
      <div class="item-main"><div class="item-title">${esc(UTILITIES[l.tipo].nome)}</div><div class="item-sub">${esc(formatDate(l.data))}${l.quantidade ? ` · ${l.quantidade} ${UTILITIES[l.tipo].unidade}` : ''}</div></div>
      <b class="num">${money(l.valor)}</b></button></li>`).join('')}</ul>` : ''}`;

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-log]');
    if (b) openLogSheet(b.dataset.log);
    const l = e.target.closest('[data-logid]');
    if (l) deleteLog(l.dataset.logid);
  });
}

function openLogSheet(tipo) {
  const db = store.get();
  const u = UTILITIES[tipo];
  const cat = db.categories.find((c) => c.essencialTipo === (tipo === 'gas' ? 'gas' : 'energia') && !c.arquivada);
  const preco = tipo === 'gas' ? db.household.parametros.precoBotija : null;
  const last = utilityEstimate(db, tipo, today()).ultimo;
  const s = sheet(`<h2>${u.icone} Registar ${u.acao}</h2>
    ${moneyField('u-val', 'Valor pago', preco ?? last?.valor ?? null)}
    <div class="field-row">
      <label class="field"><span>Data</span><input type="date" id="u-data" value="${today()}"></label>
      ${tipo === 'gas' ? '' : numberField('u-qtd', `Quantidade (opcional)`, null, { min: 0, max: 100000, step: 0.1, suffix: u.unidade })}
    </div>
    <label class="field"><span>Conta</span><select id="u-conta">${options(db.accounts.filter((a) => !a.arquivada), settings().contaPorDefeito)}</select></label>
    <label class="check"><input type="checkbox" id="u-tx" ${cat ? 'checked' : 'disabled'}> Registar também como despesa${cat ? ` em “${esc(cat.nome)}”` : ''}</label>
    <p class="error" id="u-err"></p>
    <button class="btn primary big wide" id="u-ok">Guardar</button>`);
  const el = s.el;
  $('#u-ok', el).addEventListener('click', () => {
    const valor = readMoney($('#u-val', el));
    const data = $('#u-data', el).value || today();
    const qtd = $('#u-qtd', el) ? readNumber($('#u-qtd', el)) : null;
    if (!valor) return ($('#u-err', el).textContent = 'Indique o valor.');
    if (qtd === undefined) return ($('#u-err', el).textContent = 'Quantidade inválida.');
    store.update((db) => {
      let transacaoId = null;
      if ($('#u-tx', el).checked && cat) {
        transacaoId = newId();
        db.transactions.push({ id: transacaoId, data, valor, tipo: 'despesa', contaId: $('#u-conta', el).value, contaDestinoId: null,
          categoriaId: cat.id, descricao: tipo === 'gas' ? 'Botija de gás' : `Carregamento ${tipo === 'agua' ? 'água' : 'eletricidade'}`,
          notas: '', recorrenteId: null, criadoEm: new Date().toISOString() });
      }
      db.utilityLogs.push({ id: newId(), tipo, data, valor, quantidade: qtd, transacaoId });
    });
    s.close();
    const e = utilityEstimate(store.get(), tipo, today()).estimativa;
    toast(e?.acabaEm ? `Registado. Deve durar até ${formatDate(e.acabaEm, { year: false })}.` : 'Registado');
  });
}

async function deleteLog(id) {
  const l = store.get().utilityLogs.find((x) => x.id === id);
  if (!(await confirmDialog(`Apagar o registo de ${formatDate(l.data)} (${money(l.valor)})?${l.transacaoId ? ' A despesa associada também é apagada.' : ''}`, { ok: 'Apagar', danger: true }))) return;
  store.update((db) => {
    db.utilityLogs = db.utilityLogs.filter((x) => x.id !== id);
    if (l.transacaoId) db.transactions = db.transactions.filter((t) => t.id !== l.transacaoId);
  });
}


