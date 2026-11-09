/**
 * Utilitaire de formatage des notes au format français (virgule au lieu de point).
 * Exemples :
 * - 1.2 -> "1,2"
 * - 3 -> "3"
 * - 4.75 -> "4,75"
 * - 0 -> "0"
 * - "1.5" -> "1,5"
 * - undefined / null -> "-"
 */
export function formatScore(score: number | string | undefined | null): string {
  if (score === undefined || score === null || score === '') return '-';
  const num = typeof score === 'number' ? score : parseFloat(String(score).replace(',', '.'));
  if (isNaN(num)) return String(score);
  
  // Arrondi propre à 2 décimales pour éviter les imprécisions flottantes (ex: 0.30000000000000004)
  const rounded = Math.round(num * 100) / 100;
  return rounded.toString().replace('.', ',');
}
