import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cascade, suggestCuts, emergencyStatus, reserveCycle, useEmergency, essentialMonthly, cycleOf, fundStatus, cyclesUntil
} from '../src/finance.js';
import { newId, CVE, TODAY, familyDb, catId, tx } from './fixtures.js';

test('ciclo salarial: dia 25 → 25 set a 24 out', () => {
  const c = cycleOf(familyDb(), TODAY);
  assert.deepEqual([c.start, c.end], ['2026-09-25', '2026-10-24']);
});

test('cascata: rendimento cobre tudo e sobra "livre para gastar"', () => {
  const db = familyDb();
  tx(db, '2026-09-25', 'receita', CVE(70000), catId(db, (c) => c.origem === 'salario'));
  tx(db, '2026-09-26', 'despesa', CVE(15000), catId(db, (c) => c.essencialTipo === 'casa'));
  tx(db, '2026-10-01', 'despesa', CVE(2000), catId(db, (c) => c.nome === 'Lazer'));
  const c = cascade(db, TODAY);
  const [ess, emerg] = c.levels;
  assert.equal(c.income.total, CVE(70000));
  assert.equal(ess.need, CVE(15000 + 22000 + 4500 + 1600 + 3000));
  assert.equal(ess.porPagar, CVE(22000 + 4500 + 1600 + 3000), 'a renda já foi paga');
  assert.equal(emerg.need, CVE(7000), '10% do salário');
  assert.equal(c.deficit, 0);
  assert.equal(c.livre.disponivel, CVE(70000 - 46100 - 7000));
  assert.equal(c.livre.paraGastar, CVE(70000 - 46100 - 7000 - 2000));
  assert.equal(c.tudoCoberto, true);
});

test('cascata: gastar acima do orçado num essencial reduz o que sobra', () => {
  const db = familyDb();
  tx(db, '2026-10-01', 'despesa', CVE(25000), catId(db, (c) => c.essencialTipo === 'alimentacao'));
  const c = cascade(db, TODAY);
  assert.equal(c.levels[0].use, CVE(46100 + 3000));
  assert.equal(c.livre.disponivel, CVE(70000 - 49100 - 7000));
});

test('cascata com défice: mostra onde falta e sugere cortes por ordem de impacto', () => {
  const db = familyDb();
  db.household.salarioLiquido = CVE(55000);
  db.funds.push({ id: 'natal', nome: 'Natal', tipo: 'provisao', valorAlvo: CVE(24000), proximaData: '2026-12-20', antecedenciaMeses: 6, ativo: true });
  db.funds.push({ id: 'escola', nome: 'Reentrada escolar', tipo: 'provisao', valorAlvo: CVE(36000), proximaData: '2027-09-15', antecedenciaMeses: 6, ativo: true });
  db.goals.push({ id: 'g', nome: 'Férias', valorAlvo: CVE(30000), valorAtual: 0, prazo: '2027-07-31', horizonte: 'curto' });
  const c = cascade(db, TODAY);
  // 55 000 − 46 100 essenciais = 8 900 → emergência (5 500) coberta, fundos (8 000 + 3 000) só parcialmente
  assert.equal(c.levels[0].deficit, 0);
  assert.equal(c.levels[1].deficit, 0);
  assert.equal(c.primeiroDefice.key, 'fundos');
  assert.equal(c.levels[2].coberto, CVE(55000 - 46100 - 5500));
  assert.ok(c.levels[4].deficit > 0, 'as metas ficam por cobrir');
  assert.equal(c.livre.disponivel, 0);
  assert.equal(c.deficit, c.levels.reduce((s, l) => s + l.deficit, 0));

  const cuts = suggestCuts(db, c, TODAY);
  assert.ok(cuts.length >= 3);
  const naoEssenciais = cuts.filter((x) => x.nivel > 1);
  for (let i = 1; i < naoEssenciais.length; i++) assert.ok(naoEssenciais[i - 1].valor >= naoEssenciais[i].valor, 'ordenados por impacto');
  assert.ok(cuts.some((x) => /Reentrada escolar/.test(x.texto)), 'fundo distante pode ser reduzido');
  assert.ok(!cuts.some((x) => /Natal/.test(x.texto)), 'fundo próximo (Natal) não é cortado');
  assert.ok(cuts.at(-1).cobreDefice || cuts.at(-1).acumulado < c.deficit);
});

