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
