// Inicialização real do Firebase. Preencha as variáveis de ambiente em .env
// (veja .env.example) com os valores do console do Firebase.
//
// Enquanto essas variáveis não existirem, `app`/`db`/`auth` ficam undefined e
// o app cai automaticamente no modo mock + senha hardcoded — nada quebra por
// falta de configuração.

import { initializeApp, getApps } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

export const app = isConfigured && getApps().length === 0 ? initializeApp(firebaseConfig) : undefined;
// Cache local persistente (IndexedDB): ao recarregar a página, os listeners
// retomam de onde pararam e o servidor só cobra os documentos que MUDARAM
// (dentro de ~30 min); sem isso, cada F5 relia todas as coleções assinadas.
// Multi-aba: várias abas do navegador compartilham o mesmo cache.
export const db = app
  ? initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  : undefined;
export const auth = app ? getAuth(app) : undefined;
export const firebaseIsConfigured = isConfigured;
