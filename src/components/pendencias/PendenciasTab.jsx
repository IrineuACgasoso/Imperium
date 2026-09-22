import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, setDoc, updateDoc, deleteDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import { useFilialCollection } from '../../hooks/useFilialCollection.js';
import { CATEGORIA_PENDENTE } from '../../data/categoriasGasto.js';
import { salvarNaListaAuxiliar } from '../../data/listasAuxiliares.js';
import { abreviarFormaPagamento } from '../../parsers/extratoBB.js';
import { idVinculo, idVinculoGasto } from '../../shared/vinculo.js';
import AssociarGastoModal from '../../shared/AssociarGastoModal.jsx';
import {
  casarAutomatico,
  diferencaSelecao,
  baixaExpirada,
} from '../../data/conciliacao.js';
import { casarAutomaticoCartao } from '../../data/conciliacaoCartao.js';
import FirebaseGate from '../layout/FirebaseGate.jsx';
import ContextMenu from '../common/ContextMenu.jsx';
import Combobox from '../common/Combobox.jsx';
import SetaOrdem from './SetaOrdem.jsx';
import { currency, formatarData, hojeISO } from './utils.js';
import {
  AssociarClientePendenciasModal,
  ForcarConciliarModal,
  PodarModal,
  ResolverDiferencaModal,
} from './modals.jsx';
import '../../shared/CrudTab.css';
import '../extrato/ExtratoTab.css';
import './PendenciasTab.css';

// Fontes do extrato mostrado na coluna direita. 'bb' é o extrato bancário
// (conciliação por nome, já existente). Cada adquirente de cartão entra
// aqui como um item novo — casam por data+valor+bandeira, nunca por nome
// (a maquininha não sabe quem comprou). Adicionar Itaú no futuro é só
// incluir a entrada aqui; o resto do componente já sabe lidar com N
// adquirentes.
const FONTES_EXTRATO = [
  { id: 'bb', label: 'BB' },
  { id: 'rede', label: 'Rede' },
  { id: 'itau', label: 'Itaú' },
];

const FORMAS_COMPLEMENTO = [
  { value: 'dinheiro', label: 'Pagou o restante em dinheiro' },
  { value: 'pix', label: 'Pagou o restante em Pix (fora deste extrato)' },
  { value: 'cartao', label: 'Pagou o restante no cartão' },
  { value: 'boleto', label: 'Pagou o restante em boleto' },
  { value: 'promissoria', label: 'Ficou em promissória (crediário)' },
  { value: 'desconto', label: 'Desconto concedido / acerto' },
  {
    value: 'abater-divida',
    label: 'Abater dívida (gera promissória automática pro cliente)',
  },
];



export default function PendenciasTab({ filialId }) {
  return (
    <FirebaseGate>
      <PendenciasTabInner filialId={filialId} />
    </FirebaseGate>
  );
}

