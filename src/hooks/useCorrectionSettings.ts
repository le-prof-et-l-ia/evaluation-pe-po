"use client";

import { useEffect, useState } from "react";
import { usePersistentState, usePersistentRawState, usePersistentBoolean } from "./usePersistentState";
import { ExamType, DictationPenaltyConfig, DEFAULT_DICTATION_PENALTIES } from "@/lib/customExamTypes";

export type Level = "B1" | "B2";
export type FeedbackLanguage = "FR" | "VN" | "CZ" | "TW" | "EN";
export type KeyMode = "free_only" | "paid_only" | "both";
export type GradingMode = "detailed" | "delf";
export type EvaluationMode = "internal" | "external";

export interface ApiKeysConfig {
  gemini: { freeKeys: string; paidKey: string };
  [key: string]: any;
}

const DEFAULT_API_KEYS: ApiKeysConfig = {
  gemini: { freeKeys: "", paidKey: "" },
};

/**
 * Langue maternelle de l'apprenant.
 *
 * Le réglage est stocké sous forme composée (« vietnamien et anglais ») pour
 * rester compatible avec les valeurs déjà présentes dans le navigateur. Cette
 * logique de migration provient telle quelle de `page.tsx` : la modifier
 * réinitialiserait le réglage des utilisateurs existants.
 */
function useNativeLanguage() {
  const [nativeLanguageSelect, setNativeLanguageSelect] = useState<string>("Aucune");
  const [plusEnglish, setPlusEnglish] = useState<boolean>(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("delf_native_language");
      const savedPlusEnglish = localStorage.getItem("delf_plus_english");

      if (saved) {
        if (saved.includes(" et anglais")) {
          const clean = saved.replace(" et anglais", "");
          setNativeLanguageSelect(clean === "chinois (Taïwan)" ? "chinois" : clean);
          setPlusEnglish(true);
        } else if (saved === "anglais") {
          setNativeLanguageSelect("Aucune");
          setPlusEnglish(true);
        } else {
          setNativeLanguageSelect(saved === "chinois (Taïwan)" ? "chinois" : saved);
          if (savedPlusEnglish) setPlusEnglish(savedPlusEnglish === "true");
        }
      } else if (savedPlusEnglish) {
        setPlusEnglish(savedPlusEnglish === "true");
      }
    } catch {
      /* stockage indisponible */
    }
    setHydrated(true);
  }, []);

  // Valeur composée transmise à l'API, telle qu'attendue par les prompts.
  const nativeLanguage =
    nativeLanguageSelect === "Aucune"
      ? plusEnglish
        ? "anglais"
        : "Aucune"
      : nativeLanguageSelect + (plusEnglish ? " et anglais" : "");

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem("delf_native_language", nativeLanguageSelect);
      localStorage.setItem("delf_plus_english", String(plusEnglish));
    } catch {
      /* stockage indisponible */
    }
  }, [hydrated, nativeLanguageSelect, plusEnglish]);

  return { nativeLanguageSelect, setNativeLanguageSelect, plusEnglish, setPlusEnglish, nativeLanguage };
}

/**
 * Modèle d'e-mail (objet + corps), dépendant du niveau sélectionné.
 * Chaque niveau a son propre modèle : changer de niveau recharge le modèle
 * correspondant, ou en régénère un par défaut s'il n'existe pas encore.
 */
function useEmailTemplate(level: Level, signature: string = "L'équipe pédagogique", section: 'pe' | 'po' = 'pe') {
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const typeLabel = section === 'po' ? 'production orale' : 'production écrite';

  useEffect(() => {
    let savedSubject: string | null = null;
    let savedBody: string | null = null;
    try {
      savedSubject = localStorage.getItem(`delf_${section}_email_subject_${level}`) || localStorage.getItem(`delf_email_subject_${level}`);
      savedBody = localStorage.getItem(`delf_${section}_email_body_${level}`) || localStorage.getItem(`delf_email_body_${level}`);
    } catch {
      /* stockage indisponible */
    }

    const defaultSubject = `Votre bilan de ${typeLabel} DELF ${level}`;
    setEmailSubject(savedSubject || defaultSubject);
    setEmailBody(
      savedBody ||
        `Bonjour,\n\nVoici le bilan de votre ${typeLabel}.\n\nBien cordialement,\n\n${signature}`
    );
  }, [level, signature, section, typeLabel]);

  useEffect(() => {
    if (!emailSubject) return;
    try { localStorage.setItem(`delf_${section}_email_subject_${level}`, emailSubject); } catch { /* ignore */ }
  }, [emailSubject, level, section]);

  useEffect(() => {
    if (!emailBody) return;
    try { localStorage.setItem(`delf_${section}_email_body_${level}`, emailBody); } catch { /* ignore */ }
  }, [emailBody, level, section]);

  return { emailSubject, setEmailSubject, emailBody, setEmailBody };
}

