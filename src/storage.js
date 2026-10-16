// Adaptadores de armazenamento com a mesma interface, usados pelo store.js:
//   read(path) -> string | null, write(path, text), rename(from, to), remove(path),
//   list(dir) -> string[], mkdir(dir)
// As dependências (plugin Filesystem, indexedDB) são injetadas para poderem ser testadas em Node.

/** Ficheiros na pasta privada da app (Android), via @capacitor/filesystem. */
export function fileIO({ Filesystem, Directory, Encoding }) {
  const dir = Directory.Data;
  const utf8 = Encoding.UTF8;
  return {
    async read(path) {
      try {
        return (await Filesystem.readFile({ path, directory: dir, encoding: utf8 })).data;
      } catch {
        return null;
      }
    },
    async write(path, data) {
      await Filesystem.writeFile({ path, data, directory: dir, encoding: utf8, recursive: true });
    },
    async rename(from, to) {
      await Filesystem.rename({ from, to, directory: dir, toDirectory: dir });
    },
    async remove(path) {
      await Filesystem.deleteFile({ path, directory: dir });
    },
    async list(path) {
      return (await Filesystem.readdir({ path, directory: dir })).files.map((f) => (typeof f === 'string' ? f : f.name));
    },
    async mkdir(path) {
      await Filesystem.mkdir({ path, directory: dir, recursive: true });
    }
  };
}

/**
 * "Ficheiros" guardados no IndexedDB do navegador (versão web). Cada caminho é uma chave do
 * object store; `rename` corre numa única transação, por isso é atómico.
 */
export function idbIO(indexedDB, dbName = 'popa') {
  const STORE = 'files';
  let dbp;
  const open = () => (dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const os = t.objectStore(STORE);
      let result;
      Promise.resolve(fn(os, (v) => { result = v; })).catch(reject);
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Transação abortada'));
    });
  };
  const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

  return {
    read: (path) => tx('readonly', async (os, set) => { const v = await req(os.get(path)); set(v ?? null); }),
    write: (path, text) => tx('readwrite', (os) => { os.put(String(text), path); }),
    rename: (from, to) => tx('readwrite', async (os) => {
      const v = await req(os.get(from));
      if (v === undefined) { os.transaction.abort(); throw new Error(`ENOENT: ${from}`); }
      os.put(v, to);
      os.delete(from);
    }),
    remove: (path) => tx('readwrite', async (os) => {
      const exists = (await req(os.count(path))) > 0;
      if (!exists) { os.transaction.abort(); throw new Error(`ENOENT: ${path}`); }
      os.delete(path);
    }),
    list: (dir) => tx('readonly', async (os, set) => {
      const prefix = dir.replace(/\/$/, '') + '/';
      const keys = await req(os.getAllKeys());
      set(keys.filter((k) => typeof k === 'string' && k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
        .map((k) => k.slice(prefix.length)));
    }),
    async mkdir() {}
  };
}

/** Adia a criação do adaptador até à primeira operação (o módulo da plataforma é carregado a pedido). */
export function lazyIO(factory) {
  let p;
  const get = () => (p ??= Promise.resolve().then(factory));
  const call = (name) => async (...args) => (await get())[name](...args);
  return { read: call('read'), write: call('write'), rename: call('rename'), remove: call('remove'), list: call('list'), mkdir: call('mkdir') };
}
