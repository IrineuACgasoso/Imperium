// Parser do relatório "Histórico das Despesas" (caixa do dia) do CDS.
//
// O layout desse relatório específico é o mais "sujo" dos quatro: a coluna
// Descrição às vezes embute contas de desconto ("180,00 MATERIAL 60,00
// RESTA 120,00 -30%= ...") que quebram em várias linhas, e Funcionário +
// Centro de Custo saem colados sem separador (ex: "FLAVIA IMPERIORECIFE").
// Por isso NÃO tentamos casar por posição de coluna — em vez disso:
//   1. Cada registro começa em "<FILIAL> <lançamento> <data> ..." e vai até
//      o próximo registro (ou fim do texto).
//   2. A CATEGORIA é a primeira palavra-chave conhecida encontrada no bloco.
//   3. O VALOR é o último número em formato de dinheiro do bloco (é sempre
//      o valor líquido já calculado, depois de qualquer desconto).
//   4. O FUNCIONÁRIO é resolvido comparando o bloco com os nomes JÁ
//      CADASTRADOS na filial (passados por quem chama) — em vez de tentar
//      adivinhar onde termina "Funcionário" e começa "Centro de Custo" no
//      texto colado, procuramos qual funcionário conhecido aparece no bloco.
//      Isso também já resolve acento/maiúscula na hora da extração, não só
//      na hora de salvar.

const CATEGORIAS_CONHECIDAS = [
  'SANGRIA',
  'ADIANTAMENTO SALARIO', // sem acento no CDS; normalizamos pra c/ acento ao salvar
  'ALUGUEL',
  'SALARIO',
  'PEDIDOS',
  'IMPOSTOS',
  'GASOLINA',
  'SERVIÇO',
  'SERVICO',
  'ÁGUA',
  'AGUA',
  'EMBALAGEM',
  'MATERIAL DE LIMPEZA',
  'DIVERSOS',
  'DESPESAS',
  'DESPESA',
];

const MAPA_CATEGORIA_PADRAO = {
  SANGRIA: 'SANGRIA',
  'ADIANTAMENTO SALARIO': 'ADIANTAMENTO SALÁRIO',
  ALUGUEL: 'ALUGUEL',
  SALARIO: 'SALÁRIO',
  PEDIDOS: 'PEDIDOS',
  IMPOSTOS: 'IMPOSTOS',
  GASOLINA: 'GASOLINA',
  'SERVIÇO': 'DESPESAS', // "serviço" prestado é tratado como despesa genérica
  SERVICO: 'DESPESAS',
  'ÁGUA': 'DESPESAS',
  AGUA: 'DESPESAS',
  EMBALAGEM: 'DESPESAS',
  'MATERIAL DE LIMPEZA': 'DESPESAS',
  DIVERSOS: 'DESPESAS',
  DESPESAS: 'DESPESAS',
  DESPESA: 'DESPESAS',
};

