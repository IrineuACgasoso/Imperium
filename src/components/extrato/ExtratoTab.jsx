import { useMemo, useState } from 'react';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase.js';
import { useFilialCollection } from '../../hooks/useFilialCollection.js';
import { extrairTextoPdf } from '../../parsers/pdfToText.js';
import { parseExtratoBB } from '../../parsers/extratoBB.js';
import { parseExtratoRede } from '../../parsers/extratoRede.js';
import FirebaseGate from '../layout/FirebaseGate.jsx';
import ContextMenu from '../common/ContextMenu.jsx';
import Combobox from '../common/Combobox.jsx';
import { idVinculo } from '../../shared/vinculo.js';
import { montarLinhasExtrato } from '../../data/extratoExport.js';
import { gerarExcelExtrato } from '../../data/gerarExcelExtrato.js';
import AssociarClienteModal from './AssociarClienteModal.jsx';
import { currency, BANCOS, formatarData, formatarDocumento, hojeISO } from './utils.js';
import '../../shared/CrudTab.css';
import '../../shared/PdfImport.css';
import './ExtratoTab.css';

export default function ExtratoTab({ filialId }) {
  return (
    <FirebaseGate>
      <ExtratoTabInner filialId={filialId} />
    </FirebaseGate>
  );
}

