import { memo } from 'react';
import { currency, formatarData } from '../pendencias/utils.js';

function tipoDaBaixa(b) {
  const modo = b.automatica ? 'Automática' : b.poda ? 'Poda' : 'Manual';
  return `${modo}${b.forcada ? ' (forçada)' : ''}`;
}

/** Um fechamento: cabeçalho de uma linha + vendas (esq.) e pagamentos (dir.) em linhas coladas. */
function BaixaCard({ baixa, vendas, lancamentos, restaurando, onRestaurar }) {
  const ehCartao = baixa.colecaoLancamento === 'extratoCartao';
  const detalhe = baixa.justificativa ?? baixa.motivo;

  return (
    <article className="fech__baixa">
      <header className="fech__baixa-header">
        <span className="fech__baixa-data">
          {new Date(baixa.fechadoEmMs).toLocaleDateString('pt-BR')}
        </span>
        <span className="fech__baixa-meta" title={detalhe || undefined}>
          {tipoDaBaixa(baixa)} · {ehCartao ? 'Maquininha' : 'Banco'}
          {detalhe && ` · ${detalhe}`}
        </span>
        <strong className="fech__baixa-total">{currency.format(baixa.total)}</strong>
        <button
          type="button"
          className="fech__restaurar"
          onClick={() => onRestaurar(baixa)}
          disabled={restaurando}
        >
          {restaurando ? 'Restaurando…' : 'Restaurar'}
        </button>
      </header>

      <div className="fech__lados">
        <table className="fech__lista">
          <tbody>
            {vendas.map((v) => (
              <tr key={v.id}>
                <td className="fech__c-data">{formatarData(v.data)}</td>
                <td className="fech__c-num">{v.numeroVenda || '—'}</td>
                <td className="fech__c-nome" title={v.clienteNome}>
                  {v.clienteNome}
                </td>
                <td className="fech__c-forma">{v.forma}</td>
                <td className="fech__c-valor">{currency.format(v.valor)}</td>
              </tr>
            ))}
            {vendas.length === 0 && (
              <tr>
                <td className="fech__vazio">Sem venda associada.</td>
              </tr>
            )}
          </tbody>
        </table>

        <table className="fech__lista">
          <tbody>
            {lancamentos.map((l) => (
              <tr key={l.id}>
                <td className="fech__c-data">{formatarData(l.data)}</td>
                <td className="fech__c-nome" title={ehCartao ? l.bandeira : l.contraparteNome || l.historico}>
                  {ehCartao ? l.bandeira : l.contraparteNome || l.historico}
                </td>
                <td className="fech__c-forma">
                  {ehCartao
                    ? l.parcelas > 1
                      ? `${l.parcelas}x`
                      : 'à vista'
                    : l.tipo === 'credito'
                      ? 'Crédito'
                      : 'Débito'}
                </td>
                <td className="fech__c-valor">{currency.format(l.valor)}</td>
              </tr>
            ))}
            {lancamentos.length === 0 && (
              <tr>
                <td className="fech__vazio">Sem pagamento associado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export default memo(BaixaCard);
