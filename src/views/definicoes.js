// Definições: aparência, moeda, mês, segurança, exportar/importar, backups e dados de exemplo.

import { platform } from '../platform/index.js';
import { store, newId, createEmptyDb, DB_FILE } from '../store.js';
import { toCSV, importCSV, filterTransactions } from '../domain.js';
import { $, $$, esc, sheet, toast, confirmDialog, icon, today, options, settings, currentPeriod, appState, money } from '../ui.js';
import { hashPin, biometryAvailable } from '../lock.js';
import { addSeed, removeSeed } from '../seed.js';
import { prepareExport, inspectImport, mergeForImport } from '../transfer.js';

/* global __APP_VERSION__ */
const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

const set = (fn) => store.update((db) => fn(db.settings));

export function render(host) {
  const el = document.createElement('div');
  host.replaceChildren(el);
  const s = settings();
  const db = store.get();
  const seg = (name, value, opts) => `<div class="seg" data-seg="${name}">${opts.map(([v, l]) =>
    `<button data-v="${v}" class="${String(v) === String(value) ? 'sel' : ''}">${l}</button>`).join('')}</div>`;

  el.innerHTML = `
    <h3 class="section-title">Aparência</h3>
    <div class="card">${seg('tema', s.tema, [['auto', 'Automático'], ['claro', 'Claro'], ['escuro', 'Escuro']])}</div>

    <h3 class="section-title">Moeda e mês</h3>
    <div class="card">
      <div class="field-row">
        <label class="field"><span>Moeda</span><input id="s-moeda" maxlength="5" value="${esc(s.moeda)}" autocapitalize="characters"></label>
        <div class="field"><span>Casas decimais</span>${seg('casasDecimais', s.casasDecimais, [[2, '0,00'], [0, 'Sem']])}</div>
      </div>
      <label class="field" ${store.get().household?.diaPagamento ? 'hidden' : ''}><span>O mês orçamental começa no dia (se não definir o dia do salário no Perfil)</span>
        <select id="s-dia">${options(Array.from({ length: 28 }, (_, i) => i + 1), s.primeiroDiaDoMes, { value: (x) => x, label: (x) => String(x) })}</select></label>
      <label class="field"><span>Conta por defeito no registo rápido</span>
        <select id="s-conta">${options(db.accounts.filter((a) => !a.arquivada), s.contaPorDefeito)}</select></label>
    </div>

    <h3 class="section-title">Segurança</h3>
    <div class="card">
      <label class="check"><input type="checkbox" id="s-lock" ${s.bloqueio.ativo ? 'checked' : ''}> Bloquear a app com PIN</label>
      ${platform.caps.biometria ? `<label class="check" id="s-bio-wrap" ${s.bloqueio.ativo ? '' : 'hidden'}><input type="checkbox" id="s-bio" ${s.bloqueio.biometria ? 'checked' : ''}> Desbloquear com biometria</label>`
        : '<p class="muted small">Neste dispositivo o desbloqueio é só por PIN (a biometria existe apenas na app Android).</p>'}
      ${s.bloqueio.ativo ? '<button class="link" id="s-pin">Alterar PIN</button>' : ''}
      <p class="muted small">A app volta a bloquear depois de 30 segundos em segundo plano.</p>
    </div>

    <h3 class="section-title">Lembretes</h3>
    <div class="card">
      <label class="check"><input type="checkbox" id="s-notif" ${s.limites?.notificacoes ? 'checked' : ''}> Lembretes (salário, revisão semanal, pré-pagos, prestações, festas)</label>
      <p class="muted small" id="s-notif-info">${platform.caps.notificacoesAgendadas
        ? 'Notificações agendadas no próprio telemóvel, sem Internet.'
        : 'No navegador os lembretes só aparecem com a app aberta; ficam também no painel “Lembretes” do Início.'}</p>
    </div>

    <h3 class="section-title">Exportar e importar</h3>
    <div class="card">
      <div class="row-btns" style="margin-top:0"><button class="btn" id="x-csv-mes">CSV do mês</button><button class="btn" id="x-csv">CSV completo</button></div>
      <button class="btn primary wide" id="x-json">${icon('database')} Cópia completa (.json)</button>
      <button class="btn wide" id="x-import">Importar CSV ou cópia .json…</button>
      <input type="file" id="x-file" hidden>
      <p class="muted small">A cópia completa inclui tudo (contas, categorias, movimentos, fundos, dívidas, metas e perfil), exceto o PIN. Guarde-a fora deste dispositivo (e-mail para si, PC, pen).</p>
    </div>

    <h3 class="section-title">Passar dados entre o telemóvel e o computador</h3>
    <div class="card">
      <ol class="steps">
        <li>No dispositivo <b>com os dados</b>: “Cópia completa (.json)”.</li>
        <li>Leve o ficheiro para o outro dispositivo (e-mail para si, cabo USB, pen).</li>
        <li>No outro dispositivo: “Importar CSV ou cópia .json…”, veja o resumo e confirme.</li>
      </ol>
      <p class="muted small">Não há sincronização automática: depois de passar os dados, use só um dos dispositivos (ou repita a transferência). O PIN e o tema de cada dispositivo mantêm-se.</p>
    </div>

    <h3 class="section-title">Armazenamento neste dispositivo</h3>
    <div class="card" id="st-card">${storageCard()}</div>

    <h3 class="section-title">Backups automáticos</h3>
    <div class="card"><p class="muted small">Um por dia (últimos 30), guardados ${platform.caps.persistencia ? 'neste navegador, junto com os dados: são apagados se limpar os dados do site' : 'na pasta privada da app: são apagados se desinstalar a app'}. Para estar seguro, exporte cópias para fora do dispositivo.</p>
      <ul class="list" id="b-list"><li class="item muted">A carregar…</li></ul></div>

    <h3 class="section-title">Dados</h3>
    <div class="card">
      <label class="check"><input type="checkbox" id="s-seed" ${s.seedAtivo ? 'checked' : ''}> Mostrar dados de exemplo</label>
      <button class="btn danger wide" id="s-reset">${icon('trash')} Apagar todos os dados</button>
    </div>
    <p class="muted small" style="text-align:center">POPA ${esc(VERSION)} · ${db.transactions.length} movimentos · ficheiro ${DB_FILE}</p>`;

  // Segmentos (tema, casas decimais)
  $$('[data-seg]', el).forEach((g) => g.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    const key = g.dataset.seg;
    set((st) => { st[key] = key === 'casasDecimais' ? Number(b.dataset.v) : b.dataset.v; });
  }));
  $('#s-moeda', el).addEventListener('change', (e) => {
    const v = e.target.value.trim().toUpperCase();
    if (v) set((st) => { st.moeda = v; });
  });
  $('#s-dia', el).addEventListener('change', (e) => set((st) => { st.primeiroDiaDoMes = Number(e.target.value); }));
  $('#s-conta', el).addEventListener('change', (e) => set((st) => { st.contaPorDefeito = e.target.value; }));

  // Segurança
  $('#s-lock', el).addEventListener('change', async (e) => {
    if (e.target.checked) {
      e.target.checked = false;
      const ok = await askNewPin();
      if (ok) set((st) => { st.bloqueio = { ...st.bloqueio, ...ok, ativo: true }; });
    } else {
      set((st) => { st.bloqueio = { ...st.bloqueio, ativo: false, pinHash: null, pinSalt: null, pinLen: null }; });
      toast('Bloqueio desativado');
    }
  });
  $('#s-pin', el)?.addEventListener('click', async () => {
    const ok = await askNewPin();
    if (ok) { set((st) => { Object.assign(st.bloqueio, ok); }); toast('PIN alterado'); }
  });
  $('#s-notif', el).addEventListener('change', async (e) => {
    if (!e.target.checked) return set((st) => { st.limites.notificacoes = false; });
    const st = await platform.notifications.request();
    if (st !== 'granted') {
      e.target.checked = false;
      $('#s-notif-info', el).textContent = st === 'unsupported'
        ? 'Este navegador não suporta notificações. Os lembretes aparecem no painel do Início.'
        : 'Sem autorização para notificações. Pode autorizar nas definições do sistema; entretanto os lembretes aparecem no Início.';
      return;
    }
    set((s2) => { s2.limites.notificacoes = true; });
    toast('Lembretes ativados');
  });
  $('#s-bio', el)?.addEventListener('change', async (e) => {
    if (e.target.checked && !(await biometryAvailable())) {
      e.target.checked = false;
      return toast('Biometria não disponível neste dispositivo.');
    }
    set((st) => { st.bloqueio.biometria = e.target.checked; });
  });

  // Exportar
  const stamp = today();
  $('#x-csv-mes', el).addEventListener('click', () => {
    const p = currentPeriod();
    exportFile(`popa-${p.key}.csv`, toCSV(store.get(), filterTransactions(store.get(), { start: p.start, end: p.end })), 'text/csv');
  });
  $('#x-csv', el).addEventListener('click', () => exportFile(`popa-movimentos-${stamp}.csv`, toCSV(store.get()), 'text/csv'));
  $('#x-json', el).addEventListener('click', async () => {
    await store.flush();
    exportFile(`popa-copia-${stamp}.json`, prepareExport(store.get(), { plataforma: platform.name, versaoApp: VERSION }), 'application/json');
  });
  el.addEventListener('click', async (e) => {
    if (!e.target.closest('#st-retry')) return;
    appState.persistencia = await platform.requestPersistence();
    $('#st-card', el).innerHTML = storageCard();
    toast(appState.persistencia.persistent ? 'Armazenamento persistente ativo' : 'O navegador continua sem garantir o armazenamento');
  });

  // Importar
  const file = $('#x-file', el);
  $('#x-import', el).addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files[0];
    file.value = '';
    if (f) importText(await f.text(), f.name);
  });

  // Dados
  $('#s-seed', el).addEventListener('change', (e) => {
    if (e.target.checked) store.update((db) => addSeed(db, today(), newId));
    else store.update((db) => removeSeed(db));
    toast(e.target.checked ? 'Dados de exemplo adicionados' : 'Dados de exemplo removidos');
  });
  $('#s-reset', el).addEventListener('click', async () => {
    if (!(await confirmDialog('Apagar TODOS os dados? Será guardada uma cópia nos backups antes de apagar.', { ok: 'Apagar tudo', danger: true }))) return;
    await store.replaceAll(createEmptyDb(), 'pre-apagar');
    toast('Dados apagados. Pode restaurar a partir dos backups.');
  });

  renderBackups(el);
}

