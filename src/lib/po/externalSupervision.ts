/**
 * Double évaluation "externe" (optionnelle) pour la Production Orale.
 * Au lieu d'appeler une API de supervision depuis le serveur, on exporte un
 * paquet de consignes que l'utilisateur soumet à une IA externe (ex. Claude sur
 * claude.ai), puis on réimporte le JSON produit et on finalise EXACTEMENT comme
 * la double évaluation interne (mêmes prompts, mêmes nettoyages, même fusion
 * `computeJuryResult`).
 *
 * L'épreuve étant orale, le prompt superviseur gère déjà le cas d'un modèle
 * purement textuel (sans accès à l'audio) : il se fie alors à la transcription
 * annotée et au critère de phonologie établi par le 1er examinateur.
 *
 * Ce module est volontairement sans dépendance réseau : il ne fait que
 * construire des chaînes de caractères et fusionner des objets.
 */
import type { CorrectionResult } from './geminiService';
import {
  buildSupervisorPrompt,
  buildSupervisorUserPrompt,
  buildEvalSystemPrompt,
  buildEvalUserPrompt,
  computeJuryResult,
  sanitizeScores,
  sanitizeHallucinations,
  cleanJuryComment,
  cleanEvalForPrompt,
  safeParseJson,
  getLanguageInstruction,
} from './promptUtils';
import { getFriendlyModelName } from '../modelNames';

/** Critères attendus selon le niveau (production orale). */
export const CRITERIA_BY_LEVEL: Record<string, string[]> = {
  B1: ['entretien', 'interaction', 'monologue', 'lexique', 'morphosyntaxe', 'phonologie'],
  B2: ['monologue', 'interaction', 'lexique', 'morphosyntaxe', 'phonologie'],
};

export interface ExternalSupervisionTask {
  /** Identifiant unique de la copie (nom de fichier en lot, ou "single"). */
  fileId: string;
  subject: string;
  transcription: string;
  /** Résultat de la 1re évaluation (examinateur initial). */
  result1: CorrectionResult;
}

export interface ExternalSupervisionConfig {
  level: 'B1' | 'B2' | string;
  language: string;
  notationType: 'detailed' | 'delf';
}

export interface ExternalSupervisionReturn {
  fileId: string;
  evaluation: any;
  /** Commentaire de comparaison (mode arbitre) : pour le correcteur, jamais dans le PDF. */
  comparisonNotes?: string;
}

/** Tâche de 3e évaluation (arbitre) : porte les DEUX évaluations précédentes. */
export interface ExternalArbiterTask {
  fileId: string;
  subject: string;
  transcription: string;
  firstEval: CorrectionResult;
  secondEval: CorrectionResult;
  firstProvider?: string;
  secondProvider?: string;
}

/** Critères attendus pour une tâche : on se fie d'abord aux clés réelles de result1. */
function expectedCriteria(task: ExternalSupervisionTask, level: string): string[] {
  const fromResult = task.result1?.criteriaScores ? Object.keys(task.result1.criteriaScores) : [];
  return fromResult.length > 0 ? fromResult : (CRITERIA_BY_LEVEL[level] || CRITERIA_BY_LEVEL.B2);
}

/**
 * Construit le document Markdown à confier à l'IA externe. Le prompt système
 * (identique pour toutes les copies) est donné une seule fois ; chaque copie
 * n'ajoute que son prompt utilisateur (qui contient déjà le sujet, la
 * transcription et le rapport du 1er examinateur).
 */
