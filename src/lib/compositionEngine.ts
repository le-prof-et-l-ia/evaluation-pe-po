/**
 * Moteur spécialisé pour l'épreuve de Composition.
 * Prend en charge trois sous-types :
 * 1. Essai (en langue étrangère / FLE ou langue vivante)
 * 2. Rédaction (niveau collège français / DNB)
 * 3. Dissertation (niveau lycée français / Baccalauréat)
 */

import { CustomCriterion } from './customExamTypes';

export type CompositionSubType = 'essai' | 'redaction' | 'dissertation';

export interface CompositionResult {
  examType: 'composition';
  compositionType: CompositionSubType;
  targetLanguage?: string;
  globalScore: number;
  maxScore: number;
  criteriaScores: Record<string, number>;
  justifications: Record<string, string>;
  advices?: Record<string, string>;
  generalFeedback?: string;
  errorsTable: Array<{
    original: string;       // extrait fautif de l'élève
    correction: string;     // proposition corrigée / améliorée
    rule: string;           // règle grammaticale, syntaxique ou conseil stylistique
  }>;
  transcription: string;   // texte rédigé par l'élève
  subject: string;
  corpusText?: string;
  customInstructions?: string;
  disableStandardGrid?: boolean;
  customCriteriaEvaluated?: Array<{
    key: string;
    label: string;
    maxScore: number;
    score?: number;
    justification?: string;
    advice?: string;
    description?: string;
  }>;
  studentName?: string | null;
  studentEmail?: string | null;
}

export const DEFAULT_ESSAI_CRITERIA: CustomCriterion[] = [
  { 
    key: 'consigne_problematique', 
    label: 'Adéquation au sujet et problématisation', 
    maxScore: 4, 
    description: 'Compréhension du sujet, clarté de la prise de position et respect des consignes de forme.' 
  },
  { 
    key: 'argumentation_structure', 
    label: 'Argumentation, cohérence et structuration', 
    maxScore: 5, 
    description: 'Progression logique, présence d\'arguments illustrés d\'exemples, utilisation des connecteurs logiques.' 
  },
  { 
    key: 'morphosyntaxe', 
    label: 'Correction morphosyntaxique et grammaire', 
    maxScore: 4, 
    description: 'Accords, conjugaison, temps et modes, structures syntaxiques.' 
  },
  { 
    key: 'lexique', 
    label: 'Richesse et précision lexicale', 
    maxScore: 4, 
    description: 'Variété du vocabulaire, pertinence terminologique, collocations et équivalences idiomatiques.' 
  },
  { 
    key: 'style_fluidite', 
    label: 'Aisance stylistique, registre et fluidité', 
    maxScore: 3, 
    description: 'Naturel de l\'expression, registre de langue approprié, fluidité de lecture.' 
  },
];

export const DEFAULT_REDACTION_CRITERIA: CustomCriterion[] = [
  { 
    key: 'respect_sujet_genre', 
    label: 'Respect du sujet et du genre littéraire', 
    maxScore: 5, 
    description: 'Compréhension du sujet, conformité au genre attendu (récit, description, dialogue, lettre...) et respect des consignes (narrateur, temps).' 
  },
  { 
    key: 'qualite_invention_structure', 
    label: 'Invention, progression narrative et structure', 
    maxScore: 5, 
    description: 'Créativité, originalité et cohérence de l\'histoire, découpage en paragraphes équilibrés, transitions temporelles/spatiales.' 
  },
  { 
    key: 'maitrise_langue', 
    label: 'Maîtrise de la langue et orthographe', 
    maxScore: 5, 
    description: 'Orthographe grammaticale (accords sujet-verbe, participe passé, accords dans le GN), orthographe d\'usage, ponctuation.' 
  },
  { 
    key: 'vocabulaire_style', 
    label: 'Richesse lexicale et expressivité', 
    maxScore: 5, 
    description: 'Variété et précision du vocabulaire, évitement des répétitions, présence d\'images ou de figures de style simples et adaptées.' 
  },
];

