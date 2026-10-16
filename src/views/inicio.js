// Início: o conselheiro. Mostra o que falta cobrir em cada nível da cascata, alertas e conselhos.

import { store } from '../store.js';
import { cascade, emergencyStatus, endOfMonth, postponeSuggestions } from '../finance.js';
import { formatDate } from '../domain.js';
import { esc, money, progressBar, today } from '../ui.js';
import { cascadeSummary, cutsCard, reserveButton, bindReserve, setTab } from './plano.js';
import { pendingCard } from './extra.js';
import { inicioSection as conselheiro } from './conselheiro.js';
import { reminders } from '../advisor.js';
import { platform } from '../platform/index.js';
import { addDays } from '../domain.js';
import { appState } from '../ui.js';

/** Web sem armazenamento persistente: aviso claro (fechável nesta sessão). */
function persistencia() {
  const p = appState.persistencia;
  if (!platform.caps.persistencia || !p || p.persistent || appState.avisoPersistenciaFechado) return null;
  return {
    top: true,
    html: `<div class="card alert-card bad"><h2><span>⚠ Os dados podem ser apagados pelo navegador</span></h2>
      <p class="small">Este navegador não garante que guarda a base de dados. Se limpar os dados do site (ou faltar espaço), <b>todos os movimentos são apagados</b>.
      Exporte uma cópia completa regularmente e guarde-a fora deste dispositivo.</p>
      <div class="row-btns"><a class="btn primary" href="#/definicoes">Exportar cópia</a><button class="btn" data-dismiss-persist>Entendi</button></div></div>`,
    bind: (el) => el.querySelector('[data-dismiss-persist]')?.addEventListener('click', (e) => { appState.avisoPersistenciaFechado = true; e.target.closest('.card').remove(); })
  };
}

/** Painel "Lembretes": hoje e próximos 3 dias. Sempre na web (sem notificações agendadas) ou com as notificações desligadas. */
function lembretes({ db, today: t }) {
  if (platform.caps.notificacoesAgendadas && db.settings.limites?.notificacoes) return null;
  const ate = addDays(t, 3);
  const list = reminders(db, t, { dias: 3 }).filter((r) => r.dia <= ate).slice(0, 5);
  if (!list.length) return null;
  const quando = (r) => (r.dia === t ? `hoje, ${r.hora}` : `${formatDate(r.dia, { weekday: true, year: false })}, ${r.hora}`);
  return { html: `<h3 class="section-title">Lembretes</h3><ul class="alerts">${list.map((r) => `<li><a class="alert-row" href="${esc(r.href)}">
    <span class="alert-ico">🔔</span><span class="alert-txt"><b>${esc(r.titulo)}</b><span>${esc(quando(r))} · ${esc(r.texto)}</span></span></a></li>`).join('')}</ul>` };
}

/** Topo: dias até ao salário e dinheiro por dia; semana crítica e alerta de ritmo. */
function fimDoMes({ db, today: t, cascade: c }) {
  const f = endOfMonth(db, t, c);
  let html = `<div class="stat-row">
    <div class="stat"><div class="label">Dias até ao salário</div><div class="value">${f.diasAteSalario}</div>
      <div class="muted small">${esc(formatDate(c.cycle.end, { year: false }))} é o último dia do ciclo</div></div>
    <div class="stat ${f.semanaCritica ? 'critical' : ''}"><div class="label">Dinheiro por dia</div><div class="value">${money(f.dinheiroPorDia, { symbol: false })}</div>
      <div class="muted small">${c.tudoCoberto ? `livre ÷ ${f.diasRestantes} dias` : 'sem livre: há défice'}</div></div>
  </div>`;
  if (f.semanaCritica) {
    const p = postponeSuggestions(db, c, t);
    html += `<div class="card alert-card bad"><h2><span>⚠ Semana crítica</span></h2>
      <p>Tem ${money(f.dinheiroPorDia)} por dia, abaixo do seu limite de ${money(f.limite)}. Até ${esc(formatDate(p.ate, { year: false }))}, só o essencial:</p>
      ${p.essenciais.length ? `<ul class="cuts">${p.essenciais.map((i) => `<li><span>${esc(i.icone || '')} ${esc(i.nome)}</span><b class="num">${money(i.porPagar)}</b></li>`).join('')}</ul>` : '<p class="small">Os essenciais deste ciclo já estão pagos.</p>'}
      ${p.adiar.length ? `<p class="small"><b>Pode adiar:</b></p><ul class="cuts">${p.adiar.map((x) => `<li><span>${esc(x.texto)}</span><b class="num">+${money(x.valor)}</b></li>`).join('')}</ul>` : ''}
      ${p.evitar.length ? `<p class="small"><b>Evite até ao salário:</b> ${p.evitar.map((x) => `${esc(x.categoria.icone)} ${esc(x.categoria.nome)} (${money(x.gasto)} já gastos)`).join(', ')}.</p>` : ''}</div>`;
  }
  if (f.alertaRitmo) {
    html += `<div class="card alert-card"><h2><span>📉 O dinheiro pode não chegar ao fim do mês</span></h2>
      <p>Ao ritmo atual (${money(f.ritmoDiario)}/dia em gastos do dia a dia) vai gastar cerca de <b>${money(f.projecao)}</b> neste ciclo,
      mais <b>${money(f.faltaProjetada)}</b> do que o previsto. Para chegar ao fim, baixe para cerca de <b>${money(f.ritmoSustentavel)}</b> por dia.</p></div>`;
  }
  return { html, top: true, critical: f.semanaCritica };
}