export function buildExternalSupervisionMarkdown(
  tasks: ExternalSupervisionTask[],
  config: ExternalSupervisionConfig,
): string {
  const systemPrompt = buildSupervisorPrompt(config.level, config.language, config.notationType);
  // Nettoyer le prompt des directives JSON obsolètes de premier niveau pour éviter les contradictions de format
  const cleanSystemPrompt = systemPrompt.split("Tu DOIS impérativement retourner un objet JSON")[0].trim();
  const criteria = CRITERIA_BY_LEVEL[config.level] || CRITERIA_BY_LEVEL.B2;
  const ids = tasks.map(t => JSON.stringify(t.fileId)).join(', ');

  const header = `# Double évaluation externe DELF ${config.level} — Production Orale
 
Tu joues le rôle de la DOUBLE ÉVALUATION (examinateur superviseur) d'une épreuve de PRODUCTION ORALE. Tu dois traiter **chacune des ${tasks.length} copie(s)** listée(s) plus bas en appliquant les CONSIGNES DU SUPERVISEUR (section suivante). Tu n'as pas accès à l'audio : fie-toi à la transcription annotée (API/IPA) et au critère de phonologie établi par le 1er examinateur, en l'ajustant uniquement si sa justification est incohérente.
 
## Format de sortie STRICT (à respecter impérativement)
Réponds **uniquement** par un unique tableau JSON valide, sans aucun texte avant ou après, de la forme :
 
\`\`\`json
[
  { "fileId": "<identifiant exact de la copie>", "evaluation": { ... } }
]
\`\`\`
 
- Un objet par copie, avec le \`fileId\` recopié **à l'identique** (valeurs attendues : ${ids}).
- Le champ \`evaluation\` doit respecter EXACTEMENT le schéma du rapport : \`studentEmail\`, \`studentName\`, \`transcription\`, \`transcriptionCorrigee\`, \`brouillon_phase1_audit\`, \`brouillon_phase2_analyse\`, \`globalScore\`, \`criteriaScores\` (clés pour le niveau ${config.level} : ${criteria.join(', ')}), \`justifications\`, \`advices\`, \`errorsTable\` (chaque erreur : \`original\`, \`correction\`, \`rule\` ; fautes linguistiques uniquement ; l'alphabet phonétique API/IPA et les défauts de prononciation y sont strictement interdits).
- Strictement AUCUN lien markdown [texte](url), aucune URL web et aucun formatage markdown (**gras**, etc.) dans les textes ou brouillons.
- Silence et purge des fausses erreurs : zéro polémique ou commentaire défensif réfutant le premier examinateur dans errorsTable ou justifications (si une pseudo-erreur a été relevée à tort, la supprimer silencieusement sans laisser de trace pour l'élève).
- Ce sont TES propres notes de superviseur (elles peuvent différer de l'examinateur 1). La moyenne finale sera recalculée automatiquement par l'application : ne calcule pas la moyenne toi-même.
 
## Consignes du superviseur (identiques pour toutes les copies)
${cleanSystemPrompt}
`;

  const blocks = tasks.map((task, i) => {
    const userPrompt = buildSupervisorUserPrompt(task.subject, task.transcription, task.result1, config.language);
    return `---

## Copie ${i + 1} — fileId : \`${task.fileId}\`
${userPrompt}`;
  });

  const loopSection = `

---

## 🔁 Phase 2 — Auto-vérification obligatoire (Loop Engineering)

Avant de produire le tableau JSON final, relis chacune de tes évaluations et vérifie les points suivants pour **chaque copie** :

1. **COMPLÉTUDE** : Chaque critère dispose-t-il d'une justification et d'un conseil (advices) en au moins 2 phrases complètes ?
2. **COHÉRENCE NOTES/COMMENTAIRES** : Les notes dans \`criteriaScores\` correspondent-elles exactement au niveau décrit dans les justifications ?
3. **ERREURS OMISES & SYNCHRONISATION** : Y a-t-il des erreurs linguistiques flagrantes dans la transcription absentes de \`errorsTable\` ? Toute faute corrigée dans \`transcriptionCorrigee\` est-elle bien répertoriée dans \`errorsTable\` (zéro correction silencieuse) ? Les simples bégaiements oraux sans faute ont-ils bien été exclus d'errorsTable ?
4. **BIAIS CENTRAL & PLAFONDS** : As-tu évité les notes moyennes par défaut là où la performance était clairement insuffisante ou bonne ? As-tu appliqué le plafond de Lexique à 1/5 (B2) ou 1/4 (B1) en cas de recours répété à une langue étrangère ?
5. **VOUVOIEMENT** : Les champs \`justifications\` et \`advices\` utilisent-ils uniquement le vouvoiement (« vous ») ?
6. **LANGUE OBLIGATOIRE** : Le rapport est-il rédigé STRICTEMENT dans la langue demandée (${config.language === 'VN' ? 'Vietnamien' : config.language === 'FR' ? 'Français' : config.language}) avec tous les accents et signes diacritiques ? Il est STRICTEMENT INTERDIT de rédiger en français si la langue demandée est le vietnamien.
7. **AUCUNE MENTION DE NOTE CHIFFRÉE DANS LE TEXTE** : Les justifications, conseils et brouillons sont-ils exempts de toute note chiffrée ou fraction (comme « Điểm đánh giá phù hợp : X », « Mức điểm : X », « Note : X/5 » ; les notes vont UNIQUEMENT dans criteriaScores) ?
8. **FIDÉLITÉ DE transcriptionCorrigee (ZÉRO SPÉCULATION NI EMBELLISSEMENT)** : Les tournures inintelligibles sont-elles laissées entre crochets [locution incompréhensible, non reconstituée : « ... »] sans tenter de deviner ? Les propos d'un candidat en difficulté ont-ils été maintenus sans lissage ? La polarité négative/affirmative est-elle strictement identique à errorsTable ?
9. **PURETÉ DU FRANÇAIS DANS transcriptionCorrigee** : Le texte corrigé est-il 100% en français sans mot vietnamien parasite (ex: « và » au lieu de « et ») ?
10. **AUCUN FORMATAGE MARKDOWN NI LIEN HYPERTEXTE** : Vérifie qu'aucun lien markdown [texte](url), aucune URL web et aucune balise de mise en forme (**gras**, *italique*, etc.) ne subsiste dans les justifications, conseils, brouillons ou règles.
11. **ZÉRO POLÉMIQUE NI MÉTA-DISCOURS DANS errorsTable** : Vérifie qu'aucune entrée d'errorsTable ne débat ou ne justifie pourquoi une tournure n'est pas une faute. Supprime silencieusement toute entrée défensive (« Ce n'est pas une faute », etc.).
12. **ACCORDS ÉLÉMENTAIRES ET DU LOCUTEUR** : Vérifie que les accords de base et l'accord de genre lorsque le locuteur s'identifie clairement ne sont pas passés inaperçus.
13. **ÉLÉGANCE ET VARIÉTÉ DES CORRECTIONS** : Vérifie que les corrections sont naturelles et évitent les répétitions maladroites dans des phrases successives.

Si tu détectes une lacune, corrige ton JSON avant de l'envoyer.
Renvoie uniquement le tableau JSON final corrigé — aucun texte avant ou après.`;

  return [header, ...blocks, loopSection].join('\n\n');
}

