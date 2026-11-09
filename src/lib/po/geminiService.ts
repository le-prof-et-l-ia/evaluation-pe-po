import { GoogleGenAI, Type } from '@google/genai';
import { buildEvalSystemPrompt, buildSupervisorPrompt, buildEvalUserPrompt, buildSupervisorUserPrompt, buildLoopVerificationPrompt, computeJuryResult, sanitizeScores, sanitizeHallucinations, getAudioTranscriptionPrompt, buildGenerateQuestionsPrompt, safeParseJson, cleanEvalForPrompt, buildArbiterSystemPrompt, buildArbiterUserPrompt } from './promptUtils';
import { finalizeArbiter } from './externalSupervision';
import { getFriendlyModelName } from '../modelNames';
import { buildInterpretationSystemPrompt, buildInterpretationUserPrompt, DEFAULT_INTERPRETATION_CRITERIA } from './interpretationEngine';
import type { CustomCriterion } from '../customExamTypes';

import { withRetryAndFallback as sharedRetry, type KeyConfig, isKeyError, executeWithTimeout, getOrderedFreeKeys } from '../retryUtils';

// Ré-export pour compatibilité avec les imports existants.
export type { KeyConfig } from '../retryUtils';

/** Rotation des clés Gemini et nouvelles tentatives (logique partagée). */
async function withRetryAndFallback(
  action: (apiKey: string, isPaid?: boolean) => Promise<any>,
  keys?: KeyConfig,
  onKeySelected?: (info: { key: string; isCustom: boolean }) => void,
  maxFreeKeys?: number,
  maxAttempts?: number,
  freeTimeoutMs?: number,
  paidTimeoutMs?: number
): Promise<any> {
  return sharedRetry(action, keys, onKeySelected, maxFreeKeys, maxAttempts, freeTimeoutMs, paidTimeoutMs, 'Gemini');
}

/**
 * Chaîne de repli automatique pour les modèles Gemini Flash :
 * 1. Gemini 3.8 Flash (Dernière génération)
 * 2. Gemini 3.6 Flash (Repli en cas de timeout / surcharge)
 */
export const GEMINI_FLASH_FALLBACK_CHAIN = ['gemini-3.8-flash', 'gemini-3.6-flash'];

export function resolveGeminiModel(modelInput?: string): string {
  if (!modelInput) return 'gemini-3.8-flash';
  const m = modelInput.toLowerCase();
  if (m === 'flash' || m === 'gemini-flash' || m.includes('3.8-flash') || m === 'models/gemini-3.8-flash') {
    return 'gemini-3.8-flash';
  }
  if (m.includes('3.6-flash')) return 'gemini-3.6-flash';
  // Redirection des versions dépréciées (3.7 / 3.5) vers 3.8 Flash
  if (m.includes('3.7-flash') || m.includes('3.5-flash')) return 'gemini-3.8-flash';
  if (m.includes('flash')) return 'gemini-3.8-flash';
  if (m === 'argon' || m.includes('argon') || m === 'pro' || m.includes('pro') || m.includes('3.1-pro')) return 'gemini-4-argon';
  return modelInput;
}

export function getGeminiModelChain(targetModel: string): string[] {
  const resolved = resolveGeminiModel(targetModel);
  if (resolved === 'gemini-3.8-flash') {
    return ['gemini-3.8-flash', 'gemini-3.6-flash'];
  }
  if (resolved === 'gemini-3.6-flash') {
    return ['gemini-3.6-flash'];
  }
  return [resolved];
}