export const DEFAULT_DISSERTATION_CRITERIA: CustomCriterion[] = [
  { 
    key: 'problematisation_these', 
    label: 'Compréhension du sujet et problématisation', 
    maxScore: 4, 
    description: 'Définition des notions clés, mise en évidence des paradoxes, formulation d\'une problématique féconde et d\'un fil conducteur solide.' 
  },
  { 
    key: 'rigueur_plan_argumentation', 
    label: 'Rigueur de la composition et du plan', 
    maxScore: 5, 
    description: 'Introduction complète (amorce, définition, problématique, annonce de plan), développement en 2 ou 3 parties ordonnées avec sous-parties, transitions soignées, conclusion bilancielle.' 
  },
  { 
    key: 'culture_exemples', 
    label: 'Culture littéraire et analyse critique des exemples', 
    maxScore: 4, 
    description: 'Mobilisation d\'exemples précis tirés des œuvres et de la culture générale, pertinence des citations, analyse fine évitant le simple résumé narratif.' 
  },
  { 
    key: 'expression_style', 
    label: 'Qualité de l\'expression et registre académique', 
    maxScore: 4, 
    description: 'Langue soutenue, rigueur démonstrative, clarté conceptuelle, élégance de la syntaxe et force de conviction.' 
  },
  { 
    key: 'syntaxe_orthographe', 
    label: 'Correction syntaxique et orthographique', 
    maxScore: 3, 
    description: 'Maîtrise des phrases complexes, ponctuation expressive et rigoureuse, correction orthographique irréprochable.' 
  },
];

/**
 * Échelle proportionnellement la note maximale des critères pour correspondre
 * exactement à la note totale maximale souhaitée (Option A).
 */
export function scaleCriteriaToMaxScore(criteria: CustomCriterion[], targetMaxScore: number): CustomCriterion[] {
  if (!criteria || criteria.length === 0 || targetMaxScore <= 0) return criteria;
  const baseSum = criteria.reduce((acc, c) => acc + c.maxScore, 0);
  if (baseSum <= 0 || baseSum === targetMaxScore) return criteria;

  const factor = targetMaxScore / baseSum;
  let runningSum = 0;
  const scaled = criteria.map((c) => {
    const score = Math.round(c.maxScore * factor * 100) / 100;
    runningSum += score;
    return {
      ...c,
      maxScore: score,
    };
  });

  // Ajustement fin d'éventuels arrondis pour garantir que la somme fasse exactement targetMaxScore
  const diff = Math.round((targetMaxScore - runningSum) * 100) / 100;
  if (Math.abs(diff) > 0.001) {
    let maxIdx = 0;
    for (let i = 1; i < scaled.length; i++) {
      if (scaled[i].maxScore > scaled[maxIdx].maxScore) maxIdx = i;
    }
    scaled[maxIdx].maxScore = Math.round((scaled[maxIdx].maxScore + diff) * 100) / 100;
  }

  return scaled;
}

/**
 * Renvoie la grille de critères par défaut pour un sous-type donné,
 * ajustée proportionnellement à la note maximale choisie (Option A).
 */
export function getCompositionCriteria(subType: CompositionSubType = 'essai', maxScore: number = 20): CustomCriterion[] {
  let base: CustomCriterion[];
  switch (subType) {
    case 'redaction':
      base = DEFAULT_REDACTION_CRITERIA;
      break;
    case 'dissertation':
      base = DEFAULT_DISSERTATION_CRITERIA;
      break;
    case 'essai':
    default:
      base = DEFAULT_ESSAI_CRITERIA;
      break;
  }
  if (maxScore && maxScore > 0 && maxScore !== 20) {
    return scaleCriteriaToMaxScore(base, maxScore);
  }
  return base;
}

/**
 * Libellé humain du sous-type.
 */
export function getCompositionTypeLabel(subType: CompositionSubType = 'essai'): string {
  switch (subType) {
    case 'redaction':
      return 'Rédaction (collège)';
    case 'dissertation':
      return 'Dissertation (lycée)';
    case 'essai':
    default:
      return 'Essai (langue étrangère)';
  }
}

/**
 * Construit le prompt système pour l'évaluation d'une composition.
 * Gère soit la grille officielle (éventuellement mise à l'échelle),
 * soit les critères libres personnalisés de l'utilisateur si la grille est désactivée.
 */
