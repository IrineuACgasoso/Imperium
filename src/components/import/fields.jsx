export function NumberField({ label, value, onChange }) {
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

export function DiarioFields({ draft, setField }) {
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

export function MensalHistoricoFields({ draft, setField }) {
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

export function FuncionarioMensalFields({ draft, setField }) {
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

export function DespesasDiariasFields({ draft, setField }) {
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
