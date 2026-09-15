// Prompt + schema para o tipo "mensal-historico": um print/gráfico/tabela
// mostrando totais AGREGADOS por mês (sem detalhe diário), como o exemplo do
// "Gráfico Barra" com um valor total por mês.

export const promptHistoricoMensal = `Você é um extrator de dados financeiros. Vai
receber uma imagem (gráfico, tabela ou relatório) mostrando o TOTAL DE VENDAS de cada
MÊS de uma loja de varejo — dados agregados, sem detalhe por dia.

Extraia uma lista com um item por mês visível no documento: o mês/ano (formato
YYYY-MM) e o valor total de vendas daquele mês. Números devem ser extraídos
exatamente como aparecem (remova "R$", troque vírgula decimal por ponto). Não invente
meses que não estejam no documento e não tente adivinhar valores diários.

Responda SOMENTE com o JSON no formato do schema fornecido, nada além disso.`;

export const schemaHistoricoMensal = {
  type: 'object',
  properties: {
    meses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          mes: { type: 'string', description: 'Formato YYYY-MM' },
          totalVendas: { type: 'number' },
        },
        required: ['mes', 'totalVendas'],
      },
    },
  },
  required: ['meses'],
};
