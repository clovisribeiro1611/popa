// Perfil do agregado familiar e parâmetros editáveis (valores legais, preços de referência e limites).
// Tudo é gravado ao alterar cada campo.

import { store, newId } from '../store.js';
import {
  $, esc, money, sheet, toast, confirmDialog, icon, options, moneyField, numberField, readMoney, readNumber, DISCLAIMER
} from '../ui.js';

const TIPOS_EXTRA = { remessa: 'Remessa', biscate: 'Biscate', venda: 'Vendas', outro: 'Outro' };
const anoAtual = () => new Date().getFullYear();
export const idade = (f) => (f.anoNascimento ? anoAtual() - f.anoNascimento : null);

export function render(host) {
  const el = document.createElement('div');
  el.className = 'cols-wide';
  host.replaceChildren(el);
  const db = store.get();
  const h = db.household;
  const p = h.parametros;
  const L = db.settings.limites;
  const contas = db.accounts.filter((a) => !a.arquivada);
  const famCat = db.categories.find((c) => c.nivel === 'familia' && !c.arquivada);
  const rule = db.extraIncomeRules.find((r) => r.ativa !== false);

  el.innerHTML = `
    <p class="muted small">${esc(DISCLAIMER)} Os valores legais e fiscais (IRS, INPS, taxas) mudam: confirme-os e atualize-os aqui.</p>

    <h3 class="section-title">Rendimento</h3>
    <div class="card">
      ${moneyField('h-sal', 'Salário líquido mensal', h.salarioLiquido || null, { placeholder: 'Ex.: 65 000' })}
      <div class="field-row">
        ${numberField('h-dia', 'Dia do pagamento', h.diaPagamento, { min: 1, max: 31, placeholder: '1–31' })}
        <label class="field"><span>Conta onde recebe</span><select id="h-conta">${options(contas, h.contaSalarioId, { empty: '—' })}</select></label>
      </div>
      <p class="muted small">O "mês" da app passa a ir do dia do salário até à véspera do salário seguinte.</p>
      <h4 class="sub">Rendimentos extra esperados (por mês)</h4>
      <ul class="list" id="h-extras">${h.rendimentosExtra.map((r) => `<li><button class="item" data-extra="${r.id}">
        <div class="item-main"><div class="item-title">${esc(r.descricao)}</div><div class="item-sub">${esc(TIPOS_EXTRA[r.tipo] || r.tipo)}</div></div>
        <b class="num">${money(r.valorMensal)}</b></button></li>`).join('') || '<li class="item muted">Nenhum (biscates, vendas, remessas…)</li>'}</ul>
      <button class="btn wide" id="h-extra-new">${icon('plus')} Rendimento extra</button>
    </div>

    <h3 class="section-title">Agregado familiar</h3>
    <div class="card">
      <div class="field-row">
        ${numberField('h-pessoas', 'Pessoas no agregado', h.pessoas, { min: 1, max: 30 })}
        ${numberField('h-dep', 'Dependentes', h.dependentes, { min: 0, max: 30 })}
      </div>
      <h4 class="sub">Filhos</h4>
      <ul class="list" id="h-filhos">${h.filhos.map((f) => `<li><button class="item" data-filho="${f.id}">
        <span class="badge" style="--c:var(--primary)">${f.escolar ? '🎒' : '🧒'}</span>
        <div class="item-main"><div class="item-title">${esc(f.nome || 'Filho/a')}</div>
          <div class="item-sub">${idade(f) != null ? `${idade(f)} anos` : 'idade por definir'}${f.escolar ? ' · em idade escolar' : ''}</div></div></button></li>`).join('') || '<li class="item muted">Sem filhos registados</li>'}</ul>
      <button class="btn wide" id="h-filho-new">${icon('plus')} Filho/a</button>
      <div class="field-row">
        <label class="field"><span>Ilha</span><input id="h-ilha" maxlength="30" value="${esc(h.ilha)}" placeholder="Ex.: Santiago"></label>
        <label class="field"><span>Concelho</span><input id="h-conc" maxlength="40" value="${esc(h.concelho)}" placeholder="Ex.: Praia"></label>
      </div>
    </div>

    <h3 class="section-title">Família alargada e rendimentos extra</h3>
    <div class="card">
      ${moneyField('x-fam', 'Limite mensal de ajuda a familiares', famCat?.orcamentoMensal ?? null, { placeholder: 'Sem limite' })}
      <p class="muted small">Tratada como despesa planeada (nível 1), não como imprevisto. A app avisa se passar o limite.</p>
      <h4 class="sub">Regra para remessas, biscates e vendas (%)</h4>
      <div class="field-row">
        ${numberField('x-r1', 'Fundos e dívidas', rule?.fundosDividas, { min: 0, max: 100 })}
        ${numberField('x-r2', 'Emergência e metas', rule?.emergenciaMetas, { min: 0, max: 100 })}
        ${numberField('x-r3', 'Livre', rule?.livre, { min: 0, max: 100 })}
      </div>
      <p class="error" id="x-rerr"></p>
    </div>

    <h3 class="section-title">Preços de referência</h3>
    <div class="card">
      ${moneyField('p-cesta', 'Cesta alimentar por pessoa, por semana', p.cestaSemanalPorPessoa)}
      <div class="field-row">
        ${moneyField('p-botija', 'Preço da botija de gás', p.precoBotija)}
        ${moneyField('p-kwh', 'Preço do kWh', p.precoKwh)}
      </div>
      ${moneyField('p-agua', 'Preço do m³ de água', p.precoAguaM3)}
    </div>

    <h3 class="section-title">Valores legais e fiscais (editáveis)</h3>
    <div class="card">
      <div class="field-row">
        ${numberField('p-irs', 'Taxa de IRS', p.taxaIRS, { min: 0, max: 100, step: 0.1, suffix: '%' })}
        ${numberField('p-inps', 'Desconto INPS', p.taxaINPS, { min: 0, max: 100, step: 0.1, suffix: '%' })}
      </div>
      ${numberField('p-juro', 'Taxa de juro de referência (crédito)', p.taxaJuroReferencia, { min: 0, max: 200, step: 0.1, suffix: '% ao ano' })}
      <p class="muted small">Só informativos: a app trabalha com o salário <b>líquido</b>. A taxa de referência serve para assinalar dívidas caras.</p>
    </div>

    <h3 class="section-title">Limites e alertas</h3>
    <div class="card">
      <div class="field-row">
        ${numberField('l-verde', 'Endividamento: verde até', L.racioVerde, { min: 0, max: 100, suffix: '%' })}
        ${numberField('l-amarelo', 'amarelo até', L.racioAmarelo, { min: 0, max: 100, suffix: '%' })}
      </div>
      ${moneyField('l-critico', '"Semana crítica" quando o dinheiro por dia for menor que', L.dinheiroDiaCritico, { placeholder: 'Desligado' })}
      <div class="field-row">
        ${numberField('l-ritmo', 'Avisar sobre o ritmo a partir do dia', L.diaAlertaRitmo, { min: 1, max: 28, suffix: 'do ciclo' })}
        ${numberField('l-tol', 'Variação aceite telefone/internet', L.toleranciaServicosPct, { min: 0, max: 100, suffix: '%' })}
      </div>
      ${numberField('l-prepago', 'Avisar quando a luz/água/gás acaba em', L.diasAvisoPrePago, { min: 0, max: 15, suffix: 'dias' })}
    </div>`;

  // Gravação campo a campo
  const bindMoney = (id, apply) => $(id, el).addEventListener('change', (e) => {
    const v = readMoney(e.target);
    if (v === undefined) return toast('Valor inválido');
    store.update((db) => apply(db, v));
  });
  const bindNum = (id, apply, { min = -Infinity, max = Infinity, int = false } = {}) => $(id, el).addEventListener('change', (e) => {
    let v = readNumber(e.target);
    if (v === undefined || (v != null && (v < min || v > max))) return toast('Número inválido');
    if (v != null && int) v = Math.round(v);
    store.update((db) => apply(db, v));
  });

  bindMoney('#h-sal', (db, v) => { db.household.salarioLiquido = v || 0; });
  bindNum('#h-dia', (db, v) => { db.household.diaPagamento = v; }, { min: 1, max: 31, int: true });
  $('#h-conta', el).addEventListener('change', (e) => store.update((db) => { db.household.contaSalarioId = e.target.value || null; }));
  bindNum('#h-pessoas', (db, v) => { db.household.pessoas = v || 1; }, { min: 1, max: 30, int: true });
  bindNum('#h-dep', (db, v) => { db.household.dependentes = v || 0; }, { min: 0, max: 30, int: true });
  $('#h-ilha', el).addEventListener('change', (e) => store.update((db) => { db.household.ilha = e.target.value.trim(); }));
  $('#h-conc', el).addEventListener('change', (e) => store.update((db) => { db.household.concelho = e.target.value.trim(); }));
  bindMoney('#p-cesta', (db, v) => { db.household.parametros.cestaSemanalPorPessoa = v; });
  bindMoney('#p-botija', (db, v) => { db.household.parametros.precoBotija = v; });
  bindMoney('#p-kwh', (db, v) => { db.household.parametros.precoKwh = v; });
  bindMoney('#p-agua', (db, v) => { db.household.parametros.precoAguaM3 = v; });
  bindNum('#p-irs', (db, v) => { db.household.parametros.taxaIRS = v; }, { min: 0, max: 100 });
  bindNum('#p-inps', (db, v) => { db.household.parametros.taxaINPS = v; }, { min: 0, max: 100 });
  bindNum('#p-juro', (db, v) => { db.household.parametros.taxaJuroReferencia = v; }, { min: 0, max: 200 });
  bindNum('#l-verde', (db, v) => { db.settings.limites.racioVerde = v ?? 20; }, { min: 0, max: 100 });
  bindNum('#l-amarelo', (db, v) => { db.settings.limites.racioAmarelo = v ?? 30; }, { min: 0, max: 100 });
  bindMoney('#l-critico', (db, v) => { db.settings.limites.dinheiroDiaCritico = v || null; });
  bindNum('#l-ritmo', (db, v) => { db.settings.limites.diaAlertaRitmo = v ?? 10; }, { min: 1, max: 28, int: true });
  bindNum('#l-tol', (db, v) => { db.settings.limites.toleranciaServicosPct = v ?? 15; }, { min: 0, max: 100 });
  bindNum('#l-prepago', (db, v) => { db.settings.limites.diasAvisoPrePago = v ?? 2; }, { min: 0, max: 15, int: true });

  $('#x-fam', el).addEventListener('change', (e) => {
    const v = readMoney(e.target);
    if (v === undefined) return toast('Valor inválido');
    store.update((db) => { const c = db.categories.find((x) => x.id === famCat?.id); if (c) c.orcamentoMensal = v || null; });
  });
  for (const id of ['#x-r1', '#x-r2', '#x-r3']) $(id, el).addEventListener('change', () => {
    const [a, b, c] = ['#x-r1', '#x-r2', '#x-r3'].map((s) => readNumber($(s, el)) ?? 0);
    if ([a, b, c].some((v) => v === undefined || v < 0) || a + b + c !== 100) {
      $('#x-rerr', el).textContent = `As três partes têm de somar 100% (agora: ${a + b + c}%).`;
      return;
    }
    $('#x-rerr', el).textContent = '';
    store.update((db) => Object.assign(db.extraIncomeRules.find((r) => r.id === rule.id), { fundosDividas: a, emergenciaMetas: b, livre: c }));
  });
  $('#h-filho-new', el).addEventListener('click', () => openChildSheet());
  $('#h-extra-new', el).addEventListener('click', () => openExtraSheet());
  el.addEventListener('click', (e) => {
    const f = e.target.closest('[data-filho]');
    if (f) openChildSheet(store.get().household.filhos.find((x) => x.id === f.dataset.filho));
    const x = e.target.closest('[data-extra]');
    if (x) openExtraSheet(store.get().household.rendimentosExtra.find((r) => r.id === x.dataset.extra));
  });
}

