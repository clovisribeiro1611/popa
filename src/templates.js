// Modelos de fundos sazonais (Cabo Verde) e de longo prazo. São copiados para db.seasonalTemplates na
// migração, por isso o utilizador pode editar valores e datas. Os valores são EXEMPLOS para ajustar.
// Datas móveis (Páscoa, Carnaval) são calculadas ano a ano; nada de datas fixas no código para elas.

import { toISO, addDays, parts } from './domain.js';

/** Domingo de Páscoa (calendário gregoriano, algoritmo de Meeus/Jones/Butcher). */
export function easter(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return toISO(year, month, day);
}
/** Terça-feira de Carnaval = Páscoa − 47 dias. */
export const carnival = (year) => addDays(easter(year), -47);

const CVE = (v) => v * 100;

export const DEFAULT_TEMPLATES = [
  { id: 'reentrada', nome: 'Reentrada escolar', icone: '🎒', grupo: 'escola', regra: 'fixa', mes: 9, dia: 15, valorBase: 0, valorPorFilho: CVE(6000), antecedenciaMeses: 6,
    nota: 'Material, uniformes, propinas e transporte. Multiplicado pelos filhos em idade escolar.' },
  { id: 'natal', nome: 'Natal e Ano Novo', icone: '🎄', grupo: 'festas', regra: 'fixa', mes: 12, dia: 20, valorBase: CVE(15000), antecedenciaMeses: 6 },
  { id: 'carnaval', nome: 'Carnaval', icone: '🎭', grupo: 'festas', regra: 'carnaval', valorBase: CVE(3000), antecedenciaMeses: 3 },
  { id: 'pascoa', nome: 'Páscoa', icone: '🐣', grupo: 'festas', regra: 'pascoa', valorBase: CVE(3000), antecedenciaMeses: 3 },
  { id: 'santo-antonio', nome: 'Santo António', icone: '🎉', grupo: 'festas', regra: 'fixa', mes: 6, dia: 13, valorBase: CVE(2000), antecedenciaMeses: 3 },
  { id: 'sao-joao', nome: 'São João', icone: '🔥', grupo: 'festas', regra: 'fixa', mes: 6, dia: 24, valorBase: CVE(2000), antecedenciaMeses: 3 },
  { id: 'sao-pedro', nome: 'São Pedro', icone: '⛵', grupo: 'festas', regra: 'fixa', mes: 6, dia: 29, valorBase: CVE(2000), antecedenciaMeses: 3 },
  { id: 'municipio', nome: 'Festa do município', icone: '🏛️', grupo: 'festas', regra: 'fixa', mes: null, dia: null, valorBase: CVE(3000), antecedenciaMeses: 3,
    nota: 'Indique a data da festa do seu concelho.' },
  { id: 'ferias', nome: 'Férias e viagens inter-ilhas', icone: '⛴️', grupo: 'viagens', regra: 'fixa', mes: 8, dia: 1, valorBase: CVE(20000), antecedenciaMeses: 8,
    nota: 'Barco ou avião entre ilhas.' },
  { id: 'seguros', nome: 'Seguros', icone: '🛡️', grupo: 'obrigacoes', regra: 'fixa', mes: null, dia: null, valorBase: null, antecedenciaMeses: 12,
    nota: 'Automóvel, casa, saúde. Indique o valor e a data de renovação.' },
  { id: 'impostos', nome: 'Impostos e taxas anuais', icone: '🧾', grupo: 'obrigacoes', regra: 'fixa', mes: null, dia: null, valorBase: null, antecedenciaMeses: 12,
    nota: 'Valores e datas legais mudam: confirme e preencha.' },
  { id: 'documentos', nome: 'Renovação de documentos', icone: '🪪', grupo: 'obrigacoes', regra: 'fixa', mes: null, dia: null, valorBase: CVE(5000), antecedenciaMeses: 6,
    nota: 'CNI, passaporte, carta de condução.' },
  { id: 'manutencao', nome: 'Manutenção da casa e eletrodomésticos', icone: '🔧', grupo: 'casa', regra: 'fixa', mes: 12, dia: 31, valorBase: CVE(12000), antecedenciaMeses: 12,
    nota: 'Reserva de desgaste: algo vai avariar durante o ano.' },
  // Longo prazo (nível 5 da cascata)
  { id: 'estudos', nome: 'Estudos superiores dos filhos', icone: '🎓', grupo: 'longoPrazo', tipo: 'longoPrazo', regra: 'fixa', mes: 9, dia: 1, anos: 8,
    valorBase: 0, valorPorFilho: CVE(300000), antecedenciaMeses: 96, recorrencia: 'unica' },
  { id: 'casa', nome: 'Casa própria (entrada)', icone: '🏡', grupo: 'longoPrazo', tipo: 'longoPrazo', regra: 'fixa', mes: 1, dia: 1, anos: 5,
    valorBase: CVE(500000), antecedenciaMeses: 60, recorrencia: 'unica' },
  { id: 'reforma', nome: 'Reforma', icone: '🌅', grupo: 'longoPrazo', tipo: 'longoPrazo', regra: 'fixa', mes: 1, dia: 1, anos: 20,
    valorBase: CVE(1000000), antecedenciaMeses: 240, recorrencia: 'unica' }
];