function repairTruncatedJson(str: string): string {
  let inString = false;
  let isEscaped = false;
  const stack: ('{' | '[')[] = [];

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (isEscaped) {
      isEscaped = false;
      continue;
    }
    if (char === '\\') {
      isEscaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') {
        stack.push('{');
      } else if (char === '[') {
        stack.push('[');
      } else if (char === '}') {
        if (stack[stack.length - 1] === '{') {
          stack.pop();
        }
      } else if (char === ']') {
        if (stack[stack.length - 1] === '[') {
          stack.pop();
        }
      }
    }
  }

  let repaired = str;
  if (inString) {
    repaired += '"';
  }
  
  while (stack.length > 0) {
    const last = stack.pop();
    if (last === '{') {
      repaired += '}';
    } else if (last === '[') {
      repaired += ']';
    }
  }

  return repaired;
}

/**
 * Nettoie et échappe les caractères de contrôle non échappés (comme les sauts de ligne ou tabulations)
 * présents littéralement à l'intérieur des chaînes de caractères double-guillemets d'un JSON brut.
 */
export function escapeControlCharactersInStrings(str: string): string {
  let inString = false;
  let isEscaped = false;
  let result = "";

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    
    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        result += char;
        continue;
      }
      if (char === '\\') {
        isEscaped = true;
        result += char;
        continue;
      }
      if (char === '"') {
        inString = false;
        result += char;
        continue;
      }
      if (char === '\n') {
        result += "\\n";
      } else if (char === '\r') {
        result += "\\r";
      } else if (char === '\t') {
        result += "\\t";
      } else {
        const code = char.charCodeAt(0);
        if (code < 32) {
          continue;
        }
        result += char;
      }
    } else {
      if (char === '"') {
        inString = true;
      }
      result += char;
    }
  }
  return result;
}

/**
 * Extrait le tableau de résultats depuis la réponse (brute) de l'IA externe.
 * Tolérant : accepte un bloc ```json ... ``` (fermé ou non), un tableau brut, un objet
 * unique, ou du texte explicatif entourant le JSON.
 */
export function parseExternalSupervisionResults(raw: string): ExternalSupervisionReturn[] {
  if (!raw || !raw.trim()) throw new Error('Le contenu importé est vide.');

  let text = raw.trim();

  // 1. Nettoyer les balises de code Markdown au début ou à la fin si isolées
  text = text.replace(/^```(?:json)?\s*/i, '');
  text = text.replace(/\s*```$/i, '');

  // 2. Si un bloc fermé de markdown est présent au milieu du texte
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    text = fence[1].trim();
  }

  // 3. Isoler le premier tableau ou objet JSON de la chaîne
  const firstArr = text.indexOf('[');
  const firstObj = text.indexOf('{');
  if (firstArr === -1 && firstObj === -1) {
    throw new Error('Aucun JSON détecté dans le contenu importé.');
  }

  const isArray = firstArr !== -1 && (firstObj === -1 || firstArr < firstObj);
  const start = isArray ? firstArr : firstObj;
  const closeChar = isArray ? ']' : '}';
  const lastClose = text.lastIndexOf(closeChar);

  let candidateRaw = (lastClose > start) ? text.slice(start, lastClose + 1) : text.slice(start);

  // 4. Échapper les caractères de contrôle non échappés à l'intérieur des chaînes JSON
  candidateRaw = escapeControlCharactersInStrings(candidateRaw);

  let parsed: any;
  try {
    parsed = JSON.parse(candidateRaw);
  } catch (e: any) {
    // Essai 1 : Réparer le JSON brut si tronqué
    try {
      parsed = JSON.parse(repairTruncatedJson(candidateRaw));
    } catch (e2) {
      // Essai 2 : Fallback avec safeParseJson
      try {
        parsed = safeParseJson(candidateRaw);
      } catch (e3: any) {
        throw new Error('JSON invalide : ' + (e?.message || e3?.message || 'erreur de parsing') + '.');
      }
    }
  }

  // 5. Déballer si le JSON est enveloppé dans un conteneur comme { evaluations: [...] } ou { results: [...] }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    if (Array.isArray(parsed.evaluations)) {
      parsed = parsed.evaluations;
    } else if (Array.isArray(parsed.results)) {
      parsed = parsed.results;
    } else if (Array.isArray(parsed.copies)) {
      parsed = parsed.copies;
    }
  }

  // 6. Normaliser vers un tableau de { fileId, evaluation, comparisonNotes }.
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  return arr.map((entry: any) => {
    const notes = typeof entry?.comparisonNotes === 'string'
      ? entry.comparisonNotes
      : (entry?.comparisonNotes ? JSON.stringify(entry.comparisonNotes, null, 2) : undefined);
    if (entry && entry.evaluation && entry.fileId !== undefined) {
      return { fileId: String(entry.fileId), evaluation: entry.evaluation, comparisonNotes: notes };
    }
    // Cas où l'IA a renvoyé directement l'évaluation (une seule copie ou objet nu).
    return { fileId: entry?.fileId !== undefined ? String(entry.fileId) : '', evaluation: entry, comparisonNotes: notes };
  });
}

