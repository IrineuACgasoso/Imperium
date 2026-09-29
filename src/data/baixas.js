// Escrita de baixas no Firestore.
//
// Tudo passa por writeBatch: uma ida ao servidor por até LOTE operações (em
// vez de uma ida por documento, em sequência) e, dentro de um lote, a baixa
// é atômica — ou grava tudo, ou nada. Um lote é limitado a 500 operações
// pelo Firestore; ficamos abaixo disso.

import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase.js';

const LOTE = 450;
const COLECAO_BANCO = 'extratoLancamentos';

/**
 * @typedef {{ tipo: 'set'|'update'|'delete', ref: import('firebase/firestore').DocumentReference, data?: object }} Op
 */

function aplicarNoLote(batch, op) {
  if (op.tipo === 'set') batch.set(op.ref, op.data);
  else if (op.tipo === 'update') batch.update(op.ref, op.data);
  else batch.delete(op.ref);
}

function executarSolta(op) {
  if (op.tipo === 'set') return setDoc(op.ref, op.data);
  if (op.tipo === 'update') return updateDoc(op.ref, op.data);
  return deleteDoc(op.ref);
}

/**
 * Executa as operações em lotes.
 * `tolerante`: se um documento referenciado já não existir (update em doc
 * apagado derruba o lote inteiro com `not-found`), refaz aquele lote op a
 * op, ignorando só as que falham. Usado em restaurar/limpeza, onde o doc do
 * outro lado pode ter sido removido; nas baixas novas, falha = erro real.
 * @param {Op[]} ops
 */
export async function aplicarOps(ops, { tolerante = false } = {}) {
  for (let i = 0; i < ops.length; i += LOTE) {
    const fatia = ops.slice(i, i + LOTE);
    const batch = writeBatch(db);
    fatia.forEach((op) => aplicarNoLote(batch, op));
    try {
      await batch.commit();
    } catch (err) {
      if (!tolerante || err?.code !== 'not-found') throw err;
      for (const op of fatia) await executarSolta(op).catch(() => {});
    }
  }
}

/**
 * Monta as operações de UMA baixa (doc em `baixas` + marcação de baixaId nas
 * vendas e nos lançamentos), sem gravar nada.
 * @param {string} filialId
 * @param {{ vendaIds?: string[], lancamentoIds?: string[], colecaoLancamento?: string } & Record<string, any>} baixa
 */
export function montarOpsBaixa(filialId, baixa) {
  const { vendaIds = [], lancamentoIds = [], colecaoLancamento = COLECAO_BANCO, ...resto } = baixa;
  const ref = doc(collection(db, 'filiais', filialId, 'baixas'));
  /** @type {Op[]} */
  const ops = [
    {
      tipo: 'set',
      ref,
      data: {
        ...resto,
        vendaIds,
        lancamentoIds,
        colecaoLancamento,
        fechadoEmMs: Date.now(),
        criadoEm: serverTimestamp(),
      },
    },
  ];
  for (const id of vendaIds) {
    ops.push({
      tipo: 'update',
      ref: doc(db, 'filiais', filialId, 'pendenciasVendas', id),
      data: { baixaId: ref.id },
    });
  }
  for (const id of lancamentoIds) {
    ops.push({
      tipo: 'update',
      ref: doc(db, 'filiais', filialId, colecaoLancamento, id),
      data: { baixaId: ref.id },
    });
  }
  return { ref, ops };
}

/** Grava várias baixas de uma vez (ex: baixa automática com dezenas de pares). */
export async function gravarBaixas(filialId, baixas) {
  const ops = baixas.flatMap((b) => montarOpsBaixa(filialId, b).ops);
  await aplicarOps(ops);
}

/**
 * Restaurar uma baixa: devolve a(s) venda(s) e o(s) lançamento(s) envolvidos
 * pra fila de pendentes e apaga o registro da baixa. Usado tanto em
 * Pendências quanto em Fechamentos (histórico).
 * @param {{ confirmar?: boolean }} [opcoes] `confirmar: false` pula o window.confirm.
 */
export async function restaurarBaixa(filialId, baixa, { confirmar = true } = {}) {
  if (confirmar) {
    const ok = window.confirm(
      'Restaurar esta baixa?\n\nAs vendas e os pagamentos vinculados voltam para a fila de pendentes.'
    );
    if (!ok) return false;
  }

  // Baixas antigas (de antes de existir a coluna de cartão) não têm
  // `colecaoLancamento` gravado — assume-se extrato bancário.
  const colecao = baixa.colecaoLancamento ?? COLECAO_BANCO;
  /** @type {Op[]} */
  const ops = [
    ...(baixa.vendaIds ?? []).map((id) => ({
      tipo: 'update',
      ref: doc(db, 'filiais', filialId, 'pendenciasVendas', id),
      data: { baixaId: null },
    })),
    ...(baixa.lancamentoIds ?? []).map((id) => ({
      tipo: 'update',
      ref: doc(db, 'filiais', filialId, colecao, id),
      data: { baixaId: null },
    })),
    { tipo: 'delete', ref: doc(db, 'filiais', filialId, 'baixas', baixa.id) },
  ];
  await aplicarOps(ops, { tolerante: true });
  return true;
}

/**
 * Apaga baixas fechadas há mais de N dias junto com as vendas que elas
 * conciliaram; os lançamentos ficam arquivados (somem da fila, mas continuam
 * no extrato).
 */
export async function expurgarBaixas(filialId, baixas) {
  /** @type {Op[]} */
  const ops = [];
  for (const b of baixas) {
    const colecao = b.colecaoLancamento ?? COLECAO_BANCO;
    for (const id of b.vendaIds ?? []) {
      ops.push({ tipo: 'delete', ref: doc(db, 'filiais', filialId, 'pendenciasVendas', id) });
    }
    for (const id of b.lancamentoIds ?? []) {
      ops.push({
        tipo: 'update',
        ref: doc(db, 'filiais', filialId, colecao, id),
        // Mantém o baixaId: o lançamento continua "baixado" no Extrato/Excel e
        // sai das consultas de "em aberto" (baixaId == null) sem precisar de índice.
        data: { arquivado: true },
      });
    }
    ops.push({ tipo: 'delete', ref: doc(db, 'filiais', filialId, 'baixas', b.id) });
  }
  await aplicarOps(ops, { tolerante: true });
}
