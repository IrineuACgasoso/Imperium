import { useMemo, useState } from 'react';
import Combobox from '../common/Combobox.jsx';
import { formatarDocumentoExibicao } from '../../parsers/extratoBB.js';
import { currency, formatarData } from './utils.js';

export function AssociarClientePendenciasModal({ lancamento, clientes, vinculoAtual, onCancel, onConfirm }) {
  const [nome, setNome] = useState(vinculoAtual?.clienteNome ?? '');
  const [clienteId, setClienteId] = useState(vinculoAtual?.clienteId ?? '');
  const cliente = clientes.find((c) => c.id === clienteId);
  const options = useMemo(
    () => clientes.map((c) => ({ value: c.nome, label: c.nome, id: c.id })),
    [clientes]
  );

  return (
    <div className="modal-overlay" onMouseDown={onCancel}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="modal__title">Associar cliente</h3>
        <p className="modal__desc">
          Conta: <strong>{lancamento.contraparteNome || '(sem nome)'}</strong>
          {lancamento.contraparteDocumento
            ? ` — ${formatarDocumentoExibicao(lancamento.contraparteDocumento)}`
            : ''}
        </p>
        <Combobox
          value={nome}
          onChange={(v, option) => {
            setNome(v);
            setClienteId(option?.id ?? '');
          }}
          options={options}
          placeholder="Digite pra buscar o cliente cadastrado"
          allowFree
          minWidth={320}
        />
        <div className="modal__actions">
          <button
            type="button"
            className="pdf-import__confirm"
            disabled={!cliente}
            onClick={() => onConfirm(cliente)}
          >
            Associar
          </button>
          <button type="button" className="pdf-import__cancel" onClick={onCancel}>
            Cancelar
          </button>
        </div>
        <p className="modal__nota">
          Associar por aqui é a mesma coisa que associar na aba Extrato — não precisa voltar lá
          pra fazer isso.
        </p>
      </div>
    </div>
  );
}

export function ForcarConciliarModal({ lancamento, onCancel, onConfirm, processando }) {
  const [justificativa, setJustificativa] = useState('');
  const pronto = justificativa.trim().length > 0;

  return (
    <div className="modal-overlay" onMouseDown={onCancel}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="modal__title">Forçar Conciliar</h3>
        <p className="modal__desc">
          {formatarData(lancamento.data)} · {lancamento.contraparteNome || lancamento.historico} ·{' '}
          <strong>{currency.format(lancamento.valor)}</strong>
        </p>
        <p className="modal__nota">
          Fecha este pagamento sem uma venda pareada no CDS — para dados antigos que já foram
          conciliados na prática antes desta tela existir. A linha aparece do lado do CDS, entre
          as conciliadas, com a justificativa abaixo no lugar da venda.
        </p>
        <textarea
          className="pend__justificativa"
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
          placeholder="Por que esta baixa está sendo forçada? (obrigatório)"
          rows={3}
        />
        <div className="modal__actions">
          <button
            type="button"
            className="pdf-import__confirm"
            disabled={!pronto || processando}
            onClick={() => onConfirm(justificativa.trim())}
          >
            {processando ? 'Salvando…' : 'Salvar'}
          </button>
          <button type="button" className="pdf-import__cancel" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

export function PodarModal({ quantidadeVendas, quantidadeLancamentos, onCancel, onConfirm, processando }) {
  const [justificativa, setJustificativa] = useState('');
  const pronto = justificativa.trim().length > 0;

  return (
    <div className="modal-overlay" onMouseDown={onCancel}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="modal__title">Podar inconsistências</h3>
        <p className="modal__desc">
          {quantidadeVendas} venda(s) e {quantidadeLancamentos} lançamento(s) marcados serão
          fechados juntos, numa única baixa — <strong>sem</strong> checar se cliente, nome ou
          valor batem entre eles.
        </p>
        <p className="modal__nota">
          Use isto só para dados antigos que na prática já foram conciliados antes desta tela
          existir (ou antes de alguma melhoria recente), e que por isso o sistema não consegue
          mais reconhecer sozinho nem casam com o "Forçar Conciliar" (que exige 1 pagamento com
          cliente associado). A justificativa fica registrada na baixa.
        </p>
        <textarea
          className="pend__justificativa"
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
          placeholder="Por que estes itens estão sendo podados juntos? (obrigatório)"
          rows={3}
        />
        <div className="modal__actions">
          <button
            type="button"
            className="pdf-import__confirm"
            disabled={!pronto || processando}
            onClick={() => onConfirm(justificativa.trim())}
          >
            {processando ? 'Salvando…' : 'Podar'}
          </button>
          <button type="button" className="pdf-import__cancel" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

export function ResolverDiferencaModal({ selecao, onCancel, onConfirm }) {
  const [forma, setForma] = useState('');
  const faltaReceber = selecao.diferenca > 0;
  const opcoes = faltaReceber
    ? FORMAS_COMPLEMENTO
    : [
        { value: 'troco', label: 'Devolvido / troco' },
        { value: 'credito-cliente', label: 'Virou crédito do cliente' },
        { value: 'outra-venda', label: 'Refere-se a outra venda ainda não importada' },
      ];

  const escolhida = opcoes.find((o) => o.value === forma);

  return (
    <div className="modal-overlay" onMouseDown={onCancel}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="modal__title">Os valores não batem</h3>
        <p className="modal__desc">
          CDS: <strong>{currency.format(selecao.totalVendas)}</strong> · Extrato:{' '}
          <strong>{currency.format(selecao.totalPagos)}</strong>
          <br />
          {faltaReceber ? 'Faltam ' : 'Sobram '}
          <strong>{currency.format(Math.abs(selecao.diferenca))}</strong>.{' '}
          {faltaReceber
            ? 'Como o cliente pagou (ou vai pagar) essa diferença?'
            : 'O que foi feito com o valor a mais?'}
        </p>
        <Combobox
          value={escolhida?.label ?? ''}
          onChange={(v, option) => setForma(option?.id ?? '')}
          options={opcoes.map((o) => ({ value: o.label, label: o.label, id: o.value }))}
          placeholder="Escolha o destino da diferença"
          allowFree={false}
          minWidth={320}
        />
        <div className="modal__actions">
          <button
            type="button"
            className="pdf-import__confirm"
            disabled={!escolhida}
            onClick={() =>
              onConfirm({
                tipo: escolhida.value,
                label: escolhida.label,
                valor: selecao.diferenca,
              })
            }
          >
            Dar baixa
          </button>
          <button type="button" className="pdf-import__cancel" onClick={onCancel}>
            Cancelar
          </button>
        </div>
        <p className="modal__nota">
          A diferença fica registrada junto com a baixa, para você saber depois por que aquele
          fechamento não foi exato. Nada é lançado como venda nova nem como gasto.
        </p>
      </div>
    </div>
  );
}
