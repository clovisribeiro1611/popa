// Cálculos do conselheiro financeiro (puros, determinísticos, sem DOM nem I/O).
// Valores em centavos; datas "YYYY-MM-DD". O ciclo vai do dia do salário à véspera do seguinte.

import { periodFor, periodDays, addDays, addMonths, parts, inPeriod, accountBalances } from './domain.js';

// ---------- Ciclo e utilitários ----------

export const cycleDayOf = (db) => db.household?.diaPagamento || db.settings?.primeiroDiaDoMes || 1;
export const cycleOf = (db, iso) => periodFor(iso, cycleDayOf(db));

/** Arredonda para cima ao escudo inteiro (os valores sugeridos não têm centavos). */
export const ceilCVE = (cents) => Math.ceil(Math.max(0, cents) / 100) * 100;
export const roundCVE = (cents) => Math.round(cents / 100) * 100;
const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + f(x), 0);

/** Diferença em dias entre duas datas ISO (b − a). */
export const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

/** Nº de meses (ciclos) desde o ciclo de `today` até à data `due` (mínimo 1). */
export function cyclesUntil(db, today, due) {
  const fd = cycleDayOf(db);
  const a = periodFor(today, fd), b = periodFor(due, fd);
  const [ay, am] = parts(a.key), [by, bm] = parts(b.key);
  return Math.max(1, (by - ay) * 12 + (bm - am) + 1);
}

// ---------- Envelopes (fundos virtuais) ----------
// allocations: { id, data, destino: 'emergencia'|'fundo'|'divida'|'meta', destinoId, valor (+reserva / −uso), origem, nota }

export function envelopeBalance(db, destino, destinoId = null, until = null) {
  return sum(db.allocations.filter((a) => a.destino === destino && (destinoId == null || a.destinoId === destinoId) && (!until || a.data <= until)), (a) => a.valor);
}

export function reservedInCycle(db, cycle, destino, destinoId = null) {
  return sum(db.allocations.filter((a) => a.destino === destino && a.valor > 0 && (destinoId == null || a.destinoId === destinoId) && inPeriod(a, cycle)), (a) => a.valor);
}

// ---------- Dívidas (base; detalhe em dividas) ----------

export const activeDebts = (db) => db.debts.filter((d) => d.ativa !== false && debtBalance(db, d) > 0);

/** Saldo atual: saldo registado na data `dataSaldo` menos os pagamentos feitos depois (movimentos com dividaId). */
export function debtBalance(db, d, until = null) {
  const paid = sum(db.transactions.filter((t) => t.dividaId === d.id && t.tipo === 'despesa' && t.data >= (d.dataSaldo || '0000') && (!until || t.data <= until)), (t) => t.valor);
  return Math.max(0, (d.saldo || 0) - paid);
}

export const totalInstallments = (db) => sum(activeDebts(db), (d) => d.prestacao || 0);

// ---------- Essenciais ----------

const isEssential = (c) => c.tipo === 'despesa' && c.nivel === 'essencial' && !c.arquivada;

/** Valor mensal sugerido para a alimentação a partir da cesta semanal por pessoa (se definida). */
export function foodReference(db) {
  const cesta = db.household.parametros?.cestaSemanalPorPessoa;
  return cesta ? roundCVE((cesta * Math.max(1, db.household.pessoas) * 52) / 12) : null;
}

/**
 * Linhas do nível 1: categorias essenciais (com o orçamento mensal ou a referência), prestações mínimas
 * das dívidas e a ajuda a familiares planeada.
 */
export function essentialItems(db) {
  const items = [];
  for (const c of db.categories.filter(isEssential)) {
    if (c.essencialTipo === 'dividas') continue;
    let need = c.orcamentoMensal || 0, sugerido = false;
    if (!need && c.essencialTipo === 'alimentacao' && foodReference(db)) { need = foodReference(db); sugerido = true; }
    items.push({ key: `cat:${c.id}`, categoriaIds: [c.id], nome: c.nome, icone: c.icone, cor: c.cor, tipo: c.essencialTipo, need, sugerido });
  }
  const prest = totalInstallments(db);
  const debtCats = db.categories.filter((c) => c.essencialTipo === 'dividas').map((c) => c.id);
  if (prest || debtCats.length) items.push({ key: 'prestacoes', categoriaIds: debtCats, nome: 'Prestações das dívidas (mínimo)', icone: '💳', cor: '#495057', tipo: 'dividas', need: prest });
  for (const c of db.categories.filter((x) => x.nivel === 'familia' && !x.arquivada && x.tipo === 'despesa')) {
    items.push({ key: `cat:${c.id}`, categoriaIds: [c.id], nome: `${c.nome} (planeada)`, icone: c.icone, cor: c.cor, tipo: 'familia', need: c.orcamentoMensal || 0 });
  }
  return items;
}

/** Base mensal do fundo de emergência: despesas essenciais + prestações (sem ajuda a familiares). */
export function essentialMonthly(db) {
  return sum(essentialItems(db).filter((i) => i.tipo !== 'familia'), (i) => i.need);
}

// ---------- Fundo de emergência ----------

