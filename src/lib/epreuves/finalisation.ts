/**
 * Finalisation des épreuves hors DELF (dictée, traduction, grammaire, composition,
 * interprétation) : transforme la réponse brute d'une IA en résultat affichable.
 *
 * Un seul code par épreuve, que la correction soit interne (Gemini) ou externe
 * (Claude, ChatGPT… par copier-coller ou dossier d'échange) : même réponse brute,
 * même résultat. Module pur, sans dépendance réseau (utilisable côté client).
 */
import { computeDictationScore } from '../dicteeEngine';
import { computeGrammarGlobalScore } from '../grammaireEngine';
import { DEFAULT_TRANSLATION_CRITERIA } from '../traductionEngine';
import { getCompositionCriteria, type CompositionSubType } from '../compositionEngine';
import { DEFAULT_INTERPRETATION_CRITERIA } from '../po/interpretationEngine';
import type { CustomCriterion, DictationPenaltyConfig } from '../customExamTypes';

// ─── Paramètres de chaque épreuve ────────────────────────────────────────────

export interface ParamsDictee {
  referenceText: string;
  maxScore: number;
  penalties?: DictationPenaltyConfig;
  customInstructions?: string;
}

export interface ParamsTraduction {
  sourceText: string;
  maxScore: number;
  modelTranslation?: string;
  customInstructions?: string;
  sourceLang: string;
  targetLang: string;
  criteria?: CustomCriterion[];
}

export interface ParamsGrammaire {
  exerciseSubject: string;
  maxScore: number;
  answerKey?: string;
  customInstructions?: string;
}

export interface ParamsComposition {
  subject: string;
  compositionType: CompositionSubType;
  maxScore: number;
  corpusText?: string;
  targetLanguage: string;
  customInstructions?: string;
  criteria?: CustomCriterion[];
  disableStandardGrid: boolean;
}

export interface ParamsInterpretation {
  sourceSpeech: string;
  maxScore: number;
  mode: 'consecutive' | 'simultaneous';
  sourceLang: string;
  targetLang: string;
  criteria?: CustomCriterion[];
  customInstructions?: string;
}

// ─── Outils communs ──────────────────────────────────────────────────────────

const arrondi2 = (n: number) => Math.round(n * 100) / 100;

const TYPES_FAUTE_DICTEE = ['grammar', 'usage', 'accent', 'punctuation', 'omission', 'addition'] as const;

/** Grille effectivement appliquée à une traduction. */
export function criteresTraduction(p: ParamsTraduction): CustomCriterion[] {
  return p.criteria && p.criteria.length > 0 ? p.criteria : DEFAULT_TRANSLATION_CRITERIA;
}

/** Grille effectivement appliquée à une interprétation. */
export function criteresInterpretation(p: ParamsInterpretation): CustomCriterion[] {
  return p.criteria && p.criteria.length > 0 ? p.criteria : DEFAULT_INTERPRETATION_CRITERIA;
}

/** Grille effectivement appliquée à une composition (vide en mode « critères libres »). */
export function criteresComposition(p: ParamsComposition): CustomCriterion[] {
  if (p.disableStandardGrid) return [];
  return (p.criteria && p.criteria.length > 0) ? p.criteria : getCompositionCriteria(p.compositionType, p.maxScore);
}

/**
 * Note globale calculée par le code à partir des notes par critère :
 * chaque critère est borné à [0, son maximum], puis la somme est ramenée au barème
 * de l'épreuve si la grille ne totalise pas exactement `noteMax`.
 * La note globale proposée par l'IA n'est jamais reprise.
 */
export function noteDepuisCriteres(
  notes: Record<string, unknown> | undefined | null,
  criteres: { key: string; maxScore?: number }[],
  noteMax: number,
): { criteriaScores: Record<string, number>; globalScore: number } {
  const source = notes && typeof notes === 'object' ? notes : {};
  const criteriaScores: Record<string, number> = {};
  let somme = 0;
  let sommeMax = 0;
  let maxConnus = true;
  for (const c of criteres) {
    const max = Number(c.maxScore);
    if (Number.isFinite(max) && max > 0) sommeMax += max; else maxConnus = false;
    const brut = (source as any)[c.key];
    if (brut === undefined || brut === null || brut === '') continue;
    let v = Number(brut);
    if (!Number.isFinite(v)) v = 0;
    if (v < 0) v = 0;
    if (Number.isFinite(max) && max > 0 && v > max) v = max;
    v = arrondi2(v);
    criteriaScores[c.key] = v;
    somme += v;
  }
  let total = somme;
  if (maxConnus && sommeMax > 0 && noteMax > 0 && Math.abs(sommeMax - noteMax) > 0.01) {
    total = (somme / sommeMax) * noteMax;
  }
  if (noteMax > 0) total = Math.min(total, noteMax);
  total = Math.max(0, total);
  return { criteriaScores, globalScore: arrondi2(total) };
}