export async function runWithGeminiModelFallback<T>(
  initialModel: string,
  action: (modelName: string, apiKey: string, isPaid?: boolean) => Promise<T>,
  apiKeys?: KeyConfig,
  onKeySelected?: (info: { key: string, isCustom: boolean }) => void,
  maxFreeKeys: number = 2,
  maxAttempts: number = 1,
  freeTimeoutMs: number = 45000,
  paidTimeoutMs: number = 60000
): Promise<T> {
  const modelChain = getGeminiModelChain(initialModel);
  const rawFree = apiKeys?.freeKeys;
  let freeKeys = (Array.isArray(rawFree) ? rawFree : (typeof rawFree === 'string' ? rawFree.split(/\n|,/) : []))
    .map(k => k.trim())
    .filter(k => k.length > 0);

  if (maxFreeKeys !== undefined && freeKeys.length > maxFreeKeys) {
    freeKeys = freeKeys.slice(0, maxFreeKeys);
  }

  const paidKey = apiKeys?.paidKey?.trim();
  const keyMode = apiKeys?.keyMode || (apiKeys?.onlyFreeKeys ? 'free_only' : 'both');
  const notifyKey = (key: string) => {
    if (typeof onKeySelected === 'function') onKeySelected({ key, isCustom: true });
  };

  let lastError: any = null;

  // 1. CLÉS GRATUITES : Repli immédiat vers le modèle inférieur avec nouvelle clé si échec non lié à la clé
  if (keyMode !== 'paid_only' && freeKeys.length > 0) {
    const orderedKeys = getOrderedFreeKeys(freeKeys);
    let currentModelIdx = 0;
    let keyCursor = 0;
    const invalidKeyIndices = new Set<number>();
    const maxFreeAttempts = Math.max(modelChain.length * 2, orderedKeys.length * 2);
    let freeAttemptCount = 0;

    while (currentModelIdx < modelChain.length && freeAttemptCount < maxFreeAttempts) {
      if (invalidKeyIndices.size >= orderedKeys.length) {
        console.warn(`[Gemini Fallback PO] Toutes les clés gratuites (${orderedKeys.length}) sont invalides ou refusées.`);
        break;
      }

      // Sélection de la prochaine clé valide
      let activeKeyIndex = keyCursor % orderedKeys.length;
      let skipped = 0;
      while (invalidKeyIndices.has(activeKeyIndex) && skipped < orderedKeys.length) {
        keyCursor++;
        activeKeyIndex = keyCursor % orderedKeys.length;
        skipped++;
      }
      if (skipped >= orderedKeys.length) {
        break;
      }

      const currentKey = orderedKeys[activeKeyIndex];
      const currentModel = modelChain[currentModelIdx];
      freeAttemptCount++;

      notifyKey(currentKey);

      try {
        if (currentModelIdx > 0) {
          console.warn(`[Gemini Fallback PO] Repli sur [${currentModel}] avec clé gratuite (${activeKeyIndex + 1}/${orderedKeys.length})...`);
        }
        const res = await executeWithTimeout(
          () => action(currentModel, currentKey, false),
          freeTimeoutMs,
          `Le serveur Gemini (clé gratuite - ${currentModel}) n'a pas répondu au bout de ${Math.round(freeTimeoutMs / 1000)} secondes (surcharge du serveur).`
        );

        if (res && typeof res === 'object') {
          (res as any).modelUsed = currentModel;
          if (currentModelIdx > 0) {
            const friendlyPrev = getFriendlyModelName(modelChain[0]);
            const friendlyCurr = getFriendlyModelName(currentModel);
            (res as any).fallbackNotice = `⚡ Évaluation réalisée avec ${friendlyCurr} (repli automatique suite à un délai dépassé ou une indisponibilité temporaire de ${friendlyPrev}).`;
          }
        }
        return res;
      } catch (error: any) {
        lastError = error;
        const errMsg = error?.message || error?.toString() || 'Erreur inconnue';

        // Cas A : Motif clairement identifié comme une clé API invalide
        if (isKeyError(error)) {
          invalidKeyIndices.add(activeKeyIndex);
          console.warn(`[Gemini Fallback PO] Clé API gratuite #${activeKeyIndex + 1} invalide/refusée (${errMsg}). Maintien du modèle [${currentModel}], passage à la clé suivante...`);
          keyCursor++;
          await new Promise(r => setTimeout(r, 500));
          continue;
        }

        // Cas B : Le motif n'est pas une clé invalide (surcharge 503, limitation 429, timeout, etc.)
        // Repli immédiat sur le modèle immédiatement inférieur avec une nouvelle clé API
        const nextModelIdx = currentModelIdx + 1;
        if (nextModelIdx < modelChain.length) {
          const nextModel = modelChain[nextModelIdx];
          console.warn(`[Gemini Fallback PO] Échec/Surcharge/Timeout sur [${currentModel}] avec clé #${activeKeyIndex + 1} (${errMsg}). Repli immédiat sur [${nextModel}] avec la clé suivante...`);
          currentModelIdx = nextModelIdx;
          keyCursor++;
          await new Promise(r => setTimeout(r, 500));
          continue;
        } else {
          // Dernier modèle de la chaîne (ex: 3.6 Flash ou modèle unique)
          const hasPaid = Boolean(paidKey && keyMode !== 'free_only');
          const remainingValidKeys = orderedKeys.length - invalidKeyIndices.size;
          if (!hasPaid && freeAttemptCount < orderedKeys.length && remainingValidKeys > 1) {
            console.warn(`[Gemini Fallback PO] Échec sur [${currentModel}] avec clé #${activeKeyIndex + 1} (${errMsg}). Essai de la clé suivante sur ce modèle...`);
            keyCursor++;
            await new Promise(r => setTimeout(r, 500));
            continue;
          }
          console.warn(`[Gemini Fallback PO] Épuisement des modèles de repli gratuits (${errMsg}).`);
          break;
        }
      }
    }
  }

  // 2. CLÉ PAYANTE : Utilisée en dernier recours lorsque toutes les clés gratuites ne fonctionnent pas
  if (paidKey && keyMode !== 'free_only') {
    console.log(`[Gemini Fallback PO] Recours à la clé payante en dernier recours (toutes les clés gratuites ont échoué)...`);
    notifyKey(paidKey);

    for (let m = 0; m < modelChain.length; m++) {
      const paidModel = modelChain[m];
      try {
        if (m > 0) {
          console.warn(`[Gemini Fallback PO] Repli clé payante sur [${paidModel}] (${m + 1}/${modelChain.length})...`);
        }
        const res = await executeWithTimeout(
          () => action(paidModel, paidKey, true),
          paidTimeoutMs,
          `Délai d'attente dépassé (${Math.round(paidTimeoutMs / 1000)}s) sur la clé payante Gemini (${paidModel}).`
        );

        if (res && typeof res === 'object') {
          (res as any).modelUsed = paidModel;
          if (paidModel !== modelChain[0]) {
            const friendlyPrev = getFriendlyModelName(modelChain[0]);
            const friendlyCurr = getFriendlyModelName(paidModel);
            (res as any).fallbackNotice = `⚡ Évaluation réalisée avec ${friendlyCurr} (repli automatique suite à un délai dépassé ou une indisponibilité temporaire de ${friendlyPrev}).`;
          }
        }
        return res;
      } catch (error: any) {
        lastError = error;
        const errMsg = error?.message || error?.toString() || 'Erreur inconnue';
        if (isKeyError(error)) {
          console.error(`[Gemini Fallback PO] La clé payante est invalide ou refusée (${errMsg}).`);
          throw error;
        }
        console.warn(`[Gemini Fallback PO] Échec clé payante sur [${paidModel}] (${errMsg}). Basculement vers le modèle suivant...`);
      }
    }
  }

  // 3. Échec total
  if (lastError) {
    if (modelChain.length > 1) {
      const chainNames = modelChain.map(m => getFriendlyModelName(m)).join(' → ');
      const rawMsg = lastError?.message || String(lastError);
      const chainErr = new Error(`Tous les modèles de repli ont échoué (${chainNames}). Dernière erreur : ${rawMsg}`);
      (chainErr as any).status = (lastError as any).status;
      (chainErr as any).code = (lastError as any).code;
      throw chainErr;
    }
    throw lastError;
  }
  throw new Error(
    freeKeys.length > 0
      ? `Toutes les clés gratuites Gemini et les modèles de repli ont échoué, et aucune clé payante n'a abouti.`
      : `Aucune clé API Gemini fournie.`
  );
}

