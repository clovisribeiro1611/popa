import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advise, indicators, alerts, toggleAdviceDone, reviewsDue } from '../src/advisor.js';
import { CVE, TODAY, familyDb, catId, tx } from './fixtures.js';

const plain = (s) => s.replace(/ /g, ' ');
const salary = (db, data = '2026-09-25') => tx(db, data, 'receita', CVE(70000), catId(db, (c) => c.origem === 'salario'));

test('conselho: fundo de emergência abaixo de 1 mês explica o porquê com os números', () => {
  const db = familyDb();
  salary(db);
  db.allocations.push({ id: 'a', data: '2026-09-25', destino: 'emergencia', valor: CVE(36880), origem: 'salario' });
  const list = advise(db, TODAY);
  const e = list.find((x) => x.id === 'emergencia-1');
  assert.ok(e, 'aparece no conselho do mês');
  assert.match(plain(e.porque), /cobre 0,8 meses \(36 880,00 CVE de 46 100,00 CVE/);
  assert.match(e.texto, /chegar a 1 mês .* antes de aumentar gastos livres/);
  assert.ok(list.length <= 3);
});

test('conselho: défice tem prioridade máxima', () => {
  const db = familyDb();
  db.household.salarioLiquido = CVE(40000);
  const [first] = advise(db, TODAY);
  assert.equal(first.id, 'defice');
  assert.match(plain(first.porque), /Faltam .* a partir de “Essenciais”/);
});

test('conselho: rácio vermelho e dívida cara', () => {
  const db = familyDb();
  salary(db);
  db.household.parametros.taxaJuroReferencia = 15;
  db.debts.push({ id: 'c', nome: 'Crédito de consumo', saldo: CVE(80000), prestacao: CVE(25000), taxaAnual: 24, ativa: true, dataSaldo: '2026-01-01' });
  const all = advise(db, TODAY, { limit: 20 });
  const r = all.find((x) => x.id === 'racio');
  assert.equal(r.prioridade, 2);
  assert.match(plain(r.porque), /35,7% do salário/);
});

test('conselho do mês: no máximo 3, por prioridade; marcar como feito', () => {
  const db = familyDb();
  db.household.salarioLiquido = CVE(40000);
  db.settings.limites.dinheiroDiaCritico = CVE(1000);
  const list = advise(db, TODAY);
  assert.equal(list.length, 3);
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].prioridade <= list[i].prioridade);
  toggleAdviceDone(db, TODAY, list[0].id);
  assert.equal(advise(db, TODAY)[0].feito, true);
  toggleAdviceDone(db, TODAY, list[0].id);
  assert.equal(advise(db, TODAY)[0].feito, false);
});

test('sem problemas: conselho de manutenção', () => {
  const db = familyDb();
  salary(db);
  db.emergencyFund.percentagemSalario = 0;
  db.allocations.push({ id: 'a', data: '2026-01-01', destino: 'emergencia', valor: CVE(46100 * 7), origem: 'salario' });
  db.funds.push({ id: 'l', nome: 'Estudos', tipo: 'longoPrazo', valorAlvo: CVE(100), proximaData: '2035-01-01', ativo: true });
  db.allocations.push({ id: 'b', data: '2026-01-01', destino: 'fundo', destinoId: 'l', valor: CVE(100), origem: 'salario' });
  const list = advise(db, TODAY);
  assert.deepEqual(list.map((x) => x.id), ['manter']);
});

test('indicadores: poupança, emergência, essenciais, rácio e pontualidade', () => {
  const db = familyDb();
  salary(db, '2026-08-25');
  tx(db, '2026-08-26', 'despesa', CVE(56000), catId(db, (c) => c.essencialTipo === 'casa'));
  db.allocations.push({ id: 'a', data: '2026-08-26', destino: 'emergencia', valor: CVE(7000), origem: 'salario' });
  db.allocations.push({ id: 'b', data: '2026-09-10', destino: 'emergencia', valor: CVE(3000), origem: 'salario' });
  const ind = Object.fromEntries(indicators(db, TODAY).map((i) => [i.id, i]));
  assert.equal(Math.round(ind.poupanca.valor), 20, 'ciclo 25 ago – 24 set: (70 000 − 56 000) / 70 000');
  assert.equal(ind.poupanca.estado, 'bom');
  assert.equal(Math.round(ind.essenciais.valor * 10) / 10, 65.9, '46 100 / 70 000');
  assert.equal(ind.essenciais.estado, 'atencao');
  assert.equal(ind.pontualidade.valor, 70, '7 000 de 10 000 reservados até ao 5.º dia');
  assert.equal(ind.racio.valor, 0);
  assert.equal(ind.emergencia.estado, 'mau');
});

test('avisos e revisões', () => {
  const db = familyDb();
  db.household.parametros.cestaSemanalPorPessoa = CVE(1000);
  tx(db, '2026-10-12', 'despesa', CVE(6000), catId(db, (c) => c.essencialTipo === 'alimentacao'));
  const a = alerts(db, TODAY);
  assert.equal(a[0].id, 'cesta');
  assert.equal(a[0].nivel, 'bad');
  assert.ok(a.some((x) => x.id === 'rev:semanal'));
  db.advice.revisoes.push({ tipo: 'semanal', data: '2026-10-12' });
  assert.equal(reviewsDue(db, TODAY).semanal, false);
  assert.equal(reviewsDue(db, '2026-10-19').semanal, true);
});

import { reminders } from '../src/advisor.js';

test('lembretes dos próximos 30 dias: salário, revisão, pré-pagos, prestações e fundos', () => {
  const db = familyDb();
  db.debts.push({ id: 'b', nome: 'Banco', saldo: CVE(100000), prestacao: CVE(5000), diaPagamento: 28, ativa: true, dataSaldo: '2026-01-01' });
  for (const d of ['2026-09-21', '2026-10-01', '2026-10-11']) db.utilityLogs.push({ id: d, tipo: 'eletricidade', data: d, valor: CVE(1500) });
  db.funds.push({ id: 'natal', nome: 'Natal', valorAlvo: CVE(15000), proximaData: '2026-12-20', antecedenciaMeses: 6, ativo: true });
  const list = reminders(db, TODAY);
  const ids = list.map((r) => r.id);
  assert.ok(ids.includes('salario:2026-10-25'));
  assert.ok(ids.includes('revisao:2026-10-18'), 'domingo');
  assert.ok(ids.includes('util:eletricidade:2026-10-21'), 'aviso 2 dias antes de acabar');
  assert.equal(list.find((r) => r.id === 'util:eletricidade:2026-10-21').quando.getDate(), 19);
  assert.ok(ids.includes('divida:b:2026-10-28'));
  assert.ok(ids.includes('fundo:natal:2026-10-25'));
  assert.equal(new Set(ids).size, ids.length, 'ids únicos e estáveis');
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].quando <= list[i].quando);
  assert.ok(list.every((r) => r.quando >= new Date('2026-10-15T00:00:00')));
});
