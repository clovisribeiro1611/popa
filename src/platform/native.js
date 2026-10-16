// Plataforma Android (Capacitor): ficheiro db.json, folha de partilha, biometria e notificações locais.

import { App } from '@capacitor/app';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';
import { LocalNotifications } from '@capacitor/local-notifications';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { fileIO } from '../storage.js';

const CHANNEL = 'lembretes';
let channelReady = false;

// IDs numéricos estáveis a partir do id textual do lembrete (o plugin exige inteiros de 32 bits).
const numericId = (s) => {
  let h = 0;
  for (const ch of s) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0;
  return Math.abs(h) % 2_000_000_000;
};

export const platform = {
  name: 'android',
  io: fileIO({ Filesystem, Directory, Encoding }),
  caps: { biometria: true, notificacoesAgendadas: true, partilha: true, persistencia: false, atualizacoes: false },

  async saveFile(name, text) {
    const path = `exports/${name}`;
    await Filesystem.writeFile({ path, data: text, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true });
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
    try {
      await Share.share({ title: name, files: [uri], dialogTitle: 'Guardar ou enviar' });
    } catch (e) {
      if (/cancel/i.test(e?.message || '')) return 'cancelado';
      throw e;
    }
    return 'partilhado';
  },

  biometry: {
    async available() {
      try { return (await BiometricAuth.checkBiometry()).isAvailable; } catch { return false; }
    },
    async authenticate(reason) {
      try {
        await BiometricAuth.authenticate({
          reason, cancelTitle: 'Usar PIN', androidTitle: 'Desbloquear POPA',
          androidSubtitle: 'Use a impressão digital ou o rosto', allowDeviceCredential: false
        });
        return true;
      } catch {
        return false;
      }
    }
  },

  notifications: {
    async status() {
      try { return (await LocalNotifications.checkPermissions()).display; } catch { return 'unsupported'; }
    },
    async request() {
      try { return (await LocalNotifications.requestPermissions()).display; } catch { return 'denied'; }
    },
    /** Substitui todas as notificações agendadas pelos lembretes indicados ({ id, quando: Date, titulo, texto }). */
    async sync(reminders) {
      if ((await this.status()) !== 'granted') return;
      if (!channelReady) {
        await LocalNotifications.createChannel({ id: CHANNEL, name: 'Lembretes', importance: 3 }).catch(() => {});
        channelReady = true;
      }
      const pending = (await LocalNotifications.getPending()).notifications;
      if (pending.length) await LocalNotifications.cancel({ notifications: pending.map((n) => ({ id: n.id })) });
      const now = Date.now();
      const list = reminders.filter((r) => r.quando.getTime() > now + 60_000).slice(0, 60).map((r) => ({
        id: numericId(r.id), title: r.titulo, body: r.texto, channelId: CHANNEL, smallIcon: 'ic_stat_popa',
        schedule: { at: r.quando, allowWhileIdle: true }
      }));
      if (list.length) await LocalNotifications.schedule({ notifications: list });
    }
  },

  lifecycle: {
    onPause: (fn) => App.addListener('pause', fn),
    onResume: (fn) => App.addListener('resume', fn),
    onBack: (fn) => App.addListener('backButton', fn)
  },
  setDarkBars: (dark) => SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {}),
  hideSplash: () => SplashScreen.hide().catch(() => {}),
  minimize: () => App.minimizeApp(),
  // No APK os dados estão num ficheiro da pasta privada: não há limpeza automática pelo sistema.
  requestPersistence: async () => ({ supported: true, persistent: true }),
  updates: { onAvailable() {}, apply() {} }
};
