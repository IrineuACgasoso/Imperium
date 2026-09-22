import { firebaseIsConfigured } from '../../config/firebase.js';
import './FirebaseGate.css';

export default function FirebaseGate({ children }) {
  if (!firebaseIsConfigured) {
    return (
      <div className="firebase-gate">
        <p>
          O Firebase ainda não está configurado (arquivo <code>.env</code> vazio). Preencha
          as credenciais para habilitar esta aba.
        </p>
      </div>
    );
  }
  return children;
}
