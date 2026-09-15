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
