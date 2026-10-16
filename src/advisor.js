// O conselheiro: indicadores, avisos e conselhos gerados por regras determinísticas a partir dos dados.
// Cada conselho explica o porquê com os números do utilizador. Sem IA nem serviços externos.

import {
  cascade, suggestCuts, emergencyStatus, endOfMonth, debtRatio, debtPlan, activeDebts, fundStatus, utilityEstimate, UTILITIES,
  weeklyFood, servicesVariation, familyHelp, pendingExtraIncome, cycleOf, ceilCVE, roundCVE, daysBetween
} from './finance.js';
import { formatMoney, formatDate, shiftPeriod, periodSummary, addDays } from './domain.js';

const pct1 = (v) => `${v.toLocaleString('pt-PT', { maximumFractionDigits: 1 })}%`;
const num1 = (v) => v.toLocaleString('pt-PT', { maximumFractionDigits: 1 });

// ---------- Indicadores ----------

/**
 * Painel: taxa de poupança (último ciclo completo), meses de emergência cobertos, % do rendimento em essenciais,
 * rácio de endividamento e pontualidade das reservas (reservas feitas nos primeiros 5 dias do ciclo, últimos 3 ciclos).
 */
export function indicators(db, today) {
  const fd = db.household.diaPagamento || db.settings.primeiroDiaDoMes || 1;
  const cur = cycleOf(db, today);
  const last = shiftPeriod(cur, -1, fd);
  const s = periodSummary(db, last);
  const taxaPoupanca = s.receitas ? ((s.receitas - s.despesas) / s.receitas) * 100 : null;

  const em = emergencyStatus(db, today);
  const plano = cascade(db, today, { mode: 'plano' });
  const pctEssenciais = plano.income.total ? (plano.levels[0].use / plano.income.total) * 100 : null;
  const r = debtRatio(db);

  let noPrazo = 0, total = 0;
  for (let i = 1; i <= 3; i++) {
    const c = shiftPeriod(cur, -i, fd);
    const limite = addDays(c.start, 4);
    for (const a of db.allocations) {
      if (a.valor <= 0 || a.origem === 'extra' || a.data < c.start || a.data > c.end) continue;
      total += a.valor;
      if (a.data <= limite) noPrazo += a.valor;
    }
  }
  const pontualidade = total ? (noPrazo / total) * 100 : null;

  const grade = (v, bom, mau, inverse = false) => (v == null ? null : inverse ? (v <= bom ? 'bom' : v <= mau ? 'atencao' : 'mau') : (v >= bom ? 'bom' : v >= mau ? 'atencao' : 'mau'));
  return [
    { id: 'poupanca', titulo: 'Taxa de poupança', valor: taxaPoupanca, fmt: taxaPoupanca == null ? '—' : pct1(taxaPoupanca),
      estado: grade(taxaPoupanca, 10, 0), ajuda: `Último ciclo (${last.label}): o que sobrou das receitas.` },
    { id: 'emergencia', titulo: 'Meses de emergência', valor: em.mesesCobertos, fmt: num1(em.mesesCobertos),
      estado: em.base ? grade(em.mesesCobertos, 3, 1) : null, ajuda: 'Meses de despesas essenciais cobertos pelo fundo.' },
    { id: 'essenciais', titulo: 'Rendimento em essenciais', valor: pctEssenciais, fmt: pctEssenciais == null ? '—' : pct1(pctEssenciais),
      estado: grade(pctEssenciais, 60, 80, true), ajuda: 'Parte do rendimento planeado que vai para o essencial.' },
    { id: 'racio', titulo: 'Endividamento', valor: r.pct, fmt: r.pct == null ? '—' : pct1(r.pct),
      estado: r.estado == null ? null : { verde: 'bom', amarelo: 'atencao', vermelho: 'mau' }[r.estado], ajuda: 'Prestações ÷ salário líquido.' },
    { id: 'pontualidade', titulo: 'Pontualidade das reservas', valor: pontualidade, fmt: pontualidade == null ? '—' : pct1(pontualidade),
      estado: grade(pontualidade, 80, 50), ajuda: 'Reservas feitas até ao 5.º dia do ciclo (últimos 3 ciclos).' }
  ];
}

