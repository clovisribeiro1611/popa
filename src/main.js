// Arranque da app: carrega os dados, gera recorrências, aplica tema e bloqueio, e trata da navegação.
// Não sabe em que plataforma está: tudo o que é nativo/web passa por `platform`.

import { platform } from './platform/index.js';
import { store, newId } from './store.js';
import { generateRecurring } from './domain.js';
import { $, $$, esc, icon, toast, closeTopLayer, today, appState } from './ui.js';
import { openTransactionSheet } from './views/registo.js';
import * as inicio from './views/inicio.js';
import * as plano from './views/plano.js';
import * as resumo from './views/resumo.js';
import * as movimentos from './views/movimentos.js';
import * as contas from './views/contas.js';
import * as categorias from './views/categorias.js';
import * as metas from './views/metas.js';
import * as recorrentes from './views/recorrentes.js';
import * as definicoes from './views/definicoes.js';
import * as perfil from './views/perfil.js';
import * as consumos from './views/consumos.js';
import * as dividas from './views/dividas.js';
import * as simulador from './views/simulador.js';
import * as conselheiro from './views/conselheiro.js';
import * as lock from './lock.js';
import { reminders } from './advisor.js';

const MAIS = [
  ['conselheiro', 'alert', 'Indicadores e conselhos'],
  ['revisao', 'check', 'Revisão semanal e do mês'],
  ['resumo', 'chart', 'Resumo e gráficos'],
  ['dividas', 'debt', 'Dívidas e endividamento'],
  ['consumos', 'bolt', 'Consumos: luz, água, gás e cesta'],
  ['simulador', 'sim', 'Simulador "e se"'],
  ['contas', 'wallet', 'Contas e saldos'],
  ['metas', 'target', 'Metas de poupança'],
  ['categorias', 'tag', 'Categorias e orçamentos'],
  ['recorrentes', 'repeat', 'Movimentos recorrentes'],
  ['perfil', 'user', 'Perfil do agregado e parâmetros'],
  ['definicoes', 'gear', 'Definições, exportar e backups']
];

const routes = {
  inicio: { title: 'Início', view: inicio, nav: 'inicio' },
  movimentos: { title: 'Movimentos', view: movimentos, nav: 'movimentos' },
  plano: { title: 'Plano do mês', view: plano, nav: 'plano' },
  mais: { title: 'Mais', view: { render: renderMais }, nav: 'mais' },
  resumo: { title: 'Resumo', view: resumo, nav: 'mais', back: true },
  contas: { title: 'Contas', view: contas, nav: 'mais', back: true },
  categorias: { title: 'Categorias', view: categorias, nav: 'mais', back: true },
  metas: { title: 'Metas', view: metas, nav: 'mais', back: true },
  recorrentes: { title: 'Recorrentes', view: recorrentes, nav: 'mais', back: true },
  definicoes: { title: 'Definições', view: definicoes, nav: 'mais', back: true },
  perfil: { title: 'Perfil e parâmetros', view: perfil, nav: 'mais', back: true },
  consumos: { title: 'Consumos', view: consumos, nav: 'mais', back: true },
  dividas: { title: 'Dívidas', view: dividas, nav: 'mais', back: true },
  simulador: { title: 'Simulador "e se"', view: simulador, nav: 'mais', back: true },
  conselheiro: { title: 'Indicadores e conselhos', view: conselheiro, nav: 'mais', back: true },
  revisao: { title: 'Revisão', view: { render: conselheiro.renderRevisao }, nav: 'mais', back: true }
};

function renderMais(host) {
  host.innerHTML = `<ul class="menu">${MAIS.map(([r, ic, label]) =>
    `<li><a href="#/${r}">${icon(ic)}<span>${esc(label)}</span>${icon('right')}</a></li>`).join('')}</ul>`;
}

const routeName = () => location.hash.replace(/^#\/?/, '').split('?')[0] || 'inicio';

let renderQueued = false;
function render() {
  renderQueued = false;
  const name = routes[routeName()] ? routeName() : 'inicio';
  const r = routes[name];
  $('#title').textContent = r.title;
  $('#back').hidden = !r.back;
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === r.nav));
  const host = $('#view');
  const scroll = host.dataset.route === name ? window.scrollY : 0;
  host.dataset.route = name;
  r.view.render(host);
  window.scrollTo(0, scroll);
}
const scheduleRender = () => { if (!renderQueued) { renderQueued = true; requestAnimationFrame(render); } };

