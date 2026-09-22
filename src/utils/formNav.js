// Navegação de formulário por teclado.
//
// Regras gerais que valem pra todos os cadastros do app:
//   • Enter pula pro próximo campo; no último campo, envia o formulário.
//   • Seletores (Combobox) também entram nessa fila — eles se marcam com
//     `data-form-nav` porque são <button>, e um <button> comum não seria
//     encontrado por um seletor de campos "normais".
//   • Depois de enviar, o foco volta pro primeiro campo (focusFirstField),
//     pro usuário emendar o próximo lançamento sem tocar no mouse.

const FOCUSABLE =
  'input:not([type="hidden"]):not([type="file"]), select, textarea, [data-form-nav]';

function isVisivel(el) {
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

function formDe(el) {
  return el?.form ?? el?.closest?.('form') ?? null;
}

// Lista, na ordem do DOM, os campos que participam da navegação por Enter.
// O botão de submit NÃO entra: quando acaba a fila, a gente envia direto,
// em vez de obrigar o usuário a dar mais um Enter em cima do botão.
export function camposDoFormulario(form) {
  if (!form) return [];
  return Array.from(form.querySelectorAll(FOCUSABLE)).filter(
    (el) => !el.disabled && el.tabIndex !== -1 && isVisivel(el)
  );
}

function focar(el) {
  if (!el) return;
  el.focus();
  // `select()` em input de data/mês/arquivo lança ou não faz sentido.
  if (typeof el.select === 'function' && !['date', 'month', 'file'].includes(el.type)) {
    try {
      el.select();
    } catch {
      /* alguns tipos de input não suportam seleção — tudo bem */
    }
  }
}

export function focusNextField(el) {
  const form = formDe(el);
  if (!form) return;
  const campos = camposDoFormulario(form);
  const idx = campos.indexOf(el);
  const proximo = idx >= 0 ? campos[idx + 1] : null;
  if (proximo) focar(proximo);
  else form.requestSubmit();
}

// Versão adiada: usada quando escolher um valor faz aparecer um campo novo
// (ex.: categoria "ADIANTAMENTO SALÁRIO" abre o campo Funcionário). Sem o
// adiamento, o React ainda não teria renderizado esse campo e o foco pularia
// direto pro Valor.
export function focusNextFieldDeferred(el) {
  setTimeout(() => focusNextField(el), 0);
}

export function handleEnterNavigation(e) {
  if (e.key !== 'Enter' || e.shiftKey) return;
  if (!formDe(e.currentTarget)) return;
  e.preventDefault();
  focusNextField(e.currentTarget);
}

// Volta o cursor pro começo do formulário depois de salvar. O adiamento
// garante que o React já tenha limpado/rerenderizado os campos.
export function focusFirstField(formOuRef) {
  setTimeout(() => {
    const form = formOuRef?.current ?? formOuRef;
    const campos = camposDoFormulario(form);
    focar(campos[0]);
  }, 0);
}
