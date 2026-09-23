import { arredondar2 } from '../utils/numero.js';
import { normalizarNomeCliente } from '../shared/texto.js';

// Parser do relatório "Ranking de Vendas" do CDS: uma linha por funcionário,
// com o total vendido por ele num período (normalmente um mês). Formato de
// cada linha da seção "Vendas":
//   "FLAVIO VIAGEM FLAVIO VIAGEM RECIFE 88.515,60 16.17 %"
// O nome vem sempre DUPLICADO (a coluna "Identificação" repete a coluna
// "Funcionário" nesse relatório específico) — usamos essa duplicação pra
// extrair o nome com segurança mesmo sem saber de antemão quantas palavras
// tem a Filial. A seção "Devolução" (mesmo layout, valores de devolução) é
// descartada de propósito: cortamos o texto nela antes de processar linhas.

function paraNumero(str) {
  return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string} texto — saída de extrairTextoPdf para um "Ranking de Vendas".
 * @returns {{
 *   mes: string | null,          // YYYY-MM
 *   periodoInvalido: boolean,
 *   erro: string | null,
 *   vendedores: Array<{ nome: string, valor: number }>,
 * }}
 */
export function parseRankingVendas(texto) {
  const matchPeriodo = texto.match(
    /Per[ií]odo:\s*(\d{2})\/(\d{2})\/(\d{4})\s*[àa]\s*(\d{2})\/(\d{2})\/(\d{4})/
  );

  if (!matchPeriodo) {
    return {
      mes: null,
      periodoInvalido: true,
      erro: 'Não encontrei o "Período" no PDF — confirme que é um "Ranking de Vendas" exportado do CDS.',
      vendedores: [],
    };
  }

  const [, diaIni, mesIni, anoIni, diaFim, mesFim, anoFim] = matchPeriodo;
  if (anoIni !== anoFim || mesIni !== mesFim) {
    return {
      mes: null,
      periodoInvalido: true,
      erro:
        `Este arquivo cobre um período de ${diaIni}/${mesIni}/${anoIni} até ` +
        `${diaFim}/${mesFim}/${anoFim}, que atravessa mais de um mês. Exporte o ` +
        `"Ranking de Vendas" de um único mês e importe de novo.`,
      vendedores: [],
    };
  }
  const mes = `${anoIni}-${mesIni}`;

  // Nome da filial: sai do cabeçalho "<FILIAL> Ranking de Vendas" — é o
  // valor exato que se repete em toda linha da tabela, então usá-lo aqui
  // (em vez de tentar adivinhar quantas palavras a filial tem linha a
  // linha) é o jeito confiável de separar "nome duplicado" de "filial".
  // Sem o cabeçalho (relatório cortado/formato inesperado), caímos pra um
  // fallback que só funciona se a filial for uma única palavra maiúscula —
  // cobre o caso comum, mas registramos como limitação.
  const matchFilial = texto.match(/^([A-ZÀ-Ú][A-ZÀ-Ú\s]*?)\s+Ranking de Vendas/m);
  const filial = matchFilial ? matchFilial[1].trim() : null;

  const regexLinha = filial
    ? new RegExp(`^(.+?)\\s+${escapeRegex(filial)}\\s+([\\d.,]+)\\s+[\\d.,]+\\s*%$`)
    : /^(.+?)\s+[A-ZÀ-Ú]+\s+([\d.,]+)\s+[\d.,]+\s*%$/;

  // Só a seção "Vendas" — tudo a partir de "Devolução" é ignorado.
  const [textoVendas] = texto.split(/\n\s*Devolu[cç][aã]o\b/i);
  const linhas = textoVendas.split('\n').map((l) => l.trim()).filter(Boolean);

  const vendedoresPorChave = new Map(); // nome normalizado -> {nome, valor}

  linhas.forEach((linha) => {
    const m = linha.match(regexLinha);
    if (!m) return;

    const bloco = m[1].trim();
    const palavras = bloco.split(/\s+/);
    // Nome duplicado de verdade = número par de palavras e as duas metades
    // idênticas. Se não bater (ex: alguma linha de rodapé que por acaso
    // também termine em "<filial> <número> <número>%"), a linha é
    // descartada em vez de virar um "funcionário" com nome estranho.
    if (palavras.length % 2 !== 0) return;
    const metade = palavras.length / 2;
    const primeira = palavras.slice(0, metade).join(' ');
    const segunda = palavras.slice(metade).join(' ');
    if (primeira !== segunda) return;

    const valor = paraNumero(m[2]);
    const chave = normalizarNomeCliente(primeira);
    const atual = vendedoresPorChave.get(chave);
    // Soma em vez de sobrescrever: caso raro do mesmo nome aparecer em mais
    // de uma linha da tabela, o valor lançado é o total, não só o último.
    vendedoresPorChave.set(chave, {
      nome: atual?.nome ?? primeira,
      valor: arredondar2((atual?.valor ?? 0) + valor),
    });
  });

  return {
    mes,
    periodoInvalido: false,
    erro: null,
    vendedores: Array.from(vendedoresPorChave.values()).sort((a, b) =>
      a.nome.localeCompare(b.nome)
    ),
  };
}
