import { useState } from 'react';
import CategoriaGastoPicker from '../components/common/CategoriaGastoPicker.jsx';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// Usado por Extrato e por Pendências para associar um lançamento a uma
// categoria de gasto. Antes vivia dentro de ExtratoTab.jsx e Pendências
// importava direto do componente vizinho (acoplamento entre abas).
export default function AssociarGastoModal({ filialId, lancamento, vinculoAtual, onCancel, onConfirm }) {
  const [valor, setValor] = useState({
    categoria: vinculoAtual?.categoria ?? '',
    extra: vinculoAtual?.funcionarioNome ?? vinculoAtual?.distribuidora ?? vinculoAtual?.tipoImposto ?? '',
    extraId: vinculoAtual?.funcionarioId ?? '',
  });

  const pronto = valor.categoria.trim().length > 0;

  function confirmar() {
    onConfirm({
      categoria: valor.categoria,
      extra: valor.extra,
      funcionarioId: valor.extraId || null,
      // Guarda em qual lista auxiliar o valor livre foi salvo, se foi — o
      // pai usa isso pra saber em qual campo do documento de gasto gravar.
      tipoLista:
        valor.categoria.trim().toUpperCase() === 'PEDIDOS'
          ? 'distribuidoras'
          : valor.categoria.trim().toUpperCase() === 'IMPOSTOS'
            ? 'tiposImposto'
            : null,
    });
  }

  return (
    <div className="modal-overlay" onMouseDown={onCancel}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="modal__title">Associar gasto</h3>
        <p className="modal__desc">
          Pagamento de <strong>{lancamento.contraparteNome || lancamento.historico}</strong> —{' '}
          {currency.format(lancamento.valor)}
        </p>
        <CategoriaGastoPicker filialId={filialId} valor={valor} onChange={setValor} minWidth={220} />
        <div className="modal__actions">
          <button type="button" className="pdf-import__confirm" disabled={!pronto} onClick={confirmar}>
            Associar
          </button>
          <button type="button" className="pdf-import__cancel" onClick={onCancel}>
            Cancelar
          </button>
        </div>
        <p className="modal__nota">
          {lancamento.chaveContraparte
            ? 'Essa categoria fica salva para esta conta — todo pagamento futuro vindo dela já entra categorizado assim, e pode fechar sozinho em Pendências.'
            : 'Não identifiquei uma conta neste lançamento (sem nome/CPF no histórico), então essa categoria vale só para ele — pagamentos futuros dessa mesma origem não serão reconhecidos automaticamente.'}
        </p>
      </div>
    </div>
  );
}
