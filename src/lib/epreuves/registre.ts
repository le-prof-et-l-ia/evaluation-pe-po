/**
 * Registre des épreuves : pour chaque type d'épreuve, ce qu'il faut savoir pour la
 * faire corriger par une IA externe (Claude, ChatGPT…) sans clé API :
 * consignes de correction, documents de référence, bloc d'une copie, format de
 * réponse attendu, validation et finalisation de la réponse.
 *
 * Les consignes de correction sont EXACTEMENT celles de la correction interne
 * (mêmes fonctions build*SystemPrompt) et la finalisation est la même fonction
 * (src/lib/epreuves/finalisation.ts) : une copie corrigée par Claude reçoit le
 * même calcul de note qu'une copie corrigée par Gemini.
 *
 * Le DELF (PE et PO) y figure aussi, avec ses fonctions existantes.
 */
import type { CustomCriterion, DictationPenaltyConfig } from '../customExamTypes';
import { buildDictationSystemPrompt, getDictationOcrPrompt } from '../dicteeEngine';
import { buildTranslationSystemPrompt } from '../traductionEngine';
import { buildGrammarSystemPrompt } from '../grammaireEngine';
import { buildCompositionSystemPrompt, getCompositionTypeLabel, type CompositionSubType } from '../compositionEngine';
import { buildInterpretationSystemPrompt, getInterpretationTranscriptionPrompt } from '../po/interpretationEngine';
import { getOcrPrompt } from '../promptUtils';
import {
  buildExternalInitialMarkdown as buildDelfPEMarkdown,
  finalizeExternalInitial as finalizeDelfPE,
  type ExternalSupervisionConfig as ConfigDelfPE,
} from '../externalSupervision';
import {
  buildExternalInitialMarkdown as buildDelfPOMarkdown,
  finalizeExternalInitial as finalizeDelfPO,
  CRITERIA_BY_LEVEL as CRITERES_DELF_PO,
  type ExternalSupervisionConfig as ConfigDelfPO,
} from '../po/externalSupervision';
import {
  finaliserDictee, validerDictee, type ParamsDictee,
  finaliserTraduction, validerTraduction, criteresTraduction, type ParamsTraduction,
  finaliserGrammaire, validerGrammaire, type ParamsGrammaire,
  finaliserComposition, validerComposition, criteresComposition, type ParamsComposition,
  finaliserInterpretation, validerInterpretation, criteresInterpretation, type ParamsInterpretation,
} from './finalisation';

// ─── Types ───────────────────────────────────────────────────────────────────

export type SectionEpreuve = 'pe' | 'po';
export type IdEpreuve = 'delf' | 'dictee' | 'traduction' | 'grammaire' | 'composition' | 'interpretation';

/**
 * Configuration d'une épreuve hors DELF, telle que la page la transmet
 * (même forme pour la copie unique, le lot, le copier-coller et le dossier d'échange).
 */
export interface ConfigEpreuve {
  maxScore?: number;
  /** Dictée : texte officiel. Traduction : texte source. Grammaire : énoncé. Composition : sujet. Interprétation : discours source. */
  referenceText?: string;
  /** Traduction : traduction de référence. */
  modelTranslation?: string;
  /** Grammaire : corrigé. */
  answerKey?: string;
  customInstructions?: string;
  dictationPenalties?: DictationPenaltyConfig;
  sourceLanguage?: string;
  targetLanguage?: string;
  interpretationMode?: 'consecutive' | 'simultaneous';
  criteria?: CustomCriterion[];
  compositionType?: CompositionSubType;
  corpusText?: string;
  disableStandardGrid?: boolean;
}

/** Contexte complet : configuration hors DELF, ou réglages DELF (PE ou PO). */
export interface ContexteEpreuve {
  config?: ConfigEpreuve;
  delfPE?: ConfigDelfPE;
  delfPO?: ConfigDelfPO;
}

