import { useRef, useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { ACCESS_PASSWORD, ACCESS_EMAIL } from '../../config/auth.js';
import { auth, firebaseIsConfigured } from '../../config/firebase.js';
import './PasswordGate.css';

/**
 * Segunda barreira de senha, usada antes de mostrar dados bancários.
 *
 * Não é uma barreira criptográfica — quem já passou do login principal tem a
 * sessão do Firebase e, no limite, poderia ler o Firestore por fora. O valor
 * dela é outro: evitar que um extrato bancário fique exposto numa aba aberta
 * e esquecida no balcão da loja. Por isso ela também re-valida a senha
 * contra o Firebase (não é um `if` no código), e o desbloqueio vale só
 * enquanto esta tela estiver montada.
 */
export default function PasswordGate({ titulo, descricao, onUnlock }) {
  const [senha, setSenha] = useState('');
  const [status, setStatus] = useState('idle');
  const inputRef = useRef(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('checking');

    if (firebaseIsConfigured) {
      try {
        await signInWithEmailAndPassword(auth, ACCESS_EMAIL, senha);
        onUnlock();
      } catch {
        setStatus('error');
        setSenha('');
        inputRef.current?.focus();
      }
      return;
    }

    if (senha === ACCESS_PASSWORD) {
      onUnlock();
    } else {
      setStatus('error');
      setSenha('');
      inputRef.current?.focus();
    }
  }

  return (
    <form className="password-gate" onSubmit={handleSubmit}>
      <span className="password-gate__title">{titulo}</span>
      {descricao && <p className="password-gate__desc">{descricao}</p>}
      <div className="password-gate__row">
        <input
          ref={inputRef}
          type="password"
          className="password-gate__input"
          placeholder="Senha de acesso"
          value={senha}
          onChange={(e) => {
            setSenha(e.target.value);
            if (status !== 'idle') setStatus('idle');
          }}
          autoFocus
          autoComplete="current-password"
          disabled={status === 'checking'}
        />
        <button type="submit" className="password-gate__submit" disabled={status === 'checking'}>
          {status === 'checking' ? 'Verificando…' : 'Desbloquear'}
        </button>
      </div>
      {status === 'error' && <p className="password-gate__error">Senha incorreta.</p>}
    </form>
  );
}
