import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase.js';

/**
 * Salva um valor novo (distribuidora, tipo de imposto, etc.) na lista
 * auxiliar correspondente — filiais/{filialId}/listasAuxiliares/{nomeLista},
 * um doc por lista com um array `valores` — pra ele aparecer no autocomplete
 * na próxima vez.
 *
 * Existem TRÊS lugares que categorizam um gasto e podem digitar um valor
 * novo nesses campos: o formulário manual da aba Gastos, o "Associar Gasto"
 * do Extrato, e o mesmo botão reaproveitado nas Pendências. Os três
 * precisam gravar aqui, com a MESMA função, ou os dois últimos continuam
 * "esquecendo" o valor digitado — que foi exatamente o bug: só o formulário
 * manual chamava isso, os outros dois só salvavam o campo no próprio gasto
 * e nunca atualizavam a lista de sugestões.
 *
 * Não usa o cache do hook `useFilialCollection` (que cada tela já tem sua
 * própria cópia, possivelmente desatualizada) — busca o doc direto do
 * Firestore antes de gravar, pra não perder um valor salvo por outra aba
 * entre a leitura do cache e a gravação.
 */
export async function salvarNaListaAuxiliar(filialId, nomeLista, novoValor) {
  const valorLimpo = (novoValor ?? '').trim();
  if (!valorLimpo) return;
  const ref = doc(db, 'filiais', filialId, 'listasAuxiliares', nomeLista);
  const snap = await getDoc(ref);
  const atual = snap.exists() ? snap.data()?.valores ?? [] : [];
  if (atual.some((v) => v.toLowerCase() === valorLimpo.toLowerCase())) return;
  await setDoc(
    ref,
    { valores: [...atual, valorLimpo].sort((a, b) => a.localeCompare(b)) },
    { merge: true }
  );
}