// ---------- Tema ----------

const darkQuery = matchMedia('(prefers-color-scheme: dark)');
export function applyTheme() {
  const tema = store.get()?.settings.tema || 'auto';
  document.documentElement.dataset.theme = tema;
  const dark = tema === 'escuro' || (tema === 'auto' && darkQuery.matches);
  $('meta[name=theme-color]').content = dark ? '#111418' : '#F6F7F9';
  platform.setDarkBars(dark);
}
darkQuery.addEventListener('change', applyTheme);

// ---------- Recorrências ----------

function runRecurring() {
  const t = today();
  const due = store.get().recurring.some((r) => r.ativo && r.proximaData <= t && (!r.dataFim || r.proximaData <= r.dataFim));
  if (!due) return;
  const created = store.update((db) => {
    db.meta.ultimaVerificacaoRecorrencias = t;
    return generateRecurring(db, t, { newId });
  });
  if (created.length) toast(created.length === 1 ? '1 movimento recorrente registado' : `${created.length} movimentos recorrentes registados`);
}

// ---------- Ao abrir/retomar ----------

/** Tarefas a correr sempre que a app abre ou volta ao primeiro plano (ex.: lembretes). */
/** Agenda (APK) ou mostra (web) os lembretes, se estiverem ativos. */
function syncReminders() {
  const db = store.get();
  if (!db?.settings.limites?.notificacoes) return;
  platform.notifications.sync(reminders(db, today())).catch(() => {});
}
const onOpen = [syncReminders];
const runOpenHooks = () => onOpen.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });

// ---------- Arranque ----------

async function boot() {
  try {
    const r = await store.init();
    if (r.recovered) setTimeout(() => toast(`Dados recuperados do backup ${r.recovered}`, { duration: 6000 }), 800);
  } catch (e) {
    document.body.innerHTML = `<div class="fatal"><h1>Não foi possível abrir os dados</h1><p>${esc(e.message)}</p></div>`;
    platform.hideSplash();
    return;
  }
  applyTheme();
  // Web: pedir ao navegador para não apagar os dados (o Início avisa se não for garantido).
  platform.requestPersistence().then((r) => { appState.persistencia = r; scheduleRender(); });
  let lastTema = store.get().settings.tema;
  store.subscribe((db) => {
    if (db.settings.tema !== lastTema) { lastTema = db.settings.tema; applyTheme(); }
    scheduleRender();
  });

  $('#fab').addEventListener('click', () => openTransactionSheet());
  $('#back').addEventListener('click', () => history.back());
  window.addEventListener('hashchange', render);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTopLayer(); });

  // O ecrã de bloqueio é inserido de imediato (antes de esconder o splash); não se espera pelo desbloqueio
  // para que os listeners abaixo fiquem ativos.
  lock.lockIfEnabled();
  runRecurring();
  render();
  platform.hideSplash();
  runOpenHooks();

  // Versão nova (web): avisar em vez de substituir sem avisar.
  platform.updates.onAvailable(() => {
    if (document.querySelector('.update-bar')) return;
    const bar = document.createElement('div');
    bar.className = 'update-bar';
    bar.innerHTML = '<span>Há uma versão nova da app.</span><button>Atualizar</button>';
    bar.querySelector('button').addEventListener('click', async () => {
      bar.querySelector('button').disabled = true;
      await store.flush().catch(() => {});
      platform.updates.apply();
    });
    document.body.appendChild(bar);
  });

  platform.lifecycle.onPause(() => {
    store.flush().catch(() => {});
    syncReminders();
    lock.markBackground();
  });
  platform.lifecycle.onResume(() => {
    runRecurring();
    scheduleRender();
    runOpenHooks();
    lock.lockIfEnabled({ onResume: true });
  });
  platform.lifecycle.onBack(() => {
    if (lock.isLocked()) return platform.minimize();
    if (closeTopLayer()) return;
    if (routeName() !== 'inicio') {
      if (routes[routeName()]?.back) history.back(); else location.hash = '#/inicio';
      return;
    }
    platform.minimize();
  });
}

boot();
