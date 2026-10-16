// Fundos de provisão (envelopes), modelos sazonais cabo-verdianos, fundos de longo prazo e calendário anual.

import { store, newId } from '../store.js';
import { fundStatus, envelopeBalance } from '../finance.js';
import { formatDate, MESES } from '../domain.js';
import {
  activateTemplate, templateAmount, templateNextDate, useFund, annualCalendar, GRUPOS
} from '../templates.js';
import {
  $, esc, money, sheet, toast, confirmDialog, icon, options, progressBar, today, moneyField, numberField, readMoney, readNumber
} from '../ui.js';
import { monthBars, bindCharts } from '../charts.js';
import { amountSheet } from './plano.js';

function fundCard(db, f) {
  const st = fundStatus(db, f, today());
  const when = f.proximaData ? formatDate(f.proximaData) : 'sem data';
  const chip = st.vencido ? '<span class="chip bad">Chegou a data</span>'
    : st.falta === 0 ? '<span class="chip ok">Completo</span>'
    : st.alerta ? `<span class="chip warn">${st.ciclos} ${st.ciclos === 1 ? 'mês' : 'meses'}</span>` : '';
  return `<li><button class="item" data-fund="${f.id}">
    <span class="badge" style="--c:var(--primary)">${esc(f.icone || '🗓️')}</span>
    <div class="item-main"><div class="cat-row-top"><span class="item-title">${esc(f.nome)}</span>${chip}</div>
      <div class="item-sub num">${money(st.saldo)} de ${money(f.valorAlvo)} · ${esc(when)}</div>
      ${progressBar(st.pct, 'meta')}
      ${st.falta ? `<div class="item-sub">Reservar <b>${money(st.sugestaoMensal)}</b>/mês</div>` : ''}</div></button></li>`;
}

export function renderFundos(el) {
  const db = store.get();
  const ativos = db.funds.filter((f) => f.ativo !== false);
  const prov = ativos.filter((f) => f.tipo !== 'longoPrazo').sort((a, b) => (a.proximaData || '9').localeCompare(b.proximaData || '9'));
  const longo = ativos.filter((f) => f.tipo === 'longoPrazo');
  const usados = new Set(ativos.map((f) => f.templateId));
  const modelos = db.seasonalTemplates.filter((t) => !usados.has(t.id));
  const grupos = Object.entries(GRUPOS).map(([g, nome]) => [nome, modelos.filter((t) => t.grupo === g)]).filter(([, l]) => l.length);
  const totalMes = [...prov, ...longo].reduce((s, f) => s + fundStatus(db, f, today()).sugestaoMensal, 0);

  el.innerHTML = `
    <p class="muted small">Custos que se sabem com antecedência são planeados aqui, nunca resolvidos a crédito. O dinheiro fica nas contas; os fundos são "envelopes".</p>
    ${prov.length || longo.length ? `<div class="card"><h2><span>Reserva mensal sugerida</span><span class="num">${money(totalMes)}</span></h2>
      <p class="muted small">Soma do que cada fundo precisa por mês para chegar à data. Entra na cascata (níveis 3 e 5).</p></div>` : ''}
    <h3 class="section-title">Fundos de provisão</h3>
    ${prov.length ? `<ul class="list">${prov.map((f) => fundCard(db, f)).join('')}</ul>` : '<p class="muted">Ainda não tem fundos ativos. Ative um modelo abaixo.</p>'}
    ${longo.length ? `<h3 class="section-title">Longo prazo</h3><ul class="list">${longo.map((f) => fundCard(db, f)).join('')}</ul>` : ''}
    <button class="btn wide" id="f-new">${icon('plus')} Fundo personalizado</button>
    <h3 class="section-title">Modelos (toque para ativar)</h3>
    ${grupos.map(([nome, list]) => `<h4 class="sub">${esc(nome)}</h4><ul class="list">${list.map((t) => {
      const v = templateAmount(db, t), d = templateNextDate(t, today());
      return `<li><button class="item" data-tpl="${t.id}"><span class="badge" style="--c:var(--muted)">${esc(t.icone)}</span>
        <div class="item-main"><div class="item-title">${esc(t.nome)}</div>
          <div class="item-sub">${d ? esc(formatDate(d)) : 'data por definir'} · ${v ? money(v) : 'valor por definir'}</div></div>
        <span class="chip">Ativar</span></button></li>`;
    }).join('')}</ul>`).join('')}`;

  el.addEventListener('click', (e) => {
    const f = e.target.closest('[data-fund]');
    if (f) return openFundSheet(store.get().funds.find((x) => x.id === f.dataset.fund));
    const t = e.target.closest('[data-tpl]');
    if (t) return activateOrAsk(store.get().seasonalTemplates.find((x) => x.id === t.dataset.tpl));
  });
  $('#f-new', el).addEventListener('click', () => openFundSheet(null));
}

