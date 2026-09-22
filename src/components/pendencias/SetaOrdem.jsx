/** Seta de inversão de ordem — mesmo componente nas duas tabelas de Pendências. */
export default function SetaOrdem({ asc, onClick, titulo }) {
  return (
    <button type="button" className="pend__seta-ordem" onClick={onClick} title={titulo}>
      {asc ? '↑' : '↓'}
    </button>
  );
}
