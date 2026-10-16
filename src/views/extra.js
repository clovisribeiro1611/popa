// Rendimentos extra (remessas, biscates, vendas): aplicar a regra de distribuição com um toque.

import { store, newId } from '../store.js';
import { applyExtraIncomeRule, pendingExtraIncome, isExtraIncome } from '../finance.js';
import { esc, money, toast, today } from '../ui.js';

export const ruleLabel = (r) => `${r.fundosDividas}/${r.emergenciaMetas}/${r.livre}`;

/** Aplica a regra ativa ao movimento e mostra o resumo. */
export function applyRule(txId) {
  const r = store.update((db) => applyExtraIncomeRule(db, txId, today(), { newId }));
  if (!r) return toast('Regra já aplicada a este rendimento.');
  const partes = [
    r.fundos && `fundos ${money(r.fundos)}`, r.dividas && `dívidas ${money(r.dividas)}`,
    r.emergencia && `emergência ${money(r.emergencia)}`, r.metas && `metas ${money(r.metas)}`, `livre ${money(r.livre)}`
  ].filter(Boolean);
  toast(`Distribuído: ${partes.join(' · ')}`, { duration: 7000 });
}

/** Depois de registar uma receita: se for rendimento extra, oferece aplicar a regra. */
export function offerRule(t) {
  const db = store.get();
  const rule = db.extraIncomeRules.find((r) => r.ativa !== false);
  if (!rule || !isExtraIncome(db, t) || t.regraAplicada) return false;
  toast(`Rendimento extra de ${money(t.valor)}. Distribuir ${ruleLabel(rule)}?`, { action: 'Distribuir', onAction: () => applyRule(t.id), duration: 8000 });
  return true;
}

/** Cartão do Início com os rendimentos extra do ciclo ainda por distribuir. */
export function pendingCard({ db, cascade: c }) {
  const list = pendingExtraIncome(db, c.cycle);
  const rule = db.extraIncomeRules.find((r) => r.ativa !== false);
  if (!list.length || !rule) return null;
  const total = list.reduce((s, t) => s + t.valor, 0);
  return {
    html: `<div class="card alert-card ok"><h2><span>💸 Rendimento extra por distribuir</span><span class="num">${money(total)}</span></h2>
      <p class="small">Regra ${esc(ruleLabel(rule))}: ${rule.fundosDividas}% para fundos e dívidas, ${rule.emergenciaMetas}% para emergência e metas, ${rule.livre}% livre.</p>
      <button class="btn primary wide" data-extra-all>Distribuir agora</button></div>`,
    top: true,
    bind: (el) => el.querySelector('[data-extra-all]')?.addEventListener('click', () => list.forEach((t) => applyRule(t.id)))
  };
}