/**
 * Tous les réglages de correction persistés entre deux sessions.
 *
 * @param section 'pe' pour production écrite ou 'po' pour production orale.
 */
export function useCorrectionSettings(section: 'pe' | 'po' = 'pe') {
  // ── Niveau, langue, notation ───────────────────────────────────────────────
  const levelKey = section === "po" ? "delf_po_level" : "delf_level";
  const [level, setLevel] = usePersistentRawState<Level>(levelKey, "B2");
  const [language, setLanguage] = usePersistentRawState<FeedbackLanguage>("delf_language", "FR");
  const [gradingMode, setGradingMode] = usePersistentRawState<GradingMode>("delf_grading_mode", "delf");
  const nativeLanguageState = useNativeLanguage();

  // ── Modèles ───────────────────────────────────────────────────────────────
  const [evalModel, setEvalModel] = usePersistentRawState<string>("delf_eval_model", "flash");
  const [ocrModel, setOcrModel] = useState<string>("gemini-3.8-flash");

  // ── Double évaluation ─────────────────────────────────────────────────────
  const [useDoubleEval, setUseDoubleEval] = usePersistentBoolean("delf_use_double_eval", true);
  const [supervisionMode, setSupervisionMode] = usePersistentRawState<EvaluationMode>(
    "delf_supervision_mode", "external",
    (raw) => raw === "internal" || raw === "external"
  );
  const [supervisionProvider, setSupervisionProvider] = usePersistentRawState<string>("delf_supervision_provider", "gemini");
  const [supervisionModel, setSupervisionModel] = usePersistentRawState<string>("delf_supervision_model", "flash");

  // ── Clés API ──────────────────────────────────────────────────────────────
  const [apiKeys, setApiKeys] = usePersistentState<ApiKeysConfig>("delf_api_keys", DEFAULT_API_KEYS);
  const [keyMode, setKeyMode] = usePersistentRawState<KeyMode>("delf_key_mode", "both");
  const [ocrKeyMode, setOcrKeyMode] = usePersistentRawState<KeyMode>("delf_ocr_key_mode", "both");

  // Compatibilité : ancien réglage booléen remplacé par `delf_key_mode`.
  useEffect(() => {
    try {
      if (localStorage.getItem("delf_key_mode")) return;
      const legacyOnlyFree = localStorage.getItem("delf_only_free_keys");
      if (legacyOnlyFree) setKeyMode(legacyOnlyFree === "true" ? "free_only" : "both");
    } catch {
      /* stockage indisponible */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nettoyage automatique des anciens fournisseurs supprimés (Claude, Mistral, OpenAI, DeepSeek)
  useEffect(() => {
    try {
      const allowedProviders = ["gemini"];
      const currentSupProv = localStorage.getItem("delf_supervision_provider");
      if (currentSupProv && !allowedProviders.includes(currentSupProv)) {
        setSupervisionProvider("gemini");
        setSupervisionModel("flash");
      }
      const currentEval = localStorage.getItem("delf_eval_model");
      if (currentEval && (currentEval.startsWith("mistral-") || currentEval.startsWith("claude-") || currentEval.startsWith("gpt-") || currentEval.startsWith("deepseek-"))) {
        setEvalModel("flash");
      }
    } catch {
      /* stockage indisponible */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sujets et dossiers ────────────────────────────────────────────────────
  const subjectKey = section === "po" ? "delf_po_subject" : "delf_subject";
  const batchSubjectKey = section === "po" ? "delf_po_batch_subject" : "delf_batch_subject";
  const batchFolderKey = section === "po" ? "delf_po_batch_folder" : "delf_batch_folder";

  const [subject, setSubject] = usePersistentRawState<string>(subjectKey, "");
  const [batchSubject, setBatchSubject] = usePersistentRawState<string>(batchSubjectKey, "");
  const [batchFolder, setBatchFolder] = usePersistentRawState<string>(batchFolderKey, "data/inputs");
  const [outputFolder, setOutputFolder] = usePersistentRawState<string>("delf_output_folder", "data/outputs");

  // ── E-mail ────────────────────────────────────────────────────────────────
  const [emailConfig, setEmailConfig] = usePersistentState<{ user: string; pass: string }>(
    "delf_email_config", { user: "", pass: "" }
  );
  const [signature, setSignature] = usePersistentRawState<string>(
    "delf_email_signature", "L'équipe pédagogique"
  );
  const emailTemplate = useEmailTemplate(level, signature, section);

  const examTypeKey = section === "po" ? "delf_po_exam_type" : "delf_exam_type";
  const [examType, setExamType] = usePersistentRawState<ExamType>(
    examTypeKey,
    level === "B1" ? "delf_b1" : "delf_b2"
  );

  // ── Paramètres d'épreuves personnalisées ──────────────────────────────────
  const [customMaxScore, setCustomMaxScore] = usePersistentState<number>(`delf_${section}_custom_max_score`, 10);
  const [dictationReferenceText, setDictationReferenceText] = usePersistentRawState<string>(`delf_dictation_ref_text`, "");
  const [dictationPenalties, setDictationPenalties] = usePersistentState<DictationPenaltyConfig>(
    `delf_dictation_penalties`,
    DEFAULT_DICTATION_PENALTIES
  );
  const [translationSourceText, setTranslationSourceText] = usePersistentRawState<string>(`delf_translation_src_text`, "");
  const [translationModel, setTranslationModel] = usePersistentRawState<string>(`delf_translation_model`, "");
  const [translationSourceLang, setTranslationSourceLang] = usePersistentRawState<string>(`delf_translation_src_lang`, "Français");
  const [translationTargetLang, setTranslationTargetLang] = usePersistentRawState<string>(`delf_translation_tgt_lang`, "Français");
  const [grammarExerciseSubject, setGrammarExerciseSubject] = usePersistentRawState<string>(`delf_grammar_subject`, "");
  const [grammarAnswerKey, setGrammarAnswerKey] = usePersistentRawState<string>(`delf_grammar_key`, "");
  const [interpretationSourceSpeech, setInterpretationSourceSpeech] = usePersistentRawState<string>(`delf_interp_src_speech`, "");
  const [interpretationMode, setInterpretationMode] = usePersistentRawState<'consecutive' | 'simultaneous'>(`delf_interp_mode`, 'consecutive');
  const [compositionType, setCompositionType] = usePersistentRawState<'essai' | 'redaction' | 'dissertation'>(`delf_composition_type`, 'essai');
  const [compositionCorpus, setCompositionCorpus] = usePersistentRawState<string>(`delf_composition_corpus`, "");
  const [compositionLanguage, setCompositionLanguage] = usePersistentRawState<string>(`delf_composition_lang`, "Français");
  const [compositionSubject, setCompositionSubject] = usePersistentRawState<string>(`delf_composition_subject`, "");
  const [compositionDisableGrid, setCompositionDisableGrid] = usePersistentState<boolean>(`delf_composition_disable_grid`, false);
  const [customInstructions, setCustomInstructions] = usePersistentRawState<string>(`delf_${section}_custom_instructions`, "");

  /**
   * Changement de type d'épreuve : adapte automatiquement le niveau DELF sous-jacent
   * tout en conservant la configuration des modèles.
   */
  const handleExamTypeChange = (newType: ExamType) => {
    setExamType(newType);
    if (newType === "delf_b1") {
      setLevel("B1");
    } else if (newType === "delf_b2") {
      setLevel("B2");
    } else if (newType === "composition") {
      // Pour une composition, le barème standard français est sur 20 points
      if (customMaxScore === 10) {
        setCustomMaxScore(20);
      }
    }
    setEvalModel("flash");
    setSupervisionProvider("gemini");
    setSupervisionModel("flash");
  };

  /**
   * Changement de niveau : maintient Gemini Flash comme sélection par défaut
   * pour tous les niveaux (B1, B2).
   */
  const handleLevelChange = (newLevel: Level) => {
    setLevel(newLevel);
    setExamType(newLevel === "B1" ? "delf_b1" : "delf_b2");
    setEvalModel("flash");
    setSupervisionProvider("gemini");
    setSupervisionModel("flash");
  };

  return {
    examType, setExamType, handleExamTypeChange,
    customMaxScore, setCustomMaxScore,
    dictationReferenceText, setDictationReferenceText,
    dictationPenalties, setDictationPenalties,
    translationSourceText, setTranslationSourceText,
    translationModel, setTranslationModel,
    translationSourceLang, setTranslationSourceLang,
    translationTargetLang, setTranslationTargetLang,
    grammarExerciseSubject, setGrammarExerciseSubject,
    grammarAnswerKey, setGrammarAnswerKey,
    interpretationSourceSpeech, setInterpretationSourceSpeech,
    interpretationMode, setInterpretationMode,
    compositionType, setCompositionType,
    compositionCorpus, setCompositionCorpus,
    compositionLanguage, setCompositionLanguage,
    compositionSubject, setCompositionSubject,
    compositionDisableGrid, setCompositionDisableGrid,
    customInstructions, setCustomInstructions,
    level, setLevel, handleLevelChange,
    language, setLanguage,
    gradingMode, setGradingMode,
    notationType: gradingMode, setNotationType: setGradingMode,
    ...nativeLanguageState,
    evalModel, setEvalModel,
    ocrModel, setOcrModel,
    useDoubleEval, setUseDoubleEval,
    supervisionMode, setSupervisionMode,
    supervisionProvider, setSupervisionProvider,
    supervisionModel, setSupervisionModel,
    apiKeys, setApiKeys,
    keyMode, setKeyMode,
    ocrKeyMode, setOcrKeyMode,
    subject, setSubject,
    batchSubject, setBatchSubject,
    batchFolder, setBatchFolder,
    outputFolder, setOutputFolder,
    emailConfig, setEmailConfig,
    signature, setSignature,
    ...emailTemplate,
  };
}
