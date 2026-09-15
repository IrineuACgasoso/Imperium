import { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { db, firebaseIsConfigured } from '../config/firebase.js';
import { extrairDocumento, confirmarStaging, rejeitarStaging } from '../config/extraction.js';
import './ImportPanel.css';

const TIPOS = [
  {
    id: 'diario',
    label: 'Caixa diário',
    hint: 'PDF ou foto do caixa sintético de um único dia.',
  },
  {
    id: 'mensal-historico',
    label: 'Histórico mensal (geral)',
    hint: 'Print/gráfico com total de vendas por mês (dados antigos, sem detalhe diário).',
  },
  {
    id: 'funcionario-mensal',
    label: 'Vendas por funcionário (mensal)',
    hint: 'Relatório com o total vendido por cada funcionário em um mês.',
  },
  {
    id: 'despesas-diarias',
    label: 'Relatório de despesas (diário)',
    hint: 'Lista de despesas do dia. Despesas/gasolina/serviços viram um gasto só; sangrias são ignoradas; adiantamentos vão para cada funcionário.',
  },
];

export default function ImportPanel({ filialId }) {
  const [tipo, setTipo] = useState('diario');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [pendingItems, setPendingItems] = useState([]);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!firebaseIsConfigured || !filialId) return undefined;

    const q = query(
      collection(db, 'filiais', filialId, 'staging'),
      where('status', '==', 'pendente'),
      orderBy('criadoEm', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      setPendingItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return unsubscribe;
  }, [filialId]);

  // Ctrl+V: cola um arquivo (ex: print copiado) direto, sem precisar salvar
  // em disco primeiro. Só ativo enquanto esta aba está montada.
  useEffect(() => {
    function handlePaste(e) {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith('image/')
      );
      if (item) {
        const pastedFile = item.getAsFile();
        if (pastedFile) {
          setFile(pastedFile);
          setUploadError(null);
        }
      }
    }
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      setFile(dropped);
      setUploadError(null);
    }
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      await extrairDocumento({ filialId, tipo, file });
      setFile(null);
    } catch (err) {
      console.error(err);
      setUploadError(err.message ?? 'Falha ao extrair o documento.');
    } finally {
      setUploading(false);
    }
  }

  if (!firebaseIsConfigured) {
    return (
      <div className="import-panel import-panel--disabled">
        <p>
          O Firebase ainda não está configurado (arquivo <code>.env</code> vazio). Preencha
          as credenciais para habilitar a importação por IA.
        </p>
      </div>
    );
  }

  return (
    <div className="import-panel">
      <section className="import-panel__upload">
        <h3>Enviar documento para extração</h3>

        <form onSubmit={handleUpload}>
          <div className="import-panel__tipo-options">
            {TIPOS.map((t) => (
              <label
                key={t.id}
                className={`import-panel__tipo-option ${tipo === t.id ? 'is-active' : ''}`}
              >
                <input
                  type="radio"
                  name="tipo"
                  value={t.id}
                  checked={tipo === t.id}
                  onChange={() => setTipo(t.id)}
                />
                <span className="import-panel__tipo-label">{t.label}</span>
                <span className="import-panel__tipo-hint">{t.hint}</span>
              </label>
            ))}
          </div>

          <label
            className={`import-panel__dropzone ${dragOver ? 'is-dragover' : ''} ${
              file ? 'has-file' : ''
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <span className="import-panel__dropzone-filename">{file.name}</span>
            ) : (
              <span className="import-panel__dropzone-hint">
                Arraste um arquivo aqui, cole com <kbd>Ctrl</kbd>+<kbd>V</kbd>, ou clique
                para escolher.
              </span>
            )}
          </label>

          <button type="submit" disabled={!file || uploading}>
            {uploading ? 'Extraindo com IA…' : 'Extrair com IA'}
          </button>

          {uploadError && <p className="import-panel__error">{uploadError}</p>}
        </form>
      </section>

      <section className="import-panel__review">
        <h3>Pendentes de revisão ({pendingItems.length})</h3>
        {pendingItems.length === 0 && (
          <p className="import-panel__empty">Nada aguardando revisão no momento.</p>
        )}
        {pendingItems.map((item) => (
          <StagingCard key={item.id} filialId={filialId} item={item} />
        ))}
      </section>
    </div>
  );
}

function StagingCard({ filialId, item }) {
  const [draft, setDraft] = useState(item.dadosExtraidos);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function setField(path, value) {
    setDirty(true);
    setDraft((prev) => {
      const next = structuredClone(prev);
      let cursor = next;
      for (let i = 0; i < path.length - 1; i += 1) cursor = cursor[path[i]];
      cursor[path[path.length - 1]] = value;
      return next;
    });
  }

  async function saveIfDirty() {
    if (!dirty) return;
    await updateDoc(doc(db, 'filiais', filialId, 'staging', item.id), {
      dadosExtraidos: draft,
    });
    setDirty(false);
  }

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      await saveIfDirty();
      await confirmarStaging({ filialId, stagingId: item.id });
    } catch (err) {
      console.error(err);
      setError(err.message ?? 'Falha ao confirmar.');
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    setBusy(true);
    setError(null);
    try {
      await rejeitarStaging({ filialId, stagingId: item.id });
    } catch (err) {
      console.error(err);
      setError(err.message ?? 'Falha ao rejeitar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="staging-card">
      <header className="staging-card__header">
        <span className="staging-card__tipo">{item.tipo}</span>
        {item.fonteArquivo && (
          <span className="staging-card__fonte">{item.fonteArquivo}</span>
        )}
      </header>

      <div className="staging-card__fields">
        {item.tipo === 'diario' && <DiarioFields draft={draft} setField={setField} />}
        {item.tipo === 'mensal-historico' && (
          <MensalHistoricoFields draft={draft} setField={setField} />
        )}
        {item.tipo === 'funcionario-mensal' && (
          <FuncionarioMensalFields draft={draft} setField={setField} />
        )}
        {item.tipo === 'despesas-diarias' && (
          <DespesasDiariasFields draft={draft} setField={setField} />
        )}
      </div>

      {error && <p className="import-panel__error">{error}</p>}

      <footer className="staging-card__actions">
        <button className="staging-card__reject" onClick={handleReject} disabled={busy}>
          Rejeitar
        </button>
        <button className="staging-card__confirm" onClick={handleConfirm} disabled={busy}>
          {dirty ? 'Salvar e confirmar' : 'Confirmar'}
        </button>
      </footer>
    </div>
  );
}

function NumberField({ label, value, onChange }) {
  return (
    <label className="staging-card__field">
      <span>{label}</span>
      <input
        type="number"
        step="0.01"
        value={value ?? 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </label>
  );
}

function DiarioFields({ draft, setField }) {
  return (
    <>
      <label className="staging-card__field">
        <span>Data</span>
        <input
          type="date"
          value={draft.data ?? ''}
          onChange={(e) => setField(['data'], e.target.value)}
        />
      </label>

      <fieldset>
        <legend>Vendas</legend>
        {['dinheiro', 'cartao', 'pix', 'boleto', 'promissoria', 'outros', 'totalAVista', 'totalAPrazo', 'totalVendas'].map(
          (key) => (
            <NumberField
              key={key}
              label={key}
              value={draft.vendas?.[key]}
              onChange={(v) => setField(['vendas', key], v)}
            />
          )
        )}
      </fieldset>

      <fieldset>
        <legend>Caixa</legend>
        {['saldoInicial', 'suprimento', 'sangria', 'despesas', 'vales', 'totalCaixa'].map((key) => (
          <NumberField
            key={key}
            label={key}
            value={draft.caixa?.[key]}
            onChange={(v) => setField(['caixa', key], v)}
          />
        ))}
      </fieldset>

      <fieldset>
        <legend>Ajustes</legend>
        {['descontos', 'trocas', 'cancelamentos', 'valeCredito'].map((key) => (
          <NumberField
            key={key}
            label={key}
            value={draft.ajustes?.[key]}
            onChange={(v) => setField(['ajustes', key], v)}
          />
        ))}
      </fieldset>
    </>
  );
}

function MensalHistoricoFields({ draft, setField }) {
  return (
    <fieldset>
      <legend>Meses</legend>
      {(draft.meses ?? []).map((item, idx) => (
        <div className="staging-card__row" key={idx}>
          <input
            type="text"
            value={item.mes}
            onChange={(e) => setField(['meses', idx, 'mes'], e.target.value)}
          />
          <input
            type="number"
            step="0.01"
            value={item.totalVendas}
            onChange={(e) =>
              setField(['meses', idx, 'totalVendas'], parseFloat(e.target.value) || 0)
            }
          />
        </div>
      ))}
    </fieldset>
  );
}

function FuncionarioMensalFields({ draft, setField }) {
  // O relatório pode trazer vários meses; mostramos todos para revisão, cada
  // um com sua própria lista de funcionários.
  const meses = draft.meses ?? [];

  return (
    <>
      {meses.length === 0 && (
        <p className="staging-card__hint">Nenhum mês identificado no relatório.</p>
      )}
      {meses.map((bloco, mi) => (
        <fieldset key={mi}>
          <legend>
            <input
              type="text"
              className="staging-card__legend-input"
              value={bloco.mes ?? ''}
              placeholder="YYYY-MM"
              onChange={(e) => setField(['meses', mi, 'mes'], e.target.value)}
            />
          </legend>
          {(bloco.funcionarios ?? []).map((item, idx) => (
            <div className="staging-card__row" key={idx}>
              <input
                type="text"
                value={item.nome}
                onChange={(e) => setField(['meses', mi, 'funcionarios', idx, 'nome'], e.target.value)}
              />
              <input
                type="number"
                step="0.01"
                value={item.totalVendido}
                onChange={(e) =>
                  setField(
                    ['meses', mi, 'funcionarios', idx, 'totalVendido'],
                    parseFloat(e.target.value) || 0
                  )
                }
              />
            </div>
          ))}
        </fieldset>
      ))}
      <p className="staging-card__hint">
        {meses.length} mês(es) encontrado(s). Os nomes são casados automaticamente com o
        cadastro de funcionários (ignorando acentos e sobrenomes); corrija aqui se algum
        estiver muito diferente.
      </p>
    </>
  );
}

function DespesasDiariasFields({ draft, setField }) {
  return (
    <>
      <label className="staging-card__field">
        <span>Data</span>
        <input
          type="date"
          value={draft.data ?? ''}
          onChange={(e) => setField(['data'], e.target.value)}
        />
      </label>

      <NumberField
        label="Despesa do dia (despesas + gasolina + serviços)"
        value={draft.despesaOperacionalDoDia}
        onChange={(v) => setField(['despesaOperacionalDoDia'], v)}
      />

      <p className="staging-card__hint">
        Sangrias ignoradas neste relatório: {draft.sangriasIgnoradas ?? 0}
      </p>

      <fieldset>
        <legend>Adiantamentos por funcionário</legend>
        {(draft.adiantamentos ?? []).map((a, i) => (
          <div className="staging-card__row" key={i}>
            <input
              type="text"
              value={a.funcionarioNome ?? ''}
              onChange={(e) => setField(['adiantamentos', i, 'funcionarioNome'], e.target.value)}
            />
            <input
              type="number"
              step="0.01"
              value={a.valor ?? 0}
              onChange={(e) =>
                setField(['adiantamentos', i, 'valor'], parseFloat(e.target.value) || 0)
              }
            />
          </div>
        ))}
        {(draft.adiantamentos ?? []).length === 0 && (
          <p className="staging-card__hint">Nenhum adiantamento identificado.</p>
        )}
      </fieldset>

      <fieldset>
        <legend>Outros lançamentos</legend>
        {(draft.outrosLancamentos ?? []).map((l, i) => (
          <div className="staging-card__row" key={i}>
            <input
              type="text"
              value={l.categoria ?? ''}
              onChange={(e) => setField(['outrosLancamentos', i, 'categoria'], e.target.value)}
            />
            <input
              type="number"
              step="0.01"
              value={l.valor ?? 0}
              onChange={(e) =>
                setField(['outrosLancamentos', i, 'valor'], parseFloat(e.target.value) || 0)
              }
            />
          </div>
        ))}
        {(draft.outrosLancamentos ?? []).length === 0 && (
          <p className="staging-card__hint">Nenhum outro lançamento identificado.</p>
        )}
      </fieldset>
    </>
  );
}
