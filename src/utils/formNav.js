// Faz o Enter, dentro de um <form>, pular pro próximo campo em vez de
// enviar o formulário direto — e no último campo, envia de verdade.
// Uso: <input onKeyDown={handleEnterNavigation} ... />
export function handleEnterNavigation(e) {
  if (e.key !== 'Enter') return;

  const form = e.currentTarget.form;
  if (!form) return;

  e.preventDefault();

  const focusable = Array.from(
    form.querySelectorAll('input, select, textarea, button[type="submit"]')
  ).filter((el) => !el.disabled && el.tabIndex !== -1);

  const currentIndex = focusable.indexOf(e.currentTarget);
  const next = focusable[currentIndex + 1];

  if (next) {
    next.focus();
    if (typeof next.select === 'function' && next.type !== 'date') next.select();
  } else {
    form.requestSubmit();
  }
}