export function buildCompositionSystemPrompt(
  compositionType: CompositionSubType = 'essai',
  maxScore: number = 20,
  targetLanguage: string = 'Français',
  criteria: CustomCriterion[] = [],
  disableStandardGrid: boolean = false,
  customInstructions?: string
): string {
  let roleContext = "";
  let evaluationGuidelines = "";

  if (compositionType === 'essai') {
    roleContext = `Tu es un PROFESSEUR ET EXAMINATEUR EXPERT EN COMPOSITION ET ESSAIS ÉCRITS (${targetLanguage}).
Ta mission est d'évaluer avec rigueur, bienveillance et précision analytique un essai argumenté rédigé par un apprenant.`;
    evaluationGuidelines = `Consignes d'évaluation pour un Essai :
1. Évalue la force persuasive, la logique argumentative et la structuration (introduction, paragraphes argumentés avec exemples, conclusion).
2. Analyse la qualité de la langue rédigée en ${targetLanguage} : correction syntaxique, richesse lexicale, modalisation, clarté.
3. Si un corpus ou texte support est fourni, vérifie l'exploitation pertinente des documents sans plagiat.`;
  } else if (compositionType === 'redaction') {
    roleContext = `Tu es un PROFESSEUR DE FRANÇAIS DE COLLÈGE (Éducation Nationale) ET JURY DU DIPLÔME NATIONAL DU BREVET (DNB).
Ta mission est d'évaluer la rédaction d'un collégien (cycle 4) selon les exigences des programmes officiels français.`;
    evaluationGuidelines = `Consignes d'évaluation pour une Rédaction de Collège :
1. Vérifie la conformité au sujet et aux consignes (genre demandé : récit, suite de texte, dialogue inséré, description, lettre, etc.).
2. Évalue l'intérêt de l'invention, la cohérence narrative ou thématique, et la progression en paragraphes distincts.
3. Porte une attention rigoureuse à l'orthographe (accords grammaticaux, conjugaison des temps du récit, terminaisons verbales), à la syntaxe et à la ponctuation.
4. Valorise l'effort d'expression, la précision lexicale et les images poétiques ou expressives.`;
  } else {
    // dissertation
    roleContext = `Tu es un PROFESSEUR AGRÉGÉ DE LETTRES EN LYCÉE ET JURY DU BACCALAURÉAT DE FRANÇAIS (EAF) ET DE CONCOURS.
Ta mission est d'évaluer la dissertation littéraire ou générale d'un lycéen selon les plus hauts standards académiques.`;
    evaluationGuidelines = `Consignes d'évaluation pour une Dissertation de Lycée :
1. Problématisation : analyse des termes du sujet, mise au jour de la tension ou du paradoxe, formulation d'une question directrice féconde.
2. Structure : introduction canonique complète, plan dialectique, thématique ou analytique rigoureux en 2 ou 3 parties équilibrées, transitions soignées entre les grandes étapes, conclusion synthétique et stimulante.
3. Argumentation & Exemples : arguments clairs étayés par des analyses littéraires ou culturelles précises (citations, œuvres au programme ou de culture générale), rejet de la paraphrase ou du simple résumé d'intrigue.
4. Style & Rigueur : niveau de langue soutenu, vocabulaire critique et conceptuel précis, syntaxe complexe maîtrisée, orthographe sans faille.`;
  }

  // ── CAS 1 : Grille officielle désactivée -> Critères libres de l'enseignant ──
  if (disableStandardGrid) {
    const userRubric = customInstructions && customInstructions.trim() 
      ? customInstructions.trim() 
      : "Évaluer la qualité de l'argumentation, de la réflexion et de la maîtrise de la langue.";

    return `${roleContext}

═══════════════════════════════════════════
📋 MODE CRITÈRES LIBRES ET BARÈME PERSONNALISÉ DE L'ENSEIGNANT
═══════════════════════════════════════════
L'enseignant a formellement DÉSACTIVÉ la grille standard au profit de ses propres critères et exigences ci-après :

"""
${userRubric}
"""

La note globale finale est sur ${maxScore} points.
Tu dois évaluer la copie en identifiant et en appliquant fidèlement chacun des critères énoncés ci-dessus par l'enseignant.

═══════════════════════════════════════════
⚖️ PRINCIPES PÉDAGOGIQUES ET AUDIT
═══════════════════════════════════════════
${evaluationGuidelines}

Dans ton audit linguistique et stylistique :
- Relève les erreurs ou maladresses réelles dans la copie de l'élève (orthographe, grammaire, syntaxe, lexique imprécis, rupture de ton, faiblesse logique).
- Propose pour chaque erreur une correction immédiate et une explication claire de la règle ou de l'amélioration stylistique.
- Cite toujours des passages textuels réels de la copie de l'élève entre guillemets dans tes justifications.

═══════════════════════════════════════════
FORMAT DE SORTIE JSON STRICT ATTENDU
═══════════════════════════════════════════
Identifie les critères distincts définis par l'enseignant et produis le JSON suivant :
{
  "criteriaScores": {
    "cle_critere_1": number (note attribuée à l'élève pour ce critère),
    "cle_critere_2": number
  },
  "customCriteriaEvaluated": [
    {
      "key": "cle_critere_1",
      "label": "Libellé lisible du critère de l'enseignant",
      "maxScore": number (note maximale pour ce critère),
      "score": number (note attribuée à l'élève),
      "justification": "Justification détaillée citant des extraits textuels de la copie",
      "advice": "Conseil méthodologique concret"
    }
  ],
  "globalScore": number (total sur ${maxScore} points, somme cohérente des sous-notes),
  "justifications": {
    "cle_critere_1": "Justification détaillée avec citations de la copie"
  },
  "advices": {
    "cle_critere_1": "Conseil méthodologique concret"
  },
  "generalFeedback": "Bilan d'ensemble bienveillant et constructif sur la copie : points forts constatés, axes prioritaires d'effort et appréciation générale.",
  "errorsTable": [
    {
      "original": "segment fautif ou maladroit extrait textuellement de la copie",
      "correction": "forme corrigée ou formulation stylistique recommandée",
      "rule": "Explication pédagogique de la règle grammaticale ou du principe stylistique enfreint"
    }
  ]
}`;
  }

  // ── CAS 2 : Grille officielle appliquée (ajustée proportionnellement sur maxScore) ──
  const activeCriteria = (criteria && criteria.length > 0) ? criteria : getCompositionCriteria(compositionType, maxScore);
  const sumMax = activeCriteria.reduce((acc, c) => acc + c.maxScore, 0);
  const criteriaListStr = activeCriteria
    .map(c => `- ${c.label} (${c.key}) : note maximale ${c.maxScore} pt(s). ${c.description || ''}`)
    .join('\n');

  return `${roleContext}

═══════════════════════════════════════════
📋 GRILLE D'ÉVALUATION ET BARÈME
═══════════════════════════════════════════
La note globale finale est sur ${maxScore} points.
Les critères retenus sont les suivants (total de la grille : ${sumMax} points) :
${criteriaListStr}

═══════════════════════════════════════════
⚖️ PRINCIPES PÉDAGOGIQUES ET AUDIT
═══════════════════════════════════════════
${evaluationGuidelines}

Dans ton audit linguistique et stylistique :
- Relève les erreurs ou maladresses réelles dans la copie de l'élève (orthographe, grammaire, syntaxe, lexique imprécis, rupture de ton, faiblesse logique).
- Propose pour chaque erreur une correction immédiate et une explication claire de la règle ou de l'amélioration stylistique.
- Cite toujours des passages textuels réels de la copie de l'élève entre guillemets dans tes justifications.

═══════════════════════════════════════════
FORMAT DE SORTIE JSON STRICT ATTENDU
═══════════════════════════════════════════
{
  "criteriaScores": {
${activeCriteria.map(c => `    "${c.key}": number (entre 0 et ${c.maxScore})`).join(',\n')}
  },
  "globalScore": number (total sur ${maxScore} points, somme exacte des notes des critères ci-dessus),
  "justifications": {
${activeCriteria.map(c => `    "${c.key}": "Justification détaillée citant expressément des extraits de la copie"`).join(',\n')}
  },
  "advices": {
${activeCriteria.map(c => `    "${c.key}": "Conseil méthodologique et pédagogique concret pour progresser"`).join(',\n')}
  },
  "generalFeedback": "Bilan d'ensemble bienveillant et constructif sur la copie : points forts constatés, axes prioritaires d'effort et appréciation générale.",
  "errorsTable": [
    {
      "original": "segment fautif ou maladroit extrait textuellement de la copie",
      "correction": "forme corrigée ou formulation stylistique recommandée",
      "rule": "Explication pédagogique de la règle grammaticale ou du principe stylistique enfreint"
    }
  ]
}`;
}

