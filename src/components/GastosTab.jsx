import { useMemo, useRef, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase.js';
import { useFilialCollection } from '../hooks/useFilialCollection.js';
import { handleEnterNavigation } from '../utils/formNav.js';
import FirebaseGate from './FirebaseGate.jsx';
import Combobox from './Combobox.jsx';
import { CATEGORIAS_GASTO } from '../data/categoriasGasto.js';
import './CrudTab.css';

export const CATEGORIAS = CATEGORIAS_GASTO;

// Qual campo extra cada categoria abre. `funcionario` usa a lista de
// funcionários cadastrados (fechada); `lista` usa uma lista auxiliar que
// cresce sozinha conforme o usuário digita nomes novos.
const CAMPO_EXTRA = {
  'SALÁRIO': { tipo: 'funcionario', label: 'Funcionário' },
  'ADIANTAMENTO SALÁRIO': { tipo: 'funcionario', label: 'Funcionário' },
  GASOLINA: { tipo: 'funcionario', label: 'Funcionário' },
  PEDIDOS: { tipo: 'lista', lista: 'distribuidoras', label: 'Distribuidora' },
  IMPOSTOS: { tipo: 'lista', lista: 'tiposImposto', label: 'Tipo' },
};

export default function GastosTab({ filialId }) {
  return (
    <FirebaseGate>
      <GastosTabInner filialId={filialId} />
    </FirebaseGate>
  );
}

function GastosTabInner({ filialId }) {
  const { items: gastos, add, remove } = useFilialCollection(filialId, 'gastos', 'data');
  const { items: funcionarios } = useFilialCollection(filialId, 'funcionarios', 'nome');
  // Listas auxiliares (distribuidoras, tipos de imposto) ficam em
  // filiais/{id}/listasAuxiliares/{nomeDaLista}, cada uma um doc com um
  // array `valores`. Simples e barato: são listas curtas, lidas junto.
  const { items: listasAux } = useFilialCollection(filialId, 'listasAuxiliares', 'criadoEm');

  const [data, setData] = useState('');
  const [categoria, setCategoria] = useState('');
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  const [extra, setExtra] = useState('');
  const [extraId, setExtraId] = useState('');
  const [error, setError] = useState(null);
  const dataRef = useRef(null);

  const categoriaNormalizada = categoria.trim().toUpperCase();
  const campoExtra = CAMPO_EXTRA[categoriaNormalizada] ?? null;

  const valoresDaLista = useMemo(() => {
    if (campoExtra?.tipo !== 'lista') return [];
    const docLista = listasAux.find((l) => l.id === campoExtra.lista);
    return docLista?.valores ?? [];
  }, [campoExtra, listasAux]);

  const opcoesExtra = useMemo(() => {
    if (!campoExtra) return [];
    if (campoExtra.tipo === 'funcionario') {
      return funcionarios.map((f) => ({ value: f.nome, label: f.nome, id: f.id }));
    }
    return valoresDaLista.map((v) => ({ value: v, label: v }));
  }, [campoExtra, funcionarios, valoresDaLista]);

  function resetForm() {
    setData('');
    setCategoria('');
    setValor('');
    setDescricao('');
    setExtra('');
    setExtraId('');
    // Depois de lançar, o cursor volta pra data — o fluxo normal é lançar
    // vários gastos seguidos, então isso poupa um clique a cada lançamento.
    dataRef.current?.focus();
  }

  async function salvarNaListaAuxiliar(nomeLista, novoValor) {
    const atual = listasAux.find((l) => l.id === nomeLista)?.valores ?? [];
    if (atual.some((v) => v.toLowerCase() === novoValor.toLowerCase())) return;
    await setDoc(
      doc(db, 'filiais', filialId, 'listasAuxiliares', nomeLista),
      { valores: [...atual, novoValor].sort((a, b) => a.localeCompare(b)) },
      { merge: true }
    );
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!data || !valor) {
      setError('Preencha ao menos a data e o valor.');
      return;
    }
    if (campoExtra && !extra.trim()) {
      setError(`Preencha o campo "${campoExtra.label}" para esta categoria.`);
      return;
    }
    setError(null);
    try {
      const payload = {
        data,
        categoria: categoriaNormalizada || 'GERAL',
        valor: parseFloat(valor) || 0,
        descricao: descricao.trim(),
        origem: 'manual',
      };

      if (campoExtra?.tipo === 'funcionario') {
        // Resolve o ID do funcionário pelo nome digitado (case-insensitive),
        // porque é o ID que amarra o adiantamento à linha certa da tabela de
        // funcionários — guardar só o nome quebraria se ele fosse renomeado.
        const f =
          funcionarios.find((x) => x.id === extraId) ??
          funcionarios.find((x) => x.nome.toLowerCase() === extra.trim().toLowerCase());
        if (!f) {
          setError('Funcionário não encontrado. Escolha um da lista.');
          return;
        }
        payload.funcionarioId = f.id;
        payload.funcionarioNome = f.nome;
      } else if (campoExtra?.tipo === 'lista') {
        const nome = extra.trim();
        payload[campoExtra.lista === 'distribuidoras' ? 'distribuidora' : 'tipoImposto'] = nome;
        await salvarNaListaAuxiliar(campoExtra.lista, nome);
      }

      await add(payload);
      resetForm();
    } catch (err) {
      setError(err.message);
    }
  }

  function handleRemove(g) {
    const ok = window.confirm(
      `Remover o gasto de R$ ${Number(g.valor).toFixed(2)} (${g.categoria}) do dia ${g.data}?\n\nEsta ação não pode ser desfeita.`
    );
    if (ok) remove(g.id);
  }

  return (
    <div className="crud-tab">
      <form className="crud-tab__form" onSubmit={handleAdd}>
        <input
          ref={dataRef}
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          onKeyDown={handleEnterNavigation}
        />
        <Combobox
          value={categoria}
          onChange={(v) => {
            setCategoria(v);
            setExtra('');
            setExtraId('');
          }}
          options={CATEGORIAS.map((c) => ({ value: c, label: c }))}
          placeholder="Categoria"
          allowFree={false}
          minWidth={200}
        />
        {campoExtra && (
          <Combobox
            value={extra}
            onChange={(v, option) => {
              setExtra(v);
              setExtraId(option?.id ?? '');
            }}
            options={opcoesExtra}
            placeholder={campoExtra.label}
            allowFree={campoExtra.tipo === 'lista'}
            minWidth={190}
          />
        )}
        <input
          type="number"
          step="0.01"
          placeholder="Valor"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={handleEnterNavigation}
        />
        <input
          type="text"
          placeholder="Descrição (opcional)"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          onKeyDown={handleEnterNavigation}
        />
        <button type="submit">Lançar gasto</button>
      </form>

      {error && <p className="crud-tab__error">{error}</p>}

      <table className="crud-tab__table gastos-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Categoria</th>
            <th>Referência</th>
            <th>Valor</th>
            <th>Descrição</th>
            <th className="crud-tab__acoes-col" />
          </tr>
        </thead>
        <tbody>
          {gastos.map((g) => (
            <tr key={g.id}>
              <td>{g.data}</td>
              <td>{g.categoria}</td>
              <td className="gastos-table__ref">
                {g.funcionarioNome ?? g.distribuidora ?? g.tipoImposto ?? '—'}
              </td>
              <td>R$ {Number(g.valor).toFixed(2)}</td>
              <td>{g.descricao}</td>
              <td className="crud-tab__acoes-col">
                <button className="crud-tab__delete" onClick={() => handleRemove(g)}>
                  Remover
                </button>
              </td>
            </tr>
          ))}
          {gastos.length === 0 && (
            <tr>
              <td colSpan={6} className="crud-tab__empty">
                Nenhum gasto lançado ainda.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="crud-tab__note">
        Distribuidoras (Pedidos) e tipos (Impostos) são salvos automaticamente na primeira vez
        que você digita um nome novo, e passam a aparecer na lista depois disso. Lançamentos de
        "Adiantamento salário" descontam automaticamente do total daquele funcionário na aba
        Funcionários, no mês correspondente. Nos campos com lista, use ↑/↓ para navegar e Enter
        para escolher.
      </p>
    </div>
  );
}
