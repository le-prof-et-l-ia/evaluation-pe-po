/**
 * Moteur spécialisé pour l'épreuve d'Exercices de Grammaire.
 * Évalue question par question les réponses d'un étudiant par rapport à un corrigé modèle.
 */

export interface GrammarItemEvaluation {
  itemNumber: string | number;
  questionPrompt?: string;
  studentAnswer: string;
  expectedAnswer: string;
  scoreAwarded: number;
  maxScoreItem: number;
  status: 'correct' | 'partial' | 'incorrect';
  feedback: string;
}

export interface GrammarExerciseResult {
  examType: 'grammaire';
  globalScore: number;
  maxScore: number;
  items: GrammarItemEvaluation[];
  summaryFeedback: string;
  errorsTable: Array<{
    original: string;
    correction: string;
    rule: string;
  }>;
  transcription: string;
  subject: string;
  answerKey: string;
  studentName?: string | null;
  studentEmail?: string | null;
}

export function buildGrammarSystemPrompt(maxScore: number = 10): string {
  return `Tu es un ENSEIGNANT DE GRAMMAIRE FRANÇAISE ET EXAMINATEUR EXPERT.
Ta mission est d'évaluer la copie d'un élève contenant des réponses à des exercices de grammaire, de conjugaison ou de syntaxe.

═══════════════════════════════════════════
📋 RÈGLES D'ÉVALUATION ITEM PAR ITEM
═══════════════════════════════════════════
La note globale finale est sur ${maxScore} points.
1. Compare scrupuleusement la réponse de l'élève pour CHAQUE question/item avec la réponse attendue du corrigé.
2. Détermine le statut pour chaque item :
   - "correct" : réponse parfaitement conforme à la règle (pleins points).
   - "partial" : réponse sur la bonne voie mais comportant une imprécision ou une faute secondaire (ex: bon temps verbal mais mauvaise terminaison d'accord).
   - "incorrect" : réponse erronée ou non traitée (0 point).
3. Attribue une note numérique juste pour chaque item ("scoreAwarded") en respectant le barème par item ("maxScoreItem").
4. Formule une explication grammaticale précise et pédagogique ("feedback") pour chaque item où l'élève a commis une faute.

FORMAT DE SORTIE JSON STRICT ATTENDU :
{
  "items": [
    {
      "itemNumber": "1 ou 1.a",
      "questionPrompt": "Énoncé bref ou numéro de la question",
      "studentAnswer": "Réponse fournie par l'élève",
      "expectedAnswer": "Réponse attendue selon le corrigé",
      "scoreAwarded": number,
      "maxScoreItem": number,
      "status": "correct" | "partial" | "incorrect",
      "feedback": "Explication de la règle grammaticale"
    }
  ],
  "summaryFeedback": "Bilan d'ensemble sur les acquis grammaticaux de l'élève et ses points de vigilance",
  "errorsTable": [
    {
      "original": "réponse erronée de l'élève",
      "correction": "forme correcte",
      "rule": "Règle grammaticale appliquée"
    }
  ]
}`;
}

export function buildGrammarUserPrompt(
  studentAnswers: string,
  exerciseSubject: string,
  answerKey?: string,
  customInstructions?: string
): string {
  let answerKeyBlock = "";
  if (answerKey && answerKey.trim()) {
    answerKeyBlock = `\n═══════════════════════════════════════════\n📖 CORRIGÉ MODÈLE / CLÉ DE RÉPONSE :\n═══════════════════════════════════════════\n${answerKey.trim()}\n`;
  }

  let customBlock = "";
  if (customInstructions && customInstructions.trim()) {
    customBlock = `\n═══════════════════════════════════════════\n📌 CONSIGNES SPÉCIFIQUES ET BARÈME :\n═══════════════════════════════════════════\n${customInstructions.trim()}\n`;
  }

  return `Voici les documents pour corriger cet exercice de grammaire :

═══════════════════════════════════════════
📝 ÉNONCÉ DE L'EXERCICE :
═══════════════════════════════════════════
${exerciseSubject.trim()}
${answerKeyBlock}
═══════════════════════════════════════════
✍️ COPIE DE L'ÉLÈVE :
═══════════════════════════════════════════
${studentAnswers.trim()}
${customBlock}
Analyse chaque réponse, attribue les points et renvoie le JSON d'évaluation.`;
}

/**
 * Consolide le score global à partir des items évalués.
 */
export function computeGrammarGlobalScore(items: GrammarItemEvaluation[], targetMax: number = 10): number {
  if (!items || items.length === 0) return 0;
  const rawSum = items.reduce((acc, it) => acc + (Number(it.scoreAwarded) || 0), 0);
  const totalMax = items.reduce((acc, it) => acc + (Number(it.maxScoreItem) || 0), 0);
  
  if (totalMax > 0 && Math.abs(totalMax - targetMax) > 0.01) {
    // Si la somme des items diffère de la note cible, normaliser au prorata
    const normalized = (rawSum / totalMax) * targetMax;
    return Math.round(normalized * 100) / 100;
  }
  return Math.round(rawSum * 100) / 100;
}

export function buildGrammarExternalMarkdown(
  studentAnswers: string,
  exerciseSubject: string,
  maxScore: number,
  answerKey?: string,
  customInstructions?: string
): string {
  return `# Consignes pour la double évaluation externe d'un exercice de grammaire

Copiez et collez l'intégralité du contenu ci-dessous dans une IA externe (Claude, ChatGPT, etc.) :

\`\`\`markdown
${buildGrammarSystemPrompt(maxScore)}

${buildGrammarUserPrompt(studentAnswers, exerciseSubject, answerKey, customInstructions)}

Renvoie UNIQUEMENT le bloc JSON valide conforme aux instructions.
\`\`\`
`;
}