// ─── Dictée ──────────────────────────────────────────────────────────────────

export function validerDictee(brut: any): string | null {
  if (!brut || typeof brut !== 'object') return "La réponse n'est pas un objet JSON.";
  if (!Array.isArray(brut.errors)) return "Le champ « errors » (liste des fautes) est absent.";
  return null;
}

export function finaliserDictee(brut: any, transcription: string, p: ParamsDictee) {
  const rawErrors: any[] = Array.isArray(brut?.errors) ? brut.errors : [];
  // Une faute de type inconnu est comptée comme une faute d'usage.
  const errors = rawErrors
    .filter(e => e && typeof e === 'object')
    .map(e => ({
      ...e,
      original: typeof e.original === 'string' ? e.original : String(e.original ?? ''),
      correction: typeof e.correction === 'string' ? e.correction : String(e.correction ?? ''),
      rule: typeof e.rule === 'string' ? e.rule : String(e.rule ?? ''),
      type: (TYPES_FAUTE_DICTEE as readonly string[]).includes(e.type) ? e.type : 'usage',
    }));
  const scoreCalc = computeDictationScore(errors, p.penalties, p.maxScore);

  return {
    examType: 'dictee' as const,
    globalScore: scoreCalc.globalScore,
    maxScore: p.maxScore,
    penaltiesTotal: scoreCalc.penaltiesTotal,
    errors: scoreCalc.errorsProcessed,
    breakdown: scoreCalc.breakdown,
    transcription,
    referenceText: p.referenceText,
    feedback: typeof brut?.feedback === 'string' ? brut.feedback : '',
    studentName: null as string | null,
    studentEmail: null as string | null,
    errorsTable: scoreCalc.errorsProcessed.map(e => ({
      original: e.original,
      correction: e.correction,
      rule: `[${e.type.toUpperCase()}${e.isRepeated ? ' - Répétée' : ''} : -${e.penaltyApplied} pt] ${e.rule}`
    }))
  };
}

// ─── Grammaire ───────────────────────────────────────────────────────────────

export function validerGrammaire(brut: any): string | null {
  if (!brut || typeof brut !== 'object') return "La réponse n'est pas un objet JSON.";
  if (!Array.isArray(brut.items) || brut.items.length === 0) return "Le champ « items » (évaluation item par item) est absent ou vide.";
  return null;
}

export function finaliserGrammaire(brut: any, transcription: string, p: ParamsGrammaire) {
  const rawItems: any[] = Array.isArray(brut?.items) ? brut.items : [];
  // Chaque item est borné à [0, son barème].
  const items = rawItems
    .filter(it => it && typeof it === 'object')
    .map(it => {
      const max = Number(it.maxScoreItem);
      let score = Number(it.scoreAwarded);
      if (!Number.isFinite(score) || score < 0) score = 0;
      if (Number.isFinite(max) && max >= 0 && score > max) score = max;
      return { ...it, scoreAwarded: score };
    });
  const globalScore = computeGrammarGlobalScore(items, p.maxScore);

  return {
    examType: 'grammaire' as const,
    globalScore,
    maxScore: p.maxScore,
    items,
    summaryFeedback: typeof brut?.summaryFeedback === 'string' ? brut.summaryFeedback : '',
    errorsTable: Array.isArray(brut?.errorsTable) ? brut.errorsTable : [],
    transcription,
    subject: p.exerciseSubject,
    answerKey: p.answerKey || '',
    studentName: null as string | null,
    studentEmail: null as string | null
  };
}

// ─── Traduction ──────────────────────────────────────────────────────────────

function validerCriteres(brut: any, criteres: CustomCriterion[]): string | null {
  if (!brut || typeof brut !== 'object') return "La réponse n'est pas un objet JSON.";
  const cs = brut.criteriaScores;
  if (!cs || typeof cs !== 'object') return "Le champ « criteriaScores » (notes par critère) est absent.";
  const manquants = criteres.filter(c => cs[c.key] === undefined || cs[c.key] === null || !Number.isFinite(Number(cs[c.key])));
  if (manquants.length > 0) return `Note manquante ou invalide pour : ${manquants.map(c => c.key).join(', ')}.`;
  return null;
}

export function validerTraduction(brut: any, p: ParamsTraduction): string | null {
  return validerCriteres(brut, criteresTraduction(p));
}

export function finaliserTraduction(brut: any, transcription: string, p: ParamsTraduction) {
  const { criteriaScores, globalScore } = noteDepuisCriteres(brut?.criteriaScores, criteresTraduction(p), p.maxScore);

  return {
    examType: 'traduction' as const,
    globalScore,
    maxScore: p.maxScore,
    criteriaScores,
    justifications: brut?.justifications || {},
    advices: brut?.advices || {},
    errorsTable: Array.isArray(brut?.errorsTable) ? brut.errorsTable : [],
    detailedErrors: Array.isArray(brut?.detailedErrors) ? brut.detailedErrors : [],
    transcription,
    sourceText: p.sourceText,
    modelTranslation: p.modelTranslation,
    studentName: null as string | null,
    studentEmail: null as string | null
  };
}

