// Migrações do db.json. Cada entrada `steps[n]` converte uma base de dados da versão n para n+1.
// Para alterar o esquema: incrementar CURRENT_VERSION e acrescentar o passo correspondente.
// Regra: uma migração só acrescenta ou completa campos; nunca apaga movimentos, contas ou metas.

import { defaultTemplates } from './templates.js';

export const CURRENT_VERSION = 2;

export function defaultSettings() {
  return {
    moeda: 'CVE',
    casasDecimais: 2,
    primeiroDiaDoMes: 1,
    tema: 'auto',
    contaPorDefeito: null,
    seedAtivo: false,
    bloqueio: { ativo: false, biometria: true, pinHash: null, pinSalt: null }
  };
}

/** Limites editáveis (v2). */
export function defaultLimites() {
  return {
    racioVerde: 20,             // % das prestações no salário: até aqui verde
    racioAmarelo: 30,           // até aqui amarelo; acima, vermelho
    dinheiroDiaCritico: null,   // centavos/dia; abaixo disto ativa a "semana crítica" (null = desligado)
    diaAlertaRitmo: 10,         // a partir deste dia do ciclo avisa se o ritmo de gasto não chega ao fim
    toleranciaServicosPct: 15,  // variação aceite no telefone/internet
    diasAvisoPrePago: 2,        // avisar quando faltam N dias para acabar a luz/água/gás
    revisaoSemanalDia: 0,       // 0 = domingo
    revisaoHora: '19:00',
    notificacoes: false
  };
}

export function defaultHousehold() {
  return {
    salarioLiquido: 0,
    diaPagamento: null,         // null = usa settings.primeiroDiaDoMes
    contaSalarioId: null,
    pessoas: 1,
    dependentes: 0,
    filhos: [],                 // { id, nome, anoNascimento, escolar }
    ilha: '',
    concelho: '',
    rendimentosExtra: [],       // { id, descricao, tipo: 'biscate'|'venda'|'remessa'|'outro', valorMensal }
    // Valores legais, fiscais e preços de referência: SEMPRE editáveis, nunca fixos no código.
    parametros: {
      taxaIRS: null, taxaINPS: null, taxaJuroReferencia: null,
      precoBotija: null, precoKwh: null, precoAguaM3: null,
      cestaSemanalPorPessoa: null
    }
  };
}

export function defaultEmergencyFund() {
  return { etapasMeses: [1, 3, 6], percentagemSalario: 10, contaId: null, baseMensalManual: null, planoReposicao: null };
}

export const COLLECTIONS = ['accounts', 'categories', 'transactions', 'recurring', 'goals'];
export const COLLECTIONS_V2 = ['debts', 'funds', 'allocations', 'seasonalTemplates', 'utilityLogs', 'extraIncomeRules', 'scenarios'];

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Classificação das categorias pelo nome (editável depois em Categorias). */
const CLASSIFICACAO = [
  [/supermerc|aliment|mercearia|comida|cesta/, 'essencial', 'alimentacao'],
  [/^casa$|renda|habita|condominio/, 'essencial', 'casa'],
  [/eletric|electric|^luz|agua|energia/, 'essencial', 'energia'],
  [/^gas$|botija/, 'essencial', 'gas'],
  [/transport/, 'essencial', 'transporte'],
  [/saude|farmac|medic/, 'essencial', 'saude'],
  [/educa|escola|propina/, 'essencial', 'escola'],
  [/comunica|telefon|internet|telemovel/, 'essencial', 'comunicacoes'],
  [/prestac|divida|credito|emprestimo/, 'essencial', 'dividas'],
  [/ajuda|familiar/, 'familia', null]
];

export const NOVAS_CATEGORIAS = [
  { nome: 'Eletricidade e água', tipo: 'despesa', cor: '#F3A712', icone: '⚡', nivel: 'essencial', essencialTipo: 'energia' },
  { nome: 'Gás', tipo: 'despesa', cor: '#F76707', icone: '🔥', nivel: 'essencial', essencialTipo: 'gas' },
  { nome: 'Prestações e dívidas', tipo: 'despesa', cor: '#495057', icone: '💳', nivel: 'essencial', essencialTipo: 'dividas' },
  { nome: 'Ajuda a familiares', tipo: 'despesa', cor: '#E64980', icone: '❤️', nivel: 'familia', essencialTipo: null },
  { nome: 'Remessas recebidas', tipo: 'receita', cor: '#1098AD', icone: '🌍', origem: 'extra' },
  { nome: 'Biscates e vendas', tipo: 'receita', cor: '#5C940D', icone: '🔧', origem: 'extra' }
];