export interface TacheExterne {
  fileId: string;
  subject: string;
  transcription: string;
}

export interface EpreuveRegistre {
  id: IdEpreuve;
  section: SectionEpreuve;
  libelle: string;
  /** Corrigeable par une IA externe (copier-coller et dossier d'échange). */
  evaluationExterne: boolean;
  /** Double évaluation (interne ou externe) : DELF uniquement (décision C). */
  doubleEvaluation: boolean;
  /** Taille de sous-lot proposée par défaut pour le copier-coller. */
  tailleSousLot: number;
  /** Message affiché à l'enseignant dans la fenêtre d'évaluation externe. */
  avertissement?: string;
  /** Configuration incomplète → message d'erreur, sinon null. */
  verifierConfig(ctx: ContexteEpreuve): string | null;
  /** Consignes de correction (prompt système de la correction interne). */
  consignesCorrection(ctx: ContexteEpreuve): string;
  /** Documents communs à toutes les copies (texte de référence, corrigé, corpus…), écrits une seule fois. */
  documentsReference(ctx: ContexteEpreuve, texteSeul?: boolean): string;
  /** Bloc propre à une copie. */
  blocCopie(transcription: string): string;
  /** Rappel du contenu attendu dans le champ `evaluation`. */
  formatEvaluation(ctx: ContexteEpreuve): string;
  /** Réponse brute exploitable ? (message d'erreur, sinon null). */
  valider(brut: any, ctx: ContexteEpreuve): string | null;
  /** Résultat final (même forme que la correction interne). Lève une erreur si la réponse est inexploitable. */
  finaliser(brut: any, tache: TacheExterne, ctx: ContexteEpreuve): any;
  /** Document Markdown complet à donner à l'IA externe pour un sous-lot. */
  genererConsignes(taches: TacheExterne[], ctx: ContexteEpreuve): string;
}

// ─── Conversion de la configuration vers les paramètres de chaque épreuve ────

const texte = (s?: string) => (s || '').trim();
const num = (n: unknown, defaut: number) => (Number(n) > 0 ? Number(n) : defaut);

export function paramsDictee(c: ConfigEpreuve = {}): ParamsDictee {
  return { referenceText: c.referenceText || '', maxScore: num(c.maxScore, 10), penalties: c.dictationPenalties, customInstructions: c.customInstructions };
}
export function paramsTraduction(c: ConfigEpreuve = {}): ParamsTraduction {
  return {
    sourceText: c.referenceText || '', maxScore: num(c.maxScore, 10), modelTranslation: c.modelTranslation,
    customInstructions: c.customInstructions, sourceLang: c.sourceLanguage || 'Français', targetLang: c.targetLanguage || 'Français',
    criteria: c.criteria,
  };
}
export function paramsGrammaire(c: ConfigEpreuve = {}): ParamsGrammaire {
  return { exerciseSubject: c.referenceText || '', maxScore: num(c.maxScore, 10), answerKey: c.answerKey, customInstructions: c.customInstructions };
}
export function paramsComposition(c: ConfigEpreuve = {}): ParamsComposition {
  return {
    subject: c.referenceText || '', compositionType: c.compositionType || 'essai', maxScore: num(c.maxScore, 20),
    corpusText: c.corpusText, targetLanguage: c.targetLanguage || 'Français', customInstructions: c.customInstructions,
    criteria: c.criteria, disableStandardGrid: !!c.disableStandardGrid,
  };
}
export function paramsInterpretation(c: ConfigEpreuve = {}): ParamsInterpretation {
  return {
    sourceSpeech: c.referenceText || '', maxScore: num(c.maxScore, 10), mode: c.interpretationMode || 'consecutive',
    sourceLang: c.sourceLanguage || 'Français', targetLang: c.targetLanguage || 'Français',
    criteria: c.criteria, customInstructions: c.customInstructions,
  };
}