export function emergencyStatus(db, today) {
  const ef = db.emergencyFund;
  const base = ef.baseMensalManual || essentialMonthly(db);
  const saldo = ef.contaId ? (accountBalances(db, today).get(ef.contaId) ?? 0) : envelopeBalance(db, 'emergencia');
  const contribuicao = roundCVE((db.household.salarioLiquido * (ef.percentagemSalario || 0)) / 100);
  const etapas = [...ef.etapasMeses].sort((a, b) => a - b).map((meses) => {
    const alvo = base * meses;
    const falta = Math.max(0, alvo - saldo);
    const mesesAte = falta === 0 ? 0 : contribuicao > 0 ? Math.ceil(falta / contribuicao) : null;
    return { meses, alvo, falta, atingida: base > 0 && falta === 0, mesesAte, data: mesesAte == null ? null : addMonths(today, mesesAte) };
  });
  const etapaAtual = etapas.find((e) => !e.atingida) || null;

  let reposicao = null;
  if (ef.planoReposicao) {
    const p = ef.planoReposicao;
    const reposto = Math.min(p.total, sum(db.allocations.filter((a) => a.destino === 'emergencia' && a.valor > 0 && a.data >= p.inicio), (a) => a.valor));
    reposicao = { ...p, reposto, falta: p.total - reposto, ativa: reposto < p.total };
  }
  const todasAtingidas = !etapaAtual;
  const needThisCycle = todasAtingidas && !reposicao?.ativa ? 0 : Math.max(contribuicao, reposicao?.ativa ? reposicao.valorMensal : 0);
  return {
    base, saldo, contribuicao, etapas, etapaAtual, reposicao, needThisCycle,
    mesesCobertos: base > 0 ? saldo / base : 0,
    progressoEtapa: etapaAtual && etapaAtual.alvo > 0 ? Math.min(1, saldo / etapaAtual.alvo) : 1
  };
}

/** Plano de reposição depois de usar o fundo: repor em `meses` (por defeito 6) ou pela contribuição normal, o que for maior. */
export function replenishPlan(db, valorUsado, today, meses = 6) {
  const st = emergencyStatus(db, today);
  const valorMensal = Math.max(st.contribuicao, ceilCVE(valorUsado / meses));
  return { total: valorUsado, valorMensal, inicio: today };
}

// ---------- Fundos de provisão e metas ----------

export function fundStatus(db, f, today) {
  const saldo = envelopeBalance(db, 'fundo', f.id);
  const falta = Math.max(0, (f.valorAlvo || 0) - saldo);
  const ciclos = f.proximaData ? cyclesUntil(db, today, f.proximaData) : null;
  const sugestaoMensal = f.contribuicaoMensal || (falta && ciclos ? ceilCVE(falta / ciclos) : 0);
  const vencido = !!f.proximaData && f.proximaData < today;
  return {
    saldo, falta, ciclos, sugestaoMensal, vencido,
    pct: f.valorAlvo ? Math.min(1, saldo / f.valorAlvo) : 0,
    alerta: !!f.proximaData && falta > 0 && ciclos <= (f.antecedenciaMeses ?? 3)
  };
}

export function goalMonthly(db, g, today) {
  const falta = Math.max(0, (g.valorAlvo || 0) - (g.valorAtual || 0));
  if (!falta) return 0;
  if (g.contribuicaoMensal) return Math.min(falta, g.contribuicaoMensal);
  if (g.prazo && g.prazo > today) return ceilCVE(falta / cyclesUntil(db, today, g.prazo));
  return 0;
}

// ---------- Cascata de prioridades ----------

export const NIVEIS = [
  { n: 1, key: 'essenciais', titulo: 'Essenciais' },
  { n: 2, key: 'emergencia', titulo: 'Fundo de emergência' },
  { n: 3, key: 'fundos', titulo: 'Fundos de provisão' },
  { n: 4, key: 'dividas', titulo: 'Dívidas acima do mínimo' },
  { n: 5, key: 'metas', titulo: 'Poupança para metas' },
  { n: 6, key: 'livre', titulo: 'Livre para gastar' }
];

/**
 * Distribui o rendimento do ciclo pelos 6 níveis, por ordem.
 *  mode 'real':  usa as receitas registadas no ciclo (se o salário ainda não foi registado, usa o valor do perfil).
 *  mode 'plano': usa o salário do perfil + rendimentos extra esperados (para o simulador e para planear).
 * Devolve, por nível: necessário, usado (necessário ou o já gasto/reservado, se maior), coberto pelo rendimento,
 * défice, e o que falta pagar/reservar.
 */
