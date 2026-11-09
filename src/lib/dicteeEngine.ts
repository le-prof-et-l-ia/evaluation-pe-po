/**
 * Moteur spécialisé pour l'épreuve de Dictée.
 * 
 * Principes clés :
 * 1. OCR manuscrit sans normalisation : l'IA a interdiction absolue de corriger les fautes de l'élève.
 * 2. L'IA repère et catégorise les erreurs par rapport au texte de référence officiel.
 * 3. Le code calcule la note de manière 100 % déterministe selon le barème de pénalités.
 */

import { DictationPenaltyConfig, DictationErrorItem, DictationResult, DEFAULT_DICTATION_PENALTIES } from './customExamTypes';

/**
 * Prompt OCR strict pour la dictée.
 * Impose de retranscrire mot à mot et caractère par caractère ce qui est écrit,
 * sans aucune correction automatique du français.
 */
export function getDictationOcrPrompt(): string {
  return `Tu es un transcripteur paléographique et expert OCR spécialisé dans la saisie de DICTÉES MANUSCRITES.
Ta mission est d'extraire le texte manuscrit de la copie d'examen de l'élève avec une FIDÉLITÉ ABSOLUE AU CARACTÈRE PRÈS.

⚠️⚠️ RÈGLE FONDAMENTALE DE LA DICTÉE : INTERDICTION STRICTE DE TOUTE CORRECTION AUTOMATIQUE ⚠️⚠️
1. Il s'agit d'une copie de DICTÉE. Le but de l'épreuve est précisément de mesurer les fautes d'orthographe de l'élève.
2. Il est FORMELLEMENT ET STRICTEMENT INTERDIT de corriger la moindre faute commise par l'élève :
   - Fautes d'accord ou de conjugaison (ex: si l'élève écrit « ils mange », « nous avon », « elle est partit », « ces idée », recopie EXACTEMENT cette graphie).
   - Fautes d'usage / orthographe lexicale (ex: si l'élève écrit « acceuil », « toujour », « developement », recopie EXACTEMENT cette graphie).
   - Accents omis, erronés ou inversés (ex: si l'élève écrit « a » au lieu de « à », « été » au lieu de « ete », ou omet un accent circonflexe/tréma, ne rajoute ni ne corrige AUCUN accent).
   - Majuscules et ponctuation : conserve scrupuleusement la présence ou l'absence des majuscules, points, virgules, tirets et guillemets tracés par l'élève.
   - Mots raturés ou rayés : ignore les mots complètement barrés/raturés.
3. Ne normalise JAMAIS le texte vers le bon français. Si un mot est ambigu mais ressemble clairement à une tentative erronée (ex: « apeller » avec un seul l), retranscris la graphie exacte de l'élève.

FORMAT DE SORTIE JSON STRICT :
{
  "studentName": "Nom et prénom si visibles sur la copie, sinon null",
  "transcription": "Texte intégral de la dictée recopié caractère par caractère sans correction"
}`;
}

/**
 * Génère le prompt système pour l'évaluation IA de la dictée.
 */
export function buildDictationSystemPrompt(): string {
  return `Tu es un CORRECTEUR OFFICIEL DE DICTÉE DE LANGUE FRANÇAISE.
Ton rôle est de comparer la copie de l'élève au texte officiel de la dictée, de repérer TOUTES les erreurs et de les classifier selon la nomenclature officielle.

⚠️ RÈGLES DE REPÉRAGE ET DE CLASSIFICATION DES FAUTES :
Compare le texte de l'élève au texte de référence mot à mot. Chaque divergence doit être enregistrée dans la liste des erreurs.

Catégories d'erreurs (champ "type") :
1. "grammar" (Faute de grammaire) :
   - Erreur d'accord sujet-verbe ou terminaison verbale (ex: « ils mange » au lieu de « ils mangent », infinitif au lieu de participe passé « mangé » / « manger »).
   - Erreur d'accord en genre et en nombre dans le groupe nominal (ex: « les table », « une grand maison »).
   - Confusion d'homophones grammaticaux fondamentaux (ex: a/à, et/est, ce/se, son/sont, c'est/s'est, ces/ses, leur/leurs, ou/où).
   - Erreur de mode ou de temps verbal contraire à la dictée.

2. "usage" (Faute d'usage / orthographe lexicale) :
   - Mauvaise graphie d'un mot (ex: « acceuil » pour « accueil », « toujour » pour « toujours », consonne double manquante ou en trop « apeller »).
   - Cédille manquante ou ajoutée à tort (ex: « garcon » pour « garçon »).
   - Trait d'union manquant ou erroné sur un mot composé.

3. "accent" (Faute d'accent) :
   - Accent aigu, grave ou circonflexe manquant, superfétatoire ou mal orienté sur une lettre qui ne crée pas d'homophone grammatical (ex: « fenetre » pour « fenêtre », « événement » / « évènement », « chêne »).
   - Tréma omis ou déplacé (ex: « mais » pour « maïs »).

4. "punctuation" (Faute de ponctuation et majuscules) :
   - Majuscule manquante en début de phrase ou sur un nom propre.
   - Majuscule indue en milieu de phrase.
   - Point, virgule, point d'interrogation, point d'exclamation ou guillemets omis ou ajoutés.

5. "omission" :
   - Mot ou groupe de mots présent dans la dictée de référence mais totalement absent de la copie de l'élève.

6. "addition" :
   - Mot inventé ou inséré par l'élève qui ne figure pas dans le texte officiel.

⚠️ DIRECTIVES IMPORTANTES :
- Ne sois ni laxiste ni imaginatif. Sois d'une rigueur absolue.
- Chaque erreur relevée doit citer exactement le segment d'origine de l'élève ("original"), la version correcte ("correction") et la règle pédagogique claire ("rule").
- Ne calcule pas la note finale : le calcul sera effectué de manière déterministe par le moteur logiciel.

FORMAT DE SORTIE JSON STRICT ATTENDU :
{
  "errors": [
    {
      "original": "segment écrit par l'élève",
      "correction": "segment correct attendu",
      "type": "grammar" | "usage" | "accent" | "punctuation" | "omission" | "addition",
      "rule": "Explication pédagogique brève de la règle transgressée"
    }
  ],
  "feedback": "Synthèse pédagogique bienveillante (2 à 4 phrases) soulignant les points forts et les axes d'amélioration orthographique prioritaires."
}`;
}

