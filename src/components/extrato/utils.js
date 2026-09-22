export const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const BANCOS = [
  {
    id: 'bb',
    nome: 'Banco do Brasil',
    disponivel: true,
    nota: 'Extrato exportado do BB Digital (OFX, CSV ou PDF).',
  },
  {
    id: 'rede',
    nome: 'Rede (maquininha)',
    disponivel: true,
    nota: 'Relatório de vendas exportado em .xlsx no site/app da Rede.',
  },
  {
    id: 'itau',
    nome: 'Itaú (maquininha)',
    disponivel: false,
    nota: 'Ainda não implementado — mesmo formato de baixa da Rede (data+valor+bandeira).',
  },
];

export function formatarData(iso) {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

export function formatarDocumento(doc) {
  if (!doc) return '';
  if (doc.length === 11) return doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (doc.length === 14) return doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return doc;
}
