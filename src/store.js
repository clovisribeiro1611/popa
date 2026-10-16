// Único ponto de acesso aos dados. Mantém a base de dados em memória e grava-a com debounce,
// escrita atómica (tmp + rename), recuperação e backups diários.
//
// O armazenamento é injetado (`io`, ver storage.js): ficheiro db.json no APK, IndexedDB na web,
// memória nos testes. Este módulo não sabe em que plataforma está.

import { defaultSettings, migrate, needsMigration, validate } from './migrations.js';
import { lazyIO } from './storage.js';

export const DB_FILE = 'db.json';
export const TMP_FILE = 'db.json.tmp';
export const BACKUP_DIR = 'backups';
export const KEEP_BACKUPS = 30;

export const newId = () => globalThis.crypto.randomUUID();

/** Data local no formato YYYY-MM-DD. */
export function isoDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function createEmptyDb(now = new Date()) {
  const conta = { id: newId(), nome: 'Carteira', tipo: 'numerario', saldoInicial: 0, arquivada: false, ordem: 0 };
  const cat = (nome, tipo, cor, icone, ordem, favorita = false) =>
    ({ id: newId(), nome, tipo, cor, icone, orcamentoMensal: null, favorita, arquivada: false, ordem });
  // Criada como v1 e migrada: os valores por defeito das versões seguintes vêm só de migrations.js.
  return migrate({
    schemaVersion: 1,
    meta: { criadoEm: now.toISOString(), atualizadoEm: now.toISOString(), ultimoBackup: null, ultimaVerificacaoRecorrencias: null },
    settings: { ...defaultSettings(), contaPorDefeito: conta.id },
    accounts: [conta],
    categories: [
      cat('Supermercado', 'despesa', '#E4572E', '🛒', 0, true),
      cat('Restauração', 'despesa', '#F3A712', '🍽️', 1, true),
      cat('Transportes', 'despesa', '#4C6EF5', '🚌', 2, true),
      cat('Casa', 'despesa', '#7950F2', '🏠', 3, true),
      cat('Saúde', 'despesa', '#E64980', '💊', 4),
      cat('Educação', 'despesa', '#1098AD', '📚', 5),
      cat('Lazer', 'despesa', '#12B886', '🎉', 6),
      cat('Comunicações', 'despesa', '#868E96', '📱', 7),
      cat('Outras despesas', 'despesa', '#495057', '📦', 8),
      cat('Salário', 'receita', '#2B8A3E', '💼', 0, true),
      cat('Outras receitas', 'receita', '#5C940D', '💰', 1)
    ],
    transactions: [],
    recurring: [],
    goals: []
  });
}

function parseDb(text) {
  if (!text) return null;
  try {
    const db = JSON.parse(text);
    return db && typeof db === 'object' && !Array.isArray(db) ? db : null;
  } catch {
    return null;
  }
}

