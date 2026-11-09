/**
 * Prompts et utilitaires partagés entre tous les services d'évaluation DELF PO.
 * Centralise la grille de notation de la production orale, les prompts système et le calcul du jury.
 */
import type { CorrectionResult } from './geminiService';
export { formatScore } from '../scoreUtils';

// ═══════════════════════════════════════════
// 🛡️ DÉFENSE CONTRE LES HALLUCINATIONS CJK
// ═══════════════════════════════════════════

/** Regex matching CJK Unified Ideographs and common CJK ranges */
const CJK_REGEX = /[\u4E00-\u9FFF\u3400-\u4DBF\u{20000}-\u{2A6DF}\u{2A700}-\u{2B73F}\u{2B740}-\u{2B81F}\u{2B820}-\u{2CEAF}\u{2CEB0}-\u{2EBEF}\u{30000}-\u{3134F}\u3000-\u303F]/gu;

/** Regex matching excessive emoji runs (10+ consecutive emoji) */
const EMOJI_SPAM_REGEX = /(?:[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{FE0F}]\s*){10,}/gu;

/** Count CJK characters in a string */
function countCJK(text: string): number {
  if (!text) return 0;
  const matches = text.match(CJK_REGEX);
  return matches ? matches.length : 0;
}

/** Strip CJK blocks and emoji spam from a string, preserving the rest */
function stripCJKAndEmojiSpam(text: string): string {
  if (!text || typeof text !== 'string') return text;
  // Remove contiguous CJK blocks (including surrounding punctuation and whitespace)
  let cleaned = text.replace(/[\s,.\-;:]*(?:[\u4E00-\u9FFF\u3400-\u4DBF\u3000-\u303F\uFF00-\uFFEF][\s\S]*?(?=[\n]|[A-Za-zÀ-ÿ]|$))/gu, '');
  // More aggressive: remove any remaining individual CJK chars
  cleaned = cleaned.replace(CJK_REGEX, '');
  // Remove emoji spam (10+ consecutive emojis)
  cleaned = cleaned.replace(EMOJI_SPAM_REGEX, '');
  // Clean up leftover whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  return cleaned;
}

/**
 * Sanitize a CorrectionResult to remove CJK hallucinations and emoji spam.
 * Throws if the response is too corrupted (>30% CJK in total text).
 */
export function sanitizeHallucinations(result: CorrectionResult, language?: string): CorrectionResult {
  if (!result) return result;

  // 1. Compute corruption level across all text fields
  const allTextFields: string[] = [];
  const addField = (val: any) => { if (typeof val === 'string') allTextFields.push(val); };
  
  addField(result.brouillon_phase1_audit);
  addField(result.brouillon_phase2_analyse);
  addField(result.transcriptionCorrigee);
  if (result.justifications) Object.values(result.justifications).forEach(addField);
  if (result.advices) Object.values(result.advices).forEach(addField);
  if (result.errorsTable) {
    for (const err of result.errorsTable) {
      addField(err.original);
      addField(err.correction);
      addField(err.rule);
    }
  }

  const totalText = allTextFields.join(' ');
  const totalChars = totalText.length;
  const cjkCount = countCJK(totalText);

  // If >30% of the text content is CJK, the response is too corrupted to salvage
  if (language !== 'TW' && totalChars > 100 && cjkCount / totalChars > 0.30) {
    throw new Error(
      `Réponse corrompue par hallucination (${Math.round(cjkCount / totalChars * 100)}% de caractères chinois détectés). Veuillez relancer l'évaluation.`
    );
  }

  // 2. If some CJK is present but below threshold, strip it from individual fields
  if (language !== 'TW' && cjkCount > 5) {
    console.warn(`[sanitizeHallucinations] ${cjkCount} caractères CJK détectés dans la réponse, nettoyage en cours...`);
    
    const clean = (s: string | undefined): string => {
      if (!s || typeof s !== 'string') return s || '';
      return stripCJKAndEmojiSpam(s);
    };

    result.brouillon_phase1_audit = clean(result.brouillon_phase1_audit);
    result.brouillon_phase2_analyse = clean(result.brouillon_phase2_analyse);
    result.transcriptionCorrigee = clean(result.transcriptionCorrigee);

    if (result.justifications) {
      for (const key of Object.keys(result.justifications)) {
        result.justifications[key] = clean(result.justifications[key]);
      }
    }
    if (result.advices) {
      for (const key of Object.keys(result.advices)) {
        result.advices[key] = clean(result.advices[key]);
      }
    }
    if (result.errorsTable) {
      result.errorsTable = result.errorsTable.filter(err => {
        const ruleCjk = countCJK(err.rule || '');
        const ruleLen = (err.rule || '').length;
        // Remove error entries where the rule field is >50% CJK
        if (ruleLen > 10 && ruleCjk / ruleLen > 0.5) return false;
        err.rule = clean(err.rule);
        err.original = clean(err.original);
        err.correction = clean(err.correction);
        return err.rule.length > 0; // Keep only entries with a non-empty rule
      });
    }
  }

  // 3. Also strip emoji spam even if no CJK
  const emojiCheck = totalText.match(EMOJI_SPAM_REGEX);
  if (emojiCheck && emojiCheck.length > 0) {
    console.warn(`[sanitizeHallucinations] Spam d'emojis détecté, nettoyage en cours...`);
    const cleanEmoji = (s: string | undefined): string => {
      if (!s || typeof s !== 'string') return s || '';
      return s.replace(EMOJI_SPAM_REGEX, '').replace(/\n{3,}/g, '\n\n').trim();
    };

    result.brouillon_phase1_audit = cleanEmoji(result.brouillon_phase1_audit);
    result.brouillon_phase2_analyse = cleanEmoji(result.brouillon_phase2_analyse);
    if (result.justifications) {
      for (const key of Object.keys(result.justifications)) {
        result.justifications[key] = cleanEmoji(result.justifications[key]);
      }
    }
    if (result.advices) {
      for (const key of Object.keys(result.advices)) {
        result.advices[key] = cleanEmoji(result.advices[key]);
      }
    }
    if (result.errorsTable) {
      for (const err of result.errorsTable) {
        err.rule = cleanEmoji(err.rule);
      }
    }
  }

  // 4. Always clean thinking/reasoning artifacts from errorsTable.rule fields
  if (result.errorsTable && result.errorsTable.length > 0) {
    for (const err of result.errorsTable) {
      err.rule = cleanErrorRuleField(err.rule);
    }
  }

  // 5. Nettoyer les connecteurs et prépositions étrangers parasites accidentellement injectés dans transcriptionCorrigee et errorsTable (ex: "và", "với", "của", "cho", "trong", "về", "ở", "tại", "nhưng", "hoặc" en vietnamien)
  const cleanForeignLeaks = (s: string | undefined): string => {
    if (!s || typeof s !== 'string') return s || '';
    return s
      .replace(/(^|\s+)và(\s+|$)/gi, (m, p1, p2) => p1 + 'et' + p2)
      .replace(/(^|\s+)hoặc(\s+|$)/gi, (m, p1, p2) => p1 + 'ou' + p2)
      .replace(/(^|\s+)nhưng(\s+|$)/gi, (m, p1, p2) => p1 + 'mais' + p2)
      .replace(/(^|\s+)với(\s+|$)/gi, (m, p1, p2) => p1 + 'avec' + p2)
      .replace(/(^|\s+)của(\s+|$)/gi, (m, p1, p2) => p1 + 'de' + p2)
      .replace(/(^|\s+)cho(\s+|$)/gi, (m, p1, p2) => p1 + 'pour' + p2)
      .replace(/(^|\s+)trong(\s+|$)/gi, (m, p1, p2) => p1 + 'dans' + p2)
      .replace(/(^|\s+)về(\s+|$)/gi, (m, p1, p2) => p1 + 'sur' + p2)
      .replace(/(^|\s+)ở(\s+|$)/gi, (m, p1, p2) => p1 + 'à' + p2)
      .replace(/(^|\s+)tại(\s+|$)/gi, (m, p1, p2) => p1 + 'à' + p2);
  };

  if (result.transcriptionCorrigee && typeof result.transcriptionCorrigee === 'string') {
    result.transcriptionCorrigee = cleanForeignLeaks(result.transcriptionCorrigee);
  }
  if (result.errorsTable && Array.isArray(result.errorsTable)) {
    for (const err of result.errorsTable) {
      if (err && typeof err.correction === 'string') {
        err.correction = cleanForeignLeaks(err.correction);
      }
    }
  }

  return result;
}

/**
 * Clean thinking/reasoning artifacts from errorsTable.rule field.
 * The model sometimes dumps its internal reasoning (IPA analysis, meta-commentary 
 * about the exam being oral, pedagogical reasoning) into the rule field.
 * This function extracts only the actual grammatical/linguistic rule.
 */
function cleanErrorRuleField(rule: string | undefined): string {
  if (!rule || typeof rule !== 'string') return rule || '';
  
  let cleaned = rule.trim();
  
  // 1. Remove surrounding brackets [...]
  if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  
  // 2. If the field contains "Règle :" or "Règle:" or "Rule:", extract only what follows
  const ruleMarkerMatch = cleaned.match(/(?:Règle|Rule|Quy tắc|Pravidlo)\s*:\s*(.+)/i);
  if (ruleMarkerMatch) {
    cleaned = ruleMarkerMatch[1].trim();
  }
  
  // 3. Remove IPA transcriptions between slashes at the start (they belong in apiOriginal/apiCorrection)
  // Pattern: /.../ at the beginning, possibly multiple
  cleaned = cleaned.replace(/^(?:\/?[^\/]*\/\s*)+/g, '').trim();
  // Also remove IPA transcriptions that appear mid-text between slashes
  cleaned = cleaned.replace(/\s*\/[^\/]{2,}\/\s*/g, ' ').trim();
  
  // 4. Remove meta-reasoning phrases about the exam being oral
  const metaPatterns = [
    /Les graphies phonétiques de la transcription traduisent des écarts de prononciation\.\s*/gi,
    /L'épreuve étant orale,?\s*ces écarts ne doivent pas être qualifiés de fautes d'orthographe\.\s*/gi,
    /joints? à d'autres phonèmes déformés\.\s*/gi,
    /Il ne s'agit pas d'une faute d'orthographe mais d'un défaut de prononciation\.\s*/gi,
    /Il s'agit d'un défaut de prononciation et non d'une faute d'orthographe\.\s*/gi,
    /Ce n'est pas une faute d'orthographe[^.]*\.\s*/gi,
    /Ceci est un défaut de prononciation[^.]*\.\s*/gi,
    /La transcription phonétique[^.]*\.\s*/gi,
    /Đây là lỗi phát âm[^.]*\.\s*/gi,
    /Không phải lỗi chính tả[^.]*\.\s*/gi,
  ];
  for (const pattern of metaPatterns) {
    cleaned = cleaned.replace(pattern, '').trim();
  }
  
  // 5. Clean up leftover whitespace and punctuation
  cleaned = cleaned.replace(/^\s*[,.\-;:]+\s*/, '').replace(/\s{2,}/g, ' ').trim();
  
  // 6. Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  
  return cleaned;
}

export function getLanguageInstruction(language: string): string {
  const commonNoChinese = "\n⚠️ INTERDICTION ABSOLUE de rédiger en chinois, en anglais ou dans toute autre langue non demandée. Il est strictement interdit d'insérer des articles, bibliographies, listes de leçons ou textes théoriques académiques (comme des méthodes d'enseignement du chinois ou de grammaire). Rédige uniquement des commentaires de correction concrétisés par les fautes de l'élève.";
  if (language === 'FR') {
    return `Langue du rapport : Français (avec tous les accents de la langue française : é, è, à, â, ê, î, ô, û, ç, etc.).
⚠️ TOUTES les sections du JSON (justifications, advices, errorsTable.rule, brouillons) doivent être rédigées en français en utilisant impérativement tous les accents de la langue française (é, è, à, â, ê, î, ô, û, ç, etc.). Ne supprime jamais les accents. L'absence d'accents français (ex: écrire "a" au lieu de "à", "repondre" au lieu de "répondre", "dechets" au lieu de "déchets") est STRICTEMENT INTERDITE.
⚠️ ATTENTION PARTICULIÈRE (NOTAMMENT POUR LES MODÈLES DE TYPE THINKING COMME GEMINI 4 ARGON) : Tu as une tendance connue à omettre accidentellement les accents dans tes explications (ex: n'écris jamais « mots-cles », « Dernierement », « salutations distinguees », ou « stimuler la creativite », mais écris obligatoirement « mots-clés », « dernièrement », « salutations distinguées », ou « stimuler la créativité »). Tu DOIS impérativement relire chaque mot généré et t'assurer que TOUS les accents français requis sont bien présents dans le JSON final.${commonNoChinese}`;
  }
  if (language === 'VN') {
    return `Langue du rapport : Vietnamien (tiếng Việt).
⚠️ OBLIGATION ABSOLUE : TOUTES les sections textuelles du JSON (justifications, advices, errorsTable.rule, brouillon_phase1_audit, brouillon_phase2_analyse) DOIVENT ÊTRE INTÉGRALEMENT RÉDIGÉES EN VIETNAMIEN avec tous les accents, tons et signes diacritiques de la langue vietnamienne (ă, â, đ, ê, ô, ơ, ư, etc. avec les tons associés sắc, huyền, hỏi, ngã, nặng). Ne supprime jamais les accents. L'absence d'accents vietnamiens (ex: écrire "tieng viet" au lieu de "tiếng Việt", "danh gia" au lieu de "đánh giá", "hoc sinh" au lieu de "học sinh") est STRICTEMENT INTERDITE.
⚠️ INTERDICTION DU FRANÇAIS DANS LE DISCOURS EXPLICATIF : Même si la prestation orale évaluée est en français, il est STRICTEMENT INTERDIT de rédiger les phrases d'explication, les justifications, les conseils, les brouillons ou les règles d'erreurs en français.
✅ CITATIONS ET EXEMPLES EN FRANÇAIS AUTORISÉS : Les citations textuelles et exemples précis en français tirés de la production de l'élève (placés entre guillemets « ... ») ainsi que les formulations modèles recommandées en français sont évidemment autorisés et attendus dans les justifications, conseils et règles pour étayer pédagogiquement l'analyse. Tout le métadiscours (explications, analyses, conseils) DOIT ÊTRE EN VIETNAMIEN.${commonNoChinese}`;
  }
  if (language === 'TW') {
    const commonNoEnglish = "\n⚠️ INTERDICTION ABSOLUE de rédiger en anglais, en français ou dans toute autre langue non demandée. Il est strictement interdit d'insérer des articles, bibliographies, listes de leçons ou textes théoriques académiques. Rédige uniquement des commentaires de correction concrétisés par les fautes de l'élève.";
    return `Langue du rapport : Chinois traditionnel (Taïwan - 繁體中文).
⚠️ TOUTES les sections du JSON (justifications, advices, errorsTable.rule, brouillons) doivent être rédigées en chinois traditionnel (繁體中文) avec les caractères traditionnels (Traditional Chinese) tels qu'utilisés à Taïwan. L'usage de caractères simplifiés (Simplified Chinese) est STRICTEMENT INTERDIT.
⚠️ DISCOURS EXPLICATIF EN CHINOIS : Les phrases d'explication, analyses et conseils doivent être en chinois traditionnel. Les citations exactes et exemples tirés de la prestation (entre guillemets « ... ») ainsi que 'original', 'correction' et 'transcriptionCorrigee' restent en français pour étayer l'évaluation.${commonNoEnglish}`;
  }
  if (language === 'EN') {
    const commonNoChineseOrFrench = "\n⚠️ INTERDICTION ABSOLUE de rédiger en chinois, en français ou dans toute autre langue non demandée (autre que l'anglais). Il est strictement interdit d'insérer des articles, bibliographies, listes de leçons ou textes théoriques académiques. Rédige uniquement des commentaires de correction concrétisés par les fautes de l'élève.";
    return `Langue du rapport : Anglais (English).
⚠️ TOUTES les sections du JSON (justifications, advices, errorsTable.rule, brouillons) doivent être rédigées en anglais. Rédige impérativement en anglais correct.
⚠️ EXPLANATORY DISCOURSE IN ENGLISH : All explanations, justifications, feedback, and advice must be written in English. Direct quotes and targeted examples taken from the student's speech (in quotation marks « ... ») as well as 'original', 'correction', and 'transcriptionCorrigee' remain in French to support the pedagogical analysis.${commonNoChineseOrFrench}`;
  }
  return `Langue du rapport : Tchèque (čeština).
⚠️ TOUTES les sections du JSON (justifications, advices, errorsTable.rule, brouillons) doivent être rédigées en tchèque avec tous les accents et signes diacritiques de la langue tchèque (á, č, ď, é, ě, í, ň, ó, ř, š, ť, ú, ů, ý, ž). Ne supprime jamais les accents. L'absence d'accents tchèques (ex: écrire "cestina" au lieu de "čeština", "zkouska" au lieu de "zkouška") est STRICTEMENT INTERDITE.
⚠️ DISCOURS EXPLICATIF EN TCHÈQUE : Les explications et commentaires doivent être rédigés en tchèque. Les citations directes et exemples tirés de la copie (entre guillemets « ... ») ainsi que 'original', 'correction' et 'transcriptionCorrigee' restent en français.${commonNoChinese}`;
}

export function getRule3Instruction(language: string): string {
  if (language === 'FR') {
    return `3. ORTHOGRAPHE ET ACCENTS OBLIGATOIRES : Rédige toutes les sections textuelles et règles de correction en français correct en incluant obligatoirement tous les accents requis (é, è, à, â, ê, î, ô, û, ç, etc.). Le fait de rédiger en texte brut simple ne signifie pas qu'il faut enlever les accents ; conserve absolument tous les accents de la langue française. L'absence d'accents (ex: n'écris jamais « mots-cles », « Dernierement », « salutations distinguees », ou « stimuler la creativite », mais écris obligatoirement « mots-clés », « dernièrement », « salutations distinguées », ou « stimuler la créativité ») est strictement interdite.`;
  }
  if (language === 'VN') {
    return `3. ORTHOGRAPHE ET ACCENTS OBLIGATOIRES : Rédige toutes les sections textuelles et règles de correction en vietnamien correct en utilisant obligatoirement tous les accents, tons et signes diacritiques de la langue vietnamienne (tiếng Việt có dấu). Le fait de rédiger en texte brut simple ne signifie pas qu'il faut enlever les accents. L'absence d'accents vietnamiens (ex: écrire "tieng viet" au lieu de "tiếng Việt") est strictement interdite.`;
  }
  if (language === 'TW') {
    return `3. FORMAT DE LANGUE OBLIGATOIRE : Rédige toutes les sections textuelles et règles de correction en chinois traditionnel de Taïwan (繁體中文). L'usage de caractères simplifiés est strictement interdit.`;
  }
  if (language === 'EN') {
    return `3. LANGUAGE REQUIREMENT: Write all text sections and correction rules in correct English. The use of any other language for feedback is strictly forbidden.`;
  }
  return `3. ORTHOGRAPHE ET ACCENTS OBLIGATOIRES : Rédige toutes les sections textuelles et règles de correction en tchèque correct avec tous les accents et signes diacritiques de la langue tchèque (á, č, ď, é, ě, í, ň, ó, ř, š, ť, ú, ů, ý, ž). Le fait de rédiger en texte brut simple ne signifie pas qu'il faut enlever les accents. L'absence d'accents tchèques (ex: écrire "cestina" au lieu de "čeština") est strictement interdite.`;
}

