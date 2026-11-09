/**
 * Traduction des erreurs techniques des fournisseurs LLM en messages
 * compréhensibles par le correcteur.
 */
export function getFriendlyErrorMessage(err: any): string {
  if (!err) return "Erreur inconnue";
  const errorMsg = typeof err === 'string' ? err : (err.message || JSON.stringify(err));
  const lowerMsg = errorMsg.toLowerCase();
  
  if (lowerMsg.includes("503") || lowerMsg.includes("overloaded") || lowerMsg.includes("unavailable") || lowerMsg.includes("exhausted") || lowerMsg.includes("surchargées")) {
    return "Le serveur Gemini est surchargé ou le quota est temporairement dépassé (Erreur 503/429). Veuillez réessayer dans quelques instants. Détails : " + errorMsg;
  }
  if (lowerMsg.includes("hallucination") || lowerMsg.includes("caractères chinois")) {
    return "⚠️ L'IA a généré du contenu corrompu (texte en chinois au lieu du feedback attendu). Cela se produit parfois avec Gemini Flash. Veuillez relancer l'évaluation ou essayer un autre modèle de supervision.";
  }
  if (lowerMsg.includes("unterminated string") || lowerMsg.includes("unexpected end of json")) {
    return "⚠️ La réponse de l'IA a été tronquée (dépassement du nombre maximum de tokens). Cela arrive lorsque le texte est très long. Veuillez relancer l'évaluation.";
  }
  if (lowerMsg.includes("quota") || lowerMsg.includes("429") || lowerMsg.includes("limit")) {
    return "Quota de requêtes API dépassé (Erreur 429). Veuillez vérifier vos limites de clé API ou réessayer plus tard. Détails : " + errorMsg;
  }
  if (lowerMsg.includes("api key") || lowerMsg.includes("clé api") || lowerMsg.includes("invalid") || lowerMsg.includes("key not found")) {
    return "Problème avec la clé API. Veuillez vérifier vos clés API dans la configuration. Détails : " + errorMsg;
  }
  return errorMsg;
}
