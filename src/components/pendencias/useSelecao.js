import { useCallback, useState } from 'react';

/** Conjunto de ids selecionados. `ids` é um Set (has() é O(1), ao contrário de Array.includes). */
export function useSelecao() {
  const [ids, setIds] = useState(() => new Set());
  const toggle = useCallback((id) => {
    setIds((prev) => {
      const prox = new Set(prev);
      if (!prox.delete(id)) prox.add(id);
      return prox;
    });
  }, []);
  const substituir = useCallback((lista) => setIds(new Set(lista)), []);
  const limpar = useCallback(() => setIds((prev) => (prev.size ? new Set() : prev)), []);
  return { ids, toggle, substituir, limpar };
}
