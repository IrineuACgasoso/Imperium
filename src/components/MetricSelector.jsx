import { useState } from 'react';
import './MetricSelector.css';

export default function MetricSelector({ groups, activeKey, onSelect }) {
  const [open, setOpen] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState(null);

  const activeItem = groups
    .flatMap((g) => g.items)
    .find((i) => i.key === activeKey);

  return (
    <div className="metric-selector">
      <button className="metric-selector__trigger" onClick={() => setOpen((v) => !v)}>
        <span className="metric-selector__label">{activeItem?.label ?? 'Exibição'}</span>
        <span className="metric-selector__chevron">▾</span>
      </button>

      {open && (
        <div className="metric-selector__menu">
          {groups.map((group) => (
            <div key={group.key} className="metric-selector__group">
              <button
                className="metric-selector__group-title"
                onClick={() =>
                  setExpandedGroup((cur) => (cur === group.key ? null : group.key))
                }
              >
                {group.label}
                <span className="metric-selector__group-chevron">
                  {expandedGroup === group.key ? '▾' : '▸'}
                </span>
              </button>

              {expandedGroup === group.key && (
                <div className="metric-selector__items">
                  {group.items.map((item) => (
                    <button
                      key={item.key}
                      className={`metric-selector__item ${
                        activeKey === item.key ? 'is-active' : ''
                      }`}
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
          ))}
        </div>
      )}
    </div>
  );
}