export interface CorrectionResult {
  studentEmail: string | null;
  studentName: string | null;
  transcription: string;
  transcriptionCorrigee: string;
  subject?: string;
  brouillon_phase1_audit: string;
  brouillon_phase2_analyse: string;
  globalScore: number;
  criteriaScores: Record<string, number>;
  justifications: Record<string, string>;
  advices: Record<string, string>;
  errorsTable: Array<{ original: string; correction: string; rule: string; apiOriginal?: string; apiCorrection?: string; }>;
  notationType?: 'detailed' | 'delf';
  _comparison?: {
    firstEval: any;
    secondEval: any;
    firstProvider: string;
    secondProvider: string;
  };
  candidateNumber?: string | null;
  classId?: string | null;
  className?: string | null;
  studentId?: string | null;
  file?: string;
  _arbiterNotes?: string;
  fallbackNotice?: string;
  modelUsed?: string;
}

function getResponseSchema(level: 'B1' | 'B2' | string, language: string = 'FR') {
  const criteriaKeys = level === 'B1'
    ? ['entretien', 'interaction', 'monologue', 'lexique', 'morphosyntaxe', 'phonologie']
    : ['monologue', 'interaction', 'lexique', 'morphosyntaxe', 'phonologie'];

  const langDesc = language === 'VN' ? "en vietnamien (tiếng Việt có dấu), interdiction formelle du français"
    : language === 'TW' ? "en chinois traditionnel (繁體中文)"
    : language === 'EN' ? "en anglais (English)"
    : language === 'CZ' ? "en tchèque (čeština)"
    : "en français, avec tous les accents";

  const criteriaProperties: Record<string, any> = {};
  const justificationsProperties: Record<string, any> = {};
  const advicesProperties: Record<string, any> = {};

  for (const key of criteriaKeys) {
    criteriaProperties[key] = { type: Type.NUMBER };
    justificationsProperties[key] = { 
      type: Type.STRING, 
      description: `Justification détaillée avec citations de l'oral entre guillemets, rédigée ${langDesc}, sans markdown ni note chiffrée.` 
    };
    advicesProperties[key] = { 
      type: Type.STRING, 
      description: `Conseils pédagogiques et méthodologiques actionnables rédigés ${langDesc}, sans markdown ni note chiffrée.` 
    };
  }

  return {
    type: Type.OBJECT,
    properties: {
      studentEmail: { type: Type.STRING, nullable: true },
      studentName: { type: Type.STRING, nullable: true, description: "Nom complet de l'étudiant s'il est mentionné verbalement" },
      transcription: { type: Type.STRING },
      transcriptionCorrigee: { type: Type.STRING, description: "Transcription entièrement corrigée et grammaticalement correcte, servant de texte cible reconstructif (100% en français)" },
      brouillon_phase1_audit: { type: Type.STRING, description: `Brouillon de phase 1 : audit linguistique structuré rédigé ${langDesc}` },
      brouillon_phase2_analyse: { type: Type.STRING, description: `Brouillon de phase 2 : analyse qualitative des critères rédigée ${langDesc}` },
      globalScore: { type: Type.NUMBER },
      criteriaScores: {
        type: Type.OBJECT,
        properties: criteriaProperties,
        required: criteriaKeys
      },
      justifications: {
        type: Type.OBJECT,
        properties: justificationsProperties,
        required: criteriaKeys
      },
      advices: {
        type: Type.OBJECT,
        properties: advicesProperties,
        required: criteriaKeys
      },
      errorsTable: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: { 
            original: { type: Type.STRING }, 
            correction: { type: Type.STRING }, 
            rule: { type: Type.STRING, description: `NOM CONCIS de la règle grammaticale ou lexicale violée, rédigé ${langDesc}. INTERDIT: transcriptions IPA, erreurs phonologiques/prononciation, raisonnements. Maximum 150 caractères.` }
          },
          required: ['original', 'correction', 'rule']
        }
      }
    },
    required: ['studentEmail', 'studentName', 'transcription', 'transcriptionCorrigee', 'brouillon_phase1_audit', 'brouillon_phase2_analyse', 'globalScore', 'criteriaScores', 'justifications', 'advices', 'errorsTable']
  };
}

