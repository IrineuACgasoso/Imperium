import { useEffect, useRef, useState } from 'react';
import './SearchableSelect.css';

/**
 * Input de texto com autocomplete + navegação por setas (↑/↓ pra navegar,
 * Enter pra escolher, Esc pra fechar). Sempre aceita texto livre também —
 * quando `onCreate` é passado, qualquer valor confirmado que não esteja em
 * `options` é reportado pra quem chamou salvar/persistir (ex: nova
 * distribuidora, novo tipo de imposto).
 */
export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  onCreate,
  autoFocus,
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const rootRef = useRef(null);

  const filtered = options.filter((o) => o.toLowerCase().includes((value ?? '').toLowerCase()));

  useEffect(() => {
    if (!open) return undefined;
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function commit(val) {
    onChange(val);
    if (onCreate && val.trim() && !options.some((o) => o.toLowerCase() === val.trim().toLowerCase())) {
      onCreate(val.trim());
    }
    setOpen(false);
    setHighlight(-1);
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && highlight >= 0 && filtered[highlight]) {
        e.preventDefault();
        commit(filtered[highlight]);
      } else {
        setOpen(false);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setHighlight(-1);
    }
  }

  return (
    <div className="searchable-select" ref={rootRef}>
      <input
        type="text"
        placeholder={placeholder}
        value={value ?? ''}
        autoFocus={autoFocus}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {open && filtered.length > 0 && (
        <div className="searchable-select__menu">
          {filtered.map((o, idx) => (
            <button
              type="button"
              key={o}
              className={`searchable-select__item ${idx === highlight ? 'is-highlighted' : ''}`}
              onMouseEnter={() => setHighlight(idx)}
              onClick={() => commit(o)}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
