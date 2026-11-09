/**
 * Logique partagée de gestion des clés API et de retry/fallback.
 *
 * Ce module est partagé à l'identique entre `correcteur-PO` et `correcteur-PE`.
 * Il centralise :
 *   - la rotation des clés gratuites (round-robin déterministe) ;
 *   - le basculement vers la clé payante ;
 *   - les délais d'attente (timeouts), y compris pour les fournisseurs qui
 *     n'en avaient aucun ;
 *   - la classification des erreurs : transitoires (on réessaie), liées à une
 *     clé (on passe à la suivante), ou fatales (on abandonne).
 *
 * Chaque service LLM en avait auparavant sa propre copie, avec des
 * comportements divergents (rotation aléatoire ici, round-robin là, timeout
 * uniquement pour Gemini).
 */

// Force la résolution IPv4 en priorité côté serveur Node.js pour éviter les blocages/timeouts
// IPv6 fréquents lors de l'utilisation de VPNs (ex. PrivateVPN) ou de routeurs mal configurés.
if (typeof window === 'undefined') {
  try {
    const nodeDns = (globalThis as any).process?.versions?.node ? eval('require')('node:dns') : null;
    if (typeof nodeDns?.setDefaultResultOrder === 'function') {
      nodeDns.setDefaultResultOrder('ipv4first');
    }
  } catch {
    /* environnement sans support dns */
  }
}

export interface KeyConfig {
  freeKeys?: string[] | string;
  paidKey?: string;
  keyMode?: 'free_only' | 'paid_only' | 'both';
  onlyFreeKeys?: boolean;
}

export type OnKeySelected = (info: { key: string; isCustom: boolean }) => void;

/** Délai par défaut accordé à l'ensemble de la rotation des clés gratuites. */
export const DEFAULT_FREE_TIMEOUT_MS = 30000;
/** Délai par défaut accordé à un appel sur la clé payante. */
export const DEFAULT_PAID_TIMEOUT_MS = 120000;

// ─────────────────────────────────────────────────────────────────────────────
// Classification des erreurs
// ─────────────────────────────────────────────────────────────────────────────

/** Codes HTTP pour lesquels une nouvelle tentative a du sens. */
const TRANSIENT_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);

/** Codes HTTP définitifs : réessayer ne changera rien. */
const FATAL_STATUS = new Set([400, 404, 405, 413, 415, 422]);

/** Codes HTTP signalant un problème propre à la clé utilisée. */
const KEY_STATUS = new Set([401, 403]);

/**
 * Extrait un code HTTP de l'erreur.
 *
 * On privilégie les champs structurés (`error.status`, `error.response.status`)
 * et, à défaut, on cherche un code dans un contexte explicite du message
 * (« API error (503) », « status: 429 », « HTTP 500 »).
 *
 * C'est le point clé de l'amélioration : l'ancienne version testait la simple
 * présence des chaînes « 500 », « limit », « internal » ou « demand » n'importe
 * où dans le message sérialisé. Une erreur de validation contenant « 500
 * caractères » ou « character limit » déclenchait alors quatre tentatives avec
 * backoff, soit une vingtaine de secondes perdues pour rien.
 */
function extractHttpStatus(error: any): number | null {
  const structured = [
    error?.status,
    error?.statusCode,
    error?.response?.status,
    error?.cause?.status,
    error?.error?.status,
  ];
  for (const value of structured) {
    const n = Number(value);
    if (Number.isInteger(n) && n >= 100 && n <= 599) return n;
  }

  const message = typeof error === 'string' ? error : String(error?.message ?? '');
  const patterns = [
    /\((\d{3})\)/,                                       // "Mistral API error (429): ..."
    /\b(?:status|statuscode|code|http|erreur)\s*[:=]?\s*(\d{3})\b/i, // "status: 503"
    /^\s*(\d{3})\b/,                                     // "429 Too Many Requests"
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      const n = Number(match[1]);
      if (n >= 100 && n <= 599) return n;
    }
  }
  return null;
}

/**
 * Expressions signalant une erreur temporaire. Contrairement à l'ancienne
 * liste, ce sont des expressions complètes et non des fragments ambigus.
 */