function getSupervisorResponseSchema(level: 'B1' | 'B2' | string, language: string = 'FR') {
  // Le superviseur doit renvoyer la structure complète (brouillons, transcription corrigée, conseils et tableau consolidé)
  return getResponseSchema(level, language);
}

/**
 * Exécute un appel à `ai.models.generateContent` en sécurisant l'usage de `thinkingConfig` :
 * - N'ajoute `thinkingConfig` que si le modèle est compatible (gamme Gemini 3.x et ultérieure, pas les séries 2.x/1.x).
 * - En cas d'erreur 400 "Thinking level is not supported for this model" (ou similaire),
 *   relance immédiatement la génération sans `thinkingConfig` pour éviter tout échec de correction.
 */
export async function generateContentSafe(
  ai: GoogleGenAI,
  activeModel: string,
  params: {
    contents: any[];
    config: any;
    thinkingLevel?: 'HIGH' | 'LOW' | 'MEDIUM';
  }
) {
  const reqConfig = { ...params.config };
  
  // Nettoyage strict des paramètres d'échantillonnage et de raisonnement dépréciés (Avis Google AI Studio 2026) :
  delete reqConfig.temperature;
  delete reqConfig.topP;
  delete reqConfig.topK;
  delete reqConfig.top_p;
  delete reqConfig.top_k;
  delete reqConfig.thinkingBudget;
  delete reqConfig.thinking_budget;

  // Seuls les modèles de raisonnement dédiés (ex: Gemini 4 Argon) supportent le paramètre thinkingLevel.
  // Les modèles de la gamme Flash (3.8 Flash, 3.6 Flash, 2.5 Flash, etc.) et les séries 1.x/2.x
  // ne supportent pas thinkingLevel et renvoient une erreur 400 INVALID_ARGUMENT.
  const isFlashOrLegacy = activeModel.includes('flash') || /gemini-(?:1\.|2\.)/.test(activeModel);
  if (!isFlashOrLegacy && params.thinkingLevel) {
    reqConfig.thinkingConfig = { thinkingLevel: params.thinkingLevel };
  } else {
    delete reqConfig.thinkingConfig;
  }
  if (reqConfig.thinkingConfig) {
    delete reqConfig.thinkingConfig.thinkingBudget;
    delete (reqConfig.thinkingConfig as any).thinking_budget;
  }

  try {
    return await ai.models.generateContent({
      model: activeModel,
      contents: params.contents,
      config: reqConfig
    });
  } catch (error: any) {
    const errStr = (error?.message || '') + ' ' + (typeof error === 'object' ? JSON.stringify(error) : String(error));
    if (reqConfig.thinkingConfig || errStr.toLowerCase().includes('thinking')) {
      console.warn(`[Gemini] Le modèle ${activeModel} ne supporte pas thinkingConfig (${error?.message || errStr}). Nouvelle tentative immédiate sans thinkingConfig...`);
      const fallbackConfig = { ...reqConfig };
      delete fallbackConfig.thinkingConfig;
      return await ai.models.generateContent({
        model: activeModel,
        contents: params.contents,
        config: fallbackConfig
      });
    }
    throw error;
  }
}

