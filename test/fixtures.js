// Dados de teste partilhados: uma família tipo e atalhos para criar movimentos.
import { createEmptyDb } from '../src/store.js';

let seq = 0;
export const newId = () => `id${++seq}`;
export const CVE = (v) => v * 100;
export const TODAY = '2026-10-15';

/** Família tipo: salário 70 000 a dia 25, renda 15 000, alimentação 22 000, luz/água 4 500, gás 1 600, transporte 3 000. */
export function familyDb() {
  const db = createEmptyDb(new Date('2026-08-01T10:00:00Z'));
  Object.assign(db.household, { salarioLiquido: CVE(70000), diaPagamento: 25, pessoas: 5, dependentes: 3 });
  const set = (tipo, v) => { db.categories.find((c) => c.essencialTipo === tipo).orcamentoMensal = CVE(v); };
  set('casa', 15000); set('alimentacao', 22000); set('energia', 4500); set('gas', 1600); set('transporte', 3000);
  return db;
}

export const catId = (db, pred) => db.categories.find(pred).id;

export const tx = (db, data, tipo, valor, categoriaId, extra = {}) => {
  const t = { id: newId(), data, tipo, valor, contaId: db.accounts[0].id, contaDestinoId: null, categoriaId, descricao: '', notas: '', recorrenteId: null, ...extra };
  db.transactions.push(t);
  return t;
};
