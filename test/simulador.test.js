import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateScenario } from '../src/finance.js';
import { CVE, TODAY, familyDb } from './fixtures.js';

// Família tipo (plano): salário 70 000, essenciais 46 100, emergência 10% = 7 000 → livre 16 900.

test('salário desce 10%: menos livre e menor contribuição para a emergência; dados reais intactos', () => {
  const db = familyDb();
  const antes = JSON.stringify(db);
  const r = simulateScenario(db, TODAY, { salarioPct: -10 });
  assert.equal(r.base.livre, CVE(16900));
  assert.equal(r.cenario.rendimento, CVE(63000));
  assert.equal(r.cenario.emergencia.contribuicao, CVE(6300));
  assert.equal(r.cenario.livre, CVE(63000 - 46100 - 6300));
  assert.equal(r.delta.livre, CVE(-6300));
  assert.equal(JSON.stringify(db), antes, 'o simulador não altera os dados');
});

test('alimentação sobe 10%', () => {
  const r = simulateScenario(familyDb(), TODAY, { alimentacaoPct: 10 });
  assert.equal(r.cenario.essenciais - r.base.essenciais, CVE(2200));
  assert.equal(r.delta.livre, CVE(-2200));
});

test('nasce mais um filho: alimentação cresce com o nº de pessoas (ou pela cesta)', () => {
  const db = familyDb();
  let r = simulateScenario(db, TODAY, { filhosDelta: 1 });
  assert.equal(r.cenario.essenciais - r.base.essenciais, CVE(4400), '22 000 × 6/5');
  db.household.parametros.cestaSemanalPorPessoa = CVE(1000);
  db.categories.find((c) => c.essencialTipo === 'alimentacao').orcamentoMensal = null;
  r = simulateScenario(db, TODAY, { filhosDelta: 1 });
  assert.equal(r.cenario.essenciais - r.base.essenciais, CVE(4333), '1 000 × 52 / 12 por pessoa');
});

test('dívida nova: rácio e livre; com défice quando não cabe', () => {
  const r = simulateScenario(familyDb(), TODAY, { novaDivida: { prestacao: CVE(20000), saldo: CVE(200000), taxaAnual: 18 } });
  assert.equal(Math.round(r.cenario.racio.pct), 29);
  assert.equal(r.cenario.racio.estado, 'amarelo');
  assert.equal(r.cenario.livre, 0);
  assert.equal(r.cenario.deficit, CVE(3100));
});

test('perda de um rendimento extra', () => {
  const db = familyDb();
  db.household.rendimentosExtra = [{ id: 'rem', descricao: 'Remessa', tipo: 'remessa', valorMensal: CVE(8000) }, { id: 'bis', descricao: 'Biscate', tipo: 'biscate', valorMensal: CVE(3000) }];
  assert.equal(simulateScenario(db, TODAY, { perdaExtra: 'rem' }).delta.rendimento, CVE(-8000));
  assert.equal(simulateScenario(db, TODAY, { perdaExtra: 'todos' }).delta.livre, CVE(-11000));
});

test('cenários combinados', () => {
  const r = simulateScenario(familyDb(), TODAY, { salarioPct: 5, alimentacaoPct: 10 });
  assert.equal(r.delta.livre, CVE(3500 - 350 - 2200), '+3 500 salário, −350 emergência, −2 200 alimentação');
});
