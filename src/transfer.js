// Transferência de dados entre dispositivos (APK ↔ web) pelo ficheiro .json completo. Funções puras.
// - A exportação não leva o hash do PIN (um PIN de 4–8 dígitos com hash adivinha-se depressa) e cada
//   dispositivo mantém o seu bloqueio, tema e notificações.
// - A importação valida o schemaVersion, mostra o que vai ser substituído e o store faz backup antes.

import { CURRENT_VERSION, migrate, validate } from './migrations.js';

/** Preferências que pertencem ao dispositivo e não viajam no ficheiro. */
const DEVICE_SETTINGS = ['bloqueio', 'tema'];

/** JSON completo para exportar, com a origem registada em meta.exportacao. */
export function prepareExport(db, { plataforma, versaoApp, agora = new Date() }) {
  const out = structuredClone(db);
  out.settings.bloqueio = { ativo: false, biometria: true, pinHash: null, pinSalt: null };
  delete out.meta.seedBackup;
  out.meta.exportacao = { plataforma, versaoApp, exportadoEm: agora.toISOString(), schemaVersion: db.schemaVersion };
  return JSON.stringify(out, null, 2);
}

/** Resumo de uma base de dados para a pré-visualização. */
export function summarize(db) {
  const datas = (db.transactions || []).map((t) => t.data).filter(Boolean).sort();
  const n = (k) => (Array.isArray(db[k]) ? db[k].length : 0);
  return {
    movimentos: n('transactions'), contas: n('accounts'), categorias: n('categories'), metas: n('goals'),
    fundos: n('funds'), dividas: n('debts'), recorrentes: n('recurring'),
    primeiro: datas[0] || null, ultimo: datas.at(-1) || null,
    atualizadoEm: db.meta?.atualizadoEm || null,
    salario: db.household?.salarioLiquido ?? null
  };
}

/**
 * Lê e valida um ficheiro de cópia. Não altera nada.
 * Devolve { ok: true, db, origem, versaoFicheiro, precisaMigracao, atual, novo } ou { ok: false, erro }.
 */
export function inspectImport(current, text) {
  let raw;
  try {
    raw = JSON.parse(String(text).replace(/^﻿/, ''));
  } catch {
    return { ok: false, erro: 'O ficheiro não é um JSON válido (pode estar incompleto ou corrompido).' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, erro: 'O ficheiro não é uma cópia da POPA.' };
  if (!Array.isArray(raw.transactions) || !Array.isArray(raw.accounts)) return { ok: false, erro: 'O ficheiro não é uma cópia completa da POPA (faltam movimentos ou contas).' };
  const versaoFicheiro = raw.schemaVersion ?? 0;
  if (typeof versaoFicheiro !== 'number' || versaoFicheiro < 0) return { ok: false, erro: 'Versão do ficheiro desconhecida.' };
  if (versaoFicheiro > CURRENT_VERSION) {
    return { ok: false, erro: `Esta cópia foi criada por uma versão mais recente da app (esquema v${versaoFicheiro}; esta app usa v${CURRENT_VERSION}). Atualize esta app (APK ou página web) e tente de novo.` };
  }
  let db;
  try {
    db = validate(migrate(structuredClone(raw)));
  } catch (e) {
    return { ok: false, erro: e.message };
  }
  return {
    ok: true, db, versaoFicheiro, precisaMigracao: versaoFicheiro < CURRENT_VERSION,
    origem: raw.meta?.exportacao || null,
    atual: summarize(current), novo: summarize(db)
  };
}

/** Base de dados a gravar: a do ficheiro, mantendo as preferências deste dispositivo. */
export function mergeForImport(incoming, current) {
  const db = structuredClone(incoming);
  for (const k of DEVICE_SETTINGS) if (current.settings?.[k] !== undefined) db.settings[k] = structuredClone(current.settings[k]);
  if (db.settings.limites && current.settings?.limites) db.settings.limites.notificacoes = current.settings.limites.notificacoes;
  delete db.meta.exportacao;
  return db;
}