export const GRUPOS = { escola: 'Escola', festas: 'Festas', viagens: 'Viagens', obrigacoes: 'Obrigações anuais', casa: 'Casa', longoPrazo: 'Longo prazo' };

export const defaultTemplates = () => DEFAULT_TEMPLATES.map((t) => ({ ...t }));

/** Nº de filhos em idade escolar (marcados como "escolar" no perfil). */
export const schoolChildren = (db) => db.household.filhos.filter((f) => f.escolar).length;

/** Valor do modelo para este agregado (base + por filho em idade escolar); null se ficar a zero. */
export function templateAmount(db, t) {
  const filhos = t.id === 'estudos' ? db.household.filhos.length : schoolChildren(db);
  return (t.valorBase || 0) + (t.valorPorFilho || 0) * filhos || null;
}

/** Próxima data do evento a partir de `today` (null se a data ainda não foi definida). */
export function templateNextDate(t, today) {
  const [y] = parts(today);
  if (t.anos) return toISO(y + t.anos, t.mes || 1, t.dia || 1);
  const dateIn = (year) => {
    if (t.regra === 'pascoa') return easter(year);
    if (t.regra === 'carnaval') return carnival(year);
    if (!t.mes || !t.dia) return null;
    const dim = new Date(Date.UTC(year, t.mes, 0)).getUTCDate();
    return toISO(year, t.mes, Math.min(t.dia, dim));
  };
  const d = dateIn(y);
  if (!d) return null;
  return d >= today ? d : dateIn(y + 1);
}

/** Cria um fundo a partir do modelo. Altera `db` e devolve o fundo (ou null se faltar data/valor). */
export function activateTemplate(db, t, today, newId) {
  const proximaData = templateNextDate(t, today);
  const valorAlvo = templateAmount(db, t);
  if (!proximaData || !valorAlvo) return null;
  const f = {
    id: newId(), nome: t.nome, icone: t.icone, tipo: t.tipo || 'provisao', templateId: t.id,
    valorAlvo, proximaData, recorrencia: t.recorrencia || 'anual', antecedenciaMeses: t.antecedenciaMeses ?? 3,
    contribuicaoMensal: null, ativo: true, criadoEm: today
  };
  db.funds.push(f);
  return f;
}

/** Próxima data de um fundo anual depois de usado (Páscoa/Carnaval recalculados; dias fixos +1 ano). */
export function nextFundDate(db, f) {
  const t = f.templateId ? db.seasonalTemplates.find((x) => x.id === f.templateId) : null;
  const [y] = parts(f.proximaData);
  if (t?.regra === 'pascoa') return easter(y + 1);
  if (t?.regra === 'carnaval') return carnival(y + 1);
  const [, m, d] = parts(f.proximaData);
  const dim = new Date(Date.UTC(y + 1, m, 0)).getUTCDate();
  return toISO(y + 1, m, Math.min(d, dim));
}

/**
 * Usar um fundo quando o evento chega: liberta `valor` do envelope e, se for anual, passa para o ano
 * seguinte (o saldo que sobrar continua no fundo). Altera `db`.
 */
export function useFund(db, fundId, valor, today, newId, nota = '') {
  const f = db.funds.find((x) => x.id === fundId);
  if (!f) return null;
  db.allocations.push({ id: newId(), data: today, destino: 'fundo', destinoId: f.id, valor: -valor, origem: 'uso', nota });
  if (f.recorrencia === 'anual') f.proximaData = nextFundDate(db, f);
  else f.ativo = false;
  return f;
}

/**
 * Calendário dos próximos 12 meses (a partir do mês de `today`): por mês, os fundos que vencem
 * e os modelos ainda não ativados (sugestões). Marca os meses mais pesados.
 */
export function annualCalendar(db, today) {
  const [y, m] = parts(today);
  const months = Array.from({ length: 12 }, (_, i) => {
    const t = (y * 12 + (m - 1) + i);
    return { y: Math.floor(t / 12), m: (t % 12) + 1, fundos: [], sugestoes: [], total: 0 };
  });
  const slot = (iso) => {
    if (!iso) return null;
    const [yy, mm] = parts(iso);
    return months.find((x) => x.y === yy && x.m === mm) || null;
  };
  for (const f of db.funds.filter((x) => x.ativo !== false && x.tipo !== 'longoPrazo')) {
    const s = slot(f.proximaData);
    if (s) { s.fundos.push(f); s.total += f.valorAlvo; }
  }
  const active = new Set(db.funds.filter((x) => x.ativo !== false).map((x) => x.templateId));
  for (const t of db.seasonalTemplates.filter((x) => x.tipo !== 'longoPrazo' && !active.has(x.id))) {
    const s = slot(templateNextDate(t, today));
    if (s) s.sugestoes.push({ ...t, valor: templateAmount(db, t) });
  }
  const totals = months.map((x) => x.total).filter(Boolean);
  const media = totals.length ? totals.reduce((a, b) => a + b, 0) / 12 : 0;
  const top = [...months].filter((x) => x.total > 0).sort((a, b) => b.total - a.total).slice(0, 3);
  for (const x of months) x.pesado = x.total > 0 && (x.total >= media * 1.5 || top.includes(x));
  return { months, media };
}
