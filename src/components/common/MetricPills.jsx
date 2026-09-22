import { useEffect, useRef, useState } from 'react';
import './MetricPills.css';

export const METRIC_ITEMS = [
  { key: 'vendasTotais', label: 'Totais' },
  { key: 'lucro', label: 'Lucro' },
  { key: 'vendasPix', label: 'Pix' },
  { key: 'vendasCartao', label: 'Cartão' },
  { key: 'vendasBoleto', label: 'Boleto' },
  { key: 'vendasPromissoria', label: 'Promissória' },
  { key: 'vendasDinheiro', label: 'Dinheiro' },
];

// Seletor de métrica colapsado num único dropdown (pra não ocupar uma fileira
// inteira de botões). Fecha ao clicar fora ou ao escolher uma opção.
// `items` permite trocar a lista conforme a aba: em Vendas são as formas de
// pagamento; em Gastos são as categorias de gasto.
export default function MetricPills({ activeKey, onSelect, items = METRIC_ITEMS }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const activeItem = items.find((i) => i.key === activeKey);

  useEffect(() => {
    if (!open) return undefined;
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="metric-pills" ref={rootRef}>
      <button className="metric-pills__trigger" onClick={() => setOpen((v) => !v)}>
        <span>{activeItem?.label ?? 'Exibição'}</span>
        <span className="metric-pills__chevron">▾</span>
      </button>

      {open && (
        <div className="metric-pills__menu">
          {items.map((item) => (
            <button
              key={item.key}
              className={`metric-pills__item ${activeKey === item.key ? 'is-active' : ''}`}
              onClick={() => {
                onSelect(item.key);
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