const TRANSIENT_PHRASES = [
  // Quotas et limitation de débit
  'quota', 'rate limit', 'rate-limit', 'ratelimit', 'too many requests',
  'resource exhausted', 'resource_exhausted',
  // Surcharge du fournisseur
  'overloaded', 'high demand', 'service unavailable', 'temporarily unavailable',
  'model is currently loading', 'server is busy', 'try again later',
  'bad gateway', 'gateway timeout', 'internal server error', 'internal error',
  // Délais et réseau
  'timeout', 'timed out', "délai d'attente", 'delai d attente', 'deadline exceeded',
  'econnreset', 'etimedout', 'enotfound', 'econnrefused', 'epipe', 'eai_again',
  'fetch failed', 'socket hang up', 'network error', 'undici',
  // Réponse tronquée ou vide (typiquement une coupure en cours de génération)
  'unexpected end of json', 'json parse', 'json invalide',
  'réponse vide', 'reponse vide', 'texte à parser est vide',
];

/** Expressions signalant une clé invalide, expirée ou sans permission. */
const KEY_PHRASES = [
  'api key not valid', 'api_key_invalid', 'invalid api key', 'invalid_api_key',
  'api key expired', 'expired api key', 'incorrect api key',
  'permission_denied', 'permission denied', 'authentication', 'unauthenticated',
  'invalid authentication', 'insufficient_quota',
];

function normalizeError(error: any): string {
  if (typeof error === 'string') return error.toLowerCase();
  if (!error) return '';
  let serialized = '';
  try {
    serialized = JSON.stringify(error);
  } catch {
    serialized = '';
  }
  return [error.message, error.cause?.message, error.cause?.code, serialized]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Erreur temporaire : il faut réessayer (éventuellement après une pause). */
export function isTransientError(error: any): boolean {
  const status = extractHttpStatus(error);
  if (status !== null) {
    if (TRANSIENT_STATUS.has(status)) return true;
    if (FATAL_STATUS.has(status) || KEY_STATUS.has(status)) return false;
  }
  const text = normalizeError(error);
  return TRANSIENT_PHRASES.some(phrase => text.includes(phrase));
}

/**
 * Erreur propre à UNE clé (invalide, expirée, refusée) : il faut passer à la
 * clé suivante au lieu d'abandonner tout le lot alors que d'autres clés
 * peuvent être valides.
 */
export function isKeyError(error: any): boolean {
  const status = extractHttpStatus(error);
  if (status !== null && KEY_STATUS.has(status)) return true;
  const text = normalizeError(error);
  return KEY_PHRASES.some(phrase => text.includes(phrase));
}

/** Vrai si l'erreur provient d'un dépassement de délai imposé par nos soins. */
function isTimeoutError(error: any): boolean {
  const text = normalizeError(error);
  return text.includes('timeout') || text.includes('timed out') ||
         text.includes('secondes') || text.includes('délai') || text.includes('delai');
}

// ─────────────────────────────────────────────────────────────────────────────
// Exécution avec délai maximal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Exécute une promesse avec un délai maximal (timeout).
 * Sans cela, un fournisseur qui n'envoie jamais de réponse bloque
 * indéfiniment le flux SSE d'un traitement par lot.
 */
export function executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number, timeoutMsg: string): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMsg)), timeoutMs);
  });
  return Promise.race([fn(), timeoutPromise]).finally(() => clearTimeout(timer));
}

// Index global pour la rotation stricte (Round-Robin) des clés gratuites
let freeKeyIndex = 0;

/**
 * Retourne la liste ordonnée des clés gratuites selon la sélection circulaire (round-robin)
 * et avance l'index global pour les appels futurs.
 */
export function getOrderedFreeKeys(freeKeys: string[]): string[] {
  if (!freeKeys || freeKeys.length === 0) return [];
  const count = freeKeys.length;
  const startIndex = freeKeyIndex % count;
  freeKeyIndex = (freeKeyIndex + 1) % count;

  const orderedKeys: string[] = [];
  for (let i = 0; i < count; i++) {
    orderedKeys.push(freeKeys[(startIndex + i) % count]);
  }
  return orderedKeys;
}

