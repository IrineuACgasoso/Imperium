import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { doc, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import PeriodSelector from '../common/PeriodSelector.jsx';
import MetricPills, { METRIC_ITEMS } from '../common/MetricPills.jsx';
import { OPCOES_GRAFICO_GASTOS, GASTOS_TODOS_KEY } from '../../data/categoriasGasto.js';
import DayDetailPanel from '../common/DayDetailPanel.jsx';
import { buildFilialDataset } from '../../data/mockData.js';
import { buildPeriodSeries, buildBreakdownPeriodSeries } from '../../data/periodBuckets.js';
import {
  buildRealMetricSeries,
  groupFuncionarioSeriesById,
  getDayVendasDetail,
  getDayGastosDetail,
} from '../../data/realAggregation.js';
import { useRealFilialData } from '../../hooks/useRealFilialData.js';
import { db, firebaseIsConfigured } from '../../config/firebase.js';
import './PerformanceChart.css';

const PIE_COLORS = ['#ff2e9c', '#35e6d8', '#ffcc4d', '#7a2eff', '#33e6a0', '#ff4568'];

const compactFormatter = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const fullCurrencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const MODE_TITLES = {
  vendas: 'Vendas',
  gastos: 'Gastos',
  funcionarios: 'Vendas por funcionário',
};

const DEFAULT_METRIC_BY_MODE = {
  vendas: 'vendasTotais',
  gastos: GASTOS_TODOS_KEY,
};

function tooltipBoxStyle() {
  return {
    background: '#1a0c34',
    border: '1px solid rgba(255,46,156,0.35)',
    borderRadius: 10,
    fontSize: 12,
    color: '#f2e9fb',
    padding: '10px 12px',
  };
}

function FuncionarioTooltip({ active, payload, label, funcionariosById }) {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload;
  const entries = Object.entries(point.breakdown ?? {}).filter(([, v]) => v);

  return (
    <div style={tooltipBoxStyle()}>
      <div style={{ color: '#b39cd4', marginBottom: 6 }}>{label}</div>
      {entries.length === 0 && <div>Sem vendas registradas.</div>}
      {entries
        .sort((a, b) => b[1] - a[1])
        .map(([id, value]) => (
          <div key={id} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <span>{funcionariosById[id]?.nome ?? 'Funcionário'}</span>
            <span>{fullCurrencyFormatter.format(value)}</span>
          </div>
        ))}
      <div
        style={{
          marginTop: 6,
          paddingTop: 6,
          borderTop: '1px dashed rgba(242,233,251,0.2)',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          fontWeight: 600,
        }}
      >
        <span>Total</span>
        <span>{fullCurrencyFormatter.format(point.value)}</span>
      </div>
    </div>
  );
}

export default function PerformanceChart({ filialId, mode }) {
  const [period, setPeriod] = useState('mes');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [metricKey, setMetricKey] = useState(DEFAULT_METRIC_BY_MODE[mode] ?? 'vendasTotais');
  const [selectedFuncionarioIds, setSelectedFuncionarioIds] = useState([]);
  const [chartType, setChartType] = useState('line'); // 'line' | 'pie'
  const [selectedDayIso, setSelectedDayIso] = useState(null);

  // Dados reais (Firestore) quando configurado; senão, mock local.
  const real = useRealFilialData(filialId);
  const mock = useMemo(() => buildFilialDataset(filialId), [filialId]);

  const funcionarios = firebaseIsConfigured ? real.funcionarios : mock.funcionarios;
  const funcionariosById = useMemo(
    () => Object.fromEntries(funcionarios.map((f) => [f.id, f])),
    [funcionarios]
  );

  const metricSeries = useMemo(
    () => (firebaseIsConfigured ? buildRealMetricSeries(real) : mock.metricSeries),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [firebaseIsConfigured, mock, real.registrosDiarios, real.registrosMensaisHistoricos, real.gastos]
  );

  // O gráfico principal segue a aba ativa da barra lateral; o seletor de
  // métrica (pills) só some quando o modo muda, sempre voltando pro
  // "padrão" daquela aba (Totais em vendas, Gastos em gastos).
  useEffect(() => {
    setMetricKey(DEFAULT_METRIC_BY_MODE[mode] ?? 'vendasTotais');
    setSelectedDayIso(null);
  }, [mode, filialId]);

  useEffect(() => {
    setSelectedDayIso(null);
  }, [period, customRange, chartType]);

  // Por padrão, todos os funcionários entram selecionados; se algum dos
  // selecionados sumir da lista (removido), cai de volta pra "todos".
  useEffect(() => {
    setSelectedFuncionarioIds((prev) => {
      const stillValid = prev.filter((id) => funcionarios.some((f) => f.id === id));
      return stillValid.length > 0 ? stillValid : funcionarios.map((f) => f.id);
    });
  }, [funcionarios]);

  const funcionarioSeriesById = useMemo(() => {
    if (firebaseIsConfigured) return groupFuncionarioSeriesById(real.vendasPorFuncionarioMensal);
    const grouped = {};
    funcionarios.forEach((f) => {
      grouped[f.id] = mock.metricSeries[`vendasFuncionario_${f.id}`] ?? [];
    });
    return grouped;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseIsConfigured, real.vendasPorFuncionarioMensal, mock, funcionarios]);

  const funcionarioRawSeries = useMemo(() => {
    const map = new Map();
    selectedFuncionarioIds.forEach((id) => {
      (funcionarioSeriesById[id] ?? []).forEach((p) => {
        const entry = map.get(p.date) ?? { value: 0, breakdown: {} };
        entry.value += p.value;
        entry.breakdown[id] = (entry.breakdown[id] ?? 0) + p.value;
        map.set(p.date, entry);
      });
    });
    return Array.from(map.entries()).map(([date, e]) => ({
      date,
      value: e.value,
      breakdown: e.breakdown,
    }));
  }, [funcionarioSeriesById, selectedFuncionarioIds]);

  const isFuncionariosMode = mode === 'funcionarios';

  const chartData = useMemo(() => {
    if (isFuncionariosMode) {
      return buildBreakdownPeriodSeries(funcionarioRawSeries, period, customRange);
    }
    return buildPeriodSeries(metricSeries[metricKey] ?? [], period, customRange);
  }, [isFuncionariosMode, funcionarioRawSeries, metricSeries, metricKey, period, customRange]);

  // Em Gastos o seletor lista as CATEGORIAS de gasto; em Vendas, as formas
  // de pagamento/lucro.
  const opcoesSeletor = mode === 'gastos' ? OPCOES_GRAFICO_GASTOS : METRIC_ITEMS;
  const activeMetric = opcoesSeletor.find((i) => i.key === metricKey);
  const headerTitle = isFuncionariosMode ? MODE_TITLES.funcionarios : activeMetric?.label ?? MODE_TITLES[mode];

  const allFuncionariosSelected =
    funcionarios.length > 0 && selectedFuncionarioIds.length === funcionarios.length;

  function toggleFuncionario(id) {
    setSelectedFuncionarioIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleSelectAllFuncionarios() {
    setSelectedFuncionarioIds(allFuncionariosSelected ? [] : funcionarios.map((f) => f.id));
  }

  function handleChartClick(state) {
    if (isFuncionariosMode) return;
    const point = state?.activePayload?.[0]?.payload;
    if (point?.iso) setSelectedDayIso((cur) => (cur === point.iso ? null : point.iso));
  }

  // --- Detalhe do dia (só faz sentido pra vendas/gastos, e só quando o
  // ponto clicado representa um único dia — semana/mês/personalizado). ---
  const vendasDetailForDay = useMemo(() => {
    if (!selectedDayIso || isFuncionariosMode) return null;
    if (firebaseIsConfigured) return getDayVendasDetail(real.registrosDiarios, selectedDayIso);
    const valorEm = (key) =>
      mock.metricSeries[key]?.find((p) => p.date === selectedDayIso)?.value ?? 0;
    const vendas = {
      dinheiro: valorEm('vendasDinheiro'),
      cartao: valorEm('vendasCartao'),
      pix: valorEm('vendasPix'),
      boleto: valorEm('vendasBoleto'),
      promissoria: valorEm('vendasPromissoria'),
      outros: 0,
      totalVendas: valorEm('vendasTotais'),
    };
    const houveVenda = Object.values(vendas).some((v) => v);
    return houveVenda ? { vendas, origem: 'manual' } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDayIso, isFuncionariosMode, firebaseIsConfigured, real.registrosDiarios, mock]);

  const gastosDetailForDay = useMemo(() => {
    if (!selectedDayIso || isFuncionariosMode) return null;
    if (firebaseIsConfigured) {
      return getDayGastosDetail(real.registrosDiarios, real.gastos, selectedDayIso);
    }
    const valor = mock.metricSeries.gastos?.find((p) => p.date === selectedDayIso)?.value ?? 0;
    return {
      avulsos: valor
        ? [{ id: 'mock', categoria: 'Gastos do dia (exemplo)', valor, descricao: '' }]
        : [],
      despesasCaixa: 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDayIso, isFuncionariosMode, firebaseIsConfigured, real.registrosDiarios, real.gastos, mock]);

  async function handleDeleteVendaDoDia() {
    if (!firebaseIsConfigured || !selectedDayIso) return;
    await deleteDoc(doc(db, 'filiais', filialId, 'registrosDiarios', selectedDayIso));
    setSelectedDayIso(null);
  }

  async function handleSaveVendaDoDia(vendas) {
    if (!firebaseIsConfigured || !selectedDayIso) return;
    const totalVendas = Object.values(vendas).reduce((a, b) => a + b, 0);
    await setDoc(doc(db, 'filiais', filialId, 'registrosDiarios', selectedDayIso), {
      data: selectedDayIso,
      vendas: {
        ...vendas,
        totalAVista: vendas.dinheiro + vendas.pix,
        totalAPrazo: vendas.cartao + vendas.boleto + vendas.promissoria + vendas.outros,
        totalVendas,
      },
      origem: 'manual',
      criadoEm: serverTimestamp(),
    });
  }

  async function handleDeleteGastoDoDia(gastoId) {
    if (!firebaseIsConfigured) return;
    await deleteDoc(doc(db, 'filiais', filialId, 'gastos', gastoId));
  }

  // Esc fecha a prestação de contas do dia, igual ao botão "✕".
  useEffect(() => {
    if (!selectedDayIso) return undefined;
    function handleKeyDown(e) {
      if (e.key === 'Escape') setSelectedDayIso(null);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedDayIso]);

  return (
    <section className="performance-chart">
      <header className="performance-chart__header">
        <div>
          <span className="performance-chart__eyebrow">Painel principal</span>
          <h2 className="performance-chart__title">{headerTitle}</h2>
        </div>
        <PeriodSelector
          period={period}
          onChangePeriod={setPeriod}
          customRange={customRange}
          onChangeCustomRange={setCustomRange}
        />
      </header>

      {isFuncionariosMode && (
        <div className="performance-chart__funcionarios">
          <button
            className="performance-chart__funcionario-chip performance-chart__funcionario-chip--all"
            onClick={toggleSelectAllFuncionarios}
          >
            {allFuncionariosSelected ? 'Deselecionar todos' : 'Selecionar todos'}
          </button>
          {funcionarios.map((f) => (
            <button
              key={f.id}
              className={`performance-chart__funcionario-chip ${
                selectedFuncionarioIds.includes(f.id) ? 'is-active' : ''
              }`}
              onClick={() => toggleFuncionario(f.id)}
            >
              {f.nome}
            </button>
          ))}
          {funcionarios.length === 0 && (
            <span className="performance-chart__funcionarios-empty">
              Nenhum funcionário cadastrado nesta filial ainda.
            </span>
          )}
        </div>
      )}

      <div className="performance-chart__canvas">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'line' ? (
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
              onClick={handleChartClick}
            >
              <CartesianGrid stroke="rgba(242,233,251,0.06)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(242,233,251,0.12)' }}
                tickLine={false}
                minTickGap={28}
              />
              <YAxis
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={64}
                tickFormatter={(v) => compactFormatter.format(v)}
              />
              {isFuncionariosMode ? (
                <Tooltip content={<FuncionarioTooltip funcionariosById={funcionariosById} />} />
              ) : (
                <Tooltip
                  contentStyle={tooltipBoxStyle()}
                  labelStyle={{ color: '#b39cd4' }}
                  itemStyle={{ color: '#f2e9fb' }}
                  formatter={(v) => fullCurrencyFormatter.format(v)}
                />
              )}
              <Line
                type="monotone"
                dataKey="value"
                stroke="#ff2e9c"
                strokeWidth={2.5}
                dot={{ r: 2.5, cursor: isFuncionariosMode ? 'default' : 'pointer' }}
                activeDot={{ r: 5, cursor: isFuncionariosMode ? 'default' : 'pointer' }}
              />
            </LineChart>
          ) : (
            <PieChart>
              <Tooltip
                contentStyle={tooltipBoxStyle()}
                labelStyle={{ color: '#f2e9fb' }}
                itemStyle={{ color: '#f2e9fb' }}
                formatter={(v) => fullCurrencyFormatter.format(v)}
              />
              <Legend
                wrapperStyle={{ color: '#f2e9fb', fontSize: 12 }}
                formatter={(value) => <span style={{ color: '#f2e9fb' }}>{value}</span>}
              />
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="date"
                innerRadius="42%"
                outerRadius="72%"
                paddingAngle={2}
              >
                {chartData.map((entry, idx) => (
                  <Cell key={entry.date} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          )}
        </ResponsiveContainer>
        {chartData.length === 0 && (
          <p className="performance-chart__empty">Sem dados para este período/métrica ainda.</p>
        )}
      </div>

      {!isFuncionariosMode && selectedDayIso && (
        <div className="day-detail-overlay" onClick={() => setSelectedDayIso(null)}>
          <DayDetailPanel
            iso={selectedDayIso}
            kind={mode}
            vendasDetail={vendasDetailForDay}
            gastosDetail={gastosDetailForDay}
            onClose={() => setSelectedDayIso(null)}
            onDeleteVenda={
              mode === 'vendas' && firebaseIsConfigured && vendasDetailForDay
                ? handleDeleteVendaDoDia
                : null
            }
            onSaveVenda={
              mode === 'vendas' && firebaseIsConfigured && vendasDetailForDay
                ? handleSaveVendaDoDia
                : null
            }
            onDeleteGasto={mode === 'gastos' && firebaseIsConfigured ? handleDeleteGastoDoDia : null}
          />
        </div>
      )}

      <footer className="performance-chart__footer">
        <button
          className="performance-chart__type-toggle"
          onClick={() => setChartType((t) => (t === 'line' ? 'pie' : 'line'))}
          title={chartType === 'line' ? 'Ver como gráfico de pizza' : 'Ver como gráfico de linha'}
        >
          {chartType === 'line' ? '◔ Pizza' : '⟋ Linha'}
        </button>

        {!isFuncionariosMode && (mode === 'vendas' || mode === 'gastos') && (
          <MetricPills activeKey={metricKey} onSelect={setMetricKey} items={opcoesSeletor} />
        )}
      </footer>
    </section>
  );
}
