import { useEffect, useRef } from 'react';
import './ContextMenu.css';

/**
 * Menu de clique-direito. Quem usa guarda {x, y, alvo} num estado e renderiza
 * este componente; ele se fecha sozinho ao clicar fora, rolar a página ou
 * apertar Esc.
 *
 * O menu é reposicionado se estourar a janela — sem isso, clicar numa linha
 * do rodapé da tabela abriria o menu metade pra fora da tela.
 */
export default function ContextMenu({ x, y, onClose, itens }) {
  const ref = useRef(null);

  useEffect(() => {
    function fechar(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    function tecla(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', fechar);
    document.addEventListener('keydown', tecla);
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('mousedown', fechar);
      document.removeEventListener('keydown', tecla);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.right > window.innerWidth) el.style.left = `${window.innerWidth - r.width - 8}px`;
    if (r.bottom > window.innerHeight) el.style.top = `${window.innerHeight - r.height - 8}px`;
  }, [x, y]);

  return (
    <div className="context-menu" ref={ref} style={{ left: x, top: y }} role="menu">
      {itens.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={`context-menu__item ${item.perigo ? 'is-danger' : ''}`}
          disabled={item.desabilitado}
          onClick={() => {
            item.onClick();
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
