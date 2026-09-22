// Parser do "Extrato para simples conferência" da Rede (relatório de vendas
// das maquininhas, exportado em .xlsx).
//
// Formato observado (linha 1 = cabeçalho textual solto, linha 2 = nomes das
// colunas, linha 3+ = dados; sempre a mesma ordem de colunas):
//   data da venda | hora da venda | status da venda | valor da venda original
//   | valor da venda atualizado | modalidade | tipo | pré-autorizado |
//   número de parcelas | bandeira | ... (taxas, NSU, etc, não usados aqui)
//
// A baixa contra o BB/Itaú não tem nome de cliente (cartão não identifica
// quem comprou), então o único critério pra casar automaticamente é:
// mesma DATA + mesmo VALOR + mesma BANDEIRA. Por isso este parser só expõe
// esses três campos (mais parcelas, que vai exibido na tabela mas não entra
// no critério de baixa — duas parcelas diferentes da mesma venda têm o
// mesmo valor por parcela recebido em datas diferentes, o "valor da venda
// original" aqui já é o valor total da venda, não da parcela).
//
// Vendas com status diferente de "aprovada" (canceladas, negadas) são
// ignoradas: não existe recebimento pra conciliar.

import * as XLSX from 'xlsx';

const COL = {
  data: 'data da venda',
  status: 'status da venda',
  valor: 'valor da venda original',
  parcelas: 'número de parcelas',
  bandeira: 'bandeira',
  nsu: 'nsu/cv',
};

/** Normaliza "Mastercard"/"MASTERCARD"/" mastercard " etc para comparação. */
export function normalizaBandeira(b) {
  return (b ?? '').toString().trim().toUpperCase();
}

/** Formata Date -> 'YYYY-MM-DD' (chave de comparação, sem fuso). */
function dataParaChave(d) {
  if (d instanceof Date && !Number.isNaN(d.getTime())) {
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }
  // Fallback: string tipo "21-09-2026" ou "21/09/2026", caso a planilha
  // venha sem tipagem de data (depende de como o usuário salvou o .xlsx).
  const s = (d ?? '').toString().trim();
  const m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function acharLinhaCabecalho(matriz) {
  for (let i = 0; i < Math.min(matriz.length, 10); i += 1) {
    const linha = matriz[i].map((c) => (c ?? '').toString().trim().toLowerCase());
    if (linha.includes(COL.data) && linha.includes(COL.bandeira)) {
      return i;
    }
  }
  return -1;
}

/**
 * @param {ArrayBuffer|Uint8Array} arquivo
 * @returns {{ vendas: Array<{data: string, valor: number, bandeira: string,
 *   parcelas: number, linhaOriginal: number}>, erro?: string }}
 *
 * `data` sai como 'YYYY-MM-DD' (comparável direto com o campo de data das
 * vendas do sistema, que deve estar no mesmo formato).
 */
export function parseExtratoRede(arquivo) {
  const wb = XLSX.read(arquivo, { type: 'array', cellDates: true });
  const abaVendas = wb.Sheets['vendas'] ?? wb.Sheets[wb.SheetNames[0]];
  if (!abaVendas) {
    return { vendas: [], erro: 'Não encontrei nenhuma planilha no arquivo.' };
  }

  const matriz = XLSX.utils.sheet_to_json(abaVendas, { header: 1, defval: null, raw: true });
  const idxCabecalho = acharLinhaCabecalho(matriz);
  if (idxCabecalho === -1) {
    return {
      vendas: [],
      erro:
        'Não reconheci o cabeçalho do relatório da Rede. Confirme se é o ' +
        '"Extrato para simples conferência" exportado em .xlsx sem edições.',
    };
  }

  const cabecalho = matriz[idxCabecalho].map((c) => (c ?? '').toString().trim().toLowerCase());
  const idx = {
    data: cabecalho.indexOf(COL.data),
    status: cabecalho.indexOf(COL.status),
    valor: cabecalho.indexOf(COL.valor),
    parcelas: cabecalho.indexOf(COL.parcelas),
    bandeira: cabecalho.indexOf(COL.bandeira),
    nsu: cabecalho.indexOf(COL.nsu),
  };
  const faltando = Object.entries(idx)
    .filter(([chave, v]) => v === -1 && chave !== 'nsu') // nsu é só conveniência, não trava a importação
    .map(([k]) => k);
  if (faltando.length > 0) {
    return {
      vendas: [],
      erro: `Colunas ausentes no relatório: ${faltando.join(', ')}.`,
    };
  }

  const vendas = [];
  for (let i = idxCabecalho + 1; i < matriz.length; i += 1) {
    const linha = matriz[i];
    if (!linha || linha.every((c) => c === null || c === '')) continue; // linha em branco (rodapé)

    const status = (linha[idx.status] ?? '').toString().trim().toLowerCase();
    if (status !== 'aprovada') continue; // cancelada/negada não gera recebimento

    const dataChave = dataParaChave(linha[idx.data]);
    const valor = Number(linha[idx.valor]);
    const bandeira = normalizaBandeira(linha[idx.bandeira]);
    const parcelas = Number(linha[idx.parcelas]) || 1;

    if (!dataChave || !Number.isFinite(valor) || !bandeira) continue; // linha corrompida, ignora

    const nsu = idx.nsu !== -1 ? (linha[idx.nsu] ?? '').toString().trim() : '';

    vendas.push({
      data: dataChave,
      valor: Math.round(valor * 100) / 100,
      bandeira,
      parcelas,
      nsu, // não entra no critério de baixa, só identifica a linha pra dedupe
      linhaOriginal: i + 1, // 1-based, útil pra debug/mensagem de erro
    });
  }

  return { vendas };
}
