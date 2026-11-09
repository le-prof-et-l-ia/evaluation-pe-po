import { GoogleGenAI, Type } from '@google/genai';
import { buildEvalSystemPrompt, buildSupervisorPrompt, buildEvalUserPrompt, buildSupervisorUserPrompt, buildLoopVerificationPrompt, computeJuryResult, sanitizeScores, sanitizeHallucinations, safeParseJson, cleanEvalForPrompt, buildArbiterSystemPrompt, buildArbiterUserPrompt, getCriteriaKeys, getOcrPrompt } from './promptUtils';
import { finalizeArbiter } from './externalSupervision';
import { getFriendlyModelName } from './modelNames';
import { buildDictationSystemPrompt, buildDictationUserPrompt, getDictationOcrPrompt } from './dicteeEngine';
import { buildTranslationSystemPrompt, buildTranslationUserPrompt, DEFAULT_TRANSLATION_CRITERIA } from './traductionEngine';
import { buildGrammarSystemPrompt, buildGrammarUserPrompt } from './grammaireEngine';
import { buildCompositionSystemPrompt, buildCompositionUserPrompt, type CompositionSubType } from './compositionEngine';
import {
  finaliserDictee,
  finaliserTraduction,
  finaliserGrammaire,
  finaliserComposition,
  criteresComposition,
  criteresTraduction,
  type ParamsComposition,
} from './epreuves/finalisation';
import type { DictationPenaltyConfig, CustomCriterion } from './customExamTypes';

import { withRetryAndFallback as sharedRetry, type KeyConfig, isKeyError, executeWithTimeout, getOrderedFreeKeys } from './retryUtils';

/** Rotation des clés et nouvelles tentatives, avec le libellé du fournisseur. */
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

// Ré-export pour compatibilité avec les imports existants.
export type { KeyConfig } from './retryUtils';

export interface CorrectionResult {
  studentEmail: string | null;
  studentName: string | null;
  transcription: string;
  subject?: string;
  brouillon_phase1_audit: string;
  brouillon_phase2_analyse: string;
  globalScore: number;
  criteriaScores: Record<string, number>;
  justifications: Record<string, string>;
  advices: Record<string, string>;
  errorsTable: Array<{ original: string; correction: string; rule: string; }>;
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
  ocrAlerts?: string[];
  fallbackNotice?: string;
  modelUsed?: string;
}

export function getResponseSchema(level?: string) {
  const criteriaKeys = [...getCriteriaKeys(level)];
  const criteriaProperties: Record<string, any> = {};
  const justificationsProperties: Record<string, any> = {};
  const advicesProperties: Record<string, any> = {};

  for (const key of criteriaKeys) {
    criteriaProperties[key] = { type: Type.NUMBER };
    justificationsProperties[key] = {
      type: Type.STRING,
      description: "Justification détaillée en français, obligatoirement rédigée avec tous les accents (é, è, à, â, ê, î, ô, û, ç, etc.)."
    };
    advicesProperties[key] = {
      type: Type.STRING,
      description: "Conseils pédagogiques détaillés en français, obligatoirement rédigés avec tous les accents (é, è, à, â, ê, î, ô, û, ç, etc.)."
    };
  }

  return {
    type: Type.OBJECT,
    properties: {
      studentEmail: { type: Type.STRING, nullable: true },
      studentName: { type: Type.STRING, nullable: true, description: "Nom complet de l'étudiant s'il est présent sur la copie" },
      transcription: { type: Type.STRING },
      brouillon_phase1_audit: { type: Type.STRING },
      brouillon_phase2_analyse: { type: Type.STRING },
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
            rule: { type: Type.STRING }
          },
          required: ['original', 'correction', 'rule']
        }
      }
    },
    required: ['studentEmail', 'studentName', 'transcription', 'brouillon_phase1_audit', 'brouillon_phase2_analyse', 'globalScore', 'criteriaScores', 'justifications', 'advices', 'errorsTable']
  };
}

