// Motor da conciliação CDS x extrato bancário.
//
// REGRA DE OURO: a automação só encosta em par 1:1 — uma venda, um
// pagamento, mesmo cliente, mesmo valor exato. Qualquer coisa fora disso
// (nome que não bate exatamente, valor com um centavo de diferença, duas
// vendas candidatas, dois pagamentos candidatos, conta sem cliente
// associado) fica PENDENTE para você resolver na mão. É mais barato deixar
// pendente do que dar baixa errada: baixa errada some do radar e vira buraco
// contábil que só aparece meses depois.

export function centavos(valor) {
  return Math.round((Number(valor) || 0) * 100);
}

/**
 * Comparação de nome para a baixa AUTOMÁTICA.
 *
 * Deliberadamente rígida: comparamos os nomes exatamente como estão
 * gravados, sem tirar acento, sem ignorar maiúscula/minúscula, sem apelidos.
 * A única concessão é colapsar espaços repetidos e espaço nas pontas, porque
 * isso é ruído de PDF, não diferença de pessoa.
 *
 * O motivo é o que você levantou: muitos clientes compartilham três
 * sobrenomes e diferem num único nome do meio. Qualquer flexibilização aqui
 * (ignorar acento, comparar só o primeiro nome, distância de edição) troca
 * "não conciliou sozinho" por "conciliou na pessoa errada".
 */
export function mesmoNomeExato(a, b) {
  const limpa = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
  const va = limpa(a);
  const vb = limpa(b);
  return va !== '' && va === vb;
}

/**
 * Casamento automático 1:1.
 *
 * @param {Array} vendas       vendas pendentes do CDS
 * @param {Array} lancamentos  lançamentos pendentes do extrato
 * @param {Map}   vinculos     chaveContraparte -> {clienteId, clienteNome}
 * @returns {{pares: Array<{venda, lancamento}>, motivos: Object}}
 */
export function casarAutomatico(vendas, lancamentos, vinculos) {
  const motivos = {
    semVinculo: 0,
    semVendaCorrespondente: 0,
    ambiguo: 0,
  };

  // Só crédito entra: débito é dinheiro saindo, nunca quita uma venda.
  const candidatos = lancamentos
    .filter((l) => l.tipo === 'credito' && !l.baixaId)
    .map((l) => ({ lancamento: l, vinculo: vinculos.get(l.chaveContraparte) }));

  const vendasAbertas = vendas.filter((v) => !v.baixaId);

  const pares = [];
  const vendasUsadas = new Set();

  candidatos.forEach(({ lancamento, vinculo }) => {
    if (!vinculo?.clienteNome) {
      motivos.semVinculo += 1;
      return;
    }

    const compativeis = vendasAbertas.filter(
      (v) =>
        !vendasUsadas.has(v.id) &&
        mesmoNomeExato(v.clienteNome, vinculo.clienteNome) &&
        centavos(v.valor) === centavos(lancamento.valor)
    );

    if (compativeis.length === 0) {
      motivos.semVendaCorrespondente += 1;
      return;
    }

    // Duas vendas idênticas do mesmo cliente no mesmo valor: impossível saber
    // qual desse pagamento quitou. Fica pendente, você decide.
    if (compativeis.length > 1) {
      motivos.ambiguo += 1;
      return;
    }

    // Do outro lado vale a mesma prudência: se DOIS pagamentos batem com
    // essa mesma venda, também é ambíguo (pode ser pagamento duplicado, pode
    // ser outra venda ainda não importada).
    const pagamentosCompativeis = candidatos.filter(
      ({ lancamento: outro, vinculo: v2 }) =>
        v2?.clienteNome &&
        mesmoNomeExato(v2.clienteNome, vinculo.clienteNome) &&
        centavos(outro.valor) === centavos(lancamento.valor)
    );
    if (pagamentosCompativeis.length > 1) {
      motivos.ambiguo += 1;
      return;
    }

    vendasUsadas.add(compativeis[0].id);
    pares.push({ venda: compativeis[0], lancamento });
  });

  return { pares, motivos };
}

/** Diferença entre o total selecionado de cada lado (CDS - extrato). */
export function diferencaSelecao(vendasSel, lancamentosSel) {
  const totalVendas = vendasSel.reduce((s, v) => s + centavos(v.valor), 0);
  const totalPagos = lancamentosSel.reduce((s, l) => s + centavos(l.valor), 0);
  return {
    totalVendas: totalVendas / 100,
    totalPagos: totalPagos / 100,
    diferenca: (totalVendas - totalPagos) / 100,
    bate: totalVendas === totalPagos,
  };
}

export const DIAS_RETENCAO_BAIXAS = 7;

/** Uma baixa fechada há mais de 7 dias já pode ser apagada do banco. */
export function baixaExpirada(baixa, agora = Date.now()) {
  const ms = baixa?.fechadoEmMs ?? baixa?.fechadoEm?.toMillis?.();
  if (!ms) return false;
  return agora - ms > DIAS_RETENCAO_BAIXAS * 24 * 60 * 60 * 1000;
}

/**
 * Baixa automática do lado dos GASTOS (débitos do extrato).
 *
 * Aqui não existe ambiguidade de nome/valor como do lado das vendas — a
 * única pergunta é "esse pagamento já foi categorizado?". Se a conta que
 * recebeu o débito já tem um vínculo de gasto (categoria + referência,
 * criado manualmente uma vez via "Associar Gasto"), o lançamento pode ser
 * fechado sozinho a cada nova importação. Sem vínculo, fica pendente — a
 * automação nunca inventa uma categoria.
 */
export function casarGastosAutomatico(lancamentosDebito, vinculosGasto) {
  const fechaveis = lancamentosDebito.filter(
    (l) => l.tipo === 'debito' && !l.baixaId && l.chaveContraparte && vinculosGasto.get(l.chaveContraparte)
  );
  return fechaveis.map((l) => ({ lancamento: l, vinculo: vinculosGasto.get(l.chaveContraparte) }));
}
