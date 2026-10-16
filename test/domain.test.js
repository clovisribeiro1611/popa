import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatMoney, parseMoney, accountBalances, totalBalance, periodFor, shiftPeriod, periodSummary, budgets,
  budgetState, compareWithPrevious, addMonths, nextOccurrence, generateRecurring, filterTransactions,
  groupByDay, goalProgress, toCSV, importCSV, validateTransaction
} from '../src/domain.js';

const plain = (s) => s.replace(/ /g, ' ');

test('formatMoney', () => {
  assert.equal(plain(formatMoney(1250050)), '12 500,50 CVE');
  assert.equal(plain(formatMoney(1250050, { casasDecimais: 0 })), '12 501 CVE');
  assert.equal(plain(formatMoney(5)), '0,05 CVE');
  assert.equal(plain(formatMoney(123456789)), '1 234 567,89 CVE');
  assert.equal(plain(formatMoney(-150000)), '−1 500,00 CVE');
  assert.equal(plain(formatMoney(150000, undefined, { sign: true, symbol: false })), '+1 500,00');
});

test('parseMoney', () => {
  const cases = {
    '12500': 1250000, '12 500': 1250000, '12 500,5': 1250050, '12.500,50': 1250050,
    '12,500.50': 1250050, '12500.5': 1250050, '12.500': 1250000, '1,5': 150, '0,29': 29,
    ',75': 75, '10,005': 1001, '1.234.567': 123456700, '12 500 CVE': 1250000, '-20': -2000
  };
  for (const [txt, cents] of Object.entries(cases)) assert.equal(parseMoney(txt), cents, txt);
  for (const bad of ['', 'abc', '1,2,3', '12a', null]) assert.equal(parseMoney(bad), null, String(bad));
});

let seq = 0;
const newId = () => `id${++seq}`;
const tx = (data, tipo, valor, extra = {}) => ({ id: newId(), data, tipo, valor, contaId: 'a1', contaDestinoId: null,
  categoriaId: tipo === 'transferencia' ? null : 'c1', descricao: '', notas: '', recorrenteId: null, ...extra });
const baseDb = () => ({
  settings: { contaPorDefeito: 'a1' },
  accounts: [
    { id: 'a1', nome: 'Carteira', saldoInicial: 10000 },
    { id: 'a2', nome: 'Banco', saldoInicial: 500000 },
    { id: 'a3', nome: 'Antiga', saldoInicial: 700, arquivada: true }
  ],
  categories: [
    { id: 'c1', nome: 'Supermercado', tipo: 'despesa', orcamentoMensal: 100000 },
    { id: 'c2', nome: 'Restauração', tipo: 'despesa', orcamentoMensal: 50000 },
    { id: 'c3', nome: 'Lazer', tipo: 'despesa', orcamentoMensal: null },
    { id: 'c9', nome: 'Salário', tipo: 'receita' }
  ],
  transactions: [], recurring: [], goals: []
});

test('saldos: receitas, despesas, transferências e data limite', () => {
  const db = baseDb();
  db.transactions.push(
    tx('2026-10-01', 'receita', 200000, { contaId: 'a2', categoriaId: 'c9' }),
    tx('2026-10-02', 'despesa', 5000),
    tx('2026-10-03', 'transferencia', 30000, { contaId: 'a2', contaDestinoId: 'a1' }),
    tx('2026-10-20', 'despesa', 1000)
  );
  const b = accountBalances(db);
  assert.equal(b.get('a1'), 10000 - 5000 + 30000 - 1000);
  assert.equal(b.get('a2'), 500000 + 200000 - 30000);
  assert.equal(accountBalances(db, '2026-10-15').get('a1'), 35000, 'ignora movimentos futuros');
  assert.equal(totalBalance(db), 34000 + 670000, 'exclui contas arquivadas');
});

test('períodos com primeiro dia do mês = 1 e = 25', () => {
  assert.deepEqual([periodFor('2026-10-15').start, periodFor('2026-10-15').end], ['2026-10-01', '2026-10-31']);
  assert.equal(periodFor('2026-02-10').end, '2026-02-28');
  const p = periodFor('2026-10-10', 25);
  assert.deepEqual([p.start, p.end, p.key], ['2026-09-25', '2026-10-24', '2026-10']);
  assert.equal(periodFor('2026-10-25', 25).key, '2026-11');
  assert.equal(shiftPeriod(periodFor('2026-01-15'), -1).start, '2025-12-01');
  assert.equal(shiftPeriod(periodFor('2026-03-31'), -1).end, '2026-02-28');
});

