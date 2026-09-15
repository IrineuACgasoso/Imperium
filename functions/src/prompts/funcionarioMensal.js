// Prompt + schema para o tipo "funcionario-mensal": relatório de vendas por
// vendedor/funcionário.
//
// IMPORTANTE: o relatório pode conter VÁRIOS MESES (é comum o sistema da loja
// exportar um histórico com várias colunas/seções de mês). A versão anterior
// deste schema só tinha um campo `mes` no topo, então o Gemini era forçado a
// escolher UM único mês e o resto do histórico era descartado silenciosamente.
// Agora a estrutura é uma lista de meses, cada um com seus funcionários.

export const promptFuncionarioMensal = `Você é um extrator de dados financeiros. Vai
receber um relatório mostrando o TOTAL DE VENDAS de cada FUNCIONÁRIO/VENDEDOR de uma
loja de varejo.

ATENÇÃO — O RELATÓRIO PODE CONTER VÁRIOS MESES. Extraia TODOS os meses presentes no
documento, não apenas o mais recente. Se houver uma tabela com um mês por coluna (ou
por seção/página), cada um desses meses deve virar uma entrada separada no array
"meses". Não resuma, não agregue meses diferentes num só, e não omita meses antigos.

Para CADA mês encontrado, extraia:
- "mes": o mês/ano no formato YYYY-MM
- "funcionarios": lista com o nome de cada funcionário e o total vendido por ele
  NAQUELE mês.

Use o nome do funcionário exatamente como aparece no documento (mantendo acentos).
Números devem ser extraídos exatamente como aparecem (remova "R$", troque vírgula
decimal por ponto). Não invente funcionários nem meses que não estejam no documento.
Se um funcionário não tiver venda em determinado mês, simplesmente não o inclua
naquele mês (ou use 0 se o documento explicitamente mostrar zero).

Responda SOMENTE com o JSON no formato do schema fornecido, nada além disso.`;

export const schemaFuncionarioMensal = {
  type: 'object',
  properties: {
    meses: {
      type: 'array',
      description: 'Todos os meses presentes no relatório',
      items: {
        type: 'object',
        properties: {
          mes: { type: 'string', description: 'Formato YYYY-MM' },
          funcionarios: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                nome: { type: 'string' },
                totalVendido: { type: 'number' },
              },
              required: ['nome', 'totalVendido'],
            },
          },
        },
        required: ['mes', 'funcionarios'],
      },
    },
  },
  required: ['meses'],
};
