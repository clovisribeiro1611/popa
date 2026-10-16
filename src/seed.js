// Dados de exemplo (ativáveis nas Definições): família de 5 com um único salário, 3 filhos em idade escolar,
// um crédito bancário e um fiado. Tudo o que é criado fica marcado com `exemplo: true`, e o que é alterado
// (perfil, limites, orçamentos) é guardado antes, para poder ser removido sem tocar nos dados reais.

import { addDays, parts, toISO, periodFor, shiftPeriod } from './domain.js';
import { activateTemplate } from './templates.js';

const CVE = (v) => v * 100;
const BUDGETS = {
  casa: 12000, energia: 4500, gas: 1600, transporte: 2500, saude: 1000, escola: 2000, comunicacoes: 2000
};

export function addSeed(db, today, newId) {
  const now = new Date().toISOString();
  const [y] = parts(today);
  db.meta.seedBackup = structuredClone({
    household: db.household, limites: db.settings.limites, dividas: db.settings.dividas, emergencyFund: db.emergencyFund
  });

  // Perfil
  Object.assign(db.household, {
    salarioLiquido: CVE(76000), diaPagamento: 25, pessoas: 5, dependentes: 3,
    filhos: [
      { id: newId(), nome: 'Filho mais velho', anoNascimento: y - 14, escolar: true, exemplo: true },
      { id: newId(), nome: 'Filha do meio', anoNascimento: y - 11, escolar: true, exemplo: true },
      { id: newId(), nome: 'Filho mais novo', anoNascimento: y - 8, escolar: true, exemplo: true }
    ],
    rendimentosExtra: [{ id: newId(), descricao: 'Remessa da tia (exemplo)', tipo: 'remessa', valorMensal: CVE(5000), exemplo: true }],
    parametros: { ...db.household.parametros, cestaSemanalPorPessoa: CVE(1000), precoBotija: CVE(1750) }
  });
  db.settings.limites = { ...db.settings.limites, dinheiroDiaCritico: CVE(300) };
  db.settings.dividas = { metodo: 'avalanche', extraMensal: 0 };
  db.emergencyFund = { ...db.emergencyFund, percentagemSalario: 10, contaId: null };

  // Contas
  const acc = (nome, tipo, saldoInicial) => {
    const a = { id: newId(), nome, tipo, saldoInicial, arquivada: false, ordem: db.accounts.length, exemplo: true };
    db.accounts.push(a);
    return a;
  };
  const banco = acc('Banco (exemplo)', 'conta', CVE(45000));
  const carteira = db.accounts.find((a) => a.tipo === 'numerario' && !a.exemplo) || acc('Carteira (exemplo)', 'numerario', CVE(3000));

  // Orçamentos dos essenciais e limites
  const catT = (tipo) => db.categories.find((c) => c.essencialTipo === tipo && !c.arquivada);
  const catN = (pred) => db.categories.find(pred);
  const setBudget = (c, v) => {
    if (!c || c.orcamentoMensal) return;
    c.orcamentoAntesExemplo = c.orcamentoMensal ?? null;
    c.orcamentoMensal = CVE(v);
    c.orcamentoExemplo = true;
  };
  for (const [tipo, v] of Object.entries(BUDGETS)) setBudget(catT(tipo), v);
  setBudget(catN((c) => c.nivel === 'familia'), 2500);
  setBudget(catN((c) => c.nome === 'Lazer'), 2000);
  setBudget(catN((c) => c.nome === 'Restauração'), 1500);

  // Dívidas
  const debt = (o) => { const d = { id: newId(), ativa: true, dataSaldo: addDays(today, -95), criadoEm: today, exemplo: true, ...o }; db.debts.push(d); return d; };
  const credito = debt({ nome: 'Crédito pessoal (exemplo)', tipo: 'banco', credor: 'Banco', saldo: CVE(300000), prestacao: CVE(8000), taxaAnual: 13.5, diaPagamento: 28 });
  const fiado = debt({ nome: 'Fiado da mercearia (exemplo)', tipo: 'fiado', credor: 'Mercearia do bairro', saldo: CVE(9000), prestacao: CVE(1500), taxaAnual: null, diaPagamento: 28 });

  // Movimentos dos últimos 3 ciclos + o atual (deterministas)
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const between = (a, b) => Math.round((a + rnd() * (b - a)) / 50) * 5000; // múltiplos de 50 CVE
  const tx = (data, tipo, valor, cat, conta, descricao, extra = {}) => {
    if (!cat || data > today) return null;
    const t = { id: newId(), data, valor, tipo, contaId: conta.id, contaDestinoId: null, categoriaId: cat.id, descricao, notas: '',
      recorrenteId: null, criadoEm: now, exemplo: true, ...extra };
    db.transactions.push(t);
    return t;
  };
  const util = (tipo, data, valor, cat) => {
    if (data > today) return;
    const t = tx(data, 'despesa', valor, cat, carteira, tipo === 'gas' ? 'Botija de gás' : `Carregamento ${tipo === 'agua' ? 'água' : 'eletricidade'}`);
    db.utilityLogs.push({ id: newId(), tipo, data, valor, quantidade: null, transacaoId: t?.id ?? null, exemplo: true });
  };
  const salarioCat = catN((c) => c.origem === 'salario');
  const remessaCat = catN((c) => c.tipo === 'receita' && /remessa/i.test(c.nome)) || catN((c) => c.tipo === 'receita' && c.origem === 'extra');
  const food = catT('alimentacao'), energia = catT('energia'), gas = catT('gas'), dividas = catT('dividas');
  const cur = periodFor(today, 25);

  for (let back = 3; back >= 0; back--) {
    const p = shiftPeriod(cur, -back, 25);
    const d = (n) => addDays(p.start, n);
    tx(p.start, 'receita', CVE(76000), salarioCat, banco, 'Salário');
    tx(d(1), 'despesa', CVE(12000), catT('casa'), banco, 'Renda');
    tx(d(3), 'despesa', CVE(8000), dividas, banco, 'Prestação crédito pessoal', { dividaId: credito.id });
    tx(d(3), 'despesa', CVE(1500), dividas, carteira, 'Fiado da mercearia', { dividaId: fiado.id });
    tx(d(6), 'despesa', CVE(2000), catT('comunicacoes'), banco, 'Telemóvel e internet');
    tx(d(10), 'despesa', CVE(2000), catT('escola'), banco, 'Escola: cantina e transporte');
    tx(d(15), 'despesa', CVE(2500), catN((c) => c.nivel === 'familia'), carteira, 'Ajuda à mãe');
    for (const n of [1, 8, 15, 22, 28]) tx(d(n), 'despesa', between(3700, 4400), food, n % 2 ? carteira : banco, 'Compras da semana');
    for (const n of [2, 9, 16, 23]) tx(d(n), 'despesa', between(500, 800), catT('transporte'), carteira, 'Hiace / táxi');
    tx(d(12), 'despesa', between(300, 1200), catT('saude'), carteira, 'Farmácia');
    tx(d(19), 'despesa', between(600, 1500), catN((c) => c.nome === 'Lazer'), carteira, 'Saída de domingo');
    tx(d(24), 'despesa', between(400, 900), catN((c) => c.nome === 'Restauração'), carteira, 'Lanche fora');
    // Reservas feitas no dia a seguir ao salário (pontualidade)
    if (back > 0 && d(1) <= today) db.allocations.push({ id: newId(), data: d(1), destino: 'emergencia', destinoId: null, valor: CVE(7600), origem: 'salario', nota: '', exemplo: true });
    if (back === 1) tx(d(12), 'receita', CVE(5000), remessaCat, banco, 'Remessa da tia', { regraAplicada: 'exemplo' });
  }
  // Uma emergência no último ciclo (consulta) com plano de reposição
  db.allocations.push({ id: newId(), data: addDays(cur.start, -20), destino: 'emergencia', destinoId: null, valor: -CVE(8000), origem: 'uso', nota: 'Consulta e análises', exemplo: true });
  tx(addDays(cur.start, 8), 'receita', CVE(5000), remessaCat, banco, 'Remessa da tia'); // por distribuir

  // Pré-pagos e gás
  for (let dd = -95; dd <= 0; dd += 10) util('eletricidade', addDays(today, dd - 2), CVE(1500), energia);
  for (let dd = -90; dd <= 0; dd += 21) util('agua', addDays(today, dd - 6), CVE(1000), energia);
  for (let dd = -99; dd <= 0; dd += 33) util('gas', addDays(today, dd), CVE(1750), gas);

  // Fundos sazonais (modelos) e uma meta
  for (const id of ['natal', 'reentrada']) {
    const t = db.seasonalTemplates.find((x) => x.id === id);
    const f = t && !db.funds.some((x) => x.templateId === id && x.ativo !== false) ? activateTemplate(db, t, today, newId) : null;
    if (f) f.exemplo = true;
  }
  const natal = db.funds.find((f) => f.templateId === 'natal' && f.exemplo);
  if (natal) db.allocations.push({ id: newId(), data: addDays(cur.start, -29), destino: 'fundo', destinoId: natal.id, valor: CVE(3000), origem: 'salario', nota: '', exemplo: true });
  db.goals.push({ id: newId(), nome: 'Computador para a escola (exemplo)', valorAlvo: CVE(40000), valorAtual: CVE(6000),
    prazo: toISO(y + 1, 8, 31), cor: '#4C6EF5', horizonte: 'curto', exemplo: true });

  // Recorrências
  const next = (dia) => { const p = shiftPeriod(cur, 1, 25); return addDays(p.start, dia); };
  db.recurring.push(
    { id: newId(), descricao: 'Salário', valor: CVE(76000), tipo: 'receita', periodicidade: 'mensal', intervalo: 1, diaAncora: 25,
      proximaData: next(0), dataFim: null, ativo: true, contaId: banco.id, contaDestinoId: null, categoriaId: salarioCat?.id, exemplo: true },
    { id: newId(), descricao: 'Renda', valor: CVE(12000), tipo: 'despesa', periodicidade: 'mensal', intervalo: 1, diaAncora: parts(next(1))[2],
      proximaData: next(1), dataFim: null, ativo: true, contaId: banco.id, contaDestinoId: null, categoriaId: catT('casa')?.id, exemplo: true }
  );
  db.settings.seedAtivo = true;
}