function ExtratoTabInner({ filialId }) {
  const [banco, setBanco] = useState(null);

  if (!banco) {
    return (
      <div className="extrato">
        <p className="crud-tab__note">Qual extrato você quer ver?</p>
        <div className="extrato__bancos">
          {BANCOS.map((b) => (
            <button
              key={b.id}
              type="button"
              className={`extrato__banco ${b.disponivel ? '' : 'is-disabled'}`}
              disabled={!b.disponivel}
              onClick={() => setBanco(b.id)}
            >
              <span className="extrato__banco-nome">{b.nome}</span>
              <span className="extrato__banco-nota">{b.nota}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="extrato">
      <button type="button" className="extrato__voltar" onClick={() => setBanco(null)}>
        ← Trocar banco
      </button>
      {banco === 'rede' ? <ExtratoRede filialId={filialId} /> : <ExtratoBB filialId={filialId} />}
    </div>
  );
}

function ExtratoBB({ filialId }) {
  const { items: lancamentos } = useFilialCollection(filialId, 'extratoLancamentos', 'data');
  const { items: vinculos } = useFilialCollection(filialId, 'vinculosBancarios', 'criadoEm');
  const { items: clientes } = useFilialCollection(filialId, 'clientes', 'nome');

  const [previa, setPrevia] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [menu, setMenu] = useState(null);
  const [associandoCliente, setAssociandoCliente] = useState(null);
  const [filtro, setFiltro] = useState('');
  const [exportando, setExportando] = useState(false);
  const [exportInicio, setExportInicio] = useState('');
  const [exportFim, setExportFim] = useState(() => hojeISO());

  const vinculoPorChave = useMemo(() => {
    const mapa = new Map();
    vinculos.forEach((v) => mapa.set(v.chave, v));
    return mapa;
  }, [vinculos]);

  async function handleExportar() {
    if (!exportInicio || !exportFim) {
      setErro('Escolha a data inicial e final do intervalo a exportar.');
      return;
    }
    setExportando(true);
    setErro(null);
    try {
      const linhas = montarLinhasExtrato(lancamentos, exportInicio, exportFim);
      await gerarExcelExtrato(linhas, `extrato-bb_${exportInicio}_a_${exportFim}.xlsx`);
    } catch (err) {
      setErro(err.message);
    } finally {
      setExportando(false);
    }
  }

  async function lerArquivo(file) {
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext === 'pdf') return extrairTextoPdf(file);

    const buffer = await file.arrayBuffer();
    let texto = new TextDecoder('utf-8').decode(buffer);
    // Exportação em CSV/TXT do BB costuma vir em ISO-8859-1; o caractere de
    // substituição (\uFFFD) denuncia que decodificamos errado.
    if (texto.includes('\uFFFD')) {
      texto = new TextDecoder('windows-1252').decode(buffer);
    }
    return texto;
  }

  async function onFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErro(null);
    setPrevia(null);
    setCarregando(true);
    try {
      const conteudo = await lerArquivo(file);
      const resultado = parseExtratoBB(conteudo, file.name);
      if (resultado.periodoInvalido) {
        setErro(resultado.erro);
      } else if (!resultado.lancamentos.length) {
        setErro(
          'Não identifiquei nenhum lançamento nesse arquivo. Se for PDF, tente exportar o mesmo período em OFX — é o formato mais confiável.'
        );
      } else {
        setPrevia({ ...resultado, nomeArquivo: file.name });
      }
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }

  async function confirmarImportacao() {
    setSalvando(true);
    try {
      for (const l of previa.lancamentos) {
        // merge: se o lançamento já existe e já foi conciliado, reimportar o
        // extrato não pode desfazer a baixa nem apagar o vínculo. Débitos só
        // ficam salvos aqui, como extrato bruto — não existe mais
        // categorização de gasto no sistema.
        await setDoc(
          doc(db, 'filiais', filialId, 'extratoLancamentos', l.id),
          { ...l, importadoEm: serverTimestamp(), criadoEm: serverTimestamp() },
          { merge: true }
        );
      }
      setPrevia(null);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  async function salvarVinculoCliente(lancamento, cliente) {
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

  async function removerVinculoCliente(lancamento) {
    const chave = lancamento.chaveContraparte;
    if (!chave) return;
    const v = vinculoPorChave.get(chave);
    if (!v) return;
    const ok = window.confirm(
      `Desassociar esta conta de "${v.clienteNome}"?\n\nOs pagamentos dessa conta voltam a ficar sem cliente e não serão mais conciliados automaticamente.`
    );
    if (ok) await deleteDoc(doc(db, 'filiais', filialId, 'vinculosBancarios', idVinculo(chave)));
  }

  const termo = filtro.trim().toLowerCase();
  const visiveis = lancamentos.filter((l) => {
    if (!termo) return true;
    const v = vinculoPorChave.get(l.chaveContraparte);
    return [l.historico, l.contraparteNome, l.contraparteDocumento, v?.clienteNome]
      .filter(Boolean)
      .some((campo) => campo.toLowerCase().includes(termo));
  });

  const saldoPeriodo = visiveis.reduce(
    (s, l) => s + (l.tipo === 'credito' ? l.valor : -l.valor),
    0
  );

  return (
    <div className="crud-tab">
      <div className="pdf-import">
        <div className="pdf-import__header">
          <span className="pdf-import__label">
            Importar extrato do Banco do Brasil (OFX, CSV ou PDF):
          </span>
          <input
            type="file"
            accept=".ofx,.csv,.txt,.pdf,application/pdf"
            onChange={onFileChange}
            className="pdf-import__file"
          />
        </div>

        {carregando && <p className="pdf-import__status">Lendo arquivo…</p>}
        {erro && <p className="pdf-import__error">{erro}</p>}

        {previa && (
          <div className="pdf-import__preview">
            <p className="pdf-import__preview-title">
              {previa.nomeArquivo} — {previa.lancamentos.length} lançamento(s), formato{' '}
              {previa.formato.toUpperCase()}
            </p>
            {previa.semContraparte > 0 && (
              <p className="pdf-import__status">
                {previa.semContraparte} lançamento(s) sem nome/CPF identificável no histórico —
                eles entram no extrato normalmente, mas não poderão ser associados a um cliente
                nem conciliados automaticamente.
              </p>
            )}
            <div className="pdf-import__actions">
              <button className="pdf-import__confirm" onClick={confirmarImportacao} disabled={salvando}>
                {salvando ? 'Salvando…' : 'Confirmar importação'}
              </button>
              <button className="pdf-import__cancel" onClick={() => setPrevia(null)}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="extrato__toolbar">
        <input
          type="search"
          className="extrato__busca"
          placeholder="Buscar por nome, CPF/CNPJ ou histórico"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />
        <span className="extrato__saldo">
          Saldo dos lançamentos exibidos: <strong>{currency.format(saldoPeriodo)}</strong>
        </span>
      </div>

      <div className="extrato__toolbar extrato__toolbar--export">
        <span className="extrato__label-export">Exportar Excel (Data/Gastos/Lucros/Saldo):</span>
        <input
          type="date"
          value={exportInicio}
          onChange={(e) => setExportInicio(e.target.value)}
          aria-label="Data inicial da exportação"
        />
        <span>até</span>
        <input
          type="date"
          value={exportFim}
          onChange={(e) => setExportFim(e.target.value)}
          aria-label="Data final da exportação"
        />
        <button type="button" onClick={handleExportar} disabled={exportando}>
          {exportando ? 'Gerando…' : 'Exportar Excel'}
        </button>
      </div>

      <div className="extrato__table-scroll">
      <table className="crud-tab__table extrato__table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Histórico</th>
            <th>Conta / favorecido</th>
            <th>Cliente</th>
            <th className="extrato__num">Valor</th>
          </tr>
        </thead>
        <tbody>
          {visiveis.map((l) => {
            const v = vinculoPorChave.get(l.chaveContraparte);
            return (
              <tr
                key={l.id}
                className={l.baixaId ? 'is-conciliado' : ''}
                onContextMenu={(e) => {
                  if (l.tipo !== 'credito') return;
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, lancamento: l });
                }}
              >
                <td>{formatarData(l.data)}</td>
                <td className="extrato__historico">{l.historico}</td>
                <td>
                  {l.contraparteNome || <span className="extrato__vazio">(não identificado)</span>}
                  {l.contraparteDocumento && (
                    <span className="extrato__doc">{formatarDocumento(l.contraparteDocumento)}</span>
                  )}
                </td>
                <td>
                  {l.tipo === 'credito' ? (
                    v ? (
                      <span className="extrato__cliente">{v.clienteNome}</span>
                    ) : (
                      <span className="extrato__vazio">—</span>
                    )
                  ) : (
                    <span className="extrato__vazio">—</span>
                  )}
                </td>
                <td className={`extrato__num extrato__valor--${l.tipo}`}>
                  {l.tipo === 'debito' ? '- ' : '+ '}
                  {currency.format(l.valor)}
                </td>
              </tr>
            );
          })}
          {visiveis.length === 0 && (
            <tr>
              <td colSpan={5} className="crud-tab__empty">
                {lancamentos.length === 0
                  ? 'Nenhum extrato importado ainda.'
                  : 'Nenhum lançamento bate com essa busca.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      <p className="crud-tab__note">
        Clique com o botão direito numa linha de <strong>entrada</strong> pra associá-la a um
        cliente cadastrado. A associação é por conta (CPF/CNPJ, ou nome quando o banco não
        informa o documento) — um mesmo cliente pode ter várias contas associadas, e todo
        lançamento futuro daquela conta já entra reconhecido. Linhas de <strong>saída</strong>{' '}
        (débito/cobrança) aparecem aqui só como registro do extrato — não há mais categorização
        de gasto no sistema.
      </p>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          itens={[
            {
              label: 'Associar cliente',
              desabilitado: !menu.lancamento.chaveContraparte,
              onClick: () => setAssociandoCliente(menu.lancamento),
            },
            ...(vinculoPorChave.get(menu.lancamento.chaveContraparte)
              ? [
                  {
                    label: 'Remover associação',
                    perigo: true,
                    onClick: () => removerVinculoCliente(menu.lancamento),
                  },
                ]
              : []),
          ]}
        />
      )}

      {associandoCliente && (
        <AssociarClienteModal
          lancamento={associandoCliente}
          clientes={clientes}
          vinculoAtual={vinculoPorChave.get(associandoCliente.chaveContraparte)}
          onCancel={() => setAssociandoCliente(null)}
          onConfirm={(cliente) => salvarVinculoCliente(associandoCliente, cliente)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rede (extrato de maquininha). Sem nome de cliente: baixa contra as vendas
// abertas do CDS acontece só por data+valor+bandeira (ver
// data/conciliacaoCartao.js e components/pendencias/PendenciasTab.jsx, que
// lê a coleção `extratoCartao` gravada aqui).
// ---------------------------------------------------------------------------

function idLinhaCartao(l, adquirente) {
  // NSU é o identificador da maquininha pra essa venda — usar como chave do
  // documento faz a reimportação (períodos que se sobrepõem) não duplicar
  // linha. Sem NSU (arquivo antigo/atípico), cai pra uma chave composta —
  // pior caso é duas vendas idênticas até o centavo no mesmo minuto lido
  // duas vezes como uma só, o que é raro e inofensivo (a baixa é 1:1 mesmo
  // assim, só "perde" um NSU duplicado que já ia casar do mesmo jeito).
  const base = l.nsu ? `nsu_${l.nsu}` : `${l.data}_${l.bandeira}_${l.valor}_${l.parcelas}_${l.linhaOriginal}`;
  return `${adquirente}_${base}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function ExtratoRede({ filialId }) {
  const { items: lancamentosCartao } = useFilialCollection(filialId, 'extratoCartao', 'data');

  const [previa, setPrevia] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [filtro, setFiltro] = useState('');

  const linhasRede = useMemo(
    () => lancamentosCartao.filter((l) => l.adquirente === 'rede'),
    [lancamentosCartao]
  );

  async function onFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErro(null);
    setPrevia(null);
    setCarregando(true);
    try {
      const buffer = await file.arrayBuffer();
      const { vendas, erro: erroParse } = parseExtratoRede(new Uint8Array(buffer));
      if (erroParse) {
        setErro(erroParse);
      } else if (!vendas.length) {
        setErro('Não identifiquei nenhuma venda aprovada nesse arquivo.');
      } else {
        setPrevia({ vendas, nomeArquivo: file.name });
      }
    } catch (err) {
      setErro('Não consegui ler esse arquivo. Confirme se é o .xlsx exportado direto da Rede, sem edições.');
    } finally {
      setCarregando(false);
    }
  }

  async function confirmarImportacao() {
    setSalvando(true);
    try {
      for (const v of previa.vendas) {
        const id = idLinhaCartao(v, 'rede');
        // merge: se essa linha já foi importada e já tem baixaId, reimportar
        // o mesmo período não pode desfazer a baixa.
        await setDoc(
          doc(db, 'filiais', filialId, 'extratoCartao', id),
          {
            data: v.data,
            valor: v.valor,
            bandeira: v.bandeira,
            parcelas: v.parcelas,
            nsu: v.nsu || '',
            adquirente: 'rede',
            importadoEm: serverTimestamp(),
            criadoEm: serverTimestamp(),
          },
          { merge: true }
        );
      }
      setPrevia(null);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  const visiveis = linhasRede
    .filter((l) => {
      if (!filtro) return true;
      const termo = filtro.toLowerCase();
      return l.bandeira.toLowerCase().includes(termo) || l.data.includes(termo);
    })
    .sort((a, b) => b.data.localeCompare(a.data));

  return (
    <div className="pdf-import">
      <div className="pdf-import__header">
        <span className="pdf-import__label">
          Relatório de vendas da Rede (.xlsx) — "Extrato para simples conferência"
        </span>
        <input type="file" accept=".xlsx" className="pdf-import__file" onChange={onFileChange} />
      </div>

      {carregando && <p className="pdf-import__status">Lendo arquivo…</p>}
      {erro && <p className="pdf-import__error">{erro}</p>}

      {previa && (
        <div className="pdf-import__preview">
          <p className="pdf-import__preview-title">
            {previa.vendas.length} venda(s) aprovada(s) encontrada(s) em {previa.nomeArquivo}
          </p>
          <div className="pdf-import__actions">
            <button className="pdf-import__confirm" onClick={confirmarImportacao} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Confirmar importação'}
            </button>
            <button className="pdf-import__cancel" onClick={() => setPrevia(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <input
        type="text"
        className="extrato__filtro"
        placeholder="Filtrar por bandeira ou data (AAAA-MM-DD)…"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
      />

      <table className="crud-tab__table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Bandeira</th>
            <th>Parcelas</th>
            <th className="extrato__num">Valor</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {visiveis.map((l) => (
            <tr key={l.id}>
              <td>{formatarData(l.data)}</td>
              <td>{l.bandeira}</td>
              <td>{l.parcelas > 1 ? `${l.parcelas}x` : 'à vista'}</td>
              <td className="extrato__num">{currency.format(l.valor)}</td>
              <td>{l.baixaId ? 'Baixado' : 'Aguardando baixa em Pendências'}</td>
            </tr>
          ))}
          {visiveis.length === 0 && (
            <tr>
              <td colSpan={5} className="crud-tab__empty">
                Nenhuma venda da Rede importada ainda.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