/** Ativa com um toque; se faltar data ou valor, abre o editor do modelo. */
function activateOrAsk(t) {
  const db = store.get();
  if (templateNextDate(t, today()) && templateAmount(db, t)) {
    const f = store.update((d) => activateTemplate(d, t, today(), newId));
    toast(`Fundo “${f.nome}” ativado: ${money(fundStatus(store.get(), f, today()).sugestaoMensal)}/mês`);
    return;
  }
  openTemplateSheet(t);
}

function openTemplateSheet(t) {
  const fixo = t.regra === 'fixa';
  const s = sheet(`<h2>${esc(t.icone)} ${esc(t.nome)}</h2>
    ${t.nota ? `<p class="muted small">${esc(t.nota)}</p>` : ''}
    ${fixo ? `<div class="field-row">
      ${numberField('t-dia', 'Dia', t.dia, { min: 1, max: 31 })}
      <label class="field"><span>Mês</span><select id="t-mes">${options(MESES.map((n, i) => [i + 1, n]), t.mes, { value: (x) => x[0], label: (x) => x[1], empty: '—' })}</select></label>
    </div>` : '<p class="small">Data calculada automaticamente todos os anos.</p>'}
    ${moneyField('t-base', 'Valor base', t.valorBase)}
    ${t.valorPorFilho != null ? moneyField('t-filho', t.id === 'estudos' ? 'Valor por filho' : 'Valor por filho em idade escolar', t.valorPorFilho) : ''}
    ${numberField('t-ant', 'Começar a lembrar', t.antecedenciaMeses, { min: 1, max: 240, suffix: 'meses antes' })}
    <p class="error" id="t-err"></p>
    <div class="row-btns"><button class="btn" id="t-save">Guardar modelo</button><button class="btn primary" id="t-act">Ativar fundo</button></div>`);
  const el = s.el;
  const read = () => {
    const upd = {
      valorBase: readMoney($('#t-base', el)),
      antecedenciaMeses: readNumber($('#t-ant', el)) ?? t.antecedenciaMeses
    };
    if ($('#t-filho', el)) upd.valorPorFilho = readMoney($('#t-filho', el));
    if (fixo) { upd.dia = readNumber($('#t-dia', el)); upd.mes = Number($('#t-mes', el).value) || null; }
    if (Object.values(upd).includes(undefined)) { $('#t-err', el).textContent = 'Há um valor inválido.'; return null; }
    return upd;
  };
  const save = () => {
    const upd = read();
    if (!upd) return null;
    store.update((db) => Object.assign(db.seasonalTemplates.find((x) => x.id === t.id), upd));
    return store.get().seasonalTemplates.find((x) => x.id === t.id);
  };
  $('#t-save', el).addEventListener('click', () => { if (save()) s.close(); });
  $('#t-act', el).addEventListener('click', () => {
    const nt = save();
    if (!nt) return;
    if (!templateNextDate(nt, today())) return ($('#t-err', el).textContent = 'Indique o dia e o mês.');
    if (!templateAmount(store.get(), nt)) return ($('#t-err', el).textContent = 'Indique o valor (ou registe os filhos no Perfil).');
    s.close();
    activateOrAsk(nt);
  });
}