/**
 * Génère le prompt utilisateur pour l'évaluation de la dictée.
 */
export function buildDictationUserPrompt(studentText: string, referenceText: string, customInstructions?: string): string {
  let instructionsBlock = "";
  if (customInstructions && customInstructions.trim()) {
    instructionsBlock = `\n═══════════════════════════════════════════\n📌 CONSIGNES PARTICULIÈRES DE L'ENSEIGNANT :\n${customInstructions.trim()}\n═══════════════════════════════════════════\n`;
  }

  return `Voici le texte officiel de la dictée et la copie de l'élève à corriger :

═══════════════════════════════════════════
📖 TEXTE OFFICIEL DE LA DICTÉE (RÉFÉRENCE) :
═══════════════════════════════════════════
${referenceText.trim()}

═══════════════════════════════════════════
✍️ COPIE DE L'ÉLÈVE :
═══════════════════════════════════════════
${studentText.trim()}
${instructionsBlock}
Analyse scrupuleusement la copie de l'élève par rapport au texte de référence et renvoie le JSON des erreurs détectées.`;
}

/**
 * Calcule de manière 100 % déterministe la note de dictée à partir de la liste des erreurs.
 */
export function computeDictationScore(
  errors: DictationErrorItem[],
  penalties: DictationPenaltyConfig = DEFAULT_DICTATION_PENALTIES,
  maxScore: number = 10
): {
  globalScore: number;
  penaltiesTotal: number;
  errorsProcessed: DictationErrorItem[];
  breakdown: DictationResult['breakdown'];
} {
  const seenErrors = new Set<string>();
  let totalPenalty = 0;

  const breakdown = {
    grammar: { count: 0, penaltyPoints: 0 },
    usage: { count: 0, penaltyPoints: 0 },
    accent: { count: 0, penaltyPoints: 0 },
    punctuation: { count: 0, penaltyPoints: 0 },
    omission: { count: 0, penaltyPoints: 0 },
    addition: { count: 0, penaltyPoints: 0 },
  };

  const processed: DictationErrorItem[] = [];

  for (const err of errors) {
    const normKey = `${err.type}:${(err.original || '').trim().toLowerCase()}->${(err.correction || '').trim().toLowerCase()}`;
    const isRepeat = seenErrors.has(normKey);

    let penaltyValue = 0;
    if (penalties.countRepeatedOnce && isRepeat) {
      // Faute répétée : comptée 0 pt supplémentaire
      penaltyValue = 0;
    } else {
      switch (err.type) {
        case 'grammar':
          penaltyValue = penalties.grammar;
          break;
        case 'usage':
          penaltyValue = penalties.usage;
          break;
        case 'accent':
          penaltyValue = penalties.accent;
          break;
        case 'punctuation':
          penaltyValue = penalties.punctuation;
          break;
        case 'omission':
          penaltyValue = penalties.omissionWord;
          break;
        case 'addition':
          penaltyValue = penalties.usage; // pénalité assimilée usage
          break;
        default:
          penaltyValue = penalties.usage;
      }
      seenErrors.add(normKey);
    }

    totalPenalty += penaltyValue;

    if (breakdown[err.type]) {
      breakdown[err.type].count += 1;
      breakdown[err.type].penaltyPoints += penaltyValue;
    }

    processed.push({
      ...err,
      penaltyApplied: penaltyValue,
      isRepeated: isRepeat,
    });
  }

  // Calcul final : Note = NoteMax - Pénalités
  const rawScore = maxScore - totalPenalty;
  const finalScore = penalties.allowNegative ? rawScore : Math.max(0, rawScore);
  const roundedFinalScore = Math.round(finalScore * 100) / 100;
  const roundedPenalties = Math.round(totalPenalty * 100) / 100;

  return {
    globalScore: roundedFinalScore,
    penaltiesTotal: roundedPenalties,
    errorsProcessed: processed,
    breakdown,
  };
}
