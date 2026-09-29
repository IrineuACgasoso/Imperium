import { useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import { DIAS_RETENCAO_BAIXAS } from '../../data/conciliacao.js';
import { expurgarBaixas } from '../../data/baixas.js';

/**
 * Baixas fechadas há mais de 7 dias somem junto com as vendas que
 * conciliaram (o histórico útil já está nas outras coleções).
 *
 * Roda UMA consulta ao abrir a aba, só das baixas vencidas — antes a tela
 * mantinha um listener ao vivo em TODAS as baixas só para descobrir isso, e
 * relia a coleção a cada baixa nova. Limitação: baixas legadas sem
 * `fechadoEmMs` (só com o Timestamp antigo) não são encontradas.
 */
export function useExpurgoBaixas(filialId) {
  useEffect(() => {
    if (!filialId) return undefined;
    let cancelado = false;
    const limite = Date.now() - DIAS_RETENCAO_BAIXAS * 24 * 60 * 60 * 1000;
    (async () => {
      const snap = await getDocs(
        query(collection(db, 'filiais', filialId, 'baixas'), where('fechadoEmMs', '<', limite))
      );
      if (cancelado || snap.empty) return;
      await expurgarBaixas(
        filialId,
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      );
    })().catch((err) => console.error('Falha ao expurgar baixas antigas:', err));
    return () => {
      cancelado = true;
    };
  }, [filialId]);
}
