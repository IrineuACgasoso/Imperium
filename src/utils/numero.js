// Soma de vários números em ponto flutuante (ex: somar o valor de cada
// "TOTAL <bandeira>" de um Caixa Detalhado pra formar o total de "Cartão")
// acumula erro de arredondamento binário — 0,1 + 0,2 não é exatamente 0,3
// em JS, e depois de várias somas isso vira algo como "3014,3500000000004".
// Use esta função depois de QUALQUER soma/subtração de valores em reais
// antes de guardar ou mostrar — nunca deixe o resultado bruto do `+`/`-`
// ir direto pra tela ou pro Firestore.
export function arredondar2(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100;
}