export async function evaluateProduction(
  subject: string,
  content: { text?: string; fileUri?: string; mimeType?: string },
  language: string = 'FR',
  temperature: number = 0.15,
  evalModel: string = 'flash',
  level: 'B1' | 'B2' | string = 'B2',
  ocrModel: 'flash' | 'pro' = 'flash',
  apiKeys?: KeyConfig,
  onKeySelected?: (info: { key: string, isCustom: boolean }) => void,
  useDoubleEval: boolean = false,
  nativeLanguage: string = 'Aucune',
  notationType: 'detailed' | 'delf' = 'detailed'
): Promise<CorrectionResult> {
  let studentTranscription = content.text || '';
  if (!studentTranscription && content.fileUri && content.mimeType) {
    const ocrRes = await extractText(content.fileUri, content.mimeType, level, ocrModel, apiKeys, onKeySelected, nativeLanguage);
    studentTranscription = typeof ocrRes === 'string' ? ocrRes : ocrRes.text;
  }
  const targetModel = resolveGeminiModel(evalModel);

  const systemInstruction = buildEvalSystemPrompt(level, language, notationType);
  const evalPrompt = buildEvalUserPrompt(subject, studentTranscription, language);

  const result1 = await runWithGeminiModelFallback(targetModel, async (activeModel, apiKey) => {
    const ai = new GoogleGenAI({ apiKey });
    
    const parts: any[] = [{ text: evalPrompt }];

    const reqConfig: any = {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: getResponseSchema(level, language),
      maxOutputTokens: 32768,
    };

    const response = await generateContentSafe(ai, activeModel, {
      contents: [{ role: 'user', parts }],
      config: reqConfig,
      thinkingLevel: 'HIGH',
    });
    const textResp = response.text || "{}";
    const parsed = safeParseJson<CorrectionResult>(textResp);
    return sanitizeScores(sanitizeHallucinations(parsed, language), level, notationType);
  }, apiKeys, onKeySelected);

  if (!useDoubleEval) {
    return result1;
  }

  return superviseEvaluation(
    result1, 
    studentTranscription, 
    subject, 
    language, 
    temperature, 
    evalModel, 
    level, 
    apiKeys, 
    onKeySelected,
    undefined,
    notationType
  );
}

export async function superviseEvaluation(
  result1: CorrectionResult,
  studentTranscription: string,
  subject: string,
  language: string = 'FR',
  temperature: number = 0.15,
  evalModel: 'flash' | 'pro' | string = 'flash',
  level: 'B1' | 'B2' | string = 'B2',
  apiKeys?: KeyConfig,
  onKeySelected?: (info: { key: string, isCustom: boolean }) => void,
  content?: { fileUri: string; mimeType: string },
  notationType: 'detailed' | 'delf' = 'detailed'
): Promise<CorrectionResult> {
  const targetModel = resolveGeminiModel(evalModel);
  
  const cleanResult1 = sanitizeScores(result1, level, notationType);
  const supervisorInstruction = buildSupervisorPrompt(level, language, notationType);
  const superPrompt = buildSupervisorUserPrompt(subject, studentTranscription, cleanResult1, language);
  
  const result2 = await runWithGeminiModelFallback(targetModel, async (activeModel, apiKey) => {
    const ai = new GoogleGenAI({ apiKey });
    
    const parts: any[] = [{ text: superPrompt }];

    const reqConfig: any = {
      systemInstruction: supervisorInstruction,
      responseMimeType: 'application/json',
      responseSchema: getSupervisorResponseSchema(level, language),
      maxOutputTokens: 32768,
    };

    const response = await generateContentSafe(ai, activeModel, {
      contents: [{ role: 'user', parts }],
      config: reqConfig,
      thinkingLevel: 'HIGH',
    });
    const textResp = response.text || "{}";
    try {
      const parsed = safeParseJson<CorrectionResult>(textResp);
      if (!parsed.transcription) {
        parsed.transcription = cleanResult1.transcription || studentTranscription;
      }
      if (!parsed.transcriptionCorrigee) {
        parsed.transcriptionCorrigee = cleanResult1.transcriptionCorrigee || "";
      }
      if (!parsed.brouillon_phase1_audit) {
        parsed.brouillon_phase1_audit = cleanResult1.brouillon_phase1_audit || "";
      }
      if (!parsed.brouillon_phase2_analyse) {
        parsed.brouillon_phase2_analyse = cleanResult1.brouillon_phase2_analyse || "";
      }
      return sanitizeScores(sanitizeHallucinations(parsed, language), level, notationType);
    } catch (parseError: any) {
      console.error("=== ERREUR PARSING JSON DOUBLE EVALUATION ===");
      console.error("Message:", parseError.message);
      console.error("Longueur brute:", textResp.length);
      console.error("Fin brute:", textResp.slice(-500));
      console.error("Début brut:", textResp.slice(0, 500));
      console.error("=============================================");
      throw parseError;
    }
  }, apiKeys, onKeySelected);

  // ── LOOP ENGINEERING : passe de vérification sur le JSON brut de l'Eval 2 ──
  // On demande au modèle ayant abouti de relire son propre résultat avant
  // la fusion finale. Timeout court (15s) pour ne jamais bloquer l'évaluation.
  const actualSupervisorModel = result2.modelUsed || targetModel;
  try {
    const verifyPrompt = buildLoopVerificationPrompt(language);
    const verifyInput  = JSON.stringify(result2);
    const verifiedResult = await runWithGeminiModelFallback(
      actualSupervisorModel,
      async (activeModel, apiKey) => {
        const ai = new GoogleGenAI({ apiKey });
        const config: any = {
          systemInstruction: buildSupervisorPrompt(level, language, notationType),
          responseMimeType: 'application/json',
          responseSchema: getSupervisorResponseSchema(level, language),
          maxOutputTokens: 32768,
        };

        const vResponse = await generateContentSafe(ai, activeModel, {
          contents: [{ role: 'user', parts: [{ text: verifyPrompt + '\n\nJSON à vérifier :\n' + verifyInput }] }],
          config,
          thinkingLevel: 'LOW',
        });
        const vText = vResponse.text || "{}";
        const vParsed = safeParseJson<CorrectionResult>(vText);
        if (!vParsed.criteriaScores || Object.keys(vParsed.criteriaScores).length === 0) {
          // Réponse invalide ou vide : on garde result2 tel quel
          return result2;
        }
        if (!vParsed.transcription) vParsed.transcription = result2.transcription;
        return sanitizeScores(sanitizeHallucinations(vParsed, language), level, notationType);
      },
      apiKeys,
      onKeySelected,
      1,     // maxFreeKeys = 1 pour vérification rapide
      1,     // maxAttempts = 1
      15000, // freeTimeoutMs = 15s court
      20000  // paidTimeoutMs = 20s court
    );
    const finalJury = computeJuryResult(cleanResult1, verifiedResult, `Gemini ${getFriendlyModelName(actualSupervisorModel)}`, level, notationType);
    finalJury.modelUsed = actualSupervisorModel;
    if (result2.fallbackNotice) {
      finalJury.fallbackNotice = result2.fallbackNotice;
    }
    return finalJury;
  } catch (verifyErr: any) {
    console.warn('[Loop Engineering PO] Passe de vérification échouée ou dépassée, conservation directe de result2:', verifyErr?.message);
    const finalJury = computeJuryResult(cleanResult1, result2, `Gemini ${getFriendlyModelName(actualSupervisorModel)}`, level, notationType);
    finalJury.modelUsed = actualSupervisorModel;
    if (result2.fallbackNotice) {
      finalJury.fallbackNotice = result2.fallbackNotice;
    }
    return finalJury;
  }
}


