// Indicadores, avisos, conselhos (por regras) e revisões semanal/mensal.

import { store } from '../store.js';
import { advise, alerts, indicators, toggleAdviceDone, reviewsDue } from '../advisor.js';
import { cascade } from '../finance.js';
import { formatDate } from '../domain.js';
import { $$, esc, money, today, icon, toast, DISCLAIMER } from '../ui.js';
import { openReserveSheet } from './plano.js';

const ESTADO = { bom: 'ok', atencao: 'warn', mau: 'bad' };

export function adviceCards(list) {
  return list.map((a) => `<li class="advice ${a.feito ? 'done' : ''}">
    <div class="advice-head"><b>${esc(a.titulo)}</b>
      <button class="icon-btn small-btn" data-done="${esc(a.id)}" aria-label="${a.feito ? 'Desmarcar' : 'Marcar como feito'}">${a.feito ? icon('check') : '<span class="tick"></span>'}</button></div>
    <p>${esc(a.texto)}</p>
    <p class="porque"><span>Porquê:</span> ${esc(a.porque)}</p>
    ${a.acao ? `<a class="link" href="${esc(a.acao.href)}">${esc(a.acao.label)} ›</a>` : ''}
  </li>`).join('');
}

export function bindAdvice(el) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-done]');
    if (!b) return;
    e.preventDefault();
    store.update((db) => toggleAdviceDone(db, today(), b.dataset.done));
  });
}

export function alertList(list) {
  return `<ul class="alerts">${list.map((a) => `<li><a class="alert-row ${a.nivel}" href="${esc(a.href || '#/inicio')}">
    <span class="alert-ico">${esc(a.icone)}</span><span class="alert-txt"><b>${esc(a.titulo)}</b><span>${esc(a.texto)}</span></span>${icon('right')}</a></li>`).join('')}</ul>`;
}

/** Secção do Início: avisos + conselho do mês. */
export function inicioSection({ db, today: t }) {
  const avisos = alerts(db, t);
  const conselhos = advise(db, t);
  return {
    html: `${avisos.length ? `<h3 class="section-title">Avisos</h3>${alertList(avisos.slice(0, 5))}` : ''}
      <div class="card"><h2><span>💡 Conselho do mês</span><a class="link" href="#/conselheiro">Indicadores</a></h2>
        <ol class="advice-list">${adviceCards(conselhos)}</ol></div>`,
    bind: bindAdvice
  };
}

export function render(host) {
  const el = document.createElement('div');
  el.className = 'cols-wide';
  host.replaceChildren(el);
  const db = store.get();
  const t = today();
  const ind = indicators(db, t);
  const conselhos = advise(db, t, { limit: 10 });
  const avisos = alerts(db, t);
  el.innerHTML = `
    <div class="ind-grid">${ind.map((i) => `<div class="stat ind ${i.estado ? ESTADO[i.estado] : ''}">
      <div class="label">${esc(i.titulo)}</div><div class="value">${esc(i.fmt)}</div><div class="muted small">${esc(i.ajuda)}</div></div>`).join('')}</div>
    <div class="row-btns"><a class="btn" href="#/revisao">${icon('check')} Revisão</a><a class="btn" href="#/simulador">${icon('sim')} Simulador</a></div>
    <h3 class="section-title">Conselhos (por ordem de prioridade)</h3>
    <ol class="advice-list">${adviceCards(conselhos)}</ol>
    ${avisos.length ? `<h3 class="section-title">Avisos</h3>${alertList(avisos)}` : ''}
    <p class="muted small">${esc(DISCLAIMER)} Os conselhos são regras fixas aplicadas aos seus números; nada sai do telemóvel.</p>`;
  bindAdvice(el);
}

// ---------- Revisões ----------

const SEMANAL = [
  'Registei todos os gastos da semana (talões, carregamentos, fiado).',
  'Vi a cesta alimentar: estou dentro do orçamento da semana?',
  'Luz, água e gás: sei quando tenho de carregar e reservei para isso?',
  'Vi o dinheiro por dia até ao salário.',
  'Fiz (ou marquei) pelo menos um dos conselhos do mês.'
];

export function renderRevisao(host) {
  const el = document.createElement('div');
  host.replaceChildren(el);
  const db = store.get();
  const t = today();
  const due = reviewsDue(db, t);
  const c = cascade(db, t);
  const historico = [...(db.advice.revisoes || [])].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 6);
  el.innerHTML = `
    <div class="card"><h2><span>✅ Revisão semanal (5 minutos)</span>${due.semanal ? '<span class="chip warn">Por fazer</span>' : '<span class="chip ok">Feita</span>'}</h2>
      <ul class="checklist">${SEMANAL.map((txt, i) => `<li><label class="check"><input type="checkbox" data-sem="${i}"> ${esc(txt)}</label></li>`).join('')}</ul>
      <button class="btn primary wide" id="rv-sem">Concluir revisão semanal</button></div>

    <div class="card"><h2><span>🗓️ Revisão do mês</span>${due.mensal ? '<span class="chip warn">Novo ciclo</span>' : ''}</h2>
      <p class="muted small">Ciclo ${esc(c.cycle.label)}. Siga os passos por ordem:</p>
      <ol class="steps">
        <li><b>Confirmar o salário.</b> ${c.income.salarioRecebido ? `Registado: ${money(c.income.salario)}.` : '<a class="link" href="#/movimentos">Ainda não está registado</a>.'}</li>
        <li><b>Reservar este mês</b> (emergência, fundos, dívidas, metas). <button class="link" id="rv-res">Reservar agora</button></li>
        <li><b>Ler o conselho do mês</b> e escolher uma coisa para mudar. <a class="link" href="#/conselheiro">Ver conselhos</a></li>
        <li><b>Rever dívidas</b> e a estratégia (avalanche / bola de neve). <a class="link" href="#/dividas">Dívidas</a></li>
        <li><b>Ajustar orçamentos</b> dos essenciais se os preços mudaram. <a class="link" href="#/categorias">Categorias</a></li>
        <li><b>Olhar para os próximos meses pesados</b> no calendário. <a class="link" href="#/plano">Calendário</a></li>
        <li><b>Exportar uma cópia</b> dos dados para fora do dispositivo. <a class="link" href="#/definicoes">Exportar</a></li>
      </ol>
      <button class="btn primary wide" id="rv-mes">Concluir revisão do mês</button></div>
    ${historico.length ? `<h3 class="section-title">Últimas revisões</h3><ul class="list">${historico.map((r) => `<li class="item"><div class="item-main">
      <div class="item-title">${r.tipo === 'semanal' ? 'Semanal' : 'Mensal'}</div><div class="item-sub">${esc(formatDate(r.data, { weekday: true }))}</div></div></li>`).join('')}</ul>` : ''}`;

  el.querySelector('#rv-res').addEventListener('click', openReserveSheet);
  el.querySelector('#rv-sem').addEventListener('click', () => {
    const feitos = $$('[data-sem]', el).filter((x) => x.checked).length;
    store.update((db) => db.advice.revisoes.push({ tipo: 'semanal', data: today(), itens: feitos }));
    toast(feitos === SEMANAL.length ? 'Revisão concluída. Bom trabalho!' : `Revisão registada (${feitos}/${SEMANAL.length}).`);
  });
  el.querySelector('#rv-mes').addEventListener('click', () => {
    store.update((db) => db.advice.revisoes.push({ tipo: 'mensal', data: today() }));
    toast('Revisão do mês registada');
  });
}

