import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyDb, newId } from '../src/store.js';
import { addSeed, removeSeed } from '../src/seed.js';
import { cascade, debtRatio, emergencyStatus, utilityEstimate, pendingExtraIncome } from '../src/finance.js';
import { advise } from '../src/advisor.js';

const TODAY = '2026-10-15';

test('dados de exemplo: família de 5, salário único, 3 filhos em idade escolar, crédito bancário e fiado', () => {
  const db = createEmptyDb();
  addSeed(db, TODAY, newId);
  const h = db.household;
  assert.equal(h.pessoas, 5);
  assert.equal(h.filhos.filter((f) => f.escolar).length, 3);
  assert.deepEqual(db.debts.map((d) => d.tipo).sort(), ['banco', 'fiado']);
  assert.ok(db.transactions.length > 60);
  assert.ok(db.transactions.every((t) => t.data <= TODAY), 'sem movimentos futuros');
  const r = debtRatio(db);
  assert.equal(r.estado, 'verde');
  const c = cascade(db, TODAY);
  assert.equal(c.income.salarioRecebido, true);
  assert.ok(emergencyStatus(db, TODAY).mesesCobertos < 1, 'fundo de emergência ainda abaixo de 1 mês');
  assert.ok(utilityEstimate(db, 'gas', TODAY).estimativa, 'há registos suficientes para estimar o gás');
  assert.equal(pendingExtraIncome(db, c.cycle).length, 1, 'uma remessa por distribuir');
  assert.ok(advise(db, TODAY).some((a) => a.id === 'emergencia-1'));
  assert.ok(db.funds.some((f) => f.templateId === 'reentrada' && f.valorAlvo === 1800000), 'reentrada × 3 filhos');
});

test('remover os dados de exemplo repõe exatamente os dados reais', () => {
  const db = createEmptyDb();
  db.transactions.push({ id: 'real', data: '2026-10-01', valor: 100, tipo: 'despesa', contaId: db.accounts[0].id, categoriaId: db.categories[0].id });
  db.categories.find((c) => c.essencialTipo === 'casa').orcamentoMensal = 1234500;
  db.household.salarioLiquido = 5000000;
  db.household.pessoas = 2;
  db.settings.limites.racioAmarelo = 35;
  const before = structuredClone(db);
  addSeed(db, TODAY, newId);
  assert.equal(db.categories.find((c) => c.essencialTipo === 'casa').orcamentoMensal, 1234500, 'não sobrepõe orçamentos reais');
  removeSeed(db);
  assert.deepEqual({ ...db, settings: { ...db.settings, seedAtivo: before.settings.seedAtivo } }, before);
});
