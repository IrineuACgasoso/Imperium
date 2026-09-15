import { useEffect, useState } from 'react';
import { collection, addDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import Sidebar from './Sidebar.jsx';
import PerformanceChart from './PerformanceChart.jsx';
import ImportPanel from './ImportPanel.jsx';
import FuncionariosTab from './FuncionariosTab.jsx';
import GastosTab from './GastosTab.jsx';
import VendasTab from './VendasTab.jsx';
import { db, auth, firebaseIsConfigured } from '../config/firebase.js';
import './Dashboard.css';

const TAB_LABELS = {
  vendas: 'Vendas',
  funcionarios: 'Funcionários',
  gastos: 'Gastos',
  importar: 'Importar dados (IA)',
};

const MOCK_FILIAIS = [{ id: 'recife-matriz', nome: 'Recife — Matriz' }];

const CHART_MODES = ['vendas', 'funcionarios', 'gastos'];

export default function Dashboard({ onLogout }) {
  const [activeTab, setActiveTab] = useState(null);
  // O gráfico principal sempre reflete a última aba "de dados" visitada
  // (vendas/funcionários/gastos). A aba "Importar dados (IA)" não tem
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
        <div className="dashboard__chart-slot">
          {activeFilialId && (
            <PerformanceChart filialId={activeFilialId} mode={chartMode} key={activeFilialId} />
          )}
        </div>

        {activeTab && activeFilialId && (
          <div className={activeTab === 'importar' ? 'dashboard__import-slot' : 'dashboard__tab-panel'}>
            {activeTab !== 'importar' && (
              <span className="dashboard__tab-eyebrow">{TAB_LABELS[activeTab]}</span>
            )}

            {activeTab === 'vendas' && <VendasTab filialId={activeFilialId} />}
            {activeTab === 'funcionarios' && <FuncionariosTab filialId={activeFilialId} />}
            {activeTab === 'gastos' && <GastosTab filialId={activeFilialId} />}
            {activeTab === 'importar' && <ImportPanel filialId={activeFilialId} />}
          </div>
        )}
      </main>
    </div>
  );
}
