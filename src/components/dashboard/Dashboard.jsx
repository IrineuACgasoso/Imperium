import { lazy, Suspense, useEffect, useState } from 'react';
import { collection, addDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import Sidebar from '../layout/Sidebar.jsx';
import { db, auth, firebaseIsConfigured } from '../../config/firebase.js';
import './Dashboard.css';

// Cada aba vira um chunk próprio: pdfjs, exceljs, xlsx e recharts só são
// baixados quando a aba que os usa é aberta (antes: um bundle único de ~2,9 MB).
const PerformanceChart = lazy(() => import('./PerformanceChart.jsx'));
const FuncionariosTab = lazy(() => import('../funcionarios/FuncionariosTab.jsx'));
const ClientesTab = lazy(() => import('../clientes/ClientesTab.jsx'));
const VendasTab = lazy(() => import('../vendas/VendasTab.jsx'));
const PendenciasTab = lazy(() => import('../pendencias/PendenciasTab.jsx'));
const FechamentosTab = lazy(() => import('../fechamentos/FechamentosTab.jsx'));
const ExtratoTab = lazy(() => import('../extrato/ExtratoTab.jsx'));

const TAB_LABELS = {
  vendas: 'Vendas',
  funcionarios: 'Funcionários',
  clientes: 'Clientes',
  pendencias: 'Pendências',
  fechamentos: 'Fechamentos',
  extrato: 'Extrato',
};

const MOCK_FILIAIS = [{ id: 'recife-matriz', nome: 'Recife — Matriz' }];

const CHART_MODES = ['vendas', 'funcionarios'];
// "clientes", "pendencias" e "extrato" não alimentam o gráfico principal:
// clientes tem o gráfico próprio dentro da aba, e os outros dois são telas
// de conferência. Nessas abas o gráfico do topo permanece no que estava.

export default function Dashboard({ onLogout }) {
  const [activeTab, setActiveTab] = useState(null);
  // O gráfico principal sempre reflete a última aba "de dados" visitada
  // (vendas/funcionários). A aba "Importar dados (IA)" não tem
  // gráfico próprio, então não mexe nisso — o gráfico permanece no que
  // estava antes de abrir a importação.
  const [chartMode, setChartMode] = useState('vendas');

  function handleSelectTab(tab) {
    setActiveTab(tab);
    if (CHART_MODES.includes(tab)) setChartMode(tab);
  }

  // --- Filiais: real (Firestore) quando configurado, mock local caso contrário ---
  const [filiaisMock, setFiliaisMock] = useState(MOCK_FILIAIS);
  const [filiaisReais, setFiliaisReais] = useState([]);
  const [activeFilialId, setActiveFilialId] = useState(MOCK_FILIAIS[0].id);

  useEffect(() => {
    if (!firebaseIsConfigured) return undefined;
    const unsubscribe = onSnapshot(collection(db, 'filiais'), (snap) => {
      const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setFiliaisReais(lista);
      // Se nada estiver selecionado ainda (primeira carga), seleciona a primeira.
      setActiveFilialId((cur) => (lista.some((f) => f.id === cur) ? cur : lista[0]?.id ?? cur));
    });
    return unsubscribe;
  }, []);

  const filiais = firebaseIsConfigured ? filiaisReais : filiaisMock;

  async function handleAddFilial(nome) {
    if (firebaseIsConfigured) {
      const ref = await addDoc(collection(db, 'filiais'), { nome, criadoEm: serverTimestamp() });
      setActiveFilialId(ref.id);
    } else {
      const id = `${nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
      setFiliaisMock((prev) => [...prev, { id, nome }]);
      setActiveFilialId(id);
    }
  }

  // --- Dataset do gráfico principal: PerformanceChart decide sozinho se usa
  // dados reais (Firestore) ou mock, com base em firebaseIsConfigured. ---

  async function handleLogout() {
    if (firebaseIsConfigured) await signOut(auth);
    onLogout?.();
  }

  return (
    <div className="dashboard">
      <Sidebar
        activeTab={activeTab}
        onSelect={handleSelectTab}
        filiais={filiais}
        activeFilialId={activeFilialId}
        onSelectFilial={setActiveFilialId}
        onAddFilial={handleAddFilial}
        onLogout={handleLogout}
      />

      <main className="dashboard__main">
        {activeTab !== 'extrato' && activeTab !== 'pendencias' && activeTab !== 'clientes' && activeTab !== 'fechamentos' && (
          <div className="dashboard__chart-slot">
            {activeFilialId && (
              <Suspense fallback={null}>
                <PerformanceChart filialId={activeFilialId} mode={chartMode} key={activeFilialId} />
              </Suspense>
            )}
          </div>
        )}

        {activeTab && activeFilialId && (
          <div className="dashboard__tab-panel">
            <span className="dashboard__tab-eyebrow">{TAB_LABELS[activeTab]}</span>
            <Suspense fallback={<p className="dashboard__tab-empty">Carregando…</p>}>

            {activeTab === 'vendas' && <VendasTab filialId={activeFilialId} />}
            {activeTab === 'funcionarios' && <FuncionariosTab filialId={activeFilialId} />}
            {activeTab === 'clientes' && <ClientesTab filialId={activeFilialId} />}
            {activeTab === 'pendencias' && <PendenciasTab filialId={activeFilialId} />}
            {activeTab === 'fechamentos' && <FechamentosTab filialId={activeFilialId} />}
            {/* key={activeFilialId} zera o desbloqueio de senha ao trocar de
                filial — dado bancário de uma filial não pode ficar aberto
                depois de sair dela. */}
            {activeTab === 'extrato' && (
              <ExtratoTab filialId={activeFilialId} key={activeFilialId} />
            )}
            </Suspense>
          </div>
        )}
      </main>
    </div>
  );
}
