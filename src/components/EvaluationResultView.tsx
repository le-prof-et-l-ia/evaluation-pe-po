"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { Send, Save, Edit3, Loader2, Printer, FileText, CheckCircle, X, GitCompare, Zap, Brain, Eye, RotateCcw, Scale, FileDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { generatePEMarkdown } from "@/lib/markdownGenerator";
import { formatScore } from "@/lib/scoreUtils";
import { getCriteriaConfig } from "@/lib/promptUtils";
import { DEFAULT_TRANSLATION_CRITERIA } from "@/lib/traductionEngine";
import Aide from "@/components/Aide";
import { getCompositionCriteria, getCompositionTypeLabel, type CompositionSubType } from "@/lib/compositionEngine";

export interface EvaluationData {
  studentEmail: string | null;
  studentName: string | null;
  classId?: string | null;
  className?: string | null;
  studentId?: string | null;
  subject?: string;
  level?: string;
  transcription: string;
  globalScore: number;
  file?: string;
  criteriaScores: Record<string, number>;
  justifications: Record<string, string>;
  advices?: Record<string, string>;
  errorsTable: Array<{
    original: string;
    correction: string;
    rule: string;
  }>;
  _comparison?: {
    firstEval: any;
    secondEval: any;
    thirdEval?: any;
    firstProvider: string;
    secondProvider: string;
    thirdProvider?: string;
  };
  ocrAlerts?: string[];
  fallbackNotice?: string;
  modelUsed?: string;
  /** Identifiant dans l'historique, présent dès que le bilan y a été enregistré. */
  id?: string;

  // Propriétés spécifiques aux types d'épreuves personnalisées
  examType?: 'delf' | 'dictee' | 'traduction' | 'grammaire' | 'interpretation' | 'composition';
  maxScore?: number;
  penaltiesTotal?: number;
  breakdown?: {
    grammar?: { count: number; penaltyPoints: number };
    usage?: { count: number; penaltyPoints: number };
    accent?: { count: number; penaltyPoints: number };
    punctuation?: { count: number; penaltyPoints: number };
    omission?: { count: number; penaltyPoints: number };
    addition?: { count: number; penaltyPoints: number };
  };
  referenceText?: string;
  feedback?: string;
  sourceText?: string;
  modelTranslation?: string;
  items?: Array<{
    questionNumber: number | string;
    studentAnswer: string;
    correctAnswer: string;
    pointsAwarded: number;
    pointsMax: number;
    status: 'correct' | 'partial' | 'incorrect';
    feedback?: string;
  }>;
  summaryFeedback?: string;
  detailedErrors?: any[];

  // Composition
  compositionType?: CompositionSubType;
  corpusText?: string;
  generalFeedback?: string;
}

// Ré-export depuis la source unique pour compatibilité avec les imports existants.
export { getFriendlyModelName } from "@/lib/modelNames";
import { getFriendlyModelName } from "@/lib/modelNames";
import { jsonHistorique } from "@/lib/historique";

interface Props {
  data: EvaluationData;
  level?: string;
  gradingMode?: 'detailed' | 'delf';
  onSendFeedback: (finalData: EvaluationData) => void;
  onDataChange?: (updatedData: EvaluationData) => void;
  onSupervise?: (mode?: 'internal' | 'external') => Promise<void> | void;
  isSupervising?: boolean;
  supervisionModelName?: string;
  subject?: string;
  evalModel?: string;
  outputFolder?: string;
}

