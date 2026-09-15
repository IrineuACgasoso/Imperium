// Dados fictícios apenas para dar vida ao esqueleto visual.
// Quando o Firebase entrar, isso vira leitura real do Firestore, escopada por filial.

function seededRandom(seed) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

function buildSeries(days, base, growth, volatility, seed) {
  const rand = seededRandom(seed);
  let current = base;
  const points = [];
  for (let i = 0; i < days; i += 1) {
    current += growth + (rand() - 0.5) * volatility;
    current = Math.max(current, 0);
    const date = new Date();
    date.setDate(date.getDate() - (days - i));
    // Formatação local (não toISOString, que converte pra UTC e pode
    // deslocar o dia perto da meia-noite em fusos negativos como o Brasil).
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    points.push({
      date: `${y}-${m}-${d}`,
      value: Math.round(current),
    });
  }
  return points;
}

const BASE_FUNCIONARIOS = [
  { id: 'ana', nome: 'Ana Souza' },
  { id: 'bruno', nome: 'Bruno Lima' },
  { id: 'carla', nome: 'Carla Dias' },
];

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) % 9973;
  return h + 1;
}

// Cada filial é totalmente independente: séries próprias e (por ora) o mesmo
// quadro de funcionários-exemplo, mas com números diferentes.
// Quando o Firebase entrar, cada filial vira um documento/coleção próprio.
export function buildFilialDataset(filialId) {
  const s = hashSeed(filialId);
  const metricSeries = {
    vendasTotais: buildSeries(90, 1200, 18, 300, s + 1),
    vendasPix: buildSeries(90, 400, 7, 120, s + 2),
    vendasCartao: buildSeries(90, 500, 8, 140, s + 3),
    vendasBoleto: buildSeries(90, 120, 2, 50, s + 8),
    vendasPromissoria: buildSeries(90, 150, 2, 60, s + 4),
    vendasDinheiro: buildSeries(90, 150, 1, 50, s + 5),
    gastos: buildSeries(90, 700, 4, 150, s + 6),
    lucro: buildSeries(90, 500, 12, 200, s + 7),
  };

  const funcionarios = BASE_FUNCIONARIOS.map((f, idx) => ({ ...f }));
  funcionarios.forEach((f, idx) => {
    metricSeries[`vendasFuncionario_${f.id}`] = buildSeries(90, 200 + idx * 40, 3, 80, s + 10 + idx);
  });

  return { metricSeries, funcionarios };
}