export async function extractText(
  fileUri: string, 
  mimeType: string, 
  level: 'B1' | 'B2' | string = 'B2', 
  ocrModel: string = 'gemini-3.8-flash', 
  apiKeys?: KeyConfig, 
  onKeySelected?: (info: { key: string, isCustom: boolean }) => void,
  nativeLanguage?: string
): Promise<{ text: string; transcription: string; modelUsed?: string; fallbackNotice?: string }> {
  const targetModel = ocrModel === 'gemini-3.6-flash' ? 'gemini-3.6-flash' : 'gemini-3.8-flash';
  const isAudio = mimeType.startsWith('audio/') || 
    mimeType.startsWith('video/') || 
    ['application/octet-stream', 'audio/mp4', 'audio/x-m4a', 'video/mp4', 'audio/x-caf', 'audio/aac', 'audio/flac', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/mp3', 'audio/mpeg'].includes(mimeType);
  const prompt = isAudio 
    ? getAudioTranscriptionPrompt(level, nativeLanguage)
    : `Transcris fidèlement ce texte DELF ${level}.\nCONSIGNE DE FILTRAGE : Ne transcris QUE l'écriture manuscrite rédigée par l'étudiant. Ignore absolument tout le texte imprimé en caractères d'imprimerie (police machine), y compris s'il est dans une langue autre que le français (par exemple, des en-têtes pré-imprimés en vietnamien comme "Họ và tên", "SBD", des consignes d'examen, des numéros de pages, ou la marque du papier comme "Clairefontaine" ou "Seyes").\nCONSIGNE CRITIQUE : Ignore totalement les passages raturés, barrés ou gribouillés. Ne les remplace PAS par des symboles (comme ~~). Saute-les simplement.\nINCLUS toutes les fautes d'orthographe, de grammaire ou de syntaxe présentes dans l'original : NE CORRIGE RIEN.\nRends UNIQUEMENT la transcription, sans aucune phrase d'introduction ni de conclusion.`;

  // Normalisation du mimeType audio pour Google Gemini
  let effectiveMimeType = mimeType;
  if (isAudio) {
    if (mimeType === 'audio/x-m4a' || mimeType === 'video/mp4') {
      effectiveMimeType = 'audio/mp4';
    } else if (mimeType === 'audio/x-caf' || mimeType === 'application/octet-stream' || mimeType === '') {
      effectiveMimeType = 'audio/mp3';
    }
  }

  // Pour les fichiers audio de 15 à 20 min, allouer 75s par modèle (75s pour 3.8, puis basculement sur 3.6).
  // 1 seule tentative pour basculer rapidement vers le modèle inférieur sans attendre inutilement.
  const modelTimeoutMs = isAudio ? 75000 : 35000;
  const maxAttempts = isAudio ? 1 : undefined;

  const rawResult = await runWithGeminiModelFallback(targetModel, async (activeModel, apiKey) => {
    const ai = new GoogleGenAI({ apiKey });
    const ocrResp = await ai.models.generateContent({ 
        model: activeModel, 
        contents: [{ role: 'user', parts: [{ inlineData: { data: fileUri, mimeType: effectiveMimeType } }, { text: prompt }] }]
    });

    // Extraction robuste du texte : getter .text, ou parcours direct des parts du premier candidat
    let rawText = ocrResp.text || "";
    if (!rawText.trim() && ocrResp.candidates?.[0]?.content?.parts) {
      for (const part of ocrResp.candidates[0].content.parts) {
        if (part.text && !part.thought) {
          rawText += part.text;
        }
      }
    }

    // Vérification du motif d'arrêt (sécurité, blocage)
    const finishReason = ocrResp.candidates?.[0]?.finishReason;
    if (finishReason === 'SAFETY' || finishReason === 'RECITATION' || finishReason === 'BLOCKLIST') {
      throw new Error(`La transcription a été bloquée par les filtres de sécurité (${finishReason}).`);
    }

    // Nettoyage de sécurité : supprime les octets nuls et autres caractères de contrôle indésirables
    const cleanedText = rawText.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();

    if (!cleanedText) {
      throw new Error(`Le modèle ${activeModel} a renvoyé une transcription vide ou muette.`);
    }

    return { text: cleanedText };
  }, apiKeys, onKeySelected, undefined, maxAttempts, modelTimeoutMs, modelTimeoutMs);

  const friendlyPrev = getFriendlyModelName(targetModel);
  const modelUsed = (rawResult as any).modelUsed || targetModel;
  const friendlyCurr = getFriendlyModelName(modelUsed);
  const fallbackNotice = (rawResult as any).fallbackNotice 
    ? `⚡ Transcription ${isAudio ? 'audio' : 'OCR'} réalisée avec ${friendlyCurr} (repli automatique suite à un délai dépassé ou une indisponibilité temporaire de ${friendlyPrev}).`
    : undefined;

  return {
    text: rawResult.text,
    transcription: rawResult.text,
    modelUsed,
    fallbackNotice
  };
}

/**
 * Compte le nombre de mots selon la règle standard (espaces).
 */
export function countWords(text: string): number {
  if (!text) return 0;
  const words = text
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0);
  return words.length;
}