// ---------- Avisos ----------

/** Avisos atuais de todos os módulos: { id, nivel: 'bad'|'warn'|'info', icone, titulo, texto, href }. */
export function alerts(db, today) {
  const m = (v) => formatMoney(v, db.settings);
  const out = [];
  for (const tipo of Object.keys(UTILITIES)) {
    const e = utilityEstimate(db, tipo, today).estimativa;
    if (e?.aviso) out.push({ id: `util:${tipo}`, nivel: 'warn', icone: UTILITIES[tipo].icone, titulo: `${UTILITIES[tipo].nome}: está na hora`,
      texto: e.diasRestantes ? `Deve acabar dentro de ~${e.diasRestantes} dias (${formatDate(e.acabaEm, { year: false })}).` : 'Deve estar a acabar.', href: '#/consumos' });
  }
  const w = weeklyFood(db, today);
  if (w.estado === 'excedido' || (w.estado === 'acima' && w.dia >= 3)) {
    out.push({ id: 'cesta', nivel: w.estado === 'excedido' ? 'bad' : 'warn', icone: '🛒', titulo: 'Cesta alimentar da semana',
      texto: `${m(w.gasto)} de ${m(w.orcamento)} até ${w.dia === 7 ? 'domingo' : 'hoje'}. ${w.restante > 0 ? `Restam ${m(w.porDiaRestante)}/dia.` : 'Orçamento da semana esgotado.'}`, href: '#/consumos' });
  }
  for (const s of servicesVariation(db, today)) {
    if (s.alerta) out.push({ id: `serv:${s.categoria.id}`, nivel: 'warn', icone: s.categoria.icone, titulo: `${s.categoria.nome} subiu ${Math.round(s.variacao * 100)}%`,
      texto: `${m(s.gasto)} este ciclo vs. ${m(s.fixo)} habituais.`, href: '#/consumos' });
  }
  const f = familyHelp(db, today);
  if (f.excedido) out.push({ id: 'familia', nivel: 'warn', icone: '❤️', titulo: 'Ajuda a familiares acima do limite',
    texto: `${m(f.gasto)} este ciclo; o limite é ${m(f.limite)}.`, href: '#/perfil' });
  for (const fu of db.funds.filter((x) => x.ativo !== false)) {
    const st = fundStatus(db, fu, today);
    if (st.vencido) out.push({ id: `fundo:${fu.id}`, nivel: 'info', icone: fu.icone || '🗓️', titulo: `${fu.nome}: chegou a data`,
      texto: `Tem ${m(st.saldo)} reservados. Use o fundo e passa para o próximo ano.`, href: '#/plano' });
    else if (st.alerta && fu.tipo !== 'longoPrazo') out.push({ id: `fundo:${fu.id}`, nivel: 'info', icone: fu.icone || '🗓️', titulo: `${fu.nome} em ${st.ciclos} ${st.ciclos === 1 ? 'mês' : 'meses'}`,
      texto: `Faltam ${m(st.falta)}: reserve ${m(st.sugestaoMensal)} por mês.`, href: '#/plano' });
  }
  const [, , dToday] = today.split('-').map(Number);
  for (const d of activeDebts(db)) {
    if (!d.diaPagamento) continue;
    const diff = d.diaPagamento - dToday;
    if (diff === 0 || diff === 1) out.push({ id: `div:${d.id}`, nivel: 'info', icone: '💳', titulo: `Prestação ${diff ? 'amanhã' : 'hoje'}: ${d.nome}`,
      texto: `${m(d.prestacao)}.`, href: '#/dividas' });
  }
  const review = reviewsDue(db, today);
  if (review.semanal) out.push({ id: 'rev:semanal', nivel: 'info', icone: '✅', titulo: 'Revisão semanal (5 minutos)', texto: review.ultimaSemanal ? `A última foi a ${formatDate(review.ultimaSemanal, { year: false })}.` : 'Ainda não fez nenhuma.', href: '#/revisao' });
  if (review.mensal) out.push({ id: 'rev:mensal', nivel: 'info', icone: '🗓️', titulo: 'Revisão do mês', texto: 'Novo ciclo: confirme o salário, reserve e reveja o plano.', href: '#/revisao' });
  const order = { bad: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.nivel] - order[b.nivel]);
}

