import { useState } from 'react';
import './FilialSelector.css';

export default function FilialSelector({ filiais, activeFilialId, onSelect, onAddFilial }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const activeFilial = filiais.find((f) => f.id === activeFilialId);

  function handleAddSubmit(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    onAddFilial(name);
    setNewName('');
    setAdding(false);
  }

  return (
    <div className="filial-selector">
      <button className="filial-selector__trigger" onClick={() => setOpen((v) => !v)}>
        <span className="filial-selector__dot" />
        <span className="filial-selector__name">{activeFilial?.nome ?? 'Filial'}</span>
        <span className="filial-selector__chevron">▾</span>
      </button>

      {open && (
        <div className="filial-selector__menu">
          {filiais.map((f) => (
            <button
              key={f.id}
              className={`filial-selector__option ${f.id === activeFilialId ? 'is-active' : ''}`}
              onClick={() => {
                onSelect(f.id);
                setOpen(false);
              }}
            >
              {f.nome}
            </button>
          ))}

          <div className="filial-selector__divider" />

          {!adding ? (
            <button className="filial-selector__add" onClick={() => setAdding(true)}>
              <span className="filial-selector__add-icon">+</span>
              Adicionar filial
            </button>
          ) : (
            <form className="filial-selector__add-form" onSubmit={handleAddSubmit}>
              <input
                autoFocus
                type="text"
                placeholder="Nome da filial"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <button type="submit">Salvar</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
