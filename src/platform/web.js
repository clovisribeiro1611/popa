// Plataforma web (PWA): IndexedDB, descarregar ficheiros, Notification API e service worker.
// Sem biometria (só PIN). As notificações só podem aparecer com a app aberta (não há servidor push);
// por isso os lembretes também são mostrados num painel dentro da app.

import { idbIO } from '../storage.js';

/* global __PWA__ */
const PWA = typeof __PWA__ !== 'undefined' && __PWA__;
const SHOWN_KEY = 'popa.notificacoesMostradas';

const updateListeners = new Set();
let waitingWorker = null;

function announceUpdate(worker) {
  waitingWorker = worker;
  updateListeners.forEach((fn) => fn());
}

// Este módulo é carregado com import() dinâmico: o evento "load" pode já ter passado.
const whenLoaded = (fn) => (document.readyState === 'complete' ? fn() : window.addEventListener('load', fn, { once: true }));

if (PWA && 'serviceWorker' in navigator) {
  whenLoaded(async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      if (reg.waiting && navigator.serviceWorker.controller) announceUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          // Só é "versão nova" se já havia uma a controlar a página (na 1.ª instalação não se avisa).
          if (w.state === 'installed' && navigator.serviceWorker.controller) announceUpdate(w);
        });
      });
      // Procurar atualizações quando a app volta a ficar visível.
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    } catch { /* sem service worker a app continua a funcionar online */ }
  });
}

function readShown() {
  try { return new Set(JSON.parse(localStorage.getItem(SHOWN_KEY) || '[]')); } catch { return new Set(); }
}
function writeShown(set) {
  try { localStorage.setItem(SHOWN_KEY, JSON.stringify([...set].slice(-200))); } catch { /* opcional */ }
}

export const platform = {
  name: 'web',
  io: idbIO(globalThis.indexedDB, 'popa'),
  caps: { biometria: false, notificacoesAgendadas: false, partilha: false, persistencia: true, atualizacoes: PWA },

  async saveFile(name, text, mime = 'application/octet-stream') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return 'descarregado';
  },

  biometry: { available: async () => false, authenticate: async () => false },

  notifications: {
    async status() {
      if (!('Notification' in globalThis)) return 'unsupported';
      return Notification.permission === 'default' ? 'prompt' : Notification.permission;
    },
    async request() {
      if (!('Notification' in globalThis)) return 'unsupported';
      const p = await Notification.requestPermission();
      return p === 'default' ? 'prompt' : p;
    },
    /** Mostra já os lembretes cuja hora passou e que ainda não foram mostrados (sem agendamento na web). */
    async sync(reminders) {
      if ((await this.status()) !== 'granted') return;
      const shown = readShown();
      const now = Date.now();
      const reg = PWA && 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
      for (const r of reminders) {
        if (r.quando.getTime() > now || shown.has(r.id)) continue;
        try {
          if (reg) await reg.showNotification(r.titulo, { body: r.texto, tag: r.id, icon: './icons/icon-192.png' });
          else new Notification(r.titulo, { body: r.texto, tag: r.id });
          shown.add(r.id);
        } catch { /* alguns navegadores só permitem via service worker */ }
      }
      writeShown(shown);
    }
  },

  lifecycle: {
    onPause: (fn) => {
      document.addEventListener('visibilitychange', () => { if (document.hidden) fn(); });
      window.addEventListener('pagehide', fn);
    },
    onResume: (fn) => document.addEventListener('visibilitychange', () => { if (!document.hidden) fn(); }),
    onBack: () => {}
  },
  setDarkBars: () => {},
  hideSplash: () => {},
  minimize: () => {},

  /** Pede ao navegador para não apagar os dados automaticamente. */
  async requestPersistence() {
    if (!navigator.storage?.persist) return { supported: false, persistent: false };
    try {
      if (await navigator.storage.persisted()) return { supported: true, persistent: true };
      // Alguns navegadores deixam o pedido pendente; sem resposta em 3 s conta como não garantido.
      const timeout = new Promise((r) => setTimeout(() => r(false), 3000));
      return { supported: true, persistent: await Promise.race([navigator.storage.persist(), timeout]) };
    } catch {
      return { supported: true, persistent: false };
    }
  },

  updates: {
    onAvailable(fn) {
      updateListeners.add(fn);
      if (waitingWorker) fn();
    },
    /** Ativa a versão nova e recarrega (chamado depois de gravar os dados pendentes). */
    apply() {
      if (!waitingWorker) return location.reload();
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
  }
};
