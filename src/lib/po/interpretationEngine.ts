/**
 * Moteur spécialisé pour l'épreuve d'Interprétation (Production Orale).
 * Analyse la prestation orale d'un étudiant à partir de son enregistrement audio
 * et la compare au discours source original.
 */

import { CustomCriterion } from '../customExamTypes';

export interface InterpretationErrorItem {
  type: 'contresens' | 'faux_sens' | 'omission' | 'ajout_injustifie' | 'terminologie' | 'syntaxe' | 'hesitation';
  sourceSegment?: string;
  studentSpokenSegment: string;
  recommendation: string;
  explanation: string;
}

export interface InterpretationResult {
  examType: 'interpretation';
  globalScore: number;
  maxScore: number;
  criteriaScores: Record<string, number>;
  justifications: Record<string, string>;
  advices?: Record<string, string>;
  errorsTable: Array<{
    original: string;       // segment prononcé
    correction: string;     // formulation recommandée
    rule: string;           // nature de l'erreur + explication
  }>;
  detailedErrors: InterpretationErrorItem[];
  transcription: string;   // retranscription de la prestation orale de l'étudiant
  sourceSpeech: string;    // discours d'origine
  mode: 'consecutive' | 'simultaneous';
  sourceLanguage: string;
  targetLanguage: string;
  studentName?: string | null;
  studentEmail?: string | null;
}

export const DEFAULT_INTERPRETATION_CRITERIA: CustomCriterion[] = [
  { key: 'fidelite', label: 'Fidélité au message et exhaustivité', maxScore: 4, description: 'Transmission exacte des idées clés, absence de contresens ou d\'omissions critiques' },
  { key: 'langue_arrivee', label: 'Qualité et correction de la langue d\'arrivée', maxScore: 3, description: 'Grammaire orale, correction syntaxique et idiomaticité' },
  { key: 'terminologie', label: 'Précision lexicale et terminologique', maxScore: 2, description: 'Exactitude des termes spécialisés et nuances conceptuelles' },
  { key: 'fluidite_technique', label: 'Fluidité, débit et technique d\'interprétation', maxScore: 1, description: 'Gestion du temps, absence de tics verbaux ou d\'hésitations bloquantes' },
];

export function buildInterpretationSystemPrompt(
  maxScore: number = 10,
  mode: 'consecutive' | 'simultaneous' = 'consecutive',
  sourceLang: string = "Français",
  targetLang: string = "Français",
  criteria: CustomCriterion[] = DEFAULT_INTERPRETATION_CRITERIA
): string {
  const criteriaListStr = criteria.map(c => `- ${c.label} (${c.key}) : note maximale ${c.maxScore} pt(s). ${c.description || ''}`).join('\n');
  const sumMax = criteria.reduce((acc, c) => acc + c.maxScore, 0);

  return `Tu es un INTERPRÈTE DE CONFÉRENCE CHEF ET JURY D'EXAMEN D'INTERPRÉTATION (${mode === 'consecutive' ? 'Consécutive' : 'Simultanée'}, ${sourceLang} ➔ ${targetLang}).
Ta mission est d'évaluer la prestation orale restituée par un étudiant-interprète, comparée au discours source original qui lui a été prononcé.

═══════════════════════════════════════════
📋 MODALITÉ ET CRITÈRES D'ÉVALUATION
═══════════════════════════════════════════
Modalité : Interprétation ${mode === 'consecutive' ? 'Consécutive (prise de notes puis restitution)' : 'Simultanée'}.
Note globale finale : sur ${maxScore} points.
Barème de référence (${sumMax} pts) :
${criteriaListStr}

═══════════════════════════════════════════
🎯 ANALYSE COMPARATIVE OBLIGATOIRE
═══════════════════════════════════════════
1. Rendu du sens :
   - Relever les omissions majeures (chiffres, noms propres, arguments charnières manquants).
   - Signaler les contresens et faux-sens.
   - Vérifier si l'interprète a inventé des informations absentes du discours ("ajouts injustifiés").
2. Qualité de la langue d'arrivée :
   - Clarté des structures verbales à l'oral.
   - Naturel des expressions idiomatiques et des collocations.
3. Technique et débit :
   - Fluidité générale, gestion du décalage (décalage de restitution), rythme et clarté d'élocution.

FORMAT DE SORTIE JSON STRICT ATTENDU :
{
  "criteriaScores": {
${criteria.map(c => `    "${c.key}": number (entre 0 et ${c.maxScore})`).join(',\n')}
  },
  "globalScore": number (total ramené sur ${maxScore}),
  "justifications": {
${criteria.map(c => `    "${c.key}": "Justification précise citant le discours source et la transcription de l'étudiant"`).join(',\n')}
  },
  "advices": {
    "technique": "Conseil spécifique sur la prise de notes ou le décalage d'interprétation",
    "langue": "Conseil linguistique ciblé"
  },
  "errorsTable": [
    {
      "original": "segment prononcé par l'élève",
      "correction": "formulation professionnelle recommandée",
      "rule": "[Type de manquement] Explication concrète par rapport au discours original"
    }
  ],
  "detailedErrors": [
    {
      "type": "contresens" | "faux_sens" | "omission" | "ajout_injustifie" | "terminologie" | "syntaxe" | "hesitation",
      "sourceSegment": "segment du discours original",
      "studentSpokenSegment": "segment prononcé par l'étudiant",
      "recommendation": "recommandation",
      "explanation": "explication"
    }
  ]
}`;
}

