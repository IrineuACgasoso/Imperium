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

import { useMemo, useState } from 'react';
import { collection, query, where, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import { useFilialCollection } from '../../hooks/useFilialCollection.js';
import { restaurarBaixa } from '../../data/baixas.js';
import FirebaseGate from '../layout/FirebaseGate.jsx';
import Combobox from '../common/Combobox.jsx';
import { currency, formatarData } from '../pendencias/utils.js';
import '../../shared/CrudTab.css';
import '../extrato/ExtratoTab.css';
import '../pendencias/PendenciasTab.css';
import './FechamentosTab.css';

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

async function buscarDocs(filialId, colecao, ids) {
  const unicos = [...new Set(ids)];
  const mapa = new Map();
  await Promise.all(
    unicos.map(async (id) => {
      const snap = await getDoc(doc(db, 'filiais', filialId, colecao, id));
      if (snap.exists()) mapa.set(id, { id: snap.id, ...snap.data() });
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
  const { items: vendas } = useFilialCollection(filialId, 'pendenciasVendas', 'data');
  const { items: extratoCartao } = useFilialCollection(filialId, 'extratoCartao', 'data');

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

  async function handleRestaurar(baixa) {
    setRestaurandoId(baixa.id);
    try {
      const ok = await restaurarBaixa(filialId, baixa);
      if (ok) {
        setResultado((r) => (r ? { ...r, baixas: r.baixas.filter((b) => b.id !== baixa.id) } : r));
      }
    } finally {
      setRestaurandoId(null);
    }
  }

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

          {resultado.baixas.map((b) => {
            const vendasDaBaixa = (b.vendaIds ?? [])
              .map((id) => resultado.vendasPorId.get(id))
              .filter(Boolean);
            const lancamentosDaBaixa = (b.lancamentoIds ?? [])
              .map((id) => resultado.lancamentosPorId.get(id))
              .filter(Boolean);
            const ehCartao = b.colecaoLancamento === 'extratoCartao';

            return (
              <div key={b.id} className="fech__baixa">
                <div className="fech__baixa-header">
                  <span>
                    {new Date(b.fechadoEmMs).toLocaleDateString('pt-BR')} ·{' '}
                    {b.automatica ? 'Automática' : b.poda ? 'Poda' : 'Manual'}
                    {b.forcada && ' (forçada)'} · {ehCartao ? 'Maquininha' : 'Banco'}
                    {b.justificativa && ` · ${b.justificativa}`}
                  </span>
                  <strong>{currency.format(b.total)}</strong>
                  <button
                    type="button"
                    className="pend__secundario"
                    onClick={() => handleRestaurar(b)}
                    disabled={restaurandoId === b.id}
                  >
                    {restaurandoId === b.id ? 'Restaurando…' : 'Restaurar'}
                  </button>
                </div>

                <div className="pend__grid">
                  <section className="pend__col">
                    <div className="pend__col-header">
                      <h3 className="pend__col-title">CDS — vendas</h3>
                    </div>
                    <div className="pend__col-scroll">
                      <table className="crud-tab__table pend__table">
                        <thead>
                          <tr>
                            <th>Data</th>
                            <th>N°</th>
                            <th>Cliente</th>
                            <th>Forma</th>
                            <th className="extrato__num">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {vendasDaBaixa.map((v) => (
                            <tr key={v.id}>
                              <td>{formatarData(v.data)}</td>
                              <td>{v.numeroVenda || '—'}</td>
                              <td>{v.clienteNome}</td>
                              <td className="pend__forma">{v.forma}</td>
                              <td className="extrato__num">{currency.format(v.valor)}</td>
                            </tr>
                          ))}
                          {vendasDaBaixa.length === 0 && (
                            <tr>
                              <td colSpan={5} className="crud-tab__empty">
                                Sem venda associada (só gasto/pagamento).
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
                        {ehCartao ? 'Maquininha' : 'Extrato'} — pagamento(s)
                      </h3>
                    </div>
                    <div className="pend__col-scroll">
                      <table className="crud-tab__table pend__table">
                        <thead>
                          <tr>
                            <th>Data</th>
                            {ehCartao ? (
                              <>
                                <th>Bandeira</th>
                                <th>Parcelas</th>
                              </>
                            ) : (
                              <>
                                <th>Conta / histórico</th>
                                <th>Forma</th>
                              </>
                            )}
                            <th className="extrato__num">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lancamentosDaBaixa.map((l) => (
                            <tr key={l.id}>
                              <td>{formatarData(l.data)}</td>
                              {ehCartao ? (
                                <>
                                  <td>{l.bandeira}</td>
                                  <td>{l.parcelas > 1 ? `${l.parcelas}x` : 'à vista'}</td>
                                </>
                              ) : (
                                <>
                                  <td>{l.contraparteNome || l.historico}</td>
                                  <td className="pend__forma-col">
                                    {l.tipo === 'credito' ? 'Crédito' : 'Débito'}
                                  </td>
                                </>
                              )}
                              <td className="extrato__num">{currency.format(l.valor)}</td>
                            </tr>
                          ))}
                          {lancamentosDaBaixa.length === 0 && (
                            <tr>
                              <td colSpan={3} className="crud-tab__empty">
                                Sem pagamento associado.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              </div>
            );
          })}

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