export function cascade(db, today, { cycle = cycleOf(db, today), mode = 'real' } = {}) {
  const h = db.household;
  const catById = new Map(db.categories.map((c) => [c.id, c]));
  const txs = db.transactions.filter((t) => inPeriod(t, cycle));

  let salario, extras, salarioRecebido = false;
  if (mode === 'plano') {
    salario = h.salarioLiquido;
    extras = sum(h.rendimentosExtra, (r) => r.valorMensal);
  } else {
    const rec = txs.filter((t) => t.tipo === 'receita');
    const sal = sum(rec.filter((t) => catById.get(t.categoriaId)?.origem === 'salario'), (t) => t.valor);
    salarioRecebido = sal > 0;
    salario = salarioRecebido ? sal : h.salarioLiquido;
    extras = sum(rec.filter((t) => catById.get(t.categoriaId)?.origem !== 'salario'), (t) => t.valor);
  }
  const total = salario + extras;

  const spentByCat = new Map();
  if (mode === 'real') for (const t of txs) if (t.tipo === 'despesa') spentByCat.set(t.categoriaId, (spentByCat.get(t.categoriaId) || 0) + t.valor);
  const spentOf = (ids) => sum(ids, (id) => spentByCat.get(id) || 0);
  const reserved = (destino, id) => (mode === 'real' ? reservedInCycle(db, cycle, destino, id) : 0);

  // Nível 1
  const essItems = essentialItems(db).map((i) => {
    const gasto = spentOf(i.categoriaIds);
    return { ...i, gasto, use: Math.max(i.need, gasto), porPagar: Math.max(0, i.need - gasto) };
  });
  // Nível 2
  const em = emergencyStatus(db, today);
  const emItem = { key: 'emergencia', nome: 'Fundo de emergência', need: em.needThisCycle, reservado: reserved('emergencia') };
  // Nível 3
  const fundItems = db.funds.filter((f) => f.ativo !== false && f.tipo !== 'longoPrazo').map((f) => {
    const st = fundStatus(db, f, today);
    return { key: `fundo:${f.id}`, id: f.id, nome: f.nome, icone: f.icone, need: st.sugestaoMensal, reservado: reserved('fundo', f.id), proximaData: f.proximaData, ciclos: st.ciclos };
  });
  // Nível 4
  const hasDebts = activeDebts(db).length > 0;
  const debtItem = { key: 'dividas', nome: 'Pagamento extra às dívidas', need: hasDebts ? db.settings.dividas?.extraMensal || 0 : 0, reservado: reserved('divida') };
  // Nível 5: metas (curto prazo) + fundos de longo prazo
  const goalItems = [
    ...db.goals.map((g) => ({ key: `meta:${g.id}`, id: g.id, destino: 'meta', nome: g.nome, need: goalMonthly(db, g, today), reservado: reserved('meta', g.id) })),
    ...db.funds.filter((f) => f.ativo !== false && f.tipo === 'longoPrazo').map((f) => ({
      key: `fundo:${f.id}`, id: f.id, destino: 'fundo', nome: f.nome, icone: f.icone, need: fundStatus(db, f, today).sugestaoMensal, reservado: reserved('fundo', f.id)
    }))
  ].filter((i) => i.need > 0 || i.reservado > 0);

  const envelope = (items) => items.map((i) => ({ ...i, use: Math.max(i.need, i.reservado), porReservar: Math.max(0, i.need - i.reservado) }));
  const groups = [essItems, envelope([emItem]).filter((i) => i.use > 0), envelope(fundItems), envelope([debtItem]).filter((i) => i.use > 0), envelope(goalItems)];

  let pool = total;
  const levels = NIVEIS.slice(0, 5).map((nv, idx) => {
    const items = groups[idx];
    const need = sum(items, (i) => i.need);
    const use = sum(items, (i) => i.use);
    const coberto = Math.min(use, Math.max(0, pool));
    pool -= coberto;
    return {
      ...nv, items, need, use, coberto, deficit: use - coberto,
      gasto: idx === 0 ? sum(items, (i) => i.gasto) : undefined,
      reservado: idx > 0 ? sum(items, (i) => i.reservado) : undefined,
      porPagar: idx === 0 ? sum(items, (i) => i.porPagar) : undefined,
      porReservar: idx > 0 ? sum(items, (i) => i.porReservar) : undefined
    };
  });

  const essentialCatIds = new Set(essItems.flatMap((i) => i.categoriaIds));
  const gastoLivre = mode === 'real'
    ? sum(txs.filter((t) => t.tipo === 'despesa' && !essentialCatIds.has(t.categoriaId)), (t) => t.valor)
    : 0;
  const disponivel = Math.max(0, pool);
  const deficit = sum(levels, (l) => l.deficit);
  const livre = { ...NIVEIS[5], disponivel, gasto: gastoLivre, paraGastar: disponivel - gastoLivre };
  return {
    cycle, mode, income: { salario, extras, total, salarioRecebido },
    levels, livre, deficit,
    primeiroDefice: levels.find((l) => l.deficit > 0) || null,
    tudoCoberto: deficit === 0
  };
}

/**
 * Cortes sugeridos para cobrir um défice, por ordem de impacto (maior primeiro). Os essenciais só
 * aparecem no fim e apenas quando os restantes cortes não chegam.
 */
export function suggestCuts(db, c, today) {
  if (!c.deficit) return [];
  const lv = Object.fromEntries(c.levels.map((l) => [l.key, l]));
  const cuts = [];
  for (const i of lv.metas.items) if (i.porReservar > 0) cuts.push({ nivel: 5, texto: `Pausar a reserva para “${i.nome}” este mês`, valor: i.porReservar });
  for (const i of lv.dividas.items) if (i.porReservar > 0) cuts.push({ nivel: 4, texto: 'Pagar só o mínimo das dívidas este mês', valor: i.porReservar });
  for (const i of lv.fundos.items) {
    if (i.porReservar > 0 && (i.ciclos ?? 0) > 3) cuts.push({ nivel: 3, texto: `Reservar metade para “${i.nome}” (ainda faltam ${i.ciclos} meses)`, valor: ceilCVE(i.porReservar / 2) });
  }
  for (const i of lv.emergencia.items) if (i.porReservar > 0) cuts.push({ nivel: 2, texto: 'Reduzir a contribuição para o fundo de emergência a metade (só este mês)', valor: ceilCVE(i.porReservar / 2) });
  cuts.sort((a, b) => b.valor - a.valor);

  const ess = [];
  for (const i of lv.essenciais.items) {
    if (i.tipo === 'familia' && i.need > 0) ess.push({ nivel: 1, texto: `Rever a ajuda a familiares (ex.: −25%)`, valor: ceilCVE(i.need * 0.25) });
    if (i.tipo === 'alimentacao') {
      const ref = foodReference(db);
      if (ref && i.need > ref) ess.push({ nivel: 1, texto: `Alimentação acima da referência da cesta (${Math.round((i.need / ref - 1) * 100)}%)`, valor: i.need - ref });
    }
    if (i.tipo === 'comunicacoes' && i.need > 0) ess.push({ nivel: 1, texto: 'Trocar para um tarifário de telefone/internet mais barato (ex.: −20%)', valor: ceilCVE(i.need * 0.2) });
  }
  ess.sort((a, b) => b.valor - a.valor);

  let acc = 0;
  return [...cuts, ...ess].map((x) => {
    acc += x.valor;
    return { ...x, acumulado: acc, cobreDefice: acc >= c.deficit };
  });
}

