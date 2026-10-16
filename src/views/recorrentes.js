// Movimentos recorrentes: geridos aqui, gerados automaticamente ao abrir/retomar a app (main.js).

import { store, newId } from '../store.js';
import { PERIODICIDADES, parseMoney, centsToInput, formatDate, generateRecurring, validateTransaction, parts } from '../domain.js';
import { $, $$, esc, money, sheet, toast, confirmDialog, catBadge, category, accountName, icon, today, options, settings, emptyState } from '../ui.js';

function describe(r) {
  const n = r.intervalo || 1;
  const unit = { diaria: ['dia', 'dias'], semanal: ['semana', 'semanas'], mensal: ['mês', 'meses'], anual: ['ano', 'anos'] }[r.periodicidade];
  const every = n === 1 ? PERIODICIDADES[r.periodicidade] : `A cada ${n} ${unit[1]}`;
  const day = r.periodicidade === 'mensal' ? `, dia ${r.diaAncora}` : '';
  return every + day;
}

function item(r) {
  const sign = r.tipo === 'receita' ? 1 : r.tipo === 'despesa' ? -1 : 0;
  const conta = r.tipo === 'transferencia' ? `${accountName(r.contaId)} → ${accountName(r.contaDestinoId)}` : accountName(r.contaId);
  return `<li><button class="item" data-rec="${r.id}">
    ${catBadge(r.tipo === 'transferencia' ? null : category(r.categoriaId))}
    <div class="item-main"><div class="item-title">${esc(r.descricao)}</div>
      <div class="item-sub">${esc(describe(r))} · ${esc(conta)}</div>
      <div class="item-sub">${r.ativo ? `Próximo: ${esc(formatDate(r.proximaData, { weekday: true }))}` : 'Inativo'}${r.dataFim ? ` · até ${esc(formatDate(r.dataFim))}` : ''}</div></div>
    <div class="tx-amt ${r.tipo}">${sign ? money(sign * r.valor, { sign: sign > 0 }) : money(r.valor)}</div>
  </button></li>`;
}

export function render(host) {
  const el = document.createElement('div');
  host.replaceChildren(el);
  const db = store.get();
  const ativos = db.recurring.filter((r) => r.ativo).sort((a, b) => a.proximaData.localeCompare(b.proximaData));
  const inativos = db.recurring.filter((r) => !r.ativo);
  el.innerHTML = `
    <p class="muted small">Os movimentos são criados automaticamente quando a data chega (ao abrir a app).</p>
    <button class="btn primary wide" id="r-new">${icon('plus')} Nova recorrência</button>
    ${ativos.length ? `<ul class="list">${ativos.map(item).join('')}</ul>` : emptyState('Ainda não há recorrências. Ex.: renda, salário, internet.')}
    ${inativos.length ? `<details><summary>Inativas (${inativos.length})</summary><ul class="list">${inativos.map(item).join('')}</ul></details>` : ''}`;
  $('#r-new', el).addEventListener('click', () => openRecurringSheet());
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rec]');
    if (b) openRecurringSheet(store.get().recurring.find((r) => r.id === b.dataset.rec));
  });
}

