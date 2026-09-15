import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';

import { promptDiario, schemaDiario } from './src/prompts/diario.js';
import { promptHistoricoMensal, schemaHistoricoMensal } from './src/prompts/historicoMensal.js';
import {
  promptDespesasDiarias,
  schemaDespesasDiarias,
} from './src/prompts/despesasDiarias.js';
import {
  promptFuncionarioMensal,
  schemaFuncionarioMensal,
} from './src/prompts/funcionarioMensal.js';

initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 5 });

// A chave do Gemini fica SÓ aqui, como secret do Firebase — nunca no client.
// Definir com: firebase functions:secrets:set GEMINI_API_KEY
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

const TIPO_CONFIG = {
  diario: { prompt: promptDiario, schema: schemaDiario },
  'mensal-historico': { prompt: promptHistoricoMensal, schema: schemaHistoricoMensal },
  'funcionario-mensal': { prompt: promptFuncionarioMensal, schema: schemaFuncionarioMensal },
  'despesas-diarias': { prompt: promptDespesasDiarias, schema: schemaDespesasDiarias },
};


/**
 * Normaliza um nome para comparação: sem acentos, sem pontuação, minúsculo,
 * espaços colapsados. "Márcio  Silva" e "marcio silva" viram a mesma coisa.
 */
