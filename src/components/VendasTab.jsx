import { useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase.js';
import { handleEnterNavigation } from '../utils/formNav.js';
import FirebaseGate from './FirebaseGate.jsx';
import './CrudTab.css';

const CAMPOS = [
  { key: 'dinheiro', label: 'Dinheiro' },
  { key: 'cartao', label: 'Cartão' },
  { key: 'pix', label: 'Pix' },
  { key: 'boleto', label: 'Boleto' },
  { key: 'promissoria', label: 'Promissória' },
  { key: 'outros', label: 'Outros' },
];

export default function VendasTab({ filialId }) {
  return (
    <FirebaseGate>
      <VendasTabInner filialId={filialId} />
    </FirebaseGate>
  );
}

function VendasTabInner({ filialId }) {
  const [data, setData] = useState('');
  const [valores, setValores] = useState(
    Object.fromEntries(CAMPOS.map((c) => [c.key, '']))
  );
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function setValor(key, v) {
    setValores((prev) => ({ ...prev, [key]: v }));
  }

  async function handleSalvar(e) {
    e.preventDefault();
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      const vendas = Object.fromEntries(
        CAMPOS.map((c) => [c.key, parseFloat(valores[c.key]) || 0])
      );
      const totalVendas = Object.values(vendas).reduce((a, b) => a + b, 0);

      await setDoc(doc(db, 'filiais', filialId, 'registrosDiarios', data), {
        data,
        vendas: {
          ...vendas,
          totalAVista: vendas.dinheiro + vendas.pix,
          totalAPrazo: vendas.cartao + vendas.boleto + vendas.promissoria + vendas.outros,
          totalVendas,
        },
        origem: 'manual',
        criadoEm: serverTimestamp(),
      });

      setData('');
      setValores(Object.fromEntries(CAMPOS.map((c) => [c.key, ''])));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="crud-tab">
      <form className="crud-tab__form" onSubmit={handleSalvar}>
        <input type="date" value={data} onChange={(e) => setData(e.target.value)} onKeyDown={handleEnterNavigation} />
        {CAMPOS.map((c) => (
          <input
            key={c.key}
            type="number"
            step="0.01"
            placeholder={c.label}
            value={valores[c.key]}
            onChange={(e) => setValor(c.key, e.target.value)}
            onKeyDown={handleEnterNavigation}
          />
        ))}
        <button type="submit" disabled={saving}>
          {saving ? 'Salvando…' : 'Lançar dia'}
        </button>
      </form>

      {error && <p className="crud-tab__error">{error}</p>}

      <p className="crud-tab__note">
        Lançar um dia manualmente aqui sobrescreve o registro daquela data caso já
        exista (inclusive um que tenha vindo da IA) — use com cuidado. Para ver ou
        remover um dia já lançado, clique na bolinha correspondente no gráfico
        principal (aba Vendas) — lá abre a prestação de contas detalhada daquele dia.
      </p>
    </div>
  );
}