async function renderBackups(el) {
  const ul = $('#b-list', el);
  const files = await store.listBackups().catch(() => []);
  if (!ul.isConnected) return;
  ul.innerHTML = files.length ? files.map((f) => `<li><button class="item" data-b="${esc(f)}">
    <div class="item-main"><div class="item-title">${esc(labelBackup(f))}</div><div class="item-sub">${esc(f)}</div></div>${icon('right')}</button></li>`).join('')
    : '<li class="item muted">Ainda não há backups.</li>';
  ul.addEventListener('click', (e) => {
    const b = e.target.closest('[data-b]');
    if (b) openBackupSheet(b.dataset.b);
  });
}

function labelBackup(f) {
  const m = f.match(/(\d{4})-(\d{2})-(\d{2})/);
  const when = m ? `${m[3]}/${m[2]}/${m[1]}` : '';
  if (f.startsWith('db-')) return `Backup diário ${when}`;
  if (f.startsWith('pre-migracao')) return `Antes de atualizar a app ${when}`;
  if (f.startsWith('pre-importacao')) return `Antes de importar ${when}`;
  if (f.startsWith('pre-restauro')) return `Antes de restaurar ${when}`;
  if (f.startsWith('pre-apagar')) return `Antes de apagar tudo ${when}`;
  return f;
}