export function getPoliteFormInstruction(language: string): string {
  if (language === 'FR') {
    return `5. VOUVOIEMENT OBLIGATOIRE (CRITIQUE) : Dans toutes les parties textuelles destinées à l'apprenant (justifications et conseils/advices), tu dois impérativement utiliser le vouvoiement (« vous », « votre », « vos », etc.) pour t'adresser à l'élève. Le tutoiement (« tu », « ton », « ta », « tes », etc.) est strictement interdit.`;
  }
  if (language === 'VN') {
    return `5. TÔN TRỌNG VÀ LỊCH SỰ (CRITIQUE) : Trong tất cả các phần văn bản dành cho học viên (giải thích và lời khuyên), bạn phải sử dụng đại từ xưng hô tôn trọng, chuẩn mực sư phạm (như "bạn", "học viên"). Tuyệt đối KHÔNG dùng đại từ tiếng Pháp (« vous », « tu ») trong văn bản tiếng Việt.`;
  }
  if (language === 'TW') {
    return `5. 禮貌尊稱要求 : 在所有面向考生的文字評語（理由說明與建議）中，請使用禮貌、尊重的教育專業語氣（如「您」或「考生」），切勿使用法語代詞。`;
  }
  if (language === 'EN') {
    return `5. POLITE AND PROFESSIONAL TONE: In all student-facing text sections (justifications and advices), maintain a polite, encouraging and professional tone addressed directly to the learner ("you", "your"). Do not mix in French pronouns.`;
  }
  return `5. ZDVOŘILÉ VYKÁNÍ : Ve všech textových částech pro studenta (odůvodnění a doporučení) používejte zdvořilé vykání přiměřené pedagogickému hodnocení.`;
}