// ─── Blocs de texte communs ──────────────────────────────────────────────────

const SEP = '═══════════════════════════════════════════';
const bloc = (titre: string, contenu?: string) => (texte(contenu) ? `${SEP}\n${titre}\n${SEP}\n${texte(contenu)}\n` : '');

const listeCles = (criteres: { key: string; maxScore: number }[]) =>
  criteres.map(c => `\`${c.key}\` (0 à ${c.maxScore})`).join(', ');

const CONSIGNE_INTERPRETATION_TEXTE = `Tu ne disposes que d'une TRANSCRIPTION ÉCRITE de chaque prestation. Pour le critère de fluidité et de technique, ne juge que ce que la transcription laisse voir (hésitations, reprises, phrases inachevées) et précise dans la justification que la prononciation et le débit n'ont pas pu être entendus.`;
const CONSIGNE_INTERPRETATION_COPIE_TEXTE = `Pour cette prestation fournie sous forme de transcription seule, ne juge la fluidité et la technique qu'à partir des hésitations, reprises ou phrases inachevées visibles dans le texte. Indique dans la justification que la prononciation et le débit n'ont pas pu être entendus.`;
const CONSIGNE_INTERPRETATION_AUDIO = `Pour cette prestation fournie sous forme audio, appuie le critère de fluidité et de technique sur les indices accessibles dans l'enregistrement (hésitations, débit, rythme et clarté). Si tu ne peux pas écouter l'audio, justifie ce critère à partir des seuls indices de la transcription et indique les limites de ton évaluation.`;

