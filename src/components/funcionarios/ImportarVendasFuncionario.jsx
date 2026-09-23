import { useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import { usePdfImport } from '../../hooks/usePdfImport.js';
import { parseRankingVendas } from '../../parsers/rankingVendas.js';
import { normalizarNomeCliente } from '../../shared/texto.js';
import { SALARIO_MINIMO_ATUAL, currency } from './utils.js';

// Relatório "Ranking de Vendas" do CDS: uma linha por funcionário já com o
// nome de quem vendeu, então — diferente da importação antiga — não faz
// mais sentido pedir pra escolher o funcionário antes de anexar o PDF.
// Cada nome encontrado é casado com os funcionários já cadastrados (sem
// acento/maiúscula importarem); quem não bate com ninguém é cadastrado na
// hora de confirmar, com os valores padrão (comissão 0%, salário mínimo).
export default function ImportarVendasFuncionario({ filialId, funcionarios, onAddFuncionario }) {
  const { texto, nomeArquivo, carregando, erro, handleFile, limpar } = usePdfImport();
  const [resultado, setResultado] = useState(null);
  const [confirmando, setConfirmando] = useState(false);

  function onFileChange(e) {
    const file = e.target.files?.[0];
    setResultado(null);
    handleFile(file);
    e.target.value = '';
  }

  if (texto && resultado === null) {
    const parsed = parseRankingVendas(texto);
    const linhas = parsed.vendedores.map((v) => {
      const chave = normalizarNomeCliente(v.nome);
      const existente = funcionarios.find((f) => normalizarNomeCliente(f.nome) === chave);
      return {
        nome: v.nome,
        valor: v.valor,
        funcionarioId: existente?.id ?? null,
      };
    });
    setResultado({ ...parsed, linhas });
  }

  function editarValor(idx, valor) {
    setResultado((r) => {
      const linhas = [...r.linhas];
      linhas[idx] = { ...linhas[idx], valor: parseFloat(valor) || 0 };
      return { ...r, linhas };
    });
  }

  async function confirmar() {
    if (!resultado?.linhas?.length) return;
    setConfirmando(true);
    try {
      for (const linha of resultado.linhas) {
        let funcionarioId = linha.funcionarioId;
        let funcionarioNome = linha.nome;
        if (!funcionarioId) {
          const ref = await onAddFuncionario({
            nome: linha.nome,
            comissaoPercentual: 1,
            salarioBase: SALARIO_MINIMO_ATUAL,
            ativo: true,
          });
          funcionarioId = ref.id;
        } else {
          funcionarioNome = funcionarios.find((f) => f.id === funcionarioId)?.nome ?? linha.nome;
        }
        // ID determinístico: reimportar o mesmo mês/funcionário sobrescreve
        // em vez de duplicar.
        await setDoc(
          doc(db, 'filiais', filialId, 'vendasPorFuncionarioMensal', `${funcionarioId}_${resultado.mes}`),
          {
            funcionarioId,
            funcionarioNome,
            mes: resultado.mes,
            totalVendido: linha.valor,
            origem: 'importado-ranking',
            criadoEm: serverTimestamp(),
          }
        );
      }
      limpar();
      setResultado(null);
    } finally {
      setConfirmando(false);
    }
  }

  function cancelar() {
    limpar();
    setResultado(null);
  }

  return (
    <div className="pdf-import">
      <div className="pdf-import__header">
        <span className="pdf-import__label">Importar vendas do mês (PDF "Ranking de Vendas"):</span>
        <input
          type="file"
          accept="application/pdf"
          onChange={onFileChange}
          className="pdf-import__file"
        />
      </div>

      {carregando && <p className="pdf-import__status">Lendo PDF…</p>}
      {erro && <p className="pdf-import__error">{erro}</p>}
      {resultado?.periodoInvalido && <p className="pdf-import__error">{resultado.erro}</p>}

      {resultado && !resultado.periodoInvalido && (
        <div className="pdf-import__preview">
          <p className="pdf-import__preview-title">
            {nomeArquivo} — mês {resultado.mes} — {resultado.linhas.length} funcionário(s)
          </p>
          <table className="pdf-import__table pdf-import__table--rows">
            <thead>
              <tr>
                <th>Funcionário</th>
                <th>Total vendido</th>
              </tr>
            </thead>
            <tbody>
              {resultado.linhas.map((l, idx) => (
                <tr key={l.nome}>
                  <td className={l.funcionarioId ? '' : 'pdf-import__unmatched'}>
                    {l.nome}
                    {!l.funcionarioId && ' (novo — será cadastrado)'}
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      value={l.valor}
                      onChange={(e) => editarValor(idx, e.target.value)}
                    />
                  </td>
                </tr>
              ))}
              {resultado.linhas.length === 0 && (
                <tr>
                  <td colSpan={2}>Nenhum funcionário identificado nesse PDF.</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="pdf-import__actions">
            <button
              className="pdf-import__confirm"
              onClick={confirmar}
              disabled={confirmando || resultado.linhas.length === 0}
            >
              {confirmando ? 'Salvando…' : 'Confirmar e lançar'}
            </button>
            <button className="pdf-import__cancel" onClick={cancelar}>
              Cancelar
            </button>
          </div>
          <p className="pdf-import__status">
            Salário base padrão pra quem for cadastrado agora: {currency.format(SALARIO_MINIMO_ATUAL)}
            (comissão 0% — ajuste depois na tabela de funcionários).
          </p>
        </div>
      )}
    </div>
  );
}
