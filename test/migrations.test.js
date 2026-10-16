import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, validate, CURRENT_VERSION } from '../src/migrations.js';

test('v0 vazio é normalizado para a versão atual', () => {
  const db = migrate({});
  assert.equal(db.schemaVersion, CURRENT_VERSION);
  assert.deepEqual(db.transactions, []);
  assert.equal(db.settings.moeda, 'CVE');
  assert.equal(db.settings.bloqueio.ativo, false);
  validate(db);
});

test('definições existentes são preservadas', () => {
  const db = migrate({ settings: { tema: 'escuro', bloqueio: { ativo: true } } });
  assert.equal(db.settings.tema, 'escuro');
  assert.equal(db.settings.bloqueio.ativo, true);
  assert.equal(db.settings.bloqueio.biometria, true);
});

test('passos são aplicados por ordem até à versão alvo', () => {
  const steps = {
    0: (d) => { d.log = ['0→1']; return d; },
    1: (d) => { d.log.push('1→2'); return d; },
    2: (d) => { d.log.push('2→3'); }
  };
  const db = migrate({}, steps, 3);
  assert.deepEqual(db.log, ['0→1', '1→2', '2→3']);
  assert.equal(db.schemaVersion, 3);
  assert.deepEqual(migrate({ schemaVersion: 2, log: [] }, steps, 3).log, ['2→3']);
});

test('erros: passo em falta, versão futura, conteúdo não-objeto', () => {
  assert.throws(() => migrate({}, {}, 1), /Falta a migração v0/);
  assert.throws(() => migrate({ schemaVersion: CURRENT_VERSION + 1 }), /mais recente/);
  assert.throws(() => migrate([]), /inválido/);
  assert.throws(() => validate({ settings: {} }), /accounts/);
});

test('v1 → v2: classifica categorias, cria as que faltam e não duplica', () => {
  const v1 = {
    schemaVersion: 1, settings: { primeiroDiaDoMes: 1 }, accounts: [], transactions: [], recurring: [], goals: [{ id: 'g' }],
    categories: [
      { id: 'a', nome: 'Água e Luz', tipo: 'despesa' },
      { id: 'b', nome: 'Gás', tipo: 'despesa' },
      { id: 'c', nome: 'Remessas recebidas', tipo: 'receita' },
      { id: 'd', nome: 'Café', tipo: 'despesa' }
    ]
  };
  const db = migrate(v1);
  const by = (id) => db.categories.find((c) => c.id === id);
  assert.equal(by('a').essencialTipo, 'energia');
  assert.equal(by('b').essencialTipo, 'gas');
  assert.equal(by('d').nivel, 'livre');
  assert.equal(db.categories.filter((c) => c.essencialTipo === 'energia').length, 1, 'não cria "Eletricidade e água" de novo');
  assert.equal(db.categories.filter((c) => c.essencialTipo === 'gas').length, 1);
  assert.equal(db.categories.filter((c) => c.nome === 'Remessas recebidas').length, 1);
  assert.equal(db.household.diaPagamento, null);
  assert.equal(db.goals[0].horizonte, 'curto');
  assert.equal(db.emergencyFund.percentagemSalario, 10);
  for (const k of ['debts', 'funds', 'allocations', 'seasonalTemplates', 'utilityLogs', 'extraIncomeRules', 'scenarios']) assert.ok(Array.isArray(db[k]), k);
  // Valores legais nunca vêm preenchidos
  assert.ok(Object.values(db.household.parametros).every((v) => v === null));
});

test('schemaVersion inválido é rejeitado', () => {
  assert.throws(() => migrate({ schemaVersion: 'dois' }), /desconhecido/);
  assert.throws(() => migrate({ schemaVersion: -1 }), /desconhecido/);
});