export async function generateB2Questions(
  subject: string,
  part1Transcription: string,
  apiKeys?: KeyConfig,
  onKeySelected?: (info: { key: string, isCustom: boolean }) => void
): Promise<string> {
  const prompt = buildGenerateQuestionsPrompt(subject, part1Transcription);
  return runWithGeminiModelFallback('gemini-3.8-flash', async (activeModel, apiKey) => {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: activeModel,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
      }
    });
    return response.text || "{}";
  }, apiKeys, onKeySelected);
}

function getArbiterResponseSchema(level: 'B1' | 'B2' | string, language: string = 'FR') {
  const criteriaKeys = level === 'B1'
    ? ['entretien', 'interaction', 'monologue', 'lexique', 'morphosyntaxe', 'phonologie']
    : ['monologue', 'interaction', 'lexique', 'morphosyntaxe', 'phonologie'];

  const langDesc = language === 'VN' ? "en vietnamien (tiếng Việt có dấu), interdiction formelle du français"
    : language === 'TW' ? "en chinois traditionnel (繁體中文)"
    : language === 'EN' ? "en anglais (English)"
    : language === 'CZ' ? "en tchèque (čeština)"
    : "en français, avec tous les accents";

  const criteriaProperties: Record<string, any> = {};
  const justificationsProperties: Record<string, any> = {};
  const advicesProperties: Record<string, any> = {};

  for (const key of criteriaKeys) {
    criteriaProperties[key] = { type: Type.NUMBER };
    justificationsProperties[key] = { 
      type: Type.STRING, 
      description: `Justification détaillée avec citations de l'oral entre guillemets, rédigée ${langDesc}, sans markdown ni note chiffrée.` 
    };
    advicesProperties[key] = { 
      type: Type.STRING, 
      description: `Conseils pédagogiques et méthodologiques actionnables rédigés ${langDesc}, sans markdown ni note chiffrée.` 
    };
  }

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      studentEmail: { type: Type.STRING, nullable: true },
      studentName: { type: Type.STRING, nullable: true },
      transcription: { type: Type.STRING },
      transcriptionCorrigee: { type: Type.STRING, description: "Transcription entièrement corrigée et grammaticalement correcte, servant de texte cible reconstructif (100% en français)" },
      brouillon_phase1_audit: { type: Type.STRING, description: `Brouillon de phase 1 : audit linguistique structuré rédigé ${langDesc}` },
      brouillon_phase2_analyse: { type: Type.STRING, description: `Brouillon de phase 2 : analyse qualitative des critères rédigée ${langDesc}` },
      globalScore: { type: Type.NUMBER },
      criteriaScores: {
        type: Type.OBJECT,
        properties: criteriaProperties,
        required: criteriaKeys
      },
      justifications: {
        type: Type.OBJECT,
        properties: justificationsProperties,
        required: criteriaKeys
      },
      advices: {
        type: Type.OBJECT,
        properties: advicesProperties,
        required: criteriaKeys
      },
      errorsTable: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: { 
            original: { type: Type.STRING }, 
            correction: { type: Type.STRING }, 
            rule: { type: Type.STRING, description: `NOM CONCIS de la règle grammaticale ou lexicale violée, rédigé ${langDesc}. INTERDIT: transcriptions IPA, erreurs phonologiques/prononciation, raisonnements. Maximum 150 caractères.` },
            apiOriginal: { type: Type.STRING, nullable: true },
            apiCorrection: { type: Type.STRING, nullable: true }
          },
          required: ['original', 'correction', 'rule']
        }
      }
    },
    required: ['studentEmail', 'studentName', 'transcription', 'transcriptionCorrigee', 'brouillon_phase1_audit', 'brouillon_phase2_analyse', 'globalScore', 'criteriaScores', 'justifications', 'advices', 'errorsTable']
  };

  return {
    type: Type.OBJECT,
    properties: {
      evaluation: responseSchema,
      comparisonNotes: {
        type: Type.STRING,
        description: `Commentaire critère par critère sur les écarts entre l'évaluation 1 et l'évaluation 2 (destiné au correcteur, rédigé ${langDesc}, sans markdown).`
      }
    },
    required: ['evaluation', 'comparisonNotes']
  };
}

