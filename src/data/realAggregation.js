import { CATEGORIAS_GASTO } from './categoriasGasto.js';

// Transforma os dados brutos do Firestore (diário, mensal histórico, gastos)
// em séries prontas pro gráfico — no mesmo formato do mock: [{date, value}].
//
// LIMITAÇÕES CONHECIDAS, assumidas conscientemente por ora:
// - "Lucro" aqui é vendas − despesas do caixa diário − gastos avulsos.
//   NÃO desconta comissão de funcionário, porque comissão só é calculável
//   com granularidade mensal (vendasPorFuncionarioMensal), e misturar um
//   desconto mensal dentro de uma série diária de lucro distorceria os dias
//   individuais. Cálculo de lucro com comissão fica pra quando isso for
//   pedido explicitamente.
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

function buildGastosPorDia(registrosDiarios, gastos) {
  const map = new Map();
  registrosDiarios.forEach((r) => {
    const despesas = r.caixa?.despesas ?? 0;
    if (despesas) map.set(r.data, (map.get(r.data) ?? 0) + despesas);
  });
  gastos.forEach((g) => {
    if (g.data && g.valor) map.set(g.data, (map.get(g.data) ?? 0) + Number(g.valor));
  });
  return map;
}

function gastosSeries(registrosDiarios, gastos) {
  const map = buildGastosPorDia(registrosDiarios, gastos);
  return Array.from(map.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function lucroSeries(registrosDiarios, gastos) {
  const gastosMap = buildGastosPorDia([], gastos); // só os avulsos aqui, despesas do caixa somamos abaixo
  return registrosDiarios
    .filter((r) => r.vendas)
    .map((r) => {
      const totalVendas = r.vendas.totalVendas ?? 0;
      const despesasCaixa = r.caixa?.despesas ?? 0;
      const gastosAvulsos = gastosMap.get(r.data) ?? 0;
      return { date: r.data, value: totalVendas - despesasCaixa - gastosAvulsos };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function gastosPorCategoriaSeries(gastos, categoria) {
  const map = new Map();
  gastos
    .filter((g) => (g.categoria ?? '').toUpperCase() === categoria)
    .forEach((g) => {
      if (!g.data) return;
      map.set(g.data, (map.get(g.data) ?? 0) + Number(g.valor ?? 0));
    });
  return Array.from(map.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function buildRealMetricSeries({ registrosDiarios, registrosMensaisHistoricos, gastos }) {
  const porCategoria = {};
  CATEGORIAS_GASTO.forEach((c) => {
    porCategoria[`gastos:${c}`] = gastosPorCategoriaSeries(gastos, c);
  });

  return {
    ...porCategoria,
    vendasTotais: mergeWithHistorico(
      dailyField(registrosDiarios, 'totalVendas'),
      registrosMensaisHistoricos
    ),
    vendasPix: dailyField(registrosDiarios, 'pix'),
    vendasCartao: dailyField(registrosDiarios, 'cartao'),
    vendasBoleto: dailyField(registrosDiarios, 'boleto'),
    vendasPromissoria: dailyField(registrosDiarios, 'promissoria'),
    vendasDinheiro: dailyField(registrosDiarios, 'dinheiro'),
    gastos: gastosSeries(registrosDiarios, gastos),
    lucro: lucroSeries(registrosDiarios, gastos),
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

/**
 * Prestação de contas de um dia específico (aba Gastos): lista os gastos
 * avulsos lançados naquele dia, mais (se houver) as despesas que vieram
 * dentro do caixa diário importado por IA.
 */
export function getDayGastosDetail(registrosDiarios, gastos, iso) {
  const avulsos = gastos.filter((g) => g.data === iso);
  const registroDia = registrosDiarios.find((r) => r.data === iso);
  const despesasCaixa = registroDia?.caixa?.despesas ?? 0;
  return { avulsos, despesasCaixa };
}
