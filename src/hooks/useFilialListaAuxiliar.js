import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc, arrayUnion } from 'firebase/firestore';
import { db, firebaseIsConfigured } from '../config/firebase.js';

/**
 * Lista dinâmica reaproveitável (ex: distribuidoras já usadas em Pedidos,
 * tipos de imposto já usados em Impostos). Guardada como UM documento com
 * um array de strings — filiais/{filialId}/listasAuxiliares/{nomeLista} —
 * em vez de uma subcoleção inteira, já que são só listas curtas.
 */
export function useFilialListaAuxiliar(filialId, nomeLista) {
  const [valores, setValores] = useState([]);

  useEffect(() => {
    if (!firebaseIsConfigured || !filialId) {
      setValores([]);
      return undefined;
    }
    const ref = doc(db, 'filiais', filialId, 'listasAuxiliares', nomeLista);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => setValores(snap.exists() ? snap.data().valores ?? [] : []),
      (err) => console.error(`Falha ao ler lista auxiliar ${nomeLista}:`, err)
    );
    return unsubscribe;
  }, [filialId, nomeLista]);

  async function adicionar(valor) {
    if (!firebaseIsConfigured || !filialId || !valor?.trim()) return;
    const ref = doc(db, 'filiais', filialId, 'listasAuxiliares', nomeLista);
    // arrayUnion não duplica se o valor já existir — seguro chamar sempre.
    await setDoc(ref, { valores: arrayUnion(valor.trim()) }, { merge: true });
  }

  return { valores, adicionar };
}