/**
 * "Reservar este mês": cria as alocações em falta nos níveis 2–5, até onde o rendimento cobre.
 * Altera `db` e devolve as alocações criadas. Nas metas, atualiza também o valor poupado.
 */
export function reserveCycle(db, today, { newId, origem = 'salario', amounts = null } = {}) {
  const c = cascade(db, today);
  const created = [];
  for (const l of c.levels.slice(1)) {
    let disponivel = l.coberto - (l.reservado || 0);
    for (const i of l.items) {
      const valor = amounts ? amounts[i.key] ?? 0 : Math.min(i.porReservar, Math.max(0, disponivel));
      if (valor <= 0) continue;
      disponivel -= valor;
      const destino = l.key === 'emergencia' ? 'emergencia' : l.key === 'fundos' ? 'fundo' : l.key === 'dividas' ? 'divida' : i.destino;
      const a = { id: newId(), data: today, destino, destinoId: i.id ?? null, valor, origem, nota: '' };
      db.allocations.push(a);
      if (destino === 'meta') {
        const g = db.goals.find((x) => x.id === i.id);
        if (g) g.valorAtual = (g.valorAtual || 0) + valor;
      }
      created.push(a);
    }
  }
  return created;
}

/** Usar o fundo de emergência num imprevisto: regista o uso e cria o plano de reposição. */
export function useEmergency(db, valor, today, { newId, nota = '', meses = 6 } = {}) {
  db.allocations.push({ id: newId(), data: today, destino: 'emergencia', destinoId: null, valor: -valor, origem: 'uso', nota });
  const plan = replenishPlan(db, valor, today, meses);
  const prev = db.emergencyFund.planoReposicao;
  // Se já havia um plano por concluir, somam-se os valores em falta.
  if (prev) {
    const st = emergencyStatus(db, today).reposicao;
    if (st?.ativa) plan.total += st.falta;
    plan.valorMensal = Math.max(plan.valorMensal, ceilCVE(plan.total / meses));
  }
  db.emergencyFund.planoReposicao = plan;
  return plan;
}

// ---------- Custos variáveis do dia a dia ----------

export const UTILITIES = {
  eletricidade: { nome: 'Eletricidade (pré-pago)', icone: '⚡', unidade: 'kWh', acao: 'carregamento' },
  agua: { nome: 'Água (pré-pago)', icone: '💧', unidade: 'm³', acao: 'carregamento' },
  gas: { nome: 'Botija de gás', icone: '🔥', unidade: 'botija', acao: 'troca' }
};

/**
 * Estimativa de duração de pré-pagos/gás a partir dos registos (utilityLogs: { tipo, data, valor }).
 * Custo por dia = o que se gastou entre o primeiro e o último dos registos recentes ÷ dias decorridos.
 * O último carregamento dura ≈ o seu valor ÷ custo por dia.
 */
export function utilityEstimate(db, tipo, today) {
  const logs = db.utilityLogs.filter((l) => l.tipo === tipo).sort((a, b) => a.data.localeCompare(b.data));
  const ultimo = logs.at(-1) || null;
  if (logs.length < 2) return { tipo, registos: logs.length, ultimo, estimativa: null };
  const recent = logs.slice(-5);
  const span = Math.max(1, daysBetween(recent[0].data, ultimo.data));
  const gasto = sum(recent.slice(0, -1), (l) => l.valor);
  const custoDia = gasto / span;
  const duracao = custoDia > 0 ? Math.max(1, Math.round(ultimo.valor / custoDia)) : null;
  const diasDesde = daysBetween(ultimo.data, today);
  const diasRestantes = duracao == null ? null : Math.max(0, duracao - diasDesde);
  const aviso = diasRestantes != null && diasRestantes <= (db.settings.limites?.diasAvisoPrePago ?? 2);
  return {
    tipo, registos: logs.length, ultimo,
    estimativa: {
      custoDia, duracao, diasDesde, diasRestantes, aviso,
      acabaEm: duracao == null ? null : addDays(ultimo.data, duracao),
      reservaSemana: ceilCVE(custoDia * 7),
      custoMes: roundCVE((custoDia * 365) / 12)
    }
  };
}

/** Segunda-feira da semana de `iso`. */
export function weekStart(iso) {
  const [y, m, d] = parts(iso);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  return addDays(iso, -((dow + 6) % 7));
}

