import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

/**
 * Extrai o texto de um PDF (File ou ArrayBuffer), uma string por página,
 * juntando itens da mesma linha (mesma coordenada Y, tolerância de 2px) e
 * ordenando por X — é assim que reconstituímos "linhas" de uma tabela a
 * partir dos fragmentos soltos que o PDF realmente guarda internamente.
 *
 * Os relatórios do CDS são gerados por um motor de PDF que não embute
 * nenhuma estrutura de tabela real (é tudo texto posicionado livremente),
 * então esse reagrupamento por linha é o que torna possível parsear como se
 * fosse um arquivo de texto tabulado.
 */
export async function extrairTextoPdf(fileOrBuffer) {
  const buffer =
    fileOrBuffer instanceof ArrayBuffer ? fileOrBuffer : await fileOrBuffer.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const paginas = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    const linhas = new Map(); // y arredondado -> itens
    content.items.forEach((item) => {
      const y = Math.round(item.transform[5] / 2) * 2; // tolerância de 2px
      if (!linhas.has(y)) linhas.set(y, []);
      linhas.get(y).push(item);
    });

    const linhasOrdenadas = Array.from(linhas.entries())
      .sort((a, b) => b[0] - a[0]) // Y decrescente = topo pro fundo da página
      .map(([, itens]) =>
        itens
          .sort((a, b) => a.transform[4] - b.transform[4]) // X crescente
          .map((it) => it.str)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
      )
      .filter(Boolean);

    paginas.push(linhasOrdenadas.join('\n'));
  }

  return paginas.join('\n');
}
