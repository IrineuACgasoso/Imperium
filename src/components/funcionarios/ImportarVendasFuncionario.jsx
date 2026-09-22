import { useState } from 'react';
import Combobox from '../common/Combobox.jsx';
import { usePdfImport } from '../../hooks/usePdfImport.js';
import { parseVendasPorMes } from '../../parsers/caixaDiario.js';
import { currency } from './utils.js';


// Relatório "Vendas por Mês" do CDS não diz quem vendeu (é o próprio
// sistema deles que não expõe isso ao filtrar por vendedor) — por isso o
// usuário escolhe o funcionário ANTES de importar, e todo mês encontrado no
// PDF é gravado como sendo daquela pessoa.
export default function ImportarVendasFuncionario({ filialId, funcionarios }) {
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
        <Combobox
          value={funcionarioNome}
          onChange={(v, option) => {
            setFuncionarioNome(v);
            const f =
              funcionarios.find((x) => x.id === option?.id) ??
              funcionarios.find((x) => x.nome.toLowerCase() === v.trim().toLowerCase());
            setFuncionarioId(f?.id ?? '');
          }}
          options={funcionarios.map((f) => ({ value: f.nome, label: f.nome, id: f.id }))}
          placeholder="Selecione o funcionário antes de anexar"
          allowFree={false}
          minWidth={260}
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
