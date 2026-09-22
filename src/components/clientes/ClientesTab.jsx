import { useMemo, useRef, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useFilialCollection } from '../../hooks/useFilialCollection.js';
import { handleEnterNavigation, focusFirstField } from '../../utils/formNav.js';
import FirebaseGate from '../layout/FirebaseGate.jsx';
import Combobox from '../common/Combobox.jsx';
import { normalizarNomeCliente } from '../../shared/texto.js';
import '../../shared/CrudTab.css';
import './ClientesTab.css';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function ClientesTab({ filialId }) {
  return (
    <FirebaseGate>
      <ClientesTabInner filialId={filialId} />
    </FirebaseGate>
  );
}

function ClientesTabInner({ filialId }) {
  const { items: clientes, add, remove } = useFilialCollection(filialId, 'clientes', 'nome');
  // O "quanto esse cliente gastou" soma duas fontes: pagamentos bancários de
  // contas associadas a ele (aba Extrato > Associar cliente) e vendas em
  // dinheiro casadas pelo nome exato no Caixa Diário.
  const { items: lancamentos } = useFilialCollection(filialId, 'extratoLancamentos', 'data');
  const { items: vinculos } = useFilialCollection(filialId, 'vinculosBancarios', 'criadoEm');
  // Vendas em dinheiro nunca passam pelo banco, então não têm como entrar
  // pelo caminho acima — mas ainda são dinheiro que aquele cliente pagou, e
  // precisam contar no total dele. A fonte é a mesma fila de conciliação
  // (pendenciasVendas) que a aba Pendências usa, filtrada só pra dinheiro
  // pra não contar de novo um Pix/cartão que já é somado via extrato.
  const { items: vendasCaixa } = useFilialCollection(filialId, 'pendenciasVendas', 'data');
  const [busca, setBusca] = useState('');
  const [selecionado, setSelecionado] = useState(null);
  const [buscaGrafico, setBuscaGrafico] = useState('');
  const [nome, setNome] = useState('');
  const [error, setError] = useState(null);
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const formRef = useRef(null);

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
    focusFirstField(formRef);
  }

  const clientePorChave = useMemo(() => {
    const mapa = new Map();
    vinculos.forEach((v) => mapa.set(v.chave, v.clienteId));
    return mapa;
  }, [vinculos]);

  // Total por cliente e série mensal do cliente selecionado, em uma passada só.
  const { totalPorCliente, seriePorCliente } = useMemo(() => {
    const totais = new Map();
    const series = new Map();

    function somar(clienteId, data, valor) {
      totais.set(clienteId, (totais.get(clienteId) ?? 0) + Number(valor || 0));
      const mes = (data ?? '').slice(0, 7);
      if (!mes) return;
      if (!series.has(clienteId)) series.set(clienteId, new Map());
      const porMes = series.get(clienteId);
      porMes.set(mes, (porMes.get(mes) ?? 0) + Number(valor || 0));
    }

    lancamentos.forEach((l) => {
      if (l.tipo !== 'credito') return;
      const clienteId = clientePorChave.get(l.chaveContraparte);
      if (!clienteId) return;
      somar(clienteId, l.data, l.valor);
    });

    // Só dinheiro entra por aqui — Pix/cartão/boleto/promissória do mesmo
    // cliente já são contados acima, pelo pagamento associado no extrato.
    // Casar por nome exato (mesmo critério rígido da conciliação — dois
    // clientes não podem virar um só por semelhança de nome).
    const idPorNomeExato = new Map(
      clientes.map((c) => [normalizarNomeCliente(c.nome), c.id])
    );
    vendasCaixa.forEach((v) => {
      if (v.campo !== 'dinheiro') return;
      const clienteId = idPorNomeExato.get(normalizarNomeCliente(v.clienteNome ?? ''));
      if (!clienteId) return;
      somar(clienteId, v.data, v.valor);
    });

    return { totalPorCliente: totais, seriePorCliente: series };
  }, [lancamentos, clientePorChave, vendasCaixa, clientes]);

  const termo = normalizarNomeCliente(busca);
  const visiveis = termo
    ? clientes.filter((c) => normalizarNomeCliente(c.nome).includes(termo))
    : clientes;

  // Ranking usado na tela compacta (padrão): top 3 por valor total pago,
  // maior primeiro. Cliente sem nenhum pagamento associado ainda entra com
  // R$ 0,00 — só não aparece no top 3 se houver 3+ com valor maior.
  const ranking = [...clientes]
    .sort((a, b) => (totalPorCliente.get(b.id) ?? 0) - (totalPorCliente.get(a.id) ?? 0))
    .slice(0, 3);

  const clienteAtivo = clientes.find((c) => c.id === selecionado) ?? null;
  const dadosGrafico = clienteAtivo
    ? Array.from(seriePorCliente.get(clienteAtivo.id)?.entries() ?? [])
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([mes, total]) => ({ mes, total }))
    : [];

  function handleRemove(c) {
    const ok = window.confirm(`Remover "${c.nome}" da lista de clientes?`);
    if (ok) remove(c.id);
  }

  return (
    <div className="crud-tab">
      <form className="crud-tab__form" onSubmit={handleAdd} ref={formRef}>
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

      <div className="clientes__topo-lista">
        <input
          type="search"
          className="clientes__busca"
          placeholder="Buscar cliente pelo nome (lista abaixo)"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <button type="button" className="clientes__ver-todos" onClick={() => setMostrarTodos((v) => !v)}>
          {mostrarTodos ? 'Ocultar lista completa' : 'Ver Clientes'}
        </button>
      </div>

      <div className="clientes__grafico">
        <div className="clientes__grafico-topo">
          <Combobox
            value={buscaGrafico}
            onChange={(v, option) => {
              setBuscaGrafico(v);
              if (option?.id) setSelecionado(option.id);
              else setSelecionado(null);
            }}
            options={clientes.map((c) => ({ value: c.nome, label: c.nome, id: c.id }))}
            placeholder="Buscar cliente para ver o gráfico de vendas dele"
            allowFree
            minWidth={340}
          />
          {clienteAtivo && (
            <span className="clientes__grafico-titulo">
              {currency.format(totalPorCliente.get(clienteAtivo.id) ?? 0)} no total
            </span>
          )}
        </div>
        {clienteAtivo ? (
          dadosGrafico.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dadosGrafico}>
                <CartesianGrid stroke="rgba(242,233,251,0.08)" vertical={false} />
                <XAxis dataKey="mes" stroke="#7a6497" fontSize={11} tickLine={false} />
                <YAxis
                  stroke="#7a6497"
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(v) => currency.format(v).replace('R$', '').trim()}
                />
                <Tooltip
                  contentStyle={{
                    background: '#1a0c34',
                    border: '1px solid rgba(255,46,156,0.45)',
                    borderRadius: 10,
                    fontSize: 12,
                  }}
                  formatter={(v) => currency.format(v)}
                />
                <Bar dataKey="total" fill="#ff2e9c" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="crud-tab__note">
              Nenhum pagamento associado a {clienteAtivo.nome} ainda. Associe as contas dele na
              aba Extrato (botão direito na linha &gt; Associar cliente) para o histórico
              aparecer aqui.
            </p>
          )
        ) : (
          <p className="crud-tab__note">
            Busque um cliente acima (ou clique num da lista abaixo) para ver as vendas dele mês a
            mês.
          </p>
        )}
      </div>

      {!mostrarTodos && (
        <>
          <table className="crud-tab__table clientes__ranking">
            <thead>
              <tr>
                <th>{termo ? 'Resultado da busca' : 'Top 3 — mais vendas'}</th>
                <th className="funcionarios-table__num">Valor</th>
              </tr>
            </thead>
            <tbody>
              {(termo ? visiveis : ranking).map((c, i) => (
                <tr
                  key={c.id}
                  className={`clientes__linha ${selecionado === c.id ? 'is-active' : ''}`}
                  onClick={() => setSelecionado((atual) => (atual === c.id ? null : c.id))}
                >
                  <td>{!termo ? `${i + 1}º · ` : ''}{c.nome}</td>
                  <td className="funcionarios-table__num">
                    {currency.format(totalPorCliente.get(c.id) ?? 0)}
                  </td>
                </tr>
              ))}
              {(termo ? visiveis : ranking).length === 0 && (
                <tr>
                  <td colSpan={2} className="crud-tab__empty">
                    {termo ? 'Nenhum cliente bate com essa busca.' : 'Nenhum cliente cadastrado ainda.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="crud-tab__note">
            Mostrando só o top 3 por valor total. Use a busca acima pra conferir qualquer outro
            cliente, ou "Ver Clientes" pra abrir a lista completa (com opção de remover).
          </p>
        </>
      )}

      {mostrarTodos && (
        <table className="crud-tab__table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Origem</th>
              <th className="funcionarios-table__num">Total pago</th>
              <th className="crud-tab__acoes-col" />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((c) => (
              <tr
                key={c.id}
                className={`clientes__linha ${selecionado === c.id ? 'is-active' : ''}`}
                onClick={() => setSelecionado((atual) => (atual === c.id ? null : c.id))}
              >
                <td>{c.nome}</td>
                <td>{c.origem === 'caixa-diario' ? 'Caixa diário (Pix)' : 'Manual'}</td>
                <td className="funcionarios-table__num">
                  {currency.format(totalPorCliente.get(c.id) ?? 0)}
                </td>
                <td className="crud-tab__acoes-col" onClick={(e) => e.stopPropagation()}>
                  <button className="crud-tab__delete" onClick={() => handleRemove(c)}>
                    Remover
                  </button>
                </td>
              </tr>
            ))}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={4} className="crud-tab__empty">
                  {clientes.length === 0
                    ? 'Nenhum cliente cadastrado ainda. A lista também se preenche sozinha ao importar um Caixa Diário — todo nome novo pago por Pix é adicionado automaticamente aqui.'
                    : 'Nenhum cliente bate com essa busca.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <p className="crud-tab__note">
        Clique em um cliente para ver quanto ele pagou por mês. Soma pagamentos recebidos em
        conta associada a ele (aba Extrato) e vendas em dinheiro do Caixa Diário com o nome
        exatamente igual ao cadastro — nome parecido mas diferente não é somado, pelo mesmo
        motivo da conciliação: é melhor não contar do que somar na pessoa errada.
      </p>
    </div>
  );
}
