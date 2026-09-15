// Wrapper fino em volta das Cloud Functions de extração/confirmação/rejeição.
// Não tem UI ainda (isso é o próximo passo: tela de upload + revisão) — este
// arquivo só deixa pronta a "ponte" para quando a UI existir.

import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase.js';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

function getFns() {
  if (!app) {
    throw new Error(
      'Firebase ainda não está configurado (.env vazio) — não é possível chamar as functions.'
    );
  }
  return getFunctions(app, 'us-central1');
}

/**
 * Envia um arquivo (imagem ou PDF) para extração via IA.
 * tipo: 'diario' | 'mensal-historico' | 'funcionario-mensal'
 * Retorna { stagingId, dadosExtraidos } — os dados ainda NÃO estão definitivos,
 * precisam ser confirmados na tela de revisão.
 */
export async function extrairDocumento({ filialId, tipo, file }) {
  const fileBase64 = await fileToBase64(file);
  const call = httpsCallable(getFns(), 'extrairDocumento');
  const { data } = await call({
    filialId,
    tipo,
    fileBase64,
    mimeType: file.type,
    fileName: file.name,
  });
  return data;
}

export async function confirmarStaging({ filialId, stagingId }) {
  const call = httpsCallable(getFns(), 'confirmarStaging');
  const { data } = await call({ filialId, stagingId });
  return data;
}

export async function rejeitarStaging({ filialId, stagingId }) {
  const call = httpsCallable(getFns(), 'rejeitarStaging');
  const { data } = await call({ filialId, stagingId });
  return data;
}