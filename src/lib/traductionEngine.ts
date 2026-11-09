/**
 * Moteur spécialisé pour l'épreuve de Traduction (Version ou Thème).
 * Évalue la fidélité au sens, l'exactitude syntaxique et lexicale dans la langue cible,
 * et le respect du registre.
 */

import { CustomCriterion } from './customExamTypes';

export interface TranslationErrorItem {
  type: 'contresens' | 'faux_sens' | 'non_sens' | 'omission' | 'syntaxe' | 'lexique' | 'registre';
  sourceSegment: string;
  studentSegment: string;
  suggestion: string;
  explanation: string;
}

export interface TranslationResult {
  examType: 'traduction';
  globalScore: number;
  maxScore: number;
  criteriaScores: Record<string, number>;
  justifications: Record<string, string>;
  advices?: Record<string, string>;
  errorsTable: Array<{
    original: string;       // segment étudiant
    correction: string;     // proposition recommandée
    rule: string;           // nature de l'erreur + explication
  }>;
  detailedErrors: TranslationErrorItem[];
  transcription: string;   // texte traduit par l'élève
  sourceText: string;
  modelTranslation?: string;
  studentName?: string | null;
  studentEmail?: string | null;
}

export const DEFAULT_TRANSLATION_CRITERIA: CustomCriterion[] = [
  { key: 'fidelite', label: 'Fidélité au sens et exactitude', maxScore: 4, description: 'Absence de contresens, faux-sens, non-sens ou omissions' },
  { key: 'langue_cible', label: 'Correction de la langue cible', maxScore: 3, description: 'Grammaire, morphosyntaxe, orthographe et ponctuation' },
  { key: 'lexique', label: 'Richesse et précision lexicale', maxScore: 2, description: 'Choix des collocations, équivalences idiomatiques et terminologie' },
  { key: 'style', label: 'Fluidité, registre et cohérence stylistique', maxScore: 1, description: 'Respect du ton du texte source, naturel de l\'expression' },
];

/**
 * Prompt système pour l'évaluation de la traduction.
 */
export function buildTranslationSystemPrompt(
  maxScore: number = 10,
  sourceLang: string = "Français",
  targetLang: string = "Français",
  criteria: CustomCriterion[] = DEFAULT_TRANSLATION_CRITERIA
): string {
  const criteriaListStr = criteria.map(c => `- ${c.label} (${c.key}) : note maximale ${c.maxScore} pt(s). ${c.description || ''}`).join('\n');
  const sumMax = criteria.reduce((acc, c) => acc + c.maxScore, 0);

  return `Tu es un PROFESSEUR AGRÉGÉ ET JURY EXPERT EN TRADUCTION (${sourceLang} ➔ ${targetLang}).
Ta mission est d'évaluer la traduction d'un étudiant avec une grande précision philologique, linguistique et stylistique.

═══════════════════════════════════════════
📋 GRILLE D'ÉVALUATION ET BARÈME
═══════════════════════════════════════════
La note globale finale est sur ${maxScore} points.
Les critères retenus sont les suivants (total de référence : ${sumMax} points) :
${criteriaListStr}

═══════════════════════════════════════════
⚖️ TYPOLOGIE DES ERREURS DE TRADUCTION À RELEVER
═══════════════════════════════════════════
Dans ton audit, identifie précisément et qualifie chaque erreur :
1. CONTRESENS : Attribution au texte d'une signification exactement inverse ou gravement altérée.
2. FAUX-SENS : Mauvaise compréhension d'un terme ou d'une nuance sans être l'exact opposé.
3. NON-SENS : Formulation absurde ou dénuée de signification dans la langue cible.
4. OMISSION : Mot, proposition ou nuance du texte source non traduit(e).
5. SOLÉCISME / SYNTAXE : Construction grammaticale fautive dans la langue d'arrivée.
6. BARBARISME / MALADRESSE LEXICALE : Mot inexistant, calque impropre ou mauvaise collocation.
7. ÉCART DE REGISTRE : Inadéquation de ton (registre trop familier ou trop guindé par rapport à l'original).

═══════════════════════════════════════════
FORMAT DE SORTIE JSON STRICT ATTENDU
═══════════════════════════════════════════
{
  "criteriaScores": {
${criteria.map(c => `    "${c.key}": number (entre 0 et ${c.maxScore})`).join(',\n')}
  },
  "globalScore": number (total ramené sur ${maxScore}),
  "justifications": {
${criteria.map(c => `    "${c.key}": "Justification précise citant le texte source et la copie de l'élève"`).join(',\n')}
  },
  "advices": {
    "methode": "Conseil méthodologique pour la relecture et l'analyse grammaticale",
    "lexique": "Conseil pour enrichir le répertoire d'équivalences idiomatiques"
  },
  "errorsTable": [
    {
      "original": "segment traduit par l'élève",
      "correction": "proposition de traduction modèle / corrigée",
      "rule": "[Type d'erreur] Explication claire indiquant le segment source original et la règle"
    }
  ],
  "detailedErrors": [
    {
      "type": "contresens" | "faux_sens" | "non_sens" | "omission" | "syntaxe" | "lexique" | "registre",
      "sourceSegment": "extrait du texte source",
      "studentSegment": "extrait de la copie élève",
      "suggestion": "traduction recommandée",
      "explanation": "explication philologique"
    }
  ]
}`;
}

/**
 * Prompt utilisateur pour l'évaluation de la traduction.
 */
export function buildTranslationUserPrompt(
  studentTranslation: string,
  sourceText: string,
  modelTranslation?: string,
  customInstructions?: string
): string {
  let modelBlock = "";
  if (modelTranslation && modelTranslation.trim()) {
    modelBlock = `\n═══════════════════════════════════════════\n📖 TRADUCTION DE RÉFÉRENCE / CORRIGÉ MODÈLE :\n═══════════════════════════════════════════\n${modelTranslation.trim()}\n`;
  }

  let customBlock = "";
  if (customInstructions && customInstructions.trim()) {
    customBlock = `\n═══════════════════════════════════════════\n📌 CONSIGNES SPÉCIFIQUES DE L'ENSEIGNANT :\n═══════════════════════════════════════════\n${customInstructions.trim()}\n`;
  }

  return `Voici les documents pour évaluer cette copie de traduction :

═══════════════════════════════════════════
📄 TEXTE SOURCE ORIGINAL :
═══════════════════════════════════════════
${sourceText.trim()}
${modelBlock}
═══════════════════════════════════════════
✍️ TRADUCTION DE L'ÉTUDIANT :
═══════════════════════════════════════════
${studentTranslation.trim()}
${customBlock}
Procède à l'évaluation méthodique de cette traduction et renvoie le rapport au format JSON strict.`;
}
