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
import { db, firebaseIsConfigured } from '../../config/firebase.js';
import { extrairDocumento, confirmarStaging, rejeitarStaging } from '../../config/extraction.js';
import { DiarioFields, MensalHistoricoFields, FuncionarioMensalFields, DespesasDiariasFields } from './fields.jsx';
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