/**
 * Vérifie qu'un objet ressemble à un rapport exploitable : criteriaScores
 * présent avec (au moins) les critères attendus, tous numériques.
 */
export function isValidEvaluation(obj: any, requiredKeys: string[]): boolean {
  if (!obj || typeof obj !== 'object') return false;
  const cs = obj.criteriaScores;
  if (!cs || typeof cs !== 'object') return false;
  return requiredKeys.every(k => cs[k] !== undefined && cs[k] !== null && !Number.isNaN(Number(cs[k])));
}

export interface FinalizeOptions {
  level: 'B1' | 'B2' | string;
  language: string;
  notationType: 'detailed' | 'delf';
  requiredKeys: string[];
  secondProviderLabel?: string;
  firstProviderLabel?: string;
}

/**
 * Finalise la double évaluation externe : valide le résultat renvoyé par l'IA
 * externe, le nettoie (hallucinations CJK / IPA parasite) puis applique la
 * MÊME fusion que la supervision interne.
 */
export function finalizeExternalSupervision(
  result1: CorrectionResult,
  result2Raw: any,
  opts: FinalizeOptions,
): CorrectionResult {
  if (!isValidEvaluation(result2Raw, opts.requiredKeys)) {
    throw new Error("Le rapport renvoyé est incomplet (criteriaScores manquants ou invalides pour ce niveau).");
  }
  const cleaned = sanitizeHallucinations(result2Raw as CorrectionResult, opts.language);
  const result2 = sanitizeScores(cleaned, opts.level, opts.notationType);
  const final = computeJuryResult(
    result1,
    result2,
    opts.secondProviderLabel || 'Examinateur 2 (externe)',
    opts.level,
    opts.notationType,
  );
  if (opts.firstProviderLabel && final._comparison) {
    final._comparison.firstProvider = opts.firstProviderLabel;
  }
  return final;
}

// ─── 3e évaluation (arbitre externe) ────────────────────────────────────────

/**
 * Construit le document Markdown pour la 3e évaluation (arbitre) — Production
 * Orale. L'IA externe reçoit la transcription annotée ET les DEUX évaluations
 * précédentes ; elle repère les fautes omises, compare les deux évaluations
 * critère par critère, et produit un rapport final consolidé (qui fait autorité).
 */
