import FilialSelector from './FilialSelector.jsx';
import './Sidebar.css';

const NAV_ITEMS = [
  { id: 'vendas', label: 'Vendas' },
  { id: 'funcionarios', label: 'Funcionários' },
  { id: 'gastos', label: 'Gastos' },
  { id: 'importar', label: 'Importar dados (IA)' },
];

export default function Sidebar({
  activeTab,
  onSelect,
  filiais,
  activeFilialId,
  onSelectFilial,
  onAddFilial,
  onLogout,
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__brand-mark">IC</span>
        <span className="sidebar__brand-name">Imperium<br />das Chaves</span>
      </div>

      <FilialSelector
        filiais={filiais}
        activeFilialId={activeFilialId}
        onSelect={onSelectFilial}
        onAddFilial={onAddFilial}
      />

      <nav className="sidebar__nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`sidebar__nav-item ${activeTab === item.id ? 'is-active' : ''}`}
            onClick={() => onSelect(item.id)}
          >
            <span className="sidebar__nav-dot" />
            {item.label}
          </button>
        ))}
      </nav>

      <button className="sidebar__logout" onClick={onLogout}>
        Sair
      </button>
    </aside>
  );
}