function normalizar(s) {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function paraNumero(str) {
  return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Acha, num bloco já normalizado, qual funcionário CADASTRADO aparece mais
// cedo — mas casando por PALAVRA (\b...\b), não por substring crua como
// antes. Isso resolve o caso do adiantamento em que a Descrição só traz o
// primeiro nome ("FLAVIO - PEDIDOS") e o cadastro tem nome completo
// ("FLAVIO VIAGEM" — palavra a mais no cadastro): quando o nome completo
// não aparece inteiro no bloco, cai pro fallback de casar só a primeira
// palavra do cadastro. Acento/maiúscula já saem resolvidos pela
// normalização em `f.norm`; sobra tratar a diferença de quantidade de
// palavras entre o que está escrito e o que está cadastrado.
function acharFuncionarioNoBloco(blocoNorm, funcionariosNormalizados) {
  let melhor = null;
  let posMaisCedo = Infinity;

  funcionariosNormalizados.forEach((f) => {
    const palavras = f.norm.split(' ');
    const candidatos = palavras.length > 1 ? [f.norm, palavras[0]] : [f.norm];
    candidatos.forEach((candidato) => {
      if (!candidato) return;
      const regex = new RegExp(`\\b${escapeRegex(candidato)}\\b`);
      const match = regex.exec(blocoNorm);
      if (match && match.index < posMaisCedo) {
        posMaisCedo = match.index;
        melhor = f;
      }
    });
  });

  return melhor;
}

/**
 * @param {string} texto
 * @param {{id: string, nome: string}[]} funcionariosConhecidos
 * @returns {{
 *   data: string | null,
 *   itens: Array<{
 *     categoria: string,
 *     valor: number,
 *     lancamento: string,
 *     funcionarioId: string | null,
 *     funcionarioNome: string | null,
 *     ehSangria: boolean,
 *     textoOriginal: string,
 *   }>
 * }}
 */
export function parseDespesasCaixa(texto, funcionariosConhecidos = []) {
  const matchPeriodo = texto.match(/Per[ií]odo:\s*(\d{2})\/(\d{2})\/(\d{4})/);
  const data = matchPeriodo
    ? `${matchPeriodo[3]}-${matchPeriodo[2]}-${matchPeriodo[1]}`
    : null;

  // Cada bloco começa numa linha tipo "RECIFE 28519 16/09/2026 SANGRIA ..."
  const regexInicioBloco = /\n(?=[A-ZÀ-Ú]+\s+\d+\s+\d{2}\/\d{2}\/\d{4}\s)/g;
  const blocosBrutos = `\n${texto}`.split(regexInicioBloco).map((b) => b.trim()).filter(Boolean);
  // A última linha do relatório ("Total : 1.032,00" / "Total Despesas : ...")
  // gruda no último bloco por não ter um próximo "RECIFE ..." pra separar —
  // cortamos fora antes de tentar extrair valor/categoria dele.
  const blocos = blocosBrutos.map((b) => b.split(/\n(?=Total\b)/)[0]);

  const funcionariosNormalizados = funcionariosConhecidos.map((f) => ({
    ...f,
    norm: normalizar(f.nome),
  }));

  const itens = [];

  blocos.forEach((bloco) => {
    const cabecalho = bloco.match(/^[A-ZÀ-Ú]+\s+(\d+)\s+\d{2}\/\d{2}\/\d{4}/);
    if (!cabecalho) return; // não é um bloco de lançamento de verdade
    const lancamento = cabecalho[1];

    // CATEGORIA: olhamos as duas primeiras linhas visuais do bloco, não só a
    // primeira. Motivo: a coluna "Conta" tem nomes compostos (ex:
    // "ADIANTAMENTO SALARIO", "MATERIAL DE INFORMÁTICA") que às vezes não
    // cabem numa linha só e quebram exatamente no meio ("ADIANTAMENTO" /
    // "SALARIO DESPESA ...") — usar só a primeira linha faz a categoria
    // sumir nesses casos. Duas linhas já cobrem esse quebra-de-coluna sem
    // abrir mão da proteção original contra ruído de blocos vizinhos
    // (a Descrição, essa sim pode continuar por várias linhas depois disso).
    const duasLinhas = bloco.split('\n').slice(0, 2).join(' ').split(/\bTotal\b/)[0];
    const duasLinhasNorm = normalizar(duasLinhas);
    const categoriaChave = CATEGORIAS_CONHECIDAS.find((c) =>
      duasLinhasNorm.includes(normalizar(c))
    );
    if (!categoriaChave) return; // linha de cabeçalho de tabela ou rodapé de total

    // VALOR: o último número em formato de dinheiro do BLOCO INTEIRO (não só
    // das duas primeiras linhas) — é sempre o valor líquido já calculado,
    // depois de qualquer desconto embutido na Descrição (ex: "MATERIAL
    // 16,00 RESTA 24,00 -30%= 7,20", em que o valor real é 7,20, não os
    // números intermediários da conta). O rodapé "Total : ..." já foi
    // cortado do bloco lá em cima, então não há risco de pegar o total do
    // relatório em vez do valor do lançamento.
    const numeros = bloco.match(/[\d.]{1,},\d{2}/g) ?? [];
    const valor = numeros.length ? paraNumero(numeros[numeros.length - 1]) : 0;

    // O funcionário do caixa (quem operou o lançamento) SEMPRE aparece na
    // reta final do bloco, logo antes do centro de custo. Em lançamentos de
    // adiantamento, o NOME DE QUEM RECEBEU aparece ANTES desse — ou seja,
    // pegamos a primeira ocorrência (posição mais à esquerda no texto) de um
    // nome conhecido, não "qualquer" ocorrência. Aqui sim vale olhar o
    // bloco inteiro (não só a primeira linha), porque o funcionário fica
    // na MESMA linha do valor e não sofre a contaminação acima.
    const blocoNorm = normalizar(bloco);
    const funcionarioEncontrado = acharFuncionarioNoBloco(blocoNorm, funcionariosNormalizados);

    itens.push({
      categoria: MAPA_CATEGORIA_PADRAO[categoriaChave] ?? 'DESPESAS',
      valor,
      lancamento,
      funcionarioId: funcionarioEncontrado?.id ?? null,
      funcionarioNome: funcionarioEncontrado?.nome ?? null,
      ehSangria: categoriaChave === 'SANGRIA',
      textoOriginal: bloco.replace(/\s+/g, ' ').slice(0, 160),
    });
  });

  return { data, itens };
}
