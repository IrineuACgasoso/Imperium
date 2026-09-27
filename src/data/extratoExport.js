// Monta as linhas do "extrato remontado" (aba Extrato > Exportar Excel) a
// partir dos `extratoLancamentos` já salvos no Firestore. Não existe estado
// próprio pra isso — o saldo corrido (coluna E) é 100% recalculável a
// qualquer momento a partir do histórico bruto, então não há nada pra
// sincronizar/"ficar desatualizado": gerar de novo é sempre ler tudo nesta
// função e desenhar a planilha.
//
// Regra confirmada com exemplo real do usuário (print + conversor_gui.py
// que ele já usava pra outro formato de arquivo):
// - "Cobrança" é sempre um CRÉDITO (dinheiro que ENTROU de boletos pagos por
//   clientes). Quando há mais de um lançamento "Cobrança" no mesmo dia, eles
//   são somados numa única linha "Cobrança(N Títulos DD/MM/AA)".
// - Qualquer outro débito do dia (nome de empresa, tarifa, etc.) é um GASTO,
//   sem nenhuma relação com a Cobrança — mesmo aparecendo logo abaixo dela.
// - Coluna C = gasto (débito), coluna D = lucro (crédito). Nunca as duas na
//   mesma linha.
// - Coluna E = saldo corrido: E(linha) = E(linha anterior) - C(linha) +
//   D(linha). Não depende de baixa/conciliação — só de entrar dinheiro ou
//   sair. Por isso é seguro recalcular do zero toda vez.
// - Cor do nome (verde/preto) = está ou não conciliado (`baixaId`). Nada a
//   ver com o valor entrar em C ou D.

function normalizarHistorico(historico) {
  return (historico ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function formatarDataCurta(iso) {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a.slice(2)}`;
}

function formatarDataLonga(iso) {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

/**
 * Agrupa os lançamentos de um único dia em linhas prontas pra planilha,
 * na ordem: Cobrança agregada (se houver) -> gastos -> demais créditos.
 * `lancamentos` já deve vir filtrado só com a data pedida.
 */
function montarLinhasDoDia(iso, lancamentosDoDia) {
  const cobrancas = lancamentosDoDia.filter(
    (l) => l.tipo === 'credito' && normalizarHistorico(l.historico) === 'cobranca'
  );
  const gastos = lancamentosDoDia.filter((l) => l.tipo === 'debito');
  const outrosCreditos = lancamentosDoDia.filter(
    (l) => l.tipo === 'credito' && normalizarHistorico(l.historico) !== 'cobranca'
  );

  const linhas = [];

  if (cobrancas.length > 0) {
    const total = cobrancas.reduce((s, l) => s + Number(l.valor || 0), 0);
    linhas.push({
      descricao: `Cobrança(${cobrancas.length} Título${cobrancas.length > 1 ? 's' : ''} ${formatarDataCurta(iso)})`,
      gasto: null,
      lucro: total,
      fechado: cobrancas.every((l) => !!l.baixaId),
    });
  }

  gastos.forEach((l) => {
    linhas.push({
      descricao: l.contraparteNome || l.historico,
      gasto: Number(l.valor || 0),
      lucro: null,
      // Débito não é venda — não existe "fechado" pra gasto nesta planilha,
      // então o nome não é colorido (fica na cor padrão).
      fechado: null,
    });
  });

  outrosCreditos.forEach((l) => {
    linhas.push({
      descricao: l.contraparteNome || l.historico,
      gasto: null,
      lucro: Number(l.valor || 0),
      fechado: !!l.baixaId,
    });
  });

  return linhas;
}

/**
 * Monta a planilha inteira: agrupa por dia (ordem cronológica), calcula o
 * saldo corrido acumulado desde o primeiro lançamento salvo (não só do
 * intervalo pedido — assim o saldo nunca fica errado mesmo que você exporte
 * só um pedaço do período), e devolve só as linhas de `dataInicio` até
 * `dataFim` (ambos incluídos, formato "AAAA-MM-DD") já com o A (data) e E
 * (saldo) prontos.
 */
export function montarLinhasExtrato(todosLancamentos, dataInicio, dataFim) {
  const porDia = new Map();
  for (const l of todosLancamentos) {
    if (!porDia.has(l.data)) porDia.set(l.data, []);
    porDia.get(l.data).push(l);
  }

  const diasOrdenados = [...porDia.keys()].sort();

  const linhasFinais = [];
  let saldo = 0;

  for (const iso of diasOrdenados) {
    const linhasDoDia = montarLinhasDoDia(iso, porDia.get(iso));
    linhasDoDia.forEach((linha, i) => {
      saldo = saldo - (linha.gasto ?? 0) + (linha.lucro ?? 0);
      if (iso >= dataInicio && iso <= dataFim) {
        linhasFinais.push({
          data: i === 0 ? formatarDataLonga(iso) : '',
          descricao: linha.descricao,
          gasto: linha.gasto,
          lucro: linha.lucro,
          saldo,
          fechado: linha.fechado,
        });
      }
    });
  }

  return linhasFinais;
}
