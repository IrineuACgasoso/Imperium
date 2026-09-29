import { FONTES_EXTRATO, rotuloFonte } from './constants.js';
import { TabelaVendas, TabelaExtratoBanco, TabelaExtratoCartao } from './tabelas.jsx';

function FiltroData({ value, onChange, tituloLimpar }) {
  return (
    <label className="pend__filtro-data">
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
      {value && (
        <button
          type="button"
          className="pend__filtro-data-limpar"
          onClick={() => onChange('')}
          title={tituloLimpar}
        >
          Ver todas
        </button>
      )}
    </label>
  );
}

export function ColunaVendas({
  vendas,
  selecionadas,
  onToggle,
  comCheckbox,
  asc,
  onInverter,
  busca,
  onBusca,
  data,
  onData,
}) {
  return (
    <section className="pend__col">
      <div className="pend__col-header">
        <div className="pend__col-header-left">
          <h3 className="pend__col-title">CDS — vendas</h3>
          <input
            type="search"
            className="pend__busca-cliente"
            placeholder="Buscar cliente…"
            value={busca}
            onChange={(e) => onBusca(e.target.value)}
          />
        </div>
        <FiltroData value={data} onChange={onData} tituloLimpar="Ver vendas de todas as datas" />
      </div>
      <div className="pend__col-scroll">
        <TabelaVendas
          vendas={vendas}
          selecionadas={selecionadas}
          onToggle={onToggle}
          comCheckbox={comCheckbox}
          asc={asc}
          onInverter={onInverter}
        />
      </div>
    </section>
  );
}

export function ColunaExtrato({
  origem,
  onOrigem,
  data,
  onData,
  asc,
  onInverter,
  selecionadas,
  onToggle,
  onMenu,
  comCheckbox,
  lancamentosBanco,
  vinculoPorChave,
  linhasCartao,
}) {
  return (
    <section className="pend__col">
      <div className="pend__col-header">
        <h3 className="pend__col-title">
          Extrato —{' '}
          <span className="pend__fonte-extrato">
            {FONTES_EXTRATO.map((f) => (
              <button
                key={f.id}
                type="button"
                className={'pend__fonte-extrato-btn' + (origem === f.id ? ' is-active' : '')}
                onClick={() => onOrigem(f.id)}
              >
                {f.label}
              </button>
            ))}
          </span>
        </h3>
        <FiltroData value={data} onChange={onData} tituloLimpar="Ver lançamentos de todas as datas" />
      </div>
      <div className="pend__col-scroll">
        {origem === 'bb' ? (
          <TabelaExtratoBanco
            lancamentos={lancamentosBanco}
            vinculoPorChave={vinculoPorChave}
            selecionadas={selecionadas}
            onToggle={onToggle}
            onMenu={onMenu}
            comCheckbox={comCheckbox}
            asc={asc}
            onInverter={onInverter}
          />
        ) : (
          <TabelaExtratoCartao
            linhas={linhasCartao}
            rotuloFonte={rotuloFonte(origem)}
            selecionadas={selecionadas}
            onToggle={onToggle}
            onMenu={onMenu}
            asc={asc}
            onInverter={onInverter}
          />
        )}
      </div>
    </section>
  );
}
