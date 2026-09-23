import { useEffect, useRef, useState } from 'react';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import { useFilialCollection } from '../../hooks/useFilialCollection.js';
import { handleEnterNavigation, focusFirstField } from '../../utils/formNav.js';
import FirebaseGate from '../layout/FirebaseGate.jsx';
import Combobox from '../common/Combobox.jsx';
import ImportarVendasFuncionario from './ImportarVendasFuncionario.jsx';
import { SALARIO_MINIMO_ATUAL, currency, mesAtualISO } from './utils.js';
import '../../shared/CrudTab.css';
import '../../shared/PdfImport.css';

export default function FuncionariosTab({ filialId }) {
  return (
    <FirebaseGate>
      <FuncionariosTabInner filialId={filialId} />
    </FirebaseGate>
  );
}

function FuncionariosTabInner({ filialId }) {
  const { items: funcionarios, add, update, remove } = useFilialCollection(
    filialId,
    'funcionarios',
    'nome'
  );
  const { items: vendasMensal } = useFilialCollection(filialId, 'vendasPorFuncionarioMensal');
  const { items: gastos } = useFilialCollection(filialId, 'gastos');

  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({});
  const [selecionados, setSelecionados] = useState([]);

  // --- Cadastro de VENDAS por funcionário (formulário principal, no topo) ---
  const [vendaFuncionario, setVendaFuncionario] = useState('');
  const [vendaFuncionarioId, setVendaFuncionarioId] = useState('');
  const [vendaMes, setVendaMes] = useState('');
  const [vendaTotal, setVendaTotal] = useState('');
  const formVendaRef = useRef(null);

  // --- Cadastro de FUNCIONÁRIO (formulário secundário, embaixo da lista) ---
  const [nome, setNome] = useState('');
  const [comissao, setComissao] = useState('');
  const [salarioBase, setSalarioBase] = useState('');
  const formFuncRef = useRef(null);

  // Funcionários cadastrados antes do campo `salarioBase` existir são
  // preenchidos automaticamente com o mínimo atual, de verdade no Firestore.
  useEffect(() => {
    funcionarios
      .filter((f) => f.salarioBase == null)
      .forEach((f) => update(f.id, { salarioBase: SALARIO_MINIMO_ATUAL }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funcionarios]);

  const mesAtual = mesAtualISO();

  async function handleAddVenda(e) {
    e.preventDefault();
    const f = funcionarios.find((x) => x.id === vendaFuncionarioId);
    if (!f) {
      setError('Escolha um funcionário da lista.');
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(vendaMes)) {
      setError('Informe o mês no formato MM/AAAA.');
      return;
    }
    setError(null);
    // ID determinístico: relançar o mesmo funcionário/mês sobrescreve em vez
    // de duplicar — mesma convenção usada pela importação por IA.
    await setDoc(doc(db, 'filiais', filialId, 'vendasPorFuncionarioMensal', `${f.id}_${vendaMes}`), {
      funcionarioId: f.id,
      funcionarioNome: f.nome,
      mes: vendaMes,
      totalVendido: parseFloat(vendaTotal) || 0,
      origem: 'manual',
      criadoEm: serverTimestamp(),
    });
    setVendaFuncionario('');
    setVendaFuncionarioId('');
    setVendaTotal('');
    // O mês é mantido de propósito: o normal é lançar o mesmo mês para
    // vários funcionários seguidos.
    focusFirstField(formVendaRef);
  }

  async function handleAddFuncionario(e) {
    e.preventDefault();
    if (!nome.trim()) return;
    setError(null);
    try {
      await add({
        nome: nome.trim(),
        comissaoPercentual: parseFloat(comissao) || 1,
        salarioBase: parseFloat(salarioBase) || SALARIO_MINIMO_ATUAL,
        ativo: true,
      });
      setNome('');
      setComissao('');
      setSalarioBase('');
      focusFirstField(formFuncRef);
    } catch (err) {
      setError(err.message);
    }
  }

  function comissaoEmReais(f) {
    const totalVendidoMes = vendasMensal
      .filter((v) => v.funcionarioId === f.id && v.mes === mesAtual)
      .reduce((sum, v) => sum + (v.totalVendido ?? 0), 0);
    return (totalVendidoMes * (f.comissaoPercentual ?? 0)) / 100;
  }

  function descontosDoMes(f) {
    return gastos
      .filter(
        (g) =>
          g.categoria === 'ADIANTAMENTO SALÁRIO' &&
          g.funcionarioId === f.id &&
          g.data?.slice(0, 7) === mesAtual
      )
      .reduce((sum, g) => sum + (Number(g.valor) || 0), 0);
  }

  function startEdit(f) {
    setEditingId(f.id);
    setDraft({
      nome: f.nome,
      comissaoPercentual: String(f.comissaoPercentual ?? 0),
      salarioBase: String(f.salarioBase ?? SALARIO_MINIMO_ATUAL),
    });
  }

  async function saveEdit(id) {
    if (!draft.nome?.trim()) {
      setError('O nome não pode ficar vazio.');
      return;
    }
    setError(null);
    await update(id, {
      nome: draft.nome.trim(),
      comissaoPercentual: parseFloat(draft.comissaoPercentual) || 0,
      salarioBase: parseFloat(draft.salarioBase) || SALARIO_MINIMO_ATUAL,
    });
    setEditingId(null);
  }

  function handleRemove(f) {
    const ok = window.confirm(
      `Remover ${f.nome} da lista de funcionários?\n\nEsta ação não pode ser desfeita.`
    );
    if (ok) remove(f.id);
  }

  function toggleSelecionado(id) {
    setSelecionados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  /**
   * Salário base e comissão são pagos em dias diferentes — cada um precisa
   * de um botão próprio, senão fechar um mexe sem querer no outro.
   */

  // "Reverter salário" = apagar os adiantamentos do mês dos selecionados.
  // Adiantamento é dinheiro que já saiu adiantado por conta do salário; uma
  // vez que o salário do mês foi pago de verdade (descontando o que já foi
  // adiantado), aquele desconto deixa de fazer sentido pro próximo ciclo.
  async function handleReverterSalario() {
    const nomes = funcionarios
      .filter((f) => selecionados.includes(f.id))
      .map((f) => f.nome)
      .join(', ');
    const ok = window.confirm(
      `Reverter salário de: ${nomes}?\n\n` +
        `Isso apaga os adiantamentos de salário lançados em ${mesAtual} para essas pessoas, ` +
        `zerando os "Descontos" e deixando o Total de volta em salário base + comissão.\n\n` +
        `Use isso DEPOIS de pagar o salário do mês. Não pode ser desfeito.`
    );
    if (!ok) return;

    for (const id of selecionados) {
      const adiantamentos = gastos.filter(
        (g) =>
          g.categoria === 'ADIANTAMENTO SALÁRIO' &&
          g.funcionarioId === id &&
          g.data?.slice(0, 7) === mesAtual
      );
      for (const g of adiantamentos) {
        await deleteDoc(doc(db, 'filiais', filialId, 'gastos', g.id));
      }
    }
    setSelecionados([]);
  }

  // "Reverter comissão" = zerar a venda do mês (que zera a comissão
  // calculada). Fica registrado que o mês foi fechado (zeramos o documento,
  // não apagamos), pra não sumir sem rastro. Não mexe em adiantamento nem
  // em salário base — é só o ciclo da comissão.
  async function handleReverterComissao() {
    const nomes = funcionarios
      .filter((f) => selecionados.includes(f.id))
      .map((f) => f.nome)
      .join(', ');
    const ok = window.confirm(
      `Reverter comissão de: ${nomes}?\n\n` +
        `Isso zera a venda do mês (${mesAtual}) usada pra calcular a comissão dessas pessoas, ` +
        `deixando a coluna Comissão em R$ 0,00 até a próxima venda importada/lançada.\n\n` +
        `Use isso DEPOIS de pagar a comissão do mês. Não pode ser desfeito.`
    );
    if (!ok) return;

    for (const id of selecionados) {
      const f = funcionarios.find((x) => x.id === id);
      if (!f) continue;
      await setDoc(
        doc(db, 'filiais', filialId, 'vendasPorFuncionarioMensal', `${id}_${mesAtual}`),
        {
          funcionarioId: id,
          funcionarioNome: f.nome,
          mes: mesAtual,
          totalVendido: 0,
          origem: 'reiniciado-apos-pagamento',
          criadoEm: serverTimestamp(),
        },
        { merge: true }
      );
    }
    setSelecionados([]);
  }

  return (
    <div className="crud-tab">
      {/* Cadastro principal: vendas do mês por funcionário. */}
      <form className="crud-tab__form" onSubmit={handleAddVenda} ref={formVendaRef}>
        <Combobox
          value={vendaFuncionario}
          onChange={(v, option) => {
            setVendaFuncionario(v);
            const f =
              funcionarios.find((x) => x.id === option?.id) ??
              funcionarios.find((x) => x.nome.toLowerCase() === v.trim().toLowerCase());
            setVendaFuncionarioId(f?.id ?? '');
          }}
          options={funcionarios.map((f) => ({ value: f.nome, label: f.nome, id: f.id }))}
          placeholder="Funcionário"
          allowFree={false}
          minWidth={200}
        />
        <input
          type="month"
          aria-label="Mês da venda"
          value={vendaMes}
          onChange={(e) => setVendaMes(e.target.value)}
          onKeyDown={handleEnterNavigation}
        />
        <input
          type="number"
          step="0.01"
          placeholder="Total vendido"
          value={vendaTotal}
          onChange={(e) => setVendaTotal(e.target.value)}
          onKeyDown={handleEnterNavigation}
        />
        <button type="submit">Lançar venda</button>
      </form>

      {error && <p className="crud-tab__error">{error}</p>}

      <ImportarVendasFuncionario
        filialId={filialId}
        funcionarios={funcionarios}
        onAddFuncionario={add}
      />

      <table className="crud-tab__table funcionarios-table">
        <thead>
          <tr>
            <th className="funcionarios-table__check" />
            <th>Nome</th>
            <th className="funcionarios-table__num">Comissão (%)</th>
            <th className="funcionarios-table__num">Comissão (R$)</th>
            <th className="funcionarios-table__num">Salário base</th>
            <th className="funcionarios-table__num">Descontos</th>
            <th className="funcionarios-table__num">Total</th>
            <th className="funcionarios-table__center">Ativo</th>
            <th className="crud-tab__acoes-col" />
          </tr>
        </thead>
        <tbody>
          {funcionarios.map((f) => {
            const isEditing = editingId === f.id;
            const base = isEditing
              ? parseFloat(draft.salarioBase) || 0
              : f.salarioBase ?? SALARIO_MINIMO_ATUAL;
            const comissaoReais = comissaoEmReais(f);
            const descontos = descontosDoMes(f);
            const total = base + comissaoReais - descontos;

            return (
              <tr key={f.id} className={selecionados.includes(f.id) ? 'is-selected' : ''}>
                <td className="funcionarios-table__check">
                  <input
                    type="checkbox"
                    checked={selecionados.includes(f.id)}
                    onChange={() => toggleSelecionado(f.id)}
                    aria-label={`Selecionar ${f.nome}`}
                  />
                </td>
                <td>
                  {isEditing ? (
                    <input
                      className="funcionarios-table__input"
                      value={draft.nome}
                      onChange={(e) => setDraft((d) => ({ ...d, nome: e.target.value }))}
                    />
                  ) : (
                    f.nome
                  )}
                </td>
                <td className="funcionarios-table__num">
                  {isEditing ? (
                    <input
                      className="funcionarios-table__input funcionarios-table__input--num"
                      type="number"
                      step="0.1"
                      value={draft.comissaoPercentual}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, comissaoPercentual: e.target.value }))
                      }
                    />
                  ) : (
                    `${f.comissaoPercentual}%`
                  )}
                </td>
                <td className="funcionarios-table__num">{currency.format(comissaoReais)}</td>
                <td className="funcionarios-table__num">
                  {isEditing ? (
                    <input
                      className="funcionarios-table__input funcionarios-table__input--num"
                      type="number"
                      step="0.01"
                      value={draft.salarioBase}
                      onChange={(e) => setDraft((d) => ({ ...d, salarioBase: e.target.value }))}
                    />
                  ) : (
                    currency.format(base)
                  )}
                </td>
                <td
                  className={`funcionarios-table__num ${
                    descontos > 0 ? 'funcionarios-table__desconto' : ''
                  }`}
                >
                  {descontos > 0 ? `- ${currency.format(descontos)}` : currency.format(0)}
                </td>
                <td className="funcionarios-table__num funcionarios-table__total">
                  {currency.format(total)}
                </td>
                <td className="funcionarios-table__center">
                  <button
                    className="crud-tab__toggle"
                    onClick={() => update(f.id, { ativo: !f.ativo })}
                  >
                    {f.ativo ? 'Ativo' : 'Inativo'}
                  </button>
                </td>
                <td className="crud-tab__acoes-col">
                  {isEditing ? (
                    <>
                      <button className="crud-tab__save" onClick={() => saveEdit(f.id)}>
                        Salvar
                      </button>
                      <button className="crud-tab__cancel" onClick={() => setEditingId(null)}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="crud-tab__edit" onClick={() => startEdit(f)}>
                        Editar
                      </button>
                      <button className="crud-tab__delete" onClick={() => handleRemove(f)}>
                        Remover
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
          {funcionarios.length === 0 && (
            <tr>
              <td colSpan={9} className="crud-tab__empty">
                Nenhum funcionário cadastrado ainda.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {selecionados.length > 0 && (
        <div className="funcionarios-table__bulk">
          <span>
            {selecionados.length} selecionado{selecionados.length > 1 ? 's' : ''}
          </span>
          <button className="crud-tab__reset" onClick={handleReverterSalario}>
            Reverter salário
          </button>
          <button className="crud-tab__reset" onClick={handleReverterComissao}>
            Reverter comissão
          </button>
          <button className="crud-tab__cancel" onClick={() => setSelecionados([])}>
            Limpar seleção
          </button>
        </div>
      )}

      {/* Cadastro secundário: novos funcionários (menos frequente). */}
      <form className="crud-tab__form crud-tab__form--secondary" onSubmit={handleAddFuncionario} ref={formFuncRef}>
        <span className="crud-tab__form-label">Novo funcionário</span>
        <input
          type="text"
          placeholder="Nome do funcionário"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={handleEnterNavigation}
        />
        <input
          type="number"
          step="0.1"
          placeholder="% comissão"
          value={comissao}
          onChange={(e) => setComissao(e.target.value)}
          onKeyDown={handleEnterNavigation}
        />
        <input
          type="number"
          step="0.01"
          placeholder={`Salário base (padrão ${currency.format(SALARIO_MINIMO_ATUAL)})`}
          value={salarioBase}
          onChange={(e) => setSalarioBase(e.target.value)}
          onKeyDown={handleEnterNavigation}
        />
        <button type="submit">Adicionar</button>
      </form>

      <p className="crud-tab__note">
        <strong>Comissão (R$)</strong> = % sobre o total vendido por esse funcionário no mês
        atual ({mesAtual}). <strong>Total</strong> = salário base + comissão − descontos.{' '}
        <strong>Reverter salário</strong> apaga os adiantamentos do mês dos selecionados (use no
        dia que pagar o salário). <strong>Reverter comissão</strong> zera a venda do mês usada no
        cálculo da comissão (use no dia que pagar a comissão) — são datas diferentes, então cada
        botão mexe só na sua parte.
      </p>
    </div>
  );
}