/**
 * Construit le prompt utilisateur pour l'évaluation de la composition.
 */
export function buildCompositionUserPrompt(
  studentText: string,
  subject: string,
  corpusText?: string,
  customInstructions?: string,
  targetLanguage: string = 'Français',
  disableStandardGrid: boolean = false
): string {
  let corpusBlock = "";
  if (corpusText && corpusText.trim()) {
    corpusBlock = `\n═══════════════════════════════════════════\n📚 TEXTE SUPPORT OU CORPUS DOCUMENTAIRE :\n═══════════════════════════════════════════\n${corpusText.trim()}\n`;
  }

  let customBlock = "";
  if (customInstructions && customInstructions.trim()) {
    const title = disableStandardGrid 
      ? "📌 CRITÈRES PERSONNALISÉS ET BARÈME DE L'ENSEIGNANT :" 
      : "📌 CONSIGNES SPÉCIFIQUES COMPLÉMENTAIRES DE L'ENSEIGNANT :";
    customBlock = `\n═══════════════════════════════════════════\n${title}\n═══════════════════════════════════════════\n${customInstructions.trim()}\n`;
  }

  return `Voici les documents pour évaluer cette copie de composition (langue : ${targetLanguage}) :

═══════════════════════════════════════════
📌 SUJET / ÉNONCÉ DE LA COMPOSITION :
═══════════════════════════════════════════
${subject.trim()}
${corpusBlock}
═══════════════════════════════════════════
✍️ COPIE RÉDIGÉE DE L'ÉLÈVE :
═══════════════════════════════════════════
${studentText.trim()}
${customBlock}
Procède à l'évaluation méthodique de cette copie selon les consignes et renvoie le rapport au format JSON strict.`;
}
