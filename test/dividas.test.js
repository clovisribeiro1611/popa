import { test } from 'node:test';
import assert from 'node:assert/strict';
import { debtRatio, simulateDebts, debtPlan, debtBalance, newCreditImpact, cascade } from '../src/finance.js';
import { CVE, TODAY, familyDb, catId, tx } from './fixtures.js';

const debt = (o) => ({ ativa: true, dataSaldo: '2026-09-01', ...o });

test('rácio de endividamento com semáforo 20% / 30% editável', () => {
  const db = familyDb(); // salário 70 000
  assert.equal(debtRatio(db).pct, 0);
  db.debts.push(debt({ id: 'b', nome: 'Banco', tipo: 'banco', saldo: CVE(300000), prestacao: CVE(10500), taxaAnual: 14 }));
  assert.equal(debtRatio(db).pct, 15);
  assert.equal(debtRatio(db).estado, 'verde');
  db.debts.push(debt({ id: 'f', nome: 'Fiado', tipo: 'fiado', saldo: CVE(8000), prestacao: CVE(4000) }));
  assert.ok(Math.abs(debtRatio(db).pct - 20.71) < 0.01);
  assert.equal(debtRatio(db).estado, 'amarelo');
  assert.equal(debtRatio(db, CVE(7000)).estado, 'vermelho', 'com mais 7 000 passa de 30%');
  assert.equal(debtRatio(db, CVE(7000)).aviso, true);
  db.settings.limites.racioAmarelo = 35;
  assert.equal(debtRatio(db, CVE(7000)).estado, 'amarelo');
});

test('saldo da dívida desconta os pagamentos registados', () => {
  const db = familyDb();
  db.debts.push(debt({ id: 'f', nome: 'Fiado', saldo: CVE(8000), prestacao: CVE(2000) }));
  const cat = catId(db, (c) => c.essencialTipo === 'dividas');
  tx(db, '2026-08-20', 'despesa', CVE(2000), cat, { dividaId: 'f' }); // antes da data do saldo: não conta
  tx(db, '2026-09-25', 'despesa', CVE(2000), cat, { dividaId: 'f' });
  tx(db, '2026-10-10', 'despesa', CVE(2000), cat, { dividaId: 'f' });
  assert.equal(debtBalance(db, db.debts[0]), CVE(4000));
  assert.equal(cascade(db, TODAY).levels[0].items.find((i) => i.key === 'prestacoes').need, CVE(2000));
});

const DEBTS = [
  { id: 'cartao', nome: 'Crédito de consumo', saldo: CVE(50000), prestacao: CVE(2500), taxaAnual: 24 },
  { id: 'banco', nome: 'Crédito bancário', saldo: CVE(200000), prestacao: CVE(6000), taxaAnual: 12 },
  { id: 'fiado', nome: 'Fiado', saldo: CVE(6000), prestacao: CVE(1000), taxaAnual: 0 }
];

test('avalanche paga primeiro a taxa mais alta; bola de neve o saldo mais pequeno', () => {
  const av = simulateDebts(DEBTS, { metodo: 'avalanche', extra: CVE(3000) });
  const bn = simulateDebts(DEBTS, { metodo: 'bolaDeNeve', extra: CVE(3000) });
  assert.equal(bn.ordem[0].id, 'fiado');
  assert.ok(av.ordem.findIndex((d) => d.id === 'cartao') < av.ordem.findIndex((d) => d.id === 'banco'));
  assert.ok(av.totalJuros <= bn.totalJuros, 'a avalanche nunca paga mais juros');
  assert.ok(av.meses > 0 && bn.meses > 0);
});

test('extra mensal reduz prazo e juros face a pagar só o mínimo', () => {
  const db = familyDb();
  db.debts.push(...DEBTS.map((d) => debt(d)));
  db.settings.dividas.extraMensal = CVE(3000);
  const p = debtPlan(db);
  assert.equal(p.metodo, 'avalanche');
  assert.ok(p.poupa.juros > 0);
  assert.ok(p.poupa.meses > 0);
  assert.equal(p.minimo.meses, simulateDebts(DEBTS, { extra: 0, rollover: false }).meses);
  assert.deepEqual(p.semTaxa, ['Fiado']);
});

test('dívida cuja prestação não cobre os juros é assinalada como impossível', () => {
  const r = simulateDebts([{ id: 'x', nome: 'X', saldo: CVE(100000), prestacao: CVE(500), taxaAnual: 12 }]);
  assert.equal(r.impossivel, true);
});

test('crédito novo: impacto no rácio e no livre para gastar', () => {
  const db = familyDb();
  db.debts.push(debt({ id: 'b', nome: 'Banco', saldo: CVE(300000), prestacao: CVE(12000), taxaAnual: 14 }));
  const r = newCreditImpact(db, TODAY, { prestacao: CVE(10000), saldo: CVE(120000), taxaAnual: 20 });
  assert.equal(Math.round(r.antes.pct), 17);
  assert.equal(Math.round(r.depois.pct), 31);
  assert.equal(r.depois.estado, 'vermelho');
  // 70 000 − (46 100 + 12 000) − 7 000 de emergência = 4 900 livres; com mais 10 000 fica défice de 5 100
  assert.equal(r.livreAntes, CVE(4900));
  assert.equal(r.livreDepois, 0);
  assert.equal(r.deficeDepois, CVE(5100));
  assert.equal(r.recomendacao, 'nao');
  assert.equal(db.debts.length, 1, 'não altera os dados reais');
});
