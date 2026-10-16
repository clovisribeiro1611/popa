import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore, newId } from '../src/store.js';
import { prepareExport, inspectImport, mergeForImport } from '../src/transfer.js';
import { addSeed } from '../src/seed.js';
import { memoryIO, memoryIDB } from './helpers.js';

const V1 = readFileSync(new URL('./fixtures/db-v1.json', import.meta.url), 'utf8');
const TODAY = '2026-10-15';

async function device(io, { pin = null, tema = 'auto' } = {}) {
  const store = createStore({ io, debounceMs: 1 });
  await store.init();
  store.update((db) => {
    db.settings.tema = tema;
    if (pin) db.settings.bloqueio = { ativo: true, biometria: false, pinHash: pin, pinSalt: 'c2FsdA==', pinLen: 4 };
  });
  await store.flush();
  return store;
}

test('APK → web: exportar no telemóvel e importar no navegador, com pré-visualização e backup', async () => {
  const apk = await device(memoryIO(), { pin: 'aGFzaEFQSw==', tema: 'escuro' });
  apk.update((db) => addSeed(db, TODAY, newId));
  await apk.flush();
  const ficheiro = prepareExport(apk.get(), { plataforma: 'android', versaoApp: '1.0.42' });
  assert.ok(!ficheiro.includes('aGFzaEFQSw=='), 'o hash do PIN não sai do dispositivo');

  const webIO = await memoryIDB();
  const web = await device(webIO, { pin: 'aGFzaFdFQg==', tema: 'claro' });
  const antes = web.get().accounts.map((a) => a.id);

  const r = inspectImport(web.get(), ficheiro);
  assert.equal(r.ok, true);
  assert.equal(r.origem.plataforma, 'android');
  assert.equal(r.origem.versaoApp, '1.0.42');
  assert.equal(r.precisaMigracao, false);
  assert.equal(r.atual.movimentos, 0);
  assert.equal(r.novo.movimentos, apk.get().transactions.length);
  assert.equal(r.novo.dividas, 2);

  await web.replaceAll(mergeForImport(r.db, web.get()), 'pre-importacao');
  const db = web.get();
  assert.deepEqual(db.transactions, apk.get().transactions);
  assert.deepEqual(db.debts, apk.get().debts);
  assert.deepEqual(db.allocations, apk.get().allocations);
  assert.deepEqual(db.household, apk.get().household);
  assert.equal(db.settings.bloqueio.pinHash, 'aGFzaFdFQg==', 'o navegador mantém o seu próprio PIN');
  assert.equal(db.settings.tema, 'claro', 'e o seu tema');
  assert.equal(db.meta.exportacao, undefined);

  const pre = (await webIO.list('backups')).find((f) => f.startsWith('pre-importacao-'));
  assert.deepEqual(JSON.parse(await webIO.read(`backups/${pre}`)).accounts.map((a) => a.id), antes, 'backup do estado anterior');
  // Persistiu no IndexedDB
  const reloaded = createStore({ io: webIO });
  await reloaded.init();
  assert.equal(reloaded.get().transactions.length, apk.get().transactions.length);
});

test('web → APK: o mesmo ficheiro funciona no sentido inverso', async () => {
  const web = await device(await memoryIDB());
  web.update((db) => { db.goals.push({ id: 'g', nome: 'Casa', valorAlvo: 100, valorAtual: 10 }); });
  const ficheiro = prepareExport(web.get(), { plataforma: 'web', versaoApp: '1.0.7-web' });
  const apkIO = memoryIO();
  const apk = await device(apkIO);
  const r = inspectImport(apk.get(), ficheiro);
  await apk.replaceAll(mergeForImport(r.db, apk.get()));
  assert.equal(apk.get().goals[0].nome, 'Casa');
  assert.equal(JSON.parse(apkIO.files.get('db.json')).goals[0].nome, 'Casa');
});

test('cópia antiga (v1) é aceite e será migrada; versão mais recente é recusada', async () => {
  const cur = (await device(memoryIO())).get();
  const r = inspectImport(cur, V1);
  assert.equal(r.ok, true);
  assert.equal(r.versaoFicheiro, 1);
  assert.equal(r.precisaMigracao, true);
  assert.equal(r.db.schemaVersion, 2);
  assert.equal(r.novo.movimentos, 4);

  const futuro = JSON.stringify({ ...JSON.parse(V1), schemaVersion: 99 });
  const f = inspectImport(cur, futuro);
  assert.equal(f.ok, false);
  assert.match(f.erro, /versão mais recente .* Atualize esta app/);
});

test('ficheiros inválidos não passam da pré-visualização', async () => {
  const cur = (await device(memoryIO())).get();
  assert.match(inspectImport(cur, '{"schemaVersion": 2, "trans').erro, /JSON válido/);
  assert.match(inspectImport(cur, '[1,2]').erro, /não é uma cópia/);
  assert.match(inspectImport(cur, '{"schemaVersion": 2}').erro, /faltam movimentos/);
  assert.match(inspectImport(cur, 'data;valor\n2026-01-01;10').erro, /JSON válido/);
});
