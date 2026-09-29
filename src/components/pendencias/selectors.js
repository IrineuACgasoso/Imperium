// Regras puras de "o que aparece / o que entra na baixa" em Pendências.
import { normalizarHistorico } from '../../shared/texto.js';

const ehBoleto = (v) => v.campo === 'boleto' || /BOLETO/i.test(v.forma ?? '');

/** Venda que pode ser conferida contra extrato: sem dinheiro e sem boleto
 *  (boleto só cai daqui a ~1 mês, não há como fiscalizar nesta tela). */
export const vendaConferivel = (v) => v.campo !== 'dinheiro' && !ehBoleto(v);

export const vendaEmAberto = (v) => !v.baixaId && vendaConferivel(v);

// Só créditos: débito nunca baixa venda, e "Cobrança" é agregado de vários
// boletos de clientes diferentes — nunca o pagamento de UMA venda do CDS.
export const lancamentoEmAberto = (l) =>
  !l.baixaId &&
  !l.arquivado &&
  l.tipo === 'credito' &&
  normalizarHistorico(l.historico) !== 'cobranca';

// Datas são ISO (YYYY-MM-DD): comparação de string basta (sem localeCompare).
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function ordenarPorData(lista, asc) {
  const dir = asc ? 1 : -1;
  return lista.sort((a, b) => dir * cmp(a.data, b.data));
}

/** Mesmo dia: desempata pela ordem original do extrato (BB exporta em ordem cronológica). */
export function ordenarExtrato(lista, asc) {
  const dir = asc ? 1 : -1;
  return lista.sort((a, b) => dir * (cmp(a.data, b.data) || (a.sequencia ?? 0) - (b.sequencia ?? 0)));
}