// ─── Composition ─────────────────────────────────────────────────────────────

export function validerComposition(brut: any, p: ParamsComposition): string | null {
  if (!brut || typeof brut !== 'object') return "La réponse n'est pas un objet JSON.";
  if (p.disableStandardGrid) {
    const libres = Array.isArray(brut.customCriteriaEvaluated) ? brut.customCriteriaEvaluated : [];
    const notes = brut.criteriaScores && typeof brut.criteriaScores === 'object' ? brut.criteriaScores : {};
    if (libres.length === 0 && Object.keys(notes).length === 0) {
      return "Aucun critère noté (« customCriteriaEvaluated » et « criteriaScores » absents).";
    }
    return null;
  }
  return validerCriteres(brut, criteresComposition(p));
}

export function finaliserComposition(brut: any, transcription: string, p: ParamsComposition) {
  const activeCriteria = criteresComposition(p);
  const rawScores: Record<string, unknown> = { ...(brut?.criteriaScores || {}) };
  const justifications: Record<string, string> = { ...(brut?.justifications || {}) };
  const advices: Record<string, string> = { ...(brut?.advices || {}) };
  const customCriteriaEvaluated: any[] = Array.isArray(brut?.customCriteriaEvaluated)
    ? brut.customCriteriaEvaluated.filter((c: any) => c && typeof c === 'object' && c.key)
    : [];

  // En mode critères libres, synchroniser les maps avec customCriteriaEvaluated
  if (p.disableStandardGrid && customCriteriaEvaluated.length > 0) {
    customCriteriaEvaluated.forEach((c: any) => {
      if (rawScores[c.key] === undefined && c.score !== undefined) rawScores[c.key] = c.score;
      if (!justifications[c.key] && c.justification) justifications[c.key] = c.justification;
      if (!advices[c.key] && c.advice) advices[c.key] = c.advice;
    });
  }

  let listToSum: { key: string; maxScore?: number }[];
  if (p.disableStandardGrid) {
    listToSum = customCriteriaEvaluated.length > 0
      ? customCriteriaEvaluated.map((c: any) => ({ key: c.key, maxScore: Number(c.maxScore) }))
      : Object.keys(rawScores).map(key => ({ key }));
  } else {
    listToSum = activeCriteria;
  }
  const { criteriaScores, globalScore } = noteDepuisCriteres(rawScores, listToSum, p.maxScore);

  // Les critères libres affichent la note bornée retenue.
  const libresBornes = customCriteriaEvaluated.map((c: any) => (
    criteriaScores[c.key] !== undefined ? { ...c, score: criteriaScores[c.key] } : c
  ));

  return {
    examType: 'composition' as const,
    compositionType: p.compositionType,
    targetLanguage: p.targetLanguage,
    globalScore,
    maxScore: p.maxScore,
    disableStandardGrid: !!p.disableStandardGrid,
    customCriteriaEvaluated: libresBornes.length > 0 ? libresBornes : undefined,
    criteriaScores,
    justifications,
    advices,
    generalFeedback: typeof brut?.generalFeedback === 'string' ? brut.generalFeedback : '',
    errorsTable: Array.isArray(brut?.errorsTable) ? brut.errorsTable : [],
    transcription,
    subject: p.subject,
    corpusText: p.corpusText,
    customInstructions: p.customInstructions,
    studentName: null as string | null,
    studentEmail: null as string | null
  };
}

// ─── Interprétation (PO) ─────────────────────────────────────────────────────

export function validerInterpretation(brut: any, p: ParamsInterpretation): string | null {
  return validerCriteres(brut, criteresInterpretation(p));
}

export function finaliserInterpretation(brut: any, transcription: string, p: ParamsInterpretation) {
  const { criteriaScores, globalScore } = noteDepuisCriteres(brut?.criteriaScores, criteresInterpretation(p), p.maxScore);

  return {
    examType: 'interpretation' as const,
    globalScore,
    maxScore: p.maxScore,
    criteriaScores,
    justifications: brut?.justifications || {},
    advices: brut?.advices || {},
    errorsTable: Array.isArray(brut?.errorsTable) ? brut.errorsTable : [],
    detailedErrors: Array.isArray(brut?.detailedErrors) ? brut.detailedErrors : [],
    transcription,
    sourceSpeech: p.sourceSpeech,
    mode: p.mode,
    sourceLanguage: p.sourceLang,
    targetLanguage: p.targetLang,
    studentName: null as string | null,
    studentEmail: null as string | null
  };
}