export function buildEvalSystemPrompt(level: string, language: string, notationType: 'detailed' | 'delf' = 'detailed'): string {
  const isB1 = level === 'B1';
  
  const b1Grille = `
═══════════════════════════════════════════
📋 GRILLE DE PERFORMANCE OFFICIELLE B1 — PRODUCTION ORALE
═══════════════════════════════════════════
Chaque critère doit être noté selon les descripteurs suivants :

▸ RÉALISATION DE LA TÂCHE 1 : ENTRETIEN DIRIGÉ (entretien) :
  4 = Peut communiquer avec une certaine assurance sur des sujets familiers habituels ou non, en relation avec ses intérêts et son domaine professionnel. Peut interagir avec assurance en donnant des raisons simples pour justifier un point de vue sur un sujet familier.
  2.5 = Peut se présenter clairement et mener à bien une description simple de sujets variés dans son domaine familier ou d’intérêt en la présentant comme une succession linéaire de points. Peut interagir avec l’examinateur en fournissant des détails sur ses expériences passées, activités et projets personnels, professionnels.
  1 = Peut se présenter et parler de son environnement proche sous forme de courts énoncés simples et non nécessairement reliés entre eux. Les hésitations peuvent encore être fréquentes et des relances peuvent être nécessaires. Peut répondre à des questions simples sur son environnement proche mais n’est pas encore capable de gérer une interaction sur des sujets moins familiers.
  0 = Absent, non répondu ou production insuffisante.

▸ RÉALISATION DE LA TÂCHE 2 : EXERCICE EN INTERACTION (interaction) :
  4 = Peut mener à bien la tâche de façon spontanée et efficace. Peut faire face à des situations imprévues et défendre son point de vue sur un problème en donnant des arguments convaincants. Peut s’exprimer convenablement en utilisant un registre adapté à la situation malgré quelques confusions ponctuelles.
  2.5 = Peut mener à bien la tâche en utilisant des phrases et des actes de parole simples et adéquats mais peut avoir recours à des périphrases pour exprimer les idées plus complexes. Peut échanger, vérifier et confirmer des informations, faire face à des situations moins courantes et expliquer pourquoi il y a une difficulté. Peut s’exprimer le plus souvent dans un registre adapté à la situation bien que quelques confusions persiste.
  1 = Peut mener à bien la tâche en utilisant actes de parole globalement adéquats mais qui peuvent être redondants. Peut avoir besoin de temps pour s’adapter à une situation imprévue. Peut identifier une situation problématique et donner quelques explications simples mais des répétitions ou des reformulations peuvent être nécessaires afin de clarifier ses idées. Peut utiliser les formes de politesse les plus quotidiennes mais peut encore confondre les registres.
  0 = Absent, non répondu ou production insuffisante.

▸ RÉALISATION DE LA TÂCHE 3 : EXPRESSION D'UN POINT DE VUE (monologue) :
  4 = Peut présenter la thématique et expliquer son point de vue en développant une argumentation non complexe de manière à être compris sans difficulté la plupart du temps. Peut donner des raisons et des exemples variés pour justifier un point de vue sur le sujet du document.
  2.5 = Peut présenter le thème du document en termes simples. Peut développer son opinion ainsi que ses préférences en donnant des raisons et des explications simples pour justifier son avis. Peut avoir ponctuellement besoin d’être relancé par l’examinateur pour préciser ou étayer ses propos.
  1 = Peut repérer le thème du document et donner son point de vue en termes simples mais des répétitions ou des reformulations peuvent être nécessaires afin de clarifier ses idées. Des digressions ponctuelles peuvent être observées. A besoin d’être relancé par l’examinateur pour préciser ou étayer ses propos.
  0 = Absent, non répondu ou production insuffisante.

▸ LEXIQUE / VOCABULAIRE (lexique) :
  5 = Possède un vocabulaire suffisamment étendu pour pouvoir communiquer sans trop de restrictions sur les sujets relatifs à son domaine d’intérêt et les sujets de société courants, ainsi que pour se débrouiller dans des situations quotidiennes non prévisibles. Peut varier sa formulation mais des répétitions et des lacunes peuvent encore subsister.
  3 = Utilise correctement une gamme étendue de vocabulaire courant en rapport avec des sujets familiers et des situations quotidiennes prévisibles. Peut utiliser des périphrases pour exprimer des idées ou des mots plus complexes sur la plupart des sujets relatifs à sa vie quotidienne. Des erreurs de maîtrise et des répétitions se produisent lorsqu’il s’agit d’exprimer une pensée plus complexe.
  1 = Possède un vocabulaire suffisant pour satisfaire les besoins communicatifs élémentaires mais qui reste trop restreint pour aborder des sujets qui s’éloignent de ses centres d’intérêt et de son environnement proche.
  0 = Vocabulaire insuffisant.

▸ MORPHOSYNTAXE / GRAMMAIRE (morphosyntaxe) :
  4 = A un bon contrôle grammatical des structures syntaxiques et des formes grammaticales complexes les plus fréquentes, bien que ces dernières soient peu variées.
  2.5 = Peut se servir avec une correction suffisante d’un répertoire de structures syntaxiques et de formes grammaticales complexes les plus fréquentes.
  1 = Peut utiliser correctement des structures syntaxiques et des formes grammaticales simples mais peut commettre encore des erreurs élémentaires, notamment dans les tentatives d’emploi de structures plus complexes.
  0 = Contrôle grammatical insuffisant.

▸ MAÎTRISE DU SYSTÈME PHONOLOGIQUE (phonologie) :
  ⚠️ CONSIGNE CRITIQUE PHONOLOGIE : Tu dois relever et évaluer UNIQUEMENT les erreurs de prononciation FLAGRANTES, en particulier celles qui rendent le mot inintelligible ou déforment gravement la compréhension. IGNORE SYSTÉMATIQUEMENT toutes les prononciations pour lesquelles tu as un doute quant à savoir si elles sont correctes ou non.
  4 = A acquis une prononciation, une intonation et une accentuation globalement correctes. Les éventuelles difficultés de prononciation ne gênent pas le sens général.
  2.5 = La prononciation est en général intelligible. Les expressions et les mots les plus courants sont prononcés de façon adéquate, même si des maladresses subsistent dans l’intonation et l’accentuation.
  1 = Peut prononcer correctement un répertoire d’expressions et de mots élémentaires. La prononciation est en général suffisamment claire pour être comprise mais l’examinateur devra parfois faire répéter.
  0 = Prononciation incompréhensible.`;

  const b2Grille = `
═══════════════════════════════════════════
📋 GRILLE DE PERFORMANCE OFFICIELLE B2 — PRODUCTION ORALE
═══════════════════════════════════════════
Chaque critère doit être noté selon les descripteurs suivants (notes possibles : 0, 1, 3, 5) :

▸ RÉALISATION DE LA TÂCHE 1 : MONOLOGUE SUIVI - DÉFENSE D'UN POINT DE VUE ARGUMENTÉ (monologue) :
  5 = (Niveau Maîtrise / Excellence) : Dégage la problématique avec clarté et finesse, introduit le sujet au moyen d’une introduction facilitante. Présente son opinion en développant des arguments variés et approfondis, solidement étayés d’exemples pertinents et analysés. Produit un discours clair, fluide, hiérarchisé et bien structuré avec une variété de connecteurs. Pèse les nuances du débat et apporte une conclusion nette et argumentée.
  3 = (Niveau Acquis / Suffisant - Standard B2) : Présente la problématique au moyen d’une introduction claire. Donne son point de vue en s’appuyant sur des arguments concrets et des exemples pertinents. Discours globalement bien organisé avec des connecteurs. NOTE STANDARD B2 : Ce palier 3/5 s'applique dès lors que les arguments restent généraux ou énumératifs, que les solutions proposées manquent d'approfondissement ou d'analyse critique de faisabilité, ou que la conclusion reste indécise sans trancher clairement la problématique.
  1 = (Niveau Partiel / Fragile) : Identifie la thématique générale sans problématique nette. Donne une opinion simple avec quelques exemples personnels. Discours linéaire, manquant d’organisation, de hiérarchie ou de clarté.
  0 = Production insuffisante ou hors sujet.
  ⚠️ RÈGLE DE CALIBRATION STRICTE (3/5 vs 5/5) : La note maximale de 5/5 exige une véritable excellence argumentative sans réserve majeure. Si le candidat a un plan et des connecteurs mais que ses arguments ou solutions manquent de profondeur, d'analyse de faisabilité ou de nuance, la note réglementaire exacte est 3/5. Il est FORMELLEMENT INTERDIT d'attribuer 5/5 à un monologue dont la justification relève que les solutions sont peu approfondies, superficielles ou que la conclusion ne tranche pas.

▸ RÉALISATION DE LA TÂCHE 2 : EXERCICE EN INTERACTION - DÉBAT (interaction) :
  5 = Peut exposer son opinion et argumenter avec précision, en élargissant éventuellement la discussion avec des idées nouvelles. Peut réagir aux arguments d’autrui de façon convaincante, même lorsque ces derniers sortent du cadre de la tâche.
  3 = Peut exprimer, confirmer, voire nuancer son opinion en apportant des exemples supplémentaires. Peut réagir à des questions et à des contre-arguments se rapportant au sujet de la tâche.
  1 = Peut répondre simplement à des questions et à des contre-arguments mais des difficultés surviennent lorsque ceux-ci sortent de la sphère personnelle ou quotidienne.
  0 = Absence de débat ou incapacité à interagir.

▸ LEXIQUE / VOCABULAIRE (lexique) :
  5 = Possède un vaste répertoire lexical dans des domaines variés lui permettant de surmonter facilement les lacunes par des synonymes ou des périphrases. Des maladresses non systématiques peuvent encore se produire ponctuellement mais ne gênent en aucun cas la compréhension.
  3 = Utilise de façon adéquate une large gamme de vocabulaire relatif à son domaine d’intérêt et aux sujets de société courants. Peut varier sa formulation pour éviter les répétitions, mais quelques erreurs de maîtrise peuvent encore se produire et gêner la compréhension.
  1 = Utilise correctement un vocabulaire simple, mais dont l’étendue reste encore limitée pour traiter des sujets de société courants. Utilise des périphrases pour exprimer des idées ou des mots plus complexes.
  0 = Vocabulaire insuffisant.

▸ MORPHOSYNTAXE / GRAMMAIRE (morphosyntaxe) :
  5 = A un bon contrôle grammatical dans l’ensemble et fait preuve de variété dans ses formulations. Des erreurs non systématiques peuvent encore se produire ponctuellement, mais elles ne gênent en aucun cas la compréhension.
  3 = A un bon contrôle grammatical des structures syntaxiques complexes les plus fréquentes, bien que ces dernières soient peu variées. D’éventuelles erreurs peuvent se produire dans les structures plus élaborées mais ne conduisent pas à des malentendus.
  1 = Maîtrise les structures syntaxiques et les formes grammaticales simples et fait preuve d’une relative correction dans l’emploi des structures complexes courantes, mais a des difficultés à maintenir cette correction lorsqu’il s’agit d’exprimer une idée plus élaborée.
  0 = Contrôle grammatical insuffisant.

▸ MAÎTRISE DU SYSTÈME PHONOLOGIQUE (phonologie) :
  ⚠️ CONSIGNE CRITIQUE PHONOLOGIE : Tu dois relever et évaluer UNIQUEMENT les erreurs de prononciation FLAGRANTES, en particulier celles qui rendent le mot inintelligible ou déforment gravement la compréhension. IGNORE SYSTÉMATIQUEMENT toutes les prononciations pour lesquelles tu as un doute quant à savoir si elles sont correctes ou non.
  5 = Maintient une bonne maîtrise de la prononciation et est capable de s’autocorriger. Peut varier l’intonation et l’accentuation pour mieux faire passer son message. L’éventuelle présence d’un accent étranger n’affecte en rien la compréhension.
  3 = Peut en général utiliser la bonne intonation, placer correctement l’accent et articuler clairement les sons. Les éventuelles difficultés de prononciation ne gênent pas le sens général ni la communication avec l’interlocuteur.
  1 = La prononciation est en général intelligible. Les expressions et les mots les plus courants sont prononcés de façon adéquate, même si des maladresses subsistent dans l’intonation et l’accentuation.
  0 = Prononciation incompréhensible.`;



  let notationRules = '';
  if (notationType === 'delf') {
    notationRules = `\n⚠️ ATTENTION - NOTATION STRICTE DELF (OBLIGATOIRE) :
Tu es configuré en mode d'évaluation réglementaire DELF. Tu dois obligatoirement attribuer uniquement les notes réglementaires pour chaque critère. Les autres notes intermédiaires sont strictement interdites.
- Pour DELF B1 :
  * Les critères "entretien", "interaction", "monologue", "morphosyntaxe" et "phonologie" (sur 4) doivent être notés uniquement parmi : [0, 1, 2.5, 4]
  * Le critère "lexique" (sur 5) doit être noté uniquement parmi : [0, 1, 3, 5]
- Pour DELF B2 :
  * Tous les critères (sur 5) doivent être notés uniquement parmi : [0, 1, 3, 5]\n`;
  } else {
    notationRules = `\nℹ️ NOTATION DÉTAILLÉE :
Tu es configuré en mode d'évaluation détaillée. Tu es libre d'attribuer des notes par demi-points (par exemple : 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5 selon le maximum du critère).\n`;
  }

  const activeGrille = isB1 ? b1Grille : b2Grille;

  const criteriaJsonExample = isB1
    ? `    "entretien": number,
    "interaction": number,
    "monologue": number,
    "lexique": number,
    "morphosyntaxe": number,
    "phonologie": number`
    : `    "monologue": number,
    "interaction": number,
    "lexique": number,
    "morphosyntaxe": number,
    "phonologie": number`;

  const criteriaTextExample = isB1
    ? `    "entretien": string,
    "interaction": string,
    "monologue": string,
    "lexique": string,
    "morphosyntaxe": string,
    "phonologie": string`
    : `    "monologue": string,
    "interaction": string,
    "lexique": string,
    "morphosyntaxe": string,
    "phonologie": string`;

  return `Tu es un EXAMINATEUR pour l'épreuve de Production Orale selon le barème DELF ${level}.

═══════════════════════════════════════════
🌐 LANGUE DU RAPPORT OBLIGATOIRE (STRICTE)
═══════════════════════════════════════════
${getLanguageInstruction(language)}
Toutes les explications, justifications, conseils, règles du tableau d'erreurs (errorsTable.rule) et brouillons DOIVENT IMPÉRATIVEMENT être rédigés dans cette langue demandée. Seules les citations directes et exemples en français tirés de la prestation de l'étudiant (entre guillemets « ... ») ainsi que 'original', 'correction' et la transcription corrigée ('transcriptionCorrigee') restent en français.
⚠️ INTERDICTION STRICTE : Il est formellement interdit de rédiger les phrases d'explication, justifications, conseils, règles ou brouillons en français si la langue demandée est le vietnamien (ou une autre langue). Rédige l'intégralité du métadiscours dans la langue cible demandée.

${activeGrille}

${notationRules}

═══════════════════════════════════════════
⚖️ PRINCIPES D'ÉVALUATION ORALE (OBLIGATOIRES)
═══════════════════════════════════════════

1. AUDITION DU SIGNAL AUDIO & BIENVEILLANCE COMMUNICATIVE :
   - Tu évalues la compétence de communication globale, pas uniquement les fautes ponctuelles. Une maladresse ou un accent n'empêche pas une excellente note si la communication est efficace et fluide.
   - Les erreurs de prononciation qui n'entravent pas la compréhension mutuelle doivent être traitées avec bienveillance ('2.5 ou 3 points selon le niveau').

2. CALIBRATION STRICTE PAR NIVEAU & LUTTE CONTRE LA TENDANCE CENTRALE :
   → ${isB1 
       ? 'CALIBRATION STRICTE B1 : Ne sois PAS indulgent par bienveillance artificielle. Si la communication orale est très hésitante, les structures de base fausses ou le lexique indigent, attribue sans hésiter les échelons bas (0 ou 1). Ne remonte pas la note artificiellement.' 
       : 'CALIBRATION STRICTE B2 : Réserve strictement le 5/5 (et les notes globales ≥ 22/25) à une véritable excellence argumentative et linguistique. Si le monologue présente une structure et des connecteurs mais que les arguments restent généraux, peu approfondis, énumératifs ou sans nuance critique, la note réglementaire exacte est 3/5. Ne confonds pas un débit oral continu ou un respect formel du plan avec une argumentation approfondie d\'excellence.'}

3. ⚖️ PRINCIPE DU NON-CUMUL DES SANCTIONS (CLOISONNEMENT STRICT DES CRITÈRES CECRL) :
   Il est formellement interdit de pénaliser plusieurs fois le même fait linguistique à travers différents critères :
   - Le critère Monologue (Tâche 1) évalue EXCLUSIVEMENT la capacité à dégager une problématique, structurer l'exposé en plusieurs parties distinctes (introduction, développement, conclusion), argumenter avec des exemples et employer des connecteurs logiques. Tu ne dois EN AUCUN CAS abaisser la note de Monologue à cause des hésitations orales, répétitions ou tics de langage (« euh ») (qui relèvent EXCLUSIVEMENT de la Phonologie / Aisance orale), ni à cause d'erreurs de grammaire ou de conjugaison (qui relèvent EXCLUSIVEMENT de la Morphosyntaxe), tant que le propos reste compréhensible.
   - Si l'apprenant dégage une problématique claire, pose un plan avec des connecteurs variés (ex: En effet, Cependant, D'une part, En conclusion) et apporte des arguments concrets, il atteint le palier acquis/intermédiaire (3/5 en B2), même si son élocution est heurtée ou sa grammaire fautive. Il ne peut prétendre au palier maximal de 5/5 que si son argumentation est réellement approfondie, hiérarchisée, nuancée et sans superficialité.
   - De même, les fautes de genre, d'accord, de conjugaison et de préposition relèvent EXCLUSIVEMENT de la Morphosyntaxe : il est strictement interdit de les compter à nouveau comme des fautes de Lexique.

4. ALERTE LAXISME MORPHOSYNTAXIQUE (CRITIQUE) : Les modèles IA ont une tendance avérée à surnoter la morphosyntaxe. Effectue une vérification rigoureuse des structures de phrases, conjugaisons et prépositions à l'oral. Une prestation comportant des fautes grammaticales récurrentes NE DOIT PAS recevoir la note maximale en morphosyntaxe.

5. INTERDICTION DE CONTRADICTION NOTE/JUSTIFICATION : Il est STRICTEMENT INTERDIT d'attribuer la note maximale (5/5 en B2) à un critère si la justification ou le brouillon associé mentionne des "erreurs fréquentes", des "lacunes majeures", des arguments superficiels/peu développés, des solutions énumérées sans analyse de faisabilité, ou une absence de prise de position tranchée. Si une réserve argumentative substantielle est formulée, la note attribuée doit obligatoirement être le palier intermédiaire (3/5).

6. VÉRACITÉ DES CITATIONS & ÉTAYAGE OBLIGATOIRE (CRITIQUE) :
   - Tout extrait cité dans 'original' ou dans les justifications DOIT provenir littéralement de la transcription orale du candidat.
   - CITATIONS TEXTUELLES OBLIGATOIRES : Chaque justification de critère DOIT obligatoirement comporter au moins 1 à 2 citations textuelles exactes (entre guillemets « ... ») extraites des propos réels de l'étudiant pour appuyer ton évaluation.
   - ⚠️ INTERDICTION DE LA NORMALISATION SILENCIEUSE / CORRECTION INVOLONTAIRE LORS DE LA CITATION : Lorsque tu cites les propos de l'étudiant (entre guillemets « ... » ou dans errorsTable.original), tu DOIS recopier LITTÉRALEMENT et CARACTÈRE PAR CARACTÈRE les mots tels qu'ils ont été prononcés/transcrits, en préservant EXACTEMENT les fautes d'accord, de conjugaison ou de syntaxe. Ne normalise jamais inconsciemment une formulation erronée en la citant (ex: si le candidat dit « parce qu'il traitent », écris exactement « parce qu'il traitent » et non « parqu'il traitent »).
   - EXCLUSION ABSOLUE DE LA PHONOLOGIE ET DE L'ALPHABET PHONÉTIQUE (API/IPA) : Le tableau 'errorsTable' est réservé STRICTEMENT aux erreurs linguistiques (pas d'API/IPA, pas de fautes d'orthographe car il s'agit d'une épreuve orale).

7. RÈGLES STRICTES POUR transcriptionCorrigee ET LE TABLEAU DES ERREURS (errorsTable) :
   - EXCLUSION DES AUTOREPRISES, AUTOCORRECTIONS ET FAUX DÉPARTS ORAUX : Le tableau 'errorsTable' ne doit contenir QUE des erreurs linguistiques (grammaire, syntaxe, lexique). Ne consigne JAMAIS de simples bégaiements syllabiques, répétitions de mots ou hésitations orales qui ne comportent aucune faute de langue (ex: « le fait qu'un le fait qu'une machine », « finance finance finance », « Euh Et mais mais »). De même, si le candidat trébuche sur un chiffre ou un mot et se reprend immédiatement (ex: « environ 1/6 1/600 » pour « 1/600 », « dans 8 à dans 5 heures » pour « cinq heures », « pour de préver- préserver »), il s'agit d'une simple autocorrection orale spontanée : INTERDICTION FORMELLE de la consigner comme une erreur dans 'errorsTable'.
   - NETTOYAGE DES ORIGINAUX DANS errorsTable : L'entrée 'original' doit isoler l'erreur linguistique sans être polluée par des répétitions d'hésitation ou bégaiements oraux (ex: cite « ils ont besoin de temps » plutôt que « ils ont besoin ont besoin de de temps »).
   - ⚠️ INTERDICTION DES RECONSTRUCTIONS SPÉCULATIVES SUR PASSAGES OBSCURS OU INAUDIBLES : Si une expression est inintelligible, confuse ou inaudible (ex: « après votre tête », « voir les eaux »), il est STRICTEMENT INTERDIT d'inventer des mots ou de deviner ce que l'élève aurait pu vouloir dire (comme inventer « au pied du sapin » ou « au pied du lit », « observer comme au zoo »). Conserve le passage non reconstitué en le signalant expressément entre crochets : « [locution incompréhensible, non reconstituée : « ... »] ». De même pour un syntagme inachevé (« par exemple les droits... ») : qualifie l'erreur de syntagme inachevé dans rule et n'invente pas la fin.
   - ⚠️ INTERDICTION STRICTE DU LISSAGE SÉMANTIQUE ET DE L'EMBELLISSEMENT (RESPECT DES MÉTAPHORES DU CANDIDAT) : Ne maquille JAMAIS un effondrement ou un propos fautif en un registre diplomate ou soutenu. Si le candidat dit « je dois pas répondre », ne le réécris JAMAIS en « Je préfère ne pas répondre, monsieur ». Si le candidat dit « une machine de gagner d'argent », corrige uniquement la grammaire (« une machine à gagner de l'argent »), sans remplacer son image par un terme neutre (« un moyen de gagner de l'argent »). Ne rajoute pas non plus de mots superflus à une formulation correcte (ex: ne change pas « cette façon » en « cette façon de faire »). La correction doit être STRICTEMENT LITTÉRALE ET MINIMALE sur la grammaire/syntaxe.
   - ⚠️ AUCUNE SUPPRESSION SILENCIEUSE D'ÉNONCÉ : Ne supprime JAMAIS une phrase prononcée par le candidat sous prétexte qu'elle est bancale ou confuse (ex: « c'est bon pour peur », « On ne peut pas dire les mentirs mauvais »). Tout énoncé doit figurer dans transcriptionCorrigee avec sa correction grammaticale stricte et dans errorsTable.
   - ⚠️ RESPECT STRICT DE LA POLARITÉ (NÉGATIVE / AFFIRMATIVE) : Veille à ce que la polarité soit rigoureusement identique entre errorsTable et transcriptionCorrigee. Si l'original est « ils n'est très bavards », la correction doit être « ils ne sont pas très bavards » (négative) dans errorsTable ET dans transcriptionCorrigee, et JAMAIS inversée en affirmation (« s'ils sont très bavards »).
   - ⚠️ PARFAITE SYNCHRONISATION ENTRE transcriptionCorrigee ET errorsTable (ZÉRO CORRECTION SILENCIEUSE) : Toute correction linguistique apportée dans 'transcriptionCorrigee' DOIT OBLIGATOIREMENT faire l'objet d'une entrée explicative dans 'errorsTable'. Les corrections silencieuses sont STRICTEMENT INTERDITES. Réciproquement, chaque entrée de 'errorsTable' doit être fidèlement appliquée dans 'transcriptionCorrigee'.
   - ⚠️ PURETÉ LINGUISTIQUE (100% FRANÇAIS DANS transcriptionCorrigee ET DANS errorsTable.correction) : Le texte de 'transcriptionCorrigee' et chaque valeur 'correction' de errorsTable doivent être INTÉGRALEMENT et EXCLUSIVEMENT en français. Même si le rapport d'évaluation est rédigé en vietnamien, aucun mot d'une autre langue (comme les mots vietnamiens « và », « hoặc », « nhưng », « với », « của », « cho », « trong », « về », « ở », « tại ») ne doit s'y infiltrer.
   - ⚠️ EXHAUSTIVITÉ DU RELEVÉ D'ERREURS & ANGLES MORTS FRÉQUENTS : Tu dois passer la transcription au peigne fin et ne pas t'arrêter après 10 ou 15 erreurs. Repère systématiquement :
     * Les omissions du « que » de subordination (« Je pense c'est... » -> « Je pense que c'est... », « il pose la question... c'est s'il faut ») ;
     * Les omissions du « si » conditionnel (« ils veulent ou non » -> « s'ils veulent ou non », « et ils veulent pas » -> « et s'ils ne veulent pas ») ;
     * Les prépositions temporelles de durée vs date : « dans X heures » pour exprimer une durée -> « pendant X heures » ;
     * Les prépositions de but erronées avec verbe : « des machines de moderniser » -> « pour moderniser », « un musée de préserver » -> « pour préserver » ;
     * Les prépositions superflues ou répétées après verbes : « pour de rencontrer » -> « pour rencontrer », « peuvent de participer » -> « peuvent participer », « comprendre de ce que » -> « comprendre ce que » ;
     * Les corrélations prépositionnelles fautives : « entre X avec Y » -> « entre X et Y » ;
     * Les faux-amis d'anglicisme lexical : « une place » ou « une location » pour désigner un « lieu / endroit » ; « rentrer » pour « rester » ;
     * L'usage d'adjectifs à la place de noms abstraits : « parler de pauvre » -> « parler de pauvreté », « découvrir une nouvelle culturelle » -> « une nouvelle culture », « leur traditionnelle » -> « leurs traditions » ;
     * Les erreurs de genre sur les noms masculins courants : « village » (ce village, un village), « musée » (un musée), « artisanat » (un grand artisanat), « choix » (un autre choix), « horizon » (un horizon) ; et féminins : « matière » (la matière) ;
     * Les contractions d'articles obligatoires après préposition (« pour vendre à les touristes » -> « aux touristes ») ;
     * Les registres familiers inadaptés à l'examen (« les trucs » -> « des éléments / des aspects », négations relâchées sans « ne » comme « Je sais pas » -> « Je ne sais pas ») ;
     * Les faux sujets / pronoms fantômes après groupe prépositionnel (« avec le Père Noël, il permet... » -> « cela permet... ») ;
     * Les prépositions et locutions temporelles/locatives fautives (« dans le matin » -> « le matin », « dans toute la vie » -> « pour toute la vie », « dans les cours » -> « en classe », « sur le texte » -> « dans le texte ») ;
     * Les verbes à l'infinitif après conjonctions temporelles ou sujets (« quand ils grandir » -> « quand ils grandissent », « ce que les habitants faire » -> « ce que les habitants font », « les entreprises prendre » -> « les entreprises peuvent prendre ») ;
     * Les structures de but avec deux sujets différents (« pour les enfants pour être sages » -> « pour que les enfants soient sages ») ;
     * Les confusions lexicales et rections (« le passage avec la réalité » -> « à la réalité », « dépendre à » -> « dépendre de », « discuter le sujet » -> « discuter du sujet », « faire plaisir les visiteurs » -> « faire plaisir aux visiteurs », « travailler d'autres emplois » -> « occuper d'autres emplois », « les expliquer » -> « leur expliquer »).
   - ⚠️ PARITÉ OBLIGATOIRE JUSTIFICATIONS / TABLEAU D'ERREURS : Tout mot ou tour critiqué ou cité comme fautif dans les justifications ou les brouillons (par exemple le mot familier « les trucs » ou l'anglicisme « skipper ») DOIT OBLIGATOIREMENT faire l'objet d'une ligne d'erreur dans 'errorsTable'.

8. COHÉRENCE INTERNE : Si la note globale (globalScore) est ≥ 17/25, aucun critère ne doit être en dessous de 2.5/5 (B1) ou 3/5 (B2). ${notationType === 'detailed' ? 'Si la note globale (globalScore) est ≥ 20/25, aucun critère ne doit être en dessous de 4/5 (B1) ou 4/5 (B2). ' : ''}Vérifie cette cohérence avant de finaliser.

9. CONFRONTE RIGOUREUSEMENT AUX DESCRIPTEURS :
   - Entretien dirigé (B1) : Si le candidat a besoin de multiples reformulations de questions basiques et répond par des énoncés très courts ou des mots uniques (ou utilise l'anglais / code-switching), la note doit être de 1 ou 0.
   - Monologue (B1/B2) : Évalue strictement ce qui est produit pendant la phase d'exposé continu. Si le thème n'est pas dégagé ou si le candidat fait un hors-sujet majeur en introduction, la note de Monologue doit être de 1.
   - Interaction / Débat (B1/B2) : Vérifie d'abord si la règle éliminatoire de note 0 s'applique (incapacité totale à interagir, silence complet ou uniquement des questions en écho sur l'ensemble des questions). Si le candidat formule ne serait-ce qu'une ou deux réponses sur le fond avant d'échouer ou de demander à passer, la note 0 est exclue et une note partielle (1/5 en B2 ou 1/4 en B1) doit être attribuée.
   - Lexique (B1/B2) : En cas de recours récurrent (≥ 2 occurrences distinctes en langue étrangère) ou de mots inventés, la note doit être de 1 (ou 2 en B1). ATTENTION : Un mot d'anglais ou anglicisme isolé unique est une simple faute lexicale ponctuelle qui ne déclenche PAS le plafonnement strict à 1/5.
   - Morphosyntaxe (B1/B2) : Si les erreurs touchent les structures élémentaires (auxiliaires, accords de base, omission récurrente de 'que' de subordination), pénalise sans hésiter.

10. AUTORISATION ET ATTRIBUTION DE LA NOTE 0 (ZÉRO) :
   - La note de 0 (zéro) est parfaitement autorisée et réglementaire. Elle doit être obligatoirement attribuée pour tout critère ou tâche non réalisée ou dont la production est inexistante/totalement insuffisante (notamment en cas d'absence de débat, réponses en écho ou exposé < 3 minutes avéré).
   - Tu ne dois pas appliquer de "bienveillance artificielle" en attribuant une note supérieure à 0 par pitié si le candidat n'a pas fourni le travail requis.

⚠️ INTERDICTION ABSOLUE DES CORRECTIONS IDENTIQUES À L'ORIGINAL : Chaque entrée du tableau des erreurs (errorsTable) DOIT présenter une réelle différence et correction d'une erreur entre 'original' et 'correction'. Il est STRICTEMENT INTERDIT d'insérer une entrée où 'correction' est identique à 'original'.

═══════════════════════════════════════════
📊 TRIPLE CASCADE (ordre de rédaction du JSON)
═══════════════════════════════════════════
1. BROUILLON PHASE 1 — AUDIT LINGUISTIQUE ET COMMUNICATIF (brouillon_phase1_audit) :
   Tu DOIS obligatoirement structurer cet audit selon les 6 rubriques suivantes :
   - Morphosyntaxe orale spontanée & accords : [Décompte nominatif obligatoire : Formes verbales complexes correctes (subjonctif, conditionnel...) : X relevées et validées (⚠️ ATTENTION AUX FAUX SUBJONCTIFS ET FAUX CONDITIONNELS : « qu'ils veulent » est un indicatif et non un subjonctif ! « peut-être » ou « on peut » n'est pas un conditionnel ! Le futur simple n'est pas une forme verbale complexe) ; Phrases complexes avec pronoms relatifs composés (auquel, duquel...) : X relevés ; Relevé des accords, temps et structures]
   - Rections verbales & prépositions : [Relevé des régimes verbaux directs/indirects et prépositions à l'oral]
   - Cohésion, connecteurs oraux & transitions : [Décompte nominatif des connecteurs B2/C1 élaborés relevés (attention : les connecteurs élémentaires d'abord, ensuite, enfin, à mon avis, par exemple, mais, parce que ne comptent pas) ; Relevé des transitions]
   - Lexique oral & précision : [Relevé du vocabulaire, périphrases, anglicismes ou faux-amis à éliminer ; détection des recours récurrents à l'anglais]
   - Phonétique, prononciation & prosodie : [Relevé des seules erreurs de prononciation flagrantes qui rendent les mots inintelligibles, intonation ; ne pas pénaliser les simples hésitations ou bégaiements oraux]
   - Éléments réussis, argumentation & prise de risque : [Vérification de la présence d'exemples personnels vécus vs simple paraphrase des documents sources ; subjonctifs/conditionnels réussis, relances]

2. BROUILLON PHASE 2 — ANALYSE QUALITATIVE (brouillon_phase2_analyse) :
   Analyse qualitative synthétique structurée par critère officiel (${isB1 ? 'Entretien, Interaction, Monologue, Lexique, Morphosyntaxe, Phonologie' : 'Monologue, Interaction, Lexique, Morphosyntaxe, Phonologie'}).
   ⚠️ INTERDICTION ABSOLUE D'INCLURE DES FORMULES DE NOTATION DANS LES BROUILLONS : N'écris JAMAIS de formules telles que « Điểm đánh giá phù hợp : X », « Mức điểm : X », « Note : X/5 », « Décision : X » dans brouillon_phase2_analyse. L'analyse qualitative doit décrire les forces et faiblesses uniquement avec des mots descriptifs, sans chiffrer.

3. RESTE DU JSON (Consolidation) :
   - 'transcriptionCorrigee' : Reconstitution entièrement corrigée et fluide de la prestation du candidat.
   - 'criteriaScores' & 'globalScore' : Notes rigoureusement conformes aux descripteurs.
   - 'justifications' : Avec 1 à 2 citations orales exactes entre guillemets « ... ».
   - 'advices' : Conseils concrets et méthodes actionnables. DIAGNOSTIC PÉDAGOGIQUE DU TEXTE MÉMORISÉ : Si tu constates un fort contraste entre un exposé préparé correct et un débat où la production s'effondre (interaction = 0), formule expressément dans advices.interaction un diagnostic de préparation par mémorisation d'un texte rédigé et conseille un entraînement ciblé à la prise de parole spontanée sans notes rédigées en 3 temps (position, raison, exemple).
   - 'errorsTable' : Tableau exhaustif des erreurs linguistiques (sans phonétique API/IPA, sans pures hésitations orales, et parfaitement synchronisé avec transcriptionCorrigee).

🚫 RÈGLES DE RÉDACTION ET DE FORMATAGE (CRITIQUES) :
1. AUCUNE MENTION DE NOTE DANS AUCUN TEXTE (CRITIQUE) : Ne mentionne JAMAIS de notes chiffrées, de fractions, de barèmes ou de délibérations (comme "1.5/2", "3/5", "4/5", "5/5", "8/10", "15/25", "21/25", "décision : 2", "note de 1.8", "La note est donc de 3/5", "D'où une note de 3/5", "Ce qui justifie la note de 1/5") dans AUCUNE zone de texte libre (justifications, advices, brouillons). Tes justifications doivent se terminer directement sur ton analyse qualitative sans JAMAIS ajouter de phrase finale de conclusion rappelant ou chiffrant la note. Les notes sont uniquement renseignées dans les champs numériques dédiés (criteriaScores, globalScore) car elles peuvent être éditées par le correcteur humain.
2. PAS DE FORMATAGE MARKDOWN : N'utilise AUCUN caractère de formatage markdown (comme **, *, _, __, ###, etc.) dans les réponses textuelles (les justifications, les conseils/advices, ou les règles du tableau d'erreurs). Le PDF final n'interprète pas ces balises et afficherait des caractères bruts. Rédige tout en texte brut simple (sans astérisques ni balises de mise en forme).
${getRule3Instruction(language)}
4. INTERDICTION ABSOLUE DE L'ALPHABET PHONÉTIQUE (API/IPA) : N'insère JAMAIS de caractères ou symboles en alphabet phonétique international (API/IPA, ex: /fɛ/, /fɔ̃/, /ekʁem/) dans tout le document. Le tableau 'errorsTable' contient UNIQUEMENT les erreurs de grammaire, de conjugaison et de lexique. Les remarques sur la prononciation se font exclusivement en texte clair dans la justification du critère 'phonologie'.
${getPoliteFormInstruction(language)}
6. CONTENU DES BROUILLONS OBLIGATOIRE ET SANS NOTES CHIFFRÉES : Les champs 'brouillon_phase1_audit' et 'brouillon_phase2_analyse' doivent contenir ton véritable travail d'audit linguistique structuré et d'analyse qualitative sans aucune note chiffrée, ni fraction, ni jargon de double évaluation.
7. OBLIGATION STRICTE DES CRITÈRES DÉTAILLÉS SANS AUCUN CHAMP VIDE (CRITIQUE) : Tu DOIS obligatoirement et impérativement renseigner chacune des clés requises dans "criteriaScores", "justifications" ET "advices". Aucun critère ne doit être omis, fusionné, renommé ou laissé vide ("" ou null). Chaque critère doit obligatoirement comporter sa propre justification argumentée et substantielle (avec au moins 1 à 2 citations textuelles de la transcription entre guillemets) et ses propres conseils pédagogiques individualisés.

Tu DOIS impérativement retourner un objet JSON respectant STRICTEMENT la structure de premier niveau suivante :
{
  "studentEmail": string | null,
  "studentName": string | null,
  "transcription": string,
  "transcriptionCorrigee": string,
  "brouillon_phase1_audit": string,
  "brouillon_phase2_analyse": string,
  "globalScore": number,
  "criteriaScores": {
${criteriaJsonExample}
  },
  "justifications": {
${criteriaTextExample}
  },
  "advices": {
${criteriaTextExample}
  },
  "errorsTable": [
    {
      "original": string,
      "correction": string,
      "rule": string
    }
  ]
}
Tu dois fournir des explications textuelles riches et des conseils constructifs pour CHAQUE critère dans "justifications" et "advices". Ne laisse aucun champ vide.
Ne mets aucune balise markdown (comme le bloc de code json), ne mets aucune phrase d'introduction ni de conclusion, retourne uniquement le JSON.`;
}