test('resumo e orçamentos (verde/amarelo/vermelho), transferências não contam', () => {
  const db = baseDb();
  db.transactions.push(
    tx('2026-10-01', 'receita', 300000, { categoriaId: 'c9' }),
    tx('2026-10-02', 'despesa', 50000),
    tx('2026-10-05', 'despesa', 45000, { categoriaId: 'c2' }),
    tx('2026-10-06', 'despesa', 10000, { categoriaId: 'c2' }),
    tx('2026-10-07', 'despesa', 9999, { categoriaId: 'c3' }),
    tx('2026-10-08', 'transferencia', 99999, { contaDestinoId: 'a2' }),
    tx('2026-09-30', 'despesa', 70000)
  );
  const p = periodFor('2026-10-15');
  const s = periodSummary(db, p);
  assert.deepEqual([s.receitas, s.despesas, s.saldo], [300000, 114999, 185001]);
  const b = budgets(db, p);
  assert.deepEqual(b.map((x) => [x.categoria.id, x.estado]), [['c2', 'excedido'], ['c1', 'ok']]);
  assert.equal(budgetState(80000, 100000).estado, 'aviso');
  assert.equal(budgetState(100000, 100000).estado, 'aviso');
  assert.equal(budgetState(79999, 100000).estado, 'ok');
  assert.equal(budgetState(1, 0), null);
  const cmp = compareWithPrevious(db, p);
  assert.equal(cmp.prev.despesas, 70000);
  assert.deepEqual(cmp.categorias.find((c) => c.categoriaId === 'c1'), { categoriaId: 'c1', atual: 50000, anterior: 70000 });
});

test('addMonths mantém o dia âncora', () => {
  assert.equal(addMonths('2026-01-31', 1, 31), '2026-02-28');
  assert.equal(addMonths('2026-02-28', 1, 31), '2026-03-31');
  assert.equal(addMonths('2028-01-31', 1, 31), '2028-02-29');
  assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
  assert.equal(addMonths('2026-01-15', -2), '2025-11-15');
});

test('recorrências: gera em atraso, avança, respeita dataFim e não duplica', () => {
  const db = baseDb();
  db.recurring.push(
    { id: 'r1', descricao: 'Renda', valor: 3000000, tipo: 'despesa', periodicidade: 'mensal', intervalo: 1, diaAncora: 31,
      proximaData: '2026-07-31', dataFim: null, ativo: true, contaId: 'a2', contaDestinoId: null, categoriaId: 'c1' },
    { id: 'r2', descricao: 'Poupança', valor: 1000, tipo: 'transferencia', periodicidade: 'semanal', intervalo: 2,
      proximaData: '2026-09-20', dataFim: '2026-10-10', ativo: true, contaId: 'a1', contaDestinoId: 'a2', categoriaId: 'c1' },
    { id: 'r3', descricao: 'Inativa', valor: 1, tipo: 'despesa', periodicidade: 'diaria', intervalo: 1,
      proximaData: '2026-01-01', ativo: false, contaId: 'a1', categoriaId: 'c1' }
  );
  const created = generateRecurring(db, '2026-10-15', { newId });
  const datas = (id) => created.filter((t) => t.recorrenteId === id).map((t) => t.data);
  assert.deepEqual(datas('r1'), ['2026-07-31', '2026-08-31', '2026-09-30']);
  assert.equal(db.recurring[0].proximaData, '2026-10-31');
  assert.deepEqual(datas('r2'), ['2026-09-20', '2026-10-04']);
  assert.equal(db.recurring[1].ativo, false, 'terminou');
  assert.equal(created.find((t) => t.recorrenteId === 'r2').categoriaId, null);
  assert.equal(datas('r3').length, 0);
  assert.equal(generateRecurring(db, '2026-10-15', { newId }).length, 0, 'segunda execução no mesmo dia não gera nada');
  assert.equal(generateRecurring(db, '2026-10-31', { newId }).length, 1);
  assert.equal(nextOccurrence({ periodicidade: 'anual', intervalo: 1, diaAncora: 29, proximaData: '2028-02-29' }), '2029-02-28');
});