function buildFlexibleRegexPattern(original: string): string | null {
  if (!original || typeof original !== 'string') return null;
  const trimmed = original.trim();
  if (!trimmed) return null;

  const escapeRegex = (str: string) => str.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  // Séparateur flexible : espaces, sauts de ligne, ponctuations, guillemets, tirets
  const fillerPattern = `(?:\\s+|[,;:.…—–\\-«»"'\u2019\u2018\u201c\u201d]|\\[[^\\]]*\\])+`;

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  const escapedWords = words.map(w => {
    let esc = escapeRegex(w);
    esc = esc.replace(/['\u2019\u0027]/g, "['’\u2019\u0027]");
    esc = esc.replace(/["«»\u201c\u201d]/g, '["«»\u201c\u201d]');
    return esc;
  });

  return escapedWords.join(fillerPattern);
}

const CorrectedText = ({ text, corrections }: { text: string, corrections: any[] }) => {
  const parts = useMemo(() => {
    if (!corrections || corrections.length === 0) return [text];
    
    // On repère toutes les fautes et on trie de la plus longue à la plus courte (pour éviter les sous-matchs)
    const sortedCorrections = [...corrections]
      .filter(c => c.original && typeof c.original === 'string' && c.original.trim() !== "")
      .sort((a, b) => b.original.length - a.original.length);
    
    if (sortedCorrections.length === 0) return [text];

    const finalParts: (string | any)[] = [text];

    for (const correction of sortedCorrections) {
      const regexPattern = buildFlexibleRegexPattern(correction.original);
      if (!regexPattern) continue;

      let regex: RegExp;
      try {
        regex = new RegExp(regexPattern, "giu");
      } catch {
        regex = new RegExp(regexPattern, "gi");
      }

      let i = 0;
      
      while (i < finalParts.length) {
        const currentPart = finalParts[i];
        if (typeof currentPart === "string") {
          const subParts: (string | any)[] = [];
          let lastIndex = 0;
          let match: RegExpExecArray | null;

          regex.lastIndex = 0;
          while ((match = regex.exec(currentPart)) !== null) {
            const preChar = currentPart[match.index - 1];
            const postChar = currentPart[match.index + match[0].length];
            const isBoundaryBefore = !preChar || /[^\p{L}\p{N}]/u.test(preChar);
            const isBoundaryAfter = !postChar || /[^\p{L}\p{N}]/u.test(postChar);
            
            if (isBoundaryBefore && isBoundaryAfter) {
              if (match.index > lastIndex) subParts.push(currentPart.substring(lastIndex, match.index));
              subParts.push({ ...correction, _matchedText: match[0] });
              lastIndex = regex.lastIndex;
            } else {
              if (match[0].length === 0) {
                regex.lastIndex++;
              }
            }
          }
          
          if (lastIndex < currentPart.length) subParts.push(currentPart.substring(lastIndex));
          if (subParts.length > 0) {
            finalParts.splice(i, 1, ...subParts);
            i += subParts.length - 1;
          }
        }
        i++;
      }
    }
    return finalParts;
  }, [text, corrections]);

  return (
    <div className={"text-slate-700 leading-relaxed font-medium whitespace-pre-wrap text-lg break-words"}>
      {parts.map((part, index) => {
        if (typeof part === "string") return <React.Fragment key={index}>{part}</React.Fragment>;
        const correction = part;
        return (
          <span key={index} className={"relative group inline-block bg-blue-50 text-blue-800 rounded-lg px-2 border border-blue-100 cursor-help transition-colors hover:bg-blue-100 print:bg-transparent print:border-none print:px-0"}>
            <span className={"print:line-through"}>{correction._matchedText || correction.original}</span>
            <span className={"no-print absolute hidden group-hover:block bottom-full mb-3 left-1/2 -translate-x-1/2 w-64 bg-slate-800 text-white text-xs rounded-2xl p-4 shadow-2xl z-30 leading-normal animate-in zoom-in duration-200"}>
              <span className={"block font-black text-blue-400 uppercase tracking-widest mb-2 border-b border-slate-700 pb-1"}>Correction suggérée</span>
              <strong className={"block text-sm mb-2 text-white"}>{correction.correction}</strong>
              <span className={"block font-black text-slate-500 uppercase tracking-widest mb-1"}>Explication</span>
              <span className={"block text-slate-300 italic"}>{correction.rule}</span>
              <span className={"absolute bottom-[-8px] left-1/2 -translate-x-1/2 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-slate-800"}></span>
            </span>
          </span>
        );
      })}
    </div>
  );
};

const scoreStyles: Record<number, string> = {
  5: "bg-emerald-100 text-emerald-800 border-emerald-300",
  4: "bg-emerald-50 text-emerald-700 border-emerald-200",
  3: "bg-amber-100 text-amber-800 border-amber-300",
  2: "bg-orange-50 text-orange-700 border-orange-200",
  1: "bg-rose-50 text-rose-700 border-rose-200",
  0: "bg-rose-100 text-rose-800 border-rose-300",
};

const getCardScoreStyle = (score: number, maxScore: number = 5): string => {
  if (maxScore === 5) {
    return scoreStyles[Math.floor(score)] || "bg-white";
  }
  const ratio = maxScore > 0 ? (score || 0) / maxScore : 0;
  if (ratio >= 0.8) return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (ratio >= 0.6) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (ratio >= 0.5) return "bg-amber-100 text-amber-800 border-amber-300";
  if (ratio >= 0.35) return "bg-orange-50 text-orange-700 border-orange-200";
  return "bg-rose-100 text-rose-800 border-rose-300";
};

const getScoreLabel = (note: number, level: string = 'B2', maxScore: number = 5) => {
  if (maxScore !== 5) {
    const ratio = maxScore > 0 ? (note || 0) / maxScore : 0;
    if (ratio >= 0.8) return `Niveau B2+ (Maîtrise complète)`;
    if (ratio >= 0.6) return `Niveau B2 (Très bon contrôle)`;
    if (ratio >= 0.5) return `Niveau B2 (Acquis / Au niveau)`;
    if (ratio >= 0.35) return `En dessous du niveau B2 (Transition)`;
    return `En dessous du niveau B2 (Insuffisant)`;
  }
  const rounded = Math.floor(note);
  if (rounded === 5) return `Niveau ${level}+ (Maîtrise complète)`;
  if (rounded === 4) return `Niveau ${level} (Très bon contrôle)`;
  if (rounded === 3) return `Niveau ${level} (Acquis / Au niveau)`;
  if (rounded === 2) return `En dessous du niveau ${level} (Transition)`;
  if (rounded === 1) return `En dessous du niveau ${level} (Insuffisant)`;
  return "Non répondu ou production insuffisante";
};

const CriterionCard = ({ 
  label, 
  score, 
  maxScore = 5,
  justification, 
  advice, 
  isEditing, 
  onScoreChange, 
  onJustificationChange,
  onAdviceChange,
  level = 'B2',
  gradingMode = 'delf',
  afficherAide = false
}: { 
  label: string, 
  score: number, 
  maxScore?: number,
  justification: string, 
  advice?: string, 
  isEditing: boolean, 
  onScoreChange: (val: number) => void, 
  onJustificationChange?: (val: string) => void,
  onAdviceChange?: (val: string) => void,
  level?: string,
  gradingMode?: 'detailed' | 'delf',
  afficherAide?: boolean
}) => {
  const [isOpen, setIsOpen] = useState(true);

  const options = useMemo(() => {
    if (maxScore !== 5) {
      const opts: number[] = [];
      const steps = Math.round(maxScore * 10);
      for (let i = steps; i >= 0; i--) {
        opts.push(Math.round(i) / 10);
      }
      const safeScore = Math.round((score || 0) * 10) / 10;
      if (!opts.includes(safeScore)) {
        opts.push(safeScore);
        opts.sort((a, b) => b - a);
      }
      return opts;
    }
    const base = gradingMode === 'delf' ? [5, 3, 1, 0] : [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5, 0];
    if (!base.includes(score)) {
      const copy = [...base, score];
      copy.sort((a, b) => b - a);
      return copy;
    }
    return base;
  }, [score, gradingMode, maxScore, level]);

  const cardStyle = getCardScoreStyle(score, maxScore);
  const formattedScore = formatScore(score);
  const formattedMax = formatScore(maxScore);

  return (
    <div className={"border border-slate-200 rounded-[1.5rem] overflow-hidden transition-all shadow-sm hover:shadow-md bg-white print:border-none print:shadow-none print:mb-4 page-break-avoid"}>
      
      {/* Header Web Interactif */}
      <button onClick={() => setIsOpen(!isOpen)} className={"no-print w-full flex justify-between items-center p-5 bg-slate-50 hover:bg-slate-100 focus:outline-none transition-colors"}>
        <div className={"flex items-center space-x-6 text-left"}>
          <div className={"relative w-[110px]"}>
            {isEditing ? (
              <select onClick={(e) => e.stopPropagation()} value={score} onChange={(e) => { e.stopPropagation(); onScoreChange(parseFloat(e.target.value)); }} className={"w-full appearance-none cursor-pointer text-center px-4 py-2 rounded-xl text-lg font-black border-2 focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all " + cardStyle}>
                {options.map(v => <option key={v} value={v}>{formatScore(v)} / {formattedMax}</option>)}
              </select>
            ) : (
              <div className={"w-full text-center px-4 py-2 rounded-xl text-lg font-black border-2 " + cardStyle}>
                {formattedScore} / {formattedMax}
              </div>
            )}
            {isEditing && (
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-inherit opacity-70">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
              </div>
            )}
          </div>
          <div>
            <h4 className={"text-xl font-bold text-slate-800"}>{label}</h4>
            <span className={"text-[10px] font-black uppercase tracking-widest text-slate-400"}>{getScoreLabel(score, level, maxScore)}</span>
          </div>
        </div>
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={"text-slate-400 transition-transform duration-300 " + (isOpen ? "rotate-180" : "")}><polyline points="6 9 12 15 18 9"></polyline></svg>
      </button>

      <div className={"hidden print:flex items-center space-x-4 pb-2 border-b border-slate-200"}>
        <div className={"px-3 py-1 rounded-lg text-sm font-black border-2 text-center " + cardStyle}>{formattedScore} / {formattedMax}</div>
        <div>
           <h4 className={"text-lg font-bold text-slate-800"}>{label}</h4>
           <span className={"text-[10px] font-black uppercase tracking-widest text-slate-500"}>{getScoreLabel(score, level, maxScore)}</span>
        </div>
      </div>

      {/* Contenu (Accordéon sur Web, toujours block sur Print) */}
      <div className={(isOpen ? "block" : "hidden") + " print:block p-6 md:p-8 bg-white border-t border-slate-100 print:border-none print:p-2 animate-in fade-in slide-in-from-top-2"}>
        <div className={"flex flex-col sm:flex-row gap-4"}>
          <div className={"bg-blue-50/50 p-6 rounded-2xl flex-1 border border-blue-50 print:p-0 print:bg-transparent print:border-none print:mb-2"}>
              <h5 className={"font-black text-xs uppercase tracking-widest text-blue-600 mb-3 flex items-center print:hidden"}>
                  <svg className={"w-4 h-4 mr-2"} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5"></path></svg>
                  Descripteurs de performance DELF
                  {afficherAide && <Aide cle="c_descripteurs" taille={14} className="ml-1.5" />}
              </h5>
              {isEditing ? (
                <>
                  <textarea
                    value={justification}
                    onChange={(e) => onJustificationChange?.(e.target.value)}
                    rows={10}
                    className="no-print w-full p-4 rounded-xl border border-blue-200 text-slate-700 leading-relaxed font-medium text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white resize-y"
                  />
                  <p className={"hidden print:block text-slate-700 leading-relaxed font-medium text-lg italic"}>"{justification}"</p>
                </>
              ) : (
                <p className={"text-slate-700 leading-relaxed font-medium text-lg italic"}>"{justification}"</p>
              )}
          </div>
          {(advice !== undefined || isEditing) && (
            <div className={`bg-emerald-50/50 p-6 rounded-2xl flex-1 border border-emerald-50 print:p-0 print:bg-transparent print:border-none ${!advice ? 'print:hidden' : ''}`}>
                <h5 className={"font-black text-xs uppercase tracking-widest text-emerald-600 mb-3 flex items-center print:hidden"}>
                    <svg className={"w-4 h-4 mr-2"} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5"></path></svg>
                    Axes d'amélioration
                    {afficherAide && <Aide cle="c_axesAmelioration" taille={14} className="ml-1.5" />}
                </h5>
                {isEditing ? (
                  <>
                    <textarea
                      value={advice || ""}
                      onChange={(e) => onAdviceChange?.(e.target.value)}
                      rows={10}
                      className="no-print w-full p-4 rounded-xl border border-emerald-200 text-slate-700 leading-relaxed font-medium text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white resize-y"
                      placeholder="Entrez vos conseils d'amélioration..."
                    />
                    <p className={"hidden print:block text-slate-700 leading-relaxed font-medium text-lg"}>{advice}</p>
                  </>
                ) : (
                  <p className={"text-slate-700 leading-relaxed font-medium text-lg"}>{advice}</p>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


function findMatchingStudent(
  detectedName: string | null, 
  detectedEmail: string | null, 
  classes: any[]
): { classId: string; className: string; studentId: string; studentName: string; studentEmail: string } | null {
  
  if (classes.length === 0) return null;

  // 1. Match by Email first (highest accuracy)
  if (detectedEmail) {
    const normEmail = detectedEmail.toLowerCase().trim();
    for (const c of classes) {
      const m = c.students.find((s: any) => s.email && s.email.toLowerCase().trim() === normEmail);
      if (m) {
        return {
          classId: c.id,
          className: c.name,
          studentId: m.id,
          studentName: m.name,
          studentEmail: m.email || detectedEmail
        };
      }
    }
  }

  // 2. Match by Name / Prénom if no email match was found
  if (detectedName) {
    const normDetected = detectedName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").trim();
    if (normDetected.length > 2) {
      const detectedWords = normDetected.split(/\s+/).filter((w: string) => w.length > 1);
      let matchedStudent: any = null;
      let matchedClass: any = null;
      let highestScore = 0;

      for (const c of classes) {
        for (const s of c.students) {
          const normStudent = s.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").trim();
          
          // Check exact match
          if (normStudent === normDetected) {
            matchedStudent = s;
            matchedClass = c;
            highestScore = 1.0;
            break;
          }

          // Word-based score
          const studentWords = normStudent.split(/\s+/).filter((w: string) => w.length > 1);
          let matchingWordsCount = 0;
          for (const word of detectedWords) {
            if (studentWords.includes(word)) {
              matchingWordsCount++;
            }
          }

          const maxWords = Math.max(detectedWords.length, studentWords.length);
          const score = maxWords > 0 ? matchingWordsCount / maxWords : 0;
          
          // Substring match fallback (for name/surname)
          const isSub = (normDetected.length > 3 && normStudent.includes(normDetected)) || 
                        (normStudent.length > 3 && normDetected.includes(normStudent));
          const finalScore = score > 0 ? score : (isSub ? 0.4 : 0);

          if (finalScore > 0.3 && finalScore > highestScore) {
            highestScore = finalScore;
            matchedStudent = s;
            matchedClass = c;
          }
        }
        if (highestScore === 1.0) break;
      }

      if (matchedStudent && matchedClass) {
        return {
          classId: matchedClass.id,
          className: matchedClass.name,
          studentId: matchedStudent.id,
          studentName: matchedStudent.name,
          studentEmail: matchedStudent.email || detectedEmail || ""
        };
      }
    }
  }

  return null;
}

export default function EvaluationResultView({ 
  data, 
  level = 'B2', 
  gradingMode = 'delf',
  onSendFeedback, 
  onDataChange,
  onSupervise,
  isSupervising = false,
  supervisionModelName,
  subject,
  evalModel,
  outputFolder
}: Props) {
  const [editableData, setEditableData] = useState<EvaluationData>(data);
  const [isEditing, setIsEditing] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [showSavedMsg, setShowSavedMsg] = useState(false);
  const [showMdSavedMsg, setShowMdSavedMsg] = useState(false);
  const [comparisonModalData, setComparisonModalData] = useState<any>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [showSubjectCopyModal, setShowSubjectCopyModal] = useState(false);
  const [identitySaveState, setIdentitySaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isEditingSubject, setIsEditingSubject] = useState(false);
  /** Élèves de classe dont le nom ressemble au nom détecté, sans correspondre exactement. */
  const [suggestedMatches, setSuggestedMatches] = useState<Array<{
    classId: string; className: string; studentId: string; studentName: string; studentEmail: string;
  }>>([]);
  const [copiedSubject, setCopiedSubject] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  const handleCopy = (textToCopy: string, setCopied: (v: boolean) => void) => {
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

    // Fetch classes on mount
  useEffect(() => {
    fetch("/api/classes").then(r => r.json()).then(res => {
        if (Array.isArray(res)) {
            setClasses(res);
        }
    }).catch(console.error);
  }, []);

  // ── Rattachement à une classe ────────────────────────────────────────────
  //
  // Deux défauts corrigés ici :
  //  1. L'appariement était approximatif (score de mots, inclusion de chaîne) :
  //     « Nguyen », patronyme très répandu, était attribué d'office au premier
  //     élève dont le nom le contenait.
  //  2. L'effet se redéclenchait à chaque changement de `data.studentName',
  //     donc à chaque frappe : corriger un nom mal apparié était impossible,
  //     le rattachement se réappliquant aussitôt.
  //
  // Désormais : correspondance EXACTE seulement, évaluée une seule fois, et
  // les ressemblances sont proposées au lieu d'être appliquées.
  const autoMatchDoneRef = useRef(false);
  useEffect(() => {
    if (autoMatchDoneRef.current) return;
    if (classes.length === 0) return;
    if (data.classId || (data as any).classDetached) { autoMatchDoneRef.current = true; return; }
    if (!data.studentName && !data.studentEmail) return;
    autoMatchDoneRef.current = true;

    const normalize = (v: string) => v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/s+/g, " ").trim();
    const normalizedDetected = data.studentName ? normalize(data.studentName) : "";
    const detectedEmail = (data.studentEmail || "").toLowerCase().trim();

    let exact: { cls: any; student: any } | null = null;
    const partiels: { cls: any; student: any }[] = [];

    for (const c of classes) {
      for (const stu of c.students) {
        const normalizedStudent = normalize(stu.name);
        const sameEmail = !!detectedEmail && (stu.email || "").toLowerCase().trim() === detectedEmail;
        if ((normalizedDetected && normalizedStudent === normalizedDetected) || sameEmail) {
          if (!exact) exact = { cls: c, student: stu };
        } else if (
          normalizedDetected.length > 5 &&
          (normalizedStudent.includes(normalizedDetected) || normalizedDetected.includes(normalizedStudent))
        ) {
          partiels.push({ cls: c, student: stu });
        }
      }
    }

    if (exact) {
      const updated = {
        ...data,
        classId: exact.cls.id,
        className: exact.cls.name,
        studentId: exact.student.id,
        studentName: exact.student.name,
        studentEmail: exact.student.email || data.studentEmail,
        // Mémorise ce que l'OCR avait détecté, pour pouvoir le restaurer si le
        // rattachement s'avère erroné.
        autoMatchedFrom: { studentName: data.studentName, studentEmail: data.studentEmail || "" },
      } as any;
      setEditableData(updated);
      onDataChange?.(updated);
    } else if (partiels.length > 0) {
      setSuggestedMatches(partiels.slice(0, 4).map(m => ({
        classId: m.cls.id, className: m.cls.name,
        studentId: m.student.id, studentName: m.student.name,
        studentEmail: m.student.email || "",
      })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes, data.classId, data.studentName, data.studentEmail]);

  // Synchroniser le state local quand le parent change (onDataChange met à jour le parent)
  useEffect(() => {
    setEditableData(prev => ({
      ...data,
      classId: data.classId ?? prev.classId,
      studentId: data.studentId ?? prev.studentId,
    }));
  }, [data]);

  // ── Enregistrement automatique de l'identité de l'apprenant ───────────────
  // Le nom saisi ici n'était conservé nulle part : il ne partait dans
  // l'historique qu'au moment de l'envoi du bilan. Une copie rechargée depuis
  // l'historique puis renommée perdait donc la modification, et la vue
  // Historique continuait d'afficher « Inconnu ».
  const identityRef = useRef<string | null>(null);
  useEffect(() => {
    const recordId = editableData.id;
    const name = (editableData.studentName || "").trim();
    if (!recordId || !name) return;

    const signature = JSON.stringify([
      name,
      editableData.studentEmail || "",
      editableData.className || "",
      editableData.classId || "",
      editableData.studentId || "",
    ]);
    if (identityRef.current === null) { identityRef.current = signature; return; }
    if (identityRef.current === signature) return;

    const timeoutId = setTimeout(async () => {
      setIdentitySaveState('saving');
      try {
        const res = await fetch("/api/history", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: recordId,
            studentName: name,
            studentEmail: editableData.studentEmail || "",
            className: editableData.className ?? null,
            // Le rattachement de classe est enregistré lui aussi : un
            // détachement manuel doit survivre à la réouverture du bilan.
            classId: editableData.classId ?? null,
            studentId: editableData.studentId ?? null,
            classDetached: !!(editableData as any).classDetached,
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Échec de l'enregistrement");
        identityRef.current = signature;
        setIdentitySaveState('saved');
        setTimeout(() => setIdentitySaveState('idle'), 2500);
      } catch (err) {
        console.error("Enregistrement de l'identité dans l'historique :", err);
        setIdentitySaveState('error');
      }
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [editableData.id, editableData.studentName, editableData.studentEmail, editableData.className, editableData.classId, editableData.studentId]);

  /**
   * Retire le rattachement à une classe.
   *
   * Restaure le nom initialement détecté lorsque le rattachement était
   * automatique : sans cela, le nom de l'élève apparié à tort restait en place
   * et provoquait un nouveau rattachement à la réouverture du bilan.
   */
  const handleDetachClass = () => {
    const origine = (editableData as any).autoMatchedFrom;
    const updated = {
      ...editableData,
      classId: null,
      className: null,
      studentId: null,
      ...(origine ? { studentName: origine.studentName, studentEmail: origine.studentEmail } : {}),
      autoMatchedFrom: undefined,
      // Empêche l'appariement automatique de refaire le même choix.
      classDetached: true,
    } as any;
    setEditableData(updated);
    onDataChange?.(updated);
    setSuggestedMatches([]);
  };

  /** Applique une correspondance approchante proposée à l'utilisateur. */
  const handleApplySuggestion = (m: { classId: string; className: string; studentId: string; studentName: string; studentEmail: string }) => {
    const updated = {
      ...editableData,
      classId: m.classId,
      className: m.className,
      studentId: m.studentId,
      studentName: m.studentName,
      studentEmail: m.studentEmail || editableData.studentEmail,
      autoMatchedFrom: { studentName: editableData.studentName, studentEmail: editableData.studentEmail || "" },
    } as any;
    setEditableData(updated);
    onDataChange?.(updated);
    setSuggestedMatches([]);
  };

  const maxGlobal = editableData.maxScore !== undefined ? editableData.maxScore : 25;
  const passThreshold = maxGlobal / 2;

  const criteriaList: any[] = useMemo(() => {
    if (editableData.examType === 'traduction') {
      return DEFAULT_TRANSLATION_CRITERIA;
    }
    if (editableData.examType === 'composition') {
      if ((editableData as any).disableStandardGrid && Array.isArray((editableData as any).customCriteriaEvaluated) && (editableData as any).customCriteriaEvaluated.length > 0) {
        return (editableData as any).customCriteriaEvaluated;
      }
      return getCompositionCriteria(editableData.compositionType || 'essai', maxGlobal);
    }
    return getCriteriaConfig(level);
  }, [level, editableData.examType, editableData.compositionType, (editableData as any).disableStandardGrid, (editableData as any).customCriteriaEvaluated, maxGlobal]);

  // ── Enregistrement automatique des retouches ─────────────────────────────
  // Modifier une note ou un commentaire ne changeait que l'écran : tout était
  // perdu si l'on quittait sans « Générer PDF » ou « Valider ». Les retouches
  // sont désormais enregistrées dans l'historique (si le bilan y figure déjà),
  // sinon un avertissement signale qu'elles ne sont pas conservées.
  const [retouches, setRetouches] = useState(false);
  const [editVersion, setEditVersion] = useState(0);
  const [saveState, setSaveState] = useState<'idle' | 'unsaved' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  const latestRef = useRef(editableData);
  latestRef.current = editableData;
  const pendingSaveRef = useRef(false);
  const markEdited = () => { setRetouches(true); setEditVersion(v => v + 1); };

  const corpsHistorique = () => {
    const d: any = latestRef.current;
    const effectiveSubject = subject || d.subject || d._comparison?.firstEval?.subject || d._comparison?.secondEval?.subject || "";
    return jsonHistorique('pe', { ...d, subject: effectiveSubject, level });
  };

  // Les retouches de l'évaluation en cours sont remises à zéro quand une nouvelle évaluation arrive.
  useEffect(() => { setRetouches(false); }, [data._comparison]);

  useEffect(() => {
    if (editVersion === 0) return;
    if (!latestRef.current.id) { setSaveState('unsaved'); return; }
    setSaveState('pending');
    pendingSaveRef.current = true;
    const timeoutId = setTimeout(async () => {
      setSaveState('saving');
      try {
        const res = await fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: corpsHistorique(),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        pendingSaveRef.current = false;
        setSaveState('saved');
        setTimeout(() => setSaveState(s => (s === 'saved' ? 'idle' : s)), 2500);
      } catch (err) {
        console.error("Enregistrement automatique des retouches :", err);
        setSaveState('error');
      }
    }, 1500);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editVersion]);

  // Si l'on quitte l'écran avant la fin du délai, on envoie quand même les retouches.
  useEffect(() => {
    return () => {
      if (!pendingSaveRef.current || !latestRef.current.id) return;
      try {
        fetch("/api/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: corpsHistorique(), keepalive: true }).catch(() => {});
      } catch { /* rien à faire */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fermeture de l'onglet avec des retouches non conservées : avertissement du navigateur.
  useEffect(() => {
    if (saveState === 'idle' || saveState === 'saved') return;
    const avertir = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", avertir);
    return () => window.removeEventListener("beforeunload", avertir);
  }, [saveState]);

  const lancerSupervision = (mode: 'internal' | 'external') => {
    if (editableData._comparison && retouches) {
      const ok = window.confirm(
        "Relancer la 2e évaluation repart de la 1re évaluation d'origine.\n\n" +
        "Les notes et commentaires que vous avez modifiés dans ce bilan seront perdus et remplacés par le nouveau résultat.\n\n" +
        "Continuer ?"
      );
      if (!ok) return;
    }
    onSupervise?.(mode);
  };

  const handleScoreChange = (criterion: string, value: number) => {
    const newScores = { ...editableData.criteriaScores, [criterion]: value };
    const rawGlobal = Object.values(newScores).reduce((a, b: any) => a + (Number(b) || 0), 0);
    const newGlobal = rawGlobal;
    const updated = {
      ...editableData,
      criteriaScores: newScores,
      globalScore: newGlobal,
    };
    setEditableData(updated);
    onDataChange?.(updated);
    markEdited();
  };

  const handleJustificationChange = (criterion: string, value: string) => {
    const updated = {
      ...editableData,
      justifications: {
        ...editableData.justifications,
        [criterion]: value
      }
    };
    setEditableData(updated);
    onDataChange?.(updated);
    markEdited();
  };

  const handleAdviceChange = (criterion: string, value: string) => {
    const updated = {
      ...editableData,
      advices: {
        ...(editableData.advices || {}),
        [criterion]: value
      }
    };
    setEditableData(updated);
    onDataChange?.(updated);
    markEdited();
  };

  const scoreColor = editableData.globalScore >= passThreshold ? "text-emerald-600 bg-emerald-50 border-emerald-100 shadow-emerald-500/20" : "text-amber-600 bg-amber-50 border-amber-100 shadow-amber-500/20";
  const wordCount = (editableData.transcription || "").trim().split(/\s+/).filter(Boolean).length;

  const handleDownloadPdf = async () => {
    try {
      setIsGeneratingPdf(true);
      const res = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editableData, level, outputFolder }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `Erreur serveur (HTTP ${res.status})` }));
        throw new Error(errData.error || "Erreur lors de la génération du PDF");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      
      const now = new Date();
      const dateStr = now.getFullYear().toString() + (now.getMonth() + 1).toString().padStart(2, "0") + now.getDate().toString().padStart(2, "0");
      
      let baseName = "";
      if (editableData.studentName) {
        baseName = editableData.studentName.trim().replace(/\s+/g, "_");
      } else if (editableData.studentEmail) {
        baseName = editableData.studentEmail.split("@")[0];
      } else if (editableData.file) {
        baseName = editableData.file.split(".")[0];
      } else {
        baseName = "Bilan_DELF_" + level;
      }
      a.download = baseName + "_" + dateStr + ".pdf";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);

      // Sauvegarder dans l'historique
      const effectiveSubject = subject || editableData.subject || (editableData as any)._comparison?.firstEval?.subject || (editableData as any)._comparison?.secondEval?.subject || "";
      const resHistorique = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonHistorique('pe', { ...editableData, subject: effectiveSubject, level }),
      }).catch(err => { console.error("Erreur sauvegarde historique:", err); return null; });
      if (resHistorique?.ok) {
        setSaveState('idle');
        pendingSaveRef.current = false;
        if (!editableData.id) {
          const json = await resHistorique.json().catch(() => null);
          const nouvelId = json?.record?.id;
          if (nouvelId) {
            const avecId = { ...latestRef.current, id: nouvelId };
            setEditableData(avecId);
            onDataChange?.(avecId);
          }
        }
      }
      
      setShowSavedMsg(true);
      setTimeout(() => setShowSavedMsg(false), 5000);
    } catch (e: any) {
      console.error("Erreur génération PDF :", e);
      const msg = e?.message || "";
      const isNetworkError = 
        msg.includes("Failed to fetch") || 
        msg.includes("NetworkError") || 
        msg.includes("Load failed") || 
        e?.name === "TypeError";

      if (isNetworkError) {
        alert(
          "Erreur lors de la génération du PDF :\n\n" +
          "Impossible de contacter le serveur local (port 3000).\n\n" +
          "Causes courantes :\n" +
          "1. Le serveur a été arrêté ou sa fenêtre de lancement a été fermée (console de Lancer_Correcteur_Ameliore.bat, ou Terminal sur Mac).\n" +
          "2. Une touche a été pressée par mégarde dans la console noire du serveur.\n\n" +
          "Solution : Relancez l'application (Lancer_Arriere_Plan.vbs sous Windows, Lancer_Correcteur.command sur Mac) et laissez la fenêtre éventuelle ouverte pendant votre travail."
        );
      } else {
        alert("Erreur lors de la génération du PDF : " + (msg || "Erreur inconnue"));
      }
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleExportMarkdown = () => {
    try {
      const effectiveSubject = subject || editableData.subject || (editableData as any)._comparison?.firstEval?.subject || (editableData as any)._comparison?.secondEval?.subject || "";
      const mdContent = generatePEMarkdown(editableData, { level, subject: effectiveSubject, evalModel, gradingMode });
      
      const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      
      const now = new Date();
      const dateStr = now.getFullYear().toString() + (now.getMonth() + 1).toString().padStart(2, "0") + now.getDate().toString().padStart(2, "0");
      
      let baseName = "";
      if (editableData.studentName) {
        baseName = editableData.studentName.trim().replace(/\s+/g, "_");
      } else if (editableData.studentEmail) {
        baseName = editableData.studentEmail.split("@")[0];
      } else if (editableData.file) {
        baseName = editableData.file.split(".")[0];
      } else {
        baseName = "Bilan_DELF_" + level;
      }
      a.download = baseName + "_" + dateStr + ".md";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setShowMdSavedMsg(true);
      setTimeout(() => setShowMdSavedMsg(false), 4000);
    } catch (err: any) {
      alert("Erreur lors de l'export Markdown : " + (err.message || "Erreur inconnue"));
    }
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: "@media print { body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; background: white !important; } .no-print { display: none !important; } .page-break-avoid { break-inside: avoid; } .print-shadow-none { box-shadow: none !important; border-color: #e2e8f0 !important; } }"}} />

      <AnimatePresence>
        {showSavedMsg && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 z-[100] font-bold"
          >
            <CheckCircle className="w-5 h-5" /> PDF généré & Historique sauvegardé
          </motion.div>
        )}
        {showMdSavedMsg && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 z-[100] font-bold"
          >
            <CheckCircle className="w-5 h-5" /> Fichier Markdown exporté avec succès
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div 
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} 
        className={"space-y-8 pb-8 w-full max-w-7xl mx-auto font-sans"}
      >
        <div id="evaluation-report" className={"glass-card p-8 sm:p-12 shadow-2xl shadow-slate-200/50 space-y-12 print:shadow-none print:border-none print:p-0 print:space-y-8"}>
        
          <div className={"flex flex-col pb-6 border-b border-slate-100 gap-4"}>
              <div className={"flex flex-col sm:flex-row justify-between items-center gap-6"}>
                  <div className={"text-center sm:text-left flex-1"}>
                      <h2 className={"text-4xl font-extrabold text-slate-800 tracking-tight"}>Rapport d'évaluation</h2>
                      
                      <div className="mt-4 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-end gap-3 no-print bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          {/* Classe — avec détachement explicite.
                              Un rattachement erroné se retirait auparavant en
                              cherchant « -- Non définie -- » dans la liste, ce que
                              rien ne signalait. */}
                          <div className="flex flex-col">
                            <label className="text-[10px] font-black uppercase text-slate-400 mb-1 flex items-center gap-1.5">Classe <Aide cle="c_classeBilan" taille={13} /></label>
                            <div className="flex items-center gap-1">
                              <select
                                  value={editableData.classId || ""}
                                  onChange={e => {
                                      const cId = e.target.value;
                                      if (!cId) { handleDetachClass(); return; }
                                      const cls = classes.find(c => c.id === cId);
                                      const updated = { ...editableData, classId: cId, className: cls?.name || null, studentId: null } as any;
                                      setEditableData(updated);
                                      onDataChange?.(updated);
                                  }}
                                  className="bg-white border rounded-lg px-2 py-1.5 text-sm outline-none w-40"
                              >
                                  <option value="">-- Non définie --</option>
                                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                              {editableData.classId && (
                                <button
                                  type="button"
                                  onClick={handleDetachClass}
                                  title="Retirer le rattachement à cette classe"
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer flex-shrink-0"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Nom : TOUJOURS modifiable. Il était auparavant remplacé
                              par la liste des élèves de la classe dès qu'un
                              rattachement existait, ce qui interdisait de corriger
                              un nom mal apparié. */}
                          <div className="flex flex-col">
                            <label className="text-[10px] font-black uppercase text-slate-400 mb-1 flex items-center gap-1.5 whitespace-nowrap">
                              Nom de l'étudiant
                              <Aide cle="c_identiteEleve" taille={13} />
                              {(editableData as any).autoMatchedFrom && (
                                <span className="text-amber-600 normal-case font-bold" title={`Rattaché automatiquement à partir de « ${(editableData as any).autoMatchedFrom.studentName} »`}>
                                  auto
                                </span>
                              )}
                            </label>
                            <input
                              type="text"
                              value={editableData.studentName || ""}
                              onChange={e => {
                                // Saisir un nom libre détache l'élève de la fiche
                                // de classe : les deux ne correspondent plus.
                                const updated = { ...editableData, studentName: e.target.value, studentId: null } as any;
                                setEditableData(updated);
                                onDataChange?.(updated);
                              }}
                              placeholder="Ex: Han Nguyen"
                              className="bg-white border rounded-lg px-2 py-1.5 text-sm outline-none w-44"
                            />
                          </div>

                          {/* Choix dans la classe : complète le champ ci-dessus
                              au lieu de le remplacer. */}
                          {editableData.classId && (
                             <div className="flex flex-col">
                               <label className="text-[10px] font-black uppercase text-slate-400 mb-1 whitespace-nowrap">Choisir dans la classe</label>
                               <select
                                   value={editableData.studentId || ""}
                                   onChange={e => {
                                       const sId = e.target.value;
                                       const cls = classes.find(c => c.id === editableData.classId);
                                       const stu = cls?.students.find((s: any) => s.id === sId);
                                       const updatedStu = {
                                         ...editableData,
                                         studentId: sId || null,
                                         studentName: stu?.name || editableData.studentName,
                                         studentEmail: stu?.email || editableData.studentEmail
                                       } as any;
                                       setEditableData(updatedStu);
                                       onDataChange?.(updatedStu);
                                   }}
                                   className="bg-white border rounded-lg px-2 py-1.5 text-sm outline-none w-48"
                               >
                                   <option value="">-- Sélectionner --</option>
                                   {classes.find(c => c.id === editableData.classId)?.students.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                               </select>
                             </div>
                          )}
                          <div className="flex flex-col flex-1 min-w-[200px] max-w-[260px]">
                            <label className="text-[10px] font-black uppercase text-slate-400 mb-1 flex items-center gap-1.5 whitespace-nowrap">
                              Adresse E-mail
                              <Aide cle="c_emailBilan" taille={13} />
                              {identitySaveState === 'saving' && <span className="text-blue-500 normal-case font-bold">enregistrement…</span>}
                              {identitySaveState === 'saved' && <span className="text-emerald-600 normal-case font-bold">✓ enregistré</span>}
                              {identitySaveState === 'error' && <span className="text-rose-600 normal-case font-bold">échec</span>}
                            </label>
                            <input 
                              type="email" 
                              value={editableData.studentEmail || ""} 
                              onChange={e => {
                                const updated = { ...editableData, studentEmail: e.target.value };
                                setEditableData(updated);
                                onDataChange?.(updated);
                              }} 
                              placeholder="Ex: eleve@email.com"
                              className="bg-white border rounded-lg px-2 py-1.5 text-sm outline-none w-full"
                            />
                          </div>
                          <div className="flex flex-col flex-shrink-0">
                            <label className="text-[10px] font-black uppercase text-slate-400 mb-1 whitespace-nowrap">Sujet de l'examen</label>
                            <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setShowSubjectCopyModal(true)}
                              title={editableData.subject ? "Consulter ou modifier le sujet" : "Aucun sujet renseigné — cliquer pour l'ajouter"}
                              className={`no-print flex items-center gap-2 whitespace-nowrap bg-white border rounded-lg px-3 py-1.5 text-sm outline-none transition-all hover:border-blue-400 hover:bg-blue-50 cursor-pointer ${editableData.subject ? "text-slate-700" : "text-slate-400 italic"}`}
                            >
                              <Eye className="w-3.5 h-3.5 flex-shrink-0" />
                              {editableData.subject ? "Voir le sujet" : "Ajouter un sujet"}
                            </button>
                            <Aide cle="c_voirSujet" taille={14} />
                            </div>
                          </div>
                      </div>

                      {/* Ressemblance de nom : proposition, jamais rattachement d'office. */}
                      {suggestedMatches.length > 0 && !editableData.classId && (
                        <div className="mt-3 no-print bg-amber-50 border border-amber-200 rounded-2xl p-3 text-left">
                          <p className="text-[11px] font-bold text-amber-800 mb-2">
                            Nom proche d'un élève enregistré. Rattacher à&nbsp;:
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            {suggestedMatches.map(m => (
                              <button
                                key={m.studentId}
                                type="button"
                                onClick={() => handleApplySuggestion(m)}
                                className="px-3 py-1.5 bg-white border border-amber-300 text-amber-900 rounded-xl text-xs font-bold hover:bg-amber-100 transition-all cursor-pointer"
                              >
                                {m.studentName} <span className="text-amber-600 font-medium">({m.className})</span>
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setSuggestedMatches([])}
                              className="px-3 py-1.5 text-amber-700 rounded-xl text-xs font-bold hover:bg-amber-100 transition-all cursor-pointer"
                            >
                              Ignorer
                            </button>
                          </div>
                        </div>
                      )}

                      <p className={"hidden print:block text-slate-500 font-bold uppercase tracking-widest mt-2 text-xs"}>
                        {editableData.examType === 'composition' 
                          ? `Composition — ${getCompositionTypeLabel(editableData.compositionType || 'essai')}`
                          : editableData.examType === 'dictee' ? 'Dictée'
                          : editableData.examType === 'traduction' ? 'Traduction'
                          : editableData.examType === 'grammaire' ? 'Exercices de Grammaire'
                          : `Examen DELF ${level}`} — {editableData.studentName || "Anonyme"} {editableData.className ? `(${editableData.className})` : ""} {editableData.subject ? `— ${editableData.subject}` : ""}
                      </p>
                  </div>
                  <div className="flex flex-col items-center gap-3">
                    <div className={"px-10 py-6 rounded-[2rem] border-2 flex flex-col items-center justify-center min-w-[180px] shadow-xl transition-all transform hover:scale-[1.02] " + scoreColor}>
                        <span className={"text-xs font-black uppercase tracking-[0.2em] mb-1 opacity-70"}>Note Finale</span>
                        <p className={"text-6xl font-black"}>{formatScore(editableData.globalScore)}<span className={"text-3xl opacity-50"}>/{maxGlobal}</span></p>
                    </div>
                    {saveState !== 'idle' && (
                      <p className={"no-print text-xs font-bold text-center max-w-[260px] " + (saveState === 'saved' ? "text-emerald-600" : saveState === 'saving' || saveState === 'pending' ? "text-blue-500" : "text-amber-600")}>
                        {saveState === 'unsaved' && "Modifications non enregistrées : cliquez sur « Générer PDF » ou « Valider » pour les conserver."}
                        {saveState === 'pending' && "Modifications en cours d'enregistrement…"}
                        {saveState === 'saving' && "Enregistrement dans l'historique…"}
                        {saveState === 'saved' && "✓ Modifications enregistrées dans l'historique"}
                        {saveState === 'error' && "Échec de l'enregistrement automatique : cliquez sur « Générer PDF » pour conserver vos modifications."}
                      </p>
                    )}
                  </div>
              </div>

              {editableData.fallbackNotice && (
                <div className="no-print w-full mt-3 p-3.5 bg-slate-900 text-slate-100 dark:bg-slate-800 dark:text-slate-100 border border-slate-700/80 rounded-2xl flex items-center gap-3 shadow-md">
                  <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div className="text-xs leading-relaxed">
                    <span className="font-extrabold text-amber-400 mr-2 uppercase tracking-wider text-[11px] bg-amber-400/10 px-2 py-0.5 rounded-md border border-amber-400/20">
                      Repli automatique
                    </span>
                    <span className="text-slate-200 font-medium">{editableData.fallbackNotice}</span>
                  </div>
                  <Aide cle="c_repli" taille={16} className="ml-auto !text-slate-300 hover:!text-white" />
                </div>
              )}

              {(editableData._comparison || onSupervise) && (
                <div className="flex flex-wrap items-center justify-end gap-2.5 no-print pt-3 border-t border-slate-100/80 w-full">
                  {editableData._comparison && (
                    <button
                      onClick={() => setComparisonModalData(editableData._comparison)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100 transition-all font-bold text-xs border border-fuchsia-200 rounded-xl shadow-sm hover:shadow active:scale-95 cursor-pointer"
                      title={editableData._comparison.thirdEval ? "Voir les différences entre les trois évaluations" : "Voir les différences entre les deux évaluations"}
                    >
                      <GitCompare className="w-4 h-4 text-fuchsia-600" />
                      <span>Voir les différences</span>
                    </button>
                  )}
                  {editableData._comparison && <Aide cle="c_voirDifferences" taille={16} />}

                  {onSupervise && (
                    <>
                      <button
                        onClick={() => lancerSupervision('external')}
                        disabled={isSupervising}
                        className="flex items-center gap-1.5 px-4 py-2 bg-purple-50 text-purple-700 hover:bg-purple-100 transition-all font-bold text-xs border border-purple-200 rounded-xl shadow-sm hover:shadow active:scale-95 disabled:opacity-50 cursor-pointer"
                        title="Supervision avec une IA externe (copier-coller sans clé API)"
                      >
                        {isSupervising ? <Loader2 className="w-4 h-4 animate-spin text-purple-600" /> : <RotateCcw className="w-4 h-4 text-purple-600" />}
                        <span>{editableData._comparison ? 'Relancer 2e éval. (externe)' : '2e éval. (externe)'}</span>
                      </button>

                      <button
                        onClick={() => lancerSupervision('internal')}
                        disabled={isSupervising}
                        className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-all font-bold text-xs border border-indigo-200 rounded-xl shadow-sm hover:shadow active:scale-95 disabled:opacity-50 cursor-pointer"
                        title="Supervision avec une clé API dans l'application"
                      >
                        {isSupervising ? <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> : <Brain className="w-4 h-4 text-indigo-600" />}
                        <span>{editableData._comparison ? 'Relancer 2e éval. (interne)' : '2e éval. (interne)'}</span>
                      </button>
                      <Aide cle="c_deuxiemeEval" taille={16} />
                    </>
                  )}
                </div>
              )}
          </div>

          {(editableData as any)._arbiterNotes && (
            <div className="no-print bg-violet-50 border border-violet-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-violet-500 mb-2">
                <GitCompare className="w-4 h-4" /> 3e évaluation — comparaison des deux évaluations (note interne, non incluse dans le PDF) <Aide cle="c_voirDifferences" taille={14} />
              </div>
              <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{(editableData as any)._arbiterNotes}</p>
            </div>
          )}

          <div className={"space-y-6"}>
              <div className={"flex items-center justify-between px-1"}>
                  <h3 className={"text-2xl font-bold text-slate-800 flex items-center gap-3"}><FileText className={"w-6 h-6 text-blue-500"}/> Analyse et Surbrillance <Aide cle="c_motsSurlignes" taille={18} className="no-print" /></h3>
                  <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowSubjectCopyModal(true)}
                        className="no-print flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all border border-slate-200"
                        title="Voir le sujet et la copie originale"
                      >
                        <Eye className="w-3.5 h-3.5" /> Voir sujet & copie
                      </button>
                      <span className={"no-print text-[11px] font-black uppercase tracking-widest px-3 py-1.5 bg-slate-100 text-slate-500 rounded-xl"}>
                          {wordCount} mots
                      </span>
                  </div>
              </div>
              <div className={"bg-white/40 backdrop-blur-md p-8 rounded-[2rem] border border-white/30 shadow-inner min-h-[200px] ring-4 ring-slate-50/50 print:ring-0 print:p-4 print:border-l-4 print:border-l-blue-400"}>
                  <CorrectedText text={editableData.transcription} corrections={editableData.errorsTable} />
              </div>

              {editableData.errorsTable && editableData.errorsTable.length > 0 && (
                <div className={"mt-12 pt-8 border-t border-slate-200"}>
                  <div className={"flex items-center space-x-3 mb-8"}>
                     <div className={"bg-blue-600 w-1.5 h-6 rounded-full"}></div>
                     <h4 className={"text-sm font-black uppercase tracking-[0.2em] text-slate-800"}>Détails des corrections linguistiques</h4>
                  </div>
                  
                  <div className={"space-y-8"}>
                    {editableData.errorsTable.map((corr, idx) => (
                      <div key={idx} className={"page-break-avoid flex flex-col p-6 rounded-[1.5rem] bg-slate-50 border border-slate-100 shadow-sm hover:border-blue-200 transition-colors print:bg-white print:border-l-4 print:border-l-blue-400 print:rounded-none"}>
                        <div className={"flex flex-wrap items-center gap-4 mb-5 pb-4 border-b border-slate-100/50"}>
                          <div className={"flex items-center bg-rose-50 border border-rose-100 rounded-xl px-4 py-2.5"}>
                             <span className={"text-rose-700 text-base font-bold line-through break-words"}>
                               {corr.original}
                             </span>
                          </div>
                          <div className={"text-slate-300 font-bold"}>➡</div>
                          <div className={"flex items-center bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5"}>
                             <span className={"text-emerald-800 text-base font-bold break-words"}>
                               {corr.correction}
                             </span>
                          </div>
                        </div>
                        
                        <div className={"pl-5 border-l-4 border-blue-400 bg-white/60 p-5 rounded-r-2xl shadow-sm print:bg-transparent print:shadow-none print:border-l-0"}>
                          <p className={"text-slate-700 text-lg leading-relaxed italic font-medium break-words"}>
                            "{corr.rule}"
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>

          {/* SECTION SPÉCIFIQUE DICTÉE */}
          {editableData.examType === 'dictee' && (
            <div className={"space-y-6 pt-8 border-t border-slate-100"}>
              <div className={"flex justify-between items-center px-1"}>
                <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2.5">
                  <span>📝 Synthèse et Calcul des Pénalités de Dictée</span>
                </h3>
                <span className="text-xs font-black px-3 py-1 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-200">
                  Note : {formatScore(editableData.globalScore)} / {maxGlobal}
                </span>
              </div>

              {editableData.breakdown && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="bg-rose-50/80 border border-rose-200 rounded-2xl p-4 text-center">
                    <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 block">Grammaire / Accord</span>
                    <p className="text-2xl font-black text-rose-700 mt-1">{editableData.breakdown.grammar?.count || 0}</p>
                    <span className="text-xs font-bold text-rose-500">-{editableData.breakdown.grammar?.penaltyPoints || 0} pt</span>
                  </div>
                  <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 text-center">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 block">Usage / Lexique</span>
                    <p className="text-2xl font-black text-amber-700 mt-1">{editableData.breakdown.usage?.count || 0}</p>
                    <span className="text-xs font-bold text-amber-500">-{editableData.breakdown.usage?.penaltyPoints || 0} pt</span>
                  </div>
                  <div className="bg-sky-50/80 border border-sky-200 rounded-2xl p-4 text-center">
                    <span className="text-[10px] font-black uppercase tracking-wider text-sky-600 block">Accents & Cédilles</span>
                    <p className="text-2xl font-black text-sky-700 mt-1">{editableData.breakdown.accent?.count || 0}</p>
                    <span className="text-xs font-bold text-sky-500">-{editableData.breakdown.accent?.penaltyPoints || 0} pt</span>
                  </div>
                  <div className="bg-indigo-50/80 border border-indigo-200 rounded-2xl p-4 text-center">
                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 block">Ponctuation & Maj.</span>
                    <p className="text-2xl font-black text-indigo-700 mt-1">{editableData.breakdown.punctuation?.count || 0}</p>
                    <span className="text-xs font-bold text-indigo-500">-{editableData.breakdown.punctuation?.penaltyPoints || 0} pt</span>
                  </div>
                  <div className="bg-purple-50/80 border border-purple-200 rounded-2xl p-4 text-center">
                    <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 block">Mots manquants</span>
                    <p className="text-2xl font-black text-purple-700 mt-1">{editableData.breakdown.omission?.count || 0}</p>
                    <span className="text-xs font-bold text-purple-500">-{editableData.breakdown.omission?.penaltyPoints || 0} pt</span>
                  </div>
                  <div className="bg-slate-100/90 border border-slate-300 rounded-2xl p-4 text-center">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 block">Total Déductions</span>
                    <p className="text-2xl font-black text-slate-800 mt-1">-{editableData.penaltiesTotal || 0}</p>
                    <span className="text-xs font-black text-slate-500">Note : {formatScore(editableData.globalScore)} / {maxGlobal}</span>
                  </div>
                </div>
              )}

              {editableData.referenceText && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Texte officiel de référence</h4>
                  <p className="text-sm font-serif text-slate-800 leading-relaxed whitespace-pre-wrap">{editableData.referenceText}</p>
                </div>
              )}

              {editableData.feedback && (
                <div className="bg-indigo-50/60 border border-indigo-200 rounded-2xl p-5">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-indigo-700 mb-2">Bilan général de l'enseignant / examinateur</h4>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{editableData.feedback}</p>
                </div>
              )}
            </div>
          )}

          {/* SECTION SPÉCIFIQUE GRAMMAIRE */}
          {editableData.examType === 'grammaire' && (
            <div className={"space-y-6 pt-8 border-t border-slate-100"}>
              <div className={"flex justify-between items-center px-1"}>
                <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2.5">
                  <span>🧩 Évaluation Question par Question</span>
                </h3>
                <span className="text-xs font-black px-3 py-1 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-200">
                  Total : {formatScore(editableData.globalScore)} / {maxGlobal} pts
                </span>
              </div>

              {editableData.items && editableData.items.length > 0 && (
                <div className="space-y-3">
                  {editableData.items.map((item, idx) => {
                    const statusBg = item.status === 'correct' ? 'bg-emerald-50/70 border-emerald-200' :
                                     item.status === 'partial' ? 'bg-amber-50/70 border-amber-200' :
                                     'bg-rose-50/70 border-rose-200';
                    const badgeBg = item.status === 'correct' ? 'bg-emerald-600 text-white' :
                                    item.status === 'partial' ? 'bg-amber-600 text-white' :
                                    'bg-rose-600 text-white';
                    return (
                      <div key={idx} className={`p-4 rounded-2xl border ${statusBg} flex flex-col md:flex-row md:items-center justify-between gap-4`}>
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${badgeBg}`}>
                              Question {item.questionNumber}
                            </span>
                            <span className="text-xs font-semibold text-slate-600">
                              {item.status === 'correct' ? 'Correct' : item.status === 'partial' ? 'Partiellement correct' : 'Incorrect'}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Réponse de l'élève :</span>
                              <p className="font-semibold text-slate-800 mt-0.5">{item.studentAnswer || '(Vide)'}</p>
                            </div>
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Réponse attendue :</span>
                              <p className="font-semibold text-emerald-800 mt-0.5">{item.correctAnswer}</p>
                            </div>
                          </div>
                          {item.feedback && (
                            <p className="text-xs italic text-slate-600 pt-1 border-t border-slate-200/50">{item.feedback}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-lg font-black text-slate-800">{formatScore(item.pointsAwarded)}</span>
                          <span className="text-xs font-bold text-slate-400"> / {item.pointsMax} pt</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {editableData.summaryFeedback && (
                <div className="bg-indigo-50/60 border border-indigo-200 rounded-2xl p-5">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-indigo-700 mb-2">Synthèse globale</h4>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{editableData.summaryFeedback}</p>
                </div>
              )}
            </div>
          )}

          {/* SECTION TRADUCTION, COMPOSITION & DELF */}
          {(editableData.examType === 'traduction' || editableData.examType === 'composition' || !editableData.examType || editableData.examType === 'delf') && (
            <div className={"space-y-6 pt-8 border-t border-slate-100"}>
              {editableData.examType === 'traduction' && editableData.sourceText && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">Texte source original</h4>
                    <p className="text-xs font-serif text-slate-800 leading-relaxed whitespace-pre-wrap">{editableData.sourceText}</p>
                  </div>
                  {editableData.modelTranslation && (
                    <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-emerald-700 mb-1.5">Traduction de référence</h4>
                      <p className="text-xs font-serif text-slate-800 leading-relaxed whitespace-pre-wrap">{editableData.modelTranslation}</p>
                    </div>
                  )}
                </div>
              )}

              {editableData.examType === 'composition' && editableData.corpusText && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">Texte support ou Corpus documentaire</h4>
                  <p className="text-xs font-serif text-slate-800 leading-relaxed whitespace-pre-wrap">{editableData.corpusText}</p>
                </div>
              )}

              <div className={"flex flex-wrap justify-between items-center gap-2 px-1"}>
                <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                  {editableData.examType === 'traduction' 
                    ? "Critères d'évaluation de la Traduction" 
                    : editableData.examType === 'composition'
                    ? ((editableData as any).disableStandardGrid 
                        ? "Critères d'évaluation personnalisés (barème libre)" 
                        : `Critères d'évaluation — ${getCompositionTypeLabel(editableData.compositionType || 'essai')}`)
                    : "Performance Grille Officielle"}
                  <Aide cle="c_noteCritere" taille={18} className="no-print" />
                </h3>
                {editableData.examType === 'composition' && (editableData as any).disableStandardGrid && (
                  <span className="text-xs font-semibold px-2.5 py-1 bg-amber-50 text-amber-800 rounded-lg border border-amber-200">
                    Barème libre enseignant
                  </span>
                )}
              </div>
              <div className={"grid grid-cols-1 gap-6"}>
                {criteriaList.map((crit: any, idx: number) => {
                  const prevCrit = idx > 0 ? criteriaList[idx - 1] : null;
                  const showDomainHeader = Boolean(crit.domain && (!prevCrit || prevCrit.domain !== crit.domain));
                  return (
                    <React.Fragment key={crit.key}>
                      {showDomainHeader && (
                        <div className="pt-4 pb-2 border-b-2 border-slate-200">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="text-lg font-black text-slate-700 uppercase tracking-wide">
                              {crit.domain}
                            </h4>
                            {crit.domainMax && (
                              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                Barème domaine : /{crit.domainMax.toFixed(1).replace('.', ',')} pts
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      <CriterionCard 
                        label={crit.label} 
                        score={editableData.criteriaScores ? editableData.criteriaScores[crit.key] : 0} 
                        maxScore={crit.maxScore}
                        justification={editableData.justifications ? editableData.justifications[crit.key] : ''} 
                        advice={editableData.advices ? editableData.advices[crit.key] : undefined}
                        isEditing={isEditing}
                        level={level}
                        gradingMode={gradingMode}
                        afficherAide={idx === 0}
                        onScoreChange={(val) => handleScoreChange(crit.key, val)} 
                        onJustificationChange={(val) => handleJustificationChange(crit.key, val)}
                        onAdviceChange={(val) => handleAdviceChange(crit.key, val)}
                      />
                    </React.Fragment>
                  );
                })}
              </div>

              {editableData.generalFeedback && (
                <div className="bg-indigo-50/60 border border-indigo-200 rounded-2xl p-5 mt-6">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-indigo-700 mb-2">Bilan formateur & Appréciation générale</h4>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{editableData.generalFeedback}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions (Hidden on Print) */}
        <div className={"no-print flex flex-col sm:flex-row justify-center items-center gap-4 pb-12"}>
          <button onClick={() => window.print()} className={"w-full sm:w-auto px-8 py-4 bg-white border-2 border-slate-200 text-slate-700 rounded-2xl font-bold tracking-wide transition-all hover:bg-slate-50 flex items-center justify-center gap-2 shadow-lg shadow-slate-100"}>
             <Printer className={"w-5 h-5"} />
             Imprimer le Bilan
          </button>
          <button onClick={handleDownloadPdf} disabled={isGeneratingPdf} className={"w-full sm:w-auto px-8 py-4 bg-slate-100 border-2 border-transparent hover:bg-slate-200 text-slate-700 disabled:opacity-50 rounded-2xl font-bold tracking-wide transition-all flex items-center justify-center gap-2"}>
             {isGeneratingPdf ? <Loader2 className={"w-5 h-5 animate-spin"} /> : <Save className={"w-5 h-5"} />}
             Générer PDF
          </button>
          <Aide cle="c_genererPdf" taille={18} />
          <button 
            onClick={handleExportMarkdown} 
            className={"w-full sm:w-auto px-8 py-4 bg-emerald-50 border-2 border-emerald-200 text-emerald-700 hover:bg-emerald-100 rounded-2xl font-bold tracking-wide transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-100/50 cursor-pointer"}
            title="Exporter le bilan d'évaluation complet au format Markdown (.md)"
          >
             <FileDown className="w-5 h-5" />
             Exporter MD
          </button>
          <Aide cle="c_imprimerExporter" taille={18} />
          <button onClick={() => { setSaveState('idle'); pendingSaveRef.current = false; onSendFeedback(editableData); }} className={"w-full sm:w-auto px-10 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl font-bold tracking-wide transition-all flex items-center justify-center gap-2 shadow-xl shadow-blue-600/20 active:scale-[0.98] transform hover:scale-[1.02]"}>
             Valider et Envoyer l'E-mail
             <Send className={"w-5 h-5 ml-2"} />
          </button>
          <Aide cle="c_validerEnvoyer" taille={18} />
        </div>

      </motion.div>

      {/* Modale Comparaison Double Évaluation */}
      <AnimatePresence>
        {comparisonModalData && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 sm:p-6"
            onClick={() => setComparisonModalData(null)}
          >
            <motion.div 
              initial={{ y: 50, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 md:p-8 max-w-5xl w-full flex flex-col shadow-2xl border border-slate-100 overflow-hidden max-h-[90vh]"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
                <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                  <GitCompare className="w-7 h-7 text-fuchsia-600" />
                  {comparisonModalData.thirdEval ? "Analyse des évaluations (avec 3e évaluation)" : "Analyse de la Double évaluation"}
                </h3>
                <button onClick={() => setComparisonModalData(null)} className="p-2 border-2 border-slate-200 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-all font-bold">
                  ✕
                </button>
              </div>
              
              <div className="overflow-y-auto pr-2 custom-scrollbar flex-1 space-y-6">
                {/* TABLEAU DES NOTES */}
                <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-black">
                      <tr>
                        <th className="px-4 py-3">Critère</th>
                        <th className="px-4 py-3 text-center border-l border-slate-200 text-blue-700">Modèle INITIAL ({getFriendlyModelName(comparisonModalData.firstProvider).toUpperCase()})</th>
                        <th className="px-4 py-3 text-center border-l border-slate-200 text-purple-700">DOUBLE ÉVALUATION ({getFriendlyModelName(comparisonModalData.secondProvider).toUpperCase()})</th>
                        {comparisonModalData.thirdEval && (
                          <th className="px-4 py-3 text-center border-l border-slate-200 text-violet-700">3e ÉVALUATION (ARBITRE) ({getFriendlyModelName(comparisonModalData.thirdProvider || 'Arbitre').toUpperCase()})</th>
                        )}
                        <th className="px-4 py-3 text-center border-l border-slate-200 text-indigo-700"><span className="inline-flex items-center gap-1">Note Finale retenue <Aide cle="c_cmpNoteFinale" taille={13} /></span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {criteriaList.map((crit) => {
                        const val1 = comparisonModalData.firstEval.criteriaScores?.[crit.key] ?? 0;
                        const val2 = comparisonModalData.secondEval.criteriaScores?.[crit.key] ?? 0;
                        const val3 = comparisonModalData.thirdEval ? comparisonModalData.thirdEval.criteriaScores?.[crit.key] : undefined;
                        const roundToDelf = (avg: number): number => {
                          if (avg < 0.5) return 0;
                          if (avg < 2.0) return 1;
                          if (avg < 4.0) return 3;
                          return 5;
                        };
                        // La note retenue est celle du bilan affiché (retouches comprises).
                        const finalVal = editableData.criteriaScores?.[crit.key] !== undefined
                          ? editableData.criteriaScores[crit.key]
                          : (val3 !== undefined ? val3 : (val2 !== undefined ? val2 : val1));
                        return (
                          <tr key={crit.key} className="border-b border-slate-100 last:border-0 bg-white">
                            <td className="px-4 py-3 font-bold text-slate-600">{crit.label}</td>
                            <td className="px-4 py-3 text-center border-l border-slate-100 text-slate-500">{formatScore(val1)}/{formatScore(crit.maxScore)}</td>
                            <td className="px-4 py-3 text-center border-l border-slate-100 text-slate-500 font-medium">
                              {formatScore(val2)}/{formatScore(crit.maxScore)}
                              {val1 !== val2 && (
                                <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-md font-bold ${val2 > val1 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                  {val2 > val1 ? "+" : ""}{formatScore(val2 - val1)}
                                </span>
                              )}
                            </td>
                            {val3 !== undefined && (
                              <td className="px-4 py-3 text-center border-l border-slate-100 border-r text-slate-500 font-medium bg-violet-50/20">
                                {formatScore(val3)}/{formatScore(crit.maxScore)}
                                {val3 !== val2 && (
                                  <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-md font-bold ${val3 > val2 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                    {val3 > val2 ? "+" : ""}{formatScore(val3 - val2)}
                                  </span>
                                )}
                              </td>
                            )}
                            <td className="px-4 py-3 text-center font-black text-slate-800 bg-slate-50">{formatScore(finalVal)}/{formatScore(crit.maxScore)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-100 font-black">
                      <tr>
                        <td className="px-4 py-3 uppercase text-xs text-slate-500">Note Finale Retenue</td>
                        <td className="px-4 py-3 text-center border-l border-slate-200 text-slate-500">{formatScore(comparisonModalData.firstEval.globalScore)}/{maxGlobal}</td>
                        <td className="px-4 py-3 text-center border-l border-slate-200 text-slate-500">{formatScore(comparisonModalData.secondEval.globalScore)}/{maxGlobal}</td>
                        {comparisonModalData.thirdEval && (
                          <td className="px-4 py-3 text-center border-l border-slate-200 text-violet-700 bg-violet-50/40">{formatScore(comparisonModalData.thirdEval.globalScore)}/{maxGlobal}</td>
                        )}
                        <td className="px-4 py-3 text-center border-l border-slate-200 text-slate-800 text-lg">
                          {formatScore(editableData.globalScore !== undefined
                            ? editableData.globalScore
                            : (comparisonModalData.thirdEval
                                ? comparisonModalData.thirdEval.globalScore
                                : (comparisonModalData.secondEval.globalScore ?? comparisonModalData.firstEval.globalScore)))}/{maxGlobal}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* FEEDBACKS MODIFIÉS */}
                <h4 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-2 mt-8 flex items-center gap-2">
                   <FileText className="w-4 h-4 text-slate-400"/> Feedbacks modifiés
                </h4>
                <div className="space-y-4">
                  {criteriaList.map((crit) => {
                     const justif1 = comparisonModalData.firstEval.justifications?.[crit.key];
                     const justif2 = comparisonModalData.secondEval.justifications?.[crit.key];
                     const justif3 = comparisonModalData.thirdEval?.justifications?.[crit.key];
                     const adv1 = comparisonModalData.firstEval.advices?.[crit.key];
                     const adv2 = comparisonModalData.secondEval.advices?.[crit.key];
                     const adv3 = comparisonModalData.thirdEval?.advices?.[crit.key];
                     const changed = (justif1 !== justif2) || (adv1 !== adv2) ||
                                     (comparisonModalData.thirdEval && ((justif1 !== justif3) || (justif2 !== justif3) || (adv1 !== adv3) || (adv2 !== adv3)));
                     if (!changed) return null;
                     
                     return (
                       <div key={"feedback-"+crit.key} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                         <div className="bg-slate-100 px-4 py-2 font-bold text-xs text-slate-500 uppercase tracking-wider border-b border-slate-200">
                           Critère: {crit.label}
                         </div>
                         <div className={`grid ${comparisonModalData.thirdEval ? 'grid-cols-3' : 'grid-cols-2'} divide-x divide-slate-100`}>
                           <div className="p-4 bg-slate-50">
                              <div className="text-[10px] font-bold text-slate-400 mb-2 uppercase">Initial</div>
                              {justif1 !== justif2 && <p className="text-xs text-slate-600 mb-3"><strong className="text-slate-800">Justif:</strong> {justif1}</p>}
                              {adv1 !== adv2 && <p className="text-xs text-slate-600"><strong className="text-slate-800">Conseil:</strong> {adv1}</p>}
                           </div>
                           <div className="p-4 bg-fuchsia-50/30">
                              <div className="text-[10px] font-bold text-fuchsia-400 mb-2 uppercase">Double évaluation</div>
                              {justif1 !== justif2 && <p className="text-xs text-slate-800 mb-3"><strong>Justif:</strong> {justif2}</p>}
                              {adv1 !== adv2 && <p className="text-xs text-slate-800"><strong>Conseil:</strong> {adv2}</p>}
                           </div>
                           {comparisonModalData.thirdEval && (
                             <div className="p-4 bg-violet-50/30">
                               <div className="text-[10px] font-bold text-violet-500 mb-2 uppercase">3e évaluation (Arbitre)</div>
                               {(justif1 !== justif3 || justif2 !== justif3) && <p className="text-xs text-slate-800 mb-3"><strong>Justif:</strong> {justif3}</p>}
                               {(adv1 !== adv3 || adv2 !== adv3) && <p className="text-xs text-slate-800"><strong>Conseil:</strong> {adv3}</p>}
                             </div>
                           )}
                         </div>
                       </div>
                     );
                  })}
                </div>

                {/* NOUVELLES ERREURS REPÉRÉES */}
                <h4 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-2 mt-8 flex items-center gap-2">
                   <Zap className="w-4 h-4 text-amber-500"/> Fautes non repérées dans l'évaluation initiale
                </h4>
                <div className="bg-white border text-sm border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      <tr>
                        <th className="px-4 py-3">Original</th>
                        <th className="px-4 py-3">Correction</th>
                        <th className="px-4 py-3">Règle</th>
                        <th className="px-4 py-3">Source de l'ajout</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(() => {
                        const errors1 = comparisonModalData.firstEval.errorsTable || [];
                        const errors2 = comparisonModalData.secondEval.errorsTable || [];
                        const errors3 = comparisonModalData.thirdEval?.errorsTable || [];
                        
                        const addedByDouble = errors2.filter((e2: any) => 
                          !errors1.some((e1: any) => e1.original.trim().toLowerCase() === e2.original.trim().toLowerCase())
                        );
                        
                        const addedByArbiter = errors3.filter((e3: any) => 
                          !errors1.some((e1: any) => e1.original.trim().toLowerCase() === e3.original.trim().toLowerCase()) &&
                          !errors2.some((e2: any) => e2.original.trim().toLowerCase() === e3.original.trim().toLowerCase())
                        );

                        const totalNew = addedByDouble.length + addedByArbiter.length;

                        if (totalNew === 0) {
                          return <tr><td colSpan={4} className="p-6 text-center text-slate-400 italic font-medium text-xs">La double évaluation et l'arbitrage n'ont trouvé aucune anomalie supplémentaire.</td></tr>;
                        }

                        return (
                          <>
                            {addedByDouble.map((err: any, i: number) => (
                              <tr key={`double-${i}`} className="hover:bg-amber-50/50 transition-colors">
                                <td className="px-4 py-3 text-red-500 font-medium text-xs line-through decoration-red-300">{err.original}</td>
                                <td className="px-4 py-3 text-emerald-600 font-medium text-xs">{err.correction}</td>
                                <td className="px-4 py-3 text-slate-500 text-xs italic">{err.rule}</td>
                                <td className="px-4 py-3 text-fuchsia-600 text-[10px] font-black uppercase tracking-wider bg-fuchsia-50/20">Double Éval.</td>
                              </tr>
                            ))}
                            {addedByArbiter.map((err: any, i: number) => (
                              <tr key={`arbiter-${i}`} className="hover:bg-violet-50/50 transition-colors">
                                <td className="px-4 py-3 text-red-500 font-medium text-xs line-through decoration-red-300">{err.original}</td>
                                <td className="px-4 py-3 text-emerald-600 font-medium text-xs">{err.correction}</td>
                                <td className="px-4 py-3 text-slate-500 text-xs italic">{err.rule}</td>
                                <td className="px-4 py-3 text-violet-600 text-[10px] font-black uppercase tracking-wider bg-violet-50/20">Arbitre (3e)</td>
                              </tr>
                            ))}
                          </>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>

              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modale Sujet & Copie */}
      <AnimatePresence>
        {showSubjectCopyModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4 sm:p-6 no-print"
            onClick={() => setShowSubjectCopyModal(false)}
          >
            <motion.div
              initial={{ y: 50, scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 20, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 md:p-8 max-w-4xl w-full flex flex-col shadow-2xl border border-slate-100 overflow-hidden max-h-[85vh]"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4 flex-shrink-0">
                <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                  <FileText className="w-7 h-7 text-blue-600" />
                  Sujet & Copie Étudiante
                </h3>
                <button
                  onClick={() => setShowSubjectCopyModal(false)}
                  className="p-2 border-2 border-slate-200 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-all font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="overflow-y-auto pr-2 custom-scrollbar flex-1 space-y-6">
                {/* SUJET */}
                {(() => {
                  const modalSubject = editableData.subject || subject || (editableData as any)._comparison?.firstEval?.subject || (editableData as any)._comparison?.secondEval?.subject || "";
                  return (
                    <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-5 md:p-6">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="text-xs font-black text-blue-600 uppercase tracking-widest flex items-center">
                          <Brain className="w-4 h-4 mr-2" />
                          Sujet de l'exercice
                        </h4>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setIsEditingSubject(v => !v)}
                            className="text-[10px] font-bold text-blue-500 hover:text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg transition-all"
                          >
                            {isEditingSubject ? "Terminer" : "Modifier"}
                          </button>
                          {modalSubject && !isEditingSubject && (
                            <button
                              type="button"
                              onClick={() => handleCopy(modalSubject, setCopiedSubject)}
                              className="text-[10px] font-bold text-blue-500 hover:text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg transition-all"
                            >
                              {copiedSubject ? "Copié !" : "Copier"}
                            </button>
                          )}
                        </div>
                      </div>
                      {isEditingSubject ? (
                        <textarea
                          value={modalSubject}
                          onChange={e => {
                            const updated = { ...editableData, subject: e.target.value };
                            setEditableData(updated);
                            onDataChange?.(updated);
                          }}
                          rows={10}
                          autoFocus
                          placeholder="Ex : Lettre de réclamation / Article"
                          className="w-full bg-white border border-blue-200 rounded-xl p-3 text-sm text-slate-800 leading-relaxed outline-none focus:ring-2 focus:ring-blue-500/30 resize-y"
                        />
                      ) : (
                        <p className="text-slate-800 font-semibold leading-relaxed text-sm md:text-base whitespace-pre-wrap">
                          {modalSubject || <span className="text-slate-400 italic font-normal">Aucun sujet renseigné</span>}
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* COPIE */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 md:p-6">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center">
                      <FileText className="w-4 h-4 mr-2" />
                      Production écrite originale
                    </h4>
                    {editableData.transcription && (
                      <button
                        onClick={() => handleCopy(editableData.transcription, setCopiedText)}
                        className="text-[10px] font-bold text-slate-500 hover:text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg transition-all"
                      >
                        {copiedText ? "Copié !" : "Copier"}
                      </button>
                    )}
                  </div>
                  <p className="text-slate-800 leading-relaxed text-sm md:text-base whitespace-pre-wrap font-medium">
                    {editableData.transcription || <span className="text-slate-400 italic font-normal">Aucune production écrite renseignée</span>}
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
