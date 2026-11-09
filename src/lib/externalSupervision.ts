/**
 * Double évaluation "externe" (optionnelle) : au lieu d'appeler une API de
 * supervision depuis le serveur, on exporte un paquet de consignes que
 * l'utilisateur soumet à une IA externe (ex. Claude sur claude.ai), puis on
 * réimporte le JSON produit et on finalise EXACTEMENT comme la double
 * évaluation interne (mêmes prompts, même fusion `computeJuryResult`).
 *
 * Ce module est volontairement sans dépendance réseau : il ne fait que
 * construire des chaînes de caractères et fusionner des objets.
 */
import { countWords, type CorrectionResult } from './geminiService';
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
  getCriteriaKeys,
} from './promptUtils';
import { parseMultiplePEMarkdowns } from './markdownGenerator';
import { getFriendlyModelName } from './modelNames';

export const CRITERIA = ['realisation', 'coherence', 'sociolinguistique', 'lexique', 'morphosyntaxe'] as const;

export interface ExternalSupervisionTask {
  /** Identifiant unique de la copie (nom de fichier en lot, ou "single"). */
  fileId: string;
  subject: string;
  transcription: string;
  /** Résultat de la 1re évaluation (examinateur initial). */
  result1: CorrectionResult;
}

export interface ExternalSupervisionConfig {
  level: string;
  language: string;
  gradingMode: 'detailed' | 'delf';
  nativeLanguage?: string;
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

/**
 * Construit le document Markdown unique à copier-coller dans une IA externe
 * (ex. Claude sur claude.ai) pour réaliser la double évaluation de N copies.
 */
export function buildExternalSupervisionMarkdown(
  tasks: ExternalSupervisionTask[],
  config: ExternalSupervisionConfig,
): string {
  const systemPrompt = buildSupervisorPrompt(config.level, config.language, config.gradingMode, config.nativeLanguage);
  // Nettoyer le prompt des directives JSON obsolètes de premier niveau pour éviter les contradictions de format
  const cleanSystemPrompt = systemPrompt.split("IMPORTANT: Retourne un objet JSON")[0].trim();

  const ids = tasks.map(t => JSON.stringify(t.fileId)).join(', ');
  const examTitle = `DELF ${config.level}`;
  const criteriaKeys = getCriteriaKeys(config.level).join(', ');

  const header = `# Double évaluation externe ${examTitle}
 
Tu joues le rôle de la DOUBLE ÉVALUATION (examinateur superviseur). Tu dois traiter **chacune des ${tasks.length} copie(s)** listée(s) plus bas en appliquant les CONSIGNES DU SUPERVISEUR (section suivante).
 
## Format de sortie STRICT (à respecter impérativement)
Réponds **uniquement** par un unique tableau JSON valide, sans aucun texte avant ou après, de la forme :
 
\`\`\`json
[
  { "fileId": "<identifiant exact de la copie>", "evaluation": { ... } }
]
\`\`\`
 
- Il doit y avoir un objet par copie, avec le \`fileId\` recopié **à l'identique** (valeurs attendues : ${ids}).
- Le champ \`evaluation\` doit respecter EXACTEMENT le schéma JSON du rapport (les mêmes clés que le rapport du 1er examinateur fourni pour chaque copie : \`studentEmail\`, \`studentName\`, \`transcription\`, \`brouillon_phase1_audit\`, \`brouillon_phase2_analyse\`, \`globalScore\`, \`criteriaScores\` {${criteriaKeys}}, \`justifications\`, \`advices\`, \`errorsTable\`).
- Ce sont TES propres notes et appréciations de superviseur qui font autorité et qui seront retenues dans le bilan final officiel. L'application conserve la 1re évaluation pour la comparaison.
- 🚫 RAPPORT AUTONOME & ZÉRO MÉTA-DISCOURS POLÉMIQUE : Le rapport s'adresse à l'élève. Il est STRICTEMENT INTERDIT d'insérer des phrases ou des règles dans \`errorsTable\` réfutant le 1er examinateur (ex: ne jamais écrire « L'absence de virgule ne constitue pas une faute »). Si une fausse erreur avait été relevée par le 1er correcteur, retire-la simplement sans commentaire.
- 🚫 ZÉRO LIEN OU URL MARKDOWN : Aucun lien hypertexte \`[texte](url)\` ni adresse web dans aucun champ (brouillons, justifications, advices, règles). Tout doit être en texte brut imprimable.

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
3. **ERREURS OMISES & ACCORD SIGNATURE** : Y a-t-il des erreurs grammaticales flagrantes dans la transcription absentes de \`errorsTable\` (y compris l'accord lié à la signature, ex: « Étant déléguée » si signataire féminine) ?
4. **BIAIS CENTRAL & NAÏVETÉ VS REGISTRE** : As-tu évité les notes moyennes par défaut ? As-tu bien distingué la naïveté d'un argument (qui relève de la Réalisation) du registre sociolinguistique (qui évalue la politesse et le vouvoiement) ?
5. **VOUVOIEMENT** : Les champs \`justifications\` et \`advices\` utilisent-ils uniquement le vouvoiement (« vous ») ?
6. **LANGUE** : Tous les accents et signes diacritiques requis sont-ils présents dans les champs textuels ? Si la langue demandée est différente du français, vérifie qu'aucun commentaire n'est resté rédigé en français.
7. **ZÉRO CORRECTION SILENCIEUSE** : Toute modification apportée au texte de l'élève est-elle rigoureusement consignée dans \`errorsTable\`, et chaque entrée de \`errorsTable\` est-elle reflétée dans la correction ?
8. **ZÉRO NOTE DANS LES TEXTES OU BROUILLONS** : Aucune mention chiffrée, fraction ou formule de score dans justifications, advices, ou brouillons (pas de « 3/5 », « Note : X », « Điểm đánh giá phù hợp : X », « Score: X », etc.).
9. **PARITÉ JUSTIFICATIONS / TABLEAU D'ERREURS** : Toute faute reprochée dans les justifications doit obligatoirement figurer dans \`errorsTable\`, et chaque entrée de \`errorsTable\` doit avoir une correction différente de l'original (original !== correction).
10. **ZÉRO MÉTA-DISCOURS POLÉMIQUE** : \`errorsTable\` ne contient AUCUNE règle qui répond au 1er correcteur (pas de « L'absence de virgule ne constitue pas une faute », « Ce verbe n'est pas incorrect », etc.). Le tableau ne contient que des vraies erreurs de l'élève.
11. **ZÉRO LIEN OU URL MARKDOWN** : Aucun lien Markdown \`[texte](url)\` ni adresse internet dans aucun champ (notamment dans \`brouillon_phase2_analyse\`).
12. **ÉLÉGANCE ET NON-RÉPÉTITION** : Les corrections successives évitent-elles de répéter mot à mot la même tournure verbale et respectent-elles la concordance des temps ?

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
    const mdParsed = parseMultiplePEMarkdowns(raw);
    if (mdParsed && mdParsed.length > 0) {
      return mdParsed.map((entry: any) => ({
        fileId: entry.file || (entry.studentName ? entry.studentName : ''),
        evaluation: entry,
        comparisonNotes: entry._arbiterNotes
      }));
    }
    throw new Error('Aucun JSON ni format Markdown valide détecté dans le contenu importé.');
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
 * Vérifie qu'un objet ressemble bien à un rapport d'évaluation exploitable.
 */
export function isValidEvaluation(obj: any, requiredKeys?: string[], level?: string): boolean {
  if (!obj || typeof obj !== 'object') return false;
  const cs = obj.criteriaScores;
  if (!cs || typeof cs !== 'object') return false;
  const keys = requiredKeys || [...getCriteriaKeys(level)];
  return keys.every((k: string) => cs[k] !== undefined && cs[k] !== null && !Number.isNaN(Number(cs[k])));
}

/**
 * Finalise la double évaluation externe : valide le résultat renvoyé par l'IA
 * externe puis applique la MÊME fusion que la supervision interne.
 */
export function finalizeExternalSupervision(
  result1: CorrectionResult,
  result2Raw: any,
  gradingMode: 'detailed' | 'delf',
  secondProviderLabel = 'IA externe',
  firstProviderLabel?: string,
  level?: string,
): CorrectionResult {
  if (!isValidEvaluation(result2Raw, undefined, level)) {
    throw new Error("Le rapport renvoyé est incomplet (criteriaScores manquants ou invalides).");
  }
  const cleaned = sanitizeHallucinations(result2Raw as CorrectionResult);
  const result2 = sanitizeScores(cleaned, gradingMode, level);
  const final = computeJuryResult(result1, result2, secondProviderLabel, gradingMode, level);
  if (firstProviderLabel && final._comparison) {
    final._comparison.firstProvider = firstProviderLabel;
  }
  return final;
}

// ─── 3e évaluation (arbitre externe) ────────────────────────────────────────

/**
 * Construit le document Markdown pour la 3e évaluation (arbitre). L'IA externe
 * reçoit le texte de l'élève ET les DEUX évaluations précédentes ; elle doit
 * repérer les fautes omises, comparer les deux évaluations critère par critère,
 * et produire un rapport final consolidé (qui fait autorité).
 */
export function buildArbiterMarkdown(
  tasks: ExternalArbiterTask[],
  config: ExternalSupervisionConfig,
): string {
  const gridPrompt = buildEvalSystemPrompt(config.level, config.language, config.gradingMode, config.nativeLanguage);
  // Nettoyer la grille de notation des directives JSON obsolètes et conflictuelles de l'évaluateur 1
  const cleanGridPrompt = gridPrompt.split(/⚠️ DIRECTIVE DE FORMAT DE SORTIE JSON|Tu DOIS impérativement retourner un objet JSON/i)[0].trim();
  const ids = tasks.map(t => JSON.stringify(t.fileId)).join(', ');
  const examTitle = `du DELF ${config.level}`;
  const criteriaKeys = getCriteriaKeys(config.level).join(', ');

  const header = `# 3e évaluation (ARBITRE) — ${examTitle} Production Écrite

Tu es un TROISIÈME examinateur ARBITRE. Pour chacune des ${tasks.length} copie(s), tu reçois le texte de l'élève et DEUX évaluations indépendantes (examinateur 1 et examinateur 2). Ta mission :
1. Relis attentivement le texte de l'élève et repère les fautes d'ORTHOGRAPHE et de GRAMMAIRE que les DEUX évaluations précédentes auraient omises ; ajoute-les au tableau d'erreurs final.
2. Analyse les DIVERGENCES entre les deux évaluations, critère par critère.
3. Produis un RAPPORT FINAL consolidé qui fait autorité (notes, justifications, conseils, tableau d'erreurs complété), destiné à l'élève.

⚠️ RÈGLES CRITIQUES D'ARBITRAGE :
1. TABLEAU DES ERREURS (errorsTable) : L'examinateur 2 a fourni un tableau d'erreurs consolidé. En tant qu'arbitre, tu dois dédoublonner, rectifier les inexactitudes et ajouter impérativement les erreurs omises par les deux évaluateurs. Veille à la parité absolue : toute faute critiquée dans les justifications doit figurer dans errorsTable, et chaque entrée doit avoir une correction différente de l'original (original !== correction).
2. AUCUNE MENTION DE NOTE DANS LES TEXTES OU BROUILLONS : Ne mentionne jamais de note ou fraction dans justifications, advices, brouillon_phase1_audit ou brouillon_phase2_analyse (ex: ni « 3/5 », ni « Note : 3 », ni « Điểm đánh giá phù hợp : X », ni « Score: X »). Les notes doivent figurer UNIQUEMENT dans 'criteriaScores' et 'globalScore'.
3. CONFORMITÉ LINGUISTIQUE : L'ensemble des champs (justifications, advices, brouillons, errorsTable.rule) doivent être rédigés dans la langue demandée (${config.language}). Seuls 'original' et 'correction' dans errorsTable restent en français.
4. MOTS ÉTRANGERS / ANGLICISMES : Le plafonnement au score plancher ne s'applique que s'il y a un recours RÉCURRENT (≥ 2 occurrences distinctes) à une langue étrangère par blocage. Les anglicismes d'usage ou lexicalisés (ex: « Ok », « cool », « challenge ») ne déclenchent pas ce plafonnement.
5. 🚫 ZÉRO MÉTA-DISCOURS POLÉMIQUE DANS errorsTable OU JUSTIFICATIONS : errorsTable ne contient QUE les véritables erreurs de l'élève. Il est STRICTEMENT INTERDIT d'insérer des phrases réfutant les évaluateurs précédents (ex: ne jamais écrire « L'absence de virgule ne constitue pas une faute », « Ce verbe n'est pas incorrect », etc.).
6. 🚫 ZÉRO FORMATAGE MARKDOWN NI LIEN/URL : Rédige tout en texte brut imprimable, sans astérisques et sans aucun lien Markdown [texte](url) ni adresse URL web (notamment dans brouillon_phase2_analyse).
7. ⚠️ ACCORD AVEC LE GENRE DE LA SIGNATURE : Vérifie l'accord de genre lié à la signature (ex: « Étant déléguée » et non « Étant délégué » pour une signataire nommée Aline Dupont).
8. ⚠️ ÉLÉGANCE ET NON-RÉPÉTITION : Soigner les corrections pour qu'elles soient naturelles, sans répétitions mot à mot d'une phrase à l'autre, et avec la juste concordance des temps.

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
- \`evaluation\` respecte EXACTEMENT le schéma : \`studentEmail\`, \`studentName\`, \`transcription\`, \`brouillon_phase1_audit\`, \`brouillon_phase2_analyse\`, \`globalScore\`, \`criteriaScores\` {${criteriaKeys}}, \`justifications\`, \`advices\`, \`errorsTable\`.
- \`comparisonNotes\` est réservé au correcteur : tu peux y mentionner « évaluation 1 / évaluation 2 » et leurs écarts. En revanche le champ \`evaluation\` (destiné à l'élève) ne doit JAMAIS faire allusion à l'existence de plusieurs correcteurs, d'une évaluation précédente ou d'un ajustement (rédige-le comme l'unique rapport final).
- En plus du JSON, présente aussi \`comparisonNotes\` en clair dans le chat, à titre d'information.

## Grille et règles de notation (rappel)
${cleanGridPrompt}
`;

  const blocks = tasks.map((task, i) => {
    const wordCount = countWords(task.transcription);
    const cleanFirst = cleanEvalForPrompt(task.firstEval);
    const cleanSecond = cleanEvalForPrompt(task.secondEval);
    const firstProv = (task.firstEval as any)?.modelUsed ? getFriendlyModelName((task.firstEval as any).modelUsed) : (task.firstProvider || 'Examinateur 1');
    const secondProv = (task.secondEval as any)?.modelUsed ? getFriendlyModelName((task.secondEval as any).modelUsed) : (task.secondProvider || 'Examinateur 2');
    return `---

## Copie ${i + 1} — fileId : \`${task.fileId}\`
Sujet : "${task.subject}"
Texte de l'élève : "
${task.transcription}
"

[INFO] Nombre de mots réel (calculé par le système) : ${wordCount} mots.

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
4. **FORMULE D'ADRESSE RESPECTUEUSE** : ${politeInstruction}
5. **EXHAUSTIVITÉ & QUALITÉ DU TABLEAU D'ERREURS** : Toutes les erreurs de langue sont-elles bien dans errorsTable avec les règles rédigées en ${langName} ? Chaque erreur a-t-elle 'original !== correction' ?
6. **ZÉRO MÉTA-DISCOURS POLÉMIQUE** : \`errorsTable\` ne contient AUCUNE règle réfutant les évaluateurs précédents (ex: pas de « L'absence de virgule ne constitue pas une faute », etc.).
7. **ZÉRO LIEN OU URL MARKDOWN** : Aucun lien Markdown \`[texte](url)\` ni adresse web dans aucun champ (notamment dans \`brouillon_phase2_analyse\`).
8. **ACCORD DU SCRIPTEUR / SIGNATAIRE** : L'accord de genre lié à la signature ou identité de l'élève (ex: « Étant déléguée » si femme) a-t-il été vérifié ?

Si tu détectes une lacune, corrige ton JSON avant de l'envoyer.
Renvoie uniquement le tableau JSON final corrigé — aucun texte avant ou après.`;

  return [header, ...blocks, loopSection].join('\n\n');
}

export interface FinalizeArbiterOptions {
  level: string;
  language: string;
  notationType: 'detailed' | 'delf';
  requiredKeys: string[];
}

/**
 * Finalise la 3e évaluation : la valide, la nettoie (aucune allusion aux
 * coulisses dans le rapport élève), applique l'arrondi DELF, et la pose comme
 * rapport FINAL faisant autorité. Conserve les 3 évaluations dans `_comparison`
 * et attache le commentaire de comparaison dans `_arbiterNotes` (correcteur only).
 */
export function finalizeArbiter(
  task: ExternalArbiterTask,
  arbiterRaw: any,
  comparisonNotes: string | undefined,
  opts: FinalizeArbiterOptions,
): CorrectionResult {
  if (!isValidEvaluation(arbiterRaw, opts.requiredKeys, opts.level)) {
    throw new Error("Le rapport de la 3e évaluation est incomplet (criteriaScores manquants ou invalides).");
  }
  const cleaned = sanitizeHallucinations(arbiterRaw as CorrectionResult, opts.language);
  const arbiter = sanitizeScores(cleaned, opts.notationType, opts.level);

  // Le rapport final est destiné à l'élève : on retire toute allusion aux coulisses.
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
  if (arbiter.brouillon_phase1_audit && typeof arbiter.brouillon_phase1_audit === 'string') {
    arbiter.brouillon_phase1_audit = cleanJuryComment(arbiter.brouillon_phase1_audit);
  }
  if (arbiter.brouillon_phase2_analyse && typeof arbiter.brouillon_phase2_analyse === 'string') {
    arbiter.brouillon_phase2_analyse = cleanJuryComment(arbiter.brouillon_phase2_analyse);
  }

  const finalResult: CorrectionResult = {
    ...arbiter,
    studentName: arbiter.studentName || task.firstEval?.studentName || task.secondEval?.studentName || null,
    studentEmail: arbiter.studentEmail || task.firstEval?.studentEmail || task.secondEval?.studentEmail || null,
    candidateNumber: (task.firstEval as any)?.candidateNumber || (task.secondEval as any)?.candidateNumber || (arbiter as any)?.candidateNumber || null,
    classId: (task.firstEval as any)?.classId || (task.secondEval as any)?.classId || (arbiter as any)?.classId || null,
    className: (task.firstEval as any)?.className || (task.secondEval as any)?.className || (arbiter as any)?.className || null,
    studentId: (task.firstEval as any)?.studentId || (task.secondEval as any)?.studentId || (arbiter as any)?.studentId || null,
    file: (task.firstEval as any)?.file || (task.secondEval as any)?.file || (arbiter as any)?.file || undefined,
    subject: task.subject || task.firstEval?.subject || task.secondEval?.subject || (arbiter as any)?.subject,
    transcription: task.firstEval.transcription || task.transcription || arbiter.transcription,
    _comparison: {
      firstEval: task.firstEval,
      secondEval: task.secondEval,
      thirdEval: arbiter,
      firstProvider: task.firstProvider || 'Examinateur 1',
      secondProvider: task.secondProvider || 'Examinateur 2',
      thirdProvider: 'IA externe (arbitre)',
    } as any,
  };
  // Commentaire de comparaison réservé au correcteur (jamais dans le PDF élève).
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
  const gridPrompt = buildEvalSystemPrompt(config.level, config.language, config.gradingMode, config.nativeLanguage);
  const ids = tasks.map(t => JSON.stringify(t.fileId)).join(', ');
  const examTitle = `DELF ${config.level}`;
  const criteriaKeys = getCriteriaKeys(config.level).join(', ');

  const langInstruction = config.language === 'VN'
    ? '⚠️ LANGUE DU RAPPORT : VIETNAMIEN (tiếng Việt có dấu). TOUTES les sections textuelles (justifications, advices, brouillons, errorsTable.rule) doivent être en vietnamien. Il est STRICTEMENT INTERDIT de rédiger en français.'
    : config.language === 'TW'
    ? '⚠️ LANGUE DU RAPPORT : CHINOIS TRADITIONNEL (繁體中文). Toutes les sections doivent être rédigées en chinois traditionnel.'
    : config.language === 'EN'
    ? '⚠️ LANGUE DU RAPPORT : ANGLAIS (English). All text sections must be written in English.'
    : config.language === 'CZ'
    ? '⚠️ LANGUE DU RAPPORT : TCHÈQUE (čeština). Všechny textové části musí být v češtině.'
    : '⚠️ LANGUE DU RAPPORT : FRANÇAIS (avec tous les accents).';

  const header = `# Évaluation initiale externe ${examTitle}
${langInstruction}

 
Tu joues le rôle de l'EXAMINATEUR INITIAL. Tu dois évaluer **chacune des ${tasks.length} copie(s)** listée(s) plus bas en appliquant la GRILLE ET RÈGLES DE NOTATION (section suivante).
 
## Format de sortie STRICT
Réponds **uniquement** par un unique tableau JSON valide, sans texte autour :
 
\`\`\`json
[
  { "fileId": "<identifiant exact>", "evaluation": { ... } }
]
\`\`\`
 
- Un objet par copie, avec le \`fileId\` recopié à l'identique (valeurs attendues : ${ids}).
- Le champ \`evaluation\` doit respecter le schéma JSON : \`studentEmail\`, \`studentName\`, \`transcription\`, \`brouillon_phase1_audit\`, \`brouillon_phase2_analyse\`, \`globalScore\`, \`criteriaScores\` {${criteriaKeys}}, \`justifications\` {${criteriaKeys}}, \`advices\` {${criteriaKeys}}, \`errorsTable\` [ { original, correction, rule } ].
 
## Grille et règles de notation
${gridPrompt}
`;

  const blocks = tasks.map((task, i) => {
    const userPrompt = buildEvalUserPrompt(task.subject, task.transcription, config.language);
    return `---
 
## Copie ${i + 1} — fileId : \`${task.fileId}\`
${userPrompt}`;
  });

  return [header, ...blocks].join('\n\n');
}

export function finalizeExternalInitial(
  rawEval: any,
  gradingMode: 'detailed' | 'delf',
  transcription: string,
  level?: string,
): CorrectionResult {
  if (!isValidEvaluation(rawEval, undefined, level)) {
    throw new Error("Le rapport d'évaluation est incomplet (criteriaScores manquants ou invalides).");
  }
  const cleaned = sanitizeHallucinations(rawEval as CorrectionResult);
  const result = sanitizeScores(cleaned, gradingMode, level);
  result.transcription = transcription || result.transcription || '';
  return result;
}
