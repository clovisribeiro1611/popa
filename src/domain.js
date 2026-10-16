// Regras de negócio puras (sem DOM nem I/O). Valores monetários são inteiros em centavos;
// datas são strings locais "YYYY-MM-DD".

const NBSP = ' ';

// ---------- Dinheiro ----------

/** 1250050 → "12 500,50 CVE" (casasDecimais = 2) ou "12 501 CVE" (casasDecimais = 0). */
export function formatMoney(cents, { moeda = 'CVE', casasDecimais = 2 } = {}, { sign = false, symbol = true } = {}) {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  let int, frac = '';
  if (casasDecimais > 0) {
    int = Math.floor(abs / 100);
    frac = ',' + String(abs % 100).padStart(2, '0');
  } else {
    int = Math.round(abs / 100);
  }
  const grouped = String(int).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const prefix = neg ? '−' : sign && cents > 0 ? '+' : '';
  return `${prefix}${grouped}${frac}${symbol ? NBSP + moeda : ''}`;
}

/**
 * Converte texto introduzido pelo utilizador em centavos. Aceita "12500", "12 500,5", "12.500,50",
 * "12500.5". Com um único ponto seguido de exatamente 3 dígitos, o ponto é separador de milhares.
 * Devolve null se o texto não for um número válido.
 */
export function parseMoney(text) {
  if (text == null) return null;
  let s = String(text).trim().replace(/[\s  ]/g, '').replace(/CVE|\$|€/gi, '');
  if (!s) return null;
  const neg = /^[-−]/.test(s);
  s = s.replace(/^[-−+]/, '');
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  let dec = -1;
  if (lastComma >= 0 && lastDot >= 0) dec = Math.max(lastComma, lastDot);
  else if (lastComma >= 0) dec = s.indexOf(',') === lastComma ? lastComma : -1;
  else if (lastDot >= 0) dec = s.indexOf('.') === lastDot && s.length - lastDot - 1 !== 3 ? lastDot : -1;
  let intPart = dec >= 0 ? s.slice(0, dec) : s;
  let fracPart = dec >= 0 ? s.slice(dec + 1) : '';
  if (/[.,]/.test(intPart) && !/^\d{1,3}([.,]\d{3})+$/.test(intPart)) return null;
  intPart = intPart.replace(/[.,]/g, '');
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart) || (!intPart && !fracPart)) return null;
  const frac3 = (fracPart + '000').slice(0, 3);
  let cents = Number(intPart || '0') * 100 + Number(frac3.slice(0, 2));
  if (Number(frac3[2]) >= 5) cents += 1;
  return neg ? -cents : cents;
}

/** Centavos → texto editável ("12500,5" → "12500,50"; sem separador de milhares). */
export function centsToInput(cents) {
  if (cents == null) return '';
  const s = (Math.abs(cents) / 100).toFixed(2).replace('.', ',').replace(/,00$/, '');
  return (cents < 0 ? '-' : '') + s;
}

// ---------- Datas ----------

