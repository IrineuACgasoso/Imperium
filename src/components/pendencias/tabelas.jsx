// Tabelas de Pendências. As linhas são memoizadas: marcar uma linha só
// re-renderiza a própria linha, não as centenas ao redor.
import { memo } from 'react';
import { abreviarFormaPagamento } from '../../parsers/extratoBB.js';
import SetaOrdem from './SetaOrdem.jsx';
import { currency, formatarData } from './utils.js';

const ThData = ({ asc, onInverter }) => (
  <th>
    Data <SetaOrdem asc={asc} onClick={onInverter} titulo="Inverter ordem desta tabela" />
  </th>
);

const CelulaCheckbox = ({ marcada, onToggle, id }) => (
  <td className="pend__poda-col" onClick={(e) => e.stopPropagation()}>
    <input type="checkbox" checked={marcada} onChange={() => onToggle(id)} />
  </td>
);

const LinhaVenda = memo(function LinhaVenda({ v, marcada, comCheckbox, onToggle }) {
  return (
    <tr className={marcada ? 'is-selected' : ''} onClick={() => onToggle(v.id)}>
      {comCheckbox && <CelulaCheckbox marcada={marcada} onToggle={onToggle} id={v.id} />}
      <td>{formatarData(v.data)}</td>
      <td>{v.numeroVenda || '—'}</td>
      <td>{v.clienteNome}</td>
      <td className="pend__forma">{v.forma}</td>
      <td className="extrato__num">{currency.format(v.valor)}</td>
    </tr>
  );
});

export function TabelaVendas({ vendas, selecionadas, onToggle, comCheckbox, asc, onInverter }) {
  return (
    <table className="crud-tab__table pend__table">
      <thead>
        <tr>
          {comCheckbox && <th className="pend__poda-col" />}
          <ThData asc={asc} onInverter={onInverter} />
          <th>Venda</th>
          <th>Cliente</th>
          <th>Tipo</th>
          <th className="extrato__num">Valor</th>
        </tr>
      </thead>
      <tbody>
        {vendas.map((v) => (
          <LinhaVenda
            key={v.id}
            v={v}
            marcada={selecionadas.has(v.id)}
            comCheckbox={comCheckbox}
            onToggle={onToggle}
          />
        ))}
        {vendas.length === 0 && (
          <tr>
            <td colSpan={comCheckbox ? 6 : 5} className="crud-tab__empty">
              Nenhuma venda pendente. Importe um Caixa Diário na aba Vendas.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

const LinhaBanco = memo(function LinhaBanco({ l, vinculo, marcada, comCheckbox, onToggle, onMenu }) {
  return (
    <tr
      className={marcada ? 'is-selected' : ''}
      onClick={() => onToggle(l.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onMenu({ x: e.clientX, y: e.clientY, lancamento: l, vinculo });
      }}
    >
      {comCheckbox && <CelulaCheckbox marcada={marcada} onToggle={onToggle} id={l.id} />}
      <td>{formatarData(l.data)}</td>
      <td>{l.contraparteNome || <span className="extrato__vazio">(não identificado)</span>}</td>
      <td className="pend__forma-col">{abreviarFormaPagamento(l.historico)}</td>
      <td>
        {vinculo ? (
          <span className="extrato__cliente">{vinculo.clienteNome}</span>
        ) : (
          <span className="extrato__vazio">sem associação</span>
        )}
      </td>
      <td className="extrato__num extrato__valor--credito">+ {currency.format(l.valor)}</td>
    </tr>
  );
});

export function TabelaExtratoBanco({
  lancamentos,
  vinculoPorChave,
  selecionadas,
  onToggle,
  onMenu,
  comCheckbox,
  asc,
  onInverter,
}) {
  return (
    <table className="crud-tab__table pend__table">
      <thead>
        <tr>
          {comCheckbox && <th className="pend__poda-col" />}
          <ThData asc={asc} onInverter={onInverter} />
          <th>Conta / histórico</th>
          <th className="pend__forma-col" title="Forma de pagamento">
            Forma
          </th>
          <th>Cliente / categoria</th>
          <th className="extrato__num">Valor</th>
        </tr>
      </thead>
      <tbody>
        {lancamentos.map((l) => (
          <LinhaBanco
            key={l.id}
            l={l}
            vinculo={vinculoPorChave.get(l.chaveContraparte)}
            marcada={selecionadas.has(l.id)}
            comCheckbox={comCheckbox}
            onToggle={onToggle}
            onMenu={onMenu}
          />
        ))}
        {lancamentos.length === 0 && (
          <tr>
            <td colSpan={comCheckbox ? 6 : 5} className="crud-tab__empty">
              Nenhum lançamento pendente. Importe o extrato na aba Extrato.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

const LinhaCartao = memo(function LinhaCartao({ c, marcada, onToggle, onMenu }) {
  return (
    <tr
      className={marcada ? 'is-selected' : ''}
      onClick={() => onToggle(c.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onMenu({ x: e.clientX, y: e.clientY, lancamento: c });
      }}
    >
      <td>{formatarData(c.data)}</td>
      <td>{c.bandeira}</td>
      <td>{c.parcelas > 1 ? `${c.parcelas}x` : 'à vista'}</td>
      <td className="extrato__num extrato__valor--credito">+ {currency.format(c.valor)}</td>
    </tr>
  );
});

export function TabelaExtratoCartao({
  linhas,
  rotuloFonte,
  selecionadas,
  onToggle,
  onMenu,
  asc,
  onInverter,
}) {
  return (
    <table className="crud-tab__table pend__table">
      <thead>
        <tr>
          <ThData asc={asc} onInverter={onInverter} />
          <th>Bandeira</th>
          <th>Parcelas</th>
          <th className="extrato__num">Valor</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((c) => (
          <LinhaCartao
            key={c.id}
            c={c}
            marcada={selecionadas.has(c.id)}
            onToggle={onToggle}
            onMenu={onMenu}
          />
        ))}
        {linhas.length === 0 && (
          <tr>
            <td colSpan={4} className="crud-tab__empty">
              Nenhum lançamento pendente. Importe o extrato da {rotuloFonte} na aba Extrato.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
