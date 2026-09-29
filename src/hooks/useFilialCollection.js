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
  where,
} from 'firebase/firestore';
import { db, firebaseIsConfigured } from '../config/firebase.js';

/**
 * Assina em tempo real filiais/{filialId}/{subcollection}, ordenado por
 * `orderByField` (padrão "criadoEm", desc; `null` = sem ordenação) e,
 * opcionalmente, filtrado no servidor por `filtros` (ver abaixo). Retorna helpers de escrita já
 * amarrados à filial ativa.
 *
 * --- Por que existe um cache aqui -----------------------------------------
 * Antes, cada componente que chamava este hook abria seu PRÓPRIO listener do
 * Firestore. Como várias abas pedem a mesma coleção (ex: `extratoLancamentos`
 * é lido por Pendências, Extrato e Clientes), navegar entre abas destruía e
 * recriava listeners o tempo todo — cada remontagem custava uma leitura
 * completa da coleção de novo, mesmo sem nada ter mudado. Isso é o que
 * estava consumindo cota rápido demais.
 *
 * Agora existe UM listener por (filialId, subcollection, orderByField),
 * compartilhado por quantos componentes quiserem os mesmos dados ao mesmo
 * tempo (contagem de referências). Ao trocar de aba, o componente antigo
 * "solta" o listener mas ele continua vivo por mais alguns segundos
 * (GRACE_MS) — se você voltar pra aba antes disso, reaproveita o mesmo
 * listener sem nenhuma leitura nova. Só quando ninguém mais usa aquela
 * coleção por tempo suficiente é que o listener realmente fecha.
 */

/**
 * --- Filtros no servidor ---------------------------------------------------
 * O 4º parâmetro `filtros` é uma lista de [campo, operador, valor] aplicada
 * no Firestore: documentos fora do filtro NÃO são lidos (e não contam na cota
 * de leituras). Duas regras para não exigir índice composto:
 *  - use só filtros de igualdade (`==`), quantos quiser;
 *  - passe `orderByField = null` (ordene no cliente). Igualdade + orderBy em
 *    outro campo é o que exigiria índice composto.
 * `filtros` deve ser uma constante de módulo (ver data/filtrosAbertos.js).
 * Atenção: `where(campo, '==', null)` só encontra docs em que o campo existe
 * e vale null — quem cria os docs precisa gravar o campo.
 */

const GRACE_MS = 45_000; // tempo que um listener sem ouvintes fica "quente" antes de fechar

const cache = new Map(); // chave -> { items, loading, listeners:Set<fn>, unsubscribe, teardownTimer, refCount }

function cacheKey(filialId, subcollection, orderByField, filtros) {
  return `${filialId}/${subcollection}/${orderByField ?? '-'}/${JSON.stringify(filtros)}`;
}

function getEntry(filialId, subcollection, orderByField, filtros) {
  const key = cacheKey(filialId, subcollection, orderByField, filtros);
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
    ...filtros.map(([campo, op, valor]) => where(campo, op, valor)),
    ...(orderByField ? [orderBy(orderByField, 'desc')] : [])
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

function subscribe(filialId, subcollection, orderByField, filtros, onChange) {
  const key = cacheKey(filialId, subcollection, orderByField, filtros);
  const entry = getEntry(filialId, subcollection, orderByField, filtros);

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

const SEM_FILTROS = [];

export function useFilialCollection(
  filialId,
  subcollection,
  orderByField = 'criadoEm',
  filtros = SEM_FILTROS
) {
  const [, forceRender] = useState(0);
  const active = firebaseIsConfigured && !!filialId;
  const entry = active ? getEntry(filialId, subcollection, orderByField, filtros) : null;
  const filtrosKey = JSON.stringify(filtros);

  useEffect(() => {
    if (!active) return undefined;
    const unsub = subscribe(filialId, subcollection, orderByField, filtros, () =>
      forceRender((n) => n + 1)
    );
    // Se os dados já chegaram entre o getEntry() do render e este effect,
    // força um render pra refletir (evita ficar preso no estado inicial).
    forceRender((n) => n + 1);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filialId, subcollection, orderByField, filtrosKey, active]);

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
