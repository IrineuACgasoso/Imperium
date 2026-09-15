import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import Login from './components/Login.jsx';
import Dashboard from './components/Dashboard.jsx';
import { auth, firebaseIsConfigured } from './config/firebase.js';

export default function App() {
  // Enquanto não sabemos o estado real (Firebase ainda restaurando a sessão
  // salva), ficamos em "loading" pra não piscar a tela de login à toa nem
  // liberar acesso antes da hora.
  const [authState, setAuthState] = useState(firebaseIsConfigured ? 'loading' : 'legacy');

  // Modo legado (sem Firebase configurado): mantém o comportamento antigo,
  // controlado localmente pelo próprio Login.jsx.
  const [legacyAuthenticated, setLegacyAuthenticated] = useState(false);

  useEffect(() => {
    if (!firebaseIsConfigured) return undefined;

    // Fonte única de verdade: o próprio Firebase Auth. Isso garante que a UI
    // nunca fique "logada" enquanto o Firebase já não reconhece mais a sessão
    // (token revogado, sessão expirada, logout em outra aba, etc.) — situação
    // que antes causava permission-denied silencioso nos listeners do Firestore
    // mesmo com a tela mostrando o dashboard normalmente.
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthState(user ? 'authenticated' : 'unauthenticated');
    });

    return unsubscribe;
  }, []);

  if (authState === 'legacy') {
    if (!legacyAuthenticated) {
      return <Login onSuccess={() => setLegacyAuthenticated(true)} />;
    }
    return <Dashboard onLogout={() => setLegacyAuthenticated(false)} />;
  }

  if (authState === 'loading') {
    return null; // instantâneo na prática; evita piscar Login antes da hora
  }

  if (authState === 'unauthenticated') {
    return <Login onSuccess={() => {}} />;
  }

  return <Dashboard onLogout={() => {}} />;
}