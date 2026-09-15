import { useState } from 'react';
import './PeriodSelector.css';

const OPTIONS = [
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mês' },
  { id: 'ano', label: 'Ano' },
  { id: 'maximo', label: 'Máximo' },
  { id: 'personalizado', label: 'Personalizado' },
];

export default function PeriodSelector({ period, onChangePeriod, customRange, onChangeCustomRange }) {
  const [open, setOpen] = useState(false);
  const activeLabel = OPTIONS.find((o) => o.id === period)?.label ?? 'Período';

  return (
    <div className="period-selector">
      <button className="period-selector__trigger" onClick={() => setOpen((v) => !v)}>
        {activeLabel}
        <span className="period-selector__chevron">▾</span>
      </button>

      {open && (
        <div className="period-selector__menu">
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              className={`period-selector__option ${period === o.id ? 'is-active' : ''}`}
              onClick={() => {
                onChangePeriod(o.id);
                if (o.id !== 'personalizado') setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}

          {period === 'personalizado' && (
            <div className="period-selector__custom">
              <label>
                Início
                <input
                  type="date"
                  value={customRange.start}
                  onChange={(e) => onChangeCustomRange({ ...customRange, start: e.target.value })}
                />
              </label>
              <label>
                Fim
                <input
                  type="date"
                  value={customRange.end}
                  onChange={(e) => onChangeCustomRange({ ...customRange, end: e.target.value })}
                />
              </label>
              <button className="period-selector__apply" onClick={() => setOpen(false)}>
                Aplicar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
