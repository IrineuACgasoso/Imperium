// Fonte única das categorias de gasto — usada tanto no cadastro (GastosTab)
// quanto no seletor de exibição do gráfico na aba Gastos. Manter aqui evita
// as duas listas saírem de sincronia.

export const CATEGORIAS_GASTO = [
  'DESPESAS',
  'ALUGUEL',
  'SALÁRIO',
  'PEDIDOS',
  'IMPOSTOS',
  'GASOLINA',
  'ADIANTAMENTO SALÁRIO',
];

// Categoria "guarda-chuva" atribuída automaticamente a todo débito importado
// do extrato que ainda não foi associado a nada — nunca aparece na lista de
// escolha (não é uma categoria de verdade), só sinaliza "falta categorizar".
export const CATEGORIA_PENDENTE = 'A CATEGORIZAR';

// Qual campo extra cada categoria abre. `funcionario` usa a lista de
// funcionários cadastrados (fechada); `lista` usa uma lista auxiliar que
// cresce sozinha conforme o usuário digita nomes novos. Compartilhado entre
// o formulário de Gastos e o "Associar Gasto" do extrato, pra manter as
// duas telas categorizando exatamente do mesmo jeito.
export const CAMPO_EXTRA_GASTO = {
  'SALÁRIO': { tipo: 'funcionario', label: 'Funcionário' },
  'ADIANTAMENTO SALÁRIO': { tipo: 'funcionario', label: 'Funcionário' },
  GASOLINA: { tipo: 'funcionario', label: 'Funcionário' },
  PEDIDOS: { tipo: 'lista', lista: 'distribuidoras', label: 'Distribuidora' },
  IMPOSTOS: { tipo: 'lista', lista: 'tiposImposto', label: 'Tipo' },
};


// Chave usada no gráfico para "todos os gastos somados".
export const GASTOS_TODOS_KEY = 'gastos';

export const OPCOES_GRAFICO_GASTOS = [
  { key: GASTOS_TODOS_KEY, label: 'Todos os gastos' },
  ...CATEGORIAS_GASTO.map((c) => ({
    key: `gastos:${c}`,
    label: c.charAt(0) + c.slice(1).toLowerCase(),
    categoria: c,
  })),
];
