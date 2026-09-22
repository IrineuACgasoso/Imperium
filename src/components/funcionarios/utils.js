// Salário mínimo nacional vigente (Decreto nº 12.797/2025, valor de 2026).
// Precisa ser atualizado manualmente a cada reajuste (normalmente janeiro).
export const SALARIO_MINIMO_ATUAL = 1621;

export const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function mesAtualISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
