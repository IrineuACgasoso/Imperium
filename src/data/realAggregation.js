// Transforma os dados brutos do Firestore (diário, mensal histórico) em
// séries prontas pro gráfico — no mesmo formato do mock: [{date, value}].
//
// LIMITAÇÕES CONHECIDAS, assumidas conscientemente por ora:
// - Histórico mensal (registrosMensaisHistoricos) só entra na série de
//   "Vendas Totais" pra preencher meses SEM nenhum registro diário — evita
//   contar em dobro quando ambos existem pro mesmo mês, mas mistura um
//   ponto único por mês (dia 1) com pontos diários no mesmo gráfico. É uma
//   aproximação visual, não uma soma matematicamente perfeita por dia.

function dailyField(registrosDiarios, field) {
  return registrosDiarios
    .filter((r) => r.vendas && r.vendas[field] != null)
    .map((r) => ({ date: r.data, value: r.vendas[field] }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function mergeWithHistorico(dailySeries, registrosMensaisHistoricos) {
  const monthsWithDaily = new Set(dailySeries.map((p) => p.date.slice(0, 7)));
  const historicoPoints = registrosMensaisHistoricos
    .filter((r) => !monthsWithDaily.has(r.mes))
    .map((r) => ({ date: `${r.mes}-01`, value: r.totalVendas }));
  return [...historicoPoints, ...dailySeries].sort((a, b) => a.date.localeCompare(b.date));
}

export function buildRealMetricSeries({ registrosDiarios, registrosMensaisHistoricos }) {
  return {
    vendasTotais: mergeWithHistorico(
      dailyField(registrosDiarios, 'totalVendas'),
      registrosMensaisHistoricos
    ),
    vendasPix: dailyField(registrosDiarios, 'pix'),
    vendasCartao: dailyField(registrosDiarios, 'cartao'),
    vendasBoleto: dailyField(registrosDiarios, 'boleto'),
    vendasPromissoria: dailyField(registrosDiarios, 'promissoria'),
    vendasDinheiro: dailyField(registrosDiarios, 'dinheiro'),
  };
}

export function buildFuncionarioSeries(vendasPorFuncionarioMensal, funcionarioId) {
  return vendasPorFuncionarioMensal
    .filter((v) => v.funcionarioId === funcionarioId)
    .map((v) => ({ date: `${v.mes}-01`, value: v.totalVendido }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Agrupa vendasPorFuncionarioMensal por funcionário, no formato
 * { [funcionarioId]: [{date, value}] } — base pra montar a série somada +
 * breakdown do modo "por funcionário" do gráfico.
 */
export function groupFuncionarioSeriesById(vendasPorFuncionarioMensal) {
  const grouped = {};
  vendasPorFuncionarioMensal.forEach((v) => {
    if (!grouped[v.funcionarioId]) grouped[v.funcionarioId] = [];
    grouped[v.funcionarioId].push({ date: `${v.mes}-01`, value: v.totalVendido });
  });
  return grouped;
}

/**
 * Prestação de contas de um dia específico (aba Vendas): devolve o registro
 * diário cru (com todas as formas de pagamento) ou null se não houve
 * lançamento naquele dia.
 */
export function getDayVendasDetail(registrosDiarios, iso) {
  const registro = registrosDiarios.find((r) => r.data === iso);
  return registro ?? null;
}