function openRecurringSheet(rec = null) {
  const db = store.get();
  const accounts = db.accounts.filter((a) => !a.arquivada || a.id === rec?.contaId || a.id === rec?.contaDestinoId);
  const st = { tipo: rec?.tipo || 'despesa' };
  const catOptions = () => options(store.get().categories.filter((c) => c.tipo === st.tipo && (!c.arquivada || c.id === rec?.categoriaId)),
    rec?.categoriaId, { label: (c) => `${c.icone} ${c.nome}` });

  const s = sheet(`
    <h2>${rec ? 'Editar recorrência' : 'Nova recorrência'}</h2>
    <div class="seg">${[['despesa', 'Despesa'], ['receita', 'Receita'], ['transferencia', 'Transferência']].map(([k, l]) => `<button data-tipo="${k}">${l}</button>`).join('')}</div>
    <label class="field"><span>Descrição</span><input id="r-desc" maxlength="60" value="${esc(rec?.descricao)}" placeholder="Ex.: Renda"></label>
    <label class="field"><span>Valor (${esc(settings().moeda)})</span><input id="r-valor" inputmode="decimal" value="${esc(centsToInput(rec?.valor))}"></label>
    <label class="field" id="r-cat-wrap"><span>Categoria</span><select id="r-cat">${catOptions()}</select></label>
    <div class="field-row">
      <label class="field"><span id="r-conta-lbl">Conta</span><select id="r-conta">${options(accounts, rec?.contaId || settings().contaPorDefeito)}</select></label>
      <label class="field" id="r-dest-wrap"><span>Para</span><select id="r-dest">${options(accounts, rec?.contaDestinoId || accounts[1]?.id)}</select></label>
    </div>
    <div class="field-row">
      <label class="field"><span>Repetir</span><select id="r-per">${options(Object.entries(PERIODICIDADES), rec?.periodicidade || 'mensal', { value: (x) => x[0], label: (x) => x[1] })}</select></label>
      <label class="field"><span>A cada</span><input id="r-int" type="number" min="1" max="99" inputmode="numeric" value="${rec?.intervalo || 1}"></label>
    </div>
    <div class="field-row">
      <label class="field"><span>Próxima data</span><input id="r-data" type="date" value="${rec?.proximaData || today()}"></label>
      <label class="field"><span>Termina em (opcional)</span><input id="r-fim" type="date" value="${rec?.dataFim || ''}"></label>
    </div>
    ${rec ? `<label class="check"><input type="checkbox" id="r-ativo" ${rec.ativo ? 'checked' : ''}> Ativa</label>` : ''}
    <p class="muted small" id="r-hint"></p>
    <p class="error" id="r-err"></p>
    <div class="row-btns">
      ${rec ? `<button class="btn danger" id="r-del">${icon('trash')} Apagar</button>` : ''}
      <button class="btn primary big" id="r-save">Guardar</button>
    </div>`);
  const el = s.el;

  const refresh = () => {
    $$('[data-tipo]', el).forEach((b) => b.classList.toggle('sel', b.dataset.tipo === st.tipo));
    $('#r-cat-wrap', el).hidden = st.tipo === 'transferencia';
    $('#r-dest-wrap', el).hidden = st.tipo !== 'transferencia';
    $('#r-conta-lbl', el).textContent = st.tipo === 'transferencia' ? 'De' : 'Conta';
    const d = $('#r-data', el).value;
    $('#r-hint', el).textContent = d && d <= today()
      ? 'A data já chegou: os movimentos em atraso serão criados ao guardar.'
      : $('#r-per', el).value === 'mensal' && d && parts(d)[2] > 28 ? `Nos meses mais curtos será no último dia do mês.` : '';
  };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tipo]');
    if (!b) return;
    st.tipo = b.dataset.tipo;
    $('#r-cat', el).innerHTML = catOptions();
    refresh();
  });
  $('#r-data', el).addEventListener('change', refresh);
  $('#r-per', el).addEventListener('change', refresh);

  $('#r-save', el).addEventListener('click', () => {
    const err = (m) => ($('#r-err', el).textContent = m);
    const valor = parseMoney($('#r-valor', el).value);
    const descricao = $('#r-desc', el).value.trim();
    const proximaData = $('#r-data', el).value;
    const dataFim = $('#r-fim', el).value || null;
    const intervalo = Math.max(1, Math.min(99, parseInt($('#r-int', el).value, 10) || 1));
    if (!descricao) return err('Indique a descrição.');
    if (dataFim && dataFim < proximaData) return err('A data de fim tem de ser depois da próxima data.');
    const r = {
      id: rec?.id || newId(), descricao, valor: Math.abs(valor || 0), tipo: st.tipo,
      periodicidade: $('#r-per', el).value, intervalo, proximaData,
      diaAncora: proximaData ? parts(proximaData)[2] : 1, dataFim,
      ativo: rec ? $('#r-ativo', el).checked : true,
      contaId: $('#r-conta', el).value,
      contaDestinoId: st.tipo === 'transferencia' ? $('#r-dest', el).value : null,
      categoriaId: st.tipo === 'transferencia' ? null : $('#r-cat', el).value
    };
    const errs = validateTransaction({ ...r, data: proximaData }, store.get());
    if (errs.length) return err(errs[0]);
    const created = store.update((db) => {
      const i = db.recurring.findIndex((x) => x.id === r.id);
      if (i >= 0) db.recurring[i] = r; else db.recurring.push(r);
      return generateRecurring({ ...db, recurring: [r] }, today(), { newId });
    });
    s.close();
    toast(created.length ? `Guardado. ${created.length} movimento(s) em atraso criado(s).` : 'Recorrência guardada');
  });
  $('#r-del', el)?.addEventListener('click', async () => {
    if (!(await confirmDialog(`Apagar “${rec.descricao}”? Os movimentos já criados mantêm-se.`, { ok: 'Apagar', danger: true }))) return;
    store.update((db) => { db.recurring = db.recurring.filter((x) => x.id !== rec.id); });
    s.close();
  });
  refresh();
}
