import { useState, useRef } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { ACCESS_PASSWORD, ACCESS_EMAIL } from '../config/auth.js';
import { auth, firebaseIsConfigured } from '../config/firebase.js';
import './Login.css';

export default function Login({ onSuccess }) {
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle'); // idle | error | success | checking
  const inputRef = useRef(null);

  async function handleSubmit(e) {
    e.preventDefault();

    if (firebaseIsConfigured) {
      setStatus('checking');
      try {
        await signInWithEmailAndPassword(auth, ACCESS_EMAIL, password);
        setStatus('success');
        setTimeout(onSuccess, 550);
      } catch (err) {
        console.error(err);
        setStatus('error');
        setPassword('');
        inputRef.current?.focus();
      }
      return;
    }

    // Modo legado, sem Firebase configurado ainda.
    if (password === ACCESS_PASSWORD) {
      setStatus('success');
      setTimeout(onSuccess, 550);
    } else {
      setStatus('error');
      setPassword('');
      inputRef.current?.focus();
    }
  }

  return (
    <div className={`login-screen login-screen--${status === 'checking' ? 'idle' : status}`}>
      <div className="login-screen__glow" aria-hidden="true" />
      <form className="login-box" onSubmit={handleSubmit}>
        <span className="login-box__eyebrow">Imperium das Chaves</span>
        <h1 className="login-box__title">Senha</h1>

        <input
          ref={inputRef}
          type="password"
          className="login-box__input"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (status !== 'idle') setStatus('idle');
          }}
          autoFocus
          autoComplete="current-password"
          disabled={status === 'checking'}
        />

        <button type="submit" className="login-box__submit" disabled={status === 'checking'}>
          {status === 'checking' ? 'Verificando…' : 'Entrar'}
        </button>

        <p className="login-box__feedback" role="status">
          {status === 'error' && 'Senha incorreta. Tente novamente.'}
          {status === 'success' && 'Acesso liberado.'}
        </p>
      </form>
    </div>
  );
}