export function buildSupervisorPrompt(level: string, language: string, notationType: 'detailed' | 'delf' = 'detailed'): string {
  const isB1 = level === 'B1';

  const notationRules = notationType === 'delf'
      ? `\n⚠️ ATTENTION - NOTATION STRICTE DELF POUR LA DOUBLE ÉVALUATION (OBLIGATOIRE) :
Tu es configuré en mode d'évaluation réglementaire DELF. Pour ta propre évaluation (Superviseur), tu dois obligatoirement attribuer uniquement les notes réglementaires autorisées pour chaque critère :
- Pour DELF B1 :
  * Les critères "entretien", "interaction", "monologue", "morphosyntaxe" et "phonologie" (sur 4) doivent être notés uniquement parmi : [0, 1, 2.5, 4]
  * Le critère "lexique" (sur 5) doit être noté uniquement parmi : [0, 1, 3, 5]
- Pour DELF B2 :
  * Tous les critères (sur 5) doivent être notés uniquement parmi : [0, 1, 3, 5]\n`
      : '';

  const supervisorCriteriaJsonExample = isB1
    ? `    "entretien": number,
    "interaction": number,
    "monologue": number,
    "lexique": number,
    "morphosyntaxe": number,
    "phonologie": number`
    : `    "monologue": number,
    "interaction": number,
    "lexique": number,
    "morphosyntaxe": number,
    "phonologie": number`;

  const supervisorCriteriaTextExample = isB1
    ? `    "entretien": string,
    "interaction": string,
    "monologue": string,
    "lexique": string,
    "morphosyntaxe": string,
    "phonologie": string`
    : `    "monologue": string,
    "interaction": string,
    "lexique": string,
    "morphosyntaxe": string,
    "phonologie": string`;

  return `Tu es la DOUBLE ÉVALUATION DELF ${level} pour l'épreuve de Production Orale.

═══════════════════════════════════════════
🌐 LANGUE DU RAPPORT OBLIGATOIRE
═══════════════════════════════════════════
${getLanguageInstruction(language)}
Toutes les explications, justifications, conseils, règles et brouillons DOIVENT IMPÉRATIVEMENT être rédigés dans cette langue demandée. Seules les citations directes et exemples en français tirés de la prestation de l'étudiant (entre guillemets « ... ») ainsi que 'original', 'correction' et 'transcriptionCorrigee' restent en français. Il est STRICTEMENT INTERDIT de rédiger le corps des explications en français si la langue demandée est le vietnamien ou une autre langue.

${notationRules}
Ta mission est de procéder à une double correction pour fiabiliser la notation.
Tu dois analyser la transcription orale de l'étudiant ET relire attentivement le rapport rédigé par le premier examinateur.

Tes tâches :
1. Évaluer la prestation orale de manière indépendante pour former ton propre jugement en effectuant un audit mot à mot structuré en 6 rubriques (Morphosyntaxe orale & accords, Rections verbales & prépositions, Cohésion & transitions orales, Lexique oral & précision, Phonétique/prononciation flagrante, Éléments réussis/prise de risque). Chercher notamment les fautes linguistiques ou faiblesses communicatives que le 1er examinateur aurait pu omettre.
2. Prendre connaissance de l'évaluation du premier examinateur fournie ci-dessous.
3. Rédige le rapport FINAL qui sera envoyé à l'étudiant.
   CONSERVER LA RICHESSE ET AMÉLIORER LE FEEDBACK (CRITIQUE) : En tant que double évaluateur (souvent doté de capacités de raisonnement "thinking" supérieures), tu dois apporter ta propre expertise pour rendre le rapport final le plus pertinent et pédagogique possible. Analyse le rapport du 1er examinateur. Si ses remarques ou citations d'exemples précis de l'étudiant sont exactes et pertinentes, réutilise-les, mais ne te limite pas à un simple copier-coller. Tu as le devoir d'AMÉLIORER, de REFORMULER, d'ENRICHIR et de CORRIGER ses justifications et ses conseils (advices) partout où tu juges que son analyse était trop superficielle, erronée ou manquait de profondeur. Adapte obligatoirement le contenu des commentaires à TES propres notes de superviseur (les justifications doivent concorder parfaitement avec les points que tu attribues et citer au moins 1 à 2 passages précis de la transcription entre guillemets). Rédige un rapport final unique et fluide, écrit dans ta propre voix, qui fusionne le meilleur de la première évaluation tout en y apportant tes analyses plus fines et tes conseils plus constructifs.
   ⚠️ TRADUCTION OBLIGATOIRE DANS LA LANGUE DU RAPPORT (${language === 'VN' ? 'Vietnamien' : language}) : Si le premier examinateur a rédigé tout ou partie de ses commentaires en français (ou dans une autre langue que ${language}), tu DOIS IMPÉRATIVEMENT TRADUIRE ET ADAPTER l'ensemble de ses analyses, justifications, conseils et règles dans la langue demandée (${language === 'VN' ? 'Vietnamien' : language}). Il est STRICTEMENT INTERDIT de recopier du texte en français dans les justifications, conseils ou règles d'erreurs si la langue demandée est ${language === 'VN' ? 'le vietnamien' : language} !
4. CONSOLIDATION, CORRECTION ET EXHAUSTIVITÉ DU TABLEAU D'ERREURS (errorsTable) ET DE transcriptionCorrigee :
   - Tu es le garant du tableau final consolidé des erreurs qui sera présenté dans le bilan.
   - Analyse attentivement le tableau du 1er examinateur : conserve ses entrées exactes et pertinentes, mais RECTIFIE ou SUPPRIME impérativement toute correction inexacte, fausse ou maladroite.
   - OBLIGATION D'EXHAUSTIVITÉ & REPORT DU BROUILLON : Toute anomalie, faute ou maladresse linguistique relevée dans ton brouillon d'audit ('brouillon_phase1_audit') DOIT obligatoirement et impérativement être reportée dans le tableau 'errorsTable'. Ne laisse aucune erreur du brouillon hors du tableau.
   - ⚠️ EXHAUSTIVITÉ DU RELEVÉ D'ERREURS & ANGLES MORTS FRÉQUENTS : Tu dois passer la transcription au peigne fin et ne pas t'arrêter après 10 ou 15 erreurs. Repère systématiquement :
     * Les omissions du « que » de subordination (« Je pense c'est... » -> « Je pense que c'est... », « il pose la question... c'est s'il faut ») ;
     * Les omissions du « si » conditionnel (« ils veulent ou non » -> « s'ils veulent ou non », « et ils veulent pas » -> « et s'ils ne veulent pas ») ;
     * Les prépositions temporelles de durée vs date : « dans X heures » pour exprimer une durée -> « pendant X heures » ;
     * Les prépositions de but erronées avec verbe : « des machines de moderniser » -> « pour moderniser », « un musée de préserver » -> « pour préserver » ;
     * Les prépositions superflues ou répétées après verbes : « pour de rencontrer » -> « pour rencontrer », « peuvent de participer » -> « peuvent participer », « comprendre de ce que » -> « comprendre ce que » ;
     * Les corrélations prépositionnelles fautives : « entre X avec Y » -> « entre X et Y » ;
     * Les faux-amis d'anglicisme lexical : « une place » ou « une location » pour désigner un « lieu / endroit » ; « rentrer » pour « rester » ;
     * L'usage d'adjectifs à la place de noms abstraits : « parler de pauvre » -> « parler de pauvreté », « découvrir une nouvelle culturelle » -> « une nouvelle culture », « leur traditionnelle » -> « leurs traditions » ;
     * Les erreurs de genre sur les noms masculins courants : « village » (ce village, un village), « musée » (un musée), « artisanat » (un grand artisanat), « choix » (un autre choix), « horizon » (un horizon) ; et féminins : « matière » (la matière) ;
     * Les contractions d'articles obligatoires après préposition (« pour vendre à les touristes » -> « aux touristes ») ;
     * Les registres familiers inadaptés à l'examen (« les trucs » -> « des éléments / des aspects », négations relâchées sans « ne » comme « Je sais pas » -> « Je ne sais pas ») ;
     * Les faux sujets / pronoms fantômes après groupe prépositionnel (« avec le Père Noël, il permet... » -> « cela permet... ») ;
     * Les prépositions et locutions temporelles/locatives fautives (« dans le matin » -> « le matin », « dans toute la vie » -> « pour toute la vie », « dans les cours » -> « en classe », « sur le texte » -> « dans le texte ») ;
     * Les verbes à l'infinitif après conjonctions temporelles ou sujets (« quand ils grandir » -> « quand ils grandissent », « ce que les habitants faire » -> « ce que les habitants font », « les entreprises prendre » -> « les entreprises peuvent prendre ») ;
     * Les structures de but avec deux sujets différents (« pour les enfants pour être sages » -> « pour que les enfants soient sages ») ;
     * Les confusions lexicales et rections (« le passage avec la réalité » -> « à la réalité », « dépendre à » -> « dépendre de », « discuter le sujet » -> « discuter du sujet », « faire plaisir les visiteurs » -> « faire plaisir aux visiteurs », « travailler d'autres emplois » -> « occuper d'autres emplois », « les expliquer » -> « leur expliquer »).
   - ⚠️ SILENCE ET PURGE DES FAUSSES ERREURS (ZÉRO POLÉMIQUE NI MÉTA-DÉBAT DANS errorsTable ET JUSTIFICATIONS) :
     Si le premier examinateur a relevé à tort une pseudo-erreur sur une tournure parfaitement licite, ou s'il s'est trompé dans sa règle, SUPPRIME SILENCIEUSEMENT cette entrée de errorsTable.
     Il est STRICTEMENT INTERDIT d'insérer dans errorsTable ou dans les justifications des commentaires défensifs, méta-discursifs ou réfutant l'évaluation précédente (ex: « Ce n'est pas une faute », « L'omission de virgule ne constitue pas une erreur », « Ce mot est tout à fait correct », « Il convient de distinguer... »).
     L'étudiant ne lit que TON rapport et n'a jamais vu le premier rapport : de telles mentions lui seraient totalement incompréhensibles et déroutantes ! errorsTable ne doit contenir QUE de réelles erreurs linguistiques commises par l'étudiant avec leur correction directe.
   - ⚠️ ACCORDS ÉLÉMENTAIRES ET IDENTITÉ DU LOCUTEUR :
     Vérifie scrupuleusement les accords grammaticaux élémentaires (sujet-verbe, nom-adjectif), y compris l'accord de genre lorsque le locuteur ou le candidat s'identifie clairement ou est identifié dans la transcription/consigne.
   - ⚠️ ÉLÉGANCE ET NON-RÉPÉTITION DANS LES CORRECTIONS PROPOSÉES :
     Veille à ce que les corrections proposées soient élégantes et idiomatiques. Évite de répéter lourdement la même formule ou le même syntagme dans deux phrases successives.
   - ⚠️ PARITÉ OBLIGATOIRE JUSTIFICATIONS / TABLEAU D'ERREURS : Tout mot ou tour critiqué ou cité comme fautif dans les justifications ou les brouillons (par exemple le mot familier « les trucs » ou l'anglicisme « skipper ») DOIT OBLIGATOIREMENT faire l'objet d'une ligne d'erreur dans 'errorsTable'.
   - EXCLUSION DES AUTOREPRISES, AUTOCORRECTIONS ET BÉGAIEMENTS ORAUX SANS FAUTE : Le tableau 'errorsTable' ne doit contenir QUE des erreurs linguistiques (grammaire, syntaxe, lexique). Ne consigne JAMAIS de simples bégaiements syllabiques, répétitions de mots ou hésitations orales qui ne comportent aucune faute de langue (ex: « le fait qu'un le fait qu'une machine », « finance finance finance », « Euh Et mais mais »). De même, si le candidat trébuche sur un chiffre ou un mot et se reprend immédiatement (ex: « environ 1/6 1/600 » pour « 1/600 », « dans 8 à dans 5 heures » pour « cinq heures », « pour de préver- préserver »), il s'agit d'une simple autocorrection orale spontanée : INTERDICTION FORMELLE de la consigner comme une erreur dans 'errorsTable'.
   - ⚠️ INTERDICTION DES RECONSTRUCTIONS SPÉCULATIVES SUR PASSAGES OBSCURS OU INAUDIBLES : Si une expression est inintelligible, confuse ou inaudible (ex: « après votre tête », « voir les eaux »), il est STRICTEMENT INTERDIT d'inventer des mots ou de deviner ce que l'élève aurait pu vouloir dire (comme inventer « au pied du sapin » ou « au pied du lit », « observer comme au zoo »). Conserve le passage non reconstitué en le signalant expressément entre crochets : « [locution incompréhensible, non reconstituée : « ... »] ». De même pour un syntagme inachevé (« par exemple les droits... ») : qualifie l'erreur de syntagme inachevé dans rule et n'invente pas la fin.
   - ⚠️ INTERDICTION STRICTE DU LISSAGE SÉMANTIQUE ET DE L'EMBELLISSEMENT (RESPECT DES MÉTAPHORES DU CANDIDAT) : Ne maquille JAMAIS un effondrement ou un propos fautif en un registre diplomate ou soutenu. Si le candidat dit « je dois pas répondre », ne le réécris JAMAIS en « Je préfère ne pas répondre, monsieur ». Si le candidat dit « une machine de gagner d'argent », corrige uniquement la grammaire (« une machine à gagner de l'argent »), sans remplacer son image par un terme neutre (« un moyen de gagner de l'argent »). Ne rajoute pas non plus de mots superflus à une formulation correcte (ex: ne change pas « cette façon » en « cette façon de faire »). La correction doit être STRICTEMENT LITTÉRALE ET MINIMALE sur la grammaire/syntaxe.
   - ⚠️ AUCUNE SUPPRESSION SILENCIEUSE D'ÉNONCÉ : Ne supprime JAMAIS une phrase prononcée par le candidat sous prétexte qu'elle est bancale ou confuse (ex: « c'est bon pour peur », « On ne peut pas dire les mentirs mauvais »). Tout énoncé doit figurer dans transcriptionCorrigee avec sa correction grammaticale stricte et dans errorsTable.
   - ⚠️ RESPECT STRICT DE LA POLARITÉ (NÉGATIVE / AFFIRMATIVE) : Veille à ce que la polarité soit rigoureusement identique entre errorsTable et transcriptionCorrigee. Si l'original est « ils n'est très bavards », la correction doit être « ils ne sont pas très bavards » (négative) dans errorsTable ET dans transcriptionCorrigee, et JAMAIS inversée en affirmation (« s'ils sont très bavards »).
   - ⚠️ PARFAITE SYNCHRONISATION AVEC transcriptionCorrigee (ZÉRO CORRECTION SILENCIEUSE) : Toute faute corrigée dans transcriptionCorrigee DOIT impérativement figurer dans errorsTable, et chaque entrée de errorsTable doit être appliquée dans transcriptionCorrigee.
   - ⚠️ PURETÉ LINGUISTIQUE (100% FRANÇAIS DANS transcriptionCorrigee ET DANS errorsTable.correction) : Le texte de 'transcriptionCorrigee' et chaque valeur 'correction' de errorsTable doivent être INTÉGRALEMENT et EXCLUSIVEMENT en français. Même si le rapport d'évaluation est rédigé en vietnamien, aucun mot d'une autre langue (comme les conjonctions vietnamiennes « và », « hoặc », « nhưng », « avec/với », « của », « cho », « trong », « về », « ở », « tại ») ne doit s'y infiltrer.
   - INTERDICTION STRICTE DU TABLEAU VIDE : Si la transcription contient des erreurs linguistiques ou si le 1er examinateur en a relevé, il est STRICTEMENT INTERDIT de renvoyer un tableau errorsTable vide []. Tu DOIS impérativement fournir le tableau consolidé complet reprenant les erreurs valides et y intégrant tes nouvelles découvertes.
   - EXCLUSION DE LA PHONOLOGIE ET DE L'ALPHABET PHONÉTIQUE (API/IPA) : Le tableau 'errorsTable' est réservé EXCLUSIVEMENT aux erreurs linguistiques (grammaire, lexique, syntaxe). N'y insère aucun défaut de prononciation ni aucune transcription en alphabet phonétique (API/IPA).
   - Chaque entrée de 'errorsTable' doit comporter uniquement : 'original', 'correction', 'rule' (explication linguistique rigoureuse).
   - Interdiction absolue d'insérer des entrées où 'correction' est identique à 'original'.
5. INDÉPENDANCE DE JUGEMENT ET COHÉRENCE STRICTE DES NOTES (LUTTE CONTRE LE BIAIS D'ANCRAGE) :
   - Tu dois attribuer TES PROPRES NOTES pour chaque critère de manière rigoureuse et indépendante. Ne t'aligne pas aveuglément sur les notes du premier examinateur.
   - COHÉRENCE ABSOLUE ENTRE NOTE ET JUSTIFICATION : Si le 1er examinateur a commis une contradiction interne (par exemple attribuer une note minimale alors que la transcription démontre un niveau supérieur, ou inversement attribuer des points à une interaction effondrée), tu DOIS rectifier la note pour qu'elle corresponde exactement au niveau réel de la prestation.
   - ⚖️ PRINCIPE DU NON-CUMUL DES SANCTIONS (CLOISONNEMENT STRICT DES CRITÈRES CECRL) :
     Il est formellement interdit de pénaliser plusieurs fois le même fait linguistique à travers différents critères :
     * Le critère Monologue (Tâche 1) évalue EXCLUSIVEMENT la capacité à dégager une problématique, structurer l'exposé en plusieurs parties distinctes (introduction, développement, conclusion), argumenter avec des exemples et employer des connecteurs logiques. Tu ne dois EN AUCUN CAS abaisser la note de Monologue à cause des hésitations orales, répétitions ou tics de langage (« euh ») (qui relèvent EXCLUSIVEMENT de la Phonologie / Aisance orale), ni à cause d'erreurs de grammaire ou de conjugaison (qui relèvent EXCLUSIVEMENT de la Morphosyntaxe), tant que le propos reste compréhensible.
     * Si l'apprenant dégage une problématique claire, pose un plan avec des connecteurs variés et apporte des arguments concrets avec contre-arguments spontanés, il atteint au moins le niveau acquis/intermédiaire (ex: 3/5 en B2), même si son élocution est heurtée ou sa grammaire fautive.
     * MORPHOSYNTAXE : Les erreurs de genre des noms, les accords, les déterminants, les prépositions, les rections verbales et les formes verbales sont des erreurs MORPHOSYNTAXIQUES. Elles doivent être évaluées uniquement dans la Morphosyntaxe, JAMAIS dans le Lexique.
     * LEXIQUE : Évalue uniquement la variété du vocabulaire, la précision des termes, les impropriétés lexicales, les contresens et les expressions inventées (code-switching non assumé). Ne compte jamais deux fois les erreurs grammaticales sous prétexte de lexique.
6. AUTORITÉ DE TES NOTES : En tant que second examinateur (superviseur), ce sont TES scores et tes appréciations qui sont retenus et font autorité pour le rapport officiel final. L'application conserve les deux évaluations pour permettre au correcteur de comparer les notes et analyses.
7. Attribution de la note 0 (zéro) : La note de 0 (zéro) est parfaitement valide et doit être maintenue ou attribuée pour tout critère ou tâche non réalisée ou totalement insuffisante. Ne pas attribuer de note supérieure à 0 par "bienveillance artificielle" si le candidat n'a pas répondu ou n'a pas interagi (ex. aucune réponse dans la section interaction, répétition en écho de questions, ).
8. LUTTE CONTRE LE BIAIS DE TENDANCE CENTRALE (RIGOUREUX) : Ne suis pas aveuglément les notes de l'évaluateur 1 s'il a attribué des notes moyennes par défaut alors que la performance était insuffisante. Valide ou ajuste ses scores en te basant de façon stricte sur les descripteurs de performance :
   - Entretien dirigé (B1) : Si le candidat a besoin de multiples reformulations de questions basiques et répond par des énoncés très courts ou des mots uniques (ou utilise l'anglais / code-switching), sa note de tâche doit être ramenée à 1 ou 0.
   - Monologue (B1/B2) : Évalue strictement ce qui est produit pendant la phase d'exposé continu. Ne prends pas en compte les réponses ou arguments apportés uniquement lors du débat. Si le thème n'est pas dégagé ou si le candidat fait un hors-sujet majeur en introduction, sa note de Monologue doit être de 1.
   - Débat / Interaction (B1/B2) : Vérifie d'abord si la règle éliminatoire de note 0 s'applique (incapacité totale à interagir, silence complet ou uniquement des questions en écho sur l'ensemble des questions). Si le candidat formule ne serait-ce qu'une ou deux réponses sur le fond avant d'échouer ou de demander à passer, la note 0 est exclue et une note partielle (1/5 en B2 ou 1/4 en B1) doit être attribuée.
   - Lexique (B1/B2) : En cas de recours récurrent (≥ 2 occurrences distinctes en langue étrangère) ou de mots inexistants/inventés par indisponibilité de vocabulaire, la note doit être de 1 (ou 2 en B1). ATTENTION : Un mot d'anglais ou anglicisme isolé unique ne déclenche PAS le plafonnement strict à 1/5.
   - Morphosyntaxe (B1/B2) : Si les erreurs touchent les structures élémentaires (auxiliaires, accords de base, omission récurrente de 'que' de subordination), pénalise sans hésiter.

🚫 RÈGLES DE RÉDACTION ET DE FORMATAGE (CRITIQUES) :
1. AUCUNE MENTION DE NOTE DANS AUCUN TEXTE (CRITIQUE) : Ne mentionne JAMAIS de notes chiffrées, de fractions ou de délibérations (comme "1.5/2", "3/5", "4/5", "5/5", "8/10", "15/25", "21/25", "décision : 2", "note de 1.8") dans AUCUNE zone de texte libre (justifications, advices, brouillons). Les notes sont uniquement renseignées dans les champs numériques dédiés (criteriaScores, globalScore) car elles peuvent être éditées par le correcteur humain.
2. PAS DE FORMATAGE MARKDOWN NI LIENS HYPERTEXTES : N'utilise AUCUN caractère de formatage markdown (comme **, *, _, __, ###, etc.) ni AUCUN lien hypertexte ou URL (comme [texte](url) ou https://...) dans les justifications, conseils/advices, brouillons ou règles du tableau d'erreurs. Tout lien web ou balise markdown est formellement banni. Rédige en texte brut simple sans astérisques ni liens.
${getRule3Instruction(language)}
4. INTERDICTION ABSOLUE DE L'ALPHABET PHONÉTIQUE (API/IPA) : N'insère jamais d'alphabet phonétique international (API/IPA, ex: /fɛ/, /fɔ̃/, /ekʁem/) dans les justifications, advices, brouillons ou errorsTable.rule. Rédige en texte clair.
${getPoliteFormInstruction(language)}
6. CONTENU DES BROUILLONS OBLIGATOIRE ET SANS NOTES CHIFFRÉES : Les champs 'brouillon_phase1_audit' et 'brouillon_phase2_analyse' doivent être obligatoirement rédigés dans la langue du rapport (${language === 'VN' ? 'Vietnamien' : language === 'FR' ? 'Français' : language}) et contenir ton véritable travail d'audit linguistique structuré et d'analyse qualitative de la production orale, SANS AUCUNE mention de note chiffrée (n'écris jamais « Điểm đánh giá phù hợp : X », « Mức điểm : X », « Note : X/5 »).
7. OBLIGATION STRICTE DES CRITÈRES SANS AUCUN CHAMP VIDE : Tu DOIS obligatoirement renseigner chacune des clés requises dans "criteriaScores", "justifications" ET "advices". Aucun champ ne doit être laissé vide ("" ou null ou {}), chaque justification doit citer au moins 1 à 2 extraits précis de la transcription entre guillemets, et chaque critère doit obligatoirement comporter des conseils pédagogiques constructifs et personnalisés dans "advices".

Tu DOIS impérativement retourner un objet JSON respectant STRICTEMENT la structure de premier niveau suivante :
{
  "studentEmail": string | null,
  "studentName": string | null,
  "transcription": string,
  "transcriptionCorrigee": string,
  "brouillon_phase1_audit": string,
  "brouillon_phase2_analyse": string,
  "globalScore": number,
  "criteriaScores": {
${supervisorCriteriaJsonExample}
  },
  "justifications": {
${supervisorCriteriaTextExample}
  },
  "advices": {
${supervisorCriteriaTextExample}
  },
  "errorsTable": [
    {
      "original": string,
      "correction": string,
      "rule": string
    }
  ]
}
Tu dois fournir des explications textuelles riches et des conseils constructifs pour CHAQUE critère dans "justifications" et "advices". Ne laisse aucun champ vide.
Ne mets aucune balise markdown (comme \`\`\`json ou \`\`\`), ne mets aucune phrase d'introduction ni de conclusion, retourne uniquement le JSON.`;
}