/** Générateur commun aux épreuves hors DELF : consignes une fois, puis un bloc par copie. */
function genererConsignesGeneriques(e: EpreuveRegistre, taches: TacheExterne[], ctx: ContexteEpreuve): string {
  const ids = taches.map(t => JSON.stringify(t.fileId)).join(', ');
  const sansTranscription = taches.some(t => !texte(t.transcription));
  const estOral = e.section === 'po';
  const correction = e.consignesCorrection(ctx);
  const consignesCorrection = sansTranscription
    ? correction
      .replace(/^FORMAT DE SORTIE JSON STRICT ATTENDU[ \t]*:?$/m, 'STRUCTURE DU CHAMP « evaluation » DANS LE TABLEAU FINAL')
      .replace("Identifie les critères distincts définis par l'enseignant et produis le JSON suivant :",
        "Identifie les critères distincts définis par l'enseignant et renseigne les champs suivants dans « evaluation » :")
    : correction;

  const sectionTranscription = sansTranscription
    ? `
## ${estOral ? '🎙️' : '📷'} Étape 1 — Transcription préalable ${estOral ? "de l'enregistrement audio" : 'OCR de la copie'} (Accélération GPU locale prioritaire)
Pour toute copie dont la transcription n'est pas fournie ci-dessous, **transcris fidèlement ${estOral ? 'le fichier audio joint' : "l'image ou le PDF joint"}** avant de l'évaluer. Dans le tableau final, place le texte intégral dans \`evaluation.transcription\`. Ajoute \`evaluation.studentName\` et \`evaluation.studentEmail\` si ces renseignements sont ${estOral ? "annoncés dans l'enregistrement" : 'visibles sur la copie'}. Pour les copies déjà transcrites, utilise le texte fourni.

⚡ **PRIORITÉ À L'ACCÉLÉRATION MATÉRIELLE (CARTE GRAPHIQUE / GPU LOCAL)** :
- Si tu disposes d'un accès aux outils locaux de l'ordinateur (agent local, Claude Desktop avec MCP, terminal, Python), **privilégie impérativement une ${estOral ? 'transcription audio locale accélérée par la carte graphique (GPU CUDA / TensorRT / Apple Metal, ex. Whisper ou faster-whisper sur GPU)' : 'reconnaissance OCR locale accélérée par la carte graphique (GPU CUDA / TensorRT / DirectML / Apple Metal)'}** si l'ordinateur en est équipé, afin que la transcription soit beaucoup plus rapide.
- Si tu fonctionnes dans une interface web ou sans GPU local accessible, utilise directement ta capacité ${estOral ? "d'écoute multimodale" : 'de vision multimodale'} native sur le fichier joint.

### Consignes de transcription à respecter scrupuleusement :
${e.id === 'dictee' ? getDictationOcrPrompt(true) : estOral ? getInterpretationTranscriptionPrompt(true) : getOcrPrompt('B2', undefined, 'embedded-copy')}
`
    : '';

  const entete = `# Évaluation externe — ${e.libelle}${sansTranscription ? ` (Transcription ${estOral ? 'Audio' : 'OCR'} + Évaluation en une seule passe)` : ''}

Tu joues le rôle de l'EXAMINATEUR. Tu dois ${sansTranscription ? '**transcrire** (si le texte de la copie n\'est pas déjà fourni) puis **évaluer**' : 'évaluer'} **chacune des ${taches.length} copie(s)** listée(s) plus bas, en appliquant les CONSIGNES DE CORRECTION et les DOCUMENTS DE RÉFÉRENCE ci-dessous (communs à toutes les copies).
${e.avertissement && !sansTranscription ? `\n⚠️ ${e.avertissement}\n` : ''}
## Format de sortie STRICT
Réponds **uniquement** par un unique tableau JSON valide, sans texte autour${sansTranscription ? ' ni bloc Markdown' : ''} :

\`\`\`json
[
  { "fileId": "<identifiant exact>", "evaluation": ${sansTranscription ? '{}' : '{ ... }'} }
]
\`\`\`

- Un objet par copie, avec le \`fileId\` recopié à l'identique (valeurs attendues : ${ids}).
- Le champ \`evaluation\` respecte EXACTEMENT ${sansTranscription ? 'la structure décrite dans les consignes de correction et contient les champs de transcription et d\'identité indiqués à l\'étape 1 pour les copies jointes' : 'le « FORMAT DE SORTIE JSON STRICT ATTENDU » des consignes de correction'} : ${e.formatEvaluation(ctx)}
- La note finale est recalculée par l'application à partir de ta réponse : respecte le barème indiqué, sans le dépasser.
${sansTranscription ? '- Si le fichier joint est inaccessible ou que tu ne peux en transcrire aucun passage du candidat, utilise seulement `{ "transcription": "" }` comme objet `evaluation` de cette copie. N\'invente aucun texte ni aucune note.\n' : ''}${sectionTranscription}
## ${sansTranscription ? '⚖️ Étape 2 — ' : ''}Consignes de correction
${consignesCorrection}

## Documents de référence (communs à toutes les copies)
${e.documentsReference(ctx, !sansTranscription) || '(aucun)'}`;

  const blocs = taches.map((t, i) => {
    const dejaTranscrite = Boolean(texte(t.transcription));
    const tr = dejaTranscrite
      ? t.transcription
      : estOral
      ? "[À TRANSCRIRE DEPUIS LE FICHIER AUDIO JOINT — Applique l'étape 1, puis évalue la prestation selon l'étape 2.]"
      : "[À TRANSCRIRE DEPUIS L'IMAGE OU LE PDF JOINT — Applique l'étape 1, puis évalue le texte ainsi obtenu selon l'étape 2.]";
    const consigneInterpretation = e.id === 'interpretation' && sansTranscription
      ? `\n${dejaTranscrite ? CONSIGNE_INTERPRETATION_COPIE_TEXTE : CONSIGNE_INTERPRETATION_AUDIO}`
      : '';
    return `---

## Copie ${i + 1} — fileId : \`${t.fileId}\`
${e.blocCopie(tr)}${consigneInterpretation}`;
  });

  const fin = `---

Avant de répondre, vérifie pour chaque copie que le \`fileId\` est exact et que le JSON est complet et valide.
Renvoie uniquement le tableau JSON final — aucun texte avant ou après.`;

  return [entete, ...blocs, fin].join('\n\n');
}