export function buildArbiterMarkdown(
  tasks: ExternalArbiterTask[],
  config: ExternalSupervisionConfig,
): string {
  const gridPrompt = buildEvalSystemPrompt(config.level, config.language, config.notationType);
  // Nettoyer la grille de notation des directives JSON obsolètes et conflictuelles de l'évaluateur 1
  const cleanGridPrompt = gridPrompt.split(/⚠️ DIRECTIVE DE FORMAT DE SORTIE JSON|Tu DOIS impérativement retourner un objet JSON/i)[0].trim();
  const criteria = CRITERIA_BY_LEVEL[config.level] || CRITERIA_BY_LEVEL.B2;
  const ids = tasks.map(t => JSON.stringify(t.fileId)).join(', ');

  const header = `# 3e évaluation (ARBITRE) — DELF ${config.level} Production Orale

Tu es un TROISIÈME examinateur ARBITRE d'une épreuve de PRODUCTION ORALE. Pour chacune des ${tasks.length} copie(s), tu reçois la transcription et DEUX évaluations indépendantes (examinateur 1 et examinateur 2). Ta mission :
1. Relis la transcription et repère les fautes de GRAMMAIRE et de LEXIQUE que les DEUX évaluations précédentes auraient omises ; ajoute-les au tableau d'erreurs (réservé exclusivement au linguistique). Concernant la phonologie : évalue et retiens uniquement les erreurs de prononciation FLAGRANTES qui rendent le mot inintelligible, et IGNORE toutes celles pour lesquelles il existe un doute quant à savoir si la prononciation est correcte ou non. Les bégaiements oraux et hésitations relèvent de la fluidité et sont strictement exclus d'errorsTable.
2. Analyse les DIVERGENCES entre les deux évaluations, critère par critère.
3. Produis un RAPPORT FINAL consolidé qui fait autorité, destiné à l'élève.

⚠️ RÈGLES CRITIQUES D'ARBITRAGE :
- 🌐 LANGUE DU RAPPORT OBLIGATOIRE :
${getLanguageInstruction(config.language)}
  Toutes les sections (justifications, advices, brouillons, et errorsTable.rule) doivent impérativement respecter cette langue.

- ⚠️ INTERDICTION ABSOLUE DE FABRICATION OU EMBELLISSEMENT DE PROPOS DANS transcriptionCorrigee :
  Ne tolère AUCUNE phrase complète inventée par un examinateur pour embellir ou masquer un effondrement en débat (ex: ne jamais transformer « je dois pas répondre » en « Je préfère ne pas répondre »). Si le propos est inachevé ou absent, conserve-le tel quel ou indique entre crochets « [énoncé inachevé, laissé tel quel] » ou « [aucune production] ».

- ⚠️ INTERDICTION DES RECONSTRUCTIONS SPÉCULATIVES SUR PASSAGES INAUDIBLES :
  Si une expression est inintelligible (ex: « après votre tête »), ne tolère AUCUNE reconstruction spéculative divergente (« au pied du sapin » vs « au pied du lit »). Le segment doit rester non reconstitué entre crochets : « [locution incompréhensible, non reconstituée : « ... »] ».

- ⚠️ RESPECT STRICT DE LA POLARITÉ ET SYNCHRONISATION errorsTable :
  Veille à la parfaite concordance de polarité (affirmative vs négative) entre errorsTable et transcriptionCorrigee (ex: « ils ne sont pas très bavards » dans les deux emplacements, jamais d'inversion en « ils sont très bavards »). Aucune suppression silencieuse d'énoncé.

- ⚠️ PURETÉ DU FRANÇAIS DANS transcriptionCorrigee :
  La transcription corrigée doit être à 100% en français (aucun mot d'une autre langue, comme le vietnamien « và »).

- ⚠️ NETTOYAGE DES ORIGINAUX DANS errorsTable :
  Assure-toi que les entrées 'original' ciblent l'erreur linguistique propre sans être polluées par des répétitions d'hésitation ou bégaiements oraux (ex: « ils ont besoin de temps » plutôt que « ils ont besoin ont besoin de de temps »).

- ⚠️ ARBITRAGE DE L'INTERACTION / DÉBAT :
  * Si le candidat ne répond sur le fond à AUCUNE question (uniquement des silences, questions en écho, ou abandons forçant l'examinateur à abréger) = 0/2 (C1) ou 0/5 (B2) OBLIGATOIRE, entraînant Lexique ≤ 1 et Morphosyntaxe ≤ 1.
  * Si le candidat réussit à formuler 1 à 3 réponses courtes et pertinentes sur le fond avant d'échouer, ne mets PAS 0 mais attribue une note partielle basse (0.2 à 0.5/2 en C1, 1/5 en B2).

- ⚠️ PLAFOND ANGLICISME :
  Le plafond de note sur Lexique (1/5 en B2 ou 1/4 en B1) ne s'applique qu'en cas de recours RÉCURRENT (≥ 2 occurrences distinctes en langue étrangère non intégrée). Un mot d'anglais isolé unique (ex: dire une seule fois « skipper ») ne déclenche pas ce plafond. Les termes usuels oraux en français comme « Ok », « cool », « bye » ne comptent pas comme du code-switching.

- ⚠️ AUCUNE MENTION DE NOTE DANS LES TEXTES OU BROUILLONS :
  Assure-toi qu'aucune formule de score (comme « Điểm đánh giá phù hợp : X », « Mức điểm : X », « Note : X/5 ») ne subsiste dans les justifications, advices ou brouillons de l'évaluation finale.

- ⚠️ VÉRIFICATION DES FORMES COMPLEXES :
  Le futur simple (ex: « je proposerai », « nous verrons ») n'est PAS un conditionnel ni une forme verbale complexe.

## Format de sortie STRICT
Réponds **uniquement** par un unique tableau JSON valide, sans texte autour :

\`\`\`json
[
  {
    "fileId": "<identifiant exact>",
    "evaluation": { ...rapport final complet... },
    "comparisonNotes": "commentaire critère par critère sur les écarts entre l'évaluation 1 et l'évaluation 2 (DESTINÉ AU CORRECTEUR, jamais à l'élève)"
  }
]
\`\`\`

- Un objet par copie, \`fileId\` recopié à l'identique (valeurs attendues : ${ids}).
- \`evaluation\` respecte EXACTEMENT le schéma : \`studentEmail\`, \`studentName\`, \`transcription\`, \`transcriptionCorrigee\`, \`brouillon_phase1_audit\`, \`brouillon_phase2_analyse\`, \`globalScore\`, \`criteriaScores\` (clés niveau ${config.level} : ${criteria.join(', ')}), \`justifications\`, \`advices\`, \`errorsTable\` (fautes linguistiques uniquement : original, correction, rule ; aucune transcription phonétique API/IPA dans errorsTable).
- Strictement AUCUN formatage markdown (**gras**, *italique*, etc.) ni lien hypertexte/URL dans les textes ou brouillons (pas de [texte](url), pas de https://...).
- Silence et purge des fausses erreurs : zéro polémique ou commentaire défensif réfutant un examinateur dans errorsTable ou justifications (si une pseudo-erreur a été relevée à tort, la supprimer silencieusement sans laisser de trace pour l'élève).
- \`comparisonNotes\` est réservé au correcteur : tu peux y mentionner « évaluation 1 / évaluation 2 » et leurs écarts. Le champ \`evaluation\` (destiné à l'élève) ne doit JAMAIS faire allusion à plusieurs correcteurs, à une évaluation précédente ou à un ajustement (rédige-le comme l'unique rapport final).
- En plus du JSON, présente aussi \`comparisonNotes\` en clair dans le chat, à titre d'information.

## Grille et règles de notation (rappel)
${cleanGridPrompt}
`;

  const blocks = tasks.map((task, i) => {
    const cleanFirst = cleanEvalForPrompt(task.firstEval);
    const cleanSecond = cleanEvalForPrompt(task.secondEval);
    const firstProv = (task.firstEval as any)?.modelUsed ? getFriendlyModelName((task.firstEval as any).modelUsed) : (task.firstProvider || 'Examinateur 1');
    const secondProv = (task.secondEval as any)?.modelUsed ? getFriendlyModelName((task.secondEval as any).modelUsed) : (task.secondProvider || 'Examinateur 2');
    return `---

## Copie ${i + 1} — fileId : \`${task.fileId}\`
Sujet : "${task.subject}"
Transcription du candidat : "
${task.transcription}
"

=== ÉVALUATION DE L'EXAMINATEUR 1 (${firstProv}) ===
${JSON.stringify(cleanFirst, null, 2)}

=== ÉVALUATION DE L'EXAMINATEUR 2 (${secondProv}) ===
${JSON.stringify(cleanSecond, null, 2)}`;
  });

  const langName = config.language === 'VN' ? 'Vietnamien (tiếng Việt có dấu)'
    : config.language === 'TW' ? 'Chinois traditionnel (繁體中文)'
    : config.language === 'EN' ? 'Anglais (English)'
    : config.language === 'CZ' ? 'Tchèque (čeština)'
    : 'Français';

  const politeInstruction = config.language === 'FR'
    ? "Les champs justifications et advices utilisent-ils systématiquement le vouvoiement (« vous ») ?"
    : config.language === 'VN'
    ? "Les champs justifications et advices s'adressent-ils avec respect et bienveillance à l'apprenant (ex: « bạn », « em ») sans employer de termes français ?"
    : "Les champs justifications et advices s'adressent-ils directement et respectueusement à l'apprenant dans la langue cible ?";

  const loopSection = `
---

## 🔁 Phase 2 — Auto-vérification obligatoire (Loop Engineering)

Avant de produire le tableau JSON final, relis chacune de tes évaluations d'arbitrage et vérifie les points suivants pour **chaque copie** :

1. **LANGUE OBLIGATOIRE** : Le rapport final d'arbitrage est-il rédigé STRICTEMENT en ${langName} ? ${config.language !== 'FR' ? `⚠️ RAPPEL CRITIQUE : Même si les évaluations de l'examinateur 1 et de l'examinateur 2 sont rédigées en français, ton rapport final (justifications, advices, brouillons, comparisonNotes, et errorsTable.rule) DOIT OBLIGATOIREMENT ÊTRE TRADUIT ET CONSOLIDÉ EN ${langName}. Il est STRICTEMENT INTERDIT de renvoyer du texte en français pour ces champs.` : ''}
2. **AUCUNE ALLUSION AUX COULISSES DANS \`evaluation\`** : Le champ \`evaluation\` est-il rédigé comme l'unique rapport officiel pour l'élève (aucune mention de « l'examinateur 1 », « l'examinateur 2 », « arbitre », ou d'ajustement de note) ? Ces explications vont EXCLUSIVEMENT dans \`comparisonNotes\`.
3. **AUCUNE MENTION DE NOTE CHIFFRÉE DANS LE TEXTE** : Les justifications, conseils et brouillons sont-ils exempts de toute note chiffrée ou fraction (comme « Điểm đánh giá phù hợp : X », « Mức điểm : X », « Note : X/5 » ; les notes vont UNIQUEMENT dans criteriaScores) ?
4. **FIDÉLITÉ DE transcriptionCorrigee (ZÉRO SPÉCULATION NI EMBELLISSEMENT)** : Les tournures inintelligibles sont-elles laissées entre crochets [locution incompréhensible, non reconstituée : « ... »] sans tenter de deviner ? Les propos d'un candidat en difficulté ont-ils été maintenus sans lissage ? La polarité négative/affirmative est-elle strictement identique à errorsTable ?
5. **PURETÉ DU FRANÇAIS DANS transcriptionCorrigee** : Le texte corrigé est-il 100% en français sans mot étranger parasite (ex: mot vietnamien « và » au lieu de « et ») ?
6. **FORMULE D'ADRESSE RESPECTUEUSE** : ${politeInstruction}
7. **EXHAUSTIVITÉ & QUALITÉ DU TABLEAU D'ERREURS** : Toutes les erreurs de langue sont-elles bien dans errorsTable avec les règles rédigées en ${langName} ? Aucune transcription API/IPA dans errorsTable.
8. **AUCUN FORMATAGE MARKDOWN NI LIEN HYPERTEXTE** : Vérifie qu'aucun lien markdown [texte](url), aucune URL web et aucune balise de mise en forme (**gras**, *italique*, etc.) ne subsiste dans les justifications, conseils, brouillons ou règles.
9. **ZÉRO POLÉMIQUE NI MÉTA-DISCOURS DANS errorsTable** : Vérifie qu'aucune entrée d'errorsTable ne débat ou ne justifie pourquoi une tournure n'est pas une faute. Supprime silencieusement toute entrée défensive (« Ce n'est pas une faute », etc.).
10. **ACCORDS ÉLÉMENTAIRES ET DU LOCUTEUR** : Vérifie que les accords de base et l'accord de genre lorsque le locuteur s'identifie clairement ne sont pas passés inaperçus.
11. **ÉLÉGANCE ET VARIÉTÉ DES CORRECTIONS** : Vérifie que les corrections sont naturelles et évitent les répétitions maladroites dans des phrases successives.

Si tu détectes une lacune, corrige ton JSON avant de l'envoyer.
Renvoie uniquement le tableau JSON final corrigé — aucun texte avant ou après.`;

  return [header, ...blocks, loopSection].join('\n\n');
}