/** Orçamento semanal da alimentação: cesta por pessoa × pessoas (ou o orçamento mensal × 12/52). */
export function weeklyFoodBudget(db) {
  const cesta = db.household.parametros?.cestaSemanalPorPessoa;
  if (cesta) return cesta * Math.max(1, db.household.pessoas);
  const mensal = sum(db.categories.filter((c) => c.essencialTipo === 'alimentacao' && !c.arquivada), (c) => c.orcamentoMensal || 0);
  return mensal ? roundCVE((mensal * 12) / 52) : 0;
}

/** Acompanhamento da cesta semanal: gasto até hoje vs. ritmo esperado; a meio da semana (qua/qui) dá o ponto de situação. */
export function weeklyFood(db, today) {
  const orcamento = weeklyFoodBudget(db);
  const inicio = weekStart(today);
  const ids = new Set(db.categories.filter((c) => c.essencialTipo === 'alimentacao').map((c) => c.id));
  const gasto = sum(db.transactions.filter((t) => t.tipo === 'despesa' && ids.has(t.categoriaId) && t.data >= inicio && t.data <= today), (t) => t.valor);
  const dia = daysBetween(inicio, today) + 1; // 1 = segunda … 7 = domingo
  const esperado = (orcamento * dia) / 7;
  const estado = !orcamento ? null : gasto > orcamento ? 'excedido' : gasto > esperado * 1.15 ? 'acima' : 'ok';
  const restante = orcamento - gasto;
  return {
    orcamento, gasto, inicio, fim: addDays(inicio, 6), dia, esperado, estado, restante,
    porDiaRestante: dia < 7 ? Math.max(0, restante) / (8 - dia) : Math.max(0, restante),
    meioDaSemana: dia === 3 || dia === 4
  };
}

/** Telefone/internet: valor fixo mensal (orçamento da categoria) vs. gasto no ciclo, com tolerância. */
export function servicesVariation(db, today) {
  const cycle = cycleOf(db, today);
  const tol = db.settings.limites?.toleranciaServicosPct ?? 15;
  return db.categories.filter((c) => c.essencialTipo === 'comunicacoes' && !c.arquivada).map((c) => {
    const gasto = sum(db.transactions.filter((t) => t.tipo === 'despesa' && t.categoriaId === c.id && inPeriod(t, cycle)), (t) => t.valor);
    const fixo = c.orcamentoMensal || 0;
    const variacao = fixo ? (gasto - fixo) / fixo : null;
    return { categoria: c, fixo, gasto, variacao, alerta: variacao != null && variacao * 100 > tol };
  });
}

// ---------- Fim do mês ----------

/** Essenciais cujo gasto varia com o consumo (os outros são valores fixos: renda, escola, prestações…). */
export const VARIAVEIS = ['alimentacao', 'energia', 'gas', 'transporte', 'saude'];

/**
 * Dias até ao salário, dinheiro por dia, "semana crítica" e projeção do ritmo de gasto.
 * Dinheiro por dia = livre para gastar ÷ dias que faltam no ciclo (incluindo hoje).
 * Ritmo: gasto variável até hoje projetado para o ciclo inteiro vs. o que estava previsto para ele
 * (essenciais variáveis + livre disponível).
 */
export function endOfMonth(db, today, c = cascade(db, today)) {
  const cycle = c.cycle;
  const L = db.settings.limites || {};
  const diasRestantes = daysBetween(today, cycle.end) + 1;
  const diasAteSalario = diasRestantes;
  const livre = c.livre.paraGastar;
  const dinheiroPorDia = Math.max(0, Math.floor(Math.max(0, livre) / diasRestantes / 100) * 100);
  const semanaCritica = L.dinheiroDiaCritico != null && dinheiroPorDia < L.dinheiroDiaCritico;

  const diaDoCiclo = daysBetween(cycle.start, today) + 1;
  const dias = periodDays(cycle);
  const ess = c.levels[0].items.filter((i) => VARIAVEIS.includes(i.tipo));
  const varCats = new Set(ess.flatMap((i) => i.categoriaIds));
  const essentialCats = new Set(c.levels[0].items.flatMap((i) => i.categoriaIds));
  const txs = db.transactions.filter((t) => t.tipo === 'despesa' && inPeriod(t, cycle) && t.data <= today);
  const gastoVariavel = sum(txs.filter((t) => varCats.has(t.categoriaId) || !essentialCats.has(t.categoriaId)), (t) => t.valor);
  const previstoVariavel = sum(ess, (i) => i.need) + c.livre.disponivel;
  const projecao = Math.round((gastoVariavel / diaDoCiclo) * dias);
  const faltaProjetada = Math.max(0, projecao - previstoVariavel);
  const alertaRitmo = diaDoCiclo >= (L.diaAlertaRitmo ?? 10) && faltaProjetada > 0;
  return {
    diasAteSalario, diasRestantes, dinheiroPorDia, semanaCritica, limite: L.dinheiroDiaCritico ?? null,
    diaDoCiclo, dias, gastoVariavel, previstoVariavel, projecao, faltaProjetada, alertaRitmo,
    ritmoDiario: gastoVariavel / diaDoCiclo,
    ritmoSustentavel: Math.max(0, previstoVariavel - gastoVariavel) / diasRestantes
  };
}