test('filtros e agrupamento por dia', () => {
  const db = baseDb();
  db.transactions.push(
    tx('2026-10-01', 'despesa', 100, { descricao: 'Pão' }),
    tx('2026-10-01', 'despesa', 200, { categoriaId: 'c2', descricao: 'Almoço' }),
    tx('2026-10-02', 'transferencia', 300, { contaDestinoId: 'a2' }),
    tx('2026-09-02', 'despesa', 400, { notas: 'pao de forma' })
  );
  assert.equal(filterTransactions(db, { texto: 'PAO' }).length, 2, 'ignora maiúsculas e acentos');
  assert.equal(filterTransactions(db, { texto: 'restauracao' }).length, 1, 'pesquisa pelo nome da categoria');
  assert.equal(filterTransactions(db, { start: '2026-10-01', end: '2026-10-31' }).length, 3);
  assert.equal(filterTransactions(db, { contaId: 'a2' }).length, 1, 'inclui transferências de entrada');
  const g = groupByDay(filterTransactions(db, { start: '2026-10-01', end: '2026-10-31' }));
  assert.deepEqual(g.map((x) => [x.data, x.total]), [['2026-10-02', 0], ['2026-10-01', -300]]);
});

test('validação de transações', () => {
  const db = baseDb();
  assert.deepEqual(validateTransaction(tx('2026-10-01', 'despesa', 100), db), []);
  assert.equal(validateTransaction(tx('2026-10-01', 'despesa', 0), db).length, 1);
  assert.equal(validateTransaction(tx('2026-10-01', 'transferencia', 5, { contaDestinoId: 'a1' }), db).length, 1);
});

test('metas', () => {
  const g = { valorAlvo: 120000, valorAtual: 60000, prazo: '2027-04-15' };
  const p = goalProgress(g, '2026-10-15');
  assert.equal(p.pct, 0.5);
  assert.equal(p.mesesRestantes, 6);
  assert.equal(p.porMes, 10000);
  assert.equal(goalProgress({ ...g, prazo: '2026-01-01' }, '2026-10-15').atrasada, true);
  assert.equal(goalProgress({ ...g, valorAtual: 130000 }, '2026-10-15').concluida, true);
});

test('CSV: exportar e importar de volta, com deduplicação', () => {
  const db = baseDb();
  db.transactions.push(
    tx('2026-10-01', 'despesa', 1250050, { descricao: 'Compras; "grandes"' }),
    tx('2026-10-02', 'transferencia', 300, { contaDestinoId: 'a2', notas: 'linha1\nlinha2' })
  );
  const csv = toCSV(db);
  assert.ok(csv.includes('12500,50'));
  const db2 = baseDb();
  const r = importCSV(db2, csv, { newId });
  assert.deepEqual([r.importadas, r.duplicadas, r.erros], [2, 0, []]);
  assert.equal(db2.transactions[0].descricao, 'Compras; "grandes"');
  assert.equal(db2.transactions[1].notas, 'linha1\nlinha2');
  assert.equal(db2.transactions[1].contaDestinoId, 'a2');
  assert.equal(importCSV(db2, csv, { newId }).duplicadas, 2);

  const r3 = importCSV(db2, 'data;valor;descricao\n2026-10-16;abc;x\n', { newId });
  assert.equal(r3.erros.length, 1);
  const r4 = importCSV(db2, 'data;valor;descricao;conta;categoria\n15/10/2026;-12,5;Café;Nova conta;Cafés\n', { newId });
  assert.equal(r4.importadas, 1);
  const t = db2.transactions.at(-1);
  assert.deepEqual([t.data, t.valor, t.tipo], ['2026-10-15', 1250, 'despesa']);
  assert.ok(db2.accounts.some((a) => a.nome === 'Nova conta'));
  assert.ok(db2.categories.some((c) => c.nome === 'Cafés'));
});

test('ciclo salarial com dia de pagamento 31 (meses curtos)', () => {
  const p = periodFor('2026-10-15', 31);
  assert.deepEqual([p.start, p.end], ['2026-09-30', '2026-10-30']);
  assert.deepEqual([periodFor('2026-02-28', 31).start, periodFor('2026-02-28', 31).end], ['2026-02-28', '2026-03-30']);
  assert.deepEqual([periodFor('2026-02-27', 31).start, periodFor('2026-02-27', 31).end], ['2026-01-31', '2026-02-27']);
  assert.equal(shiftPeriod(periodFor('2026-03-31', 31), -1, 31).start, '2026-02-28');
  assert.equal(shiftPeriod(periodFor('2026-03-31', 31), 1, 31).start, '2026-04-30');
});