function normalizarNome(nome) {
  return (nome ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Casa um nome vindo da IA com um funcionário JÁ CADASTRADO na filial.
 *
 * A IA lê o nome como está escrito no relatório da loja, que raramente bate
 * exatamente com o cadastro (acento faltando, sobrenome a mais/a menos,
 * caixa diferente). Tentamos, em ordem:
 *   1. igualdade exata normalizada;
 *   2. primeiro nome igual (caso mais comum: "Flávio" x "Flavio Souza");
 *   3. um nome contido no outro.
 *
 * Se nada casar, devolvemos null — o chamador decide o que fazer (aqui,
 * gravamos o gasto mesmo assim, sem vínculo, para o dinheiro não sumir do
 * controle, e sinalizamos no campo `vinculoPendente`).
 */
async function encontrarFuncionarioId(db, filialId, nomeDaIA) {
  const alvo = normalizarNome(nomeDaIA);
  if (!alvo) return null;

  const snap = await db.collection('filiais').doc(filialId).collection('funcionarios').get();
  const cadastrados = snap.docs.map((d) => ({ id: d.id, nome: normalizarNome(d.data().nome) }));

  const exato = cadastrados.find((f) => f.nome === alvo);
  if (exato) return exato.id;

  const primeiroAlvo = alvo.split(' ')[0];
  const porPrimeiroNome = cadastrados.filter((f) => f.nome.split(' ')[0] === primeiroAlvo);
  // Só aceitamos match por primeiro nome se for inequívoco — com dois
  // "Flávio" no cadastro, adivinhar qual seria pior que não vincular.
  if (porPrimeiroNome.length === 1) return porPrimeiroNome[0].id;

  const porInclusao = cadastrados.filter(
    (f) => f.nome.includes(alvo) || alvo.includes(f.nome)
  );
  if (porInclusao.length === 1) return porInclusao[0].id;

  return null;
}

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB — limite de sanidade para upload

// O Gemini às vezes devolve 503 (sobrecarga temporária do modelo) — tenta
// de novo algumas vezes com espera curta antes de desistir de vez.
async function generateContentWithRetry(model, content, maxAttempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await model.generateContent(content);
    } catch (err) {
      lastError = err;
      const isOverloaded = err?.status === 503 || err?.status === 429;
      if (!isOverloaded || attempt === maxAttempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
  }
  throw lastError;
}

/**
 * Recebe um documento (imagem ou PDF em base64), manda para o Gemini extrair
 * dados estruturados conforme o "tipo", e grava o resultado em
 * filiais/{filialId}/staging com status "pendente" — NUNCA em coleção definitiva.
 *
 * Entrada esperada:
 *   { filialId: string, tipo: 'diario'|'mensal-historico'|'funcionario-mensal',
 *     fileBase64: string, mimeType: string, fileName: string }
 */
export const extrairDocumento = onCall(
  { secrets: [GEMINI_API_KEY], timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Faça login para usar a importação por IA.');
    }

    const { filialId, tipo, fileBase64, mimeType, fileName } = request.data ?? {};

    if (!filialId || typeof filialId !== 'string') {
      throw new HttpsError('invalid-argument', 'filialId é obrigatório.');
    }
    if (!TIPO_CONFIG[tipo]) {
      throw new HttpsError(
        'invalid-argument',
        `tipo inválido. Use um de: ${Object.keys(TIPO_CONFIG).join(', ')}.`
      );
    }
    if (!fileBase64 || !mimeType) {
      throw new HttpsError('invalid-argument', 'fileBase64 e mimeType são obrigatórios.');
    }
    if (!['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(mimeType)) {
      throw new HttpsError('invalid-argument', 'Tipo de arquivo não suportado.');
    }
    // Base64 infla o tamanho em ~33%; checagem aproximada de sanidade.
    if (fileBase64.length > MAX_FILE_BYTES * 1.4) {
      throw new HttpsError('invalid-argument', 'Arquivo excede o limite de 15MB.');
    }

    const { prompt, schema } = TIPO_CONFIG[tipo];

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
    // Modelo escolhido por estar na camada gratuita real do Google AI Studio
    // (sem crédito pré-pago) com suporte a PDF/imagem. NÃO é modelo "preview"
    // (esses tendem a ficar instáveis/sobrecarregados — já apanhamos com
    // gemini-3-flash-preview retornando 503 por alta demanda).
    // ATUALIZADO em 13/09/2026: gemini-2.5-flash-lite passou a devolver 404
    // ("no longer available to new users") — trocado para gemini-3.5-flash-lite,
    // que é o substituto indicado pela própria API do Google no erro. Se voltar a
    // dar 404/503 persistente, confira o nome atual em
    // https://ai.google.dev/gemini-api/docs/pricing na coluna "Free tier",
    // preferindo sempre um modelo estável (sem "preview" no nome) se possível.
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.5-flash-lite',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    });

    let dadosExtraidos;
    try {
      const result = await generateContentWithRetry(model, [
        { inlineData: { mimeType, data: fileBase64 } },
        { text: prompt },
      ]);
      dadosExtraidos = JSON.parse(result.response.text());
    } catch (err) {
      console.error('Falha ao extrair documento via Gemini:', err);
      throw new HttpsError('internal', 'Não foi possível interpretar o documento enviado.');
    }

    const db = getFirestore();
    const stagingRef = db
      .collection('filiais')
      .doc(filialId)
      .collection('staging')
      .doc();

    await stagingRef.set({
      tipo,
      dadosExtraidos,
      status: 'pendente',
      fonteArquivo: fileName ?? null,
      criadoEm: FieldValue.serverTimestamp(),
    });

    // O client usa isso para abrir a tela de revisão direto no item certo.
    return { stagingId: stagingRef.id, dadosExtraidos };
  }
);

/**
 * Copia um item confirmado do staging para a coleção definitiva certa,
 * conforme o "tipo". Só deve ser chamado depois que o usuário revisou e
 * confirmou os dados na tela de revisão — nunca automaticamente.
 *
 * Entrada esperada: { filialId: string, stagingId: string }
 */
export const confirmarStaging = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Faça login para confirmar importações.');
  }
  const { filialId, stagingId } = request.data ?? {};
  if (!filialId || !stagingId) {
    throw new HttpsError('invalid-argument', 'filialId e stagingId são obrigatórios.');
  }

  const db = getFirestore();
  const stagingRef = db.collection('filiais').doc(filialId).collection('staging').doc(stagingId);

  // Resolvemos os vínculos de funcionário ANTES de abrir a transação: uma
  // transação do Firestore não permite leituras novas depois da primeira
  // escrita, e precisamos consultar a coleção de funcionários para casar os
  // nomes que a IA leu com o cadastro real.
  const preSnap = await stagingRef.get();
  if (!preSnap.exists) throw new HttpsError('not-found', 'Item de staging não encontrado.');
  const preDados = preSnap.data()?.dadosExtraidos ?? {};
  const preTipo = preSnap.data()?.tipo;

  const vinculos = new Map();
  if (preTipo === 'despesas-diarias') {
    for (const a of preDados.adiantamentos ?? []) {
      vinculos.set(a.funcionarioNome, await encontrarFuncionarioId(db, filialId, a.funcionarioNome));
    }
  } else if (preTipo === 'funcionario-mensal') {
    for (const bloco of preDados.meses ?? []) {
      for (const f of bloco.funcionarios ?? []) {
        if (!vinculos.has(f.nome)) {
          vinculos.set(f.nome, await encontrarFuncionarioId(db, filialId, f.nome));
        }
      }
    }
  }

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(stagingRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Item de staging não encontrado.');

    const { tipo, status, dadosExtraidos } = snap.data();
    if (status === 'confirmado') return; // idempotente — já foi confirmado antes

    if (tipo === 'diario') {
      const ref = db
        .collection('filiais')
        .doc(filialId)
        .collection('registrosDiarios')
        .doc(dadosExtraidos.data);
      tx.set(ref, {
        ...dadosExtraidos,
        origem: 'ia-caixa-diario',
        criadoEm: FieldValue.serverTimestamp(),
      });
    } else if (tipo === 'mensal-historico') {
      dadosExtraidos.meses.forEach((item) => {
        const ref = db
          .collection('filiais')
          .doc(filialId)
          .collection('registrosMensaisHistoricos')
          .doc(item.mes);
        tx.set(ref, {
          mes: item.mes,
          totalVendas: item.totalVendas,
          granularidadeDiaria: false,
          origem: 'ia-grafico-historico',
          criadoEm: FieldValue.serverTimestamp(),
        });
      });
    } else if (tipo === 'funcionario-mensal') {
      // O relatório traz VÁRIOS meses; gravamos todos, não só o mais recente.
      (dadosExtraidos.meses ?? []).forEach((bloco) => {
        (bloco.funcionarios ?? []).forEach((f) => {
          // Prioriza o vínculo com o funcionário já cadastrado; se não casou,
          // cai num slug do nome para não perder o dado (aparece como um
          // funcionário "solto" até alguém corrigir o cadastro).
          const funcionarioId =
            vinculos.get(f.nome) ??
            normalizarNome(f.nome).replace(/\s+/g, '-');
          const ref = db
            .collection('filiais')
            .doc(filialId)
            .collection('vendasPorFuncionarioMensal')
            .doc(`${funcionarioId}_${bloco.mes}`);
          tx.set(ref, {
            funcionarioId,
            funcionarioNome: f.nome,
            mes: bloco.mes,
            totalVendido: f.totalVendido,
            vinculoPendente: !vinculos.get(f.nome),
            origem: 'ia-relatorio-mensal-funcionario',
            criadoEm: FieldValue.serverTimestamp(),
          });
        });
      });
    } else if (tipo === 'despesas-diarias') {
      const gastosRef = db.collection('filiais').doc(filialId).collection('gastos');
      const { data, despesaOperacionalDoDia, adiantamentos, outrosLancamentos } = dadosExtraidos;

      // A despesa operacional (DESPESAS + GASOLINA + SERVIÇOS somados) vira
      // UM único gasto do dia. Usamos um ID determinístico por data para que
      // reimportar o mesmo relatório sobrescreva em vez de duplicar.
      if (despesaOperacionalDoDia > 0) {
        tx.set(gastosRef.doc(`despesa-operacional_${data}`), {
          data,
          categoria: 'DESPESAS',
          valor: despesaOperacionalDoDia,
          descricao: 'Despesas do dia (despesas + gasolina + serviços)',
          origem: 'ia-relatorio-despesas',
          criadoEm: FieldValue.serverTimestamp(),
        });
      }

      // Adiantamentos viram gastos individuais vinculados ao funcionário.
      // O funcionarioId segue o mesmo slug usado em vendasPorFuncionarioMensal,
      // para bater com o cadastro da aba Funcionários.
      (adiantamentos ?? []).forEach((a) => {
        // Vínculo resolvido antes da transação, casando com o cadastro real
        // (tolera acento/sobrenome diferentes). Sem match, grava mesmo assim
        // com vinculoPendente para o valor não sumir do controle.
        const funcionarioId =
          vinculos.get(a.funcionarioNome) ??
          normalizarNome(a.funcionarioNome).replace(/\s+/g, '-');
        tx.set(gastosRef.doc(`adiantamento_${funcionarioId}_${data}`), {
          data,
          categoria: 'ADIANTAMENTO SALÁRIO',
          valor: a.valor,
          descricao: 'Adiantamento importado do relatório de despesas',
          funcionarioId,
          funcionarioNome: a.funcionarioNome,
          vinculoPendente: !vinculos.get(a.funcionarioNome),
          origem: 'ia-relatorio-despesas',
          criadoEm: FieldValue.serverTimestamp(),
        });
      });

      (outrosLancamentos ?? []).forEach((l, i) => {
        tx.set(gastosRef.doc(`outro_${data}_${i}`), {
          data,
          categoria: (l.categoria ?? 'GERAL').toUpperCase(),
          valor: l.valor,
          descricao: l.descricao ?? '',
          origem: 'ia-relatorio-despesas',
          criadoEm: FieldValue.serverTimestamp(),
        });
      });
    }

    tx.update(stagingRef, { status: 'confirmado' });
  });

  return { ok: true };
});

/** Marca um item de staging como rejeitado — não escreve nada definitivo. */
export const rejeitarStaging = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Faça login para rejeitar importações.');
  }
  const { filialId, stagingId } = request.data ?? {};
  if (!filialId || !stagingId) {
    throw new HttpsError('invalid-argument', 'filialId e stagingId são obrigatórios.');
  }

  const db = getFirestore();
  await db
    .collection('filiais')
    .doc(filialId)
    .collection('staging')
    .doc(stagingId)
    .update({ status: 'rejeitado' });

  return { ok: true };
});