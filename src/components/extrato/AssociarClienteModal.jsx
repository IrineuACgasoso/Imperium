import { useMemo, useState } from 'react';
import Combobox from '../common/Combobox.jsx';
import { formatarDocumento } from './utils.js';

export default function AssociarClienteModal({ lancamento, clientes, vinculoAtual, onCancel, onConfirm }) {
  const [nome, setNome] = useState(vinculoAtual?.clienteNome ?? '');

  // Memoizado: sem isso, cada tecla digitada recriava este array inteiro e
  // derrubava o cache de filtro do Combobox à toa.
  const options = useMemo(
    () => clientes.map((c) => ({ value: c.nome, label: c.nome, id: c.id })),
    [clientes]
  );

  // Escolher um cliente de verdade (Enter ou clique numa opção da lista) já
  // confirma a associação na hora — não existe mais um botão "Associar"
  // separado pra clicar depois. Só digitar sem escolher nada não faz nada
  // (não dá pra associar um cliente que não existe).
  function handleChange(v, option) {
    setNome(v);
    if (option?.id) {
      const cliente = clientes.find((c) => c.id === option.id);
      if (cliente) onConfirm(cliente);
    }
  }

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
          onChange={handleChange}
          options={options}
          placeholder="Digite pra buscar o cliente cadastrado"
          allowFree
          autoFocus
          confirmarPrimeiraOpcao
          minWidth={320}
        />
        <div className="modal__actions">
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
