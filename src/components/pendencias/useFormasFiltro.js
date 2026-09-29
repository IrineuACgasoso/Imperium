import { useCallback, useEffect, useMemo, useState } from 'react';
import { vendaConferivel } from './selectors.js';

/**
 * Chips de forma de pagamento. As formas vêm do texto impresso no CDS
 * ("PIX RECIFE", "VISA ROT"...), então bandeira nova aparece sozinha.
 * Começa tudo desmarcado: a tela só mostra o que o usuário escolher.
 */
export function useFormasFiltro(vendas) {
  const disponiveis = useMemo(() => {
    const set = new Set();
    for (const v of vendas) if (v.forma && vendaConferivel(v)) set.add(v.forma);
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [vendas]);

  const [selecionadas, setSelecionadas] = useState([]);

  // Só remove formas que deixaram de existir; nunca marca nada sozinho.
  useEffect(() => {
    setSelecionadas((prev) => {
      const prox = prev.filter((f) => disponiveis.includes(f));
      return prox.length === prev.length ? prev : prox;
    });
  }, [disponiveis]);

  const todas = disponiveis.length > 0 && selecionadas.length === disponiveis.length;

  const toggle = useCallback(
    (forma) =>
      setSelecionadas((prev) =>
        prev.includes(forma) ? prev.filter((f) => f !== forma) : [...prev, forma]
      ),
    []
  );
  const toggleTodas = useCallback(
    () => setSelecionadas(todas ? [] : disponiveis),
    [todas, disponiveis]
  );

  return { disponiveis, selecionadas, todas, toggle, toggleTodas };
}