const pad = (n) => String(n).padStart(2, '0');
export const toISO = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export const parts = (iso) => iso.split('-').map(Number);
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function todayISO(now = new Date()) {
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function addDays(iso, n) {
  const [y, m, d] = parts(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Soma meses mantendo o dia `anchor` (limitado ao último dia do mês: 31 jan + 1 mês = 28/29 fev). */
export function addMonths(iso, n, anchor) {
  const [y, m, d] = parts(iso);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12), nm = (total % 12) + 1;
  return toISO(ny, nm, Math.min(anchor ?? d, daysInMonth(ny, nm)));
}

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export function formatDate(iso, { weekday = false, year = true } = {}) {
  const [y, m, d] = parts(iso);
  const wd = weekday ? DIAS_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] + ', ' : '';
  return `${wd}${d} ${MESES_CURTOS[m - 1]}${year ? ' ' + y : ''}`;
}

/**
 * Período orçamental ("mês" ou ciclo salarial) que contém `iso`, começando no dia `firstDay` (1–31).
 * Em meses mais curtos o início passa para o último dia do mês (dia 31 → 30 abr, 28 fev).
 * Ex.: firstDay = 25 → 25 set a 24 out pertence ao "mês" de outubro (o mês em que termina).
 */
export function periodFor(iso, firstDay = 1) {
  const [y, m] = parts(iso);
  let { y: sy, m: sm } = { y, m };
  if (iso < startOfMonthCycle(y, m, firstDay)) ({ y: sy, m: sm } = shiftYM(y, m, -1));
  const start = startOfMonthCycle(sy, sm, firstDay);
  const { y: ny, m: nm } = shiftYM(sy, sm, 1);
  const end = addDays(startOfMonthCycle(ny, nm, firstDay), -1);
  const [ey, em] = parts(end);
  const label = firstDay === 1
    ? `${MESES[sm - 1]} ${sy}`
    : `${formatDate(start, { year: false })} – ${formatDate(end, { year: ey !== sy })}`;
  return { start, end, key: `${ey}-${pad(em)}`, label, shortLabel: MESES_CURTOS[em - 1] };
}

const startOfMonthCycle = (y, m, firstDay) => toISO(y, m, Math.min(firstDay, daysInMonth(y, m)));

function shiftYM(y, m, n) {
  const t = y * 12 + (m - 1) + n;
  return { y: Math.floor(t / 12), m: (t % 12) + 1 };
}

/** Número de dias de um período (inclusive). */
export const periodDays = (p) => Math.round((Date.parse(p.end) - Date.parse(p.start)) / 864e5) + 1;

export function shiftPeriod(period, n, firstDay = 1) {
  const [y, m] = parts(period.start);
  const t = shiftYM(y, m, n);
  return periodFor(startOfMonthCycle(t.y, t.m, firstDay), firstDay);
}

// ---------- Saldos e resumos ----------

/** Saldo de cada conta: saldoInicial + receitas − despesas ± transferências, até `until` (inclusive). */
export function accountBalances(db, until = null) {
  const bal = new Map(db.accounts.map((a) => [a.id, a.saldoInicial || 0]));
  const add = (id, v) => { if (bal.has(id)) bal.set(id, bal.get(id) + v); };
  for (const t of db.transactions) {
    if (until && t.data > until) continue;
    if (t.tipo === 'despesa') add(t.contaId, -t.valor);
    else if (t.tipo === 'receita') add(t.contaId, t.valor);
    else if (t.tipo === 'transferencia') { add(t.contaId, -t.valor); add(t.contaDestinoId, t.valor); }
  }
  return bal;
}

export function totalBalance(db, until = null) {
  const bal = accountBalances(db, until);
  return db.accounts.filter((a) => !a.arquivada).reduce((s, a) => s + bal.get(a.id), 0);
}

export const inPeriod = (t, p) => t.data >= p.start && t.data <= p.end;

/** Receitas, despesas, saldo e gasto por categoria num período (transferências não contam). */
export function periodSummary(db, period) {
  let receitas = 0, despesas = 0;
  const porCategoria = new Map();
  for (const t of db.transactions) {
    if (!inPeriod(t, period)) continue;
    if (t.tipo === 'receita') receitas += t.valor;
    else if (t.tipo === 'despesa') {
      despesas += t.valor;
      porCategoria.set(t.categoriaId, (porCategoria.get(t.categoriaId) || 0) + t.valor);
    }
  }
  return { receitas, despesas, saldo: receitas - despesas, porCategoria };
}

/** Estado de um orçamento: < 80% ok (verde), 80–100% aviso (amarelo), > 100% excedido (vermelho). */
export function budgetState(gasto, orcamento) {
  if (!orcamento) return null;
  const pct = gasto / orcamento;
  return { pct, estado: pct > 1 ? 'excedido' : pct >= 0.8 ? 'aviso' : 'ok', restante: orcamento - gasto };
}

export function budgets(db, period) {
  const { porCategoria } = periodSummary(db, period);
  return db.categories
    .filter((c) => c.tipo === 'despesa' && c.orcamentoMensal > 0 && !c.arquivada)
    .map((c) => {
      const gasto = porCategoria.get(c.id) || 0;
      return { categoria: c, gasto, orcamento: c.orcamentoMensal, ...budgetState(gasto, c.orcamentoMensal) };
    })
    .sort((a, b) => b.pct - a.pct);
}

/** Resumo do período, do anterior e a variação por categoria. */
export function compareWithPrevious(db, period, firstDay = 1) {
  const prevPeriod = shiftPeriod(period, -1, firstDay);
  const cur = periodSummary(db, period);
  const prev = periodSummary(db, prevPeriod);
  const ids = new Set([...cur.porCategoria.keys(), ...prev.porCategoria.keys()]);
  const categorias = [...ids].map((id) => ({
    categoriaId: id,
    atual: cur.porCategoria.get(id) || 0,
    anterior: prev.porCategoria.get(id) || 0
  })).sort((a, b) => b.atual - a.atual || b.anterior - a.anterior);
  return { cur, prev, prevPeriod, categorias };
}

/** Receitas/despesas dos últimos `n` períodos (o mais antigo primeiro). */
export function history(db, period, n = 6, firstDay = 1) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const p = shiftPeriod(period, -i, firstDay);
    out.push({ period: p, ...periodSummary(db, p) });
  }
  return out;
}

