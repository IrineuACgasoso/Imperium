// Parser específico do relatório "Caixa Detalhado" (um único dia) do CDS.
// Puro texto/regex — nenhuma IA envolvida. Ver parsers/pdfToText.js para
// como o PDF vira texto linha-a-linha antes de chegar aqui.

const MESES_ABREV = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

function paraNumero(str) {
  return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
}

// Classifica o rótulo "Forma de Pgto: X" do CDS num dos 6 campos que o
// Imperium usa. Qualquer coisa que não seja dinheiro/pix/boleto/transferência
// é bandeira de cartão (débito ou crédito, à vista ou parcelado) — cartões
// parcelados (ex: "VISA PARC") ainda são cartão, não promissória; a loja
// não usou nenhuma forma chamada "promissória" neste relatório de exemplo,
// mas o campo já fica pronto pra reconhecer caso apareça.
function classificarFormaPagamento(forma) {
  const f = forma.toUpperCase();
  if (f.includes('DINHEIRO')) return 'dinheiro';
  if (f.includes('PIX')) return 'pix';
  if (f.includes('BOLETO')) return 'boleto';
  if (f.includes('PROMISS')) return 'promissoria';
  if (f.includes('TRANSFER')) return 'outros';
  return 'cartao'; // ELO, VISA, MASTER, HIPER, AMEX, etc — qualquer bandeira
}

/**
 * @param {string} texto — saída de extrairTextoPdf para um "Caixa Detalhado".
 * @returns {{
 *   data: string,               // YYYY-MM-DD
 *   vendas: {dinheiro,cartao,pix,boleto,promissoria,outros,totalVendas},
 *   totalRelatado: number,      // "Subtotal Vendas" impresso no rodapé
 *   consistente: boolean,       // soma bateu com o total impresso?
 *   clientesNovos: string[],    // nomes únicos de cliente (sem "CONSUMIDOR")
 * }}
 */
export function parseCaixaDiario(texto) {
  const linhas = texto.split('\n').map((l) => l.trim()).filter(Boolean);

  // Data do relatório: "Período: 16/09/2026 à 16/09/2026"
  const matchPeriodo = texto.match(/Per[ií]odo:\s*(\d{2})\/(\d{2})\/(\d{4})/);
  const data = matchPeriodo
    ? `${matchPeriodo[3]}-${matchPeriodo[2]}-${matchPeriodo[1]}`
    : null;

  const vendas = { dinheiro: 0, cartao: 0, pix: 0, boleto: 0, promissoria: 0, outros: 0 };
  const clientesNovos = new Set();
  let formaAtual = null;

  linhas.forEach((linha) => {
    const inicioForma = linha.match(/^Forma de Pgto:\s*(.+)$/i);
    if (inicioForma) {
      formaAtual = inicioForma[1].trim();
      return;
    }

    // Linhas de cliente têm data no formato dd/mm/aaaa em algum ponto do meio
    // (venda ou dinheiro) e terminam em "R$ valor". Como o layout varia entre
    // a seção de venda parcelada/boleto (linha por parcela) e a seção
    // "Forma de Pgto: DINHEIRO" (uma linha por venda, sem número de venda
    // separado), extraímos o nome de cliente de forma genérica: tudo entre
    // a segunda ocorrência de data (dd/mm/aaaa) e o "R$" final.
    const matchLinhaCliente = linha.match(
      /\d{2}\/\d{2}\/\d{4}\s+(.+?)\s+(?:\d{2}\/\d{2}\/\d{4}\s+)?R\$\s*([\d.,]+)\s*$/
    );
    if (matchLinhaCliente && formaAtual) {
      const nome = matchLinhaCliente[1].trim();
      if (nome && nome.toUpperCase() !== 'CONSUMIDOR') clientesNovos.add(nome);
    }

    // Totais por forma de pagamento: "TOTAL PIX RECIFE R$ 8.384,84"
    const matchTotalForma = linha.match(/^TOTAL\s+.+?R\$\s*([\d.,]+)\s*$/i);
    if (matchTotalForma && formaAtual) {
      const campo = classificarFormaPagamento(formaAtual);
      vendas[campo] += paraNumero(matchTotalForma[1]);
      formaAtual = null;
    }
  });

  const matchSubtotal = texto.match(/Subtotal Vendas\s*R\$\s*([\d.,]+)/i);
  const totalRelatado = matchSubtotal ? paraNumero(matchSubtotal[1]) : null;
  const totalVendas = Object.values(vendas).reduce((a, b) => a + b, 0);

  return {
    data,
    vendas: { ...vendas, totalVendas },
    totalRelatado,
    // Diferença de até 1 centavo é só arredondamento de parcelas — não vale
    // marcar como inconsistente por causa disso.
    consistente: totalRelatado == null || Math.abs(totalRelatado - totalVendas) < 0.02,
    clientesNovos: Array.from(clientesNovos).sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * Parser "generalista" de período: relatórios "Vendas por Mês" (um mês por
 * linha, formato "Mai/2026   580.870,34   580.870,34"). Mesmo formato serve
 * tanto pro histórico geral da filial quanto pro relatório de um único
 * funcionário — quem chama decide onde salvar cada um.
 */
export function parseVendasPorMes(texto) {
  const regexLinha = /^([A-Za-zçÇãÃ]{3})\/(\d{4})\s+([\d.,]+)/gm;
  const meses = [];
  let m;
  while ((m = regexLinha.exec(texto)) !== null) {
    const abrev = m[1].toLowerCase().slice(0, 3);
    const numeroMes = MESES_ABREV[abrev];
    if (!numeroMes) continue; // ex: linha "Total Geral" não bate o padrão de mês
    meses.push({
      mes: `${m[2]}-${pad2(numeroMes)}`,
      totalVendas: paraNumero(m[3]),
    });
  }
  return meses;
}
