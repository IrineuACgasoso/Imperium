// Restaurar uma baixa: devolve a(s) venda(s) e o(s) lançamento(s) envolvidos
// pra fila de pendentes e apaga o registro da baixa. Usado tanto em
// Pendências (baixa recém-automática que o usuário quer desfazer) quanto em
// Fechamentos (histórico).

import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase.js';

/**
 * @param {string} filialId
 * @param {{ id: string, vendaIds?: string[], lancamentoIds?: string[], colecaoLancamento?: string }} baixa
 * @param {{ confirmar?: boolean }} [opcoes] `confirmar: false` pula o window.confirm (ex: chamada em lote).
 */
export async function restaurarBaixa(filialId, baixa, { confirmar = true } = {}) {
  if (confirmar) {
    const ok = window.confirm(
      'Restaurar esta baixa?\n\nAs vendas e os pagamentos vinculados voltam para a fila de pendentes.'
    );
    if (!ok) return false;
  }

  for (const id of baixa.vendaIds ?? []) {
    await updateDoc(doc(db, 'filiais', filialId, 'pendenciasVendas', id), {
      baixaId: null,
    }).catch(() => {});
  }

  // Baixas antigas (de antes de existir a coluna de cartão) não têm
  // `colecaoLancamento` gravado — assume-se extrato bancário, a única fonte
  // possível na época.
  const colecao = baixa.colecaoLancamento ?? 'extratoLancamentos';
  for (const id of baixa.lancamentoIds ?? []) {
    await updateDoc(doc(db, 'filiais', filialId, colecao, id), {
      baixaId: null,
    }).catch(() => {});
  }

  await deleteDoc(doc(db, 'filiais', filialId, 'baixas', baixa.id));
  return true;
}