/** No modo "semana crítica": o que ainda é essencial pagar e o que se pode adiar até ao salário. */
export function postponeSuggestions(db, c, today) {
  const cycle = c.cycle;
  const lv = Object.fromEntries(c.levels.map((l) => [l.key, l]));
  const adiar = [];
  for (const i of lv.metas.items) if (i.porReservar > 0) adiar.push({ texto: `Adiar a reserva para “${i.nome}”`, valor: i.porReservar });
  for (const i of lv.dividas.items) if (i.porReservar > 0) adiar.push({ texto: 'Pagar só o mínimo das dívidas', valor: i.porReservar });
  for (const i of lv.fundos.items) if (i.porReservar > 0 && (i.ciclos ?? 0) > 3) adiar.push({ texto: `Adiar parte da reserva de “${i.nome}”`, valor: ceilCVE(i.porReservar / 2) });
  const essentialCats = new Set(lv.essenciais.items.flatMap((i) => i.categoriaIds));
  const livres = new Map();
  for (const t of db.transactions) {
    if (t.tipo !== 'despesa' || !inPeriod(t, cycle) || essentialCats.has(t.categoriaId)) continue;
    livres.set(t.categoriaId, (livres.get(t.categoriaId) || 0) + t.valor);
  }
  const evitar = [...livres.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([id, v]) => ({ categoria: db.categories.find((x) => x.id === id), gasto: v })).filter((x) => x.categoria);
  const essenciais = lv.essenciais.items.filter((i) => i.porPagar > 0).sort((a, b) => b.porPagar - a.porPagar);
  return { essenciais, adiar: adiar.sort((a, b) => b.valor - a.valor), evitar, ate: addDays(cycle.end, 1), today };
}

// ---------- Dívidas: rácio e estratégias ----------

export const DEBT_TYPES = {
  banco: 'Crédito bancário', consumo: 'Crédito de consumo / prestações', fiado: 'Fiado (loja, mercearia)', familiar: 'Empréstimo de familiar/amigo'
};

/** Rácio de endividamento = prestações ÷ salário líquido, com semáforo pelos limites editáveis. */
export function debtRatio(db, prestacaoExtra = 0) {
  const L = db.settings.limites || {};
  const salario = db.household.salarioLiquido || 0;
  const prestacoes = totalInstallments(db) + prestacaoExtra;
  const pct = salario ? (prestacoes / salario) * 100 : null;
  const verde = L.racioVerde ?? 20, amarelo = L.racioAmarelo ?? 30;
  const estado = pct == null ? null : pct <= verde ? 'verde' : pct <= amarelo ? 'amarelo' : 'vermelho';
  return { salario, prestacoes, pct, estado, verde, amarelo, aviso: pct != null && pct > amarelo };
}

/**
 * Simula o pagamento mês a mês.
 *  metodo 'avalanche': o extra vai para a taxa mais alta; 'bolaDeNeve': para o saldo mais pequeno.
 *  rollover: quando uma dívida acaba, a sua prestação passa a reforçar a seguinte.
 * Juros mensais = saldo × taxa anual / 12 (dívidas sem taxa contam como 0%).
 */
export function simulateDebts(debts, { metodo = 'avalanche', extra = 0, rollover = true, maxMeses = 600 } = {}) {
  const st = debts.filter((d) => d.saldo > 0).map((d) => ({ id: d.id, nome: d.nome, saldo: d.saldo, prestacao: d.prestacao || 0, taxa: d.taxaAnual || 0, mes: null }));
  const order = () => [...st].filter((d) => d.saldo > 0.5).sort(metodo === 'bolaDeNeve'
    ? (a, b) => a.saldo - b.saldo || b.taxa - a.taxa
    : (a, b) => b.taxa - a.taxa || a.saldo - b.saldo);
  const orcamentoBase = sum(st, (d) => d.prestacao) + extra;
  let mes = 0, juros = 0, pago = 0;
  while (st.some((d) => d.saldo > 0.5)) {
    mes++;
    if (mes > maxMeses) return { impossivel: true, meses: null, totalJuros: null, totalPago: null, ordem: [] };
    for (const d of st) if (d.saldo > 0.5) { const j = (d.saldo * d.taxa) / 100 / 12; d.saldo += j; juros += j; }
    let budget = rollover ? orcamentoBase : extra;
    for (const d of st) {
      if (d.saldo <= 0.5) continue;
      const p = Math.min(d.prestacao, d.saldo);
      d.saldo -= p; pago += p;
      if (rollover) budget -= p;
    }
    for (const d of order()) {
      if (budget <= 0) break;
      const p = Math.min(budget, d.saldo);
      d.saldo -= p; pago += p; budget -= p;
    }
    for (const d of st) if (d.saldo <= 0.5 && d.mes == null) { d.saldo = 0; d.mes = mes; }
  }
  return {
    impossivel: false, meses: mes, totalJuros: Math.round(juros), totalPago: Math.round(pago),
    ordem: [...st].sort((a, b) => a.mes - b.mes).map((d) => ({ id: d.id, nome: d.nome, mes: d.mes }))
  };
}

/** Dívidas ativas no formato do simulador (saldo atual). */
export const debtsForSimulation = (db) => activeDebts(db).map((d) => ({ ...d, saldo: debtBalance(db, d) }));

