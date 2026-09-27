import ExcelJS from 'exceljs';

const VERDE = 'FF2E7D32'; // fechado (baixaId presente)
const PRETO = 'FF1A1A1A'; // pendente
const VERMELHO = 'FFC00000'; // valor de gasto
const AZUL = 'FF0070C0'; // valor de lucro

/**
 * Gera o .xlsx "Data / Descrição / Gastos / Lucros / Saldo" a partir das
 * linhas já prontas de `montarLinhasExtrato` e dispara o download no
 * navegador. Não recebe nada do Firestore diretamente — só desenha o que já
 * foi calculado, pra manter a lógica de agrupamento/saldo (extratoExport.js)
 * testável sem precisar de um navegador.
 */
export async function gerarExcelExtrato(linhas, nomeArquivo = 'extrato.xlsx') {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Extrato');

  ws.columns = [
    { header: 'Data', width: 12 },
    { header: 'Descrição', width: 45 },
    { header: 'Gastos', width: 14 },
    { header: 'Lucros', width: 14 },
    { header: 'Saldo', width: 14 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { horizontal: 'center' };

  linhas.forEach((linha) => {
    const row = ws.addRow([linha.data, linha.descricao, linha.gasto, linha.lucro, linha.saldo]);
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(4).alignment = { horizontal: 'center' };
    row.getCell(5).alignment = { horizontal: 'center' };

    if (linha.gasto != null) {
      row.getCell(3).numFmt = '#,##0.00';
      row.getCell(3).font = { color: { argb: VERMELHO } };
    }
    if (linha.lucro != null) {
      row.getCell(4).numFmt = '#,##0.00';
      row.getCell(4).font = { color: { argb: AZUL } };
    }
    row.getCell(5).numFmt = '#,##0.00';

    // Cor do nome: verde = já conciliado (baixaId), preto = ainda pendente.
    // `fechado === null` é linha de gasto — não existe "conciliar" um gasto
    // nesta planilha, então o nome fica sem cor especial.
    if (linha.fechado === true) {
      row.getCell(2).font = { color: { argb: VERDE } };
    } else if (linha.fechado === false) {
      row.getCell(2).font = { color: { argb: PRETO } };
    }
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
