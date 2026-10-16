// Escolhe a implementação da plataforma. O resto da app usa só `platform` e consulta `platform.caps`
// (o que está disponível), nunca o nome da plataforma.
//
// Interface comum:
//   name, io (armazenamento, ver storage.js), caps { biometria, notificacoesAgendadas, partilha, persistencia, atualizacoes }
//   saveFile(nome, texto, mime)            → exportar (folha de partilha no APK, descarregar na web)
//   biometry.available() / authenticate()  → só APK
//   notifications.status() / request() / sync(lembretes)
//   lifecycle.onPause(fn) / onResume(fn) / onBack(fn)
//   setDarkBars(bool), hideSplash(), minimize(), requestPersistence(), updates.onAvailable(fn) / apply()

import { Capacitor } from '@capacitor/core';

const impl = Capacitor.isNativePlatform() ? await import('./native.js') : await import('./web.js');

export const platform = impl.platform;
