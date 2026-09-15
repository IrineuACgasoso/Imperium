// Prompt + schema para o tipo "diario": um caixa sintético de um único dia,
// como o PDF "Caixa Sintético" que serviu de referência para este projeto.

export const promptDiario = `Você é um extrator de dados financeiros. Vai receber um
relatório de "caixa sintético" de UM ÚNICO DIA de uma loja de varejo.

Extraia os valores para os seguintes campos. Se um campo não aparecer no documento,
use 0. Nunca invente valores. Números devem ser extraídos exatamente como aparecem
(remova o "R$" e troque vírgula decimal por ponto), sem arredondar.

O campo "cartao" deve somar TODOS os valores de cartão do documento (débito, crédito,
parcelado, rotativo, qualquer bandeira) em um único número.

Identifique também a data do relatório (campo "data", formato YYYY-MM-DD) — normalmente
aparece como "Período" ou no cabeçalho do documento.

Responda SOMENTE com o JSON no formato do schema fornecido, nada além disso.`;

export const schemaDiario = {
  type: 'object',
  properties: {
    data: { type: 'string', description: 'Data do caixa, formato YYYY-MM-DD' },
    vendas: {
      type: 'object',
      properties: {
        dinheiro: { type: 'number' },
        cartao: { type: 'number' },
        pix: { type: 'number' },
        boleto: { type: 'number' },
        promissoria: { type: 'number' },
        outros: { type: 'number' },
        totalAVista: { type: 'number' },
        totalAPrazo: { type: 'number' },
        totalVendas: { type: 'number' },
      },
      required: [
        'dinheiro',
        'cartao',
        'pix',
        'boleto',
        'promissoria',
        'outros',
        'totalAVista',
        'totalAPrazo',
        'totalVendas',
      ],
    },
    caixa: {
      type: 'object',
      properties: {
        saldoInicial: { type: 'number' },
        suprimento: { type: 'number' },
        sangria: { type: 'number' },
        despesas: { type: 'number' },
        vales: { type: 'number' },
        totalCaixa: { type: 'number' },
      },
      required: ['saldoInicial', 'suprimento', 'sangria', 'despesas', 'vales', 'totalCaixa'],
    },
    ajustes: {
      type: 'object',
      properties: {
        descontos: { type: 'number' },
        trocas: { type: 'number' },
        cancelamentos: { type: 'number' },
        valeCredito: { type: 'number' },
      },
      required: ['descontos', 'trocas', 'cancelamentos', 'valeCredito'],
    },
  },
  required: ['data', 'vendas', 'caixa', 'ajustes'],
};
