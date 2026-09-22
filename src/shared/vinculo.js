// IDs determinísticos usados para vincular lançamentos de extrato/pendências
// a categorias de gasto/venda já resolvidas. Usado tanto por Extrato quanto
// por Pendências — antes vivia dentro de ExtratoTab.jsx e Pendências importava
// direto do componente vizinho (acoplamento entre abas).
export function idVinculo(chave) {
  return chave.replace(/[^\w]/g, '_');
}

export function idVinculoGasto(chave) {
  return `gasto_${chave.replace(/[^\w]/g, '_')}`;
}