export function removeSeed(db) {
  const exAcc = new Set(db.accounts.filter((a) => a.exemplo).map((a) => a.id));
  const exFunds = new Set(db.funds.filter((f) => f.exemplo).map((f) => f.id));
  const exGoals = new Set(db.goals.filter((g) => g.exemplo).map((g) => g.id));
  db.transactions = db.transactions.filter((t) => !t.exemplo && !exAcc.has(t.contaId) && !exAcc.has(t.contaDestinoId));
  db.recurring = db.recurring.filter((r) => !r.exemplo);
  db.goals = db.goals.filter((g) => !g.exemplo);
  db.accounts = db.accounts.filter((a) => !a.exemplo);
  db.debts = db.debts.filter((d) => !d.exemplo);
  db.funds = db.funds.filter((f) => !f.exemplo);
  db.utilityLogs = db.utilityLogs.filter((l) => !l.exemplo);
  db.allocations = db.allocations.filter((a) => !a.exemplo && !exFunds.has(a.destinoId) && !exGoals.has(a.destinoId));
  for (const c of db.categories) {
    if (!c.orcamentoExemplo) continue;
    c.orcamentoMensal = c.orcamentoAntesExemplo ?? null;
    delete c.orcamentoExemplo;
    delete c.orcamentoAntesExemplo;
  }
  const b = db.meta.seedBackup;
  if (b) {
    db.household = b.household;
    db.settings.limites = b.limites;
    db.settings.dividas = b.dividas;
    db.emergencyFund = b.emergencyFund;
    delete db.meta.seedBackup;
  }
  if (!db.accounts.some((a) => a.id === db.settings.contaPorDefeito)) db.settings.contaPorDefeito = db.accounts[0]?.id ?? null;
  db.settings.seedAtivo = false;
}
