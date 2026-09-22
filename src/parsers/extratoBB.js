// Parser do extrato do Banco do Brasil.
//
// Não existe integração automática com o BB aqui: o Open Finance / API
// Extratos do BB exige credenciais de aplicação, certificado e contrato —
// nada disso roda no navegador. Então o fluxo é: você exporta o extrato no
// BB Digital (Extrato > Salvar/Exportar) e joga o arquivo aqui.
//
// Aceitamos os três formatos que o BB exporta:
//   • OFX  — o mais confiável (é um formato estruturado, com ID próprio de
//            cada lançamento). Prefira este sempre que possível.
//   • CSV  — bom, mas o BB não separa o nome do favorecido do histórico.
//   • PDF  — último recurso; o layout muda de tempos em tempos.
//
// Tudo client-side, sem IA, no mesmo espírito dos parsers do CDS.

function paraNumeroBR(str) {
  if (str == null) return 0;
  const limpo = String(str).trim().replace(/\s/g, '');
  // "1.234,56" (BR) vs "1234.56" (OFX/en)
  if (/,\d{1,2}$/.test(limpo)) {
    return parseFloat(limpo.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return parseFloat(limpo.replace(/,/g, '')) || 0;
}

function isoDeDataBR(ddmmaaaa) {
  const m = String(ddmmaaaa).match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (!m) return null;
  const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${ano}-${m[2]}-${m[1]}`;
}

function isoDeDataOFX(bruto) {
  const m = String(bruto).match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// ---------------------------------------------------------------------------
// Identificação da contraparte (quem pagou / quem recebeu)
// ---------------------------------------------------------------------------

const REGEX_CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;
const REGEX_CNPJ = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/;

// Pedaços que o BB cola no histórico e que NÃO fazem parte do nome de quem
// pagou — removidos antes de sobrar o nome propriamente dito.
const RUIDO_HISTORICO = [
  /^PIX\s*-?\s*/i,
  /^P\s*I\s*X\s*/i,
  /RECEBIDO/i,
  /ENVIADO/i,
  /TRANSFER[ÊE]NCIA/i,
  /TRANSF\b/i,
  /\bTED\b/i,
  /\bDOC\b/i,
  /\bDEP[ÓO]SITO\b/i,
  /\bONLINE\b/i,
  /\bAG[ÊE]NCIA\b/i,
  /\bCONTA\b/i,
  /\bBANCO\b/i,
  /\bCR[ÉE]DITO\b/i,
  /\bD[ÉE]BITO\b/i,
  /\b\d{2}\/\d{2}(\/\d{2,4})?\b/g, // datas soltas
  /\b\d{2}:\d{2}(:\d{2})?\b/g, // horas soltas
];

function limparDocumento(doc) {
  return doc ? doc.replace(/\D/g, '') : '';
}

/**
 * CPF/CNPJ formatado pra exibição (11 ou 14 dígitos). Usado como último
 * recurso quando não sobrou nenhum nome legível — ver `montarLancamento`.
 */
export function formatarDocumentoExibicao(documento) {
  if (!documento) return '';
  if (documento.length === 11) return documento.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (documento.length === 14)
    return documento.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return documento;
}

/**
 * Abreviação da forma de pagamento a partir do histórico do BB, pra exibir
 * numa coluna estreita (PIX / TRANSF / DEP / BOL). Puramente cosmético — não
 * afeta identificação de contraparte nem conciliação.
 */
export function abreviarFormaPagamento(historico) {
  const h = (historico ?? '').toUpperCase();
  if (/PIX/.test(h)) return 'PIX';
  if (/BOLETO/.test(h)) return 'BOL';
  if (/DEP[ÓO]SITO/.test(h)) return 'DEP';
  if (/\bTED\b|\bDOC\b|TRANSFER[ÊE]NCIA|\bTRANSF\b/.test(h)) return 'TRANSF';
  return '';
}

/**
 * Tenta separar, de um histórico do BB, o documento (CPF/CNPJ) e o nome da
 * contraparte. O que não der pra identificar volta como string vazia — e a
 * tela deixa você corrigir/associar na mão, porque associar errado aqui
 * contamina a baixa automática depois.
 */
export function identificarContraparte(historico, nomeExplicito) {
  const texto = `${nomeExplicito ?? ''} ${historico ?? ''}`.trim();

  const mCnpj = texto.match(REGEX_CNPJ);
  const mCpf = mCnpj ? null : texto.match(REGEX_CPF);
  const documento = limparDocumento(mCnpj?.[0] ?? mCpf?.[0] ?? '');

  // Se o formato trouxe um campo de nome separado (OFX <NAME>), ele é muito
  // mais confiável do que tentar adivinhar dentro do histórico.
  let nome = (nomeExplicito ?? '').trim();

  if (!nome) {
    nome = texto;
    nome = nome
      .replace(new RegExp(REGEX_CNPJ, 'g'), ' ')
      .replace(new RegExp(REGEX_CPF, 'g'), ' ');
    RUIDO_HISTORICO.forEach((re) => {
      nome = nome.replace(re, ' ');
    });
    nome = nome
      .replace(/[^\p{L}\s.'-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Sobrou só uma palavra curta ou nada de útil: melhor admitir que não
    // sabemos do que chutar um nome quebrado.
    if (nome.length < 4) nome = '';
  }

  return { nome, documento };
}

/**
 * Chave de vínculo conta -> cliente. Preferimos o CPF/CNPJ (estável); sem
 * ele, caímos no nome normalizado. Duas contas diferentes do mesmo cliente
 * viram dois vínculos — e tudo bem, é esperado.
 */
export function chaveContraparte({ documento, nome }) {
  if (documento) return `doc:${documento}`;
  const normalizado = (nome ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
  return normalizado ? `nome:${normalizado}` : '';
}

// ID determinístico do lançamento: reimportar o mesmo extrato (ou um extrato
// com período sobreposto) atualiza a mesma linha em vez de duplicar.
export function idLancamento({ fitid, data, valor, tipo, historico }) {
  if (fitid) return `bb_${String(fitid).replace(/[^\w-]/g, '')}`;
  const base = `${data}|${tipo}|${valor.toFixed(2)}|${(historico ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)}`;
  let hash = 0;
  for (let i = 0; i < base.length; i += 1) {
    hash = (hash * 31 + base.charCodeAt(i)) | 0;
  }
  return `bb_${data.replace(/-/g, '')}_${Math.abs(hash).toString(36)}`;
}

function montarLancamento({ data, valorBruto, historico, nome, documento, fitid }) {
  const valorNum = typeof valorBruto === 'number' ? valorBruto : paraNumeroBR(valorBruto);
  const tipo = valorNum < 0 ? 'debito' : 'credito';
  const valor = Math.abs(valorNum);
  // Quando quem chamou já isolou nome e documento (caso do parser de PDF,
  // que lê os dois de uma segunda linha separada), usamos exatamente esses
  // valores em vez de tentar adivinhar de novo a partir do histórico.
  const contraparte =
    nome !== undefined || documento
      ? { nome: nome ?? '', documento: documento ?? '' }
      : identificarContraparte(historico, nome);
  // Às vezes o BB imprime só um CPF/CNPJ (por vezes truncado/repetido) sem
  // nenhuma letra que sobreviva à limpeza — nunca deixamos a linha sem
  // exibição nenhuma: cai pro documento formatado. `chaveContraparte`
  // continua vindo do documento/nome originais (não deste texto de exibição),
  // então isso não interfere na conciliação nem no vínculo de cliente.
  const nomeExibicao =
    contraparte.nome || (contraparte.documento ? formatarDocumentoExibicao(contraparte.documento) : '');
  return {
    id: idLancamento({ fitid, data, valor, tipo, historico }),
    banco: 'bb',
    data,
    historico: (historico ?? '').replace(/\s+/g, ' ').trim(),
    valor,
    tipo,
    contraparteNome: nomeExibicao,
    contraparteDocumento: contraparte.documento,
    chaveContraparte: chaveContraparte(contraparte),
  };
}

// ---------------------------------------------------------------------------
// OFX
// ---------------------------------------------------------------------------

export function parseExtratoOFX(conteudo) {
  const lancamentos = [];
  const blocos = conteudo.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];

  blocos.forEach((bloco) => {
    const tag = (nome) => {
      const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i'));
      return m ? m[1].trim() : '';
    };
    const data = isoDeDataOFX(tag('DTPOSTED'));
    if (!data) return;
    const valor = parseFloat(tag('TRNAMT').replace(',', '.'));
    if (Number.isNaN(valor)) return;

    lancamentos.push(
      montarLancamento({
        data,
        valorBruto: valor,
        historico: [tag('MEMO'), tag('CHECKNUM')].filter(Boolean).join(' '),
        nome: tag('NAME'),
        fitid: tag('FITID'),
      })
    );
  });

  return lancamentos;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function separarCsv(linha, sep) {
  const saida = [];
  let atual = '';
  let dentroDeAspas = false;
  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i];
    if (c === '"') {
      dentroDeAspas = !dentroDeAspas;
    } else if (c === sep && !dentroDeAspas) {
      saida.push(atual);
      atual = '';
    } else {
      atual += c;
    }
  }
  saida.push(atual);
  return saida.map((c) => c.trim().replace(/^"|"$/g, ''));
}

export function parseExtratoCSV(conteudo) {
  const linhas = conteudo.split(/\r?\n/).filter((l) => l.trim());
  if (!linhas.length) return [];

  // O BB exporta com ";" na maioria dos casos, mas já apareceu com ",".
  const sep = (linhas[0].match(/;/g)?.length ?? 0) >= (linhas[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const cabecalho = separarCsv(linhas[0], sep).map((c) => c.toLowerCase());

  const acharCol = (...nomes) =>
    cabecalho.findIndex((c) => nomes.some((n) => c.includes(n)));

  const colData = acharCol('data lan', 'data');
  const colHist = acharCol('hist', 'lançamento', 'lancamento', 'descri');
  const colDoc = acharCol('documento', 'docto');
  const colValor = acharCol('valor');
  const colTipo = acharCol('tipo lan', 'tipo', 'd/c', 'debito/credito');

  const lancamentos = [];
  linhas.slice(1).forEach((linha) => {
    const cols = separarCsv(linha, sep);
    const data = isoDeDataBR(cols[colData] ?? '');
    if (!data) return;

    let valor = paraNumeroBR(cols[colValor] ?? '');
    if (!valor) return;

    // Algumas exportações trazem o sinal numa coluna "Tipo Lançamento" (D/C)
    // em vez de no próprio número.
    const tipoTexto = (cols[colTipo] ?? '').toUpperCase();
    if (valor > 0 && (tipoTexto.startsWith('D') || tipoTexto.includes('DÉB') || tipoTexto.includes('DEB'))) {
      valor = -valor;
    }

    lancamentos.push(
      montarLancamento({
        data,
        valorBruto: valor,
        historico: [cols[colHist], cols[colDoc]].filter(Boolean).join(' '),
      })
    );
  });

  return lancamentos;
}

// ---------------------------------------------------------------------------
// PDF (texto já extraído por pdfToText.js)
// ---------------------------------------------------------------------------
//
// O extrato do BB em PDF imprime CADA lançamento em duas linhas:
//
//   16/09/2026 0000 14397 821 Pix - Recebido 160.818.558.327.982 330,30 C
//   16/09 08:18 41245127000158 H J M IMPOR
//
// A primeira linha (a única que começa com data completa dd/mm/aaaa) traz o
// histórico, o número de documento interno do banco e o valor. A segunda
// linha, quando existe, traz o horário, o CPF/CNPJ de quem pagou (colado,
// sem formatação) e o nome — muitas vezes truncado pelo próprio BB, porque a
// coluna do PDF é estreita ("H J M IMPOR" em vez do nome completo da
// empresa). É essa segunda linha que faltava ler: sem ela, não tem como
// saber quem pagou, só que "alguém pagou via Pix".
//
// Nem todo lançamento tem essa segunda linha (Cobrança, por exemplo, não
// tem). E quando tem, ela pode ser só um nome de empresa sem CPF/CNPJ (nos
// boletos pagos, o BB imprime a razão social do beneficiário).

const RE_DATA_COMPLETA = /^\d{2}\/\d{2}\/\d{4}\b/;
const RE_DINHEIRO = /^[\d.]+,\d{2}$/;
const RE_DOCUMENTO_TOKEN = /^[\d.]{5,}$/; // dotted/plain digits, comprido o suficiente pra não ser código de agência/lote

function tokenizarLinhaPrincipal(linha) {
  const tokens = linha.split(/\s+/).filter(Boolean);
  const dataMatch = tokens[0]?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!dataMatch) return null;
  const data = `${dataMatch[3]}-${dataMatch[2]}-${dataMatch[1]}`;

  // Pula os códigos numéricos do começo da linha (dt. movimento — às vezes
  // repetida por extenso —, agência de origem, lote) até achar a primeira
  // palavra do histórico.
  let i = 1;
  while (i < tokens.length && (/^\d+$/.test(tokens[i]) || /^\d{2}\/\d{2}\/\d{4}$/.test(tokens[i]))) {
    i += 1;
  }
  const inicioHistorico = i;

  // Histórico é tudo até o próximo token que pareça "documento" (dígitos e
  // pontos, sem vírgula) ou já seja o próprio valor em dinheiro.
  while (i < tokens.length && !RE_DINHEIRO.test(tokens[i]) && !RE_DOCUMENTO_TOKEN.test(tokens[i])) {
    i += 1;
  }
  const historico = tokens.slice(inicioHistorico, i).join(' ').trim();
  if (!historico) return null;

  if (i < tokens.length && RE_DOCUMENTO_TOKEN.test(tokens[i]) && !RE_DINHEIRO.test(tokens[i])) {
    i += 1; // pula o número de documento do banco (não é CPF/CNPJ de ninguém)
  }
  if (i >= tokens.length || !RE_DINHEIRO.test(tokens[i])) return null;
  const valorTexto = tokens[i];
  i += 1;
  const sinal = tokens[i] === 'C' || tokens[i] === 'D' ? tokens[i] : null;
  if (!sinal) return null;
  i += 1;

  // Às vezes o pdfjs agrupa a linha de detalhe (horário + CPF/CNPJ + nome)
  // NA MESMA linha da transação principal, em vez de numa linha separada —
  // depende da tolerância de agrupamento por Y usada em pdfToText.js e de
  // como aquele PDF específico posicionou o texto. Quando isso acontece, o
  // detalhe sobra aqui como "cauda" depois do C/D (e, sem essa cauda, o
  // nome simplesmente desaparecia — era a causa mais provável de contas
  // conhecidas aparecerem como "não identificado" no extrato).
  const cauda = tokens.slice(i).join(' ').trim();

  return { data, historico, valorTexto, sinal, cauda };
}

// Linhas que não são lançamento de verdade: o saldo do dia anterior e o
// fechamento "S A L D O" no fim do extrato.
function ehLinhaDeSaldo(historico) {
  const normalizado = historico.replace(/\s+/g, '').toUpperCase();
  return normalizado === 'SALDO' || normalizado === 'SALDOANTERIOR';
}

export function parseExtratoPdfTexto(texto) {
  const linhasBrutas = texto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    // ruído de cabeçalho/rodapé de página que a extração de PDF intercala
    // no meio da tabela a cada quebra de página
    .filter((l) => !/^https?:\/\//i.test(l))
    .filter((l) => !/^\d{2}\/\d{2}\/\d{4},?\s*\d{2}:\d{2}\s+Banco do Brasil$/i.test(l));

  // Tudo a partir de "Lançamentos futuros" é agendamento que ainda não
  // aconteceu (boleto programado, resgate de fundo etc.) — não é dinheiro
  // que já entrou ou saiu da conta, então fica de fora da conciliação.
  const fimUtil = linhasBrutas.findIndex((l) => /^lan[çc]amentos futuros$/i.test(l));
  const linhas = fimUtil === -1 ? linhasBrutas : linhasBrutas.slice(0, fimUtil);

  const lancamentos = [];

  for (let idx = 0; idx < linhas.length; idx += 1) {
    const principal = tokenizarLinhaPrincipal(linhas[idx]);
    if (!principal || ehLinhaDeSaldo(principal.historico)) continue;

    // Sem linha (ou cauda) de detalhe, não há nome nenhum pra extrair —
    // "Cobrança" ou "Pix - Recebido" sozinhos não identificam ninguém, então
    // nem tentamos adivinhar a partir do histórico (isso é o que causava
    // contraparte fantasma tipo "Cobrança" virando o próprio nome do
    // favorecido).
    let textoDetalhe = principal.cauda ?? '';

    // A linha seguinte só entra na mistura se NÃO for, ela mesma, o início
    // de um novo lançamento (ou seja, não começa com data completa).
    const proxima = linhas[idx + 1];
    if (proxima && !RE_DATA_COMPLETA.test(proxima)) {
      textoDetalhe = [textoDetalhe, proxima].filter(Boolean).join(' ');
      idx += 1; // consome a linha de detalhe
    }

    const { nome: nomeDetectado, documento: documentoDetectado } = textoDetalhe
      ? identificarContraparte(textoDetalhe)
      : { nome: '', documento: '' };

    let valor = paraNumeroBR(principal.valorTexto);
    if (principal.sinal === 'D') valor = -Math.abs(valor);
    if (principal.sinal === 'C') valor = Math.abs(valor);

    lancamentos.push(
      montarLancamento({
        data: principal.data,
        valorBruto: valor,
        historico: principal.historico,
        // `undefined` (não `''`) quando não há linha de detalhe, para que
        // montarLancamento saiba que não identificamos nada — e não confunda
        // isso com "identificamos que não tem nome".
        nome: nomeDetectado,
        documento: documentoDetectado,
      })
    );
  }

  return lancamentos;
}

// ---------------------------------------------------------------------------
// Entrada única
// ---------------------------------------------------------------------------

/**
 * @param {string} conteudo — texto do arquivo (ou texto já extraído do PDF)
 * @param {string} nomeArquivo — usado só pra escolher o parser
 */
export function parseExtratoBB(conteudo, nomeArquivo = '') {
  const ext = nomeArquivo.toLowerCase().split('.').pop();

  let lancamentos = [];
  let formato = ext;

  if (ext === 'ofx' || /<STMTTRN>/i.test(conteudo)) {
    formato = 'ofx';
    lancamentos = parseExtratoOFX(conteudo);
  } else if (ext === 'csv' || ext === 'txt') {
    formato = 'csv';
    lancamentos = parseExtratoCSV(conteudo);
  } else {
    formato = 'pdf';
    lancamentos = parseExtratoPdfTexto(conteudo);
  }

  // Ordena por data primeiro. A desambiguação de ID (abaixo) depende dessa
  // ordem — e, dentro do mesmo dia, o sort é estável, então a ordem de
  // aparição no arquivo (cronológica, hora a hora) é preservada.
  const lista = [...lancamentos].sort((a, b) => a.data.localeCompare(b.data));

  // Duas transações reais podem ter, por coincidência, o mesmo dia + mesmo
  // valor + mesmo trecho de histórico (dois Pix de R$ 50 do mesmo jeito no
  // mesmo dia, por exemplo) — nesse caso o ID-base colide. Em vez de deixar
  // a segunda sobrescrever a primeira (perdendo um lançamento de verdade),
  // desambiguamos por ordem de aparição no arquivo. Isso é o que torna
  // seguro reimportar um período sobreposto: o BB sempre exporta os
  // lançamentos de um mesmo dia na mesma ordem cronológica, então a "2ª
  // ocorrência de tal valor em tal dia" é sempre a mesma transação física
  // entre uma importação e outra — reimportar atualiza a mesma linha em vez
  // de duplicar OU de perder a segunda ocorrência.
  const contagem = new Map();
  const desambiguada = lista.map((l, indice) => {
    const vezes = contagem.get(l.id) ?? 0;
    contagem.set(l.id, vezes + 1);
    // `sequencia` é a posição de aparição no arquivo original (que o BB
    // sempre exporta em ordem cronológica, hora a hora). Sem isso, ordenar
    // por data (que só tem granularidade de dia) deixa a ordem dentro do
    // mesmo dia a critério do Firestore — que não é a ordem do extrato.
    const base = vezes === 0 ? l : { ...l, id: `${l.id}_${vezes}` };
    return { ...base, sequencia: indice };
  });

  // Um único dia por arquivo, sem exceção. Isso elimina de vez o risco de
  // duplicidade por período sobreposto: se cada importação cobre só um dia,
  // reimportar o mesmo dia é sempre "atualizar aquele dia" (idempotente,
  // graças ao ID determinístico de cada lançamento), nunca "e se o período
  // de ontem se sobrepuser ao de hoje?". A desambiguação por ordem acima
  // continua existindo como segunda camada de segurança, mas não precisa
  // mais lidar com múltiplos dias ao mesmo tempo.
  const diasDistintos = Array.from(new Set(desambiguada.map((l) => l.data))).sort();
  if (diasDistintos.length > 1) {
    return {
      formato,
      lancamentos: [],
      semContraparte: 0,
      periodoInvalido: true,
      erro:
        `Este arquivo cobre ${diasDistintos.length} dias diferentes ` +
        `(${diasDistintos[0].split('-').reverse().join('/')} até ` +
        `${diasDistintos[diasDistintos.length - 1].split('-').reverse().join('/')}), e o Extrato só aceita um dia por vez. ` +
        `No BB Digital, gere o extrato com "de" e "até" iguais e importe de novo.`,
    };
  }

  return {
    formato,
    lancamentos: desambiguada,
    semContraparte: desambiguada.filter((l) => !l.chaveContraparte).length,
    periodoInvalido: false,
  };
}

export { paraNumeroBR, isoDeDataBR };