// ---------- Revisões ----------

export function reviewsDue(db, today) {
  const rev = db.advice?.revisoes || [];
  const ultimaSemanal = rev.filter((r) => r.tipo === 'semanal').map((r) => r.data).sort().at(-1) || null;
  const cycle = cycleOf(db, today);
  const mensalFeita = rev.some((r) => r.tipo === 'mensal' && r.data >= cycle.start && r.data <= cycle.end);
  return {
    ultimaSemanal,
    semanal: !ultimaSemanal || daysBetween(ultimaSemanal, today) >= 7,
    mensal: !mensalFeita && daysBetween(cycle.start, today) <= 10 && db.household.salarioLiquido > 0
  };
}

// ---------- Conselhos ----------

/**
 * Gera os conselhos por regras, ordenados por prioridade (1 = mais urgente). `limit` (3) = "Conselho do mês".
 * Cada conselho: { id, prioridade, titulo, texto, porque, acao: { label, href } }.
 */
export function advise(db, today, { limit = 3 } = {}) {
  const m = (v) => formatMoney(v, db.settings);
  const c = cascade(db, today);
  const em = emergencyStatus(db, today);
  const fim = endOfMonth(db, today, c);
  const r = debtRatio(db);
  const list = [];
  const add = (x) => list.push(x);

  const essenciaisSemOrcamento = c.levels[0].items.filter((i) => ['casa', 'alimentacao', 'energia'].includes(i.tipo) && !i.need);
  if (essenciaisSemOrcamento.length) add({ id: 'orcamentos', prioridade: 2, titulo: 'Defina quanto custa o essencial',
    texto: `Indique o valor mensal de: ${essenciaisSemOrcamento.map((i) => i.nome).join(', ')}.`,
    porque: 'Sem estes valores a app não sabe quanto é preciso cobrir antes de tudo o resto.', acao: { label: 'Categorias', href: '#/categorias' } });

  if (fim.semanaCritica) add({ id: 'semana-critica', prioridade: 1, titulo: 'Semana crítica: só o essencial',
    texto: `Até ao salário (${fim.diasAteSalario} dias), gaste no máximo ${m(fim.dinheiroPorDia)} por dia e adie o que não é essencial.`,
    porque: `O dinheiro por dia (${m(fim.dinheiroPorDia)}) está abaixo do limite que definiu (${m(fim.limite)}).`, acao: { label: 'Ver o que adiar', href: '#/inicio' } });

  if (c.deficit > 0) {
    const cuts = suggestCuts(db, c, today);
    add({ id: 'defice', prioridade: 1, titulo: 'O rendimento não chega para o plano',
      texto: cuts.length ? `Comece por: ${cuts[0].texto.toLowerCase()} (liberta ${m(cuts[0].valor)}).` : 'Reveja os orçamentos dos essenciais ou procure rendimento extra.',
      porque: `Rendimento ${m(c.income.total)}; o plano precisa de ${m(c.income.total + c.deficit)}. Faltam ${m(c.deficit)} a partir de “${c.primeiroDefice.titulo}”.`,
      acao: { label: 'Ver cortes', href: '#/plano' } });
  }

  if (fim.alertaRitmo) add({ id: 'ritmo', prioridade: 2, titulo: 'Abrande o ritmo de gasto',
    texto: `Baixe os gastos do dia a dia para cerca de ${m(fim.ritmoSustentavel)} por dia.`,
    porque: `Está a gastar ${m(fim.ritmoDiario)} por dia; a este ritmo o ciclo fecha com ${m(fim.faltaProjetada)} a menos do que o previsto.`,
    acao: { label: 'Movimentos', href: '#/movimentos' } });

  if (em.base > 0 && em.mesesCobertos < 1) add({ id: 'emergencia-1', prioridade: 2, titulo: 'Chegue a 1 mês de emergência',
    texto: 'A prioridade é chegar a 1 mês de fundo de emergência antes de aumentar gastos livres.',
    porque: `O fundo de emergência cobre ${num1(em.mesesCobertos)} meses (${m(em.saldo)} de ${m(em.base)} de essenciais por mês).${em.etapas[0].data ? ` Com ${m(em.contribuicao)} por mês chega a 1 mês em ${formatDate(em.etapas[0].data)}.` : ' Defina uma contribuição mensal.'}`,
    acao: { label: 'Fundo de emergência', href: '#/plano' } });
  else if (em.base > 0 && em.mesesCobertos < 3) add({ id: 'emergencia-3', prioridade: 6, titulo: 'Continue o fundo de emergência até 3 meses',
    texto: `Mantenha os ${m(em.contribuicao)} por mês.`, porque: `Cobre ${num1(em.mesesCobertos)} meses; a etapa seguinte são 3 meses (${m(em.base * 3)}).`,
    acao: { label: 'Fundo de emergência', href: '#/plano' } });

  if (r.estado === 'vermelho' || r.estado === 'amarelo') {
    const plan = debtPlan(db);
    const first = plan.plano.ordem[0];
    add({ id: 'racio', prioridade: r.estado === 'vermelho' ? 2 : 4, titulo: r.estado === 'vermelho' ? 'Endividamento alto: não aceite crédito novo' : 'Atenção ao endividamento',
      texto: first ? `Concentre qualquer valor extra em “${first.nome}” (${plan.metodo === 'avalanche' ? 'taxa mais alta' : 'saldo mais pequeno'}).` : 'Evite novas prestações.',
      porque: `As prestações (${m(r.prestacoes)}) são ${pct1(r.pct)} do salário; o limite saudável que definiu é ${r.amarelo}%.`,
      acao: { label: 'Dívidas', href: '#/dividas' } });
  }

  const debts = activeDebts(db);
  if (debts.length && !(db.settings.dividas?.extraMensal > 0) && c.livre.disponivel > 0) {
    const ref = db.household.parametros?.taxaJuroReferencia;
    const caras = debts.filter((d) => d.taxaAnual && (ref == null || d.taxaAnual >= ref)).sort((a, b) => b.taxaAnual - a.taxaAnual);
    if (caras.length) {
      const extra = Math.min(ceilCVE(c.livre.disponivel / 2), roundCVE(db.household.salarioLiquido * 0.05)) || ceilCVE(c.livre.disponivel / 2);
      const p = debtPlan(db, { metodo: 'avalanche', extra });
      if (p.poupa && p.poupa.juros > 0) add({ id: 'divida-cara', prioridade: 3, titulo: `Pague mais à “${caras[0].nome}”`,
        texto: `Junte ${m(extra)} por mês à prestação da dívida mais cara (${pct1(caras[0].taxaAnual)} ao ano).`,
        porque: `Com ${m(extra)} a mais por mês poupa cerca de ${m(p.poupa.juros)} em juros e termina ${p.poupa.meses} meses mais cedo.`,
        acao: { label: 'Estratégia', href: '#/dividas' } });
    }
  }

  const fundos = db.funds.filter((f) => f.ativo !== false && f.tipo !== 'longoPrazo').map((f) => ({ f, st: fundStatus(db, f, today) }))
    .filter((x) => x.st.alerta && !x.st.vencido).sort((a, b) => a.st.ciclos - b.st.ciclos);
  if (fundos.length) {
    const { f, st } = fundos[0];
    add({ id: `sazonal:${f.id}`, prioridade: 3, titulo: `Prepare “${f.nome}”`, texto: `Reserve ${m(st.sugestaoMensal)} por mês para não recorrer a crédito.`,
      porque: `Faltam ${st.ciclos} ${st.ciclos === 1 ? 'mês' : 'meses'} e ainda faltam ${m(st.falta)} dos ${m(f.valorAlvo)} necessários.`, acao: { label: 'Fundos', href: '#/plano' } });
  }

  const porReservar = c.levels.slice(1).reduce((s, l) => s + Math.min(l.porReservar || 0, Math.max(0, l.coberto - (l.reservado || 0))), 0);
  if (porReservar > 0 && c.tudoCoberto) add({ id: 'reservar', prioridade: 3, titulo: 'Reserve o dinheiro deste mês',
    texto: `Toque em “Reservar este mês” (${m(porReservar)}).`,
    porque: 'Cada escudo tem um destino: reservar logo a seguir ao salário evita gastar o dinheiro das emergências e dos custos que aí vêm.',
    acao: { label: 'Reservar', href: '#/plano' } });

  const extras = pendingExtraIncome(db, c.cycle);
  if (extras.length) add({ id: 'extra', prioridade: 3, titulo: 'Distribua o rendimento extra',
    texto: `Aplique a regra aos ${m(extras.reduce((s, t) => s + t.valor, 0))} recebidos este ciclo.`,
    porque: 'Dinheiro extra sem destino acaba gasto sem se dar por isso.', acao: { label: 'Início', href: '#/inicio' } });

  const w = weeklyFood(db, today);
  if (w.estado === 'excedido' || w.estado === 'acima') add({ id: 'cesta', prioridade: 4, titulo: 'Cesta alimentar acima do previsto',
    texto: w.restante > 0 ? `Para o resto da semana, conte com ${m(w.porDiaRestante)} por dia.` : 'Esta semana o orçamento acabou: compre só o indispensável.',
    porque: `Gastou ${m(w.gasto)} de ${m(w.orcamento)} (esperado até hoje: ${m(w.esperado)}).`, acao: { label: 'Consumos', href: '#/consumos' } });

  const fam = familyHelp(db, today);
  if (fam.excedido) add({ id: 'familia', prioridade: 4, titulo: 'Ajuda a familiares acima do limite',
    texto: 'Combine com a família um valor fixo por mês e mantenha-o.', porque: `Este ciclo: ${m(fam.gasto)}; o limite que definiu é ${m(fam.limite)}.`,
    acao: { label: 'Perfil', href: '#/perfil' } });

  if (em.etapaAtual == null && em.base > 0 && !debts.length && !db.funds.some((f) => f.tipo === 'longoPrazo' && f.ativo !== false)) {
    add({ id: 'longo-prazo', prioridade: 6, titulo: 'Comece a pensar no longo prazo', texto: 'Ative um fundo para os estudos dos filhos, a casa ou a reforma.',
      porque: `O fundo de emergência já cobre ${num1(em.mesesCobertos)} meses e não tem dívidas.`, acao: { label: 'Fundos', href: '#/plano' } });
  }

  if (!list.length) add({ id: 'manter', prioridade: 9, titulo: 'Está no bom caminho', texto: 'Continue a registar os gastos e faça a revisão semanal.',
    porque: 'O essencial está coberto, as reservas estão em dia e não há alertas.', acao: { label: 'Revisão', href: '#/revisao' } });

  const feitos = new Set(db.advice?.ciclos?.[c.cycle.key]?.feitos || []);
  return list.sort((a, b) => a.prioridade - b.prioridade).slice(0, limit).map((x) => ({ ...x, feito: feitos.has(x.id) }));
}