/** Compara pagar só o mínimo com a estratégia escolhida + extra mensal (e com a estratégia alternativa). */
export function debtPlan(db, { metodo = db.settings.dividas?.metodo || 'avalanche', extra = db.settings.dividas?.extraMensal || 0 } = {}) {
  const debts = debtsForSimulation(db);
  const minimo = simulateDebts(debts, { metodo, extra: 0, rollover: false });
  const plano = simulateDebts(debts, { metodo, extra, rollover: true });
  const alternativa = simulateDebts(debts, { metodo: metodo === 'avalanche' ? 'bolaDeNeve' : 'avalanche', extra, rollover: true });
  const poupa = !minimo.impossivel && !plano.impossivel
    ? { juros: minimo.totalJuros - plano.totalJuros, meses: minimo.meses - plano.meses } : null;
  return { metodo, extra, minimo, plano, alternativa, poupa, semTaxa: debts.filter((d) => !d.taxaAnual).map((d) => d.nome) };
}

/** Impacto de um crédito novo (ou compra a prestações) no rácio e no "livre para gastar" planeado. */
export function newCreditImpact(db, today, { prestacao, saldo = 0, taxaAnual = null, nome = 'Crédito novo' }) {
  const antes = debtRatio(db);
  const depois = debtRatio(db, prestacao);
  const plano = (x) => cascade(x, today, { mode: 'plano' });
  const sim = structuredClone(db);
  sim.debts.push({ id: '__novo', nome, tipo: 'consumo', saldo: saldo || prestacao, prestacao, taxaAnual, ativa: true, dataSaldo: today });
  const livreAntes = plano(db).livre.disponivel, livreDepois = plano(sim).livre.disponivel;
  const deficeDepois = plano(sim).deficit;
  return { antes, depois, livreAntes, livreDepois, deficeDepois, recomendacao: depois.estado === 'vermelho' || deficeDepois > 0 ? 'nao' : depois.estado === 'amarelo' ? 'cuidado' : 'ok' };
}

// ---------- Rendimentos extra e família alargada ----------

/** Receitas que não são salário (remessas, biscates, vendas…). */
export const isExtraIncome = (db, t) => t.tipo === 'receita' && db.categories.find((c) => c.id === t.categoriaId)?.origem !== 'salario';

/** Divide `total` (centavos) por pesos, em escudos inteiros; o resto vai para o último. */
function splitByWeight(total, items, weight) {
  const w = items.map(weight), tw = sum(w);
  if (!items.length || !tw) return [];
  let left = total;
  return items.map((it, i) => {
    const v = i === items.length - 1 ? left : Math.floor((total * w[i]) / tw / 100) * 100;
    left -= v;
    return { it, v };
  }).filter((x) => x.v > 0);
}

/**
 * Aplica a regra de distribuição a um rendimento extra (ex.: 50% fundos e dívidas, 30% emergência e metas, 20% livre).
 *  - Fundos e dívidas: metade para cada grupo quando existem os dois; nos fundos, proporcional ao que falta.
 *  - Emergência e metas: primeiro a emergência até à etapa atual, o resto para as metas (proporcional ao que falta).
 *  - O que não tiver destino vai para o fundo de emergência. A parte "livre" não é reservada.
 * Altera `db` (cria alocações e marca o movimento) e devolve o resumo.
 */
export function applyExtraIncomeRule(db, txId, today, { newId, rule = db.extraIncomeRules.find((r) => r.ativa !== false) } = {}) {
  const t = db.transactions.find((x) => x.id === txId);
  if (!t || !rule || t.regraAplicada) return null;
  const parte = (pct) => Math.floor((t.valor * pct) / 100 / 100) * 100;
  const fd = parte(rule.fundosDividas), em = parte(rule.emergenciaMetas);
  const created = [];
  const alloc = (destino, destinoId, valor, nota) => {
    if (valor <= 0) return;
    const a = { id: newId(), data: today, destino, destinoId, valor, origem: 'extra', nota, transacaoId: t.id };
    db.allocations.push(a);
    if (destino === 'meta') { const g = db.goals.find((x) => x.id === destinoId); if (g) g.valorAtual = (g.valorAtual || 0) + valor; }
    created.push(a);
  };

  // 1) Fundos e dívidas
  const funds = db.funds.filter((f) => f.ativo !== false).map((f) => ({ f, falta: fundStatus(db, f, today).falta })).filter((x) => x.falta > 0);
  const hasDebts = activeDebts(db).length > 0;
  let paraFundos = funds.length ? (hasDebts ? Math.floor(fd / 2 / 100) * 100 : fd) : 0;
  const paraDividas = hasDebts ? fd - paraFundos : 0;
  let sobra = fd - paraFundos - paraDividas;
  for (const { it, v } of splitByWeight(paraFundos, funds, (x) => x.falta)) {
    const real = Math.min(v, it.falta);
    alloc('fundo', it.f.id, real, 'Regra de rendimento extra');
    sobra += v - real;
  }
  alloc('divida', null, paraDividas, 'Pagamento extra às dívidas');

  // 2) Emergência e metas
  const est = emergencyStatus(db, today);
  let restante = em + sobra;
  const paraEmergencia = est.etapaAtual ? Math.min(restante, ceilCVE(est.etapaAtual.falta)) : 0;
  alloc('emergencia', null, paraEmergencia, 'Regra de rendimento extra');
  restante -= paraEmergencia;
  const metas = db.goals.map((g) => ({ g, falta: Math.max(0, (g.valorAlvo || 0) - (g.valorAtual || 0)) })).filter((x) => x.falta > 0);
  for (const { it, v } of splitByWeight(restante, metas, (x) => x.falta)) {
    const real = Math.min(v, it.falta);
    alloc('meta', it.g.id, real, 'Regra de rendimento extra');
    restante -= real;
  }
  alloc('emergencia', null, restante, 'Regra de rendimento extra (sem outro destino)');

  t.regraAplicada = rule.id;
  return {
    regra: rule, total: t.valor, created,
    fundos: sum(created.filter((a) => a.destino === 'fundo'), (a) => a.valor),
    dividas: sum(created.filter((a) => a.destino === 'divida'), (a) => a.valor),
    emergencia: sum(created.filter((a) => a.destino === 'emergencia'), (a) => a.valor),
    metas: sum(created.filter((a) => a.destino === 'meta'), (a) => a.valor),
    livre: t.valor - sum(created, (a) => a.valor)
  };
}