function erreurSi(cond: boolean, msg: string) { return cond ? msg : null; }

function finaliserOuErreur(valider: () => string | null, finaliser: () => any) {
  const err = valider();
  if (err) throw new Error(err);
  return finaliser();
}

// ─── Épreuves hors DELF ──────────────────────────────────────────────────────

const dictee: EpreuveRegistre = {
  id: 'dictee', section: 'pe', libelle: 'Dictée',
  evaluationExterne: true, doubleEvaluation: false, tailleSousLot: 5,
  verifierConfig: ctx => erreurSi(!texte(ctx.config?.referenceText), 'Veuillez renseigner le texte officiel de la dictée.'),
  consignesCorrection: () => buildDictationSystemPrompt(),
  documentsReference: ctx => bloc('📖 TEXTE OFFICIEL DE LA DICTÉE (RÉFÉRENCE) :', ctx.config?.referenceText)
    + (texte(ctx.config?.customInstructions) ? `\n${bloc("📌 CONSIGNES PARTICULIÈRES DE L'ENSEIGNANT :", ctx.config?.customInstructions)}` : ''),
  blocCopie: tr => bloc("✍️ COPIE DE L'ÉLÈVE :", tr) || "✍️ COPIE DE L'ÉLÈVE : (vide)",
  formatEvaluation: () => '`errors` (liste des fautes : `original`, `correction`, `type` parmi grammar, usage, accent, punctuation, omission, addition, `rule`) et `feedback`. Ne calcule pas la note : l\'application applique le barème de pénalités.',
  valider: brut => validerDictee(brut),
  finaliser: (brut, t, ctx) => finaliserOuErreur(() => validerDictee(brut), () => finaliserDictee(brut, t.transcription, paramsDictee(ctx.config))),
  genererConsignes: (taches, ctx) => genererConsignesGeneriques(dictee, taches, ctx),
};

const grammaire: EpreuveRegistre = {
  id: 'grammaire', section: 'pe', libelle: 'Exercices de grammaire',
  evaluationExterne: true, doubleEvaluation: false, tailleSousLot: 5,
  verifierConfig: ctx => erreurSi(!texte(ctx.config?.referenceText) || !texte(ctx.config?.answerKey), "Veuillez renseigner l'énoncé et le corrigé des exercices de grammaire."),
  consignesCorrection: ctx => buildGrammarSystemPrompt(paramsGrammaire(ctx.config).maxScore),
  documentsReference: ctx => [
    bloc("📝 ÉNONCÉ DE L'EXERCICE :", ctx.config?.referenceText),
    bloc('📖 CORRIGÉ MODÈLE / CLÉ DE RÉPONSE :', ctx.config?.answerKey),
    bloc('📌 CONSIGNES SPÉCIFIQUES ET BARÈME :', ctx.config?.customInstructions),
  ].filter(Boolean).join('\n'),
  blocCopie: tr => bloc("✍️ COPIE DE L'ÉLÈVE :", tr) || "✍️ COPIE DE L'ÉLÈVE : (vide)",
  formatEvaluation: ctx => `\`items\` (un objet par item : \`itemNumber\`, \`studentAnswer\`, \`expectedAnswer\`, \`scoreAwarded\`, \`maxScoreItem\`, \`status\`, \`feedback\`), \`summaryFeedback\` et \`errorsTable\`. La somme des points est ramenée par l'application sur ${paramsGrammaire(ctx.config).maxScore}.`,
  valider: brut => validerGrammaire(brut),
  finaliser: (brut, t, ctx) => finaliserOuErreur(() => validerGrammaire(brut), () => finaliserGrammaire(brut, t.transcription, paramsGrammaire(ctx.config))),
  genererConsignes: (taches, ctx) => genererConsignesGeneriques(grammaire, taches, ctx),
};

