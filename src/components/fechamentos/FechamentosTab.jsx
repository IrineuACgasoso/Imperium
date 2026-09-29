// Aba Fechamentos: histórico de baixas (vendas/pagamentos já conciliados).
//
// Ao contrário de todo o resto do app, a BUSCA em si não assina a coleção
// `baixas` em tempo real — ela só existe pra CONSULTA esporádica de um
// histórico, então rodar o filtro não deveria virar um listener vivo. O
// usuário escolhe o intervalo de datas (obrigatório) e, opcionalmente, uma
// forma de pagamento; só ao confirmar é que rodamos uma única `getDocs`
// sobre `baixas`, limitada pelo intervalo.
//
// As opções do select de forma de pagamento, porém, usam a mesma fonte "ao
// vivo" que o resto do app (`useFilialCollection`) — é a mesma coleção que
// Pendências e Vendas já mantêm assinada o tempo todo, então não custa
// leitura extra nenhuma aqui, e o campo fica igual a todo formulário do
// sistema (select, não texto livre).

import { useCallback, useMemo, useState } from 'react';
import { collection, query, where, orderBy, getDocs, documentId } from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import { useFilialCollection } from '../../hooks/useFilialCollection.js';
import { restaurarBaixa } from '../../data/baixas.js';
import { CARTAO_EM_ABERTO, VENDAS_EM_ABERTO } from '../../data/filtrosAbertos.js';
import FirebaseGate from '../layout/FirebaseGate.jsx';
import Combobox from '../common/Combobox.jsx';
import { currency, hojeISO } from '../pendencias/utils.js';
import BaixaCard from './BaixaCard.jsx';
import '../../shared/CrudTab.css';
import '../pendencias/styles/acoes.css';
import './FechamentosTab.css';

// `where(documentId(), 'in', ...)` aceita até 30 ids por consulta: 1 ida ao
// servidor por 30 docs, em vez de 1 getDoc por documento.
const TAM_IN = 30;

async function buscarDocs(filialId, colecao, ids) {
  const unicos = [...new Set(ids)];
  const mapa = new Map();
  const grupos = [];
  for (let i = 0; i < unicos.length; i += TAM_IN) grupos.push(unicos.slice(i, i + TAM_IN));
  await Promise.all(
    grupos.map(async (grupo) => {
      const snap = await getDocs(
        query(collection(db, 'filiais', filialId, colecao), where(documentId(), 'in', grupo))
      );
      snap.forEach((d) => mapa.set(d.id, { id: d.id, ...d.data() }));
    })
  );
  return mapa;
}

export default function FechamentosTab({ filialId }) {
  return (
    <FirebaseGate>
      <FechamentosTabInner filialId={filialId} />
    </FirebaseGate>
  );
}