test('cascata em modo plano usa rendimentos extra esperados', () => {
  const db = familyDb();
  db.household.rendimentosExtra.push({ id: 'r', descricao: 'Remessa', tipo: 'remessa', valorMensal: CVE(5000) });
  tx(db, '2026-09-25', 'receita', CVE(1), catId(db, (c) => c.origem === 'salario'));
  assert.equal(cascade(db, TODAY, { mode: 'plano' }).income.total, CVE(75000));
  assert.equal(cascade(db, TODAY).income.total, CVE(1), 'modo real usa o que foi registado');
});

test('fundo de emergência: etapas de 1, 3 e 6 meses, com datas estimadas', () => {
  const db = familyDb();
  const base = essentialMonthly(db);
  assert.equal(base, CVE(46100));
  db.allocations.push({ id: 'a', data: '2026-09-25', destino: 'emergencia', destinoId: null, valor: CVE(36880), origem: 'salario' });
  const st = emergencyStatus(db, TODAY);
  assert.equal(st.saldo, CVE(36880));
  assert.equal(Math.round(st.mesesCobertos * 10) / 10, 0.8);
  assert.equal(st.etapaAtual.meses, 1);
  assert.equal(st.contribuicao, CVE(7000));
  assert.equal(st.etapas[0].mesesAte, 2, 'faltam 9 220 → 2 meses a 7 000');
  assert.equal(st.etapas[0].data, '2026-12-15');
  assert.equal(st.etapas[1].mesesAte, Math.ceil((CVE(46100 * 3) - CVE(36880)) / CVE(7000)));
});

test('fundo de emergência ligado a uma conta usa o saldo dessa conta', () => {
  const db = familyDb();
  db.accounts.push({ id: 'poup', nome: 'Poupança', tipo: 'poupanca', saldoInicial: CVE(100000) });
  db.emergencyFund.contaId = 'poup';
  assert.equal(emergencyStatus(db, TODAY).saldo, CVE(100000));
  assert.equal(emergencyStatus(db, TODAY).etapaAtual.meses, 3);
});

test('usar o fundo cria plano de reposição, que entra na cascata e termina quando reposto', () => {
  const db = familyDb();
  db.allocations.push({ id: 'a', data: '2026-06-01', destino: 'emergencia', valor: CVE(200000), origem: 'salario' });
  const plan = useEmergency(db, CVE(60000), TODAY, { newId, nota: 'Dentista' });
  assert.equal(plan.valorMensal, CVE(10000), '60 000 em 6 meses > 7 000 da contribuição normal');
  let st = emergencyStatus(db, TODAY);
  assert.equal(st.saldo, CVE(140000));
  assert.equal(st.reposicao.ativa, true);
  assert.equal(cascade(db, TODAY).levels[1].need, CVE(10000));
  db.allocations.push({ id: 'b', data: '2026-11-25', destino: 'emergencia', valor: CVE(60000), origem: 'extra' });
  st = emergencyStatus(db, '2026-11-26');
  assert.equal(st.reposicao.ativa, false);
});

test('"Reservar este mês" cria as alocações em falta só até onde o rendimento cobre', () => {
  const db = familyDb();
  db.household.salarioLiquido = CVE(55000);
  db.funds.push({ id: 'natal', nome: 'Natal', tipo: 'provisao', valorAlvo: CVE(24000), proximaData: '2026-12-20', ativo: true });
  db.goals.push({ id: 'g', nome: 'Férias', valorAlvo: CVE(30000), valorAtual: 0, prazo: '2027-07-31' });
  const created = reserveCycle(db, TODAY, { newId });
  const by = (d) => created.filter((a) => a.destino === d).reduce((s, a) => s + a.valor, 0);
  assert.equal(by('emergencia'), CVE(5500));
  assert.equal(by('fundo'), CVE(55000 - 46100 - 5500), 'só o que sobra');
  assert.equal(by('meta'), 0);
  assert.equal(reserveCycle(db, TODAY, { newId }).length, 0, 'não reserva duas vezes');
  assert.equal(cascade(db, TODAY).levels[1].porReservar, 0);
});

test('fundos: sugestão mensal pelo nº de ciclos até à data', () => {
  const db = familyDb();
  const f = { id: 'n', nome: 'Natal', valorAlvo: CVE(24000), proximaData: '2026-12-20', antecedenciaMeses: 6 };
  assert.equal(cyclesUntil(db, TODAY, f.proximaData), 3, 'ciclos de out, nov e dez (até 24 dez)');
  const st = fundStatus(db, f, TODAY);
  assert.equal(st.sugestaoMensal, CVE(8000));
  assert.equal(st.alerta, true);
});
