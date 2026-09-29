import { useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import { abreviarFormaPagamento } from '../../parsers/extratoBB.js';
import { idVinculo } from '../../shared/vinculo.js';
import { casarAutomatico } from '../../data/conciliacao.js';
import { casarAutomaticoCartao } from '../../data/conciliacaoCartao.js';
import { aplicarOps, gravarBaixas, montarOpsBaixa } from '../../data/baixas.js';
import { rotuloFonte } from './constants.js';
import { currency, formatarData, hojeISO } from './utils.js';

const LABEL_MOTIVO = { sangria: 'sangria', promissoria: 'promissória' };

const somaValores = (lista, ids) => {
  let total = 0;
  for (const item of lista) if (ids.has(item.id)) total += Number(item.valor || 0);
  return total;
};

/**
 * Todas as escritas de Pendências. Cada ação devolve true/false (sucesso) e
 * reporta falha em `aviso`, para a tela só cuidar de limpar a seleção.
 *
 * @param {object} p
 * @param {string} p.filialId
 * @param {Array}  p.vendas             todas as vendas (para totais)
 * @param {Array}  p.lancamentos        todos os lançamentos do banco (para totais)
 * @param {Array}  p.vendasElegiveis    vendas em aberto e conferíveis
 * @param {Array}  p.lancamentosAbertos créditos do banco em aberto
 * @param {Array}  p.cartaoAbertos      linhas da maquininha ativa em aberto
 * @param {Map}    p.vinculoPorChave
 * @param {string} p.origemExtrato      'bb' ou id do adquirente
 */
export function usePendenciasAcoes({
  filialId,
  vendas,
  lancamentos,
  vendasElegiveis,
  lancamentosAbertos,
  cartaoAbertos,
  vinculoPorChave,
  origemExtrato,
}) {
  const [processando, setProcessando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const ehCartao = origemExtrato !== 'bb';
  const colecaoLancamento = ehCartao ? 'extratoCartao' : 'extratoLancamentos';

  // Envolve toda ação: liga/desliga `processando` e transforma exceção em aviso.
  async function executar(fn) {
    setProcessando(true);
    try {
      await fn();
      return true;
    } catch (err) {
      console.error(err);
      setAviso(`Não foi possível gravar: ${err.message}`);
      return false;
    } finally {
      setProcessando(false);
    }
  }

  // --- Baixa automática ---------------------------------------------------
  // Banco: nome+valor. Maquininha: data+valor+bandeira.
  function aplicarBaixas() {
    setAviso(null);
    return executar(async () => {
      const { pares, motivos } = ehCartao
        ? casarAutomaticoCartao(vendasElegiveis, cartaoAbertos)
        : casarAutomatico(vendasElegiveis, lancamentosAbertos, vinculoPorChave);

      if (pares.length) {
        await gravarBaixas(
          filialId,
          pares.map((par) => ({
            vendaIds: [par.venda.id],
            lancamentoIds: [par.lancamento.id],
            automatica: true,
            total: Number(par.venda.valor || 0),
            resolucao: null,
            tipo: 'venda',
            colecaoLancamento,
          }))
        );
      }

      if (ehCartao) {
        const pendentes =
          motivos.formaNaoIdentificada + motivos.semLancamentoCorrespondente + motivos.ambiguo;
        setAviso(
          pares.length === 0
            ? `Nenhuma baixa segura encontrada. ${pendentes} pagamento(s) continuam pendentes ` +
                `(${motivos.semLancamentoCorrespondente} sem lançamento de mesma data/valor/bandeira, ${motivos.ambiguo} ambíguo(s)).`
            : `${pares.length} venda(s) fechada(s) automaticamente contra o extrato da ${rotuloFonte(
                origemExtrato
              )}. ${pendentes} pagamento(s) ficaram pendentes para conferência manual.`
        );
      } else {
        const pendentes = motivos.semVinculo + motivos.semVendaCorrespondente + motivos.ambiguo;
        setAviso(
          pares.length === 0
            ? `Nenhuma baixa segura encontrada. ${pendentes} pagamento(s) continuam pendentes ` +
                `(${motivos.semVinculo} sem cliente associado, ${motivos.semVendaCorrespondente} sem venda de mesmo nome e valor, ${motivos.ambiguo} ambíguo(s)).`
            : `${pares.length} venda(s) fechada(s) automaticamente. ${pendentes} pagamento(s) de venda ficaram pendentes para conferência manual.`
        );
      }
    });
  }

  // --- Baixa manual -------------------------------------------------------
  // "Abater dívida": a diferença vira uma venda nova PROMISSÓRIA no nome do
  // cliente, gravada no mesmo lote da baixa (tudo ou nada).
  function confirmarBaixaManual(vendaIds, lancamentoIds, resolucao) {
    return executar(async () => {
      const ids = new Set(vendaIds);
      const { ops } = montarOpsBaixa(filialId, {
        vendaIds: [...vendaIds],
        lancamentoIds: [...lancamentoIds],
        automatica: false,
        total: somaValores(vendas, ids),
        resolucao,
        tipo: 'venda',
        colecaoLancamento,
      });
      if (resolucao?.tipo === 'abater-divida') {
        const hoje = hojeISO();
        ops.push({
          tipo: 'set',
          ref: doc(db, 'filiais', filialId, 'pendenciasVendas', `${hoje}_promissoria_${Date.now()}`),
          data: {
            data: hoje,
            numeroVenda: '',
            clienteNome: vendas.find((v) => ids.has(v.id))?.clienteNome ?? '',
            valor: Math.abs(resolucao.valor),
            forma: 'PROMISSÓRIA',
            campo: 'promissoria',
            origem: 'abater-divida-automatica',
            baixaId: null,
            criadoEm: serverTimestamp(),
          },
        });
      }
      await aplicarOps(ops);
      setAviso(null);
    });
  }

  // --- Poda: fecha qualquer combinação marcada, sem exigências -------------
  function confirmarPoda(vendaIds, lancamentoIds, justificativa) {
    return executar(async () => {
      const totalVendas = somaValores(vendas, new Set(vendaIds));
      const totalLanc = somaValores(lancamentos, new Set(lancamentoIds));
      const { ops } = montarOpsBaixa(filialId, {
        vendaIds: [...vendaIds],
        lancamentoIds: [...lancamentoIds],
        automatica: false,
        forcada: true,
        poda: true,
        justificativa,
        total: totalVendas || totalLanc,
        resolucao: null,
        tipo: 'venda',
      });
      await aplicarOps(ops);
    });
  }

  // --- Forçar conciliar: 1 pagamento com cliente associado + justificativa --
  function confirmarForcarConciliar(lancamento, justificativa) {
    const vinculo = vinculoPorChave.get(lancamento.chaveContraparte);
    if (!vinculo) return Promise.resolve(false); // nunca força sem cliente associado
    return executar(async () => {
      const { ops } = montarOpsBaixa(filialId, {
        vendaIds: [],
        lancamentoIds: [lancamento.id],
        automatica: false,
        forcada: true,
        justificativa,
        clienteId: vinculo.clienteId,
        clienteNome: vinculo.clienteNome,
        formaPagamento: abreviarFormaPagamento(lancamento.historico) || 'OUTRA',
        total: lancamento.valor,
        resolucao: null,
        tipo: 'venda',
      });
      await aplicarOps(ops);
    });
  }

  // --- Fechar sem venda (sangria / promissória de conta antiga) ------------
  async function fecharSemVenda(lancamento, motivo, colecao = 'extratoLancamentos') {
    const ok = window.confirm(
      `Marcar este lançamento de ${currency.format(lancamento.valor)} (${formatarData(
        lancamento.data
      )}) como ${LABEL_MOTIVO[motivo]}?\n\nEle sai da fila de pendências sem precisar de uma venda associada.`
    );
    if (!ok) return false;
    return executar(async () => {
      const { ops } = montarOpsBaixa(filialId, {
        vendaIds: [],
        lancamentoIds: [lancamento.id],
        automatica: false,
        forcada: true,
        motivo,
        colecaoLancamento: colecao,
        total: lancamento.valor,
        resolucao: null,
        tipo: 'venda',
      });
      await aplicarOps(ops);
    });
  }

  // Mesmo vínculo conta -> cliente da aba Extrato (mesma coleção e formato).
  function salvarVinculoCliente(lancamento, cliente) {
    const chave = lancamento.chaveContraparte;
    if (!chave) return Promise.resolve(false);
    return executar(() =>
      setDoc(doc(db, 'filiais', filialId, 'vinculosBancarios', idVinculo(chave)), {
        chave,
        banco: lancamento.banco ?? 'bb',
        documento: lancamento.contraparteDocumento ?? '',
        nomeNaConta: lancamento.contraparteNome ?? '',
        clienteId: cliente.id,
        clienteNome: cliente.nome,
        criadoEm: serverTimestamp(),
      })
    );
  }

  return {
    processando,
    aviso,
    setAviso,
    aplicarBaixas,
    confirmarBaixaManual,
    confirmarPoda,
    confirmarForcarConciliar,
    fecharSemVenda,
    salvarVinculoCliente,
  };
}