/**
 * Compte uniquement les mots prononcés par le candidat.
 * Ignore les interventions des examinateurs, les étiquettes de locuteurs ("Candidat :", "Examinateur :")
 * et les annotations non-verbales entre crochets (ex: [soupir], [toux]).
 */
export function countCandidateWords(text: string): number {
  if (!text) return 0;
  
  // Si le texte ne contient pas "Candidat :", on compte tous les mots (fallback)
  if (!text.includes("Candidat :") && !text.includes("Candidat:")) {
    const cleaned = text.replace(/\[[^\]]*\]/g, "");
    return cleaned.trim().split(/\s+/).filter(Boolean).length;
  }

  const lines = text.split("\n");
  let candidateText = "";
  let currentSpeaker: "candidat" | "other" | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(Candidat)\s*:/i.test(trimmed)) {
      currentSpeaker = "candidat";
      candidateText += " " + trimmed.replace(/^(Candidat)\s*:/i, "");
    } else if (/^(Examinateur|Examinateur\s*\d+|Jury|Jury\s*\d+|Professeur)\s*:/i.test(trimmed)) {
      currentSpeaker = "other";
    } else {
      if (currentSpeaker === "candidat") {
        candidateText += " " + trimmed;
      }
    }
  }

  const cleanedText = candidateText.replace(/\[[^\]]*\]/g, "");
  return cleanedText.trim().split(/\s+/).filter(Boolean).length;
}

export function buildEvalUserPrompt(subject: string, studentTranscription: string, language: string = 'FR'): string {
  const wordCount = countCandidateWords(studentTranscription);
  let reminder = "";
  let langHeader = "";
  if (language === 'FR') {
    langHeader = `[LANGUE REQUISE POUR LE RAPPORT : FRANÇAIS (FR)]`;
    reminder = `⚠️ RAPPEL D'ORTHOGRAPHE CRITIQUE : Tu dois obligatoirement rédiger TOUTES les sections textuelles du JSON (justifications, conseils/advices, brouillons, errorsTable.rule) en français correct en utilisant impérativement tous les accents de la langue française (é, è, à, â, ê, î, ô, û, ç, etc.). Ne supprime ou n'omets aucun accent. L'absence d'accents est strictement interdite.`;
  } else if (language === 'VN') {
    langHeader = `[LANGUE REQUISE POUR LE RAPPORT : VIETNAMIEN (TIẾNG VIỆT)]\n⚠️ ATTENTION : Tu DOIS obligatoirement rédiger l'évaluation en VIETNAMIEN (justifications, conseils/advices, brouillons, errorsTable.rule). Il est STRICTEMENT INTERDIT de rédiger ces parties en français. Seuls 'transcriptionCorrigee' et les citations de l'élève restent en français.`;
    reminder = `⚠️ RAPPEL DE LANGUE CRITIQUE : Tu dois obligatoirement rédiger TOUTES les sections textuelles du JSON (justifications, conseils/advices, brouillons, errorsTable.rule) en VIETNAMIEN avec tous les accents, tons et signes diacritiques (tiếng Việt có dấu). Il est STRICTEMENT INTERDIT de rédiger ces sections en français.`;
  } else if (language === 'TW') {
    langHeader = `[LANGUE REQUISE POUR LE RAPPORT : CHINOIS TRADITIONNEL (繁體中文)]`;
    reminder = `⚠️ RAPPEL DE FORMAT CRITIQUE : Tu dois obligatoirement rédiger TOUTES les sections textuelles du JSON (justifications, conseils/advices, brouillons, errorsTable.rule) en chinois traditionnel (繁體中文) tel qu'utilisé à Taïwan. L'usage de caractères simplifiés est strictement interdit.`;
  } else if (language === 'EN') {
    langHeader = `[LANGUE REQUISE POUR LE RAPPORT : ANGLAIS (ENGLISH)]`;
    reminder = `⚠️ RAPPEL DE FORMAT CRITIQUE : Tu dois obligatoirement rédiger TOUTES les sections textuelles du JSON (justifications, conseils/advices, brouillons, errorsTable.rule) en anglais (English).`;
  } else {
    langHeader = `[LANGUE REQUISE POUR LE RAPPORT : TCHÈQUE (ČEŠTINA)]`;
    reminder = `⚠️ RAPPEL DE FORMAT CRITIQUE : Tu dois obligatoirement rédiger TOUTES les sections textuelles du JSON (justifications, conseils/advices, brouillons, errorsTable.rule) en tchèque en utilisant correctement tous les accents et signes diacritiques (čeština s diakritikou).`;
  }
  return `${langHeader}\n\nSujet : "${subject}"\nTranscription de la production orale du candidat : "${studentTranscription}"\n\n[INFO] Nombre de mots approximatif du candidat : ${wordCount} mots.\n\nAnalyse cette production orale et complète la grille d'évaluation.\n\n${reminder}`;
}

/**
 * Nettoie une évaluation pour l'intégration dans un prompt LLM (supervision / arbitrage).
 * Supprime la transcription répétée et les métadonnées internes (_comparison, _arbiterNotes)
 * pour économiser des milliers de tokens et éviter toute confusion ou troncature par l'IA.
 */
export function cleanEvalForPrompt(evalObj: any): any {
  if (!evalObj) return {};
  const copy: any = { ...evalObj };
  // Garantir que le champ transcription est toujours présent (pour le schéma JSON)
  if (!copy.transcription) copy.transcription = "";
  delete copy._comparison;
  delete copy._arbiterNotes;
  if (copy.studentEmail === null || copy.studentEmail === undefined) delete copy.studentEmail;
  if (copy.studentName === null || copy.studentName === undefined) delete copy.studentName;
  return copy;
}

export function buildSupervisorUserPrompt(subject: string, studentTranscription: string, result1: CorrectionResult, language: string = 'FR'): string {
  const wordCount = countCandidateWords(studentTranscription);
  let reminder = "";
  let langHeader = "";
  if (language === 'FR') {
    langHeader = `[LANGUE REQUISE POUR LE RAPPORT FINAL : FRANÇAIS (FR)]`;
    reminder = `⚠️ RAPPEL D'ORTHOGRAPHE CRITIQUE : Tu dois obligatoirement rédiger TOUTES les sections textuelles du JSON (justifications, conseils/advices, brouillons, errorsTable.rule) en français correct avec tous les accents.`;
  } else if (language === 'VN') {
    langHeader = `[LANGUE REQUISE POUR LE RAPPORT FINAL : VIETNAMIEN (TIẾNG VIỆT)]\n⚠️ ATTENTION : Même si le 1er examinateur a rédigé en français ou a fait des erreurs de langue, TON rapport final de superviseur DOIT être rédigé en VIETNAMIEN (justifications, conseils/advices, brouillons, errorsTable.rule). Il est STRICTEMENT INTERDIT de rédiger en français.`;
    reminder = `⚠️ RAPPEL DE LANGUE CRITIQUE : Rédige TOUT le rapport de supervision en VIETNAMIEN avec tous les accents et tons. Ne laisse aucune justification en français.`;
  } else if (language === 'TW') {
    langHeader = `[LANGUE REQUISE POUR LE RAPPORT FINAL : CHINOIS TRADITIONNEL (繁體中文)]`;
    reminder = `⚠️ RAPPEL CRITIQUE : Tu dois rédiger le rapport en chinois traditionnel (繁體中文) tel qu'utilisé à Taïwan. L'usage de caractères simplifiés est strictement interdit.`;
  } else if (language === 'EN') {
    langHeader = `[LANGUE REQUISE POUR LE RAPPORT FINAL : ANGLAIS (ENGLISH)]`;
    reminder = `⚠️ RAPPEL CRITIQUE : Tu dois rédiger le rapport en anglais (English).`;
  } else {
    langHeader = `[LANGUE REQUISE POUR LE RAPPORT FINAL : TCHÈQUE (ČEŠTINA)]`;
    reminder = `⚠️ RAPPEL CRITIQUE : Tu dois rédiger le rapport en tchèque en utilisant correctement tous les accents et diacritiques de la langue tchèque.`;
  }
  const cleanResult1 = cleanEvalForPrompt(result1);
  return `${langHeader}\n\nSujet : "${subject}"\nTranscription du candidat : "\n${studentTranscription}\n"\n\n[INFO] Nombre de mots approximatif du candidat : ${wordCount} mots.\n\n=== RAPPORT DU 1er EXAMINATEUR ===\n${JSON.stringify(cleanResult1, null, 2)}\n\nValide ou ajuste cette évaluation.\n\n${reminder}`;
}


/**
 * Nettoie le tableau des erreurs de toute entrée invalide :
 * - Entrées nulles / non-objets / sans champ original ou correction
 * - Entrées où 'original' et 'correction' sont identiques (inutilisables pour l'élève)
 * - Doublons stricts
 */