// ---------- Filtros ----------

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Filtra e ordena (mais recente primeiro). Filtros: start, end, categoriaId, contaId, texto. */
export function filterTransactions(db, f = {}) {
  const q = norm(f.texto).trim();
  const catName = new Map(db.categories.map((c) => [c.id, norm(c.nome)]));
  return db.transactions
    .filter((t) =>
      (!f.start || t.data >= f.start) &&
      (!f.end || t.data <= f.end) &&
      (!f.categoriaId || t.categoriaId === f.categoriaId) &&
      (!f.contaId || t.contaId === f.contaId || t.contaDestinoId === f.contaId) &&
      (!q || norm(t.descricao).includes(q) || norm(t.notas).includes(q) || (catName.get(t.categoriaId) || '').includes(q)))
    .sort((a, b) => (b.data > a.data ? 1 : b.data < a.data ? -1 : (b.criadoEm || '').localeCompare(a.criadoEm || '')));
}

/** Agrupa transações (já ordenadas) por dia, com o total líquido do dia (transferências contam 0). */
export function groupByDay(list) {
  const groups = [];
  for (const t of list) {
    let g = groups[groups.length - 1];
    if (!g || g.data !== t.data) groups.push(g = { data: t.data, total: 0, items: [] });
    g.items.push(t);
    g.total += t.tipo === 'receita' ? t.valor : t.tipo === 'despesa' ? -t.valor : 0;
  }
  return groups;
}

/** Categorias favoritas primeiro, depois as mais usadas nos últimos 90 dias. */
export function quickCategories(db, tipo, today, limit = 8) {
  const since = addDays(today, -90);
  const uso = new Map();
  for (const t of db.transactions) if (t.tipo === tipo && t.data >= since) uso.set(t.categoriaId, (uso.get(t.categoriaId) || 0) + 1);
  return db.categories
    .filter((c) => c.tipo === tipo && !c.arquivada)
    .sort((a, b) => (b.favorita - a.favorita) || ((uso.get(b.id) || 0) - (uso.get(a.id) || 0)) || a.ordem - b.ordem)
    .slice(0, limit);
}

// ---------- Validação de transações ----------