export function parseOcrResponse(text: string): { transcription: string; studentName: string | null; studentEmail: string | null; ocrAlerts: string[] } {
  let studentName: string | null = null;
  let studentEmail: string | null = null;
  const ocrAlerts: string[] = [];
  let transcription = text;

  const metadataMatch = text.match(/\[METADATA\]([\s\S]*?)\[END_METADATA\]/);
  if (metadataMatch) {
    const metadataContent = metadataMatch[1];
    
    const nameMatch = metadataContent.match(/Nom:\s*(.*)/i);
    if (nameMatch) {
      const val = nameMatch[1].trim();
      if (val && val.toLowerCase() !== "non specifie" && val.toLowerCase() !== "non spécifié") {
        studentName = val;
      }
    }

    const emailMatch = metadataContent.match(/Email:\s*(.*)/i);
    if (emailMatch) {
      const val = emailMatch[1].trim();
      if (val && val.toLowerCase() !== "non specifie" && val.toLowerCase() !== "non spécifié") {
        studentEmail = val;
      }
    }

    // Extraction des alertes
    const alertLines = metadataContent.split('\n');
    for (const line of alertLines) {
      const match = line.match(/^(?:Alerte|Alert|Doute|Avis|OCR):\s*(.*)/i);
      if (match) {
        const val = match[1].trim();
        if (val && val.toLowerCase() !== "non specifie" && val.toLowerCase() !== "non spécifié" && val.toLowerCase() !== "aucun" && val.toLowerCase() !== "aucune") {
          ocrAlerts.push(val);
        }
      }
    }

    // Retirer les métadonnées de la transcription finale
    transcription = text.replace(/\[METADATA\][\s\S]*?\[END_METADATA\]/, '').trim();
  }

  // Fallback au cas où le bloc [METADATA] est absent mais que des lignes Nom/Email sont présentes au début
  if (!studentName || !studentEmail) {
    const lines = text.split('\n');
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      const line = lines[i].trim();
      
      if (!studentName) {
        const nameMatch = line.match(/^(?:Nom|Name|Họ và tên):\s*(.*)/i);
        if (nameMatch) {
          const val = nameMatch[1].trim();
          if (val && val.toLowerCase() !== "non specifie" && val.toLowerCase() !== "non spécifié" && val.length > 0) {
            studentName = val;
            transcription = transcription.replace(line, '').trim();
          }
        }
      }
      
      if (!studentEmail) {
        const emailMatch = line.match(/^(?:Email|Courriel):\s*(.*)/i);
        if (emailMatch) {
          const val = emailMatch[1].trim();
          if (val && val.toLowerCase() !== "non specifie" && val.toLowerCase() !== "non spécifié" && val.length > 0) {
            studentEmail = val;
            transcription = transcription.replace(line, '').trim();
          }
        }
      }
    }
  }

  // Heuristique locale additionnelle (en complément) :
  // 1. Répétition consécutive de mots de plus de 3 lettres
  const repeatMatch = transcription.match(/\b([a-zA-ZÀ-ÿ]{3,})\b\s+\1\b/gi);
  if (repeatMatch) {
    for (const match of repeatMatch) {
      const word = match.split(/\s+/)[0];
      if (!ocrAlerts.some(a => a.includes(word))) {
        ocrAlerts.push(`Répétition suspecte détectée : "${match}" (potentielle rature non reconnue)`);
      }
    }
  }

  // 2. Absence totale d'accents sur un texte français significatif
  const hasAccents = /[éèàçùôêëâîïûü]/i.test(transcription);
  const wordCount = transcription.trim().split(/\s+/).filter(Boolean).length;
  if (!hasAccents && wordCount > 40) {
    ocrAlerts.push("Absence totale de caractères accentués. L'OCR a peut-être manqué les accents de la copie manuscrite.");
  }

  // 3. Présence de mots suspects avec "cl" au lieu de "d"
  const clSuspects = transcription.match(/\bcl(ans|ire|eux|evant|ire|avoir)\b/gi);
  if (clSuspects) {
    for (const match of clSuspects) {
      let replacement = "";
      if (match.toLowerCase() === "clans") replacement = "dans";
      else if (match.toLowerCase() === "clire") replacement = "dire";
      else if (match.toLowerCase() === "clevant") replacement = "devant";
      if (replacement) {
        ocrAlerts.push(`Le mot "${match}" semble contenir une confusion OCR (probable "${replacement}").`);
      }
    }
  }

  return { transcription, studentName, studentEmail, ocrAlerts };
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
  freeTimeoutMs: number = 35000,
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
        console.warn(`[Gemini Fallback PE] Toutes les clés gratuites (${orderedKeys.length}) sont invalides ou refusées.`);
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
          console.warn(`[Gemini Fallback PE] Repli sur [${currentModel}] avec clé gratuite (${activeKeyIndex + 1}/${orderedKeys.length})...`);
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
          console.warn(`[Gemini Fallback PE] Clé API gratuite #${activeKeyIndex + 1} invalide/refusée (${errMsg}). Maintien du modèle [${currentModel}], passage à la clé suivante...`);
          keyCursor++;
          await new Promise(r => setTimeout(r, 500));
          continue;
        }

        // Cas B : Le motif n'est pas une clé invalide (surcharge 503, limitation 429, timeout, etc.)
        // Repli immédiat sur le modèle immédiatement inférieur avec une nouvelle clé API
        const nextModelIdx = currentModelIdx + 1;
        if (nextModelIdx < modelChain.length) {
          const nextModel = modelChain[nextModelIdx];
          console.warn(`[Gemini Fallback PE] Échec/Surcharge/Timeout sur [${currentModel}] avec clé #${activeKeyIndex + 1} (${errMsg}). Repli immédiat sur [${nextModel}] avec la clé suivante...`);
          currentModelIdx = nextModelIdx;
          keyCursor++;
          await new Promise(r => setTimeout(r, 500));
          continue;
        } else {
          // Dernier modèle de la chaîne (ex: 3.6 Flash ou modèle unique)
          const hasPaid = Boolean(paidKey && keyMode !== 'free_only');
          const remainingValidKeys = orderedKeys.length - invalidKeyIndices.size;
          if (!hasPaid && freeAttemptCount < orderedKeys.length && remainingValidKeys > 1) {
            console.warn(`[Gemini Fallback PE] Échec sur [${currentModel}] avec clé #${activeKeyIndex + 1} (${errMsg}). Essai de la clé suivante sur ce modèle...`);
            keyCursor++;
            await new Promise(r => setTimeout(r, 500));
            continue;
          }
          console.warn(`[Gemini Fallback PE] Épuisement des modèles de repli gratuits (${errMsg}).`);
          break;
        }
      }
    }
  }

  // 2. CLÉ PAYANTE : Utilisée en dernier recours lorsque toutes les clés gratuites ne fonctionnent pas
  if (paidKey && keyMode !== 'free_only') {
    console.log(`[Gemini Fallback PE] Recours à la clé payante en dernier recours (toutes les clés gratuites ont échoué)...`);
    notifyKey(paidKey);

    for (let m = 0; m < modelChain.length; m++) {
      const paidModel = modelChain[m];
      try {
        if (m > 0) {
          console.warn(`[Gemini Fallback PE] Repli clé payante sur [${paidModel}] (${m + 1}/${modelChain.length})...`);
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
          console.error(`[Gemini Fallback PE] La clé payante est invalide ou refusée (${errMsg}).`);
          throw error;
        }
        console.warn(`[Gemini Fallback PE] Échec clé payante sur [${paidModel}] (${errMsg}). Basculement vers le modèle suivant...`);
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
      console.warn(`[Gemini PE] Le modèle ${activeModel} ne supporte pas thinkingConfig (${error?.message || errStr}). Nouvelle tentative immédiate sans thinkingConfig...`);
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
  level: 'B1' | 'B2' = 'B2',
  ocrModel: 'flash' | 'pro' = 'flash',
  apiKeys?: KeyConfig,
  onKeySelected?: (info: { key: string, isCustom: boolean }) => void,
  useDoubleEval: boolean = false,
  gradingMode: 'detailed' | 'delf' = 'delf',
  nativeLanguage?: string
): Promise<CorrectionResult> {
  let studentTranscription = content.text || "";
  let ocrName = null;
  let ocrEmail = null;
  if (content.fileUri && content.mimeType) {
    const ocrResult = await extractText(content.fileUri, content.mimeType, level, ocrModel, apiKeys, onKeySelected, nativeLanguage);
    studentTranscription += "\n\n" + ocrResult.transcription;
    ocrName = ocrResult.studentName;
    ocrEmail = ocrResult.studentEmail;
  }
  const targetModel = resolveGeminiModel(evalModel);

  const systemInstruction = buildEvalSystemPrompt(level, language, gradingMode, nativeLanguage);
  const evalPrompt = buildEvalUserPrompt(subject, studentTranscription, language);

  const result1 = await runWithGeminiModelFallback(targetModel, async (activeModel, apiKey) => {
    const ai = new GoogleGenAI({ apiKey });
    const config: any = { 
      systemInstruction,
      responseMimeType: 'application/json', 
      responseSchema: getResponseSchema(level),
      maxOutputTokens: 32768,
    };

    const response = await generateContentSafe(ai, activeModel, {
      contents: [{ role: 'user', parts: [{ text: evalPrompt }] }],
      config,
      thinkingLevel: 'HIGH'
    });
    const textResp = response.text || "{}";
    const parsed = safeParseJson<CorrectionResult>(textResp);
    return sanitizeScores(sanitizeHallucinations(parsed, language), gradingMode, level);
  }, apiKeys, onKeySelected);

  if (ocrName) result1.studentName = ocrName;
  if (ocrEmail) result1.studentEmail = ocrEmail;

  if (!useDoubleEval) {
    return result1;
  }

  return superviseEvaluation(result1, studentTranscription, subject, language, temperature, evalModel, level, apiKeys, onKeySelected, gradingMode, nativeLanguage);
}

export async function superviseEvaluation(
  result1: CorrectionResult,
  studentTranscription: string,
  subject: string,
  language: string = 'FR',
  temperature: number = 0.15,
  evalModel: 'flash' | 'pro' | string = 'flash',
  level: string = 'B2',
  apiKeys?: KeyConfig,
  onKeySelected?: (info: { key: string, isCustom: boolean }) => void,
  gradingMode: 'detailed' | 'delf' = 'delf',
  nativeLanguage?: string
): Promise<CorrectionResult> {
  const targetModel = resolveGeminiModel(evalModel);
  
  const cleanResult1 = sanitizeScores(result1, gradingMode, level);
  const supervisorInstruction = buildSupervisorPrompt(level, language, gradingMode, nativeLanguage);
  const superPrompt = buildSupervisorUserPrompt(subject, studentTranscription, cleanResult1, language);

  const result2 = await runWithGeminiModelFallback(targetModel, async (activeModel, apiKey) => {
    const ai = new GoogleGenAI({ apiKey });
    const config: any = { 
      systemInstruction: supervisorInstruction,
      responseMimeType: 'application/json', 
      responseSchema: getResponseSchema(level),
      maxOutputTokens: 32768,
    };

    const response = await generateContentSafe(ai, activeModel, {
      contents: [{ role: 'user', parts: [{ text: superPrompt }] }],
      config,
      thinkingLevel: 'HIGH'
    });
    const textResp = response.text || "{}";
    const parsed = safeParseJson<CorrectionResult>(textResp);
    return sanitizeScores(sanitizeHallucinations(parsed, language), gradingMode, level);
  }, apiKeys, onKeySelected);

  // ── LOOP ENGINEERING : passe de vérification sur le JSON brut de l'Eval 2 ──
  const actualSupervisorModel = result2.modelUsed || targetModel;
  try {
    const verifyPrompt = buildLoopVerificationPrompt(language);
    const verifyInput  = JSON.stringify(result2);
    const verifiedResult = await runWithGeminiModelFallback(
      actualSupervisorModel,
      async (activeModel, apiKey) => {
        const ai = new GoogleGenAI({ apiKey });
        const config: any = { 
          systemInstruction: buildSupervisorPrompt(level, language, gradingMode, nativeLanguage),
          responseMimeType: 'application/json', 
          responseSchema: getResponseSchema(level),
          maxOutputTokens: 32768,
        };

        const vResponse = await generateContentSafe(ai, activeModel, {
          contents: [{ role: 'user', parts: [{ text: verifyPrompt + '\n\nJSON à vérifier :\n' + verifyInput }] }],
          config,
          thinkingLevel: 'LOW'
        });
        const vText = vResponse.text || "{}";
        const vParsed = safeParseJson<CorrectionResult>(vText);
        if (!vParsed.criteriaScores || Object.keys(vParsed.criteriaScores).length === 0) {
          return result2;
        }
        return sanitizeScores(sanitizeHallucinations(vParsed, language), gradingMode, level);
      },
      apiKeys,
      onKeySelected,
      1,     // maxFreeKeys = 1 pour vérification rapide
      1,     // maxAttempts = 1
      15000, // Timeout court de 15s pour bascule rapide
      20000  // Timeout clé payante de 20s
    );
    const finalJury = computeJuryResult(cleanResult1, verifiedResult, `Gemini ${getFriendlyModelName(actualSupervisorModel)}`, gradingMode, level);
    finalJury.modelUsed = actualSupervisorModel;
    if (result2.fallbackNotice) {
      finalJury.fallbackNotice = result2.fallbackNotice;
    }
    return finalJury;
  } catch (verifyErr: any) {
    console.warn('[Loop Engineering Gemini PE] Passe de vérification échouée ou dépassée, conservation directe de result2:', verifyErr?.message);
    const finalJury = computeJuryResult(cleanResult1, result2, `Gemini ${getFriendlyModelName(actualSupervisorModel)}`, gradingMode, level);
    finalJury.modelUsed = actualSupervisorModel;
    if (result2.fallbackNotice) {
      finalJury.fallbackNotice = result2.fallbackNotice;
    }
    return finalJury;
  }
}

export async function extractText(
  fileUri: string | Array<{ fileUri: string; mimeType: string }>,
  mimeType: string,
  level: string = 'B2',
  ocrModel: string = 'gemini-3.8-flash',
  apiKeys?: KeyConfig,
  onKeySelected?: (info: { key: string, isCustom: boolean }) => void,
  nativeLanguage?: string,
  customOcrPrompt?: string
): Promise<{ transcription: string; studentName: string | null; studentEmail: string | null; ocrAlerts: string[]; fallbackNotice?: string; modelUsed?: string }> {
  const targetModel = ocrModel === 'gemini-3.6-flash' ? 'gemini-3.6-flash' : 'gemini-3.8-flash';
  const rawResult = await runWithGeminiModelFallback(targetModel, async (activeModel, apiKey) => {
    const ai = new GoogleGenAI({ apiKey });
    const parts: any[] = [];
    if (Array.isArray(fileUri)) {
      for (const f of fileUri) {
        parts.push({ inlineData: { data: f.fileUri, mimeType: f.mimeType } });
      }
    } else {
      parts.push({ inlineData: { data: fileUri, mimeType } });
    }
    
    const ocrPrompt = customOcrPrompt || getOcrPrompt(level, nativeLanguage);
    parts.push({ text: ocrPrompt });

    const timeoutMs = 40000;
    const callPromise = ai.models.generateContent({ 
        model: activeModel, 
        contents: [{ role: 'user', parts }]
    });
    
    let timeoutTimer: any;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutTimer = setTimeout(() => {
        reject(new Error(`Timeout d'extraction (${timeoutMs/1000}s) dépassé pour le modèle ${activeModel}.`));
      }, timeoutMs);
    });

    try {
      const ocrResp = await Promise.race([callPromise, timeoutPromise]) as any;
      clearTimeout(timeoutTimer);

      let rawOcrText = ocrResp.text || "";
      if (!rawOcrText.trim() && ocrResp.candidates?.[0]?.content?.parts) {
        for (const part of ocrResp.candidates[0].content.parts) {
          if (part.text && !part.thought) {
            rawOcrText += part.text;
          }
        }
      }

      const finishReason = ocrResp.candidates?.[0]?.finishReason;
      if (finishReason === 'SAFETY' || finishReason === 'RECITATION' || finishReason === 'BLOCKLIST') {
        throw new Error(`L'extraction OCR a été bloquée par les filtres de sécurité (${finishReason}).`);
      }

      const cleanedText = rawOcrText.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
      if (!cleanedText) {
        throw new Error(`Le modèle ${activeModel} a retourné une extraction OCR vide.`);
      }

      return {
        text: cleanedText
      };
    } catch (err) {
      clearTimeout(timeoutTimer);
      throw err;
    }
  }, apiKeys, onKeySelected, 3, 4);

  const parsed = parseOcrResponse(rawResult.text);
  const friendlyPrev = getFriendlyModelName(targetModel);
  const modelUsed = (rawResult as any).modelUsed || targetModel;
  const friendlyCurr = getFriendlyModelName(modelUsed);
  const fallbackNotice = (rawResult as any).fallbackNotice
    ? `⚡ Extraction OCR réalisée avec ${friendlyCurr} (repli automatique suite à un délai dépassé ou une indisponibilité temporaire de ${friendlyPrev}).`
    : undefined;

  return {
    ...parsed,
    modelUsed,
    fallbackNotice
  };
}