export interface FinalizeArbiterOptions {
  level: 'B1' | 'B2' | string;
  language: string;
  notationType: 'detailed' | 'delf';
  requiredKeys: string[];
}

/**
 * Finalise la 3e évaluation (oral) : validation, nettoyage (hallucinations +
 * aucune allusion aux coulisses dans le rapport élève), arrondi DELF, puis pose
 * comme rapport FINAL faisant autorité. Conserve les 3 évaluations dans
 * `_comparison` et le commentaire de comparaison dans `_arbiterNotes`.
 */
export function finalizeArbiter(
  task: ExternalArbiterTask,
  arbiterRaw: any,
  comparisonNotes: string | undefined,
  opts: FinalizeArbiterOptions,
): CorrectionResult {
  if (!isValidEvaluation(arbiterRaw, opts.requiredKeys)) {
    throw new Error("Le rapport de la 3e évaluation est incomplet (criteriaScores manquants ou invalides pour ce niveau).");
  }
  const cleaned = sanitizeHallucinations(arbiterRaw as CorrectionResult, opts.language);
  const arbiter = sanitizeScores(cleaned, opts.level, opts.notationType);

  // Rapport destiné à l'élève : on retire toute allusion aux coulisses et toute note chiffrée des textes.
  if (arbiter.brouillon_phase1_audit) arbiter.brouillon_phase1_audit = cleanJuryComment(arbiter.brouillon_phase1_audit);
  if (arbiter.brouillon_phase2_analyse) arbiter.brouillon_phase2_analyse = cleanJuryComment(arbiter.brouillon_phase2_analyse);
  if (arbiter.justifications) {
    for (const k of Object.keys(arbiter.justifications)) {
      if (typeof (arbiter.justifications as any)[k] === 'string') {
        (arbiter.justifications as any)[k] = cleanJuryComment((arbiter.justifications as any)[k]);
      }
    }
  }
  if (arbiter.advices) {
    for (const k of Object.keys(arbiter.advices)) {
      if (typeof (arbiter.advices as any)[k] === 'string') {
        (arbiter.advices as any)[k] = cleanJuryComment((arbiter.advices as any)[k]);
      }
    }
  }

  const finalResult: CorrectionResult = {
    ...arbiter,
    subject: task.subject || task.firstEval?.subject || task.secondEval?.subject || (arbiter as any)?.subject,
    studentName: task.firstEval?.studentName || task.secondEval?.studentName || arbiter.studentName || null,
    studentEmail: task.firstEval?.studentEmail || task.secondEval?.studentEmail || arbiter.studentEmail || null,
    candidateNumber: (task.firstEval as any)?.candidateNumber || (task.secondEval as any)?.candidateNumber || (arbiter as any)?.candidateNumber || null,
    classId: (task.firstEval as any)?.classId || (task.secondEval as any)?.classId || (arbiter as any)?.classId || null,
    studentId: (task.firstEval as any)?.studentId || (task.secondEval as any)?.studentId || (arbiter as any)?.studentId || null,
    file: (task.firstEval as any)?.file || (task.secondEval as any)?.file || (arbiter as any)?.file,
    transcription: task.firstEval.transcription || arbiter.transcription,
    transcriptionCorrigee: arbiter.transcriptionCorrigee || task.firstEval.transcriptionCorrigee,
    _comparison: {
      firstEval: task.firstEval,
      secondEval: task.secondEval,
      thirdEval: arbiter,
      firstProvider: task.firstProvider || 'Examinateur 1',
      secondProvider: task.secondProvider || 'Examinateur 2',
      thirdProvider: 'Arbitre externe',
    } as any,
  };
  (finalResult as any)._arbiterNotes = comparisonNotes || '';
  return finalResult;
}