function PendenciasTabInner({ filialId }) {
  const { items: vendas } = useFilialCollection(filialId, 'pendenciasVendas', 'data');
  const { items: lancamentos } = useFilialCollection(filialId, 'extratoLancamentos', 'data');
  const { items: vinculos } = useFilialCollection(filialId, 'vinculosBancarios', 'criadoEm');
  const { items: baixas } = useFilialCollection(filialId, 'baixas', 'criadoEm');
  // Linhas importadas de extratos de maquininha (Rede, Itaú...). Uma única
  // coleção pra todos os adquirentes — cada doc carrega `adquirente` (o id
  // em FONTES_EXTRATO) pra saber de onde veio.
  const { items: extratoCartao } = useFilialCollection(filialId, 'extratoCartao', 'data');
  const { items: clientes } = useFilialCollection(filialId, 'clientes', 'nome');
  // Só pra saber quais débitos já foram categorizados (aba Extrato >
  // Associar Gasto grava a categoria direto no doc `gastos/extrato_{id}`,
  // então é ali — não numa coleção separada — que está a verdade sobre "esse
  // débito já tem tipo de gasto ou ainda está pendente de categorizar").
  const { items: gastos } = useFilialCollection(filialId, 'gastos', 'data');

  const [selVendas, setSelVendas] = useState([]);
  const [selLancamentos, setSelLancamentos] = useState([]);
  const [menuExtrato, setMenuExtrato] = useState(null);
  const [resolvendo, setResolvendo] = useState(null);
  const [processando, setProcessando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [ordemVendasAsc, setOrdemVendasAsc] = useState(true);
  const [ordemExtratoAsc, setOrdemExtratoAsc] = useState(true);
  const [filtroDataVendas, setFiltroDataVendas] = useState('');
  const [filtroDataExtrato, setFiltroDataExtrato] = useState('');
  // Qual extrato a coluna direita está mostrando agora: 'bb' (bancário, por
  // nome) ou o id de um adquirente de cartão (por data+valor+bandeira).
  const [origemExtrato, setOrigemExtrato] = useState('bb');
  const [associandoCliente, setAssociandoCliente] = useState(null);
  const [associandoGasto, setAssociandoGasto] = useState(null);
  const [forcandoConciliar, setForcandoConciliar] = useState(null);
  // "Lápis" no canto da tela: liga um modo de seleção paralelo (não mexe em
  // selVendas/selLancamentos, que são pra baixa manual normal) só pra marcar
  // linhas de qualquer jeito — sem exigir cliente igual, nome igual ou par
  // 1:1 — e fechar tudo junto numa "poda". Existe só pra sanear dados
  // antigos que, por causa das melhorias parciais do projeto ao longo do
  // tempo, nunca vão ser reconhecidos automaticamente nem batem com o
  // "Forçar Conciliar" (que exige 1 lançamento com cliente associado).
  const [modoPoda, setModoPoda] = useState(false);
  const [selPodaVendas, setSelPodaVendas] = useState([]);
  const [selPodaLancamentos, setSelPodaLancamentos] = useState([]);
  const [podaModalAberto, setPodaModalAberto] = useState(false);
  const [podando, setPodando] = useState(false);
  // Filtro por forma de pagamento (chips, igual aos de funcionário no
  // gráfico). Vendas em dinheiro nunca aparecem no extrato — não tem
  // "baixa" possível pra elas — então nem entram na lista de formas
  // disponíveis. Todas as outras formas (Pix, cartões de cada bandeira,
  // boleto, promissória, transferência...) começam selecionadas.
  // Default: nenhuma forma marcada — a tela abre com as vendas em aberto
  // escondidas até o usuário escolher quais formas quer conferir.
  const [formasSelecionadas, setFormasSelecionadas] = useState([]);

  // Formas de pagamento distintas presentes nas vendas do CDS (exceto
  // dinheiro, que nunca aparece aqui). Vem do texto exato impresso no
  // relatório — "PIX RECIFE", "VISA ROT", "VISA ELECTRON", "MASTER PARC",
  // "BOLETO", "PROMISSÓRIA", transferências etc — então qualquer bandeira
  // ou variação nova aparece sozinha, sem precisar mexer em código.
  const formasDisponiveis = useMemo(() => {
    const set = new Set();
    vendas.forEach((v) => {
      if (v.campo !== 'dinheiro' && v.forma) set.add(v.forma);
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [vendas]);

  useEffect(() => {
    // Só removemos formas que já estavam marcadas e deixaram de existir na
    // lista atual — nunca marcamos nada sozinhos (o padrão é tudo
    // desmarcado até o usuário escolher).
    setFormasSelecionadas((prev) => prev.filter((f) => formasDisponiveis.includes(f)));
  }, [formasDisponiveis]);

  const todasFormasSelecionadas =
    formasDisponiveis.length > 0 && formasSelecionadas.length === formasDisponiveis.length;

  function toggleForma(forma) {
    setFormasSelecionadas((prev) =>
      prev.includes(forma) ? prev.filter((f) => f !== forma) : [...prev, forma]
    );
  }

  function toggleTodasFormas() {
    setFormasSelecionadas(todasFormasSelecionadas ? [] : formasDisponiveis);
  }

  const vinculoPorChave = useMemo(() => {
    const mapa = new Map();
    vinculos.forEach((v) => mapa.set(v.chave, v));
    return mapa;
  }, [vinculos]);

  // gastos/extrato_{lancamentoId} -> doc, pra achar rapidinho a categoria (se
  // houver) de cada débito do extrato.
  const gastoPorLancamentoId = useMemo(() => {
    const mapa = new Map();
    gastos.forEach((g) => {
      if (g.origem === 'extrato' && g.id?.startsWith('extrato_')) {
        mapa.set(g.id.slice('extrato_'.length), g);
      }
    });
    return mapa;
  }, [gastos]);

  // --- Limpeza dos 7 dias -------------------------------------------------
  // Baixas fechadas há mais de uma semana somem junto com as linhas que elas
  // conciliaram. Os dados que importam (venda, registro diário, extrato) já
  // estão nas outras coleções — aqui é só a fila de trabalho.
  // gera novos snapshots enquanto ela roda — sem essa trava, a mesma baixa
  // podia entrar em dois loops de limpeza ao mesmo tempo.
  const limpezaEmAndamento = useRef(false);
  useEffect(() => {
    const expiradas = baixas.filter((b) => baixaExpirada(b));
    if (!expiradas.length || limpezaEmAndamento.current) return;
    limpezaEmAndamento.current = true;
    (async () => {
      for (const b of expiradas) {
        for (const vid of b.vendaIds ?? []) {
          await deleteDoc(doc(db, 'filiais', filialId, 'pendenciasVendas', vid)).catch(() => {});
        }
        for (const lid of b.lancamentoIds ?? []) {
          await updateDoc(doc(db, 'filiais', filialId, 'extratoLancamentos', lid), {
            baixaId: null,
            arquivado: true,
          }).catch(() => {});
        }
        await deleteDoc(doc(db, 'filiais', filialId, 'baixas', b.id)).catch(() => {});
      }
    })().finally(() => {
      limpezaEmAndamento.current = false;
    });
  }, [baixas, filialId]);

  // Todas as vendas elegíveis (sem dinheiro), sem o filtro de chips — é
  // sobre este conjunto que a baixa automática trabalha, pra não deixar de
  // fechar uma venda só porque a chip dela estava desmarcada na tela.
  const vendasElegiveis = vendas.filter((v) => !v.baixaId && v.campo !== 'dinheiro');
  const formasAtivas = formasSelecionadas;
  // Recorte visual/manual: só as formas marcadas nas chips acima. Serve pra
  // facilitar a exibição e a baixa manual — filtrar, por exemplo, só Pix ou
  // só promissórias, pra conferir uma forma de cada vez. Nada marcado = nada
  // visível (estado padrão da tela).
  const vendasAbertasBase = vendasElegiveis
    .filter((v) => formasAtivas.includes(v.forma))
    .filter((v) => !filtroDataVendas || v.data === filtroDataVendas);
  const vendasAbertas = [...vendasAbertasBase].sort((a, b) =>
    ordemVendasAsc ? a.data.localeCompare(b.data) : b.data.localeCompare(a.data)
  );
  const lancamentosAbertos = lancamentos.filter(
    (l) => !l.baixaId && !l.arquivado && l.tipo === 'credito'
  );
  // Débitos do extrato: aparecem TODOS aqui, sem exceção — categorizado ou
  // não. Só os categorizados (têm uma categoria de gasto de verdade, não a
  // "A CATEGORIZAR" que entra sozinha na importação) entram na fila do
  // Aplicar Baixas; os demais ficam visíveis, mas parados, até você associar
  // um gasto na aba Extrato.
  const debitosAbertos = lancamentos.filter(
    (l) => !l.baixaId && !l.arquivado && l.tipo === 'debito'
  );
  // Créditos e débitos juntos, na mesma tabela — igual à disposição original
  // do Extrato — ordenados por data. A distinção entre os dois não é mais
  // "tabelas separadas", e sim a cor do valor (verde "+"/vermelho "-") e,
  // nas baixas fechadas mais abaixo, a cor do card inteiro.
  const extratoAberto = [...lancamentosAbertos, ...debitosAbertos]
    .filter((l) => !filtroDataExtrato || l.data === filtroDataExtrato)
    .sort((a, b) => {
    const porData = a.data.localeCompare(b.data);
    if (porData !== 0) return ordemExtratoAsc ? porData : -porData;
    // Mesmo dia: desempata pela ordem de aparição no extrato original (BB
    // exporta cronologicamente, hora a hora) — sem isso, dois lançamentos do
    // mesmo dia ficam na ordem arbitrária que o Firestore devolveu.
    const porSequencia = (a.sequencia ?? 0) - (b.sequencia ?? 0);
    return ordemExtratoAsc ? porSequencia : -porSequencia;
  });

  // Linhas do adquirente de cartão ativo (quando origemExtrato !== 'bb').
  // Mesma regra de filtro por data da coluna do extrato bancário.
  const cartaoAberto = extratoCartao
    .filter((c) => c.adquirente === origemExtrato && !c.baixaId)
    .filter((c) => !filtroDataExtrato || c.data === filtroDataExtrato)
    .sort((a, b) => (ordemExtratoAsc ? a.data.localeCompare(b.data) : b.data.localeCompare(a.data)));

  const ehExtratoCartao = origemExtrato !== 'bb';
  // Fonte "genérica" usada pela seleção manual e pelo aviso de diferença —
  // muda conforme a aba ativa, mas o resto do fluxo de baixa manual
  // (selLancamentos, diferencaSelecao, gravarBaixa) não precisa saber disso.
  const lancamentosParaSelecao = ehExtratoCartao ? cartaoAberto : lancamentosAbertos;

  const selecao = diferencaSelecao(
    vendasAbertas.filter((v) => selVendas.includes(v.id)),
    lancamentosParaSelecao.filter((l) => selLancamentos.includes(l.id))
  );

  function toggle(lista, setLista, id) {
    setAviso(null);
    setLista(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
  }

  // `colecaoLancamento`: em qual coleção do Firestore os lancamentoIds
  // vivem. 'extratoLancamentos' (extrato bancário, default) ou
  // 'extratoCartao' (linhas de maquininha) — os dois têm o mesmo formato de
  // referência (filiais/{filialId}/{colecao}/{id}), só muda o nome.
  async function gravarBaixa({
    vendaIds,
    lancamentoIds,
    automatica,
    resolucao = null,
    tipo = 'venda',
    colecaoLancamento = 'extratoLancamentos',
  }) {
    const fonteLancamentos = colecaoLancamento === 'extratoCartao' ? extratoCartao : lancamentos;
    const total =
      tipo === 'gasto'
        ? fonteLancamentos
            .filter((l) => lancamentoIds.includes(l.id))
            .reduce((s, l) => s + Number(l.valor || 0), 0)
        : vendas
            .filter((v) => vendaIds.includes(v.id))
            .reduce((s, v) => s + Number(v.valor || 0), 0);

    const ref = await addDoc(collection(db, 'filiais', filialId, 'baixas'), {
      vendaIds,
      lancamentoIds,
      automatica,
      total,
      resolucao,
      tipo,
      colecaoLancamento,
      fechadoEmMs: Date.now(),
      criadoEm: serverTimestamp(),
    });

    for (const id of vendaIds) {
      await updateDoc(doc(db, 'filiais', filialId, 'pendenciasVendas', id), { baixaId: ref.id });
    }
    for (const id of lancamentoIds) {
      await updateDoc(doc(db, 'filiais', filialId, colecaoLancamento, id), { baixaId: ref.id });
    }
    return ref.id;
  }

  // --- Baixa automática (extrato de maquininha: data+valor+bandeira) -----
  async function aplicarBaixasCartao() {
    setProcessando(true);
    setAviso(null);
    try {
      const { pares, motivos } = casarAutomaticoCartao(vendasElegiveis, cartaoAberto);

      for (const par of pares) {
        await gravarBaixa({
          vendaIds: [par.venda.id],
          lancamentoIds: [par.lancamento.id],
          automatica: true,
          tipo: 'venda',
          colecaoLancamento: 'extratoCartao',
        });
      }

      const pendentes =
        motivos.formaNaoIdentificada + motivos.semLancamentoCorrespondente + motivos.ambiguo;
      setAviso(
        pares.length === 0
          ? `Nenhuma baixa segura encontrada. ${pendentes} pagamento(s) continuam pendentes ` +
              `(${motivos.semLancamentoCorrespondente} sem lançamento de mesma data/valor/bandeira, ${motivos.ambiguo} ambíguo(s)).`
          : `${pares.length} venda(s) fechada(s) automaticamente contra o extrato da ${
              FONTES_EXTRATO.find((f) => f.id === origemExtrato)?.label ?? origemExtrato
            }. ${pendentes} pagamento(s) ficaram pendentes para conferência manual.`
      );
    } finally {
      setProcessando(false);
    }
  }

  // --- Baixa automática (extrato bancário: nome+valor) --------------------
  async function aplicarBaixas() {
    if (ehExtratoCartao) return aplicarBaixasCartao();
    setProcessando(true);
    setAviso(null);
    try {
      const { pares, motivos } = casarAutomatico(
        vendasElegiveis,
        lancamentosAbertos,
        vinculoPorChave
      );

      for (const par of pares) {
        await gravarBaixa({
          vendaIds: [par.venda.id],
          lancamentoIds: [par.lancamento.id],
          automatica: true,
          tipo: 'venda',
        });
      }

      // Débitos já categorizados (tipo de gasto de verdade, não "A
      // CATEGORIZAR") se auto-baixam sozinhos — não precisam de par do lado
      // do CDS, a categoria já é a "prova" de que aquele dinheiro tem
      // destino conhecido. Ficam vermelhos lá embaixo, pra diferenciar de
      // venda fechada (verde) à primeira vista.
      const debitosCategorizados = debitosAbertos.filter((l) => {
        const gasto = gastoPorLancamentoId.get(l.id);
        return gasto && gasto.categoria && gasto.categoria !== CATEGORIA_PENDENTE;
      });
      for (const l of debitosCategorizados) {
        await gravarBaixa({
          vendaIds: [],
          lancamentoIds: [l.id],
          automatica: true,
          tipo: 'gasto',
        });
      }

      const pendentes =
        motivos.semVinculo + motivos.semVendaCorrespondente + motivos.ambiguo;
      const totalFechado = pares.length + debitosCategorizados.length;
      setAviso(
        totalFechado === 0
          ? `Nenhuma baixa segura encontrada. ${pendentes} pagamento(s) continuam pendentes ` +
              `(${motivos.semVinculo} sem cliente associado, ${motivos.semVendaCorrespondente} sem venda de mesmo nome e valor, ${motivos.ambiguo} ambíguo(s)).`
          : `${pares.length} venda(s) e ${debitosCategorizados.length} gasto(s) fechados automaticamente. ${pendentes} pagamento(s) de venda ficaram pendentes para conferência manual.`
      );
    } finally {
      setProcessando(false);
    }
  }

  // --- Baixa manual -------------------------------------------------------
  function iniciarBaixaManual() {
    if (!selVendas.length || !selLancamentos.length) {
      setAviso('Selecione pelo menos uma venda no CDS e um pagamento no extrato.');
      return;
    }
    if (selecao.bate) {
      confirmarBaixaManual(null);
      return;
    }
    setResolvendo(selecao);
  }

  async function confirmarBaixaManual(resolucao) {
    setProcessando(true);
    try {
      const vendasSelecionadas = vendas.filter((v) => selVendas.includes(v.id));
      await gravarBaixa({
        vendaIds: [...selVendas],
        lancamentoIds: [...selLancamentos],
        automatica: false,
        resolucao,
        colecaoLancamento: ehExtratoCartao ? 'extratoCartao' : 'extratoLancamentos',
      });
      // "Abater dívida": a diferença que faltou não é só anotada na baixa —
      // vira uma venda nova, pendente, forma PROMISSÓRIA, no nome do cliente
      // da própria venda selecionada. Ela entra na fila do CDS normalmente,
      // pronta pra ser conciliada (ou forçada) quando o cliente pagar.
      if (resolucao?.tipo === 'abater-divida') {
        const clienteNome = vendasSelecionadas[0]?.clienteNome ?? '';
        const hoje = hojeISO();
        const sufixo = `promissoria_${Date.now()}`;
        await setDoc(doc(db, 'filiais', filialId, 'pendenciasVendas', `${hoje}_${sufixo}`), {
          data: hoje,
          numeroVenda: '',
          clienteNome,
          valor: Math.abs(resolucao.valor),
          forma: 'PROMISSÓRIA',
          campo: 'promissoria',
          origem: 'abater-divida-automatica',
          criadoEm: serverTimestamp(),
        });
      }
      setSelVendas([]);
      setSelLancamentos([]);
      setResolvendo(null);
      setAviso(null);
    } finally {
      setProcessando(false);
    }
  }


  // Mesmo vínculo conta -> cliente usado na aba Extrato (mesma coleção,
  // mesmo formato de doc) — associar por aqui evita ter que voltar pro
  // Extrato só pra isso.
  async function salvarVinculoClientePendencias(lancamento, cliente) {
    const chave = lancamento.chaveContraparte;
    if (!chave) return;
    await setDoc(doc(db, 'filiais', filialId, 'vinculosBancarios', idVinculo(chave)), {
      chave,
      banco: lancamento.banco ?? 'bb',
      documento: lancamento.contraparteDocumento ?? '',
      nomeNaConta: lancamento.contraparteNome ?? '',
      clienteId: cliente.id,
      clienteNome: cliente.nome,
      criadoEm: serverTimestamp(),
    });
    setAssociandoCliente(null);
  }

  // Mesma gravação que a aba Extrato faz pra "Associar gasto" — mesmas
  // coleções (`vinculosGastoBancarios` e `gastos/extrato_{id}`), só que
  // disparada por aqui, pra não ter que voltar pro Extrato só pra isso.
  async function salvarVinculoGastoPendencias(lancamento, escolha) {
    const chave = lancamento.chaveContraparte;
    // Mesmo fix do Extrato: sem isso o valor novo digitado aqui nunca virava
    // sugestão pra próxima vez, só ficava gravado neste gasto.
    if (escolha.tipoLista) {
      await salvarNaListaAuxiliar(filialId, escolha.tipoLista, escolha.extra);
    }
    const vinculoDoc = {
      chave: chave || `lancamento:${lancamento.id}`,
      categoria: escolha.categoria,
      ...(escolha.funcionarioId
        ? { funcionarioId: escolha.funcionarioId, funcionarioNome: escolha.extra }
        : {}),
      ...(escolha.tipoLista === 'distribuidoras' ? { distribuidora: escolha.extra } : {}),
      ...(escolha.tipoLista === 'tiposImposto' ? { tipoImposto: escolha.extra } : {}),
      criadoEm: serverTimestamp(),
    };
    if (chave) {
      await setDoc(doc(db, 'filiais', filialId, 'vinculosGastoBancarios', idVinculoGasto(chave)), vinculoDoc);
    }
    await setDoc(
      doc(db, 'filiais', filialId, 'gastos', `extrato_${lancamento.id}`),
      {
        data: lancamento.data,
        categoria: escolha.categoria,
        valor: lancamento.valor,
        descricao: lancamento.contraparteNome || lancamento.historico,
        origem: 'extrato',
        chaveContraparte: chave ?? '',
        ...(escolha.funcionarioId
          ? { funcionarioId: escolha.funcionarioId, funcionarioNome: escolha.extra }
          : { funcionarioId: null, funcionarioNome: null }),
        ...(escolha.tipoLista === 'distribuidoras' ? { distribuidora: escolha.extra } : { distribuidora: null }),
        ...(escolha.tipoLista === 'tiposImposto' ? { tipoImposto: escolha.extra } : { tipoImposto: null }),
      },
      { merge: true }
    );
    setAssociandoGasto(null);
  }

  // --- Poda de inconsistências --------------------------------------------
  // Diferente do "Forçar Conciliar" (1 pagamento, precisa de cliente
  // associado, pra dados que o sistema NUNCA teve como reconhecer sozinho):
  // a poda aceita qualquer combinação de vendas e/ou lançamentos marcados no
  // modo lápis, sem nenhuma exigência, só pra fechar de vez pendências
  // antigas que ficaram travadas por causa de alguma melhoria parcial feita
  // depois que aqueles dados já existiam.
  function toggleSelecionarTodasPoda() {
    const todasMarcadas =
      selPodaVendas.length === vendasAbertas.length &&
      selPodaLancamentos.length === lancamentosAbertos.length &&
      (vendasAbertas.length > 0 || lancamentosAbertos.length > 0);
    if (todasMarcadas) {
      setSelPodaVendas([]);
      setSelPodaLancamentos([]);
    } else {
      setSelPodaVendas(vendasAbertas.map((v) => v.id));
      setSelPodaLancamentos(lancamentosAbertos.map((l) => l.id));
    }
  }

  async function confirmarPoda(justificativa) {
    setPodando(true);
    try {
      const totalVendasPoda = vendas
        .filter((v) => selPodaVendas.includes(v.id))
        .reduce((s, v) => s + Number(v.valor || 0), 0);
      const totalLancPoda = lancamentos
        .filter((l) => selPodaLancamentos.includes(l.id))
        .reduce((s, l) => s + Number(l.valor || 0), 0);
      const ref = await addDoc(collection(db, 'filiais', filialId, 'baixas'), {
        vendaIds: [...selPodaVendas],
        lancamentoIds: [...selPodaLancamentos],
        automatica: false,
        forcada: true,
        poda: true,
        justificativa,
        total: totalVendasPoda || totalLancPoda,
        resolucao: null,
        tipo: 'venda',
        fechadoEmMs: Date.now(),
        criadoEm: serverTimestamp(),
      });
      for (const id of selPodaVendas) {
        await updateDoc(doc(db, 'filiais', filialId, 'pendenciasVendas', id), { baixaId: ref.id });
      }
      for (const id of selPodaLancamentos) {
        await updateDoc(doc(db, 'filiais', filialId, 'extratoLancamentos', id), { baixaId: ref.id });
      }
      setSelPodaVendas([]);
      setSelPodaLancamentos([]);
      setModoPoda(false);
      setPodaModalAberto(false);
    } finally {
      setPodando(false);
    }
  }


  // CDS (dado antigo, já reconciliado na prática antes desta tela existir).
  // Exige cliente associado — sem isso o botão fica cinza no menu — e uma
  // justificativa obrigatória, que fica registrada na própria baixa e
  // aparece no lugar da venda, do lado do CDS, na lista de conciliadas.
  async function confirmarForcarConciliar(lancamento, justificativa) {
    const vinculo = vinculoPorChave.get(lancamento.chaveContraparte);
    if (!vinculo) return; // segurança extra: nunca força sem cliente associado
    setProcessando(true);
    try {
      const ref = await addDoc(collection(db, 'filiais', filialId, 'baixas'), {
        vendaIds: [],
        lancamentoIds: [lancamento.id],
        automatica: false,
        forcada: true,
        justificativa,
        clienteId: vinculo.clienteId,
        clienteNome: vinculo.clienteNome,
        formaPagamento: abreviarFormaPagamento(lancamento.historico) || 'OUTRA',
        total: lancamento.valor,
        resolucao: null,
        tipo: 'venda',
        fechadoEmMs: Date.now(),
        criadoEm: serverTimestamp(),
      });
      await updateDoc(doc(db, 'filiais', filialId, 'extratoLancamentos', lancamento.id), {
        baixaId: ref.id,
      });
      setForcandoConciliar(null);
    } finally {
      setProcessando(false);
    }
  }


  return (
    <div className="pend">
      <div className="pend__header">
        <h2 className="pend__titulo">Pendências</h2>
        {!ehExtratoCartao && (
          <button
            type="button"
            className={`pend__lapis ${modoPoda ? 'is-active' : ''}`}
            title={
              modoPoda
                ? 'Sair do modo de poda de inconsistências'
                : 'Podar inconsistências antigas (dados já baixados que não são mais reconhecidos)'
            }
            onClick={() => {
              setModoPoda((v) => !v);
              setSelPodaVendas([]);
              setSelPodaLancamentos([]);
            }}
          >
            ✎
          </button>
        )}
      </div>

      {modoPoda && (
        <div className="pend__poda-barra">
          <span>
            Modo poda: marque linhas nas duas tabelas abaixo, de qualquer forma — não precisa
            bater cliente, nome ou valor. Serve só para fechar dados antigos que ficaram
            travados por causa de melhorias parciais no projeto.
          </span>
          <button type="button" className="pend__lapis-todas" onClick={toggleSelecionarTodasPoda}>
            {selPodaVendas.length === vendasAbertas.length &&
            selPodaLancamentos.length === lancamentosAbertos.length &&
            (vendasAbertas.length > 0 || lancamentosAbertos.length > 0)
              ? 'Deselecionar todas'
              : 'Selecionar todas'}
          </button>
        </div>
      )}

      <div className="pend__toolbar">
        <div className="pend__formas">
          <button
            type="button"
            className="pend__forma-chip pend__forma-chip--all"
            onClick={toggleTodasFormas}
          >
            {todasFormasSelecionadas ? 'Deselecionar todas' : 'Selecionar todas'}
          </button>
          {formasDisponiveis.map((forma) => (
            <button
              key={forma}
              type="button"
              className={`pend__forma-chip ${formasAtivas.includes(forma) ? 'is-active' : ''}`}
              onClick={() => toggleForma(forma)}
            >
              {forma}
            </button>
          ))}
          {formasDisponiveis.length === 0 && (
            <span className="pend__formas-empty">Nenhuma venda importada ainda.</span>
          )}
        </div>
        <span className="pend__contagem">
          {ehExtratoCartao
            ? `${vendasAbertas.length} venda(s) e ${cartaoAberto.length} lançamento(s) da ${
                FONTES_EXTRATO.find((f) => f.id === origemExtrato)?.label
              } em aberto`
            : `${vendasAbertas.length} venda(s) e ${extratoAberto.length} lançamento(s) de extrato em ` +
              `aberto (${lancamentosAbertos.length} pagamento(s), ${debitosAbertos.length} gasto(s))`}
        </span>
      </div>

      <div className="pend__grid">
        <section className="pend__col">
          <div className="pend__col-header">
            <h3 className="pend__col-title">CDS — vendas</h3>
            <label className="pend__filtro-data pend__filtro-data--col">
              <input
                type="date"
                value={filtroDataVendas}
                onChange={(e) => setFiltroDataVendas(e.target.value)}
              />
              {filtroDataVendas && (
                <button
                  type="button"
                  className="pend__filtro-data-limpar"
                  onClick={() => setFiltroDataVendas('')}
                  title="Ver vendas de todas as datas"
                >
                  Ver todas
                </button>
              )}
            </label>
          </div>
          <div className="pend__col-scroll">
          <table className="crud-tab__table pend__table">
            <thead>
              <tr>
                {modoPoda && <th className="pend__poda-col" />}
                <th>
                  Data{' '}
                  <SetaOrdem
                    asc={ordemVendasAsc}
                    onClick={() => setOrdemVendasAsc((v) => !v)}
                    titulo="Inverter ordem desta tabela"
                  />
                </th>
                <th>Venda</th>
                <th>Cliente</th>
                <th>Tipo</th>
                <th className="extrato__num">Valor</th>
              </tr>
            </thead>
            <tbody>
              {vendasAbertas.map((v) => (
                <tr
                  key={v.id}
                  className={selVendas.includes(v.id) ? 'is-selected' : ''}
                  onClick={() => {
                    if (modoPoda) toggle(selPodaVendas, setSelPodaVendas, v.id);
                    else toggle(selVendas, setSelVendas, v.id);
                  }}
                >
                  {modoPoda && (
                    <td className="pend__poda-col" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selPodaVendas.includes(v.id)}
                        onChange={() => toggle(selPodaVendas, setSelPodaVendas, v.id)}
                      />
                    </td>
                  )}
                  <td>{formatarData(v.data)}</td>
                  <td>{v.numeroVenda || '—'}</td>
                  <td>{v.clienteNome}</td>
                  <td className="pend__forma">{v.forma}</td>
                  <td className="extrato__num">{currency.format(v.valor)}</td>
                </tr>
              ))}
              {vendasAbertas.length === 0 && (
                <tr>
                  <td colSpan={modoPoda ? 6 : 5} className="crud-tab__empty">
                    Nenhuma venda pendente. Importe um Caixa Diário na aba Vendas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </section>

        <section className="pend__col">
          <div className="pend__col-header">
            <h3 className="pend__col-title">
              Extrato —{' '}
              <span className="pend__fonte-extrato">
                {FONTES_EXTRATO.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={
                      'pend__fonte-extrato-btn' + (origemExtrato === f.id ? ' is-active' : '')
                    }
                    onClick={() => {
                      setOrigemExtrato(f.id);
                      setSelLancamentos([]);
                      setAviso(null);
                      if (f.id !== 'bb') setModoPoda(false);
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </span>
            </h3>
            <label className="pend__filtro-data pend__filtro-data--col">
              <input
                type="date"
                value={filtroDataExtrato}
                onChange={(e) => setFiltroDataExtrato(e.target.value)}
              />
              {filtroDataExtrato && (
                <button
                  type="button"
                  className="pend__filtro-data-limpar"
                  onClick={() => setFiltroDataExtrato('')}
                  title="Ver lançamentos de todas as datas"
                >
                  Ver todas
                </button>
              )}
            </label>
          </div>
          <div className="pend__col-scroll">
          {ehExtratoCartao ? (
          <table className="crud-tab__table pend__table">
            <thead>
              <tr>
                <th>
                  Data{' '}
                  <SetaOrdem
                    asc={ordemExtratoAsc}
                    onClick={() => setOrdemExtratoAsc((v) => !v)}
                    titulo="Inverter ordem desta tabela"
                  />
                </th>
                <th>Bandeira</th>
                <th>Parcelas</th>
                <th className="extrato__num">Valor</th>
              </tr>
            </thead>
            <tbody>
              {cartaoAberto.map((c) => (
                <tr
                  key={c.id}
                  className={selLancamentos.includes(c.id) ? 'is-selected' : ''}
                  onClick={() => toggle(selLancamentos, setSelLancamentos, c.id)}
                >
                  <td>{formatarData(c.data)}</td>
                  <td>{c.bandeira}</td>
                  <td>{c.parcelas > 1 ? `${c.parcelas}x` : 'à vista'}</td>
                  <td className="extrato__num extrato__valor--credito">
                    + {currency.format(c.valor)}
                  </td>
                </tr>
              ))}
              {cartaoAberto.length === 0 && (
                <tr>
                  <td colSpan={4} className="crud-tab__empty">
                    Nenhum lançamento pendente. Importe o extrato da{' '}
                    {FONTES_EXTRATO.find((f) => f.id === origemExtrato)?.label} na aba Extrato.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          ) : (
          <table className="crud-tab__table pend__table">
            <thead>
              <tr>
                {modoPoda && <th className="pend__poda-col" />}
                <th>
                  Data{' '}
                  <SetaOrdem
                    asc={ordemExtratoAsc}
                    onClick={() => setOrdemExtratoAsc((v) => !v)}
                    titulo="Inverter ordem desta tabela"
                  />
                </th>
                <th>Conta / histórico</th>
                <th className="pend__forma-col" title="Forma de pagamento">
                  Forma
                </th>
                <th>Cliente / categoria</th>
                <th className="extrato__num">Valor</th>
              </tr>
            </thead>
            <tbody>
              {extratoAberto.map((l) => {
                if (l.tipo === 'credito') {
                  const v = vinculoPorChave.get(l.chaveContraparte);
                  return (
                    <tr
                      key={l.id}
                      className={selLancamentos.includes(l.id) ? 'is-selected' : ''}
                      onClick={() => {
                        if (modoPoda) toggle(selPodaLancamentos, setSelPodaLancamentos, l.id);
                        else toggle(selLancamentos, setSelLancamentos, l.id);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setMenuExtrato({ x: e.clientX, y: e.clientY, lancamento: l, vinculo: v });
                      }}
                    >
                      {modoPoda && (
                        <td className="pend__poda-col" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selPodaLancamentos.includes(l.id)}
                            onChange={() => toggle(selPodaLancamentos, setSelPodaLancamentos, l.id)}
                          />
                        </td>
                      )}
                      <td>{formatarData(l.data)}</td>
                      <td>
                        {l.contraparteNome || <span className="extrato__vazio">(não identificado)</span>}
                      </td>
                      <td className="pend__forma-col">{abreviarFormaPagamento(l.historico)}</td>
                      <td>
                        {v ? (
                          <span className="extrato__cliente">{v.clienteNome}</span>
                        ) : (
                          <span className="extrato__vazio">sem associação</span>
                        )}
                      </td>
                      <td className="extrato__num extrato__valor--credito">
                        + {currency.format(l.valor)}
                      </td>
                    </tr>
                  );
                }
                // Débito: nunca selecionável pra baixa manual (não pareia com
                // venda) — só mostra se já tem categoria, pra você saber se
                // "Aplicar Baixas" vai conseguir fechá-lo sozinho ou não.
                // Continua fora da seleção de poda (poda é só CDS <-> crédito
                // do extrato); mas ganha o mesmo botão direito que já existe
                // na aba Extrato pra categorizar sem precisar sair daqui.
                const gasto = gastoPorLancamentoId.get(l.id);
                const categorizado = gasto && gasto.categoria && gasto.categoria !== CATEGORIA_PENDENTE;
                return (
                  <tr
                    key={l.id}
                    className="pend__linha-gasto"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenuExtrato({ x: e.clientX, y: e.clientY, lancamento: l });
                    }}
                  >
                    {modoPoda && <td className="pend__poda-col" />}
                    <td>{formatarData(l.data)}</td>
                    <td>{l.contraparteNome || l.historico}</td>
                    <td className="pend__forma-col">{abreviarFormaPagamento(l.historico)}</td>
                    <td>
                      {categorizado ? (
                        <span className="pend__categoria-ok">
                          {gasto.categoria}
                          {gasto.funcionarioNome || gasto.distribuidora || gasto.tipoImposto
                            ? ` · ${gasto.funcionarioNome ?? gasto.distribuidora ?? gasto.tipoImposto}`
                            : ''}
                        </span>
                      ) : (
                        <span className="extrato__vazio">a categorizar (botão direito aqui)</span>
                      )}
                    </td>
                    <td className="extrato__num extrato__valor--debito">
                      - {currency.format(l.valor)}
                    </td>
                  </tr>
                );
              })}
              {extratoAberto.length === 0 && (
                <tr>
                  <td colSpan={modoPoda ? 6 : 5} className="crud-tab__empty">
                    Nenhum lançamento pendente. Importe o extrato na aba Extrato.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          )}
          </div>
        </section>
      </div>

      {modoPoda && (selPodaVendas.length > 0 || selPodaLancamentos.length > 0) && (
        <div className="pend__acoes">
          <div className="pend__selecao is-poda">
            <span>
              {selPodaVendas.length} venda(s) e {selPodaLancamentos.length} lançamento(s)
              marcados pra poda
            </span>
            <button
              type="button"
              className="pend__limpar"
              onClick={() => {
                setSelPodaVendas([]);
                setSelPodaLancamentos([]);
              }}
            >
              Limpar seleção
            </button>
          </div>
          <div className="pend__botoes">
            <button type="button" className="pend__primario is-poda" onClick={() => setPodaModalAberto(true)}>
              Podar selecionadas
            </button>
          </div>
        </div>
      )}

      <div className="pend__acoes">
        {(selVendas.length > 0 || selLancamentos.length > 0) && (
          <div className={`pend__selecao ${selecao.bate ? 'is-ok' : 'is-diff'}`}>
            <span>
              CDS {currency.format(selecao.totalVendas)} · Extrato{' '}
              {currency.format(selecao.totalPagos)}
            </span>
            {selecao.bate ? (
              <strong>valores batem</strong>
            ) : (
              <strong>
                diferença de {currency.format(Math.abs(selecao.diferenca))}{' '}
                {selecao.diferenca > 0 ? '(falta receber)' : '(recebido a mais)'}
              </strong>
            )}
            <button
              type="button"
              className="pend__limpar"
              onClick={() => {
                setSelVendas([]);
                setSelLancamentos([]);
              }}
            >
              Limpar seleção
            </button>
          </div>
        )}

        <div className="pend__botoes">
          <button
            type="button"
            className="pend__primario"
            onClick={aplicarBaixas}
            disabled={processando}
          >
            {processando ? 'Processando…' : 'Aplicar Baixas'}
          </button>
          <button
            type="button"
            className="pend__secundario"
            onClick={iniciarBaixaManual}
            disabled={processando || (!selVendas.length && !selLancamentos.length)}
          >
            Dar baixa na seleção
          </button>
        </div>

        {aviso && <p className="pend__aviso">{aviso}</p>}
      </div>

      <p className="crud-tab__note">
        A baixa automática de vendas só fecha par 1:1: um pagamento de uma conta associada a um
        cliente, com nome <strong>exatamente igual</strong> ao da venda no CDS (vale também para
        promissória) e valor <strong>exatamente igual</strong>. Qualquer outra situação — conta
        sem cliente, nome parecido mas diferente, um centavo de diferença, duas vendas candidatas
        — fica pendente de propósito, para você fechar na mão. Pagamento parcial, vários Pix
        para uma venda ou um Pix para várias vendas: selecione as linhas dos dois lados e use
        "Dar baixa na seleção". Gastos (débitos do extrato) fecham sozinhos assim que têm uma
        categoria associada — não precisam de par do lado do CDS. O histórico de baixas
        conciliadas (e a opção de restaurar) ficou na aba Fechamentos.
      </p>

      {resolvendo && (
        <ResolverDiferencaModal
          selecao={resolvendo}
          onCancel={() => setResolvendo(null)}
          onConfirm={(resolucao) => confirmarBaixaManual(resolucao)}
        />
      )}

      {menuExtrato && (
        <ContextMenu
          x={menuExtrato.x}
          y={menuExtrato.y}
          onClose={() => setMenuExtrato(null)}
          itens={
            menuExtrato.lancamento.tipo === 'credito'
              ? [
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
                ]
              : [
                  {
                    label: 'Associar gasto',
                    onClick: () => setAssociandoGasto(menuExtrato.lancamento),
                  },
                ]
          }
        />
      )}

      {associandoCliente && (
        <AssociarClientePendenciasModal
          lancamento={associandoCliente}
          clientes={clientes}
          vinculoAtual={vinculoPorChave.get(associandoCliente.chaveContraparte)}
          onCancel={() => setAssociandoCliente(null)}
          onConfirm={(cliente) => salvarVinculoClientePendencias(associandoCliente, cliente)}
        />
      )}

      {forcandoConciliar && (
        <ForcarConciliarModal
          lancamento={forcandoConciliar}
          onCancel={() => setForcandoConciliar(null)}
          onConfirm={(justificativa) => confirmarForcarConciliar(forcandoConciliar, justificativa)}
          processando={processando}
        />
      )}

      {associandoGasto && (
        <AssociarGastoModal
          filialId={filialId}
          lancamento={associandoGasto}
          vinculoAtual={undefined}
          onCancel={() => setAssociandoGasto(null)}
          onConfirm={(escolha) => salvarVinculoGastoPendencias(associandoGasto, escolha)}
        />
      )}

      {podaModalAberto && (
        <PodarModal
          quantidadeVendas={selPodaVendas.length}
          quantidadeLancamentos={selPodaLancamentos.length}
          onCancel={() => setPodaModalAberto(false)}
          onConfirm={(justificativa) => confirmarPoda(justificativa)}
          processando={podando}
        />
      )}
    </div>
  );
}

