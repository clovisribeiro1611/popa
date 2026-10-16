import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyDb } from '../src/store.js';
import {
  easter, carnival, templateNextDate, templateAmount, activateTemplate, useFund, annualCalendar, nextFundDate
} from '../src/templates.js';
import { fundStatus } from '../src/finance.js';

let seq = 0;
const newId = () => `f${++seq}`;
const CVE = (v) => v * 100;
const TODAY = '2026-10-15';
const tpl = (db, id) => db.seasonalTemplates.find((t) => t.id === id);

test('Páscoa e Carnaval calculados por ano', () => {
  assert.equal(easter(2026), '2026-04-05');
  assert.equal(easter(2027), '2027-03-28');
  assert.equal(easter(2025), '2025-04-20');
  assert.equal(carnival(2026), '2026-02-17');
  assert.equal(carnival(2027), '2027-02-09');
});

test('a migração cria os modelos cabo-verdianos (editáveis, desativados)', () => {
  const db = createEmptyDb();
  for (const id of ['reentrada', 'natal', 'carnaval', 'pascoa', 'sao-joao', 'municipio', 'ferias', 'seguros', 'impostos', 'documentos', 'manutencao', 'estudos']) {
    assert.ok(tpl(db, id), id);
  }
  assert.equal(db.funds.length, 0);
});

test('próxima data: fixa, móvel e por definir', () => {
  const db = createEmptyDb();
  assert.equal(templateNextDate(tpl(db, 'natal'), TODAY), '2026-12-20');
  assert.equal(templateNextDate(tpl(db, 'reentrada'), TODAY), '2027-09-15', 'já passou este ano');
  assert.equal(templateNextDate(tpl(db, 'carnaval'), TODAY), '2027-02-09');
  assert.equal(templateNextDate(tpl(db, 'municipio'), TODAY), null);
});

test('reentrada escolar multiplica pelos filhos em idade escolar', () => {
  const db = createEmptyDb();
  assert.equal(templateAmount(db, tpl(db, 'reentrada')), null, 'sem filhos não há valor');
  db.household.filhos = [{ id: 'a', escolar: true }, { id: 'b', escolar: true }, { id: 'c', escolar: true }, { id: 'd', escolar: false }];
  assert.equal(templateAmount(db, tpl(db, 'reentrada')), CVE(18000));
  assert.equal(templateAmount(db, tpl(db, 'estudos')), CVE(1200000), 'estudos contam todos os filhos');
});

test('ativar um modelo cria o fundo; usar passa-o para o ano seguinte', () => {
  const db = createEmptyDb();
  const f = activateTemplate(db, tpl(db, 'natal'), TODAY, newId);
  assert.equal(f.valorAlvo, CVE(15000));
  assert.equal(f.proximaData, '2026-12-20');
  assert.equal(fundStatus(db, f, TODAY).sugestaoMensal, CVE(5000), '3 ciclos até ao Natal');
  db.allocations.push({ id: 'x', data: TODAY, destino: 'fundo', destinoId: f.id, valor: CVE(15000), origem: 'salario' });
  useFund(db, f.id, CVE(14000), '2026-12-20', newId);
  assert.equal(f.proximaData, '2027-12-20');
  assert.equal(fundStatus(db, f, '2026-12-21').saldo, CVE(1000), 'o que sobra fica no fundo');
  assert.equal(activateTemplate(db, tpl(db, 'municipio'), TODAY, newId), null, 'sem data não ativa');
});

test('fundo da Páscoa usado recalcula a data móvel do ano seguinte', () => {
  const db = createEmptyDb();
  const f = activateTemplate(db, tpl(db, 'pascoa'), '2026-01-10', newId);
  assert.equal(f.proximaData, '2026-04-05');
  assert.equal(nextFundDate(db, f), '2027-03-28');
});

test('calendário anual: totais por mês, sugestões e meses pesados', () => {
  const db = createEmptyDb();
  db.household.filhos = [{ id: 'a', escolar: true }, { id: 'b', escolar: true }];
  activateTemplate(db, tpl(db, 'natal'), TODAY, newId);
  activateTemplate(db, tpl(db, 'reentrada'), TODAY, newId);
  activateTemplate(db, tpl(db, 'carnaval'), TODAY, newId);
  const cal = annualCalendar(db, TODAY);
  assert.equal(cal.months.length, 12);
  assert.deepEqual([cal.months[0].y, cal.months[0].m], [2026, 10]);
  const dez = cal.months.find((x) => x.m === 12);
  assert.equal(dez.total, CVE(15000));
  assert.ok(dez.pesado);
  const set = cal.months.find((x) => x.m === 9);
  assert.equal(set.total, CVE(12000));
  assert.ok(cal.months.find((x) => x.m === 3).sugestoes.some((s) => s.id === 'pascoa'), 'Páscoa de 2027 (28 mar) sugerida em março');
  assert.ok(!cal.months.some((x) => x.sugestoes.some((s) => s.id === 'natal')), 'modelo ativo não aparece como sugestão');
});
