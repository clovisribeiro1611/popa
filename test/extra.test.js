import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyExtraIncomeRule, pendingExtraIncome, familyHelp, cycleOf, envelopeBalance, cascade } from '../src/finance.js';
import { newId, CVE, TODAY, familyDb, catId, tx } from './fixtures.js';

const remessa = (db, valor) => tx(db, '2026-10-10', 'receita', valor, catId(db, (c) => c.nome === 'Remessas recebidas'));

test('regra 50/30/20 com fundos, dívidas, emergência e metas', () => {
  const db = familyDb();
  db.funds.push({ id: 'natal', nome: 'Natal', valorAlvo: CVE(15000), proximaData: '2026-12-20', ativo: true });
  db.debts.push({ id: 'b', nome: 'Banco', saldo: CVE(100000), prestacao: CVE(5000), ativa: true, dataSaldo: '2026-01-01' });
  db.goals.push({ id: 'g', nome: 'Férias', valorAlvo: CVE(30000), valorAtual: 0 });
  const t = remessa(db, CVE(20000));
  const r = applyExtraIncomeRule(db, t.id, TODAY, { newId });
  assert.equal(r.fundos, CVE(5000), 'metade dos 50% para os fundos');
  assert.equal(r.dividas, CVE(5000), 'metade dos 50% para as dívidas');
  assert.equal(r.emergencia, CVE(6000), '30% para a emergência (abaixo de 1 mês)');
  assert.equal(r.metas, 0);
  assert.equal(r.livre, CVE(4000), '20% fica livre');
  assert.equal(envelopeBalance(db, 'fundo', 'natal'), CVE(5000));
  assert.equal(applyExtraIncomeRule(db, t.id, TODAY, { newId }), null, 'não aplica duas vezes');
  assert.equal(pendingExtraIncome(db, cycleOf(db, TODAY)).length, 0);
});

test('sem fundos nem dívidas, os 50% vão para a emergência; acima da etapa vão para as metas', () => {
  const db = familyDb();
  db.emergencyFund.baseMensalManual = CVE(10000);
  db.allocations.push({ id: 'a', data: '2026-09-01', destino: 'emergencia', valor: CVE(9000), origem: 'salario' });
  db.goals.push({ id: 'g', nome: 'Férias', valorAlvo: CVE(30000), valorAtual: 0 });
  const t = remessa(db, CVE(10000));
  const r = applyExtraIncomeRule(db, t.id, TODAY, { newId });
  assert.equal(r.emergencia, CVE(1000), 'só o que falta para 1 mês');
  assert.equal(r.metas, CVE(7000), '5 000 + 3 000 − 1 000');
  assert.equal(db.goals[0].valorAtual, CVE(7000));
  assert.equal(r.livre, CVE(2000));
});

test('regra editável e salário nunca é tratado como extra', () => {
  const db = familyDb();
  db.extraIncomeRules[0] = { ...db.extraIncomeRules[0], fundosDividas: 0, emergenciaMetas: 100, livre: 0 };
  const sal = tx(db, '2026-09-25', 'receita', CVE(70000), catId(db, (c) => c.origem === 'salario'));
  assert.equal(pendingExtraIncome(db, cycleOf(db, TODAY)).some((x) => x.id === sal.id), false);
  const t = remessa(db, CVE(5000));
  assert.equal(applyExtraIncomeRule(db, t.id, TODAY, { newId }).emergencia, CVE(5000));
});

test('ajuda a familiares: limite mensal planeado e alerta quando passa', () => {
  const db = familyDb();
  const fam = db.categories.find((c) => c.nivel === 'familia');
  fam.orcamentoMensal = CVE(3000);
  assert.ok(cascade(db, TODAY).levels[0].items.some((i) => i.tipo === 'familia' && i.need === CVE(3000)), 'entra no plano como despesa planeada');
  tx(db, '2026-10-01', 'despesa', CVE(2000), fam.id);
  assert.equal(familyHelp(db, TODAY).excedido, false);
  tx(db, '2026-10-12', 'despesa', CVE(1500), fam.id);
  const f = familyHelp(db, TODAY);
  assert.equal(f.excedido, true);
  assert.equal(f.restante, CVE(-500));
});