function openBackupSheet(name) {
  const s = sheet(`<h2>${esc(labelBackup(name))}</h2>
    <p class="muted small">${esc(name)}</p>
    <button class="btn primary wide" id="b-restore">Restaurar este backup</button>
    <button class="btn wide" id="b-share">Partilhar / guardar fora</button>`);
  $('#b-restore', s.el).addEventListener('click', async () => {
    s.close();
    if (!(await confirmDialog('Substituir os dados atuais por este backup? Os dados atuais ficam guardados num backup.', { ok: 'Restaurar' }))) return;
    try {
      await store.replaceAll(await store.readBackup(name), 'pre-restauro');
      toast('Backup restaurado');
    } catch (e) {
      toast(`Não foi possível restaurar: ${e.message}`);
    }
  });
  $('#b-share', s.el).addEventListener('click', async () => {
    s.close();
    exportFile(`popa-${name}`, await store.readBackup(name), 'application/json');
  });
}

/** Folha para definir um PIN novo (4–8 dígitos, pedido duas vezes). Resolve { pinHash, pinSalt, pinLen } ou null. */
function askNewPin() {
  return new Promise((resolve) => {
    let result = null;
    const s = sheet(`<h2>Definir PIN</h2>
      <label class="field"><span>Novo PIN (4 a 8 dígitos)</span><input id="p1" type="password" inputmode="numeric" maxlength="8" autocomplete="off"></label>
      <label class="field"><span>Repetir PIN</span><input id="p2" type="password" inputmode="numeric" maxlength="8" autocomplete="off"></label>
      <p class="muted small">Se esquecer o PIN e a biometria falhar, não há forma de recuperar o acesso sem reinstalar a app (perdendo os dados que não tenha exportado).</p>
      <p class="error" id="p-err"></p>
      <button class="btn primary big wide" id="p-ok">Guardar PIN</button>`, { onClose: () => resolve(result) });
    $('#p-ok', s.el).addEventListener('click', async () => {
      const p1 = $('#p1', s.el).value, p2 = $('#p2', s.el).value;
      if (!/^\d{4,8}$/.test(p1)) return ($('#p-err', s.el).textContent = 'O PIN tem de ter 4 a 8 dígitos.');
      if (p1 !== p2) return ($('#p-err', s.el).textContent = 'Os PIN não coincidem.');
      result = { ...(await hashPin(p1)), pinLen: p1.length };
      s.close();
    });
    setTimeout(() => $('#p1', s.el).focus(), 280);
  });
}