/**
 * Exécute `action` en gérant la rotation des clés et les nouvelles tentatives.
 *
 * @param maxFreeKeys    limite le nombre de clés gratuites essayées
 * @param maxAttempts    nombre de tentatives sur la clé payante (défaut : 4)
 * @param freeTimeoutMs  budget global de la rotation des clés gratuites
 * @param paidTimeoutMs  délai d'un appel sur la clé payante
 * @param providerLabel  nom du fournisseur, pour des messages de log lisibles
 */
export async function withRetryAndFallback(
  action: (apiKey: string, isPaid?: boolean) => Promise<any>,
  keys?: KeyConfig,
  onKeySelected?: OnKeySelected,
  maxFreeKeys?: number,
  maxAttempts?: number,
  freeTimeoutMs: number = DEFAULT_FREE_TIMEOUT_MS,
  paidTimeoutMs: number = DEFAULT_PAID_TIMEOUT_MS,
  providerLabel: string = 'LLM'
): Promise<any> {
  const rawFree = keys?.freeKeys;
  let freeKeys = (Array.isArray(rawFree) ? rawFree : (typeof rawFree === 'string' ? rawFree.split(/\n|,/) : []))
    .map(k => k.trim())
    .filter(k => k.length > 0);

  if (maxFreeKeys !== undefined && freeKeys.length > maxFreeKeys) {
    freeKeys = [...freeKeys].slice(0, maxFreeKeys);
  }

  const paidKey = keys?.paidKey?.trim();
  const keyMode = keys?.keyMode || (keys?.onlyFreeKeys ? 'free_only' : 'both');
  const notifyKey = (key: string) => {
    if (typeof onKeySelected === 'function') onKeySelected({ key, isCustom: true });
  };

  let lastError: any = null;
  let attemptedFreeKeys = false;

  // 1. ROTATION DES CLÉS GRATUITES (Round-Robin strict)
  if (keyMode !== 'paid_only' && freeKeys.length > 0) {
    attemptedFreeKeys = true;

    // Sélection circulaire déterministe : chaque appel démarre à la clé suivante.
    const orderedKeys = getOrderedFreeKeys(freeKeys);

    const rotationStart = Date.now();
    const hasPaidFallback = Boolean(paidKey && keyMode !== 'free_only');
    // Pour Gemini, une alternative existe toujours grâce à la chaîne de repli de modèles
    const hasAlternative = hasPaidFallback || orderedKeys.length > 1 || providerLabel.toLowerCase().includes('gemini');

    // Sans aucune alternative (une seule clé, pas de clé payante — le cas de
    // Mistral, limité à une clé et un seul modèle), couper au bout de 30 s
    // ferait échouer une requête qui aurait abouti à 45 s. On accorde alors le
    // délai long : il n'y a de toute façon rien vers quoi basculer.
    const rotationBudget = hasAlternative ? freeTimeoutMs : paidTimeoutMs;

    freeRotationLoop: for (let i = 0; i < orderedKeys.length; i++) {
      const currentKey = orderedKeys[i];
      notifyKey(currentKey);

      // Si une seule clé gratuite est disponible (cas typique pour une clé d'appoint),
      // autoriser jusqu'à 3 tentatives avec backoff si l'erreur est transitoire (ex. fetch failed, 429, 503)
      // tant que le budget de temps global le permet.
      const maxAttemptsThisKey = orderedKeys.length === 1 ? (hasPaidFallback ? 2 : 3) : 1;

      for (let attempt = 1; attempt <= maxAttemptsThisKey; attempt++) {
        const elapsed = Date.now() - rotationStart;
        const remainingBudget = rotationBudget - elapsed;
        if ((hasPaidFallback || i > 0 || attempt > 1) && (elapsed >= rotationBudget || remainingBudget < 8000)) {
          console.log(`[${providerLabel}] Budget temps de rotation gratuit épuisé ou insuffisant (${Math.round(remainingBudget / 1000)}s restantes). Passage à la suite.`);
          break freeRotationLoop;
        }

        const timeoutForThisKey = Math.min(freeTimeoutMs, Math.max(1000, remainingBudget));

        try {
          return await executeWithTimeout(
            () => action(currentKey, false),
            timeoutForThisKey,
            `Le serveur ${providerLabel} (clé gratuite) n'a pas répondu au bout de ${Math.round(timeoutForThisKey / 1000)} secondes (surcharge du serveur).`
          );
        } catch (error: any) {
          lastError = error;
          const timedOut = isTimeoutError(error);

          // Dès que le délai est atteint et qu'une clé payante existe, on bascule immédiatement.
          if (hasPaidFallback && (timedOut || (Date.now() - rotationStart) >= rotationBudget)) {
            console.warn(`[${providerLabel} Clé gratuite] Délai atteint. Basculement immédiat sur la clé payante.`);
            break freeRotationLoop;
          }
          if (!hasPaidFallback && timedOut) {
            console.warn(`[${providerLabel} Clé gratuite] Délai atteint. Interruption de la rotation.`);
            break freeRotationLoop;
          }

          // Erreur de clé définitive (401/403 invalide ou expirée) : inutile de retenter sur cette clé
          if (isKeyError(error)) {
            console.warn(`[${providerLabel} Clé gratuite ${i + 1}/${orderedKeys.length}] Clé rejetée (${error?.message || error}).`);
            break;
          }

          // Erreur définitive (400, 404, etc.) et aucune alternative : inutile d'insister.
          if (!isTransientError(error)) {
            if (!hasPaidFallback) throw error;
            console.warn(`[${providerLabel} Clé gratuite ${i + 1}/${orderedKeys.length}] Erreur non transitoire (${error?.message || error}). Passage à la clé payante.`);
            break freeRotationLoop;
          }

          // Erreur transitoire sur clé unique : nouvelle tentative avec pause (backoff)
          if (attempt < maxAttemptsThisKey) {
            const delayMs = attempt === 1 ? 2500 : 5000;
            console.warn(`[${providerLabel} Clé gratuite] Erreur transitoire (${error?.message || error}) — tentative ${attempt}/${maxAttemptsThisKey}. Nouvel essai dans ${(delayMs / 1000).toFixed(1)}s...`);
            await new Promise(r => setTimeout(r, delayMs));
            continue;
          }

          console.warn(`[${providerLabel} Clé gratuite ${i + 1}/${orderedKeys.length}] Échec après ${maxAttemptsThisKey} tentative(s) (${error?.message || error}). Rotation vers la clé suivante...`);
          if (i < orderedKeys.length - 1) {
            await new Promise(r => setTimeout(r, 500));
          }
        }
      }
    }
  }

  // 2. CLÉ PAYANTE (après épuisement ou dépassement de délai des clés gratuites)
  if (paidKey && keyMode !== 'free_only') {
    if (attemptedFreeKeys) {
      console.log(`[${providerLabel}] Reprise immédiate de la tâche avec la clé payante.`);
    }
    notifyKey(paidKey);

    const maxPaidAttempts = maxAttempts !== undefined ? maxAttempts : 4;
    for (let attempt = 1; attempt <= maxPaidAttempts; attempt++) {
      try {
        return await executeWithTimeout(
          () => action(paidKey, true),
          paidTimeoutMs,
          `Délai d'attente dépassé (${Math.round(paidTimeoutMs / 1000)}s) sur la clé payante ${providerLabel}.`
        );
      } catch (error: any) {
        lastError = error;
        if (isTransientError(error) && attempt < maxPaidAttempts) {
          const delays = [2500, 6000, 12000];
          const delayMs = delays[attempt - 1] || 15000;
          console.warn(`[${providerLabel} Clé payante] Erreur transitoire (${error?.message || error}) — tentative ${attempt}/${maxPaidAttempts}. Nouvel essai dans ${(delayMs / 1000).toFixed(1)}s...`);
          await new Promise(r => setTimeout(r, delayMs));
          continue;
        }
        throw error;
      }
    }
  }

  // 3. AUCUNE CLÉ N'A ABOUTI
  if (lastError) {
    throw lastError;
  }
  throw new Error(
    freeKeys.length > 0
      ? `Toutes les clés gratuites ${providerLabel} sont épuisées ou surchargées (quota / 503 / délai dépassé) et aucune clé payante n'est configurée.`
      : `Aucune clé API ${providerLabel} fournie.`
  );
}