export function validateTransaction(t, db) {
  const errs = [];
  if (!Number.isInteger(t.valor) || t.valor <= 0) errs.push('Indique um valor maior que zero.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.data || '')) errs.push('Data inválida.');
  if (!db.accounts.some((a) => a.id === t.contaId)) errs.push('Escolha uma conta.');
  if (t.tipo === 'transferencia') {
    if (!db.accounts.some((a) => a.id === t.contaDestinoId)) errs.push('Escolha a conta de destino.');
    else if (t.contaDestinoId === t.contaId) errs.push('A conta de destino tem de ser diferente da de origem.');
  } else if (!db.categories.some((c) => c.id === t.categoriaId)) errs.push('Escolha uma categoria.');
  return errs;
}

// ---------- Recorrências ----------

export const PERIODICIDADES = { diaria: 'Diária', semanal: 'Semanal', mensal: 'Mensal', anual: 'Anual' };

export function nextOccurrence(rec, from = rec.proximaData) {
  const n = rec.intervalo || 1;
  switch (rec.periodicidade) {
    case 'diaria': return addDays(from, n);
    case 'semanal': return addDays(from, 7 * n);
    case 'anual': return addMonths(from, 12 * n, rec.diaAncora);
    default: return addMonths(from, n, rec.diaAncora);
  }
}

/**
 * Gera as transações de todas as recorrências ativas com proximaData <= today e avança proximaData.
 * Altera `db` e devolve as transações criadas. Como proximaData avança na mesma gravação, nunca há duplicados.
 */
export function generateRecurring(db, today, { newId, nowIso = new Date().toISOString(), maxPerRule = 1000 } = {}) {
  const created = [];
  for (const r of db.recurring) {
    if (!r.ativo) continue;
    let count = 0;
    while (r.proximaData <= today && count < maxPerRule) {
      if (r.dataFim && r.proximaData > r.dataFim) break;
      const t = {
        id: newId(), data: r.proximaData, valor: r.valor, tipo: r.tipo, contaId: r.contaId,
        contaDestinoId: r.tipo === 'transferencia' ? r.contaDestinoId : null,
        categoriaId: r.tipo === 'transferencia' ? null : r.categoriaId,
        descricao: r.descricao, notas: '', recorrenteId: r.id, criadoEm: nowIso
      };
      db.transactions.push(t);
      created.push(t);
      r.proximaData = nextOccurrence(r);
      count++;
    }
    if (r.dataFim && r.proximaData > r.dataFim) r.ativo = false;
  }
  return created;
}

// ---------- Metas ----------

export function goalProgress(g, today) {
  const pct = g.valorAlvo > 0 ? Math.min(1, g.valorAtual / g.valorAlvo) : 0;
  const falta = Math.max(0, g.valorAlvo - g.valorAtual);
  let mesesRestantes = null, porMes = null;
  if (g.prazo && falta > 0) {
    const [ty, tm, td] = parts(today), [py, pm, pd] = parts(g.prazo);
    mesesRestantes = Math.max(0, (py - ty) * 12 + (pm - tm) - (pd < td ? 1 : 0));
    porMes = g.prazo >= today ? Math.ceil(falta / Math.max(1, mesesRestantes)) : null;
  }
  return { pct, falta, mesesRestantes, porMes, concluida: falta === 0, atrasada: !!g.prazo && g.prazo < today && falta > 0 };
}

// ---------- CSV ----------

const CSV_COLS = ['data', 'tipo', 'valor', 'conta', 'conta_destino', 'categoria', 'descricao', 'notas'];

function csvCell(v) {
  const s = String(v ?? '');
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV com ";" e vírgula decimal (abre diretamente no Excel em pt-PT). */
export function toCSV(db, list = db.transactions) {
  const acc = new Map(db.accounts.map((a) => [a.id, a.nome]));
  const cat = new Map(db.categories.map((c) => [c.id, c.nome]));
  const rows = [...list].sort((a, b) => a.data.localeCompare(b.data)).map((t) => [
    t.data, t.tipo, (t.valor / 100).toFixed(2).replace('.', ','), acc.get(t.contaId) || '',
    acc.get(t.contaDestinoId) || '', cat.get(t.categoriaId) || '', t.descricao, t.notas
  ].map(csvCell).join(';'));
  return '﻿' + [CSV_COLS.join(';'), ...rows].join('\r\n') + '\r\n';
}

export function parseCSVRows(text) {
  text = text.replace(/^﻿/, '');
  const sep = (text.split(/\r?\n/)[0].match(/;/g) || []).length >= (text.split(/\r?\n/)[0].match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

/**
 * Importa transações de CSV (formato de toCSV). Contas e categorias são associadas pelo nome e
 * criadas se não existirem. Linhas iguais a transações existentes são ignoradas.
 * Altera `db` e devolve { importadas, duplicadas, erros }.
 */
export function importCSV(db, text, { newId, nowIso = new Date().toISOString() }) {
  const rows = parseCSVRows(text);
  if (!rows.length) return { importadas: 0, duplicadas: 0, erros: ['Ficheiro vazio.'] };
  const header = rows[0].map((h) => norm(h).trim());
  const idx = Object.fromEntries(CSV_COLS.map((c) => [c, header.indexOf(c)]));
  if (idx.data < 0 || idx.valor < 0) return { importadas: 0, duplicadas: 0, erros: ['Cabeçalho inválido: são necessárias as colunas "data" e "valor".'] };

  const byName = (list) => new Map(list.map((x) => [norm(x.nome), x]));
  const accs = byName(db.accounts);
  const key = (t) => [t.data, t.tipo, t.valor, t.contaId, t.contaDestinoId || '', t.categoriaId || '', norm(t.descricao)].join('|');
  const existing = new Set(db.transactions.map(key));

  const getAccount = (nome) => {
    if (!nome) return db.accounts.find((a) => a.id === db.settings.contaPorDefeito) || db.accounts[0];
    let a = accs.get(norm(nome));
    if (!a) {
      a = { id: newId(), nome, tipo: 'conta', saldoInicial: 0, arquivada: false, ordem: db.accounts.length };
      db.accounts.push(a); accs.set(norm(nome), a);
    }
    return a;
  };
  const getCategory = (nome, tipo) => {
    const nomeFinal = nome || (tipo === 'receita' ? 'Outras receitas' : 'Outras despesas');
    let c = db.categories.find((x) => x.tipo === tipo && norm(x.nome) === norm(nomeFinal));
    if (!c) {
      c = { id: newId(), nome: nomeFinal, tipo, cor: '#868E96', icone: tipo === 'receita' ? '💰' : '📦',
        orcamentoMensal: null, favorita: false, arquivada: false, ordem: db.categories.length };
      db.categories.push(c);
    }
    return c;
  };

  let importadas = 0, duplicadas = 0;
  const erros = [];
  rows.slice(1).forEach((r, i) => {
    const get = (c) => (idx[c] >= 0 ? (r[idx[c]] ?? '').trim() : '');
    const linha = i + 2;
    let data = get('data');
    const m = data.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (m) data = toISO(+m[3], +m[2], +m[1]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { erros.push(`Linha ${linha}: data inválida.`); return; }
    let valor = parseMoney(get('valor'));
    if (valor == null || valor === 0) { erros.push(`Linha ${linha}: valor inválido.`); return; }
    let tipo = norm(get('tipo'));
    if (!['despesa', 'receita', 'transferencia'].includes(tipo)) tipo = valor < 0 ? 'despesa' : 'receita';
    valor = Math.abs(valor);
    const conta = getAccount(get('conta'));
    const t = {
      id: newId(), data, valor, tipo, contaId: conta.id, contaDestinoId: null, categoriaId: null,
      descricao: get('descricao'), notas: get('notas'), recorrenteId: null, criadoEm: nowIso
    };
    if (tipo === 'transferencia') {
      if (!get('conta_destino')) { erros.push(`Linha ${linha}: transferência sem conta de destino.`); return; }
      t.contaDestinoId = getAccount(get('conta_destino')).id;
    } else t.categoriaId = getCategory(get('categoria'), tipo).id;
    if (existing.has(key(t))) { duplicadas++; return; }
    existing.add(key(t));
    db.transactions.push(t);
    importadas++;
  });
  return { importadas, duplicadas, erros };
}
