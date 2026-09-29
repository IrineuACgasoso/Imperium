export default function FormaChips({ formas, contagem }) {
  const { disponiveis, selecionadas, todas, toggle, toggleTodas } = formas;
  return (
    <div className="pend__toolbar">
      <div className="pend__formas">
        <button type="button" className="pend__forma-chip pend__forma-chip--all" onClick={toggleTodas}>
          {todas ? 'Deselecionar todas' : 'Selecionar todas'}
        </button>
        {disponiveis.map((forma) => (
          <button
            key={forma}
            type="button"
            className={`pend__forma-chip ${selecionadas.includes(forma) ? 'is-active' : ''}`}
            onClick={() => toggle(forma)}
          >
            {forma}
          </button>
        ))}
        {disponiveis.length === 0 && (
          <span className="pend__formas-empty">Nenhuma venda importada ainda.</span>
        )}
      </div>
      <span className="pend__contagem">{contagem}</span>
    </div>
  );
}
