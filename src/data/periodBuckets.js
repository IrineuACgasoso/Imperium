// Substitui o antigo "últimos N dias" por buckets de calendário fixos,
// sempre ancorados na data de hoje, com zero preenchido onde não há dado.

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Formata como YYYY-MM-DD usando componentes locais (evita o bug clássico de
// toISOString() voltar um dia por causa de fuso horário).
function isoLocal(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function startOfWeekMonday(reference) {
  const d = new Date(reference);
  const day = d.getDay(); // 0=domingo..6=sábado
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildValueMap(rawSeries) {
  const map = new Map();
  rawSeries.forEach((p) => {
    map.set(p.date, (map.get(p.date) ?? 0) + p.value);
  });
  return map;
}

/**
 * Transforma uma série bruta [{date: 'YYYY-MM-DD', value}] (diária ou com
 * pontos mensais sintéticos tipo 'YYYY-MM-01') em pontos prontos pro
 * gráfico, de acordo com o período selecionado. Buckets sempre fixos e
 * ancorados em hoje — nunca "últimos N dias com dado".
 *
 * Nos períodos com granularidade diária (semana/mês/personalizado), cada
 * ponto também carrega `iso: 'YYYY-MM-DD'` — usado pra abrir o detalhe do
 * dia quando o usuário clica na bolinha do gráfico. Em ano/máximo, um ponto
 * representa vários dias somados, então não tem um `iso` único (fica null).
 */
export function buildPeriodSeries(rawSeries, period, customRange) {
  const valueMap = buildValueMap(rawSeries);
  const hoje = new Date();

  if (period === 'semana') {
    const monday = startOfWeekMonday(hoje);
    const pontos = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = isoLocal(d);
      pontos.push({
        date: `${DIAS_SEMANA[d.getDay()]} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`,
        value: valueMap.get(iso) ?? 0,
        iso,
      });
    }
    return pontos;
  }

  if (period === 'mes') {
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth();
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    const pontos = [];
    for (let dia = 1; dia <= diasNoMes; dia += 1) {
      const iso = `${ano}-${pad2(mes + 1)}-${pad2(dia)}`;
      pontos.push({ date: pad2(dia), value: valueMap.get(iso) ?? 0, iso });
    }
    return pontos;
  }

  if (period === 'ano') {
    const ano = hoje.getFullYear();
    const somasPorMes = new Array(12).fill(0);
    rawSeries.forEach((p) => {
      // Parse manual da string (sem passar por Date) — new Date('YYYY-MM-DD')
      // é interpretado como UTC meia-noite, e em fusos negativos (Brasil)
      // isso "volta" um dia/mês ao converter pra hora local. Evitamos isso
      // trabalhando só com os números da própria string.
      const [anoDoPonto, mesDoPonto] = p.date.slice(0, 7).split('-').map(Number);
      if (anoDoPonto === ano) somasPorMes[mesDoPonto - 1] += p.value;
    });
    return MESES.map((label, i) => ({ date: label, value: somasPorMes[i], iso: null }));
  }

  if (period === 'maximo') {
    const somasPorAno = new Map();
    rawSeries.forEach((p) => {
      const ano = p.date.slice(0, 4);
      somasPorAno.set(ano, (somasPorAno.get(ano) ?? 0) + p.value);
    });
    const anos = Array.from(somasPorAno.keys()).sort();
    return anos.map((ano) => ({ date: ano, value: somasPorAno.get(ano), iso: null }));
  }

  if (period === 'personalizado') {
    if (!customRange?.start || !customRange?.end) return [];
    const inicio = new Date(`${customRange.start}T00:00:00`);
    const fim = new Date(`${customRange.end}T00:00:00`);
    const pontos = [];
    for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
      const iso = isoLocal(d);
      pontos.push({ date: iso, value: valueMap.get(iso) ?? 0, iso });
    }
    return pontos;
  }

  return [];
}

function buildBreakdownMap(rawSeries) {
  const map = new Map();
  rawSeries.forEach((p) => {
    const entry = map.get(p.date) ?? { value: 0, breakdown: {} };
    entry.value += p.value;
    Object.entries(p.breakdown ?? {}).forEach(([id, v]) => {
      entry.breakdown[id] = (entry.breakdown[id] ?? 0) + v;
    });
    map.set(p.date, entry);
  });
  return map;
}

/**
 * Mesma ideia de `buildPeriodSeries`, mas para séries que carregam um
 * `breakdown` por ponto (ex: quanto cada funcionário vendeu naquele dia).
 * Usado pelo modo "por funcionário" do gráfico, que soma os selecionados
 * mas ainda precisa saber a contribuição individual pra exibir no tooltip.
 */
export function buildBreakdownPeriodSeries(rawSeries, period, customRange) {
  const map = buildBreakdownMap(rawSeries);
  const hoje = new Date();
  const get = (iso) => map.get(iso) ?? { value: 0, breakdown: {} };

  if (period === 'semana') {
    const monday = startOfWeekMonday(hoje);
    const pontos = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = isoLocal(d);
      const entry = get(iso);
      pontos.push({
        date: `${DIAS_SEMANA[d.getDay()]} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`,
        value: entry.value,
        breakdown: entry.breakdown,
        iso,
      });
    }
    return pontos;
  }

  if (period === 'mes') {
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth();
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    const pontos = [];
    for (let dia = 1; dia <= diasNoMes; dia += 1) {
      const iso = `${ano}-${pad2(mes + 1)}-${pad2(dia)}`;
      const entry = get(iso);
      pontos.push({ date: pad2(dia), value: entry.value, breakdown: entry.breakdown, iso });
    }
    return pontos;
  }

  if (period === 'ano') {
    const ano = hoje.getFullYear();
    const somasPorMes = Array.from({ length: 12 }, () => ({ value: 0, breakdown: {} }));
    rawSeries.forEach((p) => {
      const [anoDoPonto, mesDoPonto] = p.date.slice(0, 7).split('-').map(Number);
      if (anoDoPonto !== ano) return;
      const acc = somasPorMes[mesDoPonto - 1];
      acc.value += p.value;
      Object.entries(p.breakdown ?? {}).forEach(([id, v]) => {
        acc.breakdown[id] = (acc.breakdown[id] ?? 0) + v;
      });
    });
    return MESES.map((label, i) => ({
      date: label,
      value: somasPorMes[i].value,
      breakdown: somasPorMes[i].breakdown,
      iso: null,
    }));
  }

  if (period === 'maximo') {
    const somasPorAno = new Map();
    rawSeries.forEach((p) => {
      const ano = p.date.slice(0, 4);
      const acc = somasPorAno.get(ano) ?? { value: 0, breakdown: {} };
      acc.value += p.value;
      Object.entries(p.breakdown ?? {}).forEach(([id, v]) => {
        acc.breakdown[id] = (acc.breakdown[id] ?? 0) + v;
      });
      somasPorAno.set(ano, acc);
    });
    const anos = Array.from(somasPorAno.keys()).sort();
    return anos.map((ano) => ({
      date: ano,
      value: somasPorAno.get(ano).value,
      breakdown: somasPorAno.get(ano).breakdown,
      iso: null,
    }));
  }

  if (period === 'personalizado') {
    if (!customRange?.start || !customRange?.end) return [];
    const inicio = new Date(`${customRange.start}T00:00:00`);
    const fim = new Date(`${customRange.end}T00:00:00`);
    const pontos = [];
    for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
      const iso = isoLocal(d);
      const entry = get(iso);
      pontos.push({ date: iso, value: entry.value, breakdown: entry.breakdown, iso });
    }
    return pontos;
  }

  return [];
}
