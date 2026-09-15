import { useEffect, useState } from 'react';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import { db, firebaseIsConfigured } from '../config/firebase.js';

/**
 * Assina em tempo real filiais/{filialId}/{subcollection}, ordenado por
 * `orderByField` (padrão "criadoEm", desc). Retorna helpers de escrita já
 * amarrados à filial ativa.
 *
 * Se o Firebase não estiver configurado, retorna items: [] e helpers que
 * lançam erro claro ao serem chamados — a UI decide como mostrar isso.
 */
export function useFilialCollection(filialId, subcollection, orderByField = 'criadoEm') {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(firebaseIsConfigured);

  useEffect(() => {
    if (!firebaseIsConfigured || !filialId) {
      setItems([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const q = query(
      collection(db, 'filiais', filialId, subcollection),
      orderBy(orderByField, 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error(`Falha ao ler ${subcollection}:`, err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [filialId, subcollection, orderByField]);

  async function add(data) {
    if (!firebaseIsConfigured) throw new Error('Firebase não configurado.');
    return addDoc(collection(db, 'filiais', filialId, subcollection), {
      ...data,
      criadoEm: serverTimestamp(),
    });
  }

  async function update(id, data) {
    if (!firebaseIsConfigured) throw new Error('Firebase não configurado.');
    return updateDoc(doc(db, 'filiais', filialId, subcollection, id), data);
  }

  async function remove(id) {
    if (!firebaseIsConfigured) throw new Error('Firebase não configurado.');
    return deleteDoc(doc(db, 'filiais', filialId, subcollection, id));
  }

  return { items, loading, add, update, remove };
}
