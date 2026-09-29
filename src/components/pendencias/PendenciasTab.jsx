import { useCallback, useMemo, useState } from 'react';
import { useFilialCollection } from '../../hooks/useFilialCollection.js';
import { diferencaSelecao } from '../../data/conciliacao.js';
import {
  CARTAO_EM_ABERTO,
  CREDITOS_EM_ABERTO,
  VENDAS_EM_ABERTO,
} from '../../data/filtrosAbertos.js';
import FirebaseGate from '../layout/FirebaseGate.jsx';
import ContextMenu from '../common/ContextMenu.jsx';
import FormaChips from './FormaChips.jsx';
import { ColunaVendas, ColunaExtrato } from './colunas.jsx';
import { AcoesBaixa, PodaAcoes, PodaBarra } from './AcoesBar.jsx';
import {
  AssociarClientePendenciasModal,
  ForcarConciliarModal,
  PodarModal,
  ResolverDiferencaModal,
} from './modals.jsx';
import { rotuloFonte } from './constants.js';
import {
  lancamentoEmAberto,
  ordenarExtrato,
  ordenarPorData,
  vendaEmAberto,
} from './selectors.js';
import { useExpurgoBaixas } from './useExpurgoBaixas.js';
import { useFormasFiltro } from './useFormasFiltro.js';
import { usePendenciasAcoes } from './usePendenciasAcoes.js';
import { useSelecao } from './useSelecao.js';
import '../../shared/CrudTab.css';
import '../extrato/ExtratoTab.css';
import './styles/tabelas.css';
import './styles/chips.css';
import './styles/acoes.css';
import './styles/poda.css';

export default function PendenciasTab({ filialId }) {
  return (
    <FirebaseGate>
      <PendenciasTabInner filialId={filialId} />
    </FirebaseGate>
  );
}