export function createStore({ io, debounceMs = 400, now = () => new Date() }) {
  let db = null;
  let timer = null;
  let chain = Promise.resolve();   // serializa as escritas
  let lastError = null;
  const listeners = new Set();

  const notify = () => listeners.forEach((fn) => fn(db));

  async function writeAtomic(text) {
    await io.write(TMP_FILE, text);
    try {
      await io.rename(TMP_FILE, DB_FILE);
    } catch {
      // Algumas implementações não substituem o destino; o .tmp completo cobre esta janela no arranque.
      await io.remove(DB_FILE).catch(() => {});
      await io.rename(TMP_FILE, DB_FILE);
    }
  }

  async function writeBackup(name, text) {
    await io.mkdir(BACKUP_DIR).catch(() => {});
    await io.write(`${BACKUP_DIR}/${name}`, text);
  }

  async function pruneBackups() {
    const files = (await io.list(BACKUP_DIR).catch(() => []))
      .filter((f) => /^db-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort();
    for (const f of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) {
      await io.remove(`${BACKUP_DIR}/${f}`).catch(() => {});
    }
  }

  /** Backup diário do estado atual (no máximo um por dia). */
  async function dailyBackup() {
    const today = isoDate(now());
    if (db.meta.ultimoBackup === today) return false;
    db.meta.ultimoBackup = today;
    const text = JSON.stringify(db);
    await writeBackup(`db-${today}.json`, text);
    await writeAtomic(text);
    await pruneBackups();
    return true;
  }

  async function persist() {
    timer = null;
    db.meta.atualizadoEm = now().toISOString();
    try {
      await writeAtomic(JSON.stringify(db));
      await dailyBackup();
      lastError = null;
    } catch (e) {
      lastError = e;
      throw e;
    }
  }

  // Encadeia uma gravação; uma falha não bloqueia as seguintes.
  function enqueue() {
    const p = chain.then(persist);
    chain = p.catch(() => {});
    return p;
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => { enqueue().catch(() => {}); }, debounceMs);
  }

  async function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      return enqueue();
    }
    return chain;
  }

  /** Lê db.json (ou .tmp, ou o último backup), migra se necessário e faz o backup diário. */
  async function init() {
    const main = parseDb(await io.read(DB_FILE).catch(() => null));
    const tmp = parseDb(await io.read(TMP_FILE).catch(() => null));
    let loaded = main;
    if (tmp && (!main || (tmp.meta?.atualizadoEm || '') > (main.meta?.atualizadoEm || ''))) loaded = tmp;

    let recovered = false;
    if (!loaded) {
      const backups = (await io.list(BACKUP_DIR).catch(() => [])).filter((f) => f.endsWith('.json')).sort().reverse();
      for (const f of backups) {
        loaded = parseDb(await io.read(`${BACKUP_DIR}/${f}`).catch(() => null));
        if (loaded) { recovered = f; break; }
      }
    }

    let dirty = loaded !== main || recovered;
    if (!loaded) {
      loaded = createEmptyDb(now());
      dirty = true;
    } else if (needsMigration(loaded)) {
      await writeBackup(`pre-migracao-v${loaded.schemaVersion ?? 0}-${isoDate(now())}.json`, JSON.stringify(loaded));
      migrate(loaded);
      dirty = true;
    }
    db = validate(loaded);
    if (dirty) await writeAtomic(JSON.stringify(db));
    await dailyBackup();
    notify();
    return { recovered, created: !main && !tmp && !recovered };
  }

  return {
    init,
    /** Estado atual em memória. Tratar como só de leitura: alterações só via update(). */
    get: () => db,
    /** Aplica `fn(db)` à cópia em memória, notifica e agenda a gravação. Devolve o resultado de fn. */
    update(fn) {
      const result = fn(db);
      schedule();
      notify();
      return result;
    },
    /** Grava imediatamente o que estiver pendente (usar quando a app vai para segundo plano). */
    flush,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Substitui toda a base de dados (importação/restauro), com backup prévio do estado atual. */
    async replaceAll(newDb, label = 'pre-importacao') {
      const incoming = validate(migrate(typeof newDb === 'string' ? JSON.parse(newDb) : newDb));
      await flush();
      const stamp = now().toISOString().replace(/[:.]/g, '-');
      await writeBackup(`${label}-${stamp}.json`, JSON.stringify(db));
      db = incoming;
      db.meta.atualizadoEm = now().toISOString();
      await writeAtomic(JSON.stringify(db));
      notify();
    },
    async listBackups() {
      return (await io.list(BACKUP_DIR).catch(() => [])).filter((f) => f.endsWith('.json')).sort().reverse();
    },
    async readBackup(name) {
      return io.read(`${BACKUP_DIR}/${name}`);
    },
    exportJson: () => JSON.stringify(db, null, 2),
    get lastError() { return lastError; }
  };
}

/** Instância usada pela app; o armazenamento vem da camada de plataforma. */
export const store = createStore({ io: lazyIO(async () => (await import('./platform/index.js')).platform.io) });
