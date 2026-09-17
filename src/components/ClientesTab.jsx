import { useState } from 'react';
import { useFilialCollection } from '../hooks/useFilialCollection.js';
import { handleEnterNavigation } from '../utils/formNav.js';
import FirebaseGate from './FirebaseGate.jsx';
import './CrudTab.css';

// Mesma normalização usada nos parsers/matching de funcionário: sem acento,
// maiúsculo, espaços colapsados — é assim que decidimos se "José da Silva"
// e "jose  DA SILVA" são a mesma pessoa (nome completo importa: sobrenomes
// diferentes = clientes diferentes, mesmo com o mesmo primeiro nome).
export function normalizarNomeCliente(nome) {
  return (nome ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export default function ClientesTab({ filialId }) {
  return (
    <FirebaseGate>
      <ClientesTabInner filialId={filialId} />
    </FirebaseGate>
  );
}

function ClientesTabInner({ filialId }) {
  const { items: clientes, add, remove } = useFilialCollection(filialId, 'clientes', 'nome');
  const [nome, setNome] = useState('');
  const [error, setError] = useState(null);

  async function handleAdd(e) {
    e.preventDefault();
    if (!nome.trim()) return;
    const norm = normalizarNomeCliente(nome);
    if (clientes.some((c) => normalizarNomeCliente(c.nome) === norm)) {
      setError('Já existe um cliente cadastrado com esse nome.');
      return;
    }
    setError(null);
    await add({ nome: nome.trim(), origem: 'manual' });
    setNome('');
  }

  function handleRemove(c) {
    const ok = window.confirm(`Remover "${c.nome}" da lista de clientes?`);
    if (ok) remove(c.id);
  }

  return (
    <div className="crud-tab">
      <form className="crud-tab__form" onSubmit={handleAdd}>
        <input
          type="text"
          placeholder="Nome do cliente"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={handleEnterNavigation}
        />
        <button type="submit">Adicionar</button>
      </form>

      {error && <p className="crud-tab__error">{error}</p>}

      <table className="crud-tab__table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Origem</th>
            <th className="crud-tab__acoes-col" />
          </tr>
        </thead>
        <tbody>
          {clientes.map((c) => (
            <tr key={c.id}>
              <td>{c.nome}</td>
              <td>{c.origem === 'caixa-diario' ? 'Caixa diário (Pix)' : 'Manual'}</td>
              <td className="crud-tab__acoes-col">
                <button className="crud-tab__delete" onClick={() => handleRemove(c)}>
                  Remover
                </button>
              </td>
            </tr>
          ))}
          {clientes.length === 0 && (
            <tr>
              <td colSpan={3} className="crud-tab__empty">
                Nenhum cliente cadastrado ainda. A lista também se preenche sozinha ao
                importar um Caixa Diário — todo nome novo pago por Pix é adicionado
                automaticamente aqui.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="crud-tab__note">
        Esta aba ainda é uma base simples — é o alicerce para a futura "Vendas por
        Cliente" (gráfico + busca por período), que ainda não está implementada.
      </p>
    </div>
  );
}