function PendenciasTabInner({ filialId }) {
  // Filtrados no servidor (só o que está em aberto): as coleções acumulam
  // histórico e ler tudo a cada abertura da tela esgotava a cota diária.
  // Sem orderBy (evita índice composto) — a ordenação é feita abaixo.
  const { items: vendas } = useFilialCollection(filialId, 'pendenciasVendas', null, VENDAS_EM_ABERTO);
  const { items: lancamentos } = useFilialCollection(
    filialId,
    'extratoLancamentos',
    null,
    CREDITOS_EM_ABERTO
  );
  const { items: vinculos } = useFilialCollection(filialId, 'vinculosBancarios', 'criadoEm');
  // Linhas de maquininha (Rede, Itaú...): uma coleção só, `adquirente` diz a origem.
  const { items: extratoCartao } = useFilialCollection(
    filialId,
    'extratoCartao',
    null,
    CARTAO_EM_ABERTO
  );
  const { items: clientes } = useFilialCollection(filialId, 'clientes', 'nome');

  useExpurgoBaixas(filialId);
  const formas = useFormasFiltro(vendas);

  // 'bb' (por nome) ou id de adquirente de cartão (por data+valor+bandeira).
  const [origemExtrato, setOrigemExtrato] = useState('bb');
  const ehCartao = origemExtrato !== 'bb';

  const [ordemVendasAsc, setOrdemVendasAsc] = useState(true);
  const [ordemExtratoAsc, setOrdemExtratoAsc] = useState(true);
  const [filtroDataVendas, setFiltroDataVendas] = useState('');
  const [filtroClienteVendas, setFiltroClienteVendas] = useState('');
  const [filtroDataExtrato, setFiltroDataExtrato] = useState('');

  const selVendas = useSelecao();
  const selLanc = useSelecao();
  // Modo "lápis" (poda): seleção paralela, sem exigir cliente/nome/par 1:1,
  // só para sanear dados antigos que nunca serão reconhecidos sozinhos.
  const [modoPoda, setModoPoda] = useState(false);
  const podaVendas = useSelecao();
  const podaLanc = useSelecao();

  const [menuExtrato, setMenuExtrato] = useState(null);
  const [menuCartao, setMenuCartao] = useState(null);
  const [resolvendo, setResolvendo] = useState(null);
  const [associandoCliente, setAssociandoCliente] = useState(null);
  const [forcandoConciliar, setForcandoConciliar] = useState(null);
  const [podaModalAberto, setPodaModalAberto] = useState(false);

  // --- Dados derivados (memoizados: só recalculam quando a fonte muda) ----
  const vinculoPorChave = useMemo(() => new Map(vinculos.map((v) => [v.chave, v])), [vinculos]);

  // Base da baixa automática: ignora chips e filtros de tela, para não deixar
  // de fechar uma venda só porque o chip dela estava desmarcado.
  const vendasElegiveis = useMemo(() => vendas.filter(vendaEmAberto), [vendas]);

  const vendasAbertas = useMemo(() => {
    const ativas = new Set(formas.selecionadas);
    const termo = filtroClienteVendas.trim().toLowerCase();
    return ordenarPorData(
      vendasElegiveis.filter(
        (v) =>
          ativas.has(v.forma) &&
          (!filtroDataVendas || v.data === filtroDataVendas) &&
          (!termo || (v.clienteNome ?? '').toLowerCase().includes(termo))
      ),
      ordemVendasAsc
    );
  }, [vendasElegiveis, formas.selecionadas, filtroDataVendas, filtroClienteVendas, ordemVendasAsc]);

  const lancamentosAbertos = useMemo(() => lancamentos.filter(lancamentoEmAberto), [lancamentos]);

  const extratoVisivel = useMemo(
    () =>
      ordenarExtrato(
        lancamentosAbertos.filter((l) => !filtroDataExtrato || l.data === filtroDataExtrato),
        ordemExtratoAsc
      ),
    [lancamentosAbertos, filtroDataExtrato, ordemExtratoAsc]
  );

  const cartaoAbertos = useMemo(
    () =>
      extratoCartao.filter((c) => c.adquirente === origemExtrato && !c.baixaId && !c.arquivado),
    [extratoCartao, origemExtrato]
  );

  const cartaoVisivel = useMemo(
    () =>
      ordenarPorData(
        cartaoAbertos.filter((c) => !filtroDataExtrato || c.data === filtroDataExtrato),
        ordemExtratoAsc
      ),
    [cartaoAbertos, filtroDataExtrato, ordemExtratoAsc]
  );

  const lancamentosParaSelecao = ehCartao ? cartaoAbertos : lancamentosAbertos;

  // Totais sobre TUDO que está selecionado (mesmo que um filtro de tela
  // esconda a linha), porque é isso que será gravado na baixa.
  const selecao = useMemo(
    () =>
      diferencaSelecao(
        vendasElegiveis.filter((v) => selVendas.ids.has(v.id)),
        lancamentosParaSelecao.filter((l) => selLanc.ids.has(l.id))
      ),
    [vendasElegiveis, lancamentosParaSelecao, selVendas.ids, selLanc.ids]
  );
  const temSelecao = selVendas.ids.size > 0 || selLanc.ids.size > 0;

  const acoes = usePendenciasAcoes({
    filialId,
    vendas,
    lancamentos,
    vendasElegiveis,
    lancamentosAbertos,
    cartaoAbertos,
    vinculoPorChave,
    origemExtrato,
  });
  const { setAviso } = acoes;

  // --- Handlers estáveis (necessários para as linhas memoizadas) ----------
  const podaToggleVenda = podaVendas.toggle;
  const podaToggleLanc = podaLanc.toggle;
  const selToggleVenda = selVendas.toggle;
  const selToggleLanc = selLanc.toggle;
  const marcarVenda = useCallback(
    (id) => {
      setAviso(null);
      (modoPoda ? podaToggleVenda : selToggleVenda)(id);
    },
    [modoPoda, podaToggleVenda, selToggleVenda, setAviso]
  );
  const marcarLancamento = useCallback(
    (id) => {
      setAviso(null);
      (modoPoda ? podaToggleLanc : selToggleLanc)(id);
    },
    [modoPoda, podaToggleLanc, selToggleLanc, setAviso]
  );
  const inverterOrdemVendas = useCallback(() => setOrdemVendasAsc((v) => !v), []);
  const inverterOrdemExtrato = useCallback(() => setOrdemExtratoAsc((v) => !v), []);

  function trocarOrigem(id) {
    setOrigemExtrato(id);
    selLanc.limpar();
    setAviso(null);
    if (id !== 'bb') setModoPoda(false);
  }

  function alternarModoPoda() {
    setModoPoda((v) => !v);
    podaVendas.limpar();
    podaLanc.limpar();
  }

  const podaTodasMarcadas =
    (vendasAbertas.length > 0 || lancamentosAbertos.length > 0) &&
    podaVendas.ids.size === vendasAbertas.length &&
    podaLanc.ids.size === lancamentosAbertos.length;

  function alternarTodasPoda() {
    if (podaTodasMarcadas) {
      podaVendas.limpar();
      podaLanc.limpar();
    } else {
      podaVendas.substituir(vendasAbertas.map((v) => v.id));
      podaLanc.substituir(lancamentosAbertos.map((l) => l.id));
    }
  }

  // --- Fluxos que combinam ação + reset de UI -----------------------------
  async function baixarSelecao(resolucao) {
    const ok = await acoes.confirmarBaixaManual([...selVendas.ids], [...selLanc.ids], resolucao);
    if (!ok) return;
    selVendas.limpar();
    selLanc.limpar();
    setResolvendo(null);
  }

  function iniciarBaixaManual() {
    if (!selVendas.ids.size || !selLanc.ids.size) {
      setAviso('Selecione pelo menos uma venda no CDS e um pagamento no extrato.');
      return;
    }
    if (selecao.bate) baixarSelecao(null);
    else setResolvendo(selecao);
  }

  async function podar(justificativa) {
    const ok = await acoes.confirmarPoda([...podaVendas.ids], [...podaLanc.ids], justificativa);
    if (!ok) return;
    podaVendas.limpar();
    podaLanc.limpar();
    setModoPoda(false);
    setPodaModalAberto(false);
  }

  async function forcarConciliar(justificativa) {
    if (await acoes.confirmarForcarConciliar(forcandoConciliar, justificativa)) {
      setForcandoConciliar(null);
    }
  }

  async function fecharSemVenda(lancamento, motivo, colecao) {
    await acoes.fecharSemVenda(lancamento, motivo, colecao);
    setMenuExtrato(null);
    setMenuCartao(null);
  }

  async function associarCliente(cliente) {
    if (await acoes.salvarVinculoCliente(associandoCliente, cliente)) setAssociandoCliente(null);
  }

  const contagem = ehCartao
    ? `${vendasAbertas.length} venda(s) e ${cartaoVisivel.length} lançamento(s) da ${rotuloFonte(
        origemExtrato
      )} em aberto`
    : `${vendasAbertas.length} venda(s) e ${extratoVisivel.length} lançamento(s) de extrato em aberto`;

  const temPoda = podaVendas.ids.size > 0 || podaLanc.ids.size > 0;

  return (
    <div className="pend">
      <div className="pend__header">
        <h2 className="pend__titulo">Pendências</h2>
        {!ehCartao && (
          <button
            type="button"
            className={`pend__lapis ${modoPoda ? 'is-active' : ''}`}
            title={
              modoPoda
                ? 'Sair do modo de poda de inconsistências'
                : 'Podar inconsistências antigas (dados já baixados que não são mais reconhecidos)'
            }
            onClick={alternarModoPoda}
          >
            ✎
          </button>
        )}
      </div>

      {modoPoda && <PodaBarra todasMarcadas={podaTodasMarcadas} onToggleTodas={alternarTodasPoda} />}

      <FormaChips formas={formas} contagem={contagem} />

      <div className="pend__grid">
        <ColunaVendas
          vendas={vendasAbertas}
          selecionadas={modoPoda ? podaVendas.ids : selVendas.ids}
          onToggle={marcarVenda}
          comCheckbox={modoPoda}
          asc={ordemVendasAsc}
          onInverter={inverterOrdemVendas}
          busca={filtroClienteVendas}
          onBusca={setFiltroClienteVendas}
          data={filtroDataVendas}
          onData={setFiltroDataVendas}
        />
        <ColunaExtrato
          origem={origemExtrato}
          onOrigem={trocarOrigem}
          data={filtroDataExtrato}
          onData={setFiltroDataExtrato}
          asc={ordemExtratoAsc}
          onInverter={inverterOrdemExtrato}
          selecionadas={modoPoda ? podaLanc.ids : selLanc.ids}
          onToggle={marcarLancamento}
          onMenu={ehCartao ? setMenuCartao : setMenuExtrato}
          comCheckbox={modoPoda}
          lancamentosBanco={extratoVisivel}
          vinculoPorChave={vinculoPorChave}
          linhasCartao={cartaoVisivel}
        />
      </div>

      {modoPoda && temPoda && (
        <PodaAcoes
          qtdVendas={podaVendas.ids.size}
          qtdLancamentos={podaLanc.ids.size}
          onLimpar={() => {
            podaVendas.limpar();
            podaLanc.limpar();
          }}
          onPodar={() => setPodaModalAberto(true)}
        />
      )}

      <AcoesBaixa
        selecao={selecao}
        temSelecao={temSelecao}
        processando={acoes.processando}
        aviso={acoes.aviso}
        onLimpar={() => {
          selVendas.limpar();
          selLanc.limpar();
        }}
        onAplicar={acoes.aplicarBaixas}
        onBaixaSelecao={iniciarBaixaManual}
      />

      <p className="crud-tab__note">
        A baixa automática de vendas só fecha par 1:1: um pagamento de uma conta associada a um
        cliente, com nome <strong>exatamente igual</strong> ao da venda no CDS (vale também para
        promissória) e valor <strong>exatamente igual</strong>. Qualquer outra situação — conta
        sem cliente, nome parecido mas diferente, um centavo de diferença, duas vendas candidatas
        — fica pendente de propósito, para você fechar na mão. Pagamento parcial, vários Pix
        para uma venda ou um Pix para várias vendas: selecione as linhas dos dois lados e use
        "Dar baixa na seleção". Gastos, cobrança de boletos e vendas em boleto não aparecem aqui
        — essa tela é só para baixa de venda conferível; para categorizar um débito, use a aba
        Extrato. O histórico de baixas conciliadas (e a opção de restaurar) fica na aba
        Fechamentos.
      </p>

      {resolvendo && (
        <ResolverDiferencaModal
          selecao={resolvendo}
          onCancel={() => setResolvendo(null)}
          onConfirm={baixarSelecao}
        />
      )}

      {menuExtrato && (
        <ContextMenu
          x={menuExtrato.x}
          y={menuExtrato.y}
          onClose={() => setMenuExtrato(null)}
          itens={[
            {
              label: 'Associar cliente',
              desabilitado: !menuExtrato.lancamento.chaveContraparte,
              onClick: () => setAssociandoCliente(menuExtrato.lancamento),
            },
            {
              label: 'Forçar Conciliar',
              desabilitado: !menuExtrato.vinculo,
              onClick: () => setForcandoConciliar(menuExtrato.lancamento),
            },
            {
              label: 'Associar sangria',
              onClick: () => fecharSemVenda(menuExtrato.lancamento, 'sangria'),
            },
            {
              label: 'Associar promissória',
              onClick: () => fecharSemVenda(menuExtrato.lancamento, 'promissoria'),
            },
          ]}
        />
      )}

      {menuCartao && (
        <ContextMenu
          x={menuCartao.x}
          y={menuCartao.y}
          onClose={() => setMenuCartao(null)}
          itens={[
            {
              label: 'Associar promissória',
              onClick: () =>
                fecharSemVenda(menuCartao.lancamento, 'promissoria', 'extratoCartao'),
            },
          ]}
        />
      )}

      {associandoCliente && (
        <AssociarClientePendenciasModal
          lancamento={associandoCliente}
          clientes={clientes}
          vinculoAtual={vinculoPorChave.get(associandoCliente.chaveContraparte)}
          onCancel={() => setAssociandoCliente(null)}
          onConfirm={associarCliente}
        />
      )}

      {forcandoConciliar && (
        <ForcarConciliarModal
          lancamento={forcandoConciliar}
          onCancel={() => setForcandoConciliar(null)}
          onConfirm={forcarConciliar}
          processando={acoes.processando}
        />
      )}

      {podaModalAberto && (
        <PodarModal
          quantidadeVendas={podaVendas.ids.size}
          quantidadeLancamentos={podaLanc.ids.size}
          onCancel={() => setPodaModalAberto(false)}
          onConfirm={podar}
          processando={acoes.processando}
        />
      )}
    </div>
  );
}