// ---------- Lembretes (notificações) ----------

const at = (iso, hhmm = '09:00') => new Date(`${iso}T${hhmm}:00`);

/**
 * Lembretes para os próximos `dias` dias: { id (estável), quando: Date, titulo, texto, href }.
 * No APK são agendados como notificações locais; na web aparecem ao abrir a app e num painel.
 */
export function reminders(db, today, { dias = 30 } = {}) {
  const m = (v) => formatMoney(v, db.settings);
  const L = db.settings.limites || {};
  const fim = addDays(today, dias);
  const out = [];
  const push = (r) => { if (r.dia >= today && r.dia <= fim) out.push({ ...r, quando: at(r.dia, r.hora) }); };
  const fd = db.household.diaPagamento || db.settings.primeiroDiaDoMes || 1;

  // Dia do salário (início dos próximos ciclos)
  let c = cycleOf(db, today);
  for (let i = 0; i < 2; i++) {
    c = shiftPeriod(c, 1, fd);
    if (db.household.salarioLiquido) push({ id: `salario:${c.start}`, dia: c.start, hora: '08:00', titulo: 'Dia de salário',
      texto: 'Registe o salário e toque em “Reservar este mês”: primeiro o essencial, depois os fundos.', href: '#/inicio' });
    // Ponto de situação do ritmo no dia N do ciclo
    push({ id: `ritmo:${c.start}`, dia: addDays(c.start, (L.diaAlertaRitmo ?? 10) - 1), hora: '19:00', titulo: 'Ponto de situação do mês',
      texto: 'Veja se o ritmo de gasto chega até ao próximo salário.', href: '#/inicio' });
  }
  const cur = cycleOf(db, today);
  push({ id: `ritmo:${cur.start}`, dia: addDays(cur.start, (L.diaAlertaRitmo ?? 10) - 1), hora: '19:00', titulo: 'Ponto de situação do mês',
    texto: 'Veja se o ritmo de gasto chega até ao próximo salário.', href: '#/inicio' });

  // Revisão semanal e cesta a meio da semana
  for (let d = 0; d <= dias; d++) {
    const iso = addDays(today, d);
    const [yy, mm, dd] = iso.split('-').map(Number);
    const dow = new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay();
    if (dow === (L.revisaoSemanalDia ?? 0)) push({ id: `revisao:${iso}`, dia: iso, hora: L.revisaoHora || '19:00', titulo: 'Revisão semanal (5 minutos)',
      texto: 'Registe os gastos em falta e veja a cesta, os pré-pagos e o dinheiro por dia.', href: '#/revisao' });
    if (dow === 3 && weeklyFood(db, today).orcamento) push({ id: `cesta:${iso}`, dia: iso, hora: '18:00', titulo: 'Cesta alimentar: meio da semana',
      texto: 'Veja quanto já gastou esta semana e quanto resta por dia.', href: '#/consumos' });
  }

  // Pré-pagos e gás: avisar N dias antes de acabar
  for (const tipo of Object.keys(UTILITIES)) {
    const e = utilityEstimate(db, tipo, today).estimativa;
    if (!e?.acabaEm) continue;
    const dia = addDays(e.acabaEm, -(L.diasAvisoPrePago ?? 2));
    push({ id: `util:${tipo}:${e.acabaEm}`, dia: dia < today ? today : dia, hora: '09:00', titulo: `${UTILITIES[tipo].nome}: está quase a acabar`,
      texto: `Deve durar até ${formatDate(e.acabaEm, { year: false })}. Reserve ${m(e.reservaSemana)} por semana.`, href: '#/consumos' });
  }

  // Prestações: na véspera
  for (const d of activeDebts(db)) {
    if (!d.diaPagamento) continue;
    for (let i = 0; i < 2; i++) {
      const [yy, mm] = today.split('-').map(Number);
      const t = yy * 12 + (mm - 1) + i;
      const y2 = Math.floor(t / 12), m2 = (t % 12) + 1;
      const dim = new Date(Date.UTC(y2, m2, 0)).getUTCDate();
      const due = `${y2}-${String(m2).padStart(2, '0')}-${String(Math.min(d.diaPagamento, dim)).padStart(2, '0')}`;
      push({ id: `divida:${d.id}:${due}`, dia: addDays(due, -1), hora: '19:00', titulo: `Prestação amanhã: ${d.nome}`, texto: `${m(d.prestacao)}.`, href: '#/dividas' });
    }
  }

  // Fundos sazonais: no 1.º dia de cada ciclo em que estão a menos de "antecedência" meses
  for (const f of db.funds.filter((x) => x.ativo !== false && x.tipo !== 'longoPrazo')) {
    const st = fundStatus(db, f, today);
    if (!st.alerta || st.vencido) continue;
    const next = shiftPeriod(cur, 1, fd).start;
    push({ id: `fundo:${f.id}:${next}`, dia: next, hora: '09:00', titulo: `${f.nome} está a chegar`,
      texto: `Faltam ${m(st.falta)}: reserve ${m(st.sugestaoMensal)} este mês.`, href: '#/plano' });
  }
  return out.sort((a, b) => a.quando - b.quando);
}

/** Marca/desmarca um conselho como seguido neste ciclo. Altera `db`. */
export function toggleAdviceDone(db, today, id) {
  const key = cycleOf(db, today).key;
  db.advice.ciclos[key] ??= { feitos: [] };
  const f = db.advice.ciclos[key].feitos;
  const i = f.indexOf(id);
  if (i >= 0) f.splice(i, 1); else f.push(id);
}


