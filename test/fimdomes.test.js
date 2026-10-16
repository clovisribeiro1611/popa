import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cascade, endOfMonth, postponeSuggestions } from '../src/finance.js';
import { CVE, familyDb, catId, tx } from './fixtures.js';

// Ciclo da família tipo: 25 set – 24 out (30 dias). Salário 70 000; essenciais 46 100; emergência 7 000 → livre 16 900.
const salary = (db) => tx(db, '2026-09-25', 'receita', CVE(70000), catId(db, (c) => c.origem === 'salario'));

test('dias até ao salário e dinheiro por dia', () => {
  const db = familyDb();
  salary(db);
  tx(db, '2026-10-05', 'despesa', CVE(4900), catId(db, (c) => c.nome === 'Lazer'));
  const f = endOfMonth(db, '2026-10-15');
  assert.equal(f.diasRestantes, 10, '15 a 24 out');
  assert.equal(f.diasAteSalario, 10);
  assert.equal(f.dinheiroPorDia, CVE(1200), '(16 900 − 4 900) ÷ 10');
  assert.equal(f.semanaCritica, false, 'sem limite definido não há semana crítica');
  assert.equal(endOfMonth(db, '2026-10-24').diasRestantes, 1, 'véspera do salário');
});

test('semana crítica quando o dinheiro por dia cai abaixo do limite', () => {
  const db = familyDb();
  salary(db);
  db.settings.limites.dinheiroDiaCritico = CVE(1500);
  tx(db, '2026-10-05', 'despesa', CVE(4900), catId(db, (c) => c.nome === 'Lazer'));
  const c = cascade(db, '2026-10-15');
  const f = endOfMonth(db, '2026-10-15', c);
  assert.equal(f.semanaCritica, true);
  const p = postponeSuggestions(db, c, '2026-10-15');
  assert.equal(p.evitar[0].categoria.nome, 'Lazer');
  assert.ok(p.essenciais.some((i) => i.tipo === 'alimentacao'), 'mostra o essencial ainda por pagar');
  assert.equal(p.ate, '2026-10-25');
});

test('alerta de ritmo a partir do dia 10 do ciclo, se a projeção não chega ao fim', () => {
  const db = familyDb();
  salary(db);
  const food = catId(db, (c) => c.essencialTipo === 'alimentacao');
  // 10 dias com 2 500/dia em alimentação → projeção 75 000 vs. previsto 31 100 (variáveis) + 16 900 (livre)
  for (let d = 25; d <= 30; d++) tx(db, `2026-09-${d}`, 'despesa', CVE(2500), food);
  for (let d = 1; d <= 4; d++) tx(db, `2026-10-0${d}`, 'despesa', CVE(2500), food);
  const f = endOfMonth(db, '2026-10-04');
  assert.equal(f.diaDoCiclo, 10);
  assert.equal(f.gastoVariavel, CVE(25000));
  assert.equal(f.projecao, CVE(75000));
  assert.equal(f.previstoVariavel, CVE(22000 + 4500 + 1600 + 3000) + cascade(db, '2026-10-04').livre.disponivel);
  assert.equal(f.alertaRitmo, true);
  assert.equal(endOfMonth(db, '2026-10-03').alertaRitmo, false, 'antes do dia 10 não avisa');
});

test('sem excesso de ritmo não há alerta', () => {
  const db = familyDb();
  salary(db);
  tx(db, '2026-10-01', 'despesa', CVE(5000), catId(db, (c) => c.essencialTipo === 'alimentacao'));
  assert.equal(endOfMonth(db, '2026-10-10').alertaRitmo, false);
});
