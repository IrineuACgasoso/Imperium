// Inicialização real do Firebase. Preencha as variáveis de ambiente em .env
// (veja .env.example) com os valores do console do Firebase.
//
// Enquanto essas variáveis não existirem, `app`/`db`/`auth` ficam undefined e
// o app cai automaticamente no modo mock + senha hardcoded — nada quebra por
// falta de configuração.

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
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
export const db = app ? getFirestore(app) : undefined;
export const auth = app ? getAuth(app) : undefined;
export const firebaseIsConfigured = isConfigured;
