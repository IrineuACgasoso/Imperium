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
 * --- Por que existe um cache aqui -----------------------------------------
 * Antes, cada componente que chamava este hook abria seu PRÓPRIO listener do
 * Firestore. Como várias abas pedem a mesma coleção (ex: `extratoLancamentos`
 * é lido por Pendências, Extrato e Clientes; `gastos` por Pendências e
 * Gastos), navegar entre abas destruía e recriava listeners o tempo todo —
 * cada remontagem custava uma leitura completa da coleção de novo, mesmo sem
 * nada ter mudado. Isso é o que estava consumindo cota rápido demais.
 *
 * Agora existe UM listener por (filialId, subcollection, orderByField),
 * compartilhado por quantos componentes quiserem os mesmos dados ao mesmo
 * tempo (contagem de referências). Ao trocar de aba, o componente antigo
 * "solta" o listener mas ele continua vivo por mais alguns segundos
 * (GRACE_MS) — se você voltar pra aba antes disso, reaproveita o mesmo
 * listener sem nenhuma leitura nova. Só quando ninguém mais usa aquela
 * coleção por tempo suficiente é que o listener realmente fecha.
 */

const GRACE_MS = 45_000; // tempo que um listener sem ouvintes fica "quente" antes de fechar

const cache = new Map(); // chave -> { items, loading, listeners:Set<fn>, unsubscribe, teardownTimer, refCount }

function cacheKey(filialId, subcollection, orderByField) {
  return `${filialId}/${subcollection}/${orderByField}`;
}

function getEntry(filialId, subcollection, orderByField) {
  const key = cacheKey(filialId, subcollection, orderByField);
  let entry = cache.get(key);
  if (entry) return entry;

  entry = {
    items: [],
    loading: true,
    listeners: new Set(),
    unsubscribe: null,
    teardownTimer: null,
    refCount: 0,
  };
  cache.set(key, entry);

  const q = query(
    collection(db, 'filiais', filialId, subcollection),
    orderBy(orderByField, 'desc')
  );

  entry.unsubscribe = onSnapshot(
    q,
    (snap) => {
      entry.items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      entry.loading = false;
      entry.listeners.forEach((fn) => fn());
    },
    (err) => {
      console.error(`Falha ao ler ${subcollection}:`, err);
      entry.loading = false;
      entry.listeners.forEach((fn) => fn());
    }
  );

  return entry;
}

function subscribe(filialId, subcollection, orderByField, onChange) {
  const key = cacheKey(filialId, subcollection, orderByField);
  const entry = getEntry(filialId, subcollection, orderByField);

  // Alguém quer esses dados de novo: cancela o fechamento agendado, se houver.
  if (entry.teardownTimer) {
    clearTimeout(entry.teardownTimer);
    entry.teardownTimer = null;
  }

  entry.refCount += 1;
  entry.listeners.add(onChange);

  return function unsubscribeConsumer() {
    entry.listeners.delete(onChange);
    entry.refCount -= 1;
    if (entry.refCount <= 0) {
      // Ninguém mais está olhando — mantém o listener vivo por GRACE_MS pra
      // não pagar leitura completa de novo se o usuário só estiver trocando
      // de aba rapidamente. Se realmente ninguém voltar, fecha de vez.
      entry.teardownTimer = setTimeout(() => {
        const current = cache.get(key);
        if (current && current.refCount <= 0) {
          current.unsubscribe?.();
          cache.delete(key);
        }
      }, GRACE_MS);
    }
  };
}

export function useFilialCollection(filialId, subcollection, orderByField = 'criadoEm') {
  const [, forceRender] = useState(0);
  const active = firebaseIsConfigured && !!filialId;
  const entry = active ? getEntry(filialId, subcollection, orderByField) : null;

  useEffect(() => {
    if (!active) return undefined;
    const unsub = subscribe(filialId, subcollection, orderByField, () => forceRender((n) => n + 1));
    // Se os dados já chegaram entre o getEntry() do render e este effect,
    // força um render pra refletir (evita ficar preso no estado inicial).
    forceRender((n) => n + 1);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filialId, subcollection, orderByField, active]);

  const items = active ? entry.items : [];
  const loading = active ? entry.loading : false;

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
