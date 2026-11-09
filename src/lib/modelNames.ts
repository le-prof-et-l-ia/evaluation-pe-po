/**
 * Conversion d'un identifiant de modèle (ou d'un alias interne) en libellé
 * lisible pour l'utilisateur. Source unique partagée par l'UI (page principale
 * et vue de résultat) pour éviter les mappings divergents.
 */
export function getFriendlyModelName(model: string, provider?: string): string {
  if (!model) return 'Modèle inconnu';
  const modelLower = model.toLowerCase();

  // Gemini
  if (modelLower.includes('gemini-3.8-flash') || modelLower === 'flash' || modelLower === 'gemini-flash') return 'Gemini 3.8 Flash';
  if (modelLower.includes('gemini-3.7-flash')) return 'Gemini 3.7 Flash';
  if (modelLower.includes('gemini-3.6-flash')) return 'Gemini 3.6 Flash';
  if (modelLower.includes('gemini-3.5-flash')) return 'Gemini 3.5 Flash';
  if (modelLower.includes('gemini-4-argon') || modelLower.includes('gemini-4') || modelLower.includes('argon') || modelLower.includes('gemini-3.1-pro') || modelLower.includes('gemini-3.5-pro') || modelLower.includes('3.1-pro') || modelLower === 'pro' || modelLower === 'gemini-pro') return 'Gemini 4 Argon';

  return model;
}