// Secções do Início: cada uma recebe o contexto e devolve { html, top?, bind? } ou null.
const SECTIONS = [persistencia, fimDoMes, pendingCard, conselheiro, lembretes];

export function render(host) {
  const el = document.createElement('div');
  el.className = 'cols-wide';
  host.replaceChildren(el);
  const db = store.get();
  const t = today();
  const h = db.household;

  if (!h.salarioLiquido) {
    const aviso = persistencia();
    el.innerHTML = `${aviso?.html || ''}<div class="card onboarding">
      <h2><span>Bem-vindo ao seu conselheiro</span></h2>
      <p>Para a app dizer o que fazer com o dinheiro, comece pelo perfil: salário líquido, dia do pagamento e pessoas no agregado.</p>
      <a class="btn primary wide big" href="#/perfil">Preencher o perfil</a>
      <p class="muted small">Pode também ver um exemplo completo em Definições → Dados de exemplo, ou importar uma cópia de outro dispositivo.</p></div>`;
    aviso?.bind(el);
    return;
  }

  const c = cascade(db, t);
  const em = emergencyStatus(db, t);
  const ctx = { db, today: t, cascade: c, emergency: em };
  const extra = SECTIONS.map((fn) => fn(ctx)).filter(Boolean);
  const meses = em.mesesCobertos.toLocaleString('pt-PT', { maximumFractionDigits: 1 });

  // Na semana crítica o Início mostra só o essencial; o plano completo fica a um toque.
  const critical = extra.some((x) => x.critical);
  el.innerHTML = `
    ${extra.filter((x) => x.top).map((x) => x.html).join('')}
    ${cutsCard(db, c)}
    ${critical ? '<a class="btn wide" href="#/plano" data-plano="cascata">Ver o plano completo do ciclo</a>' : `
    <div class="card"><h2><span>Plano do ciclo</span><span class="muted small">${esc(c.cycle.label)}</span></h2>
      ${cascadeSummary(c)}
      ${reserveButton(c)}
    </div>`}
    <a class="card link-card" href="#/plano" data-plano="emergencia" ${critical ? 'hidden' : ''}>
      <h2><span>🛟 Fundo de emergência</span><span class="num">${money(em.saldo)}</span></h2>
      ${progressBar(em.progressoEtapa, 'meta')}
      <p class="muted small">Cobre ${meses} ${em.mesesCobertos >= 1 && em.mesesCobertos < 2 ? 'mês' : 'meses'}${em.etapaAtual ? ` · próxima etapa ${em.etapaAtual.meses} ${em.etapaAtual.meses === 1 ? 'mês' : 'meses'}${em.etapaAtual.data ? ` em ${esc(formatDate(em.etapaAtual.data))}` : ''}` : ' · todas as etapas atingidas'}</p>
    </a>
    ${extra.filter((x) => !x.top).map((x) => x.html).join('')}`;

  bindReserve(el);
  el.addEventListener('click', (e) => {
    const p = e.target.closest('[data-plano]');
    if (p) setTab(p.dataset.plano);
  });
  for (const x of extra) x.bind?.(el);
}