const traduction: EpreuveRegistre = {
  id: 'traduction', section: 'pe', libelle: 'Traduction',
  evaluationExterne: true, doubleEvaluation: false, tailleSousLot: 3,
  verifierConfig: ctx => erreurSi(!texte(ctx.config?.referenceText), 'Veuillez renseigner le texte source à traduire.'),
  consignesCorrection: ctx => {
    const p = paramsTraduction(ctx.config);
    return buildTranslationSystemPrompt(p.maxScore, p.sourceLang, p.targetLang, criteresTraduction(p));
  },
  documentsReference: ctx => [
    bloc('📄 TEXTE SOURCE ORIGINAL :', ctx.config?.referenceText),
    bloc('📖 TRADUCTION DE RÉFÉRENCE / CORRIGÉ MODÈLE :', ctx.config?.modelTranslation),
    bloc("📌 CONSIGNES SPÉCIFIQUES DE L'ENSEIGNANT :", ctx.config?.customInstructions),
  ].filter(Boolean).join('\n'),
  blocCopie: tr => bloc("✍️ TRADUCTION DE L'ÉTUDIANT :", tr) || "✍️ TRADUCTION DE L'ÉTUDIANT : (vide)",
  formatEvaluation: ctx => {
    const p = paramsTraduction(ctx.config);
    return `\`criteriaScores\` avec exactement les clés ${listeCles(criteresTraduction(p))}, \`globalScore\`, \`justifications\`, \`advices\`, \`errorsTable\` et \`detailedErrors\`. La note globale sur ${p.maxScore} est recalculée par l'application (somme des critères).`;
  },
  valider: (brut, ctx) => validerTraduction(brut, paramsTraduction(ctx.config)),
  finaliser: (brut, t, ctx) => {
    const p = paramsTraduction(ctx.config);
    return finaliserOuErreur(() => validerTraduction(brut, p), () => finaliserTraduction(brut, t.transcription, p));
  },
  genererConsignes: (taches, ctx) => genererConsignesGeneriques(traduction, taches, ctx),
};

const composition: EpreuveRegistre = {
  id: 'composition', section: 'pe', libelle: 'Composition',
  evaluationExterne: true, doubleEvaluation: false, tailleSousLot: 2,
  verifierConfig: ctx => {
    if (!texte(ctx.config?.referenceText)) return 'Veuillez renseigner le sujet de la composition.';
    if (ctx.config?.disableStandardGrid && !texte(ctx.config?.customInstructions)) {
      return 'La grille officielle est désactivée : veuillez renseigner vos critères ou votre barème dans le champ dédié.';
    }
    return null;
  },
  consignesCorrection: ctx => {
    const p = paramsComposition(ctx.config);
    return buildCompositionSystemPrompt(p.compositionType, p.maxScore, p.targetLanguage, criteresComposition(p), p.disableStandardGrid, p.customInstructions);
  },
  documentsReference: ctx => {
    const p = paramsComposition(ctx.config);
    const titreConsignes = p.disableStandardGrid
      ? "📌 CRITÈRES PERSONNALISÉS ET BARÈME DE L'ENSEIGNANT :"
      : "📌 CONSIGNES SPÉCIFIQUES COMPLÉMENTAIRES DE L'ENSEIGNANT :";
    return [
      `Type : ${getCompositionTypeLabel(p.compositionType)} — langue de la copie : ${p.targetLanguage}.\n`,
      bloc('📌 SUJET / ÉNONCÉ DE LA COMPOSITION :', p.subject),
      bloc('📚 TEXTE SUPPORT OU CORPUS DOCUMENTAIRE :', p.corpusText),
      bloc(titreConsignes, p.customInstructions),
    ].filter(Boolean).join('\n');
  },
  blocCopie: tr => bloc("✍️ COPIE RÉDIGÉE DE L'ÉLÈVE :", tr) || "✍️ COPIE RÉDIGÉE DE L'ÉLÈVE : (vide)",
  formatEvaluation: ctx => {
    const p = paramsComposition(ctx.config);
    return p.disableStandardGrid
      ? `\`criteriaScores\`, \`customCriteriaEvaluated\` (un objet par critère de l'enseignant, avec \`key\`, \`label\`, \`maxScore\`, \`score\`, \`justification\`, \`advice\`), \`globalScore\`, \`justifications\`, \`advices\`, \`generalFeedback\` et \`errorsTable\`. La note globale sur ${p.maxScore} est recalculée par l'application.`
      : `\`criteriaScores\` avec exactement les clés ${listeCles(criteresComposition(p))}, \`globalScore\`, \`justifications\`, \`advices\`, \`generalFeedback\` et \`errorsTable\`. La note globale sur ${p.maxScore} est recalculée par l'application (somme des critères).`;
  },
  valider: (brut, ctx) => validerComposition(brut, paramsComposition(ctx.config)),
  finaliser: (brut, t, ctx) => {
    const p = paramsComposition(ctx.config);
    return finaliserOuErreur(() => validerComposition(brut, p), () => finaliserComposition(brut, t.transcription, p));
  },
  genererConsignes: (taches, ctx) => genererConsignesGeneriques(composition, taches, ctx),
};