/** Exporta pelo meio da plataforma: folha de partilha no APK, descarregar ficheiro na web. */
export async function exportFile(name, text, mime) {
  try {
    const r = await platform.saveFile(name, text, mime);
    if (r === 'descarregado') toast(`Ficheiro “${name}” descarregado. Guarde-o fora deste dispositivo.`, { duration: 5000 });
  } catch (e) {
    toast(`Não foi possível exportar: ${e?.message || e}`);
  }
}

/** Estado do armazenamento: ficheiro privado no APK; IndexedDB (persistente ou não) na web. */
function storageCard() {
  if (!platform.caps.persistencia) {
    return '<p>Os dados estão no ficheiro <b>db.json</b> na pasta privada da app. Só são apagados se desinstalar a app ou limpar os dados dela nas definições do Android.</p>';
  }
  const p = appState.persistencia;
  if (p?.persistent) return '<p>✅ <b>Armazenamento persistente.</b> O navegador não apaga os dados sozinho, mas “limpar dados do site” ou desinstalar o navegador apaga a base de dados. Exporte cópias regularmente.</p>';
  return `<p>⚠ <b>O navegador não garante que guarda os dados.</b> Pode apagá-los se faltar espaço, e “limpar os dados do site” apaga toda a base de dados.</p>
    <p class="small">Para reduzir o risco: instale a app no ecrã inicial, use-a com frequência e <b>exporte uma cópia completa</b> pelo menos uma vez por semana.</p>
    ${p?.supported === false ? '<p class="muted small">Este navegador não permite pedir armazenamento persistente.</p>' : '<button class="btn wide" id="st-retry">Pedir armazenamento persistente</button>'}`;
}