function openChildSheet(filho = null) {
  const s = sheet(`<h2>${filho ? 'Editar' : 'Novo'} filho/a</h2>
    <label class="field"><span>Nome (opcional)</span><input id="f-nome" maxlength="30" value="${esc(filho?.nome)}"></label>
    ${numberField('f-ano', 'Ano de nascimento', filho?.anoNascimento, { min: 1950, max: anoAtual(), placeholder: String(anoAtual() - 8) })}
    <label class="check"><input type="checkbox" id="f-esc" ${filho ? (filho.escolar ? 'checked' : '') : 'checked'}> Em idade escolar (conta para a reentrada escolar)</label>
    <p class="error" id="f-err"></p>
    <div class="row-btns">${filho ? `<button class="btn danger" id="f-del">${icon('trash')} Remover</button>` : ''}
      <button class="btn primary big" id="f-ok">Guardar</button></div>`);
  const el = s.el;
  $('#f-ano', el).addEventListener('change', (e) => {
    const age = anoAtual() - Number(e.target.value);
    if (Number.isFinite(age)) $('#f-esc', el).checked = age >= 4 && age <= 18;
  });
  $('#f-ok', el).addEventListener('click', () => {
    const ano = readNumber($('#f-ano', el));
    if (ano === undefined || (ano != null && (ano < 1950 || ano > anoAtual()))) return ($('#f-err', el).textContent = 'Ano inválido.');
    store.update((db) => {
      const h = db.household;
      let f = h.filhos.find((x) => x.id === filho?.id);
      if (!f) {
        f = { id: newId() };
        h.filhos.push(f);
        h.dependentes = Math.max(h.dependentes, h.filhos.length);
        h.pessoas = Math.max(h.pessoas, h.filhos.length + 1);
      }
      Object.assign(f, { nome: $('#f-nome', el).value.trim(), anoNascimento: ano, escolar: $('#f-esc', el).checked });
    });
    s.close();
  });
  $('#f-del', el)?.addEventListener('click', async () => {
    if (!(await confirmDialog('Remover este filho/a do perfil?', { ok: 'Remover', danger: true }))) return;
    store.update((db) => { db.household.filhos = db.household.filhos.filter((x) => x.id !== filho.id); });
    s.close();
  });
}