function classify(c) {
  if (c.tipo === 'receita') return { origem: /salario|ordenado|vencimento/.test(norm(c.nome)) ? 'salario' : 'extra' };
  const hit = CLASSIFICACAO.find(([re]) => re.test(norm(c.nome)));
  return hit ? { nivel: hit[1], essencialTipo: hit[2] } : { nivel: 'livre', essencialTipo: null };
}

const uid = () => globalThis.crypto.randomUUID();

const steps = {
  // v0 → v1: ficheiros sem schemaVersion (ou incompletos) são normalizados para a v1.
  0(db) {
    for (const c of COLLECTIONS) if (!Array.isArray(db[c])) db[c] = [];
    const s = defaultSettings();
    db.settings = { ...s, ...(db.settings || {}), bloqueio: { ...s.bloqueio, ...(db.settings?.bloqueio || {}) } };
    db.meta = { criadoEm: new Date().toISOString(), atualizadoEm: null, ultimoBackup: null,
      ultimaVerificacaoRecorrencias: null, ...(db.meta || {}) };
    return db;
  },

  // v1 → v2: conselheiro financeiro (perfil, cascata, fundos, dívidas, consumos, regras, cenários).
  1(db) {
    for (const c of COLLECTIONS_V2) if (!Array.isArray(db[c])) db[c] = [];
    db.household = { ...defaultHousehold(), ...(db.household || {}) };
    db.household.parametros = { ...defaultHousehold().parametros, ...(db.household.parametros || {}) };
    if (db.household.diaPagamento == null && db.settings.primeiroDiaDoMes > 1) db.household.diaPagamento = db.settings.primeiroDiaDoMes;
    db.emergencyFund = { ...defaultEmergencyFund(), ...(db.emergencyFund || {}) };
    db.settings.limites = { ...defaultLimites(), ...(db.settings.limites || {}) };
    db.settings.dividas = { metodo: 'avalanche', extraMensal: 0, ...(db.settings.dividas || {}) };
    db.advice = { ciclos: {}, revisoes: [], ...(db.advice || {}) };

    for (const c of db.categories) {
      const k = classify(c);
      if (c.tipo === 'receita') c.origem ??= k.origem;
      else { c.nivel ??= k.nivel; c.essencialTipo ??= k.essencialTipo; }
    }
    for (const n of NOVAS_CATEGORIAS) {
      const exists = db.categories.some((c) => c.tipo === n.tipo &&
        (n.essencialTipo ? c.essencialTipo === n.essencialTipo : n.nivel ? c.nivel === n.nivel : norm(c.nome) === norm(n.nome)));
      if (!exists) {
        db.categories.push({ id: uid(), orcamentoMensal: null, favorita: false, arquivada: false,
          ordem: db.categories.filter((c) => c.tipo === n.tipo).length, ...n });
      }
    }
    if (!db.seasonalTemplates.length) db.seasonalTemplates = defaultTemplates();
    if (!db.extraIncomeRules.length) {
      db.extraIncomeRules.push({ id: uid(), nome: 'Regra 50/30/20', fundosDividas: 50, emergenciaMetas: 30, livre: 20, ativa: true });
    }
    for (const g of db.goals) g.horizonte ??= 'curto';
    return db;
  }
};

export function needsMigration(db) {
  return (db.schemaVersion ?? 0) < CURRENT_VERSION;
}

/** Aplica, por ordem, todos os passos em falta. Altera e devolve o próprio objeto. */
export function migrate(db, stepTable = steps, target = CURRENT_VERSION) {
  if (!db || typeof db !== 'object' || Array.isArray(db)) throw new Error('Ficheiro inválido: não é um objeto JSON.');
  let v = db.schemaVersion ?? 0;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw new Error('Ficheiro inválido: schemaVersion desconhecido.');
  if (v > target) throw new Error(`Ficheiro criado por uma versão mais recente da app (esquema v${v}). Atualize esta app antes de importar.`);
  while (v < target) {
    const step = stepTable[v];
    if (!step) throw new Error(`Falta a migração v${v} → v${v + 1}.`);
    db = step(db) || db;
    v += 1;
    db.schemaVersion = v;
  }
  return db;
}

/** Validação estrutural mínima, usada ao carregar e ao importar. */
export function validate(db) {
  for (const c of COLLECTIONS) if (!Array.isArray(db[c])) throw new Error(`Ficheiro inválido: falta "${c}".`);
  if (!db.settings || typeof db.settings !== 'object') throw new Error('Ficheiro inválido: falta "settings".');
  if ((db.schemaVersion ?? 0) >= 2) {
    for (const c of COLLECTIONS_V2) if (!Array.isArray(db[c])) throw new Error(`Ficheiro inválido: falta "${c}".`);
    if (!db.household || !db.emergencyFund) throw new Error('Ficheiro inválido: falta o perfil do agregado.');
  }
  return db;
}