/**
 * Compte le nombre de mots selon la règle standard (espaces).
 * Correspond à la méthode de comptage FEI (France Éducation International).
 */
export function countWords(text: string): number {
  if (!text) return 0;
  // Nettoyage des caractères spéciaux et comptage par espaces
  const words = text
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0);
  return words.length;
}

function getArbiterResponseSchema(level?: string) {
  return {
    type: Type.OBJECT,
    properties: {
      evaluation: getResponseSchema(level),
      comparisonNotes: {
        type: Type.STRING,
        description: "Commentaire critère par critère sur les écarts entre l'évaluation 1 et l'évaluation 2 (destiné au correcteur, sans markdown)."
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
  level: string = 'B2',
  apiKeys?: KeyConfig,
  onKeySelected?: (info: { key: string, isCustom: boolean }) => void,
  notationType: 'detailed' | 'delf' = 'detailed'
): Promise<CorrectionResult> {
  const targetModel = (evalModel === 'pro' || (evalModel as string) === 'argon') ? 'gemini-4-argon' : 'gemini-3.8-flash';
  
  const criteria = [...getCriteriaKeys(level)];
  const systemPrompt = buildArbiterSystemPrompt(level, language, notationType);
  const userPrompt = buildArbiterUserPrompt(subject, studentTranscription, firstEval, secondEval, firstProvider, secondProvider, language);

  const resultRaw = await runWithGeminiModelFallback(targetModel, async (activeModel, apiKey) => {
    const ai = new GoogleGenAI({ apiKey });
    const reqConfig: any = {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
      responseSchema: getArbiterResponseSchema(level),
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

export async function evaluateDictation(
  studentTranscription: string,
  referenceText: string,
  maxScore: number = 10,
  penalties?: DictationPenaltyConfig,
  customInstructions?: string,
  evalModel: string = 'flash',
  apiKeys?: KeyConfig,
  onKeySelected?: (info: { key: string, isCustom: boolean }) => void
) {
  const targetModel = resolveGeminiModel(evalModel);
  const systemInstruction = buildDictationSystemPrompt();
  const userPrompt = buildDictationUserPrompt(studentTranscription, referenceText, customInstructions);

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

  return finaliserDictee(rawJson, studentTranscription, { referenceText, maxScore, penalties, customInstructions });
}

export async function evaluateTranslation(
  studentTranslation: string,
  sourceText: string,
  maxScore: number = 10,
  modelTranslation?: string,
  customInstructions?: string,
  sourceLang: string = "Français",
  targetLang: string = "Français",
  criteria: CustomCriterion[] = DEFAULT_TRANSLATION_CRITERIA,
  evalModel: string = 'flash',
  apiKeys?: KeyConfig,
  onKeySelected?: (info: { key: string, isCustom: boolean }) => void
) {
  const targetModel = resolveGeminiModel(evalModel);
  const systemInstruction = buildTranslationSystemPrompt(maxScore, sourceLang, targetLang, criteresTraduction({ sourceText, maxScore, sourceLang, targetLang, criteria }));
  const userPrompt = buildTranslationUserPrompt(studentTranslation, sourceText, modelTranslation, customInstructions);

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

  return finaliserTraduction(rawJson, studentTranslation, {
    sourceText, maxScore, modelTranslation, customInstructions,
    sourceLang, targetLang, criteria,
  });
}

export async function evaluateGrammar(
  studentAnswers: string,
  exerciseSubject: string,
  maxScore: number = 10,
  answerKey?: string,
  customInstructions?: string,
  evalModel: string = 'flash',
  apiKeys?: KeyConfig,
  onKeySelected?: (info: { key: string, isCustom: boolean }) => void
) {
  const targetModel = resolveGeminiModel(evalModel);
  const systemInstruction = buildGrammarSystemPrompt(maxScore);
  const userPrompt = buildGrammarUserPrompt(studentAnswers, exerciseSubject, answerKey, customInstructions);

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

  return finaliserGrammaire(rawJson, studentAnswers, { exerciseSubject, maxScore, answerKey, customInstructions });
}

export async function evaluateComposition(
  studentText: string,
  subject: string,
  compositionType: CompositionSubType = 'essai',
  maxScore: number = 20,
  corpusText?: string,
  targetLanguage: string = 'Français',
  customInstructions?: string,
  criteria?: CustomCriterion[],
  evalModel: string = 'flash',
  apiKeys?: KeyConfig,
  onKeySelected?: (info: { key: string, isCustom: boolean }) => void,
  disableStandardGrid: boolean = false
) {
  const targetModel = resolveGeminiModel(evalModel);
  const params: ParamsComposition = {
    subject, compositionType, maxScore, corpusText, targetLanguage,
    customInstructions, criteria, disableStandardGrid: !!disableStandardGrid,
  };
  const activeCriteria = criteresComposition(params);

  const systemInstruction = buildCompositionSystemPrompt(
    compositionType,
    maxScore,
    targetLanguage,
    activeCriteria,
    disableStandardGrid,
    customInstructions
  );
  const userPrompt = buildCompositionUserPrompt(
    studentText,
    subject,
    corpusText,
    customInstructions,
    targetLanguage,
    disableStandardGrid
  );

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

  return finaliserComposition(rawJson, studentText, params);
}


