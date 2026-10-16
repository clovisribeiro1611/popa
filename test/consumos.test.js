import { test } from 'node:test';
import assert from 'node:assert/strict';
import { utilityEstimate, weeklyFood, weekStart, servicesVariation } from '../src/finance.js';
import { newId, CVE, TODAY, familyDb, catId, tx } from './fixtures.js';

test('pré-pago de eletricidade: custo por dia, duração do último carregamento e aviso', () => {
  const db = familyDb();
  const log = (data, valor) => db.utilityLogs.push({ id: newId(), tipo: 'eletricidade', data, valor });
  log('2026-09-01', CVE(1500)); log('2026-09-11', CVE(1500)); log('2026-09-21', CVE(1500)); log('2026-10-01', CVE(3000));
  const e = utilityEstimate(db, 'eletricidade', TODAY).estimativa;
  assert.equal(e.custoDia, CVE(4500) / 30, '4 500 em 30 dias = 150/dia');
  assert.equal(e.duracao, 20, 'carregamento de 3 000 dura 20 dias');
  assert.equal(e.acabaEm, '2026-10-21');
  assert.equal(e.diasRestantes, 6);
  assert.equal(e.aviso, false);
  assert.equal(e.reservaSemana, CVE(1050));
  assert.equal(e.custoMes, CVE(4563), '150 × 365 / 12');
  assert.equal(utilityEstimate(db, 'eletricidade', '2026-10-20').estimativa.aviso, true, 'falta 1 dia ≤ 2');
  assert.equal(utilityEstimate(db, 'agua', TODAY).estimativa, null, 'sem registos não há estimativa');
});

test('botija de gás: duração e custo mensal', () => {
  const db = familyDb();
  for (const d of ['2026-06-01', '2026-07-06', '2026-08-10', '2026-09-14']) db.utilityLogs.push({ id: newId(), tipo: 'gas', data: d, valor: CVE(1750) });
  const g = utilityEstimate(db, 'gas', TODAY).estimativa;
  assert.equal(g.duracao, 35);
  assert.equal(g.acabaEm, '2026-10-19');
  assert.equal(g.custoMes, CVE(1521), '1 750 a cada 35 dias ≈ 1 521/mês');
});

test('cesta alimentar semanal: ritmo a meio da semana', () => {
  const db = familyDb();
  db.household.parametros.cestaSemanalPorPessoa = CVE(1000);
  const food = catId(db, (c) => c.essencialTipo === 'alimentacao');
  assert.equal(weekStart('2026-10-15'), '2026-10-12', 'quinta → segunda');
  assert.equal(weekStart('2026-10-18'), '2026-10-12', 'domingo pertence à semana que começou na segunda');
  tx(db, '2026-10-12', 'despesa', CVE(2000), food);
  tx(db, '2026-10-14', 'despesa', CVE(1500), food);
  tx(db, '2026-10-11', 'despesa', CVE(9000), food); // semana anterior
  const w = weeklyFood(db, TODAY);
  assert.equal(w.orcamento, CVE(5000));
  assert.equal(w.gasto, CVE(3500));
  assert.equal(w.dia, 4);
  assert.equal(w.meioDaSemana, true);
  assert.equal(w.estado, 'acima', '3 500 > 4/7 de 5 000 × 1,15');
  assert.equal(w.porDiaRestante, CVE(1500) / 4);
});

test('cesta sem parâmetro usa o orçamento mensal da alimentação', () => {
  const db = familyDb();
  assert.equal(weeklyFood(db, TODAY).orcamento, CVE(5077), '22 000 × 12 / 52');
});

test('telefone/internet: alerta quando passa a tolerância', () => {
  const db = familyDb();
  const com = db.categories.find((c) => c.essencialTipo === 'comunicacoes');
  com.orcamentoMensal = CVE(2500);
  tx(db, '2026-10-01', 'despesa', CVE(3000), com.id);
  const [v] = servicesVariation(db, TODAY);
  assert.equal(Math.round(v.variacao * 100), 20);
  assert.equal(v.alerta, true);
  db.settings.limites.toleranciaServicosPct = 25;
  assert.equal(servicesVariation(db, TODAY)[0].alerta, false);
});
