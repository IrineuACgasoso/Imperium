// Filtros de servidor para as filas de trabalho ("em aberto"). Constantes de
// módulo de propósito: o hook usa o conteúdo como chave de cache, e uma
// referência estável evita recriar arrays a cada render.
//
// Só igualdade + sem orderBy => o Firestore atende com os índices de campo
// único automáticos, sem entrada em firestore.indexes.json.
//
// Pré-requisito: todo doc novo dessas coleções nasce com `baixaId: null`
// (importadores e criadores de venda). Doc sem o campo NÃO aparece aqui.

/** Vendas ainda sem baixa (as já baixadas ficam 7 dias no banco e não vêm). */
export const VENDAS_EM_ABERTO = [['baixaId', '==', null]];

/** Créditos do extrato bancário sem baixa (débitos/gastos nunca são baixados). */
export const CREDITOS_EM_ABERTO = [
  ['baixaId', '==', null],
  ['tipo', '==', 'credito'],
];

/** Linhas de maquininha sem baixa (todas as adquirentes; separa-se no cliente). */
export const CARTAO_EM_ABERTO = [['baixaId', '==', null]];

/** Campo `baixaId` para incluir num setDoc(merge) de importação: `null` em doc novo, nada em doc já baixado (reimportar não desfaz baixa). */
export const baixaIdInicial = (existente) => (existente?.baixaId ? {} : { baixaId: null });