export const AVERTISSEMENT_INTERPRETATION =
  "L'IA externe ne reçoit que la transcription écrite de la prestation, pas l'enregistrement : la fluidité, le débit et la prononciation ne peuvent pas être jugés sur un texte. Vérifiez ou corrigez la transcription avant l'export, et relisez la note du critère de fluidité.";

const interpretation: EpreuveRegistre = {
  id: 'interpretation', section: 'po', libelle: 'Interprétation',
  evaluationExterne: true, doubleEvaluation: false, tailleSousLot: 3,
  avertissement: AVERTISSEMENT_INTERPRETATION,
  verifierConfig: ctx => erreurSi(!texte(ctx.config?.referenceText), "Veuillez renseigner le discours source original pour l'interprétation."),
  consignesCorrection: ctx => {
    const p = paramsInterpretation(ctx.config);
    return buildInterpretationSystemPrompt(p.maxScore, p.mode, p.sourceLang, p.targetLang, criteresInterpretation(p));
  },
  documentsReference: (ctx, texteSeul = true) => [
    bloc("🎙️ DISCOURS SOURCE ORIGINAL (ÉMIS PAR L'ORATEUR) :", ctx.config?.referenceText),
    bloc('📌 CONSIGNES PARTICULIÈRES DU JURY :', ctx.config?.customInstructions),
    texteSeul ? CONSIGNE_INTERPRETATION_TEXTE : '',
  ].filter(Boolean).join('\n'),
  blocCopie: tr => bloc("🗣️ RESTITUTION DE L'ÉTUDIANT (TRANSCRIPTION) :", tr) || "🗣️ RESTITUTION DE L'ÉTUDIANT : (vide)",
  formatEvaluation: ctx => {
    const p = paramsInterpretation(ctx.config);
    return `\`criteriaScores\` avec exactement les clés ${listeCles(criteresInterpretation(p))}, \`globalScore\`, \`justifications\`, \`advices\`, \`errorsTable\` et \`detailedErrors\`. La note globale sur ${p.maxScore} est recalculée par l'application (somme des critères).`;
  },
  valider: (brut, ctx) => validerInterpretation(brut, paramsInterpretation(ctx.config)),
  finaliser: (brut, t, ctx) => {
    const p = paramsInterpretation(ctx.config);
    return finaliserOuErreur(() => validerInterpretation(brut, p), () => finaliserInterpretation(brut, t.transcription, p));
  },
  genererConsignes: (taches, ctx) => genererConsignesGeneriques(interpretation, taches, ctx),
};