/** Importação: cópia .json (com pré-visualização) ou CSV (acrescenta movimentos). */
async function importText(text, filename) {
  const trimmed = text.replace(/^\uFEFF/, '').trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return previewImport(trimmed, filename);
  const r = store.update((db) => importCSV(db, text, { newId }));
  const msg = `${r.importadas} importados` + (r.duplicadas ? `, ${r.duplicadas} repetidos ignorados` : '') + (r.erros.length ? `, ${r.erros.length} com erro` : '');
  if (r.erros.length) {
    sheet(`<h2>Importação de CSV</h2><p>${esc(msg)}.</p><ul class="small">${r.erros.slice(0, 20).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`);
  } else toast(msg);
}

/** Pré-visualização de uma cópia completa: o que existe agora vs. o que vai ficar. */
function previewImport(text, filename) {
  const r = inspectImport(store.get(), text);
  if (!r.ok) {
    sheet(`<h2>Não é possível importar</h2><p>${esc(r.erro)}</p><p class="muted small">${esc(filename)}</p>`);
    return;
  }
  const row = (label, a, b) => `<tr><td>${label}</td><td class="num">${a}</td><td class="num"><b>${b}</b></td></tr>`;
  const per = (x) => (x.primeiro ? `${x.primeiro} a ${x.ultimo}` : '—');
  const quando = (iso) => (iso ? new Date(iso).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const origem = r.origem ? `${r.origem.plataforma === 'android' ? 'app Android' : 'versão web'} ${esc(r.origem.versaoApp || '')}, exportada em ${esc(quando(r.origem.exportadoEm))}` : 'origem desconhecida (cópia antiga ou backup)';
  const s = sheet(`<h2>Importar cópia completa</h2>
    <p class="small">${esc(filename)} · ${origem}</p>
    ${r.precisaMigracao ? `<p class="small">Esta cópia é de uma versão anterior (esquema v${r.versaoFicheiro}); será atualizada automaticamente.</p>` : ''}
    <table class="cmp"><thead><tr><th></th><th>Agora</th><th>Depois</th></tr></thead><tbody>
      ${row('Movimentos', r.atual.movimentos, r.novo.movimentos)}
      ${row('Período', per(r.atual), per(r.novo))}
      ${row('Contas', r.atual.contas, r.novo.contas)}
      ${row('Fundos', r.atual.fundos, r.novo.fundos)}
      ${row('Dívidas', r.atual.dividas, r.novo.dividas)}
      ${row('Metas', r.atual.metas, r.novo.metas)}
      ${row('Salário no perfil', r.atual.salario ? money(r.atual.salario) : '—', r.novo.salario ? money(r.novo.salario) : '—')}
      ${row('Última alteração', quando(r.atual.atualizadoEm), quando(r.novo.atualizadoEm))}
    </tbody></table>
    <p class="small"><b>Todos os dados atuais deste dispositivo serão substituídos.</b> Antes disso é guardado um backup automático (pode restaurá-lo em “Backups automáticos”). O PIN e o tema deste dispositivo mantêm-se.</p>
    <div class="row-btns"><button class="btn" id="i-no">Cancelar</button><button class="btn danger" id="i-ok">Substituir os dados</button></div>`);
  $('#i-no', s.el).addEventListener('click', s.close);
  $('#i-ok', s.el).addEventListener('click', async () => {
    s.close();
    try {
      await store.replaceAll(mergeForImport(r.db, store.get()), 'pre-importacao');
      toast(`Cópia importada: ${r.novo.movimentos} movimentos`);
    } catch (e) {
      toast(`Importação falhou: ${e.message}`, { duration: 6000 });
    }
  });
}