export function buildInterpretationUserPrompt(
  studentTranscription: string,
  sourceSpeech: string,
  customInstructions?: string
): string {
  let customBlock = "";
  if (customInstructions && customInstructions.trim()) {
    customBlock = `\n═══════════════════════════════════════════\n📌 CONSIGNES PARTICULIÈRES DU JURY :\n═══════════════════════════════════════════\n${customInstructions.trim()}\n`;
  }

  return `Voici les éléments pour évaluer cette épreuve d'interprétation :

═══════════════════════════════════════════
🎙️ DISCOURS SOURCE ORIGINAL (ÉMIS PAR L'ORATEUR) :
═══════════════════════════════════════════
${sourceSpeech.trim()}

═══════════════════════════════════════════
🗣️ RESTITUTION DE L'ÉTUDIANT (TRANSCRIPTION AUDIO) :
═══════════════════════════════════════════
${studentTranscription.trim()}
${customBlock}
Évalue minutieusement la prestation de l'interprète et retourne le rapport au format JSON strict.`;
}

/**
 * Consignes de transcription d'une prestation d'interprétation (dossier d'échange,
 * pour une application d'IA de bureau qui a accès aux fichiers audio).
 * La transcription doit rester fidèle : c'est elle seule que l'évaluateur externe lira.
 */
export function getInterpretationTranscriptionPrompt(): string {
  return `Tu transcris l'enregistrement d'un étudiant-interprète qui restitue un discours.
RÈGLES :
1. Transcris mot à mot ce que dit l'étudiant, dans la langue où il parle, SANS corriger ni reformuler : fautes de langue, calques, phrases inachevées et omissions restent tels quels.
2. Note les hésitations et les reprises telles qu'elles s'entendent (« euh », « hum », mots répétés, autocorrections), et les silences notables sous la forme [pause] ou [silence long].
3. Ce qui est inaudible est noté [inaudible] ; ne devine jamais un passage que tu n'entends pas.
4. Ne transcris pas le discours de l'orateur s'il est présent sur l'enregistrement : uniquement la restitution de l'étudiant.

FORMAT DE SORTIE JSON STRICT :
{
  "studentName": "Nom et prénom s'ils sont annoncés, sinon null",
  "transcription": "Transcription intégrale et fidèle de la restitution de l'étudiant"
}`;
}
