import { CustomExamConfig, DEFAULT_DICTATION_PENALTIES, ExamType } from './customExamTypes';
import { DEFAULT_TRANSLATION_CRITERIA } from './traductionEngine';
import { DEFAULT_INTERPRETATION_CRITERIA } from './po/interpretationEngine';

export interface CustomExamPreset {
  id: string;
  name: string;
  examType: ExamType;
  createdAt: string;
  description?: string;
  config: {
    maxScore: number;
    referenceText?: string;
    modelTranslation?: string;
    customInstructions?: string;
    dictationPenalties?: typeof DEFAULT_DICTATION_PENALTIES;
    sourceLanguage?: string;
    targetLanguage?: string;
    interpretationMode?: 'consecutive' | 'simultaneous';
    answerKey?: string;
    exerciseSubject?: string;
    compositionType?: 'essai' | 'redaction' | 'dissertation';
    corpusText?: string;
    disableStandardGrid?: boolean;
  };
}

export const BUILT_IN_PRESETS: CustomExamPreset[] = [
  {
    id: 'preset-dictee-10',
    name: 'Dictée classique (/10)',
    examType: 'dictee',
    createdAt: '2026-01-01',
    description: 'Barème classique sur 10 pts : grammaire -1 pt, lexique -0.5 pt, accent/ponct -0.25 pt, répétitions comptées 1 fois.',
    config: {
      maxScore: 10,
      dictationPenalties: {
        grammar: 1.0,
        usage: 0.5,
        accent: 0.25,
        punctuation: 0.25,
        omissionWord: 0.5,
        allowNegative: false,
        countRepeatedOnce: true
      }
    }
  },
  {
    id: 'preset-dictee-concours-20',
    name: 'Dictée de concours (/20 avec notes négatives)',
    examType: 'dictee',
    createdAt: '2026-01-01',
    description: 'Barème strict sur 20 pts avec possibilité de note finale négative et sanctions sévères.',
    config: {
      maxScore: 20,
      dictationPenalties: {
        grammar: 2.0,
        usage: 1.0,
        accent: 0.5,
        punctuation: 0.5,
        omissionWord: 1.0,
        allowNegative: true,
        countRepeatedOnce: false
      }
    }
  },
  {
    id: 'preset-traduction-10',
    name: 'Traduction standard (/10)',
    examType: 'traduction',
    createdAt: '2026-01-01',
    description: 'Évaluation équilibrée (Fidélité au sens, Correction grammaticale, Richesse lexicale, Respect du registre).',
    config: {
      maxScore: 10,
      sourceLanguage: 'Français',
      targetLanguage: 'Français',
      customInstructions: 'Évaluer la fidélité, le niveau de langue et la correction syntaxique.'
    }
  },
  {
    id: 'preset-grammaire-10',
    name: 'Exercices de grammaire (/10)',
    examType: 'grammaire',
    createdAt: '2026-01-01',
    description: 'Correction question par question selon le corrigé fourni.',
    config: {
      maxScore: 10,
      customInstructions: 'Attribuer les points par question selon la clé de correction. Justifier chaque écart.'
    }
  },
  {
    id: 'preset-interpretation-consecutive-10',
    name: 'Interprétation consécutive (/10)',
    examType: 'interpretation',
    createdAt: '2026-01-01',
    description: 'Fidélité au discours original, complétude des idées clés, fluidité et déontologie.',
    config: {
      maxScore: 10,
      interpretationMode: 'consecutive',
      sourceLanguage: 'Français',
      targetLanguage: 'Français'
    }
  },
  {
    id: 'preset-composition-essai-20',
    name: 'Essai en langue étrangère (/20)',
    examType: 'composition',
    createdAt: '2026-01-01',
    description: 'Essai argumenté (FLE ou langue vivante) : problématisation, argumentation, morphosyntaxe, lexique et style.',
    config: {
      maxScore: 20,
      compositionType: 'essai',
      targetLanguage: 'Français',
      customInstructions: 'Évaluer la force de l\'argumentation, la structuration logique et la correction linguistique.'
    }
  },
  {
    id: 'preset-composition-redaction-20',
    name: 'Rédaction niveau collège (/20)',
    examType: 'composition',
    createdAt: '2026-01-01',
    description: 'Écriture d\'invention ou de réflexion (collège/DNB) : respect des consignes, invention, orthographe et syntaxe, richesse lexicale.',
    config: {
      maxScore: 20,
      compositionType: 'redaction',
      customInstructions: 'Tenir compte du niveau attendu au cycle 4 (collège) : cohérence narrative, paragraphes et orthographe.'
    }
  },
  {
    id: 'preset-composition-dissertation-20',
    name: 'Dissertation niveau lycée (/20)',
    examType: 'composition',
    createdAt: '2026-01-01',
    description: 'Dissertation littéraire ou générale (lycée/baccalauréat) : problématique, plan rigoureux, références et style académique.',
    config: {
      maxScore: 20,
      compositionType: 'dissertation',
      customInstructions: 'Exiger une problématique claire, un plan structuré avec transitions, des analyses précises d\'œuvres et un style soutenu.'
    }
  }
];

const PRESET_STORAGE_KEY = 'correcteur_custom_exam_presets';

export function getSavedPresets(): CustomExamPreset[] {
  if (typeof window === 'undefined') return BUILT_IN_PRESETS;
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY);
    if (!raw) return BUILT_IN_PRESETS;
    const userPresets: CustomExamPreset[] = JSON.parse(raw);
    return [...BUILT_IN_PRESETS, ...userPresets];
  } catch {
    return BUILT_IN_PRESETS;
  }
}

export function saveUserPreset(preset: Omit<CustomExamPreset, 'id' | 'createdAt'>): CustomExamPreset {
  const newPreset: CustomExamPreset = {
    ...preset,
    id: `preset-user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    createdAt: new Date().toISOString()
  };
  if (typeof window === 'undefined') return newPreset;
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY);
    const existing: CustomExamPreset[] = raw ? JSON.parse(raw) : [];
    const updated = [newPreset, ...existing];
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Erreur enregistrement preset:', err);
  }
  return newPreset;
}

export function deleteUserPreset(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY);
    if (!raw) return;
    const existing: CustomExamPreset[] = JSON.parse(raw);
    const filtered = existing.filter(p => p.id !== id);
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error('Erreur suppression preset:', err);
  }
}
