import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore, createEmptyDb, DB_FILE, TMP_FILE, KEEP_BACKUPS } from '../src/store.js';
import { CURRENT_VERSION } from '../src/migrations.js';
import { ADAPTERS, memoryIO, fakeClock } from './helpers.js';

const V1 = readFileSync(new URL('./fixtures/db-v1.json', import.meta.url), 'utf8');

// Os mesmos testes correm sobre o ficheiro (APK) e sobre o IndexedDB (web).
for (const adapter of ADAPTERS) {
  describe(`store.js — ${adapter.name}`, () => {
    const setup = async (files = {}, iso = '2026-10-15T10:00:00') => {
      const io = await adapter.make(files);
      const clock = fakeClock(iso);
      const store = createStore({ io, debounceMs: 5, now: clock.now });
      return { io, clock, store };
    };
    const disk = async (io, p = DB_FILE) => JSON.parse(await io.read(p));
    const backups = async (io, prefix = 'db-') => (await io.list('backups')).filter((f) => f.startsWith(prefix));

    test('primeira execução cria a base de dados na versão atual, com backup do dia', async () => {
      const { io, store } = await setup();
      const r = await store.init();
      assert.equal(r.created, true);
      const db = await disk(io);
      assert.equal(db.schemaVersion, CURRENT_VERSION);
      assert.equal(db.accounts.length, 1);
      assert.ok(Array.isArray(db.debts) && db.household && db.emergencyFund);
      assert.deepEqual(await backups(io), ['db-2026-10-15.json']);
      assert.equal(await io.read(TMP_FILE), null);
    });

    test('update grava com debounce e agrupa várias alterações numa escrita', async () => {
      const { io, store } = await setup();
      await store.init();
      let writes = 0;
      const w = io.write.bind(io);
      io.write = async (p, t) => { if (p === TMP_FILE) writes++; return w(p, t); };
      store.update((db) => { db.goals.push({ id: 'g1' }); });
      store.update((db) => { db.goals.push({ id: 'g2' }); });
      assert.equal((await disk(io)).goals.length, 0, 'ainda não gravou');
      await store.flush();
      assert.equal((await disk(io)).goals.length, 2);
      assert.equal(writes, 1);
    });

    test('escrita interrompida: o .tmp completo e mais recente é recuperado no arranque', async () => {
      const old = createEmptyDb(new Date('2026-10-14T10:00:00Z'));
      const newer = structuredClone(old);
      newer.meta.atualizadoEm = '2026-10-14T11:00:00.000Z';
      newer.goals.push({ id: 'novo' });
      const { io, store } = await setup({ [DB_FILE]: JSON.stringify(old), [TMP_FILE]: JSON.stringify(newer) });
      await store.init();
      assert.equal(store.get().goals.length, 1);
      assert.equal((await disk(io)).goals.length, 1);
      assert.equal(await io.read(TMP_FILE), null, 'o .tmp foi consolidado');
    });

    test('escrita interrompida a meio do .tmp: o .tmp truncado é ignorado', async () => {
      const db = createEmptyDb();
      const { store } = await setup({ [DB_FILE]: JSON.stringify(db), [TMP_FILE]: JSON.stringify(db).slice(0, 40) });
      await store.init();
      assert.equal(store.get().accounts[0].id, db.accounts[0].id);
    });

    test('db.json corrompido é recuperado a partir do backup mais recente', async () => {
      const b1 = createEmptyDb(); b1.goals = [{ id: 'antigo' }];
      const b2 = createEmptyDb(); b2.goals = [{ id: 'recente' }];
      const { store } = await setup({
        [DB_FILE]: 'lixo',
        'backups/db-2026-10-10.json': JSON.stringify(b1),
        'backups/db-2026-10-12.json': JSON.stringify(b2)
      });
      const r = await store.init();
      assert.equal(r.recovered, 'db-2026-10-12.json');
      assert.equal(store.get().goals[0].id, 'recente');
    });

    test('backup diário: um por dia, mantém os últimos 30', async () => {
      const files = {};
      for (let d = 1; d <= 35; d++) files[`backups/db-${new Date(Date.UTC(2026, 8, d)).toISOString().slice(0, 10)}.json`] = '{}';
      const { io, clock, store } = await setup(files);
      await store.init();
      let daily = await backups(io);
      assert.equal(daily.length, KEEP_BACKUPS);
      assert.ok(daily.includes('db-2026-10-15.json'));

      store.update((db) => { db.goals.push({ id: 'x' }); });
      await store.flush();
      assert.equal((await backups(io)).length, KEEP_BACKUPS, 'mesmo dia: sem novo backup');

      clock.set('2026-10-16T09:00:00');
      store.update((db) => { db.goals.push({ id: 'y' }); });
      await store.flush();
      daily = await backups(io);
      assert.ok(daily.includes('db-2026-10-16.json'));
      assert.equal(daily.length, KEEP_BACKUPS);
    });

    test('migração v1 → v2 preserva os dados e guarda backup pré-migração', async () => {
      const { io, store } = await setup({ [DB_FILE]: V1 });
      await store.init();
      const db = store.get();
      const v1 = JSON.parse(V1);
      assert.equal(db.schemaVersion, 2);
      // Nada do que existia se perde
      assert.deepEqual(db.transactions, v1.transactions);
      assert.deepEqual(db.accounts, v1.accounts);
      assert.deepEqual(db.recurring, v1.recurring);
      assert.equal(db.goals[0].valorAtual, 1200000);
      assert.deepEqual(db.settings.bloqueio, v1.settings.bloqueio);
      assert.equal(db.settings.tema, 'escuro');
      for (const c of v1.categories) assert.ok(db.categories.some((x) => x.id === c.id && x.nome === c.nome && x.orcamentoMensal === c.orcamentoMensal));
      // Novos campos
      assert.equal(db.household.diaPagamento, 25, 'o dia 25 passa a ser o dia do salário');
      assert.equal(db.categories.find((c) => c.id === 'c-super').essencialTipo, 'alimentacao');
      assert.equal(db.categories.find((c) => c.id === 'c-lazer').nivel, 'livre');
      assert.equal(db.categories.find((c) => c.id === 'c-sal').origem, 'salario');
      assert.ok(db.categories.some((c) => c.essencialTipo === 'gas'));
      assert.ok(db.categories.some((c) => c.nivel === 'familia'));
      assert.equal(db.extraIncomeRules.length, 1);
      assert.equal(db.settings.limites.racioAmarelo, 30);
      // Backup do ficheiro original, tal como estava
      const pre = (await io.list('backups')).find((f) => f.startsWith('pre-migracao-v1-'));
      assert.ok(pre);
      assert.deepEqual(JSON.parse(await io.read(`backups/${pre}`)), v1);
    });

    test('replaceAll importa, migra e guarda backup do estado anterior', async () => {
      const { io, store } = await setup();
      await store.init();
      const before = store.get().accounts[0].id;
      await store.replaceAll(V1);
      assert.equal(store.get().accounts[0].id, 'acc-carteira');
      assert.equal(store.get().schemaVersion, 2);
      assert.equal((await disk(io)).accounts[0].id, 'acc-carteira');
      const pre = (await io.list('backups')).find((f) => f.startsWith('pre-importacao-'));
      assert.equal(JSON.parse(await io.read(`backups/${pre}`)).accounts[0].id, before);
    });

    test('replaceAll rejeita ficheiros inválidos sem alterar os dados', async () => {
      const { store } = await setup();
      await store.init();
      const id = store.get().accounts[0].id;
      await assert.rejects(store.replaceAll('[1,2,3]'));
      await assert.rejects(store.replaceAll({ schemaVersion: 999 }), /mais recente/);
      assert.equal(store.get().accounts[0].id, id);
    });

    test('falha de escrita não bloqueia gravações seguintes', async () => {
      const { io, store } = await setup();
      await store.init();
      const w = io.write.bind(io);
      io.write = async () => { throw new Error('disco cheio'); };
      store.update((db) => { db.goals.push({ id: 'a' }); });
      await assert.rejects(store.flush(), /disco cheio/);
      assert.ok(store.lastError);
      io.write = w;
      store.update((db) => { db.goals.push({ id: 'b' }); });
      await store.flush();
      assert.equal((await disk(io)).goals.length, 2);
      assert.equal(store.lastError, null);
    });
  });
}

test('ficheiro: rename que não substitui o destino é tratado', async () => {
  const io = memoryIO();
  const store = createStore({ io, debounceMs: 5 });
  await store.init();
  io.failRename = true;
  store.update((db) => { db.settings.tema = 'escuro'; });
  await store.flush();
  assert.equal(JSON.parse(io.files.get(DB_FILE)).settings.tema, 'escuro');
  assert.ok(!io.files.has(TMP_FILE));
});
