export interface POErrorItem {
  original: string;
  correction: string;
  rule: string;
  apiOriginal?: string | null;
  apiCorrection?: string | null;
}

export interface EvaluationData {
  studentEmail: string | null;
  studentName: string | null;
  classId?: string | null;
  className?: string | null;
  studentId?: string | null;
  subject?: string;
  transcription: string;
  transcriptionCorrigee?: string;
  globalScore: number;
  file?: string;
  criteriaScores: Record<string, number>;
  justifications: Record<string, string>;
  advices?: Record<string, string>;
  errorsTable: POErrorItem[];
  notationType?: 'detailed' | 'delf';
  /** Identifiant dans l'historique, présent dès que le bilan y a été enregistré. */
  id?: string;
  draftId?: string;
  _comparison?: {
    firstEval: any;
    secondEval: any;
    thirdEval?: any;
    firstProvider: string;
    secondProvider: string;
    thirdProvider?: string;
  };
  fallbackNotice?: string;
  modelUsed?: string;
  audioAnalysis?: {
    duration?: number;
    wpm?: number;
    pauseCount?: number;
    clarityScore?: number;
  };
  examType?: 'delf' | 'interpretation';
  maxScore?: number;
  sourceSpeech?: string;
  mode?: 'consecutive' | 'simultaneous';
  sourceLanguage?: string;
  targetLanguage?: string;
}