function openFundSheet(f) {
  const db = store.get();
  const st = f ? fundStatus(db, f, today()) : null;
  const s = sheet(`<h2>${f ? `${esc(f.icone || '')} ${esc(f.nome)}` : 'Novo fundo'}</h2>
    ${f ? `<p class="num">Saldo <b>${money(st.saldo)}</b> de ${money(f.valorAlvo)}${st.falta ? ` · reservar ${money(st.sugestaoMensal)}/mês` : ''}</p>
      <div class="row-btns"><button class="btn" id="fx-use">Usar</button><button class="btn primary" id="fx-add">${icon('plus')} Reservar</button></div>` : ''}
    <label class="field"><span>Nome</span><input id="fx-nome" maxlength="40" value="${esc(f?.nome)}"></label>
    <div class="field-row">
      ${moneyField('fx-alvo', 'Valor necessário', f?.valorAlvo ?? null)}
      <label class="field"><span>Data</span><input type="date" id="fx-data" value="${esc(f?.proximaData || '')}"></label>
    </div>
    <div class="field-row">
      <label class="field"><span>Repete</span><select id="fx-rec">${options([['anual', 'Todos os anos'], ['unica', 'Uma vez']], f?.recorrencia || 'anual', { value: (x) => x[0], label: (x) => x[1] })}</select></label>
      <label class="field"><span>Tipo</span><select id="fx-tipo">${options([['provisao', 'Provisão'], ['longoPrazo', 'Longo prazo']], f?.tipo || 'provisao', { value: (x) => x[0], label: (x) => x[1] })}</select></label>
    </div>
    ${moneyField('fx-contrib', 'Contribuição mensal fixa (vazio = calcular pela data)', f?.contribuicaoMensal ?? null)}
    ${numberField('fx-ant', 'Lembrar com', f?.antecedenciaMeses ?? 3, { min: 1, max: 240, suffix: 'meses de antecedência' })}
    <p class="error" id="fx-err"></p>
    <div class="row-btns">${f ? `<button class="btn danger" id="fx-del">${icon('trash')}</button>` : ''}<button class="btn primary big" id="fx-save">Guardar</button></div>`);
  const el = s.el;

  $('#fx-save', el).addEventListener('click', () => {
    const nome = $('#fx-nome', el).value.trim();
    const alvo = readMoney($('#fx-alvo', el));
    const contrib = readMoney($('#fx-contrib', el));
    const ant = readNumber($('#fx-ant', el));
    const data = $('#fx-data', el).value || null;
    if (!nome) return ($('#fx-err', el).textContent = 'Indique o nome.');
    if (!alvo) return ($('#fx-err', el).textContent = 'Indique o valor necessário.');
    if (!data && !contrib) return ($('#fx-err', el).textContent = 'Indique a data ou uma contribuição mensal fixa.');
    if (contrib === undefined || ant === undefined) return ($('#fx-err', el).textContent = 'Há um valor inválido.');
    store.update((db) => {
      let x = db.funds.find((y) => y.id === f?.id);
      if (!x) { x = { id: newId(), icone: '🗓️', templateId: null, ativo: true, criadoEm: today() }; db.funds.push(x); }
      Object.assign(x, { nome, valorAlvo: alvo, proximaData: data, recorrencia: $('#fx-rec', el).value,
        tipo: $('#fx-tipo', el).value, contribuicaoMensal: contrib, antecedenciaMeses: ant ?? 3 });
    });
    s.close();
  });
  $('#fx-add', el)?.addEventListener('click', () => {
    s.close();
    amountSheet(`Reservar para “${f.nome}”`, (v) => {
      store.update((db) => db.allocations.push({ id: newId(), data: today(), destino: 'fundo', destinoId: f.id, valor: v, origem: 'manual', nota: '' }));
      toast(`Reservado: ${money(v)}`);
    });
  });
  $('#fx-use', el)?.addEventListener('click', () => {
    s.close();
    const saldo = envelopeBalance(store.get(), 'fundo', f.id);
    amountSheet(`Usar “${f.nome}”`, (v) => {
      store.update((db) => useFund(db, f.id, v, today(), newId));
      const nf = store.get().funds.find((x) => x.id === f.id);
      toast(nf.ativo ? `Usado ${money(v)}. Próxima data: ${formatDate(nf.proximaData)}` : `Usado ${money(v)}. Fundo concluído.`, { duration: 5000 });
    }, { hint: `Saldo disponível: ${money(saldo)}. Registe a despesa nos movimentos como habitualmente.` });
  });
  $('#fx-del', el)?.addEventListener('click', async () => {
    if (!(await confirmDialog(`Apagar o fundo “${f.nome}”? As reservas feitas deixam de estar destinadas.`, { ok: 'Apagar', danger: true }))) return;
    store.update((db) => {
      db.funds = db.funds.filter((x) => x.id !== f.id);
      db.allocations = db.allocations.filter((a) => !(a.destino === 'fundo' && a.destinoId === f.id));
    });
    s.close();
  });
}

export function renderCalendario(el) {
  const db = store.get();
  const cal = annualCalendar(db, today());
  const label = (x) => MESES[x.m - 1].slice(0, 3);
  el.innerHTML = `
    <div class="card"><h2><span>Próximos 12 meses</span></h2>
      ${monthBars(cal.months.map((x) => ({ label: label(x), value: x.total, highlight: x.pesado, tip: `${MESES[x.m - 1]} ${x.y}: ${money(x.total)}` })))}
      <p class="muted small">Os meses assinalados na lista são os mais pesados. Os fundos ativos vão reservando para eles ao longo do ano; os modelos com ＋ ainda não estão ativos.</p></div>
    <ul class="list">${cal.months.map((x) => `<li class="item cal-month ${x.pesado ? 'heavy' : ''}">
      <div class="item-main"><div class="cat-row-top"><span class="item-title" style="text-transform:capitalize">${esc(MESES[x.m - 1])} ${x.y}</span>
        <b class="num">${x.total ? money(x.total) : ''}</b></div>
        ${x.fundos.map((f) => `<div class="item-sub">${esc(f.icone || '')} ${esc(f.nome)} · ${money(f.valorAlvo)}</div>`).join('')}
        ${x.sugestoes.map((t) => `<div class="item-sub muted">＋ ${esc(t.icone)} ${esc(t.nome)} (não ativado${t.valor ? ` · ${money(t.valor)}` : ''})</div>`).join('')}
        ${!x.fundos.length && !x.sugestoes.length ? '<div class="item-sub muted">Sem custos sazonais</div>' : ''}
      </div></li>`).join('')}</ul>`;
  bindCharts(el, (v) => money(v));
}
