import { useEffect, useRef, useState } from 'react';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase.js';
import { useFilialCollection } from '../hooks/useFilialCollection.js';
import { handleEnterNavigation } from '../utils/formNav.js';
import FirebaseGate from './FirebaseGate.jsx';
import SearchableSelect from './SearchableSelect.jsx';
import { usePdfImport } from '../hooks/usePdfImport.js';
import { parseVendasPorMes } from '../parsers/caixaDiario.js';
import './CrudTab.css';
import './PdfImport.css';

// Salário mínimo nacional vigente (Decreto nº 12.797/2025, valor de 2026).
// Precisa ser atualizado manualmente a cada reajuste (normalmente janeiro).
const SALARIO_MINIMO_ATUAL = 1621;

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function mesAtualISO() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
}

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
  const vendaFuncRef = useRef(null);

  // --- Cadastro de FUNCIONÁRIO (formulário secundário, embaixo da lista) ---
  const [nome, setNome] = useState('');
  const [comissao, setComissao] = useState('');
  const [salarioBase, setSalarioBase] = useState('');

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
    vendaFuncRef.current?.focus();
  }

  async function handleAddFuncionario(e) {
    e.preventDefault();
    if (!nome.trim()) return;
    setError(null);
    try {
      await add({
        nome: nome.trim(),
        comissaoPercentual: parseFloat(comissao) || 0,
        salarioBase: parseFloat(salarioBase) || SALARIO_MINIMO_ATUAL,
        ativo: true,
      });
      setNome('');
      setComissao('');
      setSalarioBase('');
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
   * "Reiniciar valores" = marcar o mês como pago para os funcionários
   * selecionados. Zera a venda do mês (que zera a comissão) e apaga os
   * adiantamentos do mês daquelas pessoas, deixando o Total de volta no
   * salário base. Usado DEPOIS de pagar, para começar o próximo ciclo limpo.
   *
   * Zeramos a venda do mês em vez de apagar o documento para deixar
   * registrado que aquele mês foi fechado/pago, em vez de sumir sem rastro.
   */
  async function handleReiniciarValores() {
    const nomes = funcionarios
      .filter((f) => selecionados.includes(f.id))
      .map((f) => f.nome)
      .join(', ');
    const ok = window.confirm(
      `Reiniciar os valores de: ${nomes}?\n\n` +
        `Isso vai zerar a comissão do mês (${mesAtual}) e apagar os adiantamentos ` +
        `desse mês para essas pessoas, deixando o Total igual ao salário base.\n\n` +
        `Use isso somente DEPOIS de efetuar o pagamento. Não pode ser desfeito.`
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

  return (
    <div className="crud-tab">
      {/* Cadastro principal: vendas do mês por funcionário. */}
      <form className="crud-tab__form" onSubmit={handleAddVenda}>
        <SearchableSelect
          value={vendaFuncionario}
          onChange={(v) => {
            setVendaFuncionario(v);
            const f = funcionarios.find((x) => x.nome.toLowerCase() === v.trim().toLowerCase());
            setVendaFuncionarioId(f?.id ?? '');
          }}
          options={funcionarios.map((f) => f.nome)}
          placeholder="Funcionário"
        />
        <input
          type="month"
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

      <ImportarVendasFuncionario filialId={filialId} funcionarios={funcionarios} />

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
          <button className="crud-tab__reset" onClick={handleReiniciarValores}>
            Reiniciar valores
          </button>
          <button className="crud-tab__cancel" onClick={() => setSelecionados([])}>
            Limpar seleção
          </button>
        </div>
      )}

      {/* Cadastro secundário: novos funcionários (menos frequente). */}
      <form className="crud-tab__form crud-tab__form--secondary" onSubmit={handleAddFuncionario}>
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
        <strong>Reiniciar valores</strong> zera a comissão e os adiantamentos do mês dos
        selecionados — use depois de pagar.
      </p>
    </div>
  );
}

// Relatório "Vendas por Mês" do CDS não diz quem vendeu (é o próprio
// sistema deles que não expõe isso ao filtrar por vendedor) — por isso o
// usuário escolhe o funcionário ANTES de importar, e todo mês encontrado no
// PDF é gravado como sendo daquela pessoa.
function ImportarVendasFuncionario({ filialId, funcionarios }) {
  const { texto, nomeArquivo, carregando, erro, handleFile, limpar } = usePdfImport();
  const [funcionarioNome, setFuncionarioNome] = useState('');
  const [funcionarioId, setFuncionarioId] = useState('');
  const [meses, setMeses] = useState(null);
  const [confirmando, setConfirmando] = useState(false);

  function onFileChange(e) {
    const file = e.target.files?.[0];
    setMeses(null);
    handleFile(file);
    e.target.value = '';
  }

  if (texto && meses === null) {
    setMeses(parseVendasPorMes(texto));
  }

  function editarMes(idx, valor) {
    setMeses((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], totalVendas: parseFloat(valor) || 0 };
      return next;
    });
  }

  async function confirmar() {
    if (!funcionarioId || !meses) return;
    setConfirmando(true);
    try {
      for (const m of meses) {
        await setDoc(
          doc(db, 'filiais', filialId, 'vendasPorFuncionarioMensal', `${funcionarioId}_${m.mes}`),
          {
            funcionarioId,
            funcionarioNome,
            mes: m.mes,
            totalVendido: m.totalVendas,
            origem: 'importado-periodo',
            criadoEm: serverTimestamp(),
          }
        );
      }
      limpar();
      setMeses(null);
    } finally {
      setConfirmando(false);
    }
  }

  function cancelar() {
    limpar();
    setMeses(null);
  }

  return (
    <div className="pdf-import">
      <div className="pdf-import__header">
        <span className="pdf-import__label">Importar vendas do mês (PDF "Vendas por Mês"):</span>
        <SearchableSelect
          value={funcionarioNome}
          onChange={(v) => {
            setFuncionarioNome(v);
            const f = funcionarios.find((x) => x.nome.toLowerCase() === v.trim().toLowerCase());
            setFuncionarioId(f?.id ?? '');
          }}
          options={funcionarios.map((f) => f.nome)}
          placeholder="Selecione o funcionário antes de anexar"
        />
        <input
          type="file"
          accept="application/pdf"
          onChange={onFileChange}
          disabled={!funcionarioId}
          className="pdf-import__file"
        />
      </div>
      {!funcionarioId && (
        <p className="pdf-import__status">
          Escolha de quem é a venda antes de anexar o PDF — o relatório não traz o nome
          do vendedor.
        </p>
      )}
      {carregando && <p className="pdf-import__status">Lendo PDF…</p>}
      {erro && <p className="pdf-import__error">{erro}</p>}

      {meses && (
        <div className="pdf-import__preview">
          <p className="pdf-import__preview-title">
            {nomeArquivo} — {funcionarioNome} — {meses.length} mês(es)
          </p>
          <table className="pdf-import__table">
            <thead>
              <tr>
                <th>Mês</th>
                <th>Total vendido</th>
              </tr>
            </thead>
            <tbody>
              {meses.map((m, idx) => (
                <tr key={m.mes}>
                  <td>{m.mes}</td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      value={m.totalVendas}
                      onChange={(e) => editarMes(idx, e.target.value)}
                    />
                  </td>
                </tr>
              ))}
              {meses.length === 0 && (
                <tr>
                  <td colSpan={2}>Nenhum mês identificado nesse PDF.</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="pdf-import__actions">
            <button className="pdf-import__confirm" onClick={confirmar} disabled={confirmando || meses.length === 0}>
              {confirmando ? 'Salvando…' : 'Confirmar e lançar'}
            </button>
            <button className="pdf-import__cancel" onClick={cancelar}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
