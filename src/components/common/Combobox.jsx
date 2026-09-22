import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { focusNextFieldDeferred } from '../../utils/formNav.js';
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
 * Em qualquer modo: ↑/↓ abrem a lista e movem a seleção, Enter confirma e já
 * pula pro próximo campo do formulário, Esc fecha sem escolher. O controle é
 * marcado com `data-form-nav` pra entrar na fila de campos do formNav — é o
 * que faz o Enter vindo do campo anterior parar aqui em vez de pular por cima.
 *
 * Por padrão (`allowFree: false`) o campo não aceita digitação: é um botão que
 * abre a lista. Evita erro de digitação onde o valor precisa casar com um
 * cadastro (funcionário, categoria).
 *
 * Com `allowFree: true` vira campo de texto com sugestões — usado onde o
 * usuário pode criar um valor novo (distribuidora, tipo de imposto). Aí o
 * Enter só substitui o texto pela opção destacada se o usuário tiver navegado
 * com as setas; caso contrário mantém o que ele digitou e avança.
 */
const Combobox = forwardRef(function Combobox(
  { value, onChange, options, placeholder, allowFree = false, minWidth = 170, ariaLabel },
  ref
) {
  const [open, setOpen] = useState(false);
  // -1 = "nenhuma opção destacada" (usado no modo texto livre antes de o
  // usuário mexer nas setas).
  const [highlight, setHighlight] = useState(-1);
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const controlRef = useRef(null);

  useImperativeHandle(ref, () => controlRef.current, []);

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
    if (idx >= 0) setHighlight(idx);
    else setHighlight(allowFree ? -1 : 0);
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
    if (!open || !listRef.current || highlight < 0) return;
    const el = listRef.current.children[highlight];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  function avancar() {
    // Adiado de propósito: escolher uma categoria pode fazer surgir um campo
    // novo logo depois deste (Funcionário, Distribuidora…), e ele precisa
    // existir no DOM antes de procurarmos o "próximo campo".
    if (controlRef.current) focusNextFieldDeferred(controlRef.current);
  }

  function choose(option, avancarDepois) {
    onChange(option.value, option);
    setOpen(false);
    // Enter escolhe E avança pro próximo campo — o clique do mouse só escolhe.
    if (avancarDepois) avancar();
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (!filtered.length) return;
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      setHighlight((h) => {
        if (h < 0) return dir === 1 ? 0 : filtered.length - 1;
        return (h + dir + filtered.length) % filtered.length;
      });
      return;
    }

    if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
      return;
    }

    if (e.key === 'Tab') {
      setOpen(false);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (open && highlight >= 0 && filtered[highlight]) {
        choose(filtered[highlight], true);
        return;
      }
      if (allowFree) {
        // Texto livre sem opção destacada: vale o que foi digitado.
        setOpen(false);
        avancar();
        return;
      }
      if (open) {
        // Lista aberta, nada destacado (lista vazia) — só segue em frente.
        setOpen(false);
        avancar();
        return;
      }
      // Fechado: com valor escolhido, Enter segue o fluxo do formulário;
      // vazio, abre a lista pro usuário escolher com as setas.
      if (value) avancar();
      else setOpen(true);
    }
  }

  return (
    <div className="combobox" ref={rootRef} style={{ minWidth }}>
      {allowFree ? (
        <input
          ref={controlRef}
          type="text"
          data-form-nav=""
          className="combobox__input"
          placeholder={placeholder}
          aria-label={ariaLabel ?? placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value, null);
            setOpen(true);
            setHighlight(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <button
          ref={controlRef}
          type="button"
          data-form-nav=""
          aria-label={ariaLabel ?? placeholder}
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
        onClick={() => {
          setOpen((v) => !v);
          controlRef.current?.focus();
        }}
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
              tabIndex={-1}
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
});

export default Combobox;