function FechamentosTabInner({ filialId }) {
  // Só pra popular o select de forma de pagamento — mesma coleção que
  // Pendências já mantém assinada, então isto reaproveita o cache do hook
  // em vez de abrir uma segunda leitura.
  // Mesmas consultas filtradas de Pendências (compartilham o listener).
  // Limitação: formas/bandeiras que só existem em itens já baixados não
  // aparecem neste select.
  const { items: vendas } = useFilialCollection(filialId, 'pendenciasVendas', null, VENDAS_EM_ABERTO);
  const { items: extratoCartao } = useFilialCollection(
    filialId,
    'extratoCartao',
    null,
    CARTAO_EM_ABERTO
  );

  const formasDisponiveis = useMemo(() => {
    const set = new Set();
    vendas.forEach((v) => {
      if (v.campo !== 'dinheiro' && v.forma) set.add(v.forma);
    });
    extratoCartao.forEach((c) => {
      if (c.bandeira) set.add(c.bandeira);
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [vendas, extratoCartao]);

  const [inicio, setInicio] = useState(hojeISO());
  const [fim, setFim] = useState(hojeISO());
  const [forma, setForma] = useState('');

  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const [resultado, setResultado] = useState(null); // { baixas, vendasPorId, lancamentosPorId } | null
  const [restaurandoId, setRestaurandoId] = useState(null);

  async function buscar() {
    if (!inicio || !fim) {
      setErro('Escolha o intervalo de datas.');
      return;
    }
    if (inicio > fim) {
      setErro('A data inicial não pode ser depois da data final.');
      return;
    }

    setCarregando(true);
    setErro(null);
    setResultado(null);
    try {
      const inicioMs = new Date(`${inicio}T00:00:00`).getTime();
      const fimMs = new Date(`${fim}T23:59:59.999`).getTime();

      const q = query(
        collection(db, 'filiais', filialId, 'baixas'),
        where('fechadoEmMs', '>=', inicioMs),
        where('fechadoEmMs', '<=', fimMs),
        orderBy('fechadoEmMs', 'desc')
      );
      const snap = await getDocs(q);
      let baixasEncontradas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const todosVendaIds = baixasEncontradas.flatMap((b) => b.vendaIds ?? []);
      const idsBancarios = baixasEncontradas
        .filter((b) => (b.colecaoLancamento ?? 'extratoLancamentos') === 'extratoLancamentos')
        .flatMap((b) => b.lancamentoIds ?? []);
      const idsCartao = baixasEncontradas
        .filter((b) => b.colecaoLancamento === 'extratoCartao')
        .flatMap((b) => b.lancamentoIds ?? []);

      const [vendasPorId, bancariosPorId, cartaoPorId] = await Promise.all([
        buscarDocs(filialId, 'pendenciasVendas', todosVendaIds),
        buscarDocs(filialId, 'extratoLancamentos', idsBancarios),
        buscarDocs(filialId, 'extratoCartao', idsCartao),
      ]);
      const lancamentosPorId = new Map([...bancariosPorId, ...cartaoPorId]);

      if (forma) {
        baixasEncontradas = baixasEncontradas.filter((b) => {
          const formasDaBaixa = (b.vendaIds ?? []).map((id) => vendasPorId.get(id)?.forma);
          const bandeirasDaBaixa = (b.lancamentoIds ?? []).map(
            (id) => lancamentosPorId.get(id)?.bandeira
          );
          return [...formasDaBaixa, ...bandeirasDaBaixa].some(
            (f) => f && f.toUpperCase() === forma.toUpperCase()
          );
        });
      }

      setResultado({ baixas: baixasEncontradas, vendasPorId, lancamentosPorId });
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }

  const handleRestaurar = useCallback(async (baixa) => {
    setRestaurandoId(baixa.id);
    try {
      const ok = await restaurarBaixa(filialId, baixa);
      if (ok) {
        setResultado((r) => (r ? { ...r, baixas: r.baixas.filter((b) => b.id !== baixa.id) } : r));
      }
    } finally {
      setRestaurandoId(null);
    }
  }, [filialId]);

  // Arrays estáveis por baixa: sem isto o memo do BaixaCard nunca acerta.
  const cards = useMemo(
    () =>
      (resultado?.baixas ?? []).map((b) => ({
        baixa: b,
        vendas: (b.vendaIds ?? []).map((id) => resultado.vendasPorId.get(id)).filter(Boolean),
        lancamentos: (b.lancamentoIds ?? [])
          .map((id) => resultado.lancamentosPorId.get(id))
          .filter(Boolean),
      })),
    [resultado]
  );

  const totalPeriodo = resultado?.baixas.reduce((s, b) => s + Number(b.total || 0), 0) ?? 0;

  return (
    <div className="fech">
      <div className="fech__filtros">
        <label className="fech__campo">
          De
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </label>
        <label className="fech__campo">
          Até
          <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
        </label>
        <label className="fech__campo fech__campo--forma">
          Forma de pagamento (opcional)
          <Combobox
            value={forma}
            onChange={(v) => setForma(v)}
            options={[{ value: '', label: 'Todas as formas' }, ...formasDisponiveis.map((f) => ({ value: f, label: f }))]}
            placeholder="Todas as formas"
            allowFree={false}
            minWidth={220}
          />
        </label>
        <button type="button" className="pdf-import__confirm" onClick={buscar} disabled={carregando}>
          {carregando ? 'Buscando…' : 'Buscar fechamentos'}
        </button>
      </div>

      {erro && <p className="pdf-import__error">{erro}</p>}

      {resultado && (
        <>
          <p className="crud-tab__note">
            {resultado.baixas.length} fechamento(s) no período · total {currency.format(totalPeriodo)}
          </p>

          <div className="fech__lista-baixas">
            {cards.map(({ baixa, vendas, lancamentos }) => (
              <BaixaCard
                key={baixa.id}
                baixa={baixa}
                vendas={vendas}
                lancamentos={lancamentos}
                restaurando={restaurandoId === baixa.id}
                onRestaurar={handleRestaurar}
              />
            ))}
          </div>

          {resultado.baixas.length === 0 && (
            <p className="crud-tab__empty">Nenhum fechamento encontrado com esses filtros.</p>
          )}
        </>
      )}

      {!resultado && !carregando && (
        <p className="crud-tab__note">
          Escolha o período (e, se quiser, uma forma de pagamento) e clique em "Buscar fechamentos".
        </p>
      )}
    </div>
  );
}