// ─── DELF (fonctions existantes) ─────────────────────────────────────────────

const delfPE: EpreuveRegistre = {
  id: 'delf', section: 'pe', libelle: 'DELF (production écrite)',
  evaluationExterne: true, doubleEvaluation: true, tailleSousLot: 5,
  verifierConfig: ctx => erreurSi(!ctx.delfPE, 'Réglages DELF manquants.'),
  consignesCorrection: () => '',
  documentsReference: () => '',
  blocCopie: tr => tr,
  formatEvaluation: () => '',
  valider: () => null,
  finaliser: (brut, t, ctx) => finalizeDelfPE(brut, ctx.delfPE!.gradingMode, t.transcription, ctx.delfPE!.level),
  genererConsignes: (taches, ctx) => buildDelfPEMarkdown(taches, ctx.delfPE!),
};

const delfPO: EpreuveRegistre = {
  id: 'delf', section: 'po', libelle: 'DELF (production orale)',
  evaluationExterne: true, doubleEvaluation: true, tailleSousLot: 5,
  verifierConfig: ctx => erreurSi(!ctx.delfPO, 'Réglages DELF manquants.'),
  consignesCorrection: () => '',
  documentsReference: () => '',
  blocCopie: tr => tr,
  formatEvaluation: () => '',
  valider: () => null,
  finaliser: (brut, t, ctx) => finalizeDelfPO(brut, {
    level: ctx.delfPO!.level,
    language: ctx.delfPO!.language,
    notationType: ctx.delfPO!.notationType,
    requiredKeys: CRITERES_DELF_PO[ctx.delfPO!.level] || CRITERES_DELF_PO.B2,
  }, t.transcription),
  genererConsignes: (taches, ctx) => buildDelfPOMarkdown(taches, ctx.delfPO!),
};

// ─── Accès ───────────────────────────────────────────────────────────────────

export const REGISTRE_EPREUVES: EpreuveRegistre[] = [delfPE, dictee, grammaire, traduction, composition, delfPO, interpretation];

/**
 * Entrée du registre pour un type d'épreuve tel que les pages le nomment
 * ('delf_b1', 'delf_b2', 'delf', 'dictee', 'traduction', 'grammaire', 'composition', 'interpretation').
 */
export function obtenirEpreuve(section: SectionEpreuve, examType?: string | null): EpreuveRegistre | undefined {
  const id = !examType || examType.startsWith('delf') ? 'delf' : examType;
  return REGISTRE_EPREUVES.find(e => e.section === section && e.id === id);
}

/** L'épreuve figure au registre avec une version externe. */
export function evaluationExterneDisponible(section: SectionEpreuve, examType?: string | null): boolean {
  return !!obtenirEpreuve(section, examType)?.evaluationExterne;
}

/** La double évaluation (interne ou externe) est proposée pour cette épreuve. */
export function doubleEvaluationDisponible(section: SectionEpreuve, examType?: string | null): boolean {
  return !!obtenirEpreuve(section, examType)?.doubleEvaluation;
}

export function estDelf(examType?: string | null): boolean {
  return !examType || examType.startsWith('delf');
}

/** Valide la transcription avant de calculer la note dans le parcours par copier-coller. */
export function finaliserEvaluationInitialeExterne(
  epreuve: EpreuveRegistre,
  brut: { transcription?: unknown } | null | undefined,
  tache: TacheExterne,
  ctx: ContexteEpreuve,
) {
  const transcription = brut?.transcription;
  if (!texte(tache.transcription) && (typeof transcription !== 'string' || !transcription.trim())) {
    throw new Error("Transcription manquante ou invalide : renseignez « evaluation.transcription » dans le JSON avec le texte transcrit.");
  }
  return epreuve.finaliser(brut, tache, ctx);
}
