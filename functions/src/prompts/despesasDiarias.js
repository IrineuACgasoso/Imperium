// Prompt + schema para o tipo "despesas-diarias": o relatório diário de
// despesas da loja (lista de lançamentos avulsos do dia).
//
// Regras de negócio embutidas no prompt, combinadas com o usuário:
//
// 1. Tudo que for despesa "operacional do dia" — categorias DESPESAS,
//    GASOLINA e SERVIÇOS, sejam quais forem os itens — é SOMADO num único
//    valor, que representa a despesa do dia. Não interessa o detalhe item a
//    item; interessa o total.
// 2. SANGRIAS são IGNORADAS. Sangria é só transferência de dinheiro do caixa
//    (o dinheiro continua entrando/existindo), não é uma despesa de verdade.
//    Somar sangria inflaria os gastos artificialmente.
// 3. ADIANTAMENTOS (de salário/vale) são extraídos SEPARADAMENTE, um por
//    funcionário, porque cada um precisa virar um gasto vinculado àquela
//    pessoa — é isso que alimenta a coluna "Descontos" na aba Funcionários.
// 4. Outras categorias explícitas (ALUGUEL, IMPOSTOS, PEDIDOS, SALÁRIO)
//    saem como lançamentos próprios, sem serem somadas à despesa do dia.

export const promptDespesasDiarias = `Você é um extrator de dados financeiros. Vai receber um
RELATÓRIO DIÁRIO DE DESPESAS de uma loja de varejo, com uma lista de lançamentos.

Identifique primeiro a data do relatório (campo "data", formato YYYY-MM-DD) — normalmente
aparece como "Período", "Data" ou no cabeçalho.

Agora classifique CADA lançamento do relatório seguindo EXATAMENTE estas regras:

REGRA 1 — DESPESA OPERACIONAL DO DIA (campo "despesaOperacionalDoDia"):
Todo lançamento cuja categoria seja DESPESAS, GASOLINA ou SERVIÇOS (qualquer serviço,
não importa qual) deve ser SOMADO em um único número. Não liste esses itens
individualmente; devolva apenas a soma total deles no campo "despesaOperacionalDoDia".
Se não houver nenhum lançamento desses, devolva 0.

REGRA 2 — SANGRIAS SÃO IGNORADAS:
Lançamentos de SANGRIA (ou "sangria de caixa") NÃO são despesa e devem ser
completamente ignorados. Não os some em lugar nenhum. Apenas informe quantos
lançamentos de sangria você ignorou, no campo "sangriasIgnoradas".

REGRA 3 — ADIANTAMENTOS SÃO SEPARADOS POR FUNCIONÁRIO:
Lançamentos de ADIANTAMENTO (adiantamento de salário, vale, vale-salário) devem ser
extraídos individualmente no array "adiantamentos", cada um com o NOME DO FUNCIONÁRIO
exatamente como aparece no documento e o valor. Se o mesmo funcionário aparecer mais de
uma vez, some os valores dele em um único item.

REGRA 4 — OUTRAS CATEGORIAS:
Lançamentos de ALUGUEL, IMPOSTOS, PEDIDOS ou SALÁRIO vão no array "outrosLancamentos",
cada um com sua categoria (em MAIÚSCULAS), valor e uma descrição curta. NÃO os some na
despesa operacional do dia.

Números: remova "R$" e troque vírgula decimal por ponto. Nunca invente valores. Se um
valor não estiver legível, use 0.

Responda SOMENTE com o JSON no formato do schema fornecido, nada além disso.`;

export const schemaDespesasDiarias = {
  type: 'object',
  properties: {
    data: { type: 'string', description: 'Data do relatório, formato YYYY-MM-DD' },
    despesaOperacionalDoDia: {
      type: 'number',
      description: 'Soma de DESPESAS + GASOLINA + SERVIÇOS do dia',
    },
    sangriasIgnoradas: {
      type: 'number',
      description: 'Quantos lançamentos de sangria foram ignorados',
    },
    adiantamentos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          funcionarioNome: { type: 'string' },
          valor: { type: 'number' },
        },
        required: ['funcionarioNome', 'valor'],
      },
    },
    outrosLancamentos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          categoria: { type: 'string' },
          valor: { type: 'number' },
          descricao: { type: 'string' },
        },
        required: ['categoria', 'valor', 'descricao'],
      },
    },
  },
  required: [
    'data',
    'despesaOperacionalDoDia',
    'sangriasIgnoradas',
    'adiantamentos',
    'outrosLancamentos',
  ],
};
