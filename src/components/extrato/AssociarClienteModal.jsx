import { useMemo, useState } from 'react';
import Combobox from '../common/Combobox.jsx';
import { formatarDocumento } from './utils.js';

export default function AssociarClienteModal({ lancamento, clientes, vinculoAtual, onCancel, onConfirm }) {
  const [nome, setNome] = useState(vinculoAtual?.clienteNome ?? '');
  const [clienteId, setClienteId] = useState(vinculoAtual?.clienteId ?? '');

  // Memoizado: sem isso, cada tecla digitada recriava este array inteiro e
  // derrubava o cache de filtro do Combobox à toa.
  const options = useMemo(
    () => clientes.map((c) => ({ value: c.nome, label: c.nome, id: c.id })),
    [clientes]
  );

  // Sempre que o texto muda por digitação (option === null), a escolha
  // anterior é invalidada — só um clique numa opção da lista confirma um
  // cliente de verdade, o texto sozinho não basta pra "Associar" habilitar.
  const cliente = clientes.find((c) => c.id === clienteId);

  return (
    <div className="modal-overlay" onMouseDown={onCancel}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="modal__title">Associar cliente</h3>
        <p className="modal__desc">
          Conta: <strong>{lancamento.contraparteNome || '(sem nome)'}</strong>
          {lancamento.contraparteDocumento
            ? ` — ${formatarDocumento(lancamento.contraparteDocumento)}`
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
          A conciliação automática só aceita nome idêntico ao do cadastro, então é esta
          associação que faz o pagamento ser reconhecido — não a semelhança entre os nomes.
        </p>
      </div>
    </div>
  );
}