// ─── Évaluation initiale externe ───────────────────────────────────────────

export interface ExternalInitialTask {
  fileId: string;
  subject: string;
  transcription: string;
}

export function buildExternalInitialMarkdown(
  tasks: ExternalInitialTask[],
  config: ExternalSupervisionConfig,
): string {
  const gridPrompt = buildEvalSystemPrompt(config.level, config.language, config.notationType);
  const ids = tasks.map(t => JSON.stringify(t.fileId)).join(', ');
  const criteria = CRITERIA_BY_LEVEL[config.level] || CRITERIA_BY_LEVEL.B2;

  const langLabel = config.language === 'VN' ? 'Vietnamien (tiếng Việt)' : config.language === 'FR' ? 'Français' : config.language;
  const header = `# Évaluation initiale externe DELF ${config.level} Production Orale

Tu joues le rôle de l'EXAMINATEUR INITIAL d'une épreuve de PRODUCTION ORALE. Tu dois évaluer **chacune des ${tasks.length} copie(s)** listée(s) plus bas en appliquant la GRILLE ET RÈGLES DE NOTATION (section suivante).

⚠️ LANGUE OBLIGATOIRE DU RAPPORT : ${langLabel}
Tu DOIS impérativement rédiger l'ensemble des justifications, conseils, règles d'erreurs (errorsTable.rule) et brouillons en ${langLabel}. Seules la transcription corrigée ('transcriptionCorrigee') et les citations directes de l'élève restent en français. Il est STRICTEMENT INTERDIT de rédiger les commentaires en français si la langue demandée est le vietnamien.

## Format de sortie STRICT
Réponds **uniquement** par un unique tableau JSON valide, sans texte autour :

\`\`\`json
[
  { "fileId": "<identifiant exact>", "evaluation": { ... } }
]
\`\`\`

- Un objet par copie, avec le \`fileId\` recopié à l'identique (valeurs attendues : ${ids}).
- Le champ \`evaluation\` doit respecter le schéma JSON : \`studentEmail\`, \`studentName\`, \`transcription\`, \`transcriptionCorrigee\`, \`brouillon_phase1_audit\`, \`brouillon_phase2_analyse\`, \`globalScore\`, \`criteriaScores\` { ${criteria.join(', ')} }, \`justifications\` { ${criteria.join(', ')} }, \`advices\` { ${criteria.join(', ')} }, \`errorsTable\` [ { original, correction, rule } ].

## Grille et règles de notation
${gridPrompt}
`;

  const blocks = tasks.map((task, i) => {
    const userPrompt = buildEvalUserPrompt(task.subject, task.transcription, config.language);
    return `---

## Copie ${i + 1} — fileId : \`${task.fileId}\`
${userPrompt}`;
  });

  const loopSection = `

---

## 🔁 Phase 2 — Auto-vérification obligatoire (Loop Engineering)

Avant de produire le tableau JSON final, relis chacune de tes évaluations et vérifie les points suivants pour **chaque copie** :

1. **LANGUE OBLIGATOIRE** : Le rapport est-il rédigé STRICTEMENT dans la langue demandée (${config.language === 'VN' ? 'Vietnamien' : config.language === 'FR' ? 'Français' : config.language}) avec tous les accents et signes diacritiques ? Il est STRICTEMENT INTERDIT de rédiger en français si la langue demandée est le vietnamien.
2. **AUCUNE MENTION DE NOTE CHIFFRÉE DANS LE TEXTE** : Les justifications, conseils et brouillons sont-ils exempts de toute note chiffrée ou fraction (comme « Điểm đánh giá phù hợp : X », « Mức điểm : X », « Note : X/5 » ; les notes vont UNIQUEMENT dans criteriaScores) ?
3. **FIDÉLITÉ DE transcriptionCorrigee (ZÉRO SPÉCULATION NI EMBELLISSEMENT)** : Les tournures inintelligibles sont-elles laissées entre crochets [locution incompréhensible, non reconstituée : « ... »] sans tenter de deviner ? Les propos d'un candidat en difficulté ont-ils été maintenus sans lissage ? La polarité négative/affirmative est-elle strictement identique à errorsTable ?
4. **PURETÉ DU FRANÇAIS DANS transcriptionCorrigee** : Le texte corrigé est-il 100% en français sans mot vietnamien parasite (ex: « và » au lieu de « et ») ?
5. **COMPLÉTUDE & COHÉRENCE** : Chaque critère dispose-t-il d'une justification étayée (avec 1 à 2 citations) et de conseils concrets en au moins 2 phrases ?
6. **VOUVOIEMENT** : L'élève est-il systématiquement vouvoyé (« vous ») ?
7. **EXHAUSTIVITÉ DU TABLEAU D'ERREURS** : Toutes les erreurs de langue (omissions de que, registres familiers « les trucs », faux sujets, infinitifs après quand) sont-elles bien dans errorsTable ?

Si tu détectes une lacune, corrige ton JSON avant de l'envoyer.
Renvoie uniquement le tableau JSON final corrigé — aucun texte avant ou après.`;

  return [header, ...blocks, loopSection].join('\n\n');
}

export function finalizeExternalInitial(
  rawEval: any,
  opts: FinalizeOptions,
  transcription: string
): CorrectionResult {
  if (!isValidEvaluation(rawEval, opts.requiredKeys)) {
    throw new Error("Le rapport d'évaluation est incomplet (criteriaScores manquants ou invalides).");
  }
  const cleaned = sanitizeHallucinations(rawEval as CorrectionResult, opts.language);
  const result = sanitizeScores(cleaned, opts.level, opts.notationType);
  result.transcription = transcription || result.transcription || '';
  return result;
}