export async function arbitrateEvaluation(
  firstEval: CorrectionResult,
  secondEval: CorrectionResult,
  firstProvider: string,
  secondProvider: string,
  studentTranscription: string,
  subject: string,
  language: string = 'FR',
  temperature: number = 0.15,
  evalModel: 'flash' | 'pro' = 'flash',
  level: 'B1' | 'B2' | string = 'B2',
  apiKeys?: KeyConfig,
  onKeySelected?: (info: { key: string, isCustom: boolean }) => void,
  notationType: 'detailed' | 'delf' = 'detailed'
): Promise<CorrectionResult> {
  const targetModel = (evalModel === 'pro' || (evalModel as string) === 'argon') ? 'gemini-4-argon' : 'gemini-3.8-flash';
  
  const criteria = level === 'B1'
    ? ['entretien', 'interaction', 'monologue', 'lexique', 'morphosyntaxe', 'phonologie']
    : ['monologue', 'interaction', 'lexique', 'morphosyntaxe', 'phonologie'];

  const systemPrompt = buildArbiterSystemPrompt(level, language, notationType);
  const userPrompt = buildArbiterUserPrompt(subject, studentTranscription, firstEval, secondEval, firstProvider, secondProvider, language);

  const resultRaw = await runWithGeminiModelFallback(targetModel, async (activeModel, apiKey) => {
    const ai = new GoogleGenAI({ apiKey });
    const reqConfig: any = {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
      responseSchema: getArbiterResponseSchema(level, language),
      maxOutputTokens: 16384,
    };

    const response = await generateContentSafe(ai, activeModel, {
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: reqConfig,
      thinkingLevel: 'HIGH',
    });
    return safeParseJson(response.text || "{}");
  }, apiKeys, onKeySelected);

  const cleanResult = finalizeArbiter(
    {
      fileId: 'single',
      subject,
      transcription: studentTranscription,
      firstEval,
      secondEval,
      firstProvider,
      secondProvider
    },
    resultRaw.evaluation,
    resultRaw.comparisonNotes,
    { level, language, notationType, requiredKeys: criteria }
  );

  return cleanResult;
}

export async function evaluateInterpretation(
  studentTranscription: string,
  sourceSpeech: string,
  maxScore: number = 10,
  mode: 'consecutive' | 'simultaneous' = 'consecutive',
  sourceLang: string = "Français",
  targetLang: string = "Français",
  criteria: CustomCriterion[] = DEFAULT_INTERPRETATION_CRITERIA,
  customInstructions?: string,
  evalModel: string = 'flash',
  apiKeys?: KeyConfig,
  onKeySelected?: (info: { key: string, isCustom: boolean }) => void
) {
  const targetModel = resolveGeminiModel(evalModel);
  const systemInstruction = buildInterpretationSystemPrompt(maxScore, mode, sourceLang, targetLang, criteria);
  const userPrompt = buildInterpretationUserPrompt(studentTranscription, sourceSpeech, customInstructions);

  const rawJson = await runWithGeminiModelFallback(targetModel, async (activeModel, apiKey) => {
    const ai = new GoogleGenAI({ apiKey });
    const config: any = {
      systemInstruction,
      responseMimeType: 'application/json',
      maxOutputTokens: 16384,
    };
    const response = await generateContentSafe(ai, activeModel, {
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config,
      thinkingLevel: 'HIGH'
    });
    return safeParseJson<any>(response.text || "{}");
  }, apiKeys, onKeySelected);

  const criteriaScores = rawJson.criteriaScores || {};
  let sumCrit = 0;
  for (const c of criteria) {
    if (criteriaScores[c.key] !== undefined) {
      sumCrit += Number(criteriaScores[c.key]) || 0;
    }
  }
  const globalScore = rawJson.globalScore !== undefined ? Number(rawJson.globalScore) : sumCrit;

  return {
    examType: 'interpretation' as const,
    globalScore: Math.round(globalScore * 100) / 100,
    maxScore,
    criteriaScores,
    justifications: rawJson.justifications || {},
    advices: rawJson.advices || {},
    errorsTable: Array.isArray(rawJson.errorsTable) ? rawJson.errorsTable : [],
    detailedErrors: Array.isArray(rawJson.detailedErrors) ? rawJson.detailedErrors : [],
    transcription: studentTranscription,
    sourceSpeech,
    mode,
    sourceLanguage: sourceLang,
    targetLanguage: targetLang,
    studentName: null as string | null,
    studentEmail: null as string | null
  };
}



