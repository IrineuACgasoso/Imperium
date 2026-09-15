import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, firebaseIsConfigured } from '../config/firebase.js';

function subscribeList(filialId, subcollection, setter) {
  return onSnapshot(collection(db, 'filiais', filialId, subcollection), (snap) => {
    setter(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

/**
 * Assina em tempo real todas as coleções do Firestore que o gráfico
 * principal precisa para uma filial: vendas diárias, histórico mensal
 * agregado, vendas por funcionário mensal, gastos avulsos e a lista de
 * funcionários. Se o Firebase não estiver configurado, retorna tudo vazio
 * sem tentar nada (quem chama decide usar o mock nesse caso).
 */
export function useRealFilialData(filialId) {
  const [registrosDiarios, setRegistrosDiarios] = useState([]);
  const [registrosMensaisHistoricos, setRegistrosMensaisHistoricos] = useState([]);
  const [vendasPorFuncionarioMensal, setVendasPorFuncionarioMensal] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [funcionarios, setFuncionarios] = useState([]);

  useEffect(() => {
    if (!firebaseIsConfigured || !filialId) {
      setRegistrosDiarios([]);
      setRegistrosMensaisHistoricos([]);
      setVendasPorFuncionarioMensal([]);
      setGastos([]);
      setFuncionarios([]);
      return undefined;
    }

    const unsubscribers = [
      subscribeList(filialId, 'registrosDiarios', setRegistrosDiarios),
      subscribeList(filialId, 'registrosMensaisHistoricos', setRegistrosMensaisHistoricos),
      subscribeList(filialId, 'vendasPorFuncionarioMensal', setVendasPorFuncionarioMensal),
      subscribeList(filialId, 'gastos', setGastos),
      subscribeList(filialId, 'funcionarios', setFuncionarios),
    ];

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [filialId]);

  return {
    registrosDiarios,
    registrosMensaisHistoricos,
    vendasPorFuncionarioMensal,
    gastos,
    funcionarios,
  };
}