export function cleanErrorsTable(errorsTable: any[]): any[] {
  if (!Array.isArray(errorsTable)) return [];
  const cleanedList: any[] = [];
  for (const err of errorsTable) {
    if (!err || typeof err !== 'object') continue;
    const orig = (err.original || '').trim();
    const corr = (err.correction || '').trim();
    if (!orig || !corr) continue;
    if (orig.toLowerCase() === corr.toLowerCase()) continue;

    // Filtre des pures autoreprises / bégaiements oraux sans faute linguistique
    // Ex: "le fait qu'un le fait qu'une machine", "finance finance finance", "Euh Et mais mais"
    const normalizeDisfluencies = (s: string) => 
      s.toLowerCase()
       .replace(/\b(?:euh|hum|bah|ben|ah)\b/gi, '')
       .replace(/\b(\w+(?:\s+\w+)?)(?:\s+\1)+\b/gi, '$1') // élimine les répétitions de mots ou syntagmes identiques consécutifs
       .replace(/[^a-zà-ÿ0-9]/gi, ' ')
       .replace(/\s+/g, ' ')
       .trim();

    if (normalizeDisfluencies(orig) === normalizeDisfluencies(corr)) {
      // Simple hésitation / répétition orale sans valeur d'erreur grammaticale ou lexicale
      continue;
    }

    // Filtre des faux départs / lapsus d'autocorrection orale immédiate
    // 1. Règle explicitant une simple autocorrection/hésitation orale sans faute
    if (/\b(?:autocorrection|auto-correction|faux[ -]départ|lapsus oral|bégaiement oral)\b/i.test(err.rule || '')) {
      continue;
    }

    // 2. Faux départs de mots tronqués avec tiret ou bégaiement (ex: "préver- préserver" -> "préserver")
    const isTruncatedSlip = /^\w+-?\s+(\w+)$/i.exec(orig);
    if (isTruncatedSlip && isTruncatedSlip[1].toLowerCase() === corr.toLowerCase()) {
      continue;
    }

    // 3. Faux départs numériques (ex: "environ 1/6 1/600" -> "environ 1/600", "1/6 1/600" -> "1/600")
    const origNumberFixed = orig.replace(/\b(\d+(?:[\/\.]\d+)?)\s+(\d+(?:[\/\.]\d+)?)\b/, '$2');
    if (origNumberFixed.toLowerCase() === corr.toLowerCase()) {
      continue;
    }

    // Nettoie les répétitions orales immédiates dans 'orig' (ex: "ils ont besoin ont besoin de de temps" -> "ils ont besoin de temps")
    let sanitizedOrig = orig
      .replace(/\b(\w+(?:\s+\w+)?)(?:\s+\1)+\b/gi, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    if (!sanitizedOrig) sanitizedOrig = orig;

    const isDuplicate = cleanedList.some(
      existing => existing.original.toLowerCase() === sanitizedOrig.toLowerCase() && existing.correction.toLowerCase() === corr.toLowerCase()
    );
    if (!isDuplicate) {
      const cleanedRule = cleanErrorRuleField(err.rule || '');
      // Filtrer les entrées méta-défensives qui réfutent une fausse erreur du 1er correcteur
      const isMetaDefensive = /^(?:(?:L'|l')absence de|(?:L'|l')omission de|(?:La|la) présence de|(?:Le|le) recours à|Employer|Utiliser|Ce verbe|Cette tournure|Cette expression|Cette virgule|Ce mot|Cette phrase)?\s*[^.:;]*(?:ne constitue pas|ne représente pas|n'est pas(?:, en lui-même,)? (?:une faute|une erreur|un verbe incorrect|incorrect)|n'est pas fauti(?:f|ve)|doivent être distingué|ne doit pas être confondu)/i.test(cleanedRule);
      if (!isMetaDefensive) {
        cleanedList.push({
          original: sanitizedOrig,
          correction: corr,
          rule: cleanedRule
        });
      }
    }
  }
  return cleanedList;
}

export function sanitizeScores(
  result: CorrectionResult, 
  level?: string, 
  notationType?: 'detailed' | 'delf'
): CorrectionResult {
  if (!result || typeof result !== 'object') {
    result = {} as any;
  }

  if (!result.criteriaScores) {
    if ((result as any).criteria_scores) {
      result.criteriaScores = (result as any).criteria_scores;
    } else if ((result as any).scores) {
      result.criteriaScores = (result as any).scores;
    } else {
      result.criteriaScores = {} as any;
    }
  }

  const cs: any = result.criteriaScores || {};
  const normalizeKey = (aliases: string[], defaultVal = 0): number => {
    for (const key of Object.keys(cs)) {
      const lower = key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
      for (const alias of aliases) {
        if (lower.includes(alias)) {
          return Number(cs[key]) || 0;
        }
      }
    }
    return defaultVal;
  };

  const isB1 = level === 'B1';

  const clampScore = (score: number, max: number) => {
    const clamped = Math.min(max, Math.max(0, score));
    return Math.round(clamped * 10) / 10;
  };

  let monologue = cs.monologue !== undefined ? Number(cs.monologue) || 0 : normalizeKey(['monologue', 'expose']);
  let interaction = cs.interaction !== undefined ? Number(cs.interaction) || 0 : normalizeKey(['interaction', 'debat']);
  let entretien = cs.entretien !== undefined ? Number(cs.entretien) || 0 : normalizeKey(['entretien']);
  let lexique = cs.lexique !== undefined ? Number(cs.lexique) || 0 : normalizeKey(['lexique', 'vocabulaire']);
  let morphosyntaxe = cs.morphosyntaxe !== undefined ? Number(cs.morphosyntaxe) || 0 : normalizeKey(['morphosyntaxe', 'grammaire', 'syntaxe']);
  let phonologie = cs.phonologie !== undefined ? Number(cs.phonologie) || 0 : normalizeKey(['phonologie', 'prononciation']);

  if (isB1) {
    monologue = clampScore(monologue, 4);
    interaction = clampScore(interaction, 4);
    entretien = clampScore(entretien, 4);
    lexique = clampScore(lexique, 5);
    morphosyntaxe = clampScore(morphosyntaxe, 4);
    phonologie = clampScore(phonologie, 4);
  } else {
    monologue = clampScore(monologue, 5);
    interaction = clampScore(interaction, 5);
    lexique = clampScore(lexique, 5);
    morphosyntaxe = clampScore(morphosyntaxe, 5);
    phonologie = clampScore(phonologie, 5);

    // B2 : si effondrement interaction/monologue, plafonner lexique & morphosyntaxe
    if (monologue === 0 || interaction === 0) {
      lexique = Math.min(lexique, 2.5);
      morphosyntaxe = Math.min(morphosyntaxe, 2.5);
    }
  }

  result.criteriaScores = {
    monologue,
    interaction,
    ...(isB1 ? { entretien } : {}),
    lexique,
    morphosyntaxe,
    phonologie
  } as any;

  if (notationType === 'delf' && level) {
    for (const key of Object.keys(result.criteriaScores)) {
      result.criteriaScores[key] = roundToDelfScore(Number(result.criteriaScores[key]) || 0, level, key);
    }
  }
  result.globalScore = Math.round(Object.values(result.criteriaScores).reduce((a, b: any) => a + (Number(b) || 0), 0) * 10) / 10;

  if (result.errorsTable) {
    result.errorsTable = cleanErrorsTable(result.errorsTable);
  } else {
    result.errorsTable = [];
  }

  if (!result.justifications || typeof result.justifications !== 'object') result.justifications = {} as any;
  if (!result.advices || typeof result.advices !== 'object') result.advices = {} as any;

  if (result.brouillon_phase1_audit) result.brouillon_phase1_audit = cleanJuryComment(result.brouillon_phase1_audit);
  if (result.brouillon_phase2_analyse) result.brouillon_phase2_analyse = cleanJuryComment(result.brouillon_phase2_analyse);

  for (const k of Object.keys(result.justifications)) {
    if (!k || !k.trim()) {
      delete (result.justifications as any)[k];
      continue;
    }
    if (typeof (result.justifications as any)[k] === 'string') {
      (result.justifications as any)[k] = cleanJuryComment((result.justifications as any)[k]);
    }
  }
  for (const k of Object.keys(result.advices)) {
    if (!k || !k.trim()) {
      delete (result.advices as any)[k];
      continue;
    }
    if (typeof (result.advices as any)[k] === 'string') {
      (result.advices as any)[k] = cleanJuryComment((result.advices as any)[k]);
    }
  }
  if (result.criteriaScores) {
    for (const k of Object.keys(result.criteriaScores)) {
      if (!k || !k.trim()) {
        delete (result.criteriaScores as any)[k];
      }
    }
  }
  return result;
}

/**
 * Nettoie un commentaire (justification, conseil ou brouillon) des allusions aux coulisses
 * de la double évaluation et des citations de notes chiffrées qui auraient pu échapper aux consignes :
 * - mentions d'ajustement de note ("Note ajustée à X car…")
 * - allusions à un autre correcteur ("Contrairement au premier examinateur, …", "double évaluation")
 * - citations de notes chiffrées explicites ("Décision : 5/5", "(Note : 21/25)", "21 / 25", "1.5/2", "8/10")
 */
export function cleanJuryComment(comment: string): string {
  if (!comment || typeof comment !== 'string') return comment;
  let cleaned = comment;

  // 0. Suppression des liens Markdown [texte](url) et URLs web
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
  cleaned = cleaned.replace(/https?:\/\/[^\s\)\],]+/gi, '');

  // 0b. Suppression des phrases méta-défensives polémiques réfutant une erreur supposée du 1er correcteur
  cleaned = cleaned.replace(/(?:(?:L'|l')absence de [^.]+ ne constitue pas(?:, à elle seule,)? une faute\.|[^.]*ne constitue pas(?:, à elle seule,)? une faute\.|[^.]*n'est pas(?:, en lui-même,)? (?:un verbe )?incorrect\.|[^.]*doivent être distinguées dans l'évaluation\.)/gi, '');

  // 1. Préfixe "Note ajustée/modifiée/… (à X) (au lieu de Y) car/…" ou "Évaluation 1 :"
  const notePattern = /^\s*\*?\*?\s*(?:Note\s+(?:ajustée|ajustee|réévaluée|reevaluee|augmentée|augmentee|rehaussée|rehaussee|diminuée|diminuee|abaissée|abaissee|corrigée|corrigee|modifiée|modifiee|validée|validee|maintenue|maintenu)|Évaluation\s*[1-3]|Évaluateur\s*[1-3])\b[^.:]*?(?:\bcar\b|\bparce que\b|[:–\-.])\s*/i;
  cleaned = cleaned.replace(notePattern, '');

  // 2. Proposition d'ouverture (jusqu'à la 1re virgule) faisant allusion à un autre correcteur / double évaluation
  const refPattern = /^(?=[^,.]*(?:examinateur|correcteur|évaluateur|évaluation|correction|notation))(?=[^,.]*(?:premier|première|1er|1re|autre|précédent|initial|deuxième|second|superviseur|double))\s*[^,.]*,\s*/i;
  cleaned = cleaned.replace(refPattern, '');

  // 3. Expressions in-text faisant allusion à la double évaluation ou au premier examinateur
  const inlineJargon = /\b(?:en tant que (?:double|second|2ème) évaluateur|selon le premier examinateur|par rapport au premier examinateur|contrairement (?:au|à la) (?:premier|1er|première|1re) (?:examinateur|correcteur|évaluateur|évaluation)|le 1er examinateur|le premier examinateur|1er examinateur|la double évaluation|en double évaluation|double évaluation|évaluation [1-3]|évaluateur [1-3]|examinateur [1-3]|superviseur)\b[,;:]?\s*/gi;
  cleaned = cleaned.replace(inlineJargon, '');

  const scoreHeaderJargon = /\b(?:Note\s+)?(?:Évaluateur|Examinateur|Superviseur)\s*[1-3]?\s*:\s*[0-9]{1,2}(?:[.,][0-9]+)?(?:\s*\/\s*[0-9]{1,2})?\b/gi;
  cleaned = cleaned.replace(scoreHeaderJargon, '');

  // 4. Phrases entières d'attribution, de conclusion ou de délibération chiffrée
  // Ex: "La note attribuée est de 1.5/2.", "Le candidat mérite 1/2.", "D'où une note de 3/5.", "Score global : 7/10."
  const gradeSentencePattern = /(?:(?:[A-ZÀ-Ÿa-zà-ÿ\s'-]*(?:candidat|prestation|copie|élève|étudiant)\s+)?(?:mérite|méritent|obtient|obtiennent|vaut)\s+(?:donc\s+)?(?:une\s+note\s+de\s+)?|(?:(?:[Ll]a|[Uu]ne)\s+note\s+(?:attribuée|retenue|finale|proposée|suggérée)?\s*(?:est|serait)?\s*(?:donc\s+)?(?:de\s+)?)|(?:[Dd]'où|[Dd]'ou)\s+une\s+note\s+de\s+|[Cc]e\s+qui\s+justifie\s+(?:une|la)\s+note\s+de\s+|[Ll]e\s+score\s+(?:attribué|global|retenu)?\s*(?:est|serait)?\s*(?:de\s+)?|(?:[A-ZÀ-Ÿa-zà-ÿ\s'-]*(?:note|notes|critère|critères)\s+ne\s+peuvent?\s+dépasser\s+)|(?:Score\s+global\s*[:–-]?\s*))[0-9]{1,2}(?:[.,][0-9]+)?(?:\s*\/\s*[0-9]{1,2})?\.?/gi;
  cleaned = cleaned.replace(gradeSentencePattern, '');

  // Citations de notes chiffrées explicites (ex: "Décision : 5/5", "Note proposée : 3/5", "Note : 21/25", "Décision : 3", "21 / 25", "1.5/2", "8/10")
  const gradeCitationPattern = /\b(?:Décision|Note|Score)\s*(?:proposée|proposee|attribuée|attribuee|retenue|suggérée|suggeree|finale|modifiée|modifiee|ajustée|ajustee)?\s*:\s*[0-9]{1,2}(?:[.,][0-9]+)?(?:\s*\/\s*[0-9]{1,2})?\b/gi;
  cleaned = cleaned.replace(gradeCitationPattern, '');

  // Citations entre parenthèses ou crochets de fractions de note, ex: (5/5), (21/25), (1.5/2), (8/10), (note de 3/5)
  const parenGradePattern = /[\(\[]\s*(?:note\s*(?:de\s*)?)?[0-9]{1,2}(?:[.,][0-9]+)?\s*\/\s*(?:2|4|5|10|25)\s*[\)\]]/gi;
  cleaned = cleaned.replace(parenGradePattern, '');

  // Citations directes de fractions de notes (ex: "note 1.8/2", "note de 1.8/2", "global 8.5/10", "1.5/2", "8/10", "21/25")
  const directGradePattern = /\b(?:note|score|global)?\s*(?:de\s*)?[0-9]{1,2}(?:[.,][0-9]+)?\s*\/\s*(?:2|4|5|10|25)\b/gi;
  cleaned = cleaned.replace(directGradePattern, '');

  // 4b. Formules de notation en vietnamien (ex: "Điểm đánh giá phù hợp : 3", "Mức điểm : 1", "Điểm đề xuất : 3/5", "Điểm số : 2")
  const vnGradeCitationPattern = /(?:(?:Mức\s+điểm|Điểm\s+(?:đánh\s+giá|đề\s+xuất|phù\s+hợp|số|tổng|thành\s+phần)?\s*(?:phù\s+hợp|là)?|Đánh\s+giá|Quyết\s+định))\s*[:–-]?\s*[0-9]{1,2}(?:[.,][0-9]+)?(?:\s*\/\s*[0-9]{1,2})?\.?/gi;
  cleaned = cleaned.replace(vnGradeCitationPattern, '');

  const vnGradeSentencePattern = /(?:(?:Thí\s+sinh|Bài\s+nói|Phần\s+thi)\s+)?(?:xứng\s+đáng|đạt|nhận)\s+(?:được\s+)?(?:mức\s+)?(?:điểm\s+)?(?:là\s+)?[0-9]{1,2}(?:[.,][0-9]+)?(?:\s*\/\s*[0-9]{1,2})?\.?/gi;
  cleaned = cleaned.replace(vnGradeSentencePattern, '');

  // 4c. Formules de notation en anglais (ex: "Score: 3/5", "Proposed score: 1", "Decision: 3")
  const enGradeCitationPattern = /\b(?:Score|Grade|Decision|Mark)\s*(?:proposed|given|awarded)?\s*:\s*[0-9]{1,2}(?:[.,][0-9]+)?(?:\s*\/\s*[0-9]{1,2})?\.?/gi;
  cleaned = cleaned.replace(enGradeCitationPattern, '');

  // En-têtes isolés ou orphelins (ex: "Score global.", "Score global :", "Décision.", "Mức điểm.", "Điểm số :")
  cleaned = cleaned.replace(/\b(?:Score\s+global|Décision|Note\s+finale|Note\s+attribuée|Barème|Mức\s+điểm|Điểm\s+số|Đánh\s+giá)\s*[:.]?\s*/gi, '');

  // 5. Nettoyage des phrases tronquées résiduelles suite au retrait des notes chiffrées
  // Ex: "La note attribuée est.", "mérite.", "ne peuvent dépasser.", "Score global.", "Điểm đánh giá là."
  cleaned = cleaned.replace(/(?:[Ll]a|[Uu]ne)\s+note\s+(?:attribuée|retenue|finale|proposée)?\s*(?:est|serait)?\s*(?:de)?\s*\./gi, '');
  cleaned = cleaned.replace(/(?:[Ll]e\s+score\s+(?:attribué|global)?\s*(?:est|serait)?\s*(?:de)?)\s*\./gi, '');
  cleaned = cleaned.replace(/(?:Điểm\s+(?:đánh\s+giá|đề\s+xuất|phù\s+hợp)?\s*(?:là)?)\s*\./gi, '');
  cleaned = cleaned.replace(/\b(?:mérite|méritent|obtient|valent|dépasser|d'où|xứng\s+đáng|đạt|nhận)\s*\./gi, '.');
  cleaned = cleaned.replace(/\b(?:est|serait|sont)\s+(?:de\s+)?\./gi, '.');

  // 6. Nettoyage des artefacts de tokenisation fréquents (ex: "D me autre côté" -> "D'un autre côté", "d me autre" -> "d'un autre")
  cleaned = cleaned.replace(/\b([Dd])\s+me\s+autre\b/g, "$1'un autre");
  cleaned = cleaned.replace(/\b([Dd])\s+me\s+part\b/g, "$1'une part");
  cleaned = cleaned.replace(/\b([Dd])\s+un\s+autre\b/g, "$1'un autre");
  cleaned = cleaned.replace(/\b([Dd])\s+une\s+part\b/g, "$1'une part");
  cleaned = cleaned.replace(/\bmots?\s+d'\s*liaison\b/gi, "mots de liaison");
  cleaned = cleaned.replace(/\bmots?\s+d'\s*transition\b/gi, "mots de transition");
  cleaned = cleaned.replace(/\b([Dd])'\s*base\b/g, "$1e base");

  // 7. Nettoyage de la ponctuation orpheline ou résiduelle (ex: " : . ", " ( ) ", espaces multiples)
  cleaned = cleaned.replace(/\(\s*\)/g, '');
  cleaned = cleaned.replace(/\[\s*\]/g, '');
  cleaned = cleaned.replace(/\s*:\s*\./g, '.');
  cleaned = cleaned.replace(/\s*:\s*;/g, ';');
  cleaned = cleaned.replace(/\s+([.,;!?])/g, '$1');
  cleaned = cleaned.replace(/\.{2,}/g, '.');
  cleaned = cleaned.replace(/\s{2,}/g, ' ');
  cleaned = cleaned.replace(/^\s*(?:[:\-–.]\s*)+/, '').trim();

  if (cleaned.length > 0 && cleaned !== comment.trim()) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned;
}

export function roundToDelfScore(score: number, level: string, criterionKey: string): number {
  const allowed = level === 'B1'
    ? (criterionKey === 'lexique' ? [0, 1, 3, 5] : [0, 1, 2.5, 4])
    : [0, 1, 3, 5];

  // Arrondi au palier LE PLUS PROCHE.
  //
  // L'implémentation précédente (`allowed.find(v => v >= score)`) remontait
  // toujours au palier SUPÉRIEUR : une moyenne de 3,1 devenait 5 et 1,4
  // devenait 3. Le biais se composait ensuite dans `computeJuryResult`, qui
  // moyenne deux notes déjà arrondies avant de ré-arrondir. Sur cinq critères,
  // cela pouvait gonfler la note finale de plusieurs points sur 25.
  //
  // En cas d'égalité parfaite entre deux paliers (ex. 2 pour la grille
  // [0, 1, 3, 5]), on retient le palier supérieur : c'est la convention déjà
  // appliquée par l'application sœur `correcteur-PE`.
  let closest = allowed[0];
  let smallestGap = Math.abs(score - allowed[0]);
  for (const value of allowed.slice(1)) {
    const gap = Math.abs(score - value);
    if (gap <= smallestGap) {
      smallestGap = gap;
      closest = value;
    }
  }
  return closest;
}

export function computeJuryResult(
  result1: any, 
  result2: any, 
  providerLabel: string,
  level: string = 'B2',
  notationType: 'detailed' | 'delf' = 'detailed'
): any {
  const cleanResult1 = sanitizeScores(result1, level, notationType);
  const cleanResult2 = sanitizeScores(result2, level, notationType);

  const originalTranscription = cleanResult1.transcription || result1.transcription || cleanResult2.transcription || result2.transcription || '';
  cleanResult1.transcription = originalTranscription;
  cleanResult2.transcription = originalTranscription;

  // Règle d'or : le 2e évaluateur a toujours priorité absolue sur le 1er évaluateur
  const finalCriteria: Record<string, number> = {
    ...(cleanResult1.criteriaScores || {}),
    ...(cleanResult2.criteriaScores || {})
  };

  // Normalisation des valeurs numériques pour chaque critère selon le barème
  for (const key of Object.keys(finalCriteria)) {
    const rawVal = finalCriteria[key];
    const num = Number(rawVal);
    if (!isNaN(num)) {
      if (notationType === 'delf') {
        finalCriteria[key] = roundToDelfScore(num, level, key);
      } else {
        finalCriteria[key] = Math.round(num * 10) / 10;
      }
    }
  }

  

  const errors1 = cleanResult1.errorsTable || [];
  const errors2 = cleanResult2.errorsTable || [];
  const finalErrors = (errors2 && errors2.length > 0)
    ? cleanErrorsTable(errors2)
    : cleanErrorsTable(errors1);

  const finalSubject = cleanResult1.subject || (result1 as any)?.subject || cleanResult2.subject || (result2 as any)?.subject;

  // Sécurité anti-vide pour les conseils (advices) : si le 2nd évaluateur n'en a pas fourni ou les a laissés vides, conserver ceux du 1er évaluateur
  const adv1 = cleanResult1.advices && typeof cleanResult1.advices === 'object' ? cleanResult1.advices : {};
  const adv2 = cleanResult2.advices && typeof cleanResult2.advices === 'object' ? cleanResult2.advices : {};
  const hasAdv2 = Object.keys(adv2).length > 0 && Object.values(adv2).some((v: any) => typeof v === 'string' && v.trim().length > 0);
  const finalAdvices = hasAdv2 ? adv2 : adv1;

  // Sécurité anti-vide pour les justifications
  const just1 = cleanResult1.justifications && typeof cleanResult1.justifications === 'object' ? cleanResult1.justifications : {};
  const just2 = cleanResult2.justifications && typeof cleanResult2.justifications === 'object' ? cleanResult2.justifications : {};
  const hasJust2 = Object.keys(just2).length > 0 && Object.values(just2).some((v: any) => typeof v === 'string' && v.trim().length > 0);
  const finalJustifications = hasJust2 ? just2 : just1;

  // Si cleanResult2 avait vidé advices ou errorsTable, synchroniser cleanResult2 pour éviter de léguer un objet vide à l'arbitre externe
  if (!hasAdv2 && Object.keys(finalAdvices).length > 0) {
    cleanResult2.advices = { ...finalAdvices };
  }
  if ((!errors2 || errors2.length === 0) && finalErrors.length > 0) {
    cleanResult2.errorsTable = [...finalErrors];
  }

  const sumCriteria = Math.round(Object.values(finalCriteria).reduce((acc, val) => acc + (val as number), 0) * 10) / 10;
  const finalGlobalScore = (cleanResult2.globalScore !== undefined && cleanResult2.globalScore !== null && !isNaN(Number(cleanResult2.globalScore)))
    ? Number(cleanResult2.globalScore)
    : sumCriteria;

  const finalResult: any = {
    ...cleanResult2,
    ...(finalSubject ? { subject: finalSubject } : {}),
    studentName: cleanResult1.studentName || cleanResult2.studentName || (result1 as any)?.studentName || (result2 as any)?.studentName || null,
    studentEmail: cleanResult1.studentEmail || cleanResult2.studentEmail || (result1 as any)?.studentEmail || (result2 as any)?.studentEmail || null,
    candidateNumber: (cleanResult1 as any).candidateNumber || (cleanResult2 as any).candidateNumber || (result1 as any)?.candidateNumber || (result2 as any)?.candidateNumber || null,
    classId: (cleanResult1 as any).classId || (cleanResult2 as any).classId || (result1 as any)?.classId || (result2 as any)?.classId || null,
    studentId: (cleanResult1 as any).studentId || (cleanResult2 as any).studentId || (result1 as any)?.studentId || (result2 as any)?.studentId || null,
    file: (cleanResult1 as any).file || (cleanResult2 as any).file || (result1 as any)?.file || (result2 as any)?.file,
    transcription: originalTranscription,
    transcriptionCorrigee: cleanResult2.transcriptionCorrigee || cleanResult1.transcriptionCorrigee || '',
    brouillon_phase1_audit: cleanResult2.brouillon_phase1_audit || cleanResult1.brouillon_phase1_audit || '',
    brouillon_phase2_analyse: cleanResult2.brouillon_phase2_analyse || cleanResult1.brouillon_phase2_analyse || '',
    justifications: finalJustifications,
    advices: finalAdvices,
    errorsTable: finalErrors,
    globalScore: finalGlobalScore,
    criteriaScores: finalCriteria,
    notationType
  };

  if (finalResult.brouillon_phase1_audit) {
    finalResult.brouillon_phase1_audit = cleanJuryComment(finalResult.brouillon_phase1_audit);
  }
  if (finalResult.brouillon_phase2_analyse) {
    finalResult.brouillon_phase2_analyse = cleanJuryComment(finalResult.brouillon_phase2_analyse);
  }
  if (finalResult.justifications) {
    for (const key of Object.keys(finalResult.justifications)) {
      if (typeof finalResult.justifications[key] === 'string') {
        finalResult.justifications[key] = cleanJuryComment(finalResult.justifications[key]);
      }
    }
  }
  if (finalResult.advices) {
    for (const key of Object.keys(finalResult.advices)) {
      if (typeof finalResult.advices[key] === 'string') {
        finalResult.advices[key] = cleanJuryComment(finalResult.advices[key]);
      }
    }
  }

  finalResult._comparison = {
    firstEval: cleanResult1,
    secondEval: cleanResult2,
    firstProvider: cleanResult1.modelUsed || "Inconnu",
    secondProvider: cleanResult2.modelUsed || providerLabel
  };

  return finalResult;
}

export function getAudioTranscriptionPrompt(level: 'B1' | 'B2' | string = 'B2', nativeLanguage?: string): string {
  let audioPrompt = `Transcris fidèlement cet enregistrement audio DELF ${level} réalisé par un candidat non-francophone.
CONSIGNE CRITIQUE : Effectue une transcription mot à mot ultra-fidèle.

- IDENTIFICATION DES LOCUTEURS : L'enregistrement comporte les interventions du Candidat et d'un ou plusieurs Examinateurs. Structurer la transcription selon le format strict :
  Candidat :
  [discours transcrit du candidat]

  Examinateur :
  [intervention de l'examinateur transcrite]

  (Si un seul locuteur intervient, comme lors d'un monologue continu ou d'un exposé seul, transcris l'intégralité sous "Candidat :" sans inventer d'examinateur).

- DÉFAUTS DE PRONONCIATION : 
  Ne modifie ni ne corrige la grammaire ou la syntaxe.
  ⚠️ ATTENTION - PHONÉTIQUE ET FAUSSES LIAISONS :
  1. Si le candidat prononce mal un mot mais que le sens est évident dans le contexte, transcris le MOT STANDARD CORRECT EN FRANÇAIS.
  2. Si le candidat fait une erreur flagrante de liaison ou de prononciation qui altère le sens ou rend le mot incompréhensible, transcris phonétiquement entre crochets le son exact entendu suivi d'un point d'interrogation (ex: "[z-haricots ?]", "[en-v-avion ?]", "[k-heure ?]").
  3. Pour les mots tronqués, hésitations ou faux départs, transcris exactement ce qui est prononcé suivi de "..." (ex: "je vou... je voulais dire").
  4. INTERDICTION D'INVENTER : Ne complète pas les phrases inachevées. Ne supprime pas les répétitions ou les tics de langage ("euh", "enfin", "voilà", "donc").

- QUALITÉ DE L'ENREGISTREMENT ET BRUITS :
  Ignore les bruits de fond, soupirs ou bruits parasites sauf s'ils masquent totalement la voix (dans ce cas, note "[inaudible]").

Rends UNIQUEMENT la transcription structurée selon les locuteurs, sans aucune phrase d'introduction ni de conclusion.`;

  if (nativeLanguage && nativeLanguage !== 'Aucune' && nativeLanguage !== 'none') {
    audioPrompt += `\n\n- INFLUENCE LINGUISTIQUE DU CANDIDAT : Le candidat est influencé par la/les langue(s) : ${nativeLanguage}. Prends en compte ses spécificités phonétiques et accentuelles pour une transcription ultra-fidèle.`;
  }

  return audioPrompt;
}

export function buildJurySimulationPrompt(subject: string, candidateMonologue: string): string {
  return `Tu es un examinateur officiel du DELF B2 pour l'épreuve de Production Orale.
Le candidat vient de terminer son exposé (monologue continu) sur le sujet suivant :
"${subject}"

Voici la transcription exacte de son exposé :
"""
${candidateMonologue}
"""

Ta mission est de préparer l'épreuve d'interaction (le débat avec le candidat) en générant :
1. Une brève analyse synthétique des arguments présentés par le candidat (ce qu'il a bien traité, les angles morts ou omissions, et s'il a compris la problématique ou fait un contresens).
2. Exactement 3 questions de relance pertinentes, variées et bien ciblées pour tester sa capacité à argumenter, nuancer, réagir à une objection et défendre son point de vue.

Types de questions attendues (1 de chaque type) :
- Question 1 (Contradiction / Concession) : Opposer un contre-argument solide à l'une de ses prises de position pour le forcer à nuancer ou concéder (ex: "Vous affirmez que X, mais ne pensez-vous pas plutôt que Y risque d'entraîner Z ?").
- Question 2 (Précision / Angle mort) : Interroger le candidat sur un aspect important du sujet qu'il n'a pas abordé ou traité trop superficiellement (ex: "Vous avez parlé des aspects économiques, mais qu'en est-il de l'impact écologique / social pour... ?").
- Question 3 (Recadrage / Élargissement) : En cas de contresens ou mauvaise compréhension, recadrer poliment le sujet ; sinon, élargir le débat à une perspective plus globale ou sociétale (ex: "Si l'on généralisait cette mesure à l'ensemble du pays, comment pourrait-on convaincre les personnes réfractaires ?").

Consignes de formulation pour les questions :
- Adopte le ton bienveillant, professionnel et exigeant d'un examinateur DELF B2.
- Utilise obligatoirement le vouvoiement.
- Rédige des questions courtes, percutantes et directes (1 à 2 phrases par question).
- Ne pose pas de questions fermées (auxquelles on répond par oui/non).

Format de sortie exigé : Réponds exclusivement au format JSON (sans aucun formatage markdown de bloc de code json, sans texte d'introduction ni de conclusion) avec la structure exacte suivante :
{
  "analyse": {
    "argumentsCles": ["argument 1", "argument 2"],
    "pointsFaiblesOuOmissions": "explication des lacunes ou omissions",
    "statutProblematique": "comprise | partielle | contresens",
    "commentairePedagogique": "commentaire general sur l'expose"
  },
  "questions": [
    {
      "id": 1,
      "type": "contradiction_concession",
      "butPedagogique": "Forcer l'opposition et la concession face à un contre-argument.",
      "text": "Texte de la question 1"
    },
    {
      "id": 2,
      "type": "precision_omission",
      "butPedagogique": "Faire développer un point trop superficiel ou aborder une omission.",
      "text": "Texte de la question 2"
    },
    {
      "id": 3,
      "type": "recadrage_approfondissement",
      "butPedagogique": "Recadrer en cas de mauvaise compréhension OU élargir la réflexion.",
      "text": "Texte de la question 3"
    }
  ]
}`;
}

export const buildGenerateQuestionsPrompt = buildJurySimulationPrompt;

/**
 * Prompt de vérification de la boucle Loop Engineering (Eval 2).
 * Demande au modèle de relire son propre JSON et de le corriger si des lacunes
 * sont détectées. Retourner le JSON corrigé ou inchangé — aucun texte autour.
 */
export function buildLoopVerificationPrompt(language: string): string {
  const accentNote =
    language === 'VN'
      ? 'tous les accents et tons vietnamiens (ă, â, đ, ê, ô, ơ, ư + tons sắc/huyền/hỏi/ngã/nặng)'
      : language === 'TW'
      ? 'les caractères chinois traditionnels (繁體中文, pas de caractères simplifiés)'
      : language === 'EN'
      ? 'correct English spelling and grammar'
      : language === 'CZ'
      ? 'tous les accents tchèques (á, č, ď, é, ě, í, ň, ó, ř, š, ť, ú, ů, ý, ž)'
      : 'tous les accents français (é, è, à, â, ê, î, ô, û, ç, etc.)';

  return `🔁 PHASE DE VÉRIFICATION OBLIGATOIRE — Boucle d'auto-contrôle qualité

Tu viens de produire un rapport d'évaluation JSON. Avant de le valider définitivement, relis-le et vérifie CHACUN des points suivants :

1. COMPLÉTUDE DES JUSTIFICATIONS ET CONSEILS : Chaque critère évalué dispose-t-il d'une justification (champ "justifications") et d'un conseil (champ "advices") substantiels, rédigés en au moins 2 phrases complètes ? Aucun champ ne doit être vide ou réduit à une seule phrase trop courte.
2. COHÉRENCE STRICTE NOTES / JUSTIFICATIONS : Les notes dans "criteriaScores" sont-elles en accord parfait avec le contenu des justifications ? Ne laisse aucune contradiction interne (ex: ne pas attribuer 1/5 au lexique si la justification décrit un vocabulaire varié et adapté qui relève de 3/5).
3. PLAFONNEMENT MORPHOSYNTAXE ET LEXIQUE :
   - Si la transcription présente des erreurs récurrentes sur les structures de base (accords élémentaires, formes verbales inexistantes, auxiliaires, prépositions simples), la note de morphosyntaxe ne doit pas dépasser 1/5 (ou 1/4 en B1). Corrige la note si nécessaire.
4. REPORT EXHAUSTIF DU BROUILLON DANS errorsTable : Toutes les anomalies, fautes et maladresses linguistiques identifiées dans "brouillon_phase1_audit" sont-elles bien consignées dans "errorsTable" avec leur règle expliquée ? Si certaines manquent, ajoute-les impérativement.
5. DISTINCTION MORPHOSYNTAXE VS LEXIQUE (SANCTUARISATION) : Les erreurs de morphosyntaxe (genre des noms, accords, déterminants, prépositions, formes verbales) ont-elles bien été imputées à la morphosyntaxe et non au lexique ? Le lexique ne doit refléter que la variété, la précision lexicale et les impropriétés.
6. CONSEILS MÉTHODOLOGIQUES ACTIONNABLES : Les conseils dans "advices" fournissent-ils des méthodes concrètes et des techniques pratiques de prise de parole (structuration d'exposé, articulation logique, enrichissement lexical thématique) au lieu de simples injonctions passives ?
7. BIAIS DE TENDANCE CENTRALE : As-tu attribué des notes médianes par défaut là où la performance était clairement insuffisante (mérite 1) ou bonne (mérite 3-5) ?
8. VOUVOIEMENT : Dans les champs "justifications" et "advices", l'apprenant est-il bien vouvoyé (« vous »/« votre »/« vos ») ? Toute occurrence de tutoiement (« tu »/« ton »/« ta ») est une erreur à corriger.
9. ACCENTS ET LANGUE : Les champs textuels contiennent-ils bien ${accentNote} sans aucune omission ?
10. AUCUNE MENTION DE NOTE DANS LES TEXTES OU BROUILLONS : Vérifie qu'aucune note chiffrée, fraction ou formule de score (ex: « Điểm đánh giá phù hợp : X », « Mức điểm : X », « Note : X/5 », « Décision : X ») n'apparaît dans les justifications, conseils ou brouillons. Les notes vont UNIQUEMENT dans criteriaScores.
11. transcriptionCorrigee FIDÈLE (ZÉRO SPÉCULATION NI LISSAGE) : Vérifie que transcriptionCorrigee ne comporte aucune reconstruction spéculative (les passages inintelligibles doivent rester balisés entre crochets : [locution incompréhensible, non reconstituée : « ... »]) et aucun lissage adoucissant un effondrement. Vérifie qu'aucun énoncé n'a été supprimé silencieusement.
12. RESPECT STRICT DE LA POLARITÉ : Vérifie que la polarité (affirmative vs négative) est rigoureusement identique entre errorsTable et transcriptionCorrigee (ne jamais transformer une négation en affirmation).
13. PURETÉ DU FRANÇAIS DANS transcriptionCorrigee : Vérifie que transcriptionCorrigee est à 100% en français sans aucun mot vietnamien ou étranger résiduel (ex: « và » à remplacer par « et »).
14. AUCUN FORMATAGE MARKDOWN NI LIEN HYPERTEXTE : Vérifie qu'aucun lien markdown [texte](url), aucune URL web (https://...) et aucune balise de mise en forme (**gras**, *italique*, etc.) ne subsiste dans les justifications, conseils, brouillons ou règles du tableau d'erreurs.
15. ZÉRO POLÉMIQUE NI MÉTA-DISCOURS DANS errorsTable : Vérifie qu'aucune entrée de "errorsTable" ou justification ne débat, ne justifie pourquoi une tournure n'est pas une faute ou ne répond à un évaluateur précédent. Supprime impérativement toute entrée défensive (« Ce n'est pas une faute », « L'omission de virgule ne constitue pas... »). errorsTable ne doit contenir QUE des erreurs avérées avec leur règle linguistique positive.
16. VÉRIFICATION DES ACCORDS ÉLÉMENTAIRES DU LOCUTEUR : Vérifie que les accords en genre et en nombre avec l'identité du locuteur ou les accords de base ne sont pas passés inaperçus.
17. ÉLÉGANCE ET VARIÉTÉ DES CORRECTIONS : Vérifie que les corrections proposées dans errorsTable et transcriptionCorrigee sont naturelles, idiomatiques, et évitent les répétitions maladroites de syntagmes dans des phrases successives.

Si tu identifies une ou plusieurs lacunes, corrige le JSON et renvoie le JSON complet corrigé.
Si tout est correct, renvoie le JSON identique sans aucune modification.
⚠️ NE RENVOIE QUE LE JSON — aucun texte d'explication, aucune phrase d'introduction ou de conclusion avant ou après le JSON.`;
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
 * Tente de réparer un JSON incomplet / tronqué en fermant les guillemets,
 * les crochets et les accolades non fermés.
 */
export function repairTruncatedJson(str: string): string {
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
 * Parse un JSON de façon tolérante et résiliente :
 * 1. Tente un JSON.parse standard
 * 2. Nettoie les blocs markdown ```json ... ```
 * 3. Échappe les caractères de contrôle non échappés
 * 4. Tente de réparer la troncature (fermeture de guillemets/crochets/accolades)
 */
/**
 * Supprime les virgules orphelines / traînantes (trailing commas) avant '}' ou ']'
 * sans toucher aux virgules situées à l'intérieur des chaînes de caractères.
 */
export function removeTrailingCommas(jsonStr: string): string {
  let result = '';
  let inString = false;
  let isEscaped = false;
  let lastCommaIndex = -1;

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }
      result += char;
    } else {
      if (char === '"') {
        inString = true;
        result += char;
      } else if (char === ',') {
        lastCommaIndex = result.length;
        result += char;
      } else if (char === '}' || char === ']') {
        if (lastCommaIndex !== -1) {
          const between = result.substring(lastCommaIndex + 1);
          if (/^\s*$/.test(between)) {
            result = result.substring(0, lastCommaIndex) + between;
          }
          lastCommaIndex = -1;
        }
        result += char;
      } else {
        if (!/\s/.test(char)) {
          lastCommaIndex = -1;
        }
        result += char;
      }
    }
  }
  return result;
}

/**
 * Extrait le payload JSON d'une réponse textuelle :
 * 1. Supprime les balises <think>...</think>, etc.
 * 2. Extrait le contenu des blocs de code markdown ```json ... ```
 * 3. Extrait la portion comprise entre le premier '{' ou '[' et le dernier '}' ou ']'
 */
export function extractJsonPayload(text: string): string {
  if (!text) return '';
  let cleanText = text.trim();

  // Nettoyage des balises de pensée / raisonnement
  cleanText = cleanText.replace(/<(?:think|reasoning|antThinking)>[\s\S]*?<\/(?:think|reasoning|antThinking)>/gi, "").trim();

  // 1. Extraire depuis un bloc de code markdown
  const codeBlockMatch = cleanText.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
  if (codeBlockMatch && codeBlockMatch[1].trim()) {
    cleanText = codeBlockMatch[1].trim();
  }

  // 2. Supprimer les backticks résiduels
  cleanText = cleanText.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

  // 3. Extraire entre le premier '{'/'[' et le dernier '}'/']'
  const firstBrace = cleanText.indexOf('{');
  const firstBracket = cleanText.indexOf('[');
  let startIdx = -1;
  if (firstBrace !== -1 && firstBracket !== -1) {
    startIdx = Math.min(firstBrace, firstBracket);
  } else if (firstBrace !== -1) {
    startIdx = firstBrace;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
  }

  if (startIdx !== -1) {
    const isObject = cleanText[startIdx] === '{';
    const endChar = isObject ? '}' : ']';
    const lastIdx = cleanText.lastIndexOf(endChar);
    if (lastIdx !== -1 && lastIdx > startIdx) {
      cleanText = cleanText.substring(startIdx, lastIdx + 1);
    } else {
      cleanText = cleanText.substring(startIdx);
    }
  }

  return cleanText;
}

/**
 * Nettoie les caractères d'échappement invalides en JSON :
 * - Remplacement de \' par ' (fréquent en français)
 * - Remplacement des antislashs non autorisés en JSON (\([^"\\/bfnrtu]) -> $1)
 * - Remplacement des \u non hexadécimaux
 * - Suppression des antislashs isolés en fin de ligne
 */
export function sanitizeInvalidJsonEscapes(str: string): string {
  let cleaned = str;
  cleaned = cleaned.replace(/\\'/g, "'");
  cleaned = cleaned.replace(/\\([^"\\\/bfnrtu])/g, '$1');
  cleaned = cleaned.replace(/\\u(?![0-9a-fA-F]{4})/gi, 'u');
  cleaned = cleaned.replace(/\\$/g, '');
  return cleaned;
}

/**
 * Parse un JSON de façon tolérante et ultra-résiliente :
 * 1. Extraction robuste du JSON (markdown, délimiteurs, think tags)
 * 2. Nettoyage des antislashs invalides
 * 3. Suppression des trailing commas
 * 4. Échappement des caractères de contrôle non échappés dans les chaînes
 * 5. Réparation de troncature si nécessaire
 */
export function safeParseJson<T = any>(rawText: string): T {
  if (!rawText || !rawText.trim()) {
    throw new Error('Le texte à parser est vide.');
  }

  let cleaned = extractJsonPayload(rawText);
  cleaned = sanitizeInvalidJsonEscapes(cleaned);
  cleaned = removeTrailingCommas(cleaned);

  // 1. Parser standard
  try {
    return JSON.parse(cleaned);
  } catch (e1) {
    // 2. Échappement des caractères de contrôle dans les chaînes
    const escaped = removeTrailingCommas(escapeControlCharactersInStrings(cleaned));
    try {
      return JSON.parse(escaped);
    } catch (e2) {
      // 3. Réparation de troncature
      const repaired = removeTrailingCommas(repairTruncatedJson(cleaned));
      try {
        return JSON.parse(repaired);
      } catch (e3) {
        // 4. Combinaison échappement + réparation
        const repairedEscaped = removeTrailingCommas(repairTruncatedJson(escaped));
        try {
          return JSON.parse(repairedEscaped);
        } catch (e4) {
          // 5. Tentative sur le texte brut en dernier recours
          try {
            return JSON.parse(rawText.trim());
          } catch (e5) {
            throw new Error(`Échec du parsing JSON : ${(e1 as Error).message}`);
          }
        }
      }
    }
  }
}
/**
 * Construit le prompt système standard et complet pour le 3e évaluateur (Arbitre).
 * Partagé entre tous les services IA (Gemini, Claude, OpenAI, Mistral, DeepSeek) et l'arbitre externe.
 */
export function buildArbiterSystemPrompt(
  level: string,
  language: string = 'FR',
  notationType: 'detailed' | 'delf' = 'detailed'
): string {
  const gridPrompt = buildEvalSystemPrompt(level, language, notationType);
  const cleanGridPrompt = gridPrompt.split(/⚠️ DIRECTIVE DE FORMAT DE SORTIE JSON|Tu DOIS impérativement retourner un objet JSON/i)[0].trim();

  return `Tu es un TROISIÈME examinateur ARBITRE d'une épreuve de PRODUCTION ORALE (DELF ${level}).
Tu reçois la transcription annotée du candidat et DEUX évaluations indépendantes (examinateur 1 et examinateur 2). Ta mission :
1. Relis la transcription et repère les fautes de GRAMMAIRE et de LEXIQUE que les DEUX évaluations précédentes auraient omises ; ajoute-les au tableau d'erreurs (réservé exclusivement aux erreurs linguistiques).
   - Concernant la phonologie : retiens uniquement les erreurs de prononciation flagrantes qui rendent le mot inintelligible. Les bégaiements oraux et hésitations relèvent de l'aisance et sont STRICTEMENT EXCLUS d'errorsTable.
2. Analyse les DIVERGENCES entre les deux évaluations, critère par critère.
3. Produis un RAPPORT FINAL consolidé faisant autorité, destiné à l'élève.

═══════════════════════════════════════════
🌐 LANGUE DU RAPPORT OBLIGATOIRE (STRICTE)
═══════════════════════════════════════════
${getLanguageInstruction(language)}
Toutes les justifications, conseils (advices), brouillons et règles (errorsTable.rule) du rapport final DOIVENT IMPÉRATIVEMENT être rédigés dans cette langue demandée. Seules les citations directes et exemples en français tirés de la prestation (entre guillemets « ... ») ainsi que 'original', 'correction' et la transcription corrigée restent en français.
⚠️ TRADUCTION OBLIGATOIRE DANS LA LANGUE DU RAPPORT (${language === 'VN' ? 'Vietnamien' : language}) : Si les examinateurs 1 ou 2 ont rédigé leurs commentaires en français (ou dans une autre langue que ${language}), tu DOIS IMPÉRATIVEMENT TRADUIRE ET ADAPTER toutes les explications, justifications, conseils et règles d'erreurs dans la langue demandée (${language === 'VN' ? 'Vietnamien' : language}). Les citations textuelles exactes de l'élève restent bien entendu en français entre guillemets. Il est STRICTEMENT INTERDIT de renvoyer le corps des commentaires en français si la langue demandée est ${language === 'VN' ? 'le vietnamien' : language} !

═══════════════════════════════════════════
⚖️ RÈGLES CRITIQUES D'ARBITRAGE :
═══════════════════════════════════════════
1. ⚖️ PRINCIPE DU NON-CUMUL DES SANCTIONS (CLOISONNEMENT STRICT DES CRITÈRES CECRL) :
   - Le critère Monologue évalue EXCLUSIVEMENT la structure, la problématique, les arguments/exemples et les connecteurs logiques. Tu ne dois EN AUCUN CAS abaisser la note de Monologue à cause des hésitations orales (qui relèvent de la Phonologie) ni à cause des erreurs de grammaire (qui relèvent de la Morphosyntaxe).
   - Si le candidat dégage une problématique, pose un plan avec connecteurs et apporte des arguments concrets, il atteint le palier acquis/intermédiaire (3/5 en B2). La note de 5/5 est strictement réservée à une argumentation approfondie, nuancée et sans réserve de superficialité.
   - ⚠️ ARBITRAGE DU MONOLOGUE (3/5 vs 5/5) : Si les deux examinateurs divergent sur Monologue (ex: 5 vs 3), vérifie si la prestation approfondit réellement les conditions de mise en œuvre et pèse les nuances du problème. Si les arguments ou solutions restent simplement énumérés sans examen critique ou si la conclusion n'apporte pas de réponse tranchée, tranche obligatoirement en faveur du palier 3/5.
   - Les fautes d'accord, de genre, de temps et de prépositions relèvent EXCLUSIVEMENT de la Morphosyntaxe, jamais du Lexique.

2. EXCLUSION DES AUTOREPRISES, AUTOCORRECTIONS ET FAUX DÉPARTS ORAUX :
   - Si le candidat trébuche sur un chiffre ou un mot et se reprend immédiatement (ex: « environ 1/6 1/600 », « dans 8 à dans 5 heures », « préver- préserver »), il s'agit d'une simple autocorrection orale : INTERDICTION STRICTE de la consigner comme une erreur dans errorsTable.
   - Isole l'erreur linguistique propre dans 'original' sans répétitions d'hésitation.

3. ⚠️ INTERDICTION ABSOLUE DE FABRICATION OU EMBELLISSEMENT DANS transcriptionCorrigee :
   - Ne maquille JAMAIS un effondrement ou un propos fautif en registre soutenu (ne transforme jamais « je dois pas répondre » en « Je préfère ne pas répondre »). Si le candidat dit « une machine de gagner d'argent », corrige uniquement la grammaire (« une machine à gagner de l'argent ») sans altérer sa métaphore.
   - Les corrections doivent être STRICTEMENT LITTÉRALE ET MINIMALES.
   - Ne supprime jamais d'énoncé prononcé sous prétexte qu'il est maladroit.

4. ⚠️ INTERDICTION DES RECONSTRUCTIONS SPÉCULATIVES SUR PASSAGES INAUDIBLES :
   - Si une expression est inintelligible, ne tolère aucune reconstruction spéculative inventée. Conserve le passage entre crochets : « [locution incompréhensible, non reconstituée : « ... »] ».

5. ⚠️ RESPECT STRICT DE LA POLARITÉ ET SYNCHRONISATION errorsTable / transcriptionCorrigee :
   - La polarité (affirmative vs négative) doit concorder rigoureusement entre errorsTable et transcriptionCorrigee (ex: « ils ne sont pas très bavards »).
   - Zéro correction silencieuse : toute faute corrigée dans transcriptionCorrigee doit figurer dans errorsTable.

6. ⚠️ PURETÉ DU FRANÇAIS DANS transcriptionCorrigee ET DANS errorsTable.correction :
   - 100% en français : aucun mot étranger (comme les conjonctions vietnamiennes « và », « hoặc », « nhưng », « avec/với », « của », « cho », « trong », « về », « ở », « tại »).

7. ⚠️ ANGLES MORTS FRÉQUENTS À INTÉGRER :
   - Prépositions temporelles de durée vs date (« dans X heures » -> « pendant X heures ») ;
   - Prépositions de but (« des machines de moderniser » -> « pour moderniser ») ;
   - Faux-amis (« une place/location » -> « un endroit/lieu ») ;
   - Adjectifs au lieu de noms abstraits (« parler de pauvre » -> « parler de pauvreté ») ;
   - Genres des noms usuels masculins (« un village », « un musée », « un grand artisanat », « un choix », « un horizon ») et féminins (« la matière ») ;
   - Omission du « que » ou du « si » conditionnel ;
   - Registre familier (« les trucs ») ;
   - Accords grammaticaux de base et accord de genre avec l'identité du candidat/locuteur lorsqu'elle est connue ou identifiée.

8. ⚠️ PLAFOND ANGLICISME :
   - Le plafond de note sur Lexique ne s'applique qu'en cas de recours RÉCURRENT (≥ 2 occurrences distinctes en langue étrangère). Un mot d'anglais unique ou un anglicisme isolé ne déclenche pas ce plafond. Les termes oraux usuels français (« Ok », « cool ») ne comptent pas comme langue étrangère.

9. 🚫 ZÉRO MENTION DE NOTE DANS LES TEXTES DU RAPPORT ÉLÈVE :
   - Aucune note chiffrée, fraction ou délibération (comme « 3/5 », « 1.5/2 », « Note : X ») dans justifications, advices ou brouillons. Les notes sont uniquement dans criteriaScores et globalScore.

10. ⚠️ VÉRIFICATION DES FORMES COMPLEXES :
    - Le futur simple n'est PAS un conditionnel ni une forme complexe. « qu'ils veulent » est un indicatif, pas un subjonctif.

11. ⚠️ SILENCE ET PURGE DES FAUSSES ERREURS (ZÉRO POLÉMIQUE NI MÉTA-DÉBAT DANS errorsTable ET EVALUATION) :
    - Si l'un des examinateurs a relevé à tort une pseudo-erreur sur une tournure licite ou a inventé une règle inexacte, SUPPRIME SILENCIEUSEMENT cette entrée de errorsTable.
    - Il est STRICTEMENT INTERDIT d'insérer dans errorsTable ou dans l'évaluation des remarques défensives réfutant une analyse précédente (ex: « Ce n'est pas une faute », « L'omission de virgule ne constitue pas une erreur », « Ce mot est tout à fait correct »). errorsTable ne doit contenir QUE des erreurs linguistiques avérées avec leur correction directe pour l'élève.

12. 🚫 PAS DE FORMATAGE MARKDOWN NI LIENS HYPERTEXTES :
    - N'utilise AUCUN caractère de formatage markdown (**gras**, *italique*, etc.) ni AUCUN lien web/URL ([texte](url) ou https://...) dans les justifications, advices, brouillons ou règles du tableau d'erreurs. Rédige en texte brut simple.

## Grille et règles de notation (rappel)
${cleanGridPrompt}

Tu DOIS impérativement retourner un objet JSON valide contenant obligatoirement deux clés de premier niveau :
- "evaluation": contenant le rapport final complet destiné à l'élève (qui respecte le schéma complet : studentEmail, studentName, transcription, transcriptionCorrigee, brouillon_phase1_audit, brouillon_phase2_analyse, globalScore, criteriaScores, justifications, advices, errorsTable).
- "comparisonNotes": contenant ton commentaire détaillé pour le correcteur sur les écarts constatés entre l'examinateur 1 et l'examinateur 2 (DESTINÉ AU CORRECTEUR, jamais à l'élève).`;
}

/**
 * Construit le user prompt pour le 3e évaluateur (Arbitre).
 */
export function buildArbiterUserPrompt(
  subject: string,
  studentTranscription: string,
  firstEval: CorrectionResult,
  secondEval: CorrectionResult,
  firstProvider: string,
  secondProvider: string,
  language: string = 'FR'
): string {
  const cleanFirst = cleanEvalForPrompt(firstEval);
  const cleanSecond = cleanEvalForPrompt(secondEval);

  let langAlert = "";
  if (language === 'VN') {
    langAlert = `\n\n⚠️ ALERTE LANGUE CRITIQUE POUR L'ARBITRAGE :
Même si les évaluations des examinateurs 1 et 2 ci-dessus sont rédigées en français, TON RAPPORT FINAL D'ARBITRAGE (« evaluation.justifications », « evaluation.advices », « evaluation.brouillon_phase1_audit », « evaluation.brouillon_phase2_analyse », « evaluation.errorsTable[].rule ») DOIT ÊTRE INTÉGRALEMENT RÉDIGÉ EN VIETNAMIEN avec tous les accents et tons vietnamiens.
IL EST STRICTEMENT INTERDIT DE RÉDIGER LE CORPS DE CES SECTIONS EN FRANÇAIS. Traduis et adapte tout le retour pédagogique en vietnamien. Les citations textuelles de l'élève (entre guillemets « ... ») ainsi que 'original', 'correction' et 'transcriptionCorrigee' restent en français.`;
  } else if (language !== 'FR') {
    langAlert = `\n\n⚠️ RAPPEL LANGUE OBLIGATOIRE DU RAPPORT : Tu dois impérativement rédiger toutes les justifications, conseils et règles en ${language}. Il est strictement interdit de laisser ces sections en français.`;
  }

  return `Sujet de l'examen : "${subject}"
Transcription du candidat : "
${studentTranscription}
"

=== ÉVALUATION DE L'EXAMINATEUR 1 (${firstProvider}) ===
${JSON.stringify(cleanFirst, null, 2)}

=== ÉVALUATION DE L'EXAMINATEUR 2 (${secondProvider}) ===
${JSON.stringify(cleanSecond, null, 2)}

Produis maintenant le JSON d'arbitrage final contenant "evaluation" et "comparisonNotes".${langAlert}`;
}
