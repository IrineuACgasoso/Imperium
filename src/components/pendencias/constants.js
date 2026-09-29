// Fontes do extrato mostrado na coluna direita. 'bb' é o extrato bancário
// (conciliação por nome). Cada adquirente de cartão casa por
// data+valor+bandeira, nunca por nome. Adicionar Itaú/outro = incluir aqui.
export const FONTES_EXTRATO = [
  { id: 'bb', label: 'BB' },
  { id: 'rede', label: 'Rede' },
  { id: 'itau', label: 'Itaú' },
];

export const rotuloFonte = (id) => FONTES_EXTRATO.find((f) => f.id === id)?.label ?? id;

// Opções do modal "valores não batem" quando falta receber.
export const FORMAS_COMPLEMENTO = [
  { value: 'dinheiro', label: 'Pagou o restante em dinheiro' },
  { value: 'pix', label: 'Pagou o restante em Pix (fora deste extrato)' },
  { value: 'cartao', label: 'Pagou o restante no cartão' },
  { value: 'boleto', label: 'Pagou o restante em boleto' },
  { value: 'promissoria', label: 'Ficou em promissória (crediário)' },
  { value: 'desconto', label: 'Desconto concedido / acerto' },
  { value: 'abater-divida', label: 'Abater dívida (gera promissória automática pro cliente)' },
];
