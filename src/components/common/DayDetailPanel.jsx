import { useState } from 'react';
import './DayDetailPanel.css';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function formatDateLabel(iso) {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

const VENDAS_CAMPOS = [
  { key: 'dinheiro', label: 'Dinheiro' },
  { key: 'cartao', label: 'Cartão' },
  { key: 'pix', label: 'Pix' },
  { key: 'boleto', label: 'Boleto' },
  { key: 'promissoria', label: 'Promissória' },
  { key: 'outros', label: 'Outros' },
];

export default function DayDetailPanel({
  iso,
  kind,
  vendasDetail,
  gastosDetail,
  onClose,
  onDeleteVenda,
  onSaveVenda,
  onDeleteGasto,
}) {
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState(null);
  const [saving, setSaving] = useState(false);

  function startEditing() {
    setEditValues(
      Object.fromEntries(VENDAS_CAMPOS.map((c) => [c.key, String(vendasDetail?.vendas?.[c.key] ?? 0)]))
    );
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const vendas = Object.fromEntries(
        VENDAS_CAMPOS.map((c) => [c.key, parseFloat(editValues[c.key]) || 0])
      );
      await onSaveVenda(vendas);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="day-detail" onClick={(e) => e.stopPropagation()}>
      <header className="day-detail__header">
        <div>
          <span className="day-detail__eyebrow">Prestação de contas</span>
          <h3 className="day-detail__title">{formatDateLabel(iso)}</h3>
        </div>
        <button className="day-detail__close" onClick={onClose} aria-label="Fechar (Esc)" title="Fechar (Esc)">
          ✕
        </button>
      </header>

      {kind === 'vendas' && (
        <>
          {vendasDetail ? (
            <>
              <div className="day-detail__grid">
                {VENDAS_CAMPOS.map((c) => (
                  <div key={c.key} className="day-detail__item">
                    <span className="day-detail__item-label">{c.label}</span>
                    {editing ? (
                      <input
                        className="day-detail__item-input"
                        type="number"
                        step="0.01"
                        value={editValues[c.key]}
                        onChange={(e) =>
                          setEditValues((prev) => ({ ...prev, [c.key]: e.target.value }))
                        }
                      />
                    ) : (
                      <span className="day-detail__item-value">
                        {currency.format(vendasDetail.vendas?.[c.key] ?? 0)}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {!editing && (
                <div className="day-detail__total">
                  <span>Total do dia</span>
                  <strong>{currency.format(vendasDetail.vendas?.totalVendas ?? 0)}</strong>
                </div>
              )}

              <p className="day-detail__origem">
                Origem: {vendasDetail.origem === 'ia-caixa-diario' ? 'IA (caixa diário)' : 'Manual'}
              </p>

              <div className="day-detail__actions">
                {editing ? (
                  <>
                    <button className="day-detail__save" onClick={handleSave} disabled={saving}>
                      {saving ? 'Salvando…' : 'Salvar alterações'}
                    </button>
                    <button className="day-detail__cancel" onClick={() => setEditing(false)}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    {onSaveVenda && (
                      <button className="day-detail__edit" onClick={startEditing}>
                        Editar lançamento
                      </button>
                    )}
                    {onDeleteVenda && (
                      <button className="day-detail__delete" onClick={onDeleteVenda}>
                        Remover lançamento
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          ) : (
            <p className="day-detail__empty">Nenhum lançamento de vendas para este dia.</p>
          )}
        </>
      )}

      {kind === 'gastos' && (
        <>
          {gastosDetail && (gastosDetail.avulsos.length > 0 || gastosDetail.despesasCaixa > 0) ? (
            <>
              <ul className="day-detail__list">
                {gastosDetail.avulsos.map((g) => (
                  <li key={g.id} className="day-detail__list-item">
                    <div>
                      <span className="day-detail__item-label">{g.categoria}</span>
                      {g.descricao && <span className="day-detail__list-desc"> — {g.descricao}</span>}
                    </div>
                    <div className="day-detail__list-actions">
                      <span className="day-detail__item-value">{currency.format(Number(g.valor))}</span>
                      {onDeleteGasto && (
                        <button className="day-detail__delete-inline" onClick={() => onDeleteGasto(g.id)}>
                          Remover
                        </button>
                      )}
                    </div>
                  </li>
                ))}
                {gastosDetail.despesasCaixa > 0 && (
                  <li className="day-detail__list-item">
                    <span className="day-detail__item-label">Despesas do caixa (IA)</span>
                    <span className="day-detail__item-value">
                      {currency.format(gastosDetail.despesasCaixa)}
                    </span>
                  </li>
                )}
              </ul>
              <div className="day-detail__total">
                <span>Total do dia</span>
                <strong>
                  {currency.format(
                    gastosDetail.avulsos.reduce((sum, g) => sum + Number(g.valor), 0) +
                      gastosDetail.despesasCaixa
                  )}
                </strong>
              </div>
            </>
          ) : (
            <p className="day-detail__empty">Nenhum gasto lançado para este dia.</p>
          )}
        </>
      )}
    </div>
  );
}