/** Rendimentos extra do ciclo ainda sem regra aplicada. */
export const pendingExtraIncome = (db, cycle) => db.transactions.filter((t) => isExtraIncome(db, t) && inPeriod(t, cycle) && !t.regraAplicada);

/** Ajuda a familiares no ciclo vs. o limite definido (orçamento da categoria). */
export function familyHelp(db, today) {
  const cycle = cycleOf(db, today);
  const cats = db.categories.filter((c) => c.nivel === 'familia' && !c.arquivada);
  const limite = sum(cats, (c) => c.orcamentoMensal || 0);
  const ids = new Set(cats.map((c) => c.id));
  const gasto = sum(db.transactions.filter((t) => t.tipo === 'despesa' && ids.has(t.categoriaId) && inPeriod(t, cycle)), (t) => t.valor);
  return { limite, gasto, restante: limite - gasto, excedido: limite > 0 && gasto > limite, semLimite: !limite && gasto > 0 };
}

// ---------- Simulador "e se" ----------

/** Indicadores do plano (modo 'plano': salário e rendimentos esperados do perfil). */
export function planMetrics(db, today) {
  const c = cascade(db, today, { mode: 'plano' });
  const em = emergencyStatus(db, today);
  const r = debtRatio(db);
  return {
    rendimento: c.income.total, essenciais: c.levels[0].use, livre: c.livre.disponivel, deficit: c.deficit,
    emergencia: { contribuicao: em.contribuicao, base: em.base, mesesCobertos: em.mesesCobertos, etapa: em.etapaAtual },
    racio: { pct: r.pct, estado: r.estado }
  };
}

/**
 * Aplica um cenário a uma CÓPIA dos dados e compara com a situação atual. Os dados reais não mudam.
 * ajustes: { salarioPct, alimentacaoPct, filhosDelta, novaDivida: { prestacao, saldo, taxaAnual }, perdaExtra: id | 'todos' }
 */
export function simulateScenario(db, today, ajustes = {}) {
  const sim = structuredClone(db);
  const h = sim.household;
  const a = ajustes;
  if (a.salarioPct) h.salarioLiquido = roundCVE(h.salarioLiquido * (1 + a.salarioPct / 100));
  const food = sim.categories.filter((c) => c.essencialTipo === 'alimentacao');
  if (a.alimentacaoPct) {
    for (const c of food) if (c.orcamentoMensal) c.orcamentoMensal = roundCVE(c.orcamentoMensal * (1 + a.alimentacaoPct / 100));
    if (h.parametros.cestaSemanalPorPessoa) h.parametros.cestaSemanalPorPessoa = roundCVE(h.parametros.cestaSemanalPorPessoa * (1 + a.alimentacaoPct / 100));
  }
  if (a.filhosDelta > 0) {
    const antes = Math.max(1, h.pessoas);
    h.pessoas += a.filhosDelta;
    h.dependentes += a.filhosDelta;
    for (let i = 0; i < a.filhosDelta; i++) h.filhos.push({ id: `__sim${i}`, nome: 'Novo filho/a', anoNascimento: Number(today.slice(0, 4)), escolar: false });
    // Sem cesta por pessoa, a alimentação cresce na proporção das pessoas.
    if (!h.parametros.cestaSemanalPorPessoa) for (const c of food) if (c.orcamentoMensal) c.orcamentoMensal = roundCVE((c.orcamentoMensal * h.pessoas) / antes);
  }
  if (a.novaDivida?.prestacao) {
    sim.debts.push({ id: '__simDivida', nome: 'Dívida nova', tipo: 'consumo', saldo: a.novaDivida.saldo || a.novaDivida.prestacao * 12,
      prestacao: a.novaDivida.prestacao, taxaAnual: a.novaDivida.taxaAnual || null, ativa: true, dataSaldo: today });
  }
  if (a.perdaExtra) h.rendimentosExtra = a.perdaExtra === 'todos' ? [] : h.rendimentosExtra.filter((r) => r.id !== a.perdaExtra);

  const base = planMetrics(db, today), cenario = planMetrics(sim, today);
  return {
    base, cenario,
    delta: {
      rendimento: cenario.rendimento - base.rendimento,
      livre: cenario.livre - base.livre,
      deficit: cenario.deficit - base.deficit,
      contribuicaoEmergencia: cenario.emergencia.contribuicao - base.emergencia.contribuicao,
      racio: (cenario.racio.pct ?? 0) - (base.racio.pct ?? 0)
    }
  };
}

export { periodDays, addDays };
