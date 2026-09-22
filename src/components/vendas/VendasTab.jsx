import { useRef, useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import { handleEnterNavigation, focusFirstField } from '../../utils/formNav.js';
import { useFilialCollection } from '../../hooks/useFilialCollection.js';
import { usePdfImport } from '../../hooks/usePdfImport.js';
import { parseCaixaDiario, parseVendasPorMes } from '../../parsers/caixaDiario.js';
import { arredondar2 } from '../../utils/numero.js';
import { normalizarNomeCliente } from '../../shared/texto.js';
import FirebaseGate from '../layout/FirebaseGate.jsx';
import '../../shared/CrudTab.css';
import '../../shared/PdfImport.css';

const CAMPOS = [
  { key: 'dinheiro', label: 'Dinheiro' },
  { key: 'cartao', label: 'Cartão' },
  { key: 'pix', label: 'Pix' },
  { key: 'boleto', label: 'Boleto' },
  { key: 'promissoria', label: 'Promissória' },
  { key: 'outros', label: 'Outros' },
];

const TIPOS_IMPORT = [
  { id: 'caixa-diario', label: 'Caixa Diário (relatório de um dia)' },
  { id: 'caixa-periodo', label: 'Caixa Antigo / Período (Vendas por Mês)' },
];

export default function VendasTab({ filialId }) {
  return (
    <FirebaseGate>
      <VendasTabInner filialId={filialId} />
    </FirebaseGate>
  );
}

function VendasTabInner({ filialId }) {
  const [data, setData] = useState('');
  const [valores, setValores] = useState(Object.fromEntries(CAMPOS.map((c) => [c.key, ''])));
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const formRef = useRef(null);

  function setValor(key, v) {
    setValores((prev) => ({ ...prev, [key]: v }));
  }

  async function handleSalvar(e) {
    e.preventDefault();
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      const vendas = Object.fromEntries(CAMPOS.map((c) => [c.key, parseFloat(valores[c.key]) || 0]));
      const totalVendas = arredondar2(Object.values(vendas).reduce((a, b) => a + b, 0));

      await setDoc(doc(db, 'filiais', filialId, 'registrosDiarios', data), {
        data,
        vendas: {
          ...vendas,
          totalAVista: arredondar2(vendas.dinheiro + vendas.pix),
          totalAPrazo: arredondar2(vendas.cartao + vendas.boleto + vendas.promissoria + vendas.outros),
          totalVendas,
        },
        origem: 'manual',
        criadoEm: serverTimestamp(),
      });

      setData('');
      setValores(Object.fromEntries(CAMPOS.map((c) => [c.key, ''])));
      // Volta pro primeiro campo (data) pra emendar o próximo dia sem mouse.
      focusFirstField(formRef);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="crud-tab">
      <form className="crud-tab__form" onSubmit={handleSalvar} ref={formRef}>
        <input type="date" aria-label="Data da venda" value={data} onChange={(e) => setData(e.target.value)} onKeyDown={handleEnterNavigation} />
        {CAMPOS.map((c) => (
          <input
            key={c.key}
            type="number"
            step="0.01"
            placeholder={c.label}
            value={valores[c.key]}
            onChange={(e) => setValor(c.key, e.target.value)}
            onKeyDown={handleEnterNavigation}
          />
        ))}
        <button type="submit" disabled={saving}>
          {saving ? 'Salvando…' : 'Lançar dia'}
        </button>
      </form>

      {error && <p className="crud-tab__error">{error}</p>}

      <ImportarCaixa filialId={filialId} />

      <p className="crud-tab__note">
        Lançar um dia manualmente aqui sobrescreve o registro daquela data caso já
        exista (inclusive um que tenha vindo de importação) — use com cuidado. Para
        ver ou remover um dia já lançado, clique na bolinha correspondente no gráfico
        principal (aba Vendas) — lá abre a prestação de contas detalhada daquele dia.
      </p>
    </div>
  );
}

function ImportarCaixa({ filialId }) {
  const { texto, nomeArquivo, carregando, erro, handleFile, limpar } = usePdfImport();
  const { items: clientes, add: addCliente } = useFilialCollection(filialId, 'clientes', 'nome');
  const [tipo, setTipo] = useState('caixa-diario');
  const [resultado, setResultado] = useState(null);
  const [confirmando, setConfirmando] = useState(false);

  function onFileChange(e) {
    const file = e.target.files?.[0];
    setResultado(null);
    handleFile(file).then(() => {});
    e.target.value = '';
  }

  // Roda o parser assim que o texto do PDF (ou o tipo escolhido) muda.
  if (texto && resultado === null) {
    const r = tipo === 'caixa-diario' ? parseCaixaDiario(texto) : { meses: parseVendasPorMes(texto) };
    setResultado(r);
  }

  function handleTrocarTipo(novoTipo) {
    setTipo(novoTipo);
    setResultado(null);
    if (texto) {
      const r = novoTipo === 'caixa-diario' ? parseCaixaDiario(texto) : { meses: parseVendasPorMes(texto) };
      setResultado(r);
    }
  }

  function editarCampoDiario(campo, valor) {
    setResultado((r) => ({
      ...r,
      vendas: { ...r.vendas, [campo]: arredondar2(parseFloat(valor) || 0) },
    }));
  }

  function editarMes(idx, valor) {
    setResultado((r) => {
      const meses = [...r.meses];
      meses[idx] = { ...meses[idx], totalVendas: parseFloat(valor) || 0 };
      return { ...r, meses };
    });
  }

  async function confirmarCaixaDiario() {
    setConfirmando(true);
    try {
      const vendas = { ...resultado.vendas };
      delete vendas.totalVendas;
      const totalVendas = arredondar2(Object.values(vendas).reduce((a, b) => a + b, 0));

      await setDoc(doc(db, 'filiais', filialId, 'registrosDiarios', resultado.data), {
        data: resultado.data,
        vendas: {
          ...vendas,
          totalAVista: arredondar2(vendas.dinheiro + vendas.pix),
          totalAPrazo: arredondar2(vendas.cartao + vendas.boleto + vendas.promissoria + vendas.outros),
          totalVendas,
        },
        origem: 'importado-caixa-diario',
        criadoEm: serverTimestamp(),
      });

      // Cadastra automaticamente clientes novos vistos no relatório (só os
      // que pagaram por Pix/boleto/cartão com nome, já filtrado no parser —
      // "CONSUMIDOR" nunca entra aqui). Dedup por nome completo normalizado.
      const existentesNorm = new Set(clientes.map((c) => normalizarNomeCliente(c.nome)));
      for (const nomeCliente of resultado.clientesNovos) {
        const norm = normalizarNomeCliente(nomeCliente);
        if (!existentesNorm.has(norm)) {
          existentesNorm.add(norm);
          await addCliente({ nome: nomeCliente, origem: 'caixa-diario' });
        }
      }

      // Manda cada venda individual pra fila de conciliação (aba Pendências).
      // ID determinístico: reimportar o mesmo caixa atualiza as mesmas linhas
      // em vez de duplicar a fila.
      for (const [idx, venda] of (resultado.vendasDetalhadas ?? []).entries()) {
        const sufixo = venda.numeroVenda || `l${idx}`;
        await setDoc(
          doc(db, 'filiais', filialId, 'pendenciasVendas', `${resultado.data}_${sufixo}`),
          {
            data: resultado.data,
            numeroVenda: venda.numeroVenda,
            clienteNome: venda.clienteNome,
            valor: venda.valor,
            forma: venda.forma,
            campo: venda.campo,
            origem: 'caixa-diario',
            criadoEm: serverTimestamp(),
          },
          { merge: true }
        );
      }

      limpar();
      setResultado(null);
    } finally {
      setConfirmando(false);
    }
  }

  async function confirmarPeriodo() {
    setConfirmando(true);
    try {
      for (const m of resultado.meses) {
        await setDoc(doc(db, 'filiais', filialId, 'registrosMensaisHistoricos', m.mes), {
          mes: m.mes,
          totalVendas: m.totalVendas,
          origem: 'importado-periodo',
          criadoEm: serverTimestamp(),
        });
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
        <span className="pdf-import__label">Importar de um PDF:</span>
        {TIPOS_IMPORT.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`crud-tab__toggle ${tipo === t.id ? 'is-active' : ''}`}
            onClick={() => handleTrocarTipo(t.id)}
          >
            {t.label}
          </button>
        ))}
        <input type="file" accept="application/pdf" onChange={onFileChange} className="pdf-import__file" />
      </div>

      {carregando && <p className="pdf-import__status">Lendo PDF…</p>}
      {erro && <p className="pdf-import__error">{erro}</p>}

      {resultado && tipo === 'caixa-diario' && resultado.periodoInvalido && (
        <div className="pdf-import__preview">
          <p className="pdf-import__error">{resultado.erro}</p>
          <div className="pdf-import__actions">
            <button className="pdf-import__cancel" onClick={cancelar}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {resultado && tipo === 'caixa-diario' && !resultado.periodoInvalido && (
        <div className="pdf-import__preview">
          <p className="pdf-import__preview-title">
            {nomeArquivo} — dia {resultado.data ?? '(data não identificada)'}
          </p>
          {!resultado.consistente && (
            <p className="pdf-import__warning">
              A soma das formas de pagamento (R$ {resultado.vendas.totalVendas.toFixed(2)}) não
              bateu com o "Subtotal Vendas" do relatório (R$ {resultado.totalRelatado?.toFixed(2)}).
              Confira os valores abaixo antes de confirmar.
            </p>
          )}
          <table className="pdf-import__table">
            <thead>
              <tr>
                {CAMPOS.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {CAMPOS.map((c) => (
                  <td key={c.key}>
                    <input
                      type="number"
                      step="0.01"
                      value={arredondar2(resultado.vendas[c.key])}
                      onChange={(e) => editarCampoDiario(c.key, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          {resultado.vendasDetalhadas?.length > 0 && (
            <p className="pdf-import__status">
              {resultado.vendasDetalhadas.length} venda(s) individual(is) identificada(s) — elas
              vão para a aba Pendências para conciliar com o extrato do banco.
            </p>
          )}
          {resultado.clientesNovos.length > 0 && (
            <p className="pdf-import__status">
              {resultado.clientesNovos.length} cliente(s) novo(s) serão cadastrados junto: {resultado.clientesNovos.join(', ')}
            </p>
          )}
          <div className="pdf-import__actions">
            <button className="pdf-import__confirm" onClick={confirmarCaixaDiario} disabled={confirmando || !resultado.data}>
              {confirmando ? 'Salvando…' : 'Confirmar e lançar'}
            </button>
            <button className="pdf-import__cancel" onClick={cancelar}>
              Cancelar
            </button>
          </div>
          {!resultado.data && (
            <p className="pdf-import__error">
              Não consegui identificar a data no relatório — confirme que é mesmo um
              "Caixa Detalhado" exportado do CDS.
            </p>
          )}
        </div>
      )}

      {resultado && tipo === 'caixa-periodo' && (
        <div className="pdf-import__preview">
          <p className="pdf-import__preview-title">{nomeArquivo} — {resultado.meses.length} mês(es)</p>
          <table className="pdf-import__table">
            <thead>
              <tr>
                <th>Mês</th>
                <th>Total vendas</th>
              </tr>
            </thead>
            <tbody>
              {resultado.meses.map((m, idx) => (
                <tr key={m.mes}>
                  <td>{m.mes}</td>
                  <td>
                    <input type="number" step="0.01" value={m.totalVendas} onChange={(e) => editarMes(idx, e.target.value)} />
                  </td>
                </tr>
              ))}
              {resultado.meses.length === 0 && (
                <tr>
                  <td colSpan={2}>Nenhum mês identificado nesse PDF.</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="pdf-import__actions">
            <button
              className="pdf-import__confirm"
              onClick={confirmarPeriodo}
              disabled={confirmando || resultado.meses.length === 0}
            >
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
