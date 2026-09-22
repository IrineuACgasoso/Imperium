import { useEffect, useRef, useState } from 'react';
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
  const inicioRef = useRef(null);
  const fimRef = useRef(null);
  const aplicarRef = useRef(null);
  const activeLabel = OPTIONS.find((o) => o.id === period)?.label ?? 'Período';

  // Abrir "Personalizado" já joga o cursor na data de início, pro usuário
  // digitar início → Enter → fim → Enter → aplicado, sem tocar no mouse.
  useEffect(() => {
    if (open && period === 'personalizado') {
      setTimeout(() => inicioRef.current?.focus(), 0);
    }
  }, [open, period]);

  // Este seletor não vive dentro de um <form>, então a navegação por Enter é
  // encadeada na mão em vez de usar o formNav.
  function avancarCom(ref, aoFinal) {
    return (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (ref?.current) ref.current.focus();
      if (aoFinal) aoFinal();
    };
  }

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
                  ref={inicioRef}
                  type="date"
                  value={customRange.start}
                  onChange={(e) => onChangeCustomRange({ ...customRange, start: e.target.value })}
                  onKeyDown={avancarCom(fimRef)}
                />
              </label>
              <label>
                Fim
                <input
                  ref={fimRef}
                  type="date"
                  value={customRange.end}
                  onChange={(e) => onChangeCustomRange({ ...customRange, end: e.target.value })}
                  onKeyDown={avancarCom(aplicarRef)}
                />
              </label>
              <button
                ref={aplicarRef}
                className="period-selector__apply"
                onClick={() => setOpen(false)}
              >
                Aplicar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
