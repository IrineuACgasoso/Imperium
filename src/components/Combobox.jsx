import { useEffect, useMemo, useRef, useState } from 'react';
import { handleEnterNavigation } from '../utils/formNav.js';
import './Combobox.css';

const normalize = (s) =>
  (s ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/**
 * Seletor de opção navegável 100% pelo teclado.
 *
 * Por padrão (`allowFree: false`) o campo NÃO aceita digitação: ele é um
 * botão que abre a lista, onde ↑/↓ movem e Enter escolhe e já pula pro
 * próximo campo do formulário. Isso evita erro de digitação em campos onde o
 * valor precisa casar com um cadastro (funcionário, por exemplo).
 *
 * Com `allowFree: true` vira um campo de texto com sugestões — usado só onde
 * o usuário pode criar um valor novo (distribuidora, tipo de imposto).
 */
export default function Combobox({
  value,
  onChange,
  options,
  placeholder,
  allowFree = false,
  minWidth = 170,
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const controlRef = useRef(null);

  const filtered = useMemo(() => {
    if (!allowFree) return options;
    const term = normalize(value);
    if (!term) return options;
    return options.filter((o) => normalize(o.label).includes(term));
  }, [options, value, allowFree]);

  // Ao abrir, começa destacando a opção já escolhida (não a primeira da lista).
  useEffect(() => {
    if (!open) return;
    const idx = filtered.findIndex((o) => normalize(o.value) === normalize(value));
    setHighlight(idx >= 0 ? idx : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[highlight];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  function choose(option, avancar) {
    onChange(option.value, option);
    setOpen(false);
    // Enter escolhe E avança pro próximo campo — o clique do mouse só escolhe.
    if (avancar && controlRef.current) {
      handleEnterNavigation({
        key: 'Enter',
        currentTarget: controlRef.current,
        preventDefault: () => {},
      });
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      setHighlight((h) => (filtered.length ? (h + dir + filtered.length) % filtered.length : 0));
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (open && filtered.length > 0) {
        choose(filtered[highlight], true);
      } else if (!open) {
        // Campo fechado: se já tem valor, Enter só segue o fluxo do form;
        // se está vazio, abre a lista para o usuário escolher.
        if (value) handleEnterNavigation({ ...e, currentTarget: controlRef.current });
        else setOpen(true);
      }
    }
  }

  return (
    <div className="combobox" ref={rootRef} style={{ minWidth }}>
      {allowFree ? (
        <input
          ref={controlRef}
          type="text"
          className="combobox__input"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value, null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <button
          ref={controlRef}
          type="button"
          className={`combobox__display ${value ? '' : 'is-placeholder'}`}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={handleKeyDown}
        >
          {value || placeholder}
        </button>
      )}
      <button
        type="button"
        className="combobox__toggle"
        tabIndex={-1}
        onClick={() => setOpen((v) => !v)}
        title="Ver opções"
      >
        ▾
      </button>

      {open && (
        <div className="combobox__menu" ref={listRef}>
          {filtered.map((o, i) => (
            <button
              key={o.value}
              type="button"
              className={`combobox__item ${i === highlight ? 'is-highlighted' : ''}`}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => choose(o, false)}
            >
              {o.label}
            </button>
          ))}
          {filtered.length === 0 && (
            <span className="combobox__empty">
              {allowFree ? 'Nenhuma opção — será criada ao salvar.' : 'Nenhuma opção disponível.'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
