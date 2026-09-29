import { currency } from './utils.js';

export function PodaBarra({ todasMarcadas, onToggleTodas }) {
  return (
    <div className="pend__poda-barra">
      <span>
        Modo poda: marque linhas nas duas tabelas abaixo, de qualquer forma — não precisa bater
        cliente, nome ou valor. Serve só para fechar dados antigos que ficaram travados por causa
        de melhorias parciais no projeto.
      </span>
      <button type="button" className="pend__lapis-todas" onClick={onToggleTodas}>
        {todasMarcadas ? 'Deselecionar todas' : 'Selecionar todas'}
      </button>
    </div>
  );
}

export function PodaAcoes({ qtdVendas, qtdLancamentos, onLimpar, onPodar }) {
  return (
    <div className="pend__acoes">
      <div className="pend__selecao is-poda">
        <span>
          {qtdVendas} venda(s) e {qtdLancamentos} lançamento(s) marcados pra poda
        </span>
        <button type="button" className="pend__limpar" onClick={onLimpar}>
          Limpar seleção
        </button>
      </div>
      <div className="pend__botoes">
        <button type="button" className="pend__primario is-poda" onClick={onPodar}>
          Podar selecionadas
        </button>
      </div>
    </div>
  );
}

export function AcoesBaixa({
  selecao,
  temSelecao,
  processando,
  aviso,
  onLimpar,
  onAplicar,
  onBaixaSelecao,
}) {
  return (
    <div className="pend__acoes">
      {temSelecao && (
        <div className={`pend__selecao ${selecao.bate ? 'is-ok' : 'is-diff'}`}>
          <span>
            CDS {currency.format(selecao.totalVendas)} · Extrato {currency.format(selecao.totalPagos)}
          </span>
          {selecao.bate ? (
            <strong>valores batem</strong>
          ) : (
            <strong>
              diferença de {currency.format(Math.abs(selecao.diferenca))}{' '}
              {selecao.diferenca > 0 ? '(falta receber)' : '(recebido a mais)'}
            </strong>
          )}
          <button type="button" className="pend__limpar" onClick={onLimpar}>
            Limpar seleção
          </button>
        </div>
      )}

      <div className="pend__botoes">
        <button type="button" className="pend__primario" onClick={onAplicar} disabled={processando}>
          {processando ? 'Processando…' : 'Aplicar Baixas'}
        </button>
        <button
          type="button"
          className="pend__secundario"
          onClick={onBaixaSelecao}
          disabled={processando || !temSelecao}
        >
          Dar baixa na seleção
        </button>
      </div>

      {aviso && <p className="pend__aviso">{aviso}</p>}
    </div>
  );
}
