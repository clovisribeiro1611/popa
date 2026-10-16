// Metas de poupança: progresso, quanto falta e quanto poupar por mês até ao prazo.

import { store, newId } from '../store.js';
import { goalProgress, parseMoney, centsToInput, formatDate } from '../domain.js';
import { $, $$, esc, money, sheet, toast, confirmDialog, progressBar, icon, today, settings, emptyState } from '../ui.js';
import { CORES } from './categorias.js';

function card(g) {
  const p = goalProgress(g, today());
  const info = p.concluida ? '🎉 Meta atingida!'
    : p.atrasada ? `Prazo ultrapassado (${formatDate(g.prazo)}) · faltam ${money(p.falta)}`
    : g.prazo ? `Faltam ${money(p.falta)} · ${p.mesesRestantes > 0 ? `${money(p.porMes)}/mês durante ${p.mesesRestantes} ${p.mesesRestantes === 1 ? 'mês' : 'meses'}` : 'prazo este mês'}`
    : `Faltam ${money(p.falta)}`;
  return `<div class="card goal" data-goal="${g.id}" style="--c:${esc(g.cor || 'var(--primary)')}">
    <h2><span>${esc(g.nome)}</span><span class="num">${Math.round(p.pct * 100)}%</span></h2>
    <div class="progress meta"><span style="width:${Math.round(p.pct * 100)}%;background:var(--c)"></span></div>
    <p class="num"><b>${money(g.valorAtual)}</b> <span class="muted">de ${money(g.valorAlvo)}</span></p>
    <p class="muted small">${esc(info)}${g.prazo && !p.atrasada && !p.concluida ? ` · prazo ${esc(formatDate(g.prazo))}` : ''}</p>
    <div class="row-btns">
      <button class="btn" data-edit="${g.id}">Editar</button>
      <button class="btn primary" data-add="${g.id}">${icon('plus')} Contribuir</button>
    </div></div>`;
}

export function render(host) {
  const el = document.createElement('div');
  host.replaceChildren(el);
  const goals = store.get().goals;
  const totalAlvo = goals.reduce((s, g) => s + g.valorAlvo, 0);
  const totalAtual = goals.reduce((s, g) => s + Math.min(g.valorAtual, g.valorAlvo), 0);
  el.innerHTML = `
    ${goals.length > 1 ? `<div class="card"><h2><span>Total poupado para metas</span><span class="num">${money(totalAtual)}</span></h2>
      ${progressBar(totalAlvo ? totalAtual / totalAlvo : 0, 'meta')}<p class="muted small">de ${money(totalAlvo)}</p></div>` : ''}
    ${goals.map(card).join('') || emptyState('Defina uma meta: fundo de emergência, férias, um carro…')}
    <button class="btn wide" id="g-new">${icon('plus')} Nova meta</button>`;
  $('#g-new', el).addEventListener('click', () => openGoalSheet());
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-edit],[data-add]');
    if (!b) return;
    const g = store.get().goals.find((x) => x.id === (b.dataset.edit || b.dataset.add));
    if (b.dataset.edit) openGoalSheet(g); else openContributionSheet(g);
  });
}

function openGoalSheet(goal = null) {
  let cor = goal?.cor || CORES[6];
  const s = sheet(`
    <h2>${goal ? 'Editar meta' : 'Nova meta'}</h2>
    <label class="field"><span>Nome</span><input id="g-nome" maxlength="40" value="${esc(goal?.nome)}" placeholder="Ex.: Fundo de emergência"></label>
    <div class="field-row">
      <label class="field"><span>Valor alvo (${esc(settings().moeda)})</span><input id="g-alvo" inputmode="decimal" value="${esc(centsToInput(goal?.valorAlvo))}"></label>
      <label class="field"><span>Já poupado</span><input id="g-atual" inputmode="decimal" value="${esc(centsToInput(goal?.valorAtual ?? 0))}"></label>
    </div>
    <label class="field"><span>Prazo (opcional)</span><input id="g-prazo" type="date" value="${goal?.prazo || ''}"></label>
    <div class="field"><span>Cor</span><div class="swatches">${CORES.map((c) => `<button data-cor="${c}" style="background:${c}"></button>`).join('')}</div></div>
    <p class="error" id="g-err"></p>
    <div class="row-btns">
      ${goal ? `<button class="btn danger" id="g-del">${icon('trash')} Apagar</button>` : ''}
      <button class="btn primary big" id="g-save">Guardar</button>
    </div>`);
  const el = s.el;
  const paint = () => $$('[data-cor]', el).forEach((b) => b.classList.toggle('sel', b.dataset.cor === cor));
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-cor]'); if (b) { cor = b.dataset.cor; paint(); } });
  paint();

  $('#g-save', el).addEventListener('click', () => {
    const nome = $('#g-nome', el).value.trim();
    const alvo = parseMoney($('#g-alvo', el).value);
    const atual = parseMoney($('#g-atual', el).value || '0');
    if (!nome) return ($('#g-err', el).textContent = 'Indique o nome.');
    if (!(alvo > 0)) return ($('#g-err', el).textContent = 'Indique um valor alvo maior que zero.');
    if (atual == null || atual < 0) return ($('#g-err', el).textContent = 'Valor poupado inválido.');
    store.update((db) => {
      let g = db.goals.find((x) => x.id === goal?.id);
      if (!g) { g = { id: newId() }; db.goals.push(g); }
      Object.assign(g, { nome, valorAlvo: alvo, valorAtual: atual, prazo: $('#g-prazo', el).value || null, cor });
    });
    s.close();
  });
  $('#g-del', el)?.addEventListener('click', async () => {
    if (!(await confirmDialog(`Apagar a meta “${goal.nome}”?`, { ok: 'Apagar', danger: true }))) return;
    store.update((db) => { db.goals = db.goals.filter((x) => x.id !== goal.id); });
    s.close();
  });
}

function openContributionSheet(goal) {
  let sinal = 1;
  const s = sheet(`
    <h2>${esc(goal.nome)}</h2>
    <div class="seg"><button data-s="1" class="sel">Adicionar</button><button data-s="-1">Retirar</button></div>
    <label class="amount"><input id="g-val" inputmode="decimal" placeholder="0"><span>${esc(settings().moeda)}</span></label>
    <p class="muted small">Atualiza apenas o valor da meta; não cria movimentos nas contas.</p>
    <p class="error" id="g-err"></p>
    <button class="btn primary big wide" id="g-ok">Confirmar</button>`);
  const el = s.el;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-s]');
    if (!b) return;
    sinal = Number(b.dataset.s);
    $$('[data-s]', el).forEach((x) => x.classList.toggle('sel', x === b));
  });
  const ok = () => {
    const v = parseMoney($('#g-val', el).value);
    if (!(v > 0)) return ($('#g-err', el).textContent = 'Indique um valor maior que zero.');
    const before = goal.valorAtual;
    store.update((db) => {
      const g = db.goals.find((x) => x.id === goal.id);
      g.valorAtual = Math.max(0, g.valorAtual + sinal * v);
    });
    s.close();
    toast(`${sinal > 0 ? 'Adicionado' : 'Retirado'}: ${money(v)}`, {
      action: 'Anular', onAction: () => store.update((db) => { db.goals.find((x) => x.id === goal.id).valorAtual = before; })
    });
  };
  $('#g-ok', el).addEventListener('click', ok);
  $('#g-val', el).addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  setTimeout(() => $('#g-val', el).focus(), 280);
}
