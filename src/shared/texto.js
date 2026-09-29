// Mesma normalização usada nos parsers/matching de funcionário e cliente:
// sem acento, maiúsculo, espaços colapsados — é assim que decidimos se
// "José da Silva" e "jose  DA SILVA" são a mesma pessoa (nome completo
// importa: sobrenomes diferentes = pessoas diferentes, mesmo com o mesmo
// primeiro nome). Antes vivia dentro de ClientesTab.jsx e VendasTab importava
// direto do componente vizinho (acoplamento entre abas).
export function normalizarNomeCliente(nome) {
  return (nome ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Mesma ideia, só que pra comparar `historico` do extrato (ex: identificar
// "Cobrança" independente de acento/caixa) — minúsculo em vez de maiúsculo
// só por convenção de quem já usava isso antes (extratoExport.js).
export function normalizarHistorico(historico) {
  return (historico ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}