function openExtraSheet(r = null) {
  const s = sheet(`<h2>${r ? 'Editar' : 'Novo'} rendimento extra</h2>
    <label class="field"><span>Descrição</span><input id="x-desc" maxlength="40" value="${esc(r?.descricao)}" placeholder="Ex.: Remessa do irmão"></label>
    <label class="field"><span>Tipo</span><select id="x-tipo">${options(Object.entries(TIPOS_EXTRA), r?.tipo || 'remessa', { value: (x) => x[0], label: (x) => x[1] })}</select></label>
    ${moneyField('x-val', 'Valor médio por mês', r?.valorMensal ?? null)}
    <p class="muted small">Conta para o plano do mês. O dinheiro real entra quando registar a receita.</p>
    <p class="error" id="x-err"></p>
    <div class="row-btns">${r ? `<button class="btn danger" id="x-del">${icon('trash')}</button>` : ''}<button class="btn primary big" id="x-ok">Guardar</button></div>`);
  const el = s.el;
  $('#x-ok', el).addEventListener('click', () => {
    const v = readMoney($('#x-val', el));
    const desc = $('#x-desc', el).value.trim();
    if (!desc) return ($('#x-err', el).textContent = 'Indique a descrição.');
    if (!v) return ($('#x-err', el).textContent = 'Indique o valor.');
    store.update((db) => {
      let x = db.household.rendimentosExtra.find((y) => y.id === r?.id);
      if (!x) { x = { id: newId() }; db.household.rendimentosExtra.push(x); }
      Object.assign(x, { descricao: desc, tipo: $('#x-tipo', el).value, valorMensal: v });
    });
    s.close();
  });
  $('#x-del', el)?.addEventListener('click', () => {
    store.update((db) => { db.household.rendimentosExtra = db.household.rendimentosExtra.filter((y) => y.id !== r.id); });
    s.close();
  });
}

