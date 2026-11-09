/**
 * Typages partagés pour les types d'épreuves personnalisables (PE et PO).
 * Couvre : Dictée, Traduction, Exercices de grammaire, Interprétation et DELF.
 */

export type ExamType = 'delf_b1' | 'delf_b2' | 'traduction' | 'dictee' | 'grammaire' | 'interpretation' | 'composition';

export interface DictationPenaltyConfig {
  grammar: number;             // ex: 1 pt par faute de grammaire/accord
  usage: number;               // ex: 0.5 pt par faute lexicale / d'usage
  accent: number;              // ex: 0.25 pt par faute d'accent
  punctuation: number;         // ex: 0.25 pt par faute de ponctuation / majuscule
  omissionWord: number;        // ex: 0.5 pt par mot manquant
  allowNegative: boolean;      // autorise une note finale < 0 (sans plancher à 0)
  countRepeatedOnce: boolean;  // la même faute répétée sur un mot identique n'est sanctionnée qu'une fois
}

export const DEFAULT_DICTATION_PENALTIES: DictationPenaltyConfig = {
  grammar: 1.0,
  usage: 0.5,
  accent: 0.25,
  punctuation: 0.25,
  omissionWord: 0.5,
  allowNegative: false,
  countRepeatedOnce: true,
};

export interface CustomCriterion {
  key: string;
  label: string;
  maxScore: number;
  description?: string;
  domain?: string;
  domainMax?: number;
}

export interface CustomExamConfig {
  type: ExamType;
  title?: string;
  maxScore: number;                   // ex: 10 ou 20
  referenceText?: string;             // Texte de la dictée, texte source de traduction ou corrigé
  modelTranslation?: string;          // Traduction de référence optionnelle (pour la traduction)
  customInstructions?: string;        // Consignes, barème libre ou règles rédigées par l'enseignant
  
  // Spécifique Dictée
  dictationPenalties?: DictationPenaltyConfig;

  // Spécifique Traduction / Interprétation
  sourceLanguage?: string;            // ex: "Français", "Anglais", "Vietnamien"
  targetLanguage?: string;            // ex: "Français", "Anglais", "Vietnamien"
  interpretationMode?: 'consecutive' | 'simultaneous';
  criteria?: CustomCriterion[];

  // Spécifique Composition
  compositionType?: 'essai' | 'redaction' | 'dissertation';
  compositionLanguage?: string;
  corpusText?: string;
  disableStandardGrid?: boolean;
}

export interface DictationErrorItem {
  original: string;
  correction: string;
  type: 'grammar' | 'usage' | 'accent' | 'punctuation' | 'omission' | 'addition';
  rule: string;
  penaltyApplied?: number;
  isRepeated?: boolean;
}

export interface DictationResult {
  examType: 'dictee';
  globalScore: number;
  maxScore: number;
  penaltiesTotal: number;
  errors: DictationErrorItem[];
  breakdown: {
    grammar: { count: number; penaltyPoints: number };
    usage: { count: number; penaltyPoints: number };
    accent: { count: number; penaltyPoints: number };
    punctuation: { count: number; penaltyPoints: number };
    omission: { count: number; penaltyPoints: number };
    addition: { count: number; penaltyPoints: number };
  };
  transcription: string;
  referenceText: string;
  feedback?: string;
  studentName?: string | null;
  studentEmail?: string | null;
}
