import { IDBFactory } from 'fake-indexeddb';
import { idbIO } from '../src/storage.js';

// Sistema de ficheiros em memória com a mesma interface do adaptador Capacitor.
export function memoryIO(initial = {}) {
  const files = new Map(Object.entries(initial));
  const io = {
    files,
    failRename: false,
    async read(p) { return files.has(p) ? files.get(p) : null; },
    async write(p, t) { files.set(p, t); },
    async rename(a, b) {
      if (!files.has(a)) throw new Error('ENOENT');
      if (io.failRename && files.has(b)) throw new Error('EEXIST');
      files.set(b, files.get(a));
      files.delete(a);
    },
    async remove(p) { if (!files.delete(p)) throw new Error('ENOENT'); },
    async list(dir) {
      return [...files.keys()].filter((k) => k.startsWith(dir + '/')).map((k) => k.slice(dir.length + 1));
    },
    async mkdir() {}
  };
  return io;
}

/** IndexedDB simulado (fake-indexeddb), isolado por chamada. */
export async function memoryIDB(initial = {}) {
  const io = idbIO(new IDBFactory(), 'popa-teste');
  for (const [k, v] of Object.entries(initial)) await io.write(k, v);
  return io;
}

/** Os dois adaptadores de armazenamento da app, para correr os mesmos testes em ambos. */
export const ADAPTERS = [
  { name: 'ficheiro (APK)', make: async (files) => memoryIO(files) },
  { name: 'IndexedDB (web)', make: (files) => memoryIDB(files) }
];

/** Relógio controlável: devolve sempre a data definida em `clock.t`. */
export function fakeClock(iso) {
  const clock = { t: new Date(iso) };
  clock.now = () => new Date(clock.t);
  clock.set = (s) => { clock.t = new Date(s); };
  return clock;
}
