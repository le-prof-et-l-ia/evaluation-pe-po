"use client";

import { useState, useEffect, useRef } from "react";
import { LayoutDashboard, CheckCircle, RefreshCcw, Send, Loader2, Folder, Mail, RotateCcw, FolderOpen, ExternalLink, Zap, Brain, FileText, Eye, Edit3, Users, Plus, FilePlus2, Pause, Play, Square, GitCompare, Info, FileSpreadsheet, Database, AlertTriangle, X, Power, Scale, Clock, Sparkles, Copy } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import EvaluationResultView, { EvaluationData } from "@/components/EvaluationResultView";
import FolderPicker from "@/components/FolderPicker";
import ClassManager from "@/components/ClassManager";
import MaintenanceView from "@/components/MaintenanceView";
import HistoryView from "@/components/HistoryView";
import SubjectGeneratorView from "@/components/SubjectGeneratorView";

import * as XLSX from "xlsx";
import { getOcrPrompt, sanitizeScores, sanitizeHallucinations, getCriteriaConfig } from "@/lib/promptUtils";
import { getFriendlyModelName } from "@/lib/modelNames";
import { formatScore } from "@/lib/scoreUtils";
import ExternalSupervisionModal from "@/components/ExternalSupervisionModal";
import { parseExternalSupervisionResults, escapeControlCharactersInStrings, type ExternalSupervisionTask } from "@/lib/externalSupervision";
import { parseMultiplePEMarkdowns, parseSinglePEMarkdown } from "@/lib/markdownGenerator";
import { findMatchingStudent } from "@/lib/studentMatching";
import { useCorrectionSettings } from "@/hooks/useCorrectionSettings";
import { useToast } from "@/hooks/useToast";
import ComparisonModal from "@/components/ComparisonModal";
import SupervisionRecoveryModal from "@/components/SupervisionRecoveryModal";
import HeaderNav from "@/components/HeaderNav";
import CustomExamConfigPanel from "@/components/CustomExamConfigPanel";
import { getDictationOcrPrompt } from "@/lib/dicteeEngine";

export default function Home() {
  const [isShutdown, setIsShutdown] = useState(false);
  const handleShutdown = async () => {
    if (window.confirm("Êtes-vous sûr de vouloir arrêter le serveur et quitter l'application ?")) {
      try {
        setIsShutdown(true);
        fetch("/api/shutdown", { method: "POST" }).catch(() => {});
        setTimeout(() => {
          window.close();
        }, 1500);
      } catch (err) {
        console.error("Erreur lors de l'arrêt du serveur :", err);
      }
    }
  };

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isShutdown) {
        e.preventDefault();
        e.returnValue = "Veuillez utiliser le bouton 'Quitter l'application' en bas à gauche de la barre latérale pour arrêter proprement le serveur.";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isShutdown]);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (!event.message || event.message === 'Script error.' || event.message.includes('ResizeObserver')) return;
      console.error('[Erreur Script Client] :', event);
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (!reason) return;
      if (reason?.name === 'AbortError' || reason === 'AbortError') return;

      let msg = '';
      if (reason instanceof Error) {
        msg = reason.message || reason.name;
      } else if (typeof reason === 'string') {
        msg = reason;
      } else if (reason instanceof Event) {
        msg = `Événement d'erreur (${reason.type}) intercepté`;
      } else if (typeof reason === 'object') {
        msg = reason.message || reason.error || reason.statusText || '';
      } else {
        msg = String(reason);
      }

      console.error('[Erreur Promise Client] :', reason);
      if (msg && msg !== '[object Object]' && msg !== '[object Event]') {
        alert(`[Erreur Promise Client] : ${msg}`);
      }
    };
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  const addFilesInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const ocrAbortControllerRef = useRef<AbortController | null>(null);
  const [supervisionFailure, setSupervisionFailure] = useState<{
    errorMsg: string;
    primaryResult: any;
  } | null>(null);
  const [mainView, setMainView] = useState<"CORRECTION" | "CLASSES" | "MAINTENANCE" | "HISTORY" | "GENERATOR">("CORRECTION");
  const [mode, setMode] = useState<"SINGLE" | "BATCH">("SINGLE");
  // ── Réglages persistés (niveau, modèles, clés, dossiers, e-mail) ─────────
  // Regroupés dans useCorrectionSettings : une trentaine d'états et autant
  // d'effets de persistance qui encombraient ce composant.
  const {
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
    compositionType, setCompositionType,
    compositionCorpus, setCompositionCorpus,
    compositionLanguage, setCompositionLanguage,
    compositionSubject, setCompositionSubject,
    compositionDisableGrid, setCompositionDisableGrid,
    customInstructions, setCustomInstructions,
    level, setLevel, handleLevelChange,
    language, setLanguage,
    gradingMode, setGradingMode,
    nativeLanguageSelect, setNativeLanguageSelect,
    plusEnglish, setPlusEnglish, nativeLanguage,
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
    emailSubject, setEmailSubject,
    emailBody, setEmailBody,
    signature, setSignature,
  } = useCorrectionSettings();
  // État de la modale de double évaluation externe.
  const [externalModalOpen, setExternalModalOpen] = useState(false);
  const [externalTasks, setExternalTasks] = useState<ExternalSupervisionTask[]>([]);
  const [externalContext, setExternalContext] = useState<'single' | 'batch'>('single');
  const [externalMode, setExternalMode] = useState<'initial' | 'supervision'>('supervision');
  const [isExternalBatchLoading, setIsExternalBatchLoading] = useState(false);
  // Incrémenté à chaque remplacement du résultat affiché (supervision) pour
  // forcer le remontage de EvaluationResultView et éviter un affichage figé.
  const [evalResultVersion, setEvalResultVersion] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<number>(1);

  // Single Evaluation State
  const [text, setText] = useState("");
  const [ocrModelInfo, setOcrModelInfo] = useState<{ model: string; fallbackNotice?: string } | null>(null);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [isEvaluatingAll, setIsEvaluatingAll] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<EvaluationData | null>(null);
  const [singleOcrAlerts, setSingleOcrAlerts] = useState<string[]>([]);
  const { toast, setToast, showToast } = useToast();

  // Restauration du dernier lot en cours (les réglages, eux, sont gérés
  // par useCorrectionSettings).
  useEffect(() => {
    let savedPendingReviews: string | null = null;
    let savedBatchResults: string | null = null;
    try {
      savedPendingReviews = localStorage.getItem("delf_pending_reviews");
      savedBatchResults = localStorage.getItem("delf_batch_results");
    } catch { /* stockage indisponible */ }

    let parsedReviews: any[] = [];
    let parsedBatchResults: any = null;
    try { parsedReviews = savedPendingReviews ? JSON.parse(savedPendingReviews) : []; } catch { parsedReviews = []; }
    try { parsedBatchResults = savedBatchResults ? JSON.parse(savedBatchResults) : null; } catch { parsedBatchResults = null; }

    // Récupération d'état corrompu : si batchResults existe mais que la liste
    // des copies est vide, on réinitialise pour éviter une page blanche.
    if (parsedBatchResults && (!parsedReviews || parsedReviews.length === 0)) {
      try {
        localStorage.removeItem("delf_batch_results");
        localStorage.removeItem("delf_pending_reviews");
      } catch { /* stockage indisponible */ }
    } else {
      if (parsedReviews.length > 0) setPendingReviews(parsedReviews);
      if (parsedBatchResults) setBatchResults(parsedBatchResults);
    }
  }, []);

  const [autoEmail, setAutoEmail] = useState(false);
  const [batchCorrectionIndex, setBatchCorrectionIndex] = useState<number | null>(null);
  const [batchCorrectionText, setBatchCorrectionText] = useState("");
  const [isBatchCorrectingEval, setIsBatchCorrectingEval] = useState(false);
  const [isBatchLoading, setIsBatchLoading] = useState(false);
  const [batchResults, setBatchResults] = useState<any>(null);
  const [pendingReviews, setPendingReviews] = useState<any[]>([]);
  const [isSendingBatch, setIsSendingBatch] = useState(false);
  const [folderPickerTarget, setFolderPickerTarget] = useState<'source' | 'output' | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ message: string; fileIndex: number; totalFiles: number; phase: string } | null>(null);
  const [batchKeyInfo, setBatchKeyInfo] = useState<{ source: string, key: string } | null>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [isRetrying, setIsRetrying] = useState<string | null>(null);
  const [isAddingToBatch, setIsAddingToBatch] = useState(false);
  const [comparisonModalData, setComparisonModalData] = useState<any>(null);
  // Persistence for batch results
  useEffect(() => {
    localStorage.setItem("delf_pending_reviews", JSON.stringify(pendingReviews));
    
    if (pendingReviews && pendingReviews.length > 0) {
      const timeoutId = setTimeout(() => {
        fetch("/api/batch/last", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ results: pendingReviews, outputFolder })
        }).catch(e => console.error("Save batch error:", e));
      }, 2000); // 2 second debounce
      return () => clearTimeout(timeoutId);
    }
  }, [pendingReviews, outputFolder]);

  useEffect(() => {
    if (batchResults) {
      localStorage.setItem("delf_batch_results", JSON.stringify(batchResults));
    } else {
      localStorage.removeItem("delf_batch_results");
    }
  }, [batchResults]);

  // Fetch classes for batch matching
  useEffect(() => {
    fetch("/api/classes").then(r => r.json()).then(res => {
      if (Array.isArray(res)) setClasses(res);
    }).catch(console.error);
  }, []);

  const handleOcrInterrupt = () => {
    if (ocrAbortControllerRef.current) {
      ocrAbortControllerRef.current.abort();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    // Sort by lastModified (oldest first)
    files.sort((a, b) => a.lastModified - b.lastModified);
    
    setIsOcrLoading(true);
    setSingleOcrAlerts([]);

    const controller = new AbortController();
    ocrAbortControllerRef.current = controller;
    
    try {
      const filePromises = files.map(file => {
        return new Promise<{ fileUri: string, mimeType: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve({
            fileUri: (reader.result as string).split(',')[1],
            mimeType: file.type
          });
          reader.onerror = () => reject(new Error("Erreur de lecture du fichier : " + (reader.error?.message || file.name)));
          reader.readAsDataURL(file);
        });
      });
      
      const fileDataList = await Promise.all(filePromises);
 
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ 
          files: fileDataList,
          ocrModel, 
          level,
          apiKeys: Object.fromEntries(Object.entries(apiKeys).map(([k, v]) => [k, { ...v, keyMode: ocrKeyMode }])),
          nativeLanguage
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      let combinedText = data.text || "";
      if (data.studentName) {
        combinedText = `Nom: ${data.studentName}\n` + (data.studentEmail ? `Email: ${data.studentEmail}\n` : '') + `---\n\n` + combinedText;
      }
      setText(combinedText);
      if (combinedText) {
        setOcrModelInfo({
          model: data.modelUsed || ocrModel,
          fallbackNotice: data.fallbackNotice
        });
      }
      
      if (data.fallbackNotice) {
        showToast(data.fallbackNotice, "Repli automatique (OCR)");
      }

      if (data.ocrAlerts && Array.isArray(data.ocrAlerts)) {
        setSingleOcrAlerts(data.ocrAlerts);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        alert("Extraction OCR interrompue par l'utilisateur.");
      } else {
        alert("Erreur OCR : " + err.message);
      }
    } finally {
      setIsOcrLoading(false);
      // Reset input value to allow selecting same files again if needed
      e.target.value = '';
    }
  };

  const autoSaveToHistory = async (evaluationData: any): Promise<string | null> => {
    try {
      if (!evaluationData) return null;
      const effectiveSubject = evaluationData.subject 
        || subject 
        || batchSubject 
        || evaluationData._comparison?.firstEval?.subject 
        || evaluationData._comparison?.secondEval?.subject 
        || '';

      const payload = {
        ...evaluationData,
        subject: effectiveSubject,
        level: evaluationData.level || level || "B2",
      };

      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        return data.record?.id || data.records?.[0]?.id || null;
      }
    } catch (err) {
      console.error("Erreur lors de la sauvegarde automatique dans l'historique :", err);
    }
    return null;
  };

  const handleSuperviseResultWithState = async (primaryResult: any) => {
    setIsLoading(true);
    setIsSupervisingSingle(true);
    setLoadingPhase(21);
    const phaseInterval = setInterval(() => {
      setLoadingPhase(prev => (prev < 23 ? prev + 1 : 23));
    }, 6000);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch("/api/evaluate/supervise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          result: primaryResult,
          text: primaryResult.transcription,
          subject: subject || "Sujet",
          language,
          level,
          evalModel,
          supervisionProvider,
          supervisionModel,
          apiKeys: Object.fromEntries(Object.entries(apiKeys).map(([k, v]) => [k, { ...v, keyMode }])),
          gradingMode,
          nativeLanguage
        })
      });

      clearInterval(phaseInterval);

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de la double évaluation");
      }

      if (data.fallbackNotice) {
        showToast(data.fallbackNotice, "Repli automatique (Superviseur)");
      }

      const dataToSave = { ...data, id: (primaryResult as any)?.id || data.id };
      const savedId = await autoSaveToHistory(dataToSave);
      setEvaluationResult({ ...dataToSave, id: savedId || dataToSave.id });
      setEvalResultVersion(v => v + 1);
      setIsLoading(false);
    } catch (err: any) {
      clearInterval(phaseInterval);
      const isAbort = err.name === 'AbortError' || (err instanceof DOMException && err.name === 'AbortError');
      const errorMsg = isAbort
        ? `La double évaluation par ${getFriendlyModelName(supervisionModel, supervisionProvider)} a été interrompue.`
        : `La double évaluation par ${getFriendlyModelName(supervisionModel, supervisionProvider)} n'a pas pu aboutir (${err.message || 'Erreur inconnue'}).`;
      
      // Conserver et afficher le résultat de la 1re évaluation (la dernière réussie)
      setEvaluationResult(primaryResult);
      setEvalResultVersion(v => v + 1);
      setIsLoading(false);
      setIsSupervisingSingle(false);

      alert(`${errorMsg}\n\nLe résultat de la première évaluation a été conservé. Vous pouvez consulter le bilan ou procéder à une évaluation externe.`);
    } finally {
      clearInterval(phaseInterval);
      setIsSupervisingSingle(false);
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const openExternalInitial = (context: 'single' | 'batch', tasks: any[]) => {
    if (tasks.length === 0) {
      alert("Aucune copie à soumettre à l'évaluation externe.");
      return;
    }
    setExternalMode('initial');
    setExternalContext(context);
    setExternalTasks(tasks);
    setExternalModalOpen(true);
  };

  const openExternalSupervision = (context: 'single' | 'batch', tasks: ExternalSupervisionTask[]) => {
    if (tasks.length === 0) {
      alert("Aucune copie à soumettre à la double évaluation externe.");
      return;
    }
    setExternalMode('supervision');
    setExternalContext(context);
    setExternalTasks(tasks);
    setExternalModalOpen(true);
  };

  // ─── Automatisation Externe par Lot (Claude / ChatGPT Desktop) ───
  const handlePrepareExternalBatch = async (taskType: 'ocr' | 'eval' | 'supervision', itemsOverride?: any[]) => {
    try {
      setIsExternalBatchLoading(true);
      let itemsToPrepare: any[] = [];
      if (itemsOverride && itemsOverride.length > 0) {
        itemsToPrepare = itemsOverride;
      } else if (taskType === 'ocr' || taskType === 'eval') {
        const resList = await fetch(`/api/batch?folder=${encodeURIComponent(batchFolder)}`);
        if (!resList.ok) throw new Error("Impossible de lister les fichiers du dossier source.");
        const listData = await resList.json();
        const files: string[] = listData.files || [];
        if (files.length === 0) {
          alert("Aucun fichier trouvé dans le dossier du lot.");
          setIsExternalBatchLoading(false);
          return;
        }
        itemsToPrepare = files.map(f => ({
          file: f,
          filePath: `${batchFolder}\\${f}`,
          subject: batchSubject || subject || 'Sujet'
        }));
      } else if (taskType === 'supervision') {
        itemsToPrepare = pendingReviews
          .filter(r => r.status === 'success' && !r.isOcrOnly)
          .map(r => ({
            file: r.file,
            filePath: `${batchFolder}\\${r.file}`,
            subject: r.subject || batchSubject || subject || 'Sujet',
            transcription: r.transcription || '',
            result1: r
          }));
      }

      if (itemsToPrepare.length === 0) {
        alert("Aucune copie éligible pour cette tâche externe.");
        setIsExternalBatchLoading(false);
        return;
      }

      const res = await fetch('/api/batch/external/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskType,
          exchangeFolder: outputFolder ? `${outputFolder}\\_ECHANGE_IA` : undefined,
          items: itemsToPrepare,
          config: {
            level,
            language,
            gradingMode,
            nativeLanguage
          }
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de la préparation.");
      showToast(`Dossier d'échange préparé (${data.totalItems} copies).`, "Automatisation Externe");
      alert(` Dossier d'échange préparé pour Claude / ChatGPT Desktop !\n\nEmplacement : ${data.exchangeFolder}\nFichier de consignes : ${data.instructionsPath}\n\n1. Ouvrez l'application IA de bureau (Claude ou ChatGPT avec accès disque local).\n2. Donnez-lui le fichier CONSIGNES.md (ou glissez le dossier).\n3. L'IA produira les livrables dans le sous-dossier 'livrables'.\n4. Une fois terminé, cliquez sur "Importer livrables externes".`);
    } catch (err: any) {
      alert(`Erreur : ${err.message || 'Impossible de préparer le lot externe'}`);
    } finally {
      setIsExternalBatchLoading(false);
    }
  };

  const handleImportExternalBatch = async (taskType: 'ocr' | 'eval' | 'supervision', itemsOverride?: any[]) => {
    try {
      setIsExternalBatchLoading(true);
      let itemsToExpect: any[] = [];
      if (itemsOverride && itemsOverride.length > 0) {
        itemsToExpect = itemsOverride;
      } else if (pendingReviews.length > 0) {
        itemsToExpect = pendingReviews.map(r => ({
          file: r.file,
          filePath: `${batchFolder}\\${r.file}`,
          subject: r.subject || batchSubject || subject || 'Sujet',
          transcription: r.transcription || '',
          studentName: r.studentName,
          studentEmail: r.studentEmail,
          result1: r
        }));
      } else {
        const resList = await fetch(`/api/batch?folder=${encodeURIComponent(batchFolder)}`);
        if (!resList.ok) throw new Error("Impossible de lister les fichiers du dossier source.");
        const listData = await resList.json();
        const files: string[] = listData.files || [];
        itemsToExpect = files.map(f => ({
          file: f,
          filePath: `${batchFolder}\\${f}`,
          subject: batchSubject || subject || 'Sujet'
        }));
      }

      const res = await fetch('/api/batch/external/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskType,
          exchangeFolder: outputFolder ? `${outputFolder}\\_ECHANGE_IA` : undefined,
          items: itemsToExpect,
          config: {
            level,
            language,
            gradingMode,
            nativeLanguage
          }
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de l'import.");

      if (!data.results || data.results.length === 0) {
        alert(`Aucun livrable trouvé dans le dossier 'livrables' (${data.exchangeFolder || ''}).\nAssurez-vous que l'application de bureau a bien généré les fichiers demandés.`);
        setIsExternalBatchLoading(false);
        return;
      }

      const importedResults: any[] = data.results;
      setPendingReviews(prev => {
        if (prev.length === 0) {
          return importedResults.map(r => ({
            ...r,
            subject: r.subject || batchSubject || subject || 'Sujet',
            batchMode: taskType === 'ocr' ? 'ocr_only' : 'full',
            isDirty: true
          }));
        }
        return prev.map(existing => {
          const found = importedResults.find(m => m.file === existing.file || m.file?.toLowerCase() === existing.file?.toLowerCase());
          if (!found) return existing;
          return {
            ...existing,
            ...found,
            subject: found.subject || existing.subject || batchSubject || subject || 'Sujet',
            studentName: existing.studentName || found.studentName,
            studentEmail: existing.studentEmail || found.studentEmail,
            isDirty: true
          };
        });
      });

      showToast(`${data.totalFound}/${data.totalExpected} livrables importés avec succès !`, "Import Externe");
    } catch (err: any) {
      alert(`Erreur : ${err.message || 'Impossible d\'importer les livrables'}`);
    } finally {
      setIsExternalBatchLoading(false);
    }
  };

  const handleApplyExternalSupervision = (results: { fileId: string; finalResult: any }[]) => {
    try {
      if (externalContext === 'single') {
        const base = evaluationResult || externalTasks[0]?.result1;
        const final = results[0]?.finalResult;
        if (final) {
          const appliedSubject = final.subject || base?.subject || externalTasks[0]?.subject || subject || '';
          const appliedData = {
            ...final,
            id: (base as any)?.id || final.id,
            subject: appliedSubject,
            studentName: base?.studentName ?? final.studentName,
            studentEmail: base?.studentEmail ?? final.studentEmail,
            transcription: base?.transcription ?? final.transcription,
          };
          autoSaveToHistory(appliedData).then(savedId => {
            if (savedId) {
              setEvaluationResult(prev => prev ? { ...prev, id: savedId } : appliedData);
            }
          }).catch(console.error);

          setEvaluationResult(appliedData);
          if (appliedSubject) setSubject(appliedSubject);
          // Force le remontage pour que le feedback et le PDF reflètent bien la
          // version supervisée (et non l'évaluation initiale figée).
          setEvalResultVersion(v => v + 1);
        }
      } else {
        const updated = pendingReviews.map(r => {
          const m = results.find(x => x.fileId === r.file);
          if (!m) return r;
          // On superpose l'évaluation finale tout en conservant l'identité et les
          // métadonnées de la copie (fichier, statut, classe, e-mail...).
          return {
            ...r,
            ...m.finalResult,
            subject: m.finalResult.subject || r.subject || batchSubject || subject || 'Sujet',
            file: r.file,
            status: 'success',
            batchMode: r.batchMode,
            emailSent: r.emailSent,
            studentId: r.studentId,
            classId: r.classId,
            className: r.className,
            studentName: r.studentName ?? m.finalResult.studentName,
            studentEmail: r.studentEmail ?? m.finalResult.studentEmail,
            isDirty: true,
          };
        });
        setPendingReviews(updated);

        // Sync updated batch items to history
        const itemsToSave = updated
          .filter(r => r.status === 'success')
          .map(r => ({
            ...r,
            subject: r.subject || batchSubject || subject || '',
            level: r.level || level || 'B2'
          }));
        if (itemsToSave.length > 0) {
          fetch("/api/history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ records: itemsToSave })
          }).catch(err => console.error("Batch supervision history sync error:", err));
        }
      }
      // En mode unique, on ferme automatiquement la modale. 
      // En mode lot, on la laisse ouverte pour permettre d'importer les autres sous-lots.
      if (externalContext === 'single') {
        setExternalModalOpen(false);
      }
    } catch (err: any) {
      console.error("Erreur lors de l'application de la supervision externe :", err);
      alert("Une erreur est survenue lors de l'application de la supervision : " + err.message);
    }
  };

  const handleEvaluate = async () => {
    if (examType === 'dictee') {
      if (!dictationReferenceText.trim()) return alert("Veuillez renseigner le texte officiel de la dictée.");
      if (!text.trim()) return alert("Veuillez renseigner la copie de l'élève.");
    } else if (examType === 'traduction') {
      if (!translationSourceText.trim()) return alert("Veuillez renseigner le texte source à traduire.");
      if (!text.trim()) return alert("Veuillez renseigner la traduction de l'élève.");
    } else if (examType === 'grammaire') {
      if (!grammarExerciseSubject.trim() || !grammarAnswerKey.trim()) return alert("Veuillez renseigner l'énoncé et le corrigé des exercices de grammaire.");
      if (!text.trim()) return alert("Veuillez renseigner les réponses de l'élève.");
    } else if (examType === 'composition') {
      const activeSubject = compositionSubject.trim() || subject.trim();
      if (!activeSubject) return alert("Veuillez renseigner le sujet de la composition.");
      if (compositionDisableGrid && !customInstructions.trim()) {
        return alert("La grille officielle est désactivée : veuillez renseigner vos critères ou votre barème dans le champ dédié.");
      }
      if (!text.trim()) return alert("Veuillez renseigner la copie de l'élève.");
    } else {
      if (!subject || !text) return alert("Veuillez remplir le sujet et le texte.");
    }

    setIsLoading(true);
    setLoadingPhase(1);
    const phaseInterval = setInterval(() => {
      setLoadingPhase(prev => (prev < 3 ? prev + 1 : 3));
    }, 6000);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const isCustom = examType !== 'delf_b1' && examType !== 'delf_b2';
      const effectiveExamType = isCustom ? examType : 'delf';
      const effectiveSubject = examType === 'dictee' ? 'Dictée' :
                               examType === 'traduction' ? 'Traduction' :
                               examType === 'grammaire' ? grammarExerciseSubject :
                               examType === 'composition' ? (compositionSubject.trim() || subject.trim()) : subject;

      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ 
          subject: effectiveSubject, 
          text, 
          evalModel, 
          language, 
          level, 
          ocrModel,
          useDoubleEval: false,
          supervisionProvider,
          supervisionModel,
          apiKeys: Object.fromEntries(Object.entries(apiKeys).map(([k, v]) => [k, { ...v, keyMode }])),
          gradingMode,
          nativeLanguage,
          examType: effectiveExamType,
          maxScore: customMaxScore,
          referenceText: dictationReferenceText,
          penalties: dictationPenalties,
          sourceText: translationSourceText,
          modelTranslation: translationModel,
          sourceLang: translationSourceLang,
          targetLang: translationTargetLang,
          exerciseSubject: grammarExerciseSubject,
          answerKey: grammarAnswerKey,
          compositionType,
          corpusText: compositionCorpus,
          compositionLanguage,
          disableStandardGrid: compositionDisableGrid,
          customInstructions,
        })
      });

      clearInterval(phaseInterval);

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error);
      }

      if (data.fallbackNotice) {
        showToast(data.fallbackNotice, "Repli automatique de modèle");
      }

      if (useDoubleEval && supervisionMode === 'external') {
        // Double évaluation externe : on affiche la 1re évaluation telle quelle
        // puis on ouvre la modale d'export/import (aucun appel API de supervision).
        abortControllerRef.current = null;
        const savedId = await autoSaveToHistory(data);
        const enriched = { ...data, id: savedId || data.id };
        setEvaluationResult(enriched);
        setIsLoading(false);
        openExternalSupervision('single', [{
          fileId: enriched.file || 'single',
          subject: enriched.subject || subject || 'Sujet',
          transcription: enriched.transcription || text,
          result1: enriched,
        }]);
      } else if (useDoubleEval && supervisionProvider && supervisionModel) {
        abortControllerRef.current = null;
        await handleSuperviseResultWithState(data);
      } else {
        const savedId = await autoSaveToHistory(data);
        const enriched = { ...data, id: savedId || data.id };
        setEvaluationResult(enriched);
        setIsLoading(false);
      }
    } catch (err: any) {
      clearInterval(phaseInterval);
      if (err.name === 'AbortError') {
        alert(`L'évaluation par ${getFriendlyModelName(evalModel)} a été interrompue.`);
      } else {
        alert(`Erreur (Évaluateur ${getFriendlyModelName(evalModel)}) : ${err.message}`);
      }
      setIsLoading(false);
    } finally {
      abortControllerRef.current = null;
    }
  };

  const [isSupervisingSingle, setIsSupervisingSingle] = useState(false);
  const handleSuperviseSingleResult = async () => {
    if (!evaluationResult) return;
    if (supervisionMode === 'external') {
      openExternalSupervision('single', [{
        fileId: (evaluationResult as any).file || 'single',
        subject: subject || 'Sujet',
        transcription: evaluationResult.transcription || text,
        result1: evaluationResult as any,
      }]);
      return;
    }
    await handleSuperviseResultWithState(evaluationResult);
  };

  const handleLoadHistoryRecord = async (recordId: string) => {
    try {
      const res = await fetch(`/api/history?id=${recordId}`);
      if (!res.ok) throw new Error("Impossible de charger le bilan détaillé.");
      const detailedData = await res.json();
      const recoveredSubject = detailedData.subject
        || detailedData._comparison?.firstEval?.subject
        || detailedData._comparison?.secondEval?.subject
        || detailedData._comparison?.thirdEval?.subject
        || "";
      setEvaluationResult({
        ...detailedData,
        subject: recoveredSubject,
      });
      setSubject(recoveredSubject);
      setText(detailedData.transcription || "");
      setMode("SINGLE");
      setMainView("CORRECTION");
      setEvalResultVersion(v => v + 1);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleSendFeedback = async (finalData: EvaluationData) => {
    try {
      setIsLoading(true);
      setLoadingPhase(5);
      // Générer le PDF (la route retourne un binaire PDF)
      const pdfRes = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...finalData, level, outputFolder })
      });
      if (!pdfRes.ok) {
        const errData = await pdfRes.json().catch(() => ({ error: 'Erreur serveur' }));
        throw new Error(errData.error);
      }
      // Télécharger le PDF localement
      const blob = await pdfRes.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      
      const now = new Date();
      const dateStr = now.getFullYear().toString() + (now.getMonth() + 1).toString().padStart(2, "0") + now.getDate().toString().padStart(2, "0");
      
      let baseName = "";
      if (finalData.studentName) {
        baseName = finalData.studentName.trim().replace(/\s+/g, "_");
      } else if (finalData.studentEmail) {
        baseName = finalData.studentEmail.split("@")[0];
      } else {
        baseName = "Bilan_DELF_" + level;
      }
      a.download = baseName + "_" + dateStr + ".pdf";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      // Envoi de l'e-mail
      let emailStatus = "";
      if (finalData.studentEmail) {
          const cd = pdfRes.headers.get('Content-Disposition');
          let currentPdfFileName = a.download;
          if (cd && cd.includes('filename="')) {
              const encoded = cd.split('filename="')[1].split('"')[0];
              currentPdfFileName = decodeURIComponent(encoded);
          }
          const currentPdfPath = `${outputFolder}/${currentPdfFileName}`;

          const emailRes = await fetch("/api/email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                to: finalData.studentEmail, 
                subject: emailSubject,
                body: emailBody,
                attachmentName: currentPdfFileName, 
                attachmentPath: currentPdfPath, 
                level,
                emailConfig
              })
          });

          if (emailRes.ok) {
              emailStatus = " et e-mail envoyé avec succès";
          } else {
              const errData = await emailRes.json().catch(() => ({ error: 'Erreur inconnue' }));
              emailStatus = ` (ERREUR E-MAIL : ${errData.error})`;
          }
      } else {
          emailStatus = " (Aucun e-mail spécifié)";
      }

      // Enregistrer dans l'historique
      const historyRes = await fetch("/api/history", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
           ...finalData,
           subject: finalData.subject || subject || (finalData as any)._comparison?.firstEval?.subject || (finalData as any)._comparison?.secondEval?.subject || '',
           level
         })
      });

      // Rattacher l'identifiant d'historique au bilan affiché : sans lui, une
      // correction ultérieure du nom de l'apprenant n'aurait aucun enregistrement
      // à mettre à jour et serait perdue.
      try {
        const saved = await historyRes.json();
        if (saved?.record?.id) {
          setEvaluationResult(prev => (prev ? { ...prev, id: saved.record.id } : prev));
        }
      } catch (e) {
        console.warn("Identifiant d'historique non récupéré :", e);
      }

      // Mettre à jour l'email dans la base si modifié
      if (finalData.classId && finalData.studentId && finalData.studentEmail) {
         await fetch("/api/classes", {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify({ action: "UPDATE_STUDENT_EMAIL", studentEmailUpdates: { classId: finalData.classId, studentId: finalData.studentId, email: finalData.studentEmail } })
         });
      }

      alert(`Succès ! Bilan PDF généré, historique sauvegardé${emailStatus}.`);
    } catch (err: any) {
      const msg = err?.message || "";
      const isNetwork = msg.includes("Failed to fetch") || msg.includes("NetworkError") || err?.name === "TypeError";
      if (isNetwork) {
        alert("Erreur réseau : Le serveur local (port 3000) est inaccessible ou a été arrêté. Veuillez relancer l'application (Lancer_Arriere_Plan.vbs sous Windows, Lancer_Correcteur.command sur Mac).");
      } else {
        alert(msg || "Erreur inconnue");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartBatch = async (ocrOnly: boolean = false) => {
    // 1. Validation pré-vol du dossier source
    if (!batchFolder || !batchFolder.trim()) {
      alert("Veuillez sélectionner un dossier source contenant les copies à évaluer.");
      return;
    }

    // 2. Validation pré-vol selon l'épreuve
    if (!ocrOnly) {
      if (examType === 'dictee') {
        if (!dictationReferenceText.trim()) {
          alert("Veuillez renseigner le texte officiel de la dictée avant de lancer le lot.");
          return;
        }
      } else if (examType === 'traduction') {
        if (!translationSourceText.trim()) {
          alert("Veuillez renseigner le texte source à traduire avant de lancer le lot.");
          return;
        }
      } else if (examType === 'grammaire') {
        if (!grammarExerciseSubject.trim() || !grammarAnswerKey.trim()) {
          alert("Veuillez renseigner l'énoncé et le corrigé des exercices de grammaire avant de lancer le lot.");
          return;
        }
      } else if (examType === 'composition') {
        const activeSubject = compositionSubject.trim() || batchSubject.trim() || subject.trim();
        if (!activeSubject) {
          alert("Veuillez renseigner le sujet de la composition avant de lancer le lot.");
          return;
        }
        if (compositionDisableGrid && !customInstructions.trim()) {
          alert("La grille officielle est désactivée : veuillez renseigner vos critères ou votre barème dans le champ dédié.");
          return;
        }
      }
    }

    setIsBatchLoading(true);
    setBatchProgress(null);
    setBatchKeyInfo(null);
    setBatchResults(null);
    setPendingReviews([]);
    try {
      const qs = new URLSearchParams();
      if (evalModel) qs.append("evalModel", evalModel);
      if (autoEmail) qs.append("autoEmail", "true");
      // En mode externe, le lot ne fait que la 1re évaluation ; la double
      // évaluation est faite après coup via l'export/import Claude.
      if (!ocrOnly && useDoubleEval && supervisionMode === 'internal') qs.append("useDoubleEval", "true");

      const res = await fetch(`/api/batch?${qs.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          autoEmail: !ocrOnly && autoEmail, 
          evalModel, 
          ocrModel,
          ocrOnly,
          folderPath: batchFolder, 
          outputFolderPath: outputFolder, 
          language, 
          level, 
          subject: batchSubject,
          supervisionProvider,
          supervisionModel,
          apiKeys: Object.fromEntries(Object.entries(apiKeys).map(([k, v]) => [k, { ...v, keyMode }])),
          ocrKeyMode,
          emailConfig,
          gradingMode,
          nativeLanguage,
          examType,
          customConfig: {
            referenceText: examType === 'dictee' ? dictationReferenceText : (examType === 'traduction' ? translationSourceText : (examType === 'grammaire' ? grammarExerciseSubject : (examType === 'composition' ? (compositionSubject.trim() || batchSubject.trim()) : undefined))),
            modelTranslation: examType === 'traduction' ? translationModel : (examType === 'grammaire' ? grammarAnswerKey : undefined),
            sourceLanguage: examType === 'traduction' ? translationSourceLang : undefined,
            targetLanguage: examType === 'traduction' ? translationTargetLang : (examType === 'composition' ? compositionLanguage : undefined),
            customInstructions,
            maxScore: customMaxScore,
            dictationPenalties: examType === 'dictee' ? dictationPenalties : undefined,
            compositionType: examType === 'composition' ? compositionType : undefined,
            corpusText: examType === 'composition' ? compositionCorpus : undefined,
            disableStandardGrid: examType === 'composition' ? compositionDisableGrid : undefined,
          }
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Erreur serveur');
      }

      // Lecture du stream SSE
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const dataStr = line.replace('data: ', '').trim();
            if (!dataStr) continue;
            try {
              const event = JSON.parse(dataStr);
              if (event.type === 'progress') {
                setBatchProgress({ message: event.message, fileIndex: event.fileIndex, totalFiles: event.totalFiles, phase: event.phase });
              } else if (event.type === 'key_update') {
                setBatchKeyInfo({ source: event.source, key: event.key });
              } else if (event.type === 'file_done') {
                let result = event.result;
                if (result.fallbackNotice) {
                  showToast(result.fallbackNotice, `Repli automatique (${result.file || 'Copie'})`);
                }
                // Auto-matching logic using robust helper
                const match = findMatchingStudent(result.studentName, result.studentEmail, classes);
                if (match) {
                  result = {
                    ...result,
                    classId: match.classId,
                    className: match.className,
                    studentId: match.studentId,
                    studentName: match.studentName,
                    studentEmail: match.studentEmail
                  };
                }

                // Add or update in pendingReviews
                setPendingReviews(prev => {
                  const existingIdx = prev.findIndex(r => r.file === result.file);
                  if (existingIdx >= 0) {
                    const nr = [...prev];
                    nr[existingIdx] = { ...nr[existingIdx], ...result };
                    return nr;
                  }
                  return [...prev, result];
                });

                // Auto-save to history immediately
                if (result.status === 'success' && !ocrOnly) {
                  autoSaveToHistory({
                    ...result,
                    subject: result.subject || batchSubject || subject || '',
                    level: result.level || level || 'B2'
                  }).then(savedId => {
                    if (savedId) {
                      setPendingReviews(prev => prev.map(r => r.file === result.file ? { ...r, id: savedId } : r));
                    }
                  }).catch(console.error);
                }
              } else if (event.type === 'file_error') {
                const errObj = event.result || {
                  file: event.fileName,
                  status: 'error',
                  reason: event.error,
                  batchMode: event.batchMode
                };
                setPendingReviews(prev => {
                  const existingIdx = prev.findIndex(r => r.file === errObj.file);
                  if (existingIdx >= 0) {
                    const nr = [...prev];
                    nr[existingIdx] = { ...nr[existingIdx], ...errObj };
                    return nr;
                  }
                  return [...prev, errObj];
                });
              } else if (event.type === 'done') {
                setBatchResults({ success: true, processed: event.results.length, details: event.results });
                if (!ocrOnly) {
                  const itemsToSave = event.results
                    .filter((r: any) => r.status === 'success')
                    .map((r: any) => ({
                      ...r,
                      subject: r.subject || batchSubject || subject || '',
                      level: r.level || level || 'B2'
                    }));
                  if (itemsToSave.length > 0) {
                    fetch("/api/history", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ records: itemsToSave })
                    }).catch(err => console.error("Batch done history sync error:", err));
                  }
                }
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }
    } catch (err: any) {
      alert("Erreur: " + err.message);
    } finally {
      setIsBatchLoading(false);
      setBatchProgress(null);
    }
  };

  const handleSyncBatchToHistory = async () => {
    const itemsToSave = pendingReviews.filter(r => r.status === 'success' && !r.isOcrOnly);
    if (itemsToSave.length === 0) {
      alert("Aucune évaluation terminée à synchroniser dans le lot actuel.");
      return;
    }
    setIsBatchLoading(true);
    try {
      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          records: itemsToSave.map(r => ({
            ...r,
            subject: r.subject || batchSubject || subject || '',
            level: r.level || level || 'B2'
          }))
        })
      });
      if (!res.ok) throw new Error("Erreur lors de la synchronisation");
      const data = await res.json();
      alert(`Synchronisation réussie ! ${data.count || itemsToSave.length} évaluation(s) enregistrée(s) dans l'historique.`);
    } catch (e: any) {
      alert("Erreur de synchronisation : " + e.message);
    } finally {
      setIsBatchLoading(false);
    }
  };

  const handleResumeLastBatch = async () => {
    setIsBatchLoading(true);
    try {
      const res = await fetch(`/api/batch/last?outputFolder=${encodeURIComponent(outputFolder)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de la récupération");
      
      if (data.results && data.results.length > 0) {
        setPendingReviews(data.results);
        setBatchResults({ success: true, processed: data.results.length, details: data.results });
      } else {
        alert("Aucun lot précédent trouvé.");
      }
    } catch (err: any) {
      alert("Erreur: " + err.message);
    } finally {
      setIsBatchLoading(false);
    }
  };

  const handleLoadBatchFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      let parsedList: any[] = [];
      try {
        const mdList = parseMultiplePEMarkdowns(content);
        if (mdList && mdList.length > 0) parsedList = mdList;
      } catch {}
      if (parsedList.length === 0) {
        try {
          const supList = parseExternalSupervisionResults(content);
          if (supList && supList.length > 0) {
            parsedList = supList.map(item => {
              const ev = item.evaluation || item;
              if (item.comparisonNotes) ev._arbiterNotes = item.comparisonNotes;
              return ev;
            });
          }
        } catch {}
      }
      if (parsedList.length === 0) {
        try {
          const jsonParsed = JSON.parse(escapeControlCharactersInStrings(content));
          parsedList = Array.isArray(jsonParsed) ? jsonParsed : (jsonParsed.details || jsonParsed.results || [jsonParsed]);
        } catch {}
      }
      parsedList = parsedList.map(item => {
        if (item && typeof item === 'object' && item.evaluation && typeof item.evaluation === 'object') {
          const compNotes = item.comparisonNotes || item.evaluation._arbiterNotes;
          const ev = { ...item.evaluation };
          if (compNotes) ev._arbiterNotes = compNotes;
          return ev;
        }
        return item;
      });
      const validEvaluations = parsedList.filter(item => 
        item && typeof item === 'object' && (item.criteriaScores || item.justifications || item.globalScore !== undefined || item.transcription)
      );
      if (validEvaluations.length > 0) {
        setPendingReviews(validEvaluations);
        setBatchResults({ success: true, processed: validEvaluations.length, details: validEvaluations });
        showToast(`${validEvaluations.length} copie(s) chargée(s) avec succès.`, "Import de Lot");
      } else {
        alert("Aucune évaluation valide trouvée dans ce fichier.");
      }
    } catch (err: any) {
      alert("Erreur de lecture du fichier : " + err.message);
    } finally {
      e.target.value = '';
    }
  };

  const handleRetryOcr = async (idx: number) => {
    const itemToRetry = pendingReviews[idx];
    setIsRetrying(itemToRetry.file + "_ocr");
    try {
      const res = await fetch("/api/batch/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          file: itemToRetry.file, 
          folderPath: batchFolder, 
          level, 
          ocrModel,
          apiKeys: Object.fromEntries(Object.entries(apiKeys).map(([k, v]) => [k, { ...v, keyMode: ocrKeyMode }])),
          nativeLanguage
            })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur de relance OCR");

      if (data.fallbackNotice) {
        showToast(data.fallbackNotice, `Repli automatique OCR (${itemToRetry.file})`);
      }

      let updatedItem = {
        ...itemToRetry,
        transcription: data.text,
        studentName: data.studentName || itemToRetry.studentName,
        studentEmail: data.studentEmail || itemToRetry.studentEmail,
        ocrAlerts: data.ocrAlerts || [],
        fallbackNotice: data.fallbackNotice || itemToRetry.fallbackNotice,
        isDirty: true
      };

      const match = findMatchingStudent(updatedItem.studentName, updatedItem.studentEmail, classes);
      if (match) {
        updatedItem = {
          ...updatedItem,
          classId: match.classId,
          className: match.className,
          studentId: match.studentId,
          studentName: match.studentName,
          studentEmail: match.studentEmail
        };
      }

      setPendingReviews(prev => {
        const next = [...prev];
        next[idx] = updatedItem;
        return next;
      });

    } catch (err: any) {
      alert(`Erreur OCR pour ${itemToRetry.file} : ${err.message}`);
    } finally {
      setIsRetrying(null);
    }
  };

  const handleRetryFile = async (itemToRetry: any, silent = false) => {
    setIsRetrying(itemToRetry.file);
    try {
      // Determine retry mode based on the original batch mode
      const isOcrOnlyRetry = itemToRetry.batchMode === 'ocr';
      const isJuryRetry = itemToRetry.batchMode === 'ocr+eval+jury';

      const res = await fetch("/api/batch/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          file: itemToRetry.file, 
          folderPath: batchFolder, 
          subject: batchSubject, 
          level, 
          language, 
          evalModel,
          text: itemToRetry.transcription,
          ocrOnly: isOcrOnlyRetry,
          useDoubleEval: isJuryRetry,
          supervisionProvider: isJuryRetry ? supervisionProvider : undefined,
          supervisionModel: isJuryRetry ? supervisionModel : undefined,
          apiKeys: Object.fromEntries(Object.entries(apiKeys).map(([k, v]) => [k, { ...v, keyMode }])),
          ocrKeyMode,
          gradingMode,
          primaryResult: itemToRetry.primaryResult,
          examType,
          customConfig: {
            referenceText: examType === 'dictee' ? dictationReferenceText : (examType === 'traduction' ? translationSourceText : (examType === 'grammaire' ? grammarExerciseSubject : (examType === 'composition' ? (compositionSubject.trim() || batchSubject.trim()) : undefined))),
            modelTranslation: examType === 'traduction' ? translationModel : (examType === 'grammaire' ? grammarAnswerKey : undefined),
            sourceLanguage: examType === 'traduction' ? translationSourceLang : undefined,
            targetLanguage: examType === 'traduction' ? translationTargetLang : (examType === 'composition' ? compositionLanguage : undefined),
            customInstructions,
            maxScore: customMaxScore,
            dictationPenalties: examType === 'dictee' ? dictationPenalties : undefined,
            compositionType: examType === 'composition' ? compositionType : undefined,
            corpusText: examType === 'composition' ? compositionCorpus : undefined,
            disableStandardGrid: examType === 'composition' ? compositionDisableGrid : undefined,
          }
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur de réévaluation");

      let result = data;
      // Auto-matching logic for the newly evaluated file using robust helper
      const match = findMatchingStudent(result.studentName, result.studentEmail, classes);
      if (match) {
        result = { 
          ...result, 
          classId: match.classId, 
          className: match.className, 
          studentId: match.studentId, 
          studentName: match.studentName, 
          studentEmail: match.studentEmail
        };
      }

      setPendingReviews(prev => {
        // Remplace l'ancien élément à sa position d'origine (maintient l'ordre alphabétique)
        return prev.map(r => r.file === itemToRetry.file ? result : r);
      });

    } catch (err: any) {
      if (silent) {
        // En mode silencieux (Tout relancer), ne pas bloquer avec alert()
        // Mettre à jour la raison de l'erreur dans pendingReviews
        setPendingReviews(prev => prev.map(r => 
          r.file === itemToRetry.file ? { ...r, reason: err.message } : r
        ));
        return err.message; // Retourner l'erreur pour le résumé
      }
      alert(`Erreur pour ${itemToRetry.file} : ${err.message}`);
    } finally {
      setIsRetrying(null);
    }
  };

  const handleSendBatchEmails = async () => {
    if (pendingReviews.length === 0) return;
    setIsSendingBatch(true);
    let sentCount = 0;
    const sentFiles: string[] = [];
    for (let i = 0; i < pendingReviews.length; i++) {
        const item = pendingReviews[i];
        if (!item.studentEmail || item.status !== 'success' || item.emailSent) continue;

        try {
            setPendingReviews(prev => {
              const nr = [...prev];
              nr[i] = { ...nr[i], isSendingEmail: true };
              return nr;
            });
            // Génération à la demande juste avant l'envoi
            const regRes = await fetch("/api/pdf", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ result: item, level, outputFolder })
            });
            
            if (!regRes.ok) throw new Error("Échec de génération PDF");

            const cd = regRes.headers.get('Content-Disposition');
            let currentPdfFileName = 'bilan.pdf';
            if (cd && cd.includes('filename="')) {
                const encoded = cd.split('filename="')[1].split('"')[0];
                currentPdfFileName = decodeURIComponent(encoded);
            }
            const currentPdfPath = `${outputFolder}/${currentPdfFileName}`;

            const emailRes = await fetch("/api/email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                  to: item.studentEmail, 
                  subject: emailSubject,
                  body: emailBody,
                  attachmentName: currentPdfFileName, 
                  attachmentPath: currentPdfPath, 
                  level,
                  emailConfig
                })
            });

            if (!emailRes.ok) {
                const errData = await emailRes.json().catch(() => ({ error: 'Erreur inconnue' }));
                throw new Error("L'envoi de l'e-mail a échoué : " + errData.error);
            }

            // Enregistrer dans l'historique
            await fetch("/api/history", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                  ...item, 
                  subject: item.subject || batchSubject || subject || (item as any)._comparison?.firstEval?.subject || (item as any)._comparison?.secondEval?.subject || '',
                  level 
                })
            });

            sentCount++;
            sentFiles.push(item.file);
        } catch (e) { 
            console.error(e); 
        } finally {
            setPendingReviews(prev => {
              const nr = [...prev];
              if (nr[i]) nr[i] = { ...nr[i], isSendingEmail: false };
              return nr;
            });
        }
    }
    setIsSendingBatch(false);
    
    // Marquer les items envoyés, garder les non-envoyés/erreurs
    setPendingReviews(prev => {
      const updated = prev.map(r => 
        sentFiles.includes(r.file) ? { ...r, emailSent: true } : r
      );
      // Vérifier s'il reste des items non traités (erreurs ou sans email)
      const remaining = updated.filter(r => r.status === 'error' || (r.status === 'success' && !r.emailSent));
      if (remaining.length === 0) {
        // Tout est envoyé, réinitialiser proprement
        setBatchResults(null);
        return [];
      }
      return updated;
    });
    
    alert(`${sentCount} e-mails expédiés et historique sauvegardé !`);
  };

  const handleEvaluateAll = async () => {
    if (pendingReviews.length === 0) return;
    setIsEvaluatingAll(true);
    try {
      const toEval = pendingReviews.filter(r => r.status === 'success' && r.isOcrOnly);
      for (const item of toEval) {
        await handleRetryFile(item, true);
      }
    } finally {
      setIsEvaluatingAll(false);
    }
  };

  const updateBatchScore = (idx: number, key: string, val: number) => {
    const newReviews = [...pendingReviews];
    const item = { ...newReviews[idx] };
    item.criteriaScores = { ...item.criteriaScores, [key]: val };
    // Recalcul global
    const rawGlobal = Object.values(item.criteriaScores).reduce((a: any, b: any) => a + (Number(b) || 0), 0) as number;
    item.globalScore = rawGlobal;
    item.isDirty = true;
    newReviews[idx] = item;
    setPendingReviews(newReviews);
  };

  const handlePreviewPdf = async (item: any) => {
    try {
      const res = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result: item, level, outputFolder })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Erreur serveur" }));
        throw new Error(errData.error || "Erreur génération PDF");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Inconnue';
      const isNetwork = msg.includes("Failed to fetch") || msg.includes("NetworkError") || (e instanceof TypeError);
      if (isNetwork) {
        alert("Erreur lors de l'aperçu : Le serveur local (port 3000) est inaccessible ou a été arrêté. Veuillez relancer l'application (Lancer_Arriere_Plan.vbs sous Windows, Lancer_Correcteur.command sur Mac).");
      } else {
        alert("Erreur lors de l'aperçu : " + msg);
      }
    }
  };

  const handleTransferToSingleMode = (idx: number) => {
    const itemToTransfer = pendingReviews[idx];
    setBatchCorrectionIndex(idx);
    setBatchCorrectionText(itemToTransfer.transcription || "");
  };

  const handleBatchCorrectionEval = async () => {
    if (batchCorrectionIndex === null) return;
    setIsBatchCorrectingEval(true);
    const itemToTransfer = pendingReviews[batchCorrectionIndex];
    
    try {
      // Create artificial phases
      setLoadingPhase(1);
      const phaseInterval = setInterval(() => {
        setLoadingPhase(prev => (prev < 3 ? prev + 1 : 3));
      }, 6000);

      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          subject: batchSubject || "Lot", 
          text: batchCorrectionText, 
          evalModel, 
          language, 
          level,
          apiKeys: Object.fromEntries(Object.entries(apiKeys).map(([k, v]) => [k, { ...v, keyMode }])),
          gradingMode,
          nativeLanguage
            })
      });
      clearInterval(phaseInterval);
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Conserver les informations de l'étudiant + status 'success' pour rester visible dans la liste
      setPendingReviews(prev => {
        const nr = [...prev];
        const currentItem = nr[batchCorrectionIndex];
        if (!currentItem) return prev;
        nr[batchCorrectionIndex] = {
          ...data,
          status: 'success',
          file: currentItem.file,
          classId: currentItem.classId,
          className: currentItem.className,
          studentId: currentItem.studentId,
          studentName: currentItem.studentName,
          studentEmail: currentItem.studentEmail,
          ocrAlerts: [], // cleared as the user corrected it manually
          emailSent: false
        };
        return nr;
      });
      setBatchCorrectionIndex(null);
    } catch (err: any) {
      alert("Erreur: " + err.message);
    } finally {
      setIsBatchCorrectingEval(false);
    }
  };

  const superviseControlRef = useRef<string>('stopped');
  const [superviseUiState, setSuperviseUiState] = useState<'idle' | 'running' | 'paused'>('idle');
  const [activeSuperviseFile, setActiveSuperviseFile] = useState<string | null>(null);
  const isSupervisingAll = superviseUiState !== 'idle';

  const handleSuperviseBatch = async () => {
    const successItems = pendingReviews.filter(r => r.status === 'success');
    if (successItems.length === 0) {
      alert("Aucune copie éligible à la supervision. Les copies en erreur sont ignorées.");
      return;
    }
    
    superviseControlRef.current = 'running';
    setSuperviseUiState('running');
    let count = 0;
    
    try {
      for (const item of successItems) {
        if (superviseControlRef.current === 'stopped') break;
        
        while (superviseControlRef.current === 'paused') {
          await new Promise(r => setTimeout(r, 500));
        }

        if (superviseControlRef.current === 'stopped') break;

        setActiveSuperviseFile(item.file);

        // Find index to update UI dynamically
        const index = pendingReviews.findIndex(r => r.file === item.file);
        if (index === -1) continue;

        try {
          const res = await fetch("/api/evaluate/supervise", {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify({
               result: item,
               text: item.transcription,
               subject: batchSubject || "Sujet Lot",
               language,
               level,
               evalModel,
               supervisionProvider,
               supervisionModel,
               apiKeys: Object.fromEntries(Object.entries(apiKeys).map(([k, v]) => [k, { ...v, keyMode }]))
            })
          });

          if (!res.ok) {
             const data = await res.json();
             throw new Error(data.error);
          }

          const supervisedResult = await res.json();

          setPendingReviews(prev => {
            const next = [...prev];
            const i = next.findIndex(r => r.file === item.file);
            if (i !== -1) {
              const currentItem = next[i];
              next[i] = {
                ...supervisedResult,
                status: 'success',
                file: currentItem.file,
                classId: currentItem.classId,
                className: currentItem.className,
                studentId: currentItem.studentId,
                studentName: currentItem.studentName,
                studentEmail: currentItem.studentEmail,
                emailSent: currentItem.emailSent
              };
            }
            return next;
          });
          count++;
        } catch (err: any) {
          console.error(`Erreur supervision ${item.file}:`, err);
        }
      }
      if (superviseControlRef.current !== 'stopped') {
        alert(`${count} copie(s) ont été double-évaluées avec succès !`);
      }
    } finally {
      superviseControlRef.current = 'stopped';
      setSuperviseUiState('idle');
      setActiveSuperviseFile(null);
    }
  };

  const handleSuperviseSingle = async (idx: number) => {
    const item = pendingReviews[idx];
    if (!item || item.status !== 'success') return;

    setPendingReviews(prev => {
      const nr = [...prev];
      nr[idx] = { ...nr[idx], isSupervising: true };
      return nr;
    });
    try {
      const res = await fetch("/api/evaluate/supervise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          result: item,
          text: item.transcription,
          subject: batchSubject || "Sujet Lot",
          language,
          level,
          evalModel,
          supervisionProvider,
          supervisionModel,
          apiKeys: Object.fromEntries(Object.entries(apiKeys).map(([k, v]) => [k, { ...v, keyMode }]))
            })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erreur lors de la double évaluation");
      }

      const supervisedResult = await res.json();

      setPendingReviews(prev => {
        const next = [...prev];
        const currentItem = next[idx];
        if (!currentItem) return prev;
        next[idx] = {
          ...supervisedResult,
          status: 'success',
          file: currentItem.file,
          classId: currentItem.classId,
          className: currentItem.className,
          studentId: currentItem.studentId,
          studentName: currentItem.studentName,
          studentEmail: currentItem.studentEmail,
          emailSent: currentItem.emailSent,
          isSupervising: false
        };
        return next;
      });
      
    } catch (err: any) {
      setPendingReviews(prev => {
        const next = [...prev];
        if (next[idx]) next[idx] = { ...next[idx], isSupervising: false };
        return next;
      });
      alert(`Erreur lors de la double évaluation de ${item.file}: ${err.message}`);
    } finally {
    }
  };

  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const handleGenerateAllPdfs = async () => {
    if (pendingReviews.length === 0) return;
    setIsGeneratingAll(true);
    let count = 0;
    try {
      for (const item of pendingReviews) {
        if (item.status !== 'success') continue;
        await fetch("/api/pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ result: item, level, outputFolder })
        });
        count++;
      }
      alert(`${count} PDF(s) générés dans le dossier de sortie.`);
    } catch (e) {
      alert("Erreur lors de la génération groupée.");
    } finally {
      setIsGeneratingAll(false);
    }
  };

  const handleExportExcel = () => {
    if (pendingReviews.length === 0) {
      alert("Aucune évaluation à exporter.");
      return;
    }

    const successReviews = pendingReviews.filter(r => r.status === 'success');
    if (successReviews.length === 0) {
      alert("Aucune évaluation réussie à exporter.");
      return;
    }

    // Trouver toutes les classes représentées par les évaluations réussies
    const classIdsInBatch = Array.from(new Set(successReviews.map(r => r.classId).filter(Boolean)));
    
    // Créer un nouveau classeur Excel
    const wb = XLSX.utils.book_new();
    let sheetAdded = false;

    // Traiter les classes représentées
    const relevantClasses = classes.filter(c => classIdsInBatch.includes(c.id));
    
    for (const cls of relevantClasses) {
      const sheetData = [];
      // En-têtes de colonnes
      sheetData.push(["Nom complet", "Note finale", "Nom du fichier"]);
      
      // Lister tous les étudiants de la classe dans l'ordre de l'application
      for (const student of cls.students) {
        // Trouver une évaluation de cet étudiant (par son ID ou à défaut par son nom)
        const evalItem = successReviews.find(r => 
          r.studentId === student.id || 
          (r.classId === cls.id && r.studentName && r.studentName.toLowerCase().trim() === student.name.toLowerCase().trim())
        );
        
        const score = evalItem && evalItem.globalScore !== undefined ? evalItem.globalScore : "";
        const file = evalItem ? evalItem.file : "";
        
        sheetData.push([student.name, score, file]);
      }
      
      // Créer la feuille
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      
      // Définir la largeur des colonnes
      const maxNameLen = Math.max(...cls.students.map((s: any) => s.name.length), 12);
      ws["!cols"] = [
        { wch: maxNameLen + 3 }, // Nom complet
        { wch: 15 },             // Note finale
        { wch: 30 }              // Nom du fichier
      ];

      // Sanitizer le nom de la feuille (limite 31 car., pas de caractères spéciaux)
      const sheetName = cls.name.replace(/[\\/?*\[\]]/g, "_").substring(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      sheetAdded = true;
    }

    // Gérer les évaluations "sans classe" (orphelines)
    const unmatchedReviews = successReviews.filter(r => !r.classId || !classes.some(c => c.id === r.classId));
    if (unmatchedReviews.length > 0) {
      const sheetData = [];
      sheetData.push(["Nom complet", "Note finale", "Nom du fichier"]);
      
      for (const item of unmatchedReviews) {
        sheetData.push([item.studentName || "Inconnu", item.globalScore !== undefined ? item.globalScore : "", item.file]);
      }
      
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      
      const maxNameLen = Math.max(...unmatchedReviews.map((r: any) => (r.studentName || "").length), 12);
      ws["!cols"] = [
        { wch: maxNameLen + 3 },
        { wch: 15 },
        { wch: 30 }
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Sans classe");
      sheetAdded = true;
    }

    if (!sheetAdded) {
      alert("Aucune donnée de classe correspondante à exporter.");
      return;
    }

    // Écrire le fichier Excel et déclencher le téléchargement
    XLSX.writeFile(wb, `resultats_evaluation_delf_${level.toLowerCase()}.xlsx`);
  };

  const handleRetryAllFailed = async () => {
    const failedItems = pendingReviews.filter(r => r.status === 'error');
    if (failedItems.length === 0) return;
    
    // Traitement séquentiel, mode silencieux pour ne pas bloquer avec des alertes
    const errors: string[] = [];
    for (const item of failedItems) {
      const errMsg = await handleRetryFile(item, true);
      if (errMsg) errors.push(`${item.file}: ${errMsg}`);
    }
    
    // Résumé des erreurs à la fin, une seule fois
    if (errors.length > 0) {
      alert(`${errors.length} évaluation(s) ont encore échoué :\n\n${errors.join('\n')}`);
    }
  };

  const [addBatchStatus, setAddBatchStatus] = useState<string>("");

  const handleAddToBatch = async (files: File[]) => {
    if (!files || files.length === 0) return;
    
    // Sort by lastModified (oldest first)
    files.sort((a, b) => a.lastModified - b.lastModified);
    
    setIsAddingToBatch(true);
    let addedCount = 0;
    let errorCount = 0;
    
    for (let fi = 0; fi < files.length; fi++) {
      const file = files[fi];
      const fileName = file.name;
      setAddBatchStatus(`📄 Traitement de "${fileName}" (${fi + 1}/${files.length})...`);
      console.log(`[AddToBatch] Processing file ${fi + 1}/${files.length}: ${fileName}, type: ${file.type}, size: ${file.size}`);
      
      // Vérifier si le fichier n'est pas déjà dans la liste
      if (pendingReviews.some(r => r.file === fileName)) {
        console.log(`[AddToBatch] Skipping duplicate: ${fileName}`);
        alert(`Le fichier "${fileName}" est déjà présent dans ce lot. Il ne sera pas ré-ajouté.`);
        continue;
      }
      
      try {
        // Step 1: Lire le fichier en base64
        setAddBatchStatus(`📄 Lecture de "${fileName}"...`);
        const reader = new FileReader();
        const base64Data: string = await new Promise((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.split(',')[1];
            console.log(`[AddToBatch] File read OK: ${fileName}, base64 length: ${base64?.length}`);
            resolve(base64);
          };
          reader.onerror = () => reject(new Error("Erreur de lecture du fichier"));
          reader.readAsDataURL(file);
        });
        
        // Step 2: Évaluation IA (OCR + Analyse)
        setAddBatchStatus(`🧠 Évaluation IA de "${fileName}"...`);
        const mimeType = file.type || 'application/pdf';
        console.log(`[AddToBatch] Sending to /api/evaluate: subject="${(batchSubject || 'auto').substring(0, 30)}", mimeType=${mimeType}`);
        
        const res = await fetch("/api/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: batchSubject || `Sujet standard ${level} ou détecter depuis la copie`,
            fileUri: base64Data,
            mimeType,
            evalModel,
            language,
            level,
            apiKeys: Object.fromEntries(Object.entries(apiKeys).map(([k, v]) => [k, { ...v, keyMode }])),
            ocrKeyMode,
            gradingMode
            })
        });
        
        console.log(`[AddToBatch] Response status: ${res.status}`);
        const data = await res.json();
        if (!res.ok) {
          console.error(`[AddToBatch] API error:`, data);
          throw new Error(data.error || `Erreur serveur (${res.status})`);
        }
        
        console.log(`[AddToBatch] Evaluation OK for ${fileName}, score: ${data.globalScore}`);
        
        let result: any = {
          ...data,
          file: fileName,
          status: 'success',
          emailSent: false
        };
        
        // Auto-matching logic using robust helper
        const match = findMatchingStudent(result.studentName, result.studentEmail, classes);
        if (match) {
          result = {
            ...result,
            classId: match.classId,
            className: match.className,
            studentId: match.studentId,
            studentName: match.studentName,
            studentEmail: match.studentEmail
          };
        }
        
        // Insérer en maintenant l'ordre alphabétique par nom de fichier
        setPendingReviews(prev => {
          const newList = [...prev, result];
          newList.sort((a, b) => a.file.localeCompare(b.file));
          return newList;
        });
        setBatchResults((prev: any) => prev ? { ...prev, processed: (prev.processed || 0) + 1 } : prev);
        addedCount++;
        
      } catch (err: any) {
        console.error(`[AddToBatch] Error for ${fileName}:`, err);
        errorCount++;
        // Ajouter comme erreur dans la liste
        const errResult = { file: fileName, status: 'error', reason: err.message };
        setPendingReviews(prev => {
          const newList = [...prev, errResult];
          newList.sort((a: any, b: any) => a.file.localeCompare(b.file));
          return newList;
        });
      }
    }
    
    setIsAddingToBatch(false);
    setAddBatchStatus("");
    
    // Feedback final
    if (errorCount > 0) {
      alert(`${addedCount} copie(s) ajoutée(s), ${errorCount} erreur(s).`);
    } else if (addedCount > 0) {
      // Pas d'alerte bloquante pour les succès
    }
  };

  const handleSendIndividualEmail = async (idx: number) => {
    const item = pendingReviews[idx];
    if (!item.studentEmail || item.status !== 'success') return;

    try {
      setPendingReviews(prev => {
        const nr = [...prev];
        nr[idx] = { ...nr[idx], isSendingEmail: true };
        return nr;
      });
      const regRes = await fetch("/api/pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ result: item, level, outputFolder })
      });
      if (!regRes.ok) throw new Error("Échec de génération PDF");
      const cd = regRes.headers.get('Content-Disposition');
      let currentPdfFileName = 'bilan.pdf';
      if (cd && cd.includes('filename="')) {
          const encoded = cd.split('filename="')[1].split('"')[0];
          currentPdfFileName = decodeURIComponent(encoded);
      }
      const currentPdfPath = `${outputFolder}/${currentPdfFileName}`;

      const emailRes = await fetch("/api/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            to: item.studentEmail, 
            subject: emailSubject,
            body: emailBody,
            attachmentName: currentPdfFileName, 
            attachmentPath: currentPdfPath, 
            level,
            emailConfig
          })
      });
      if (!emailRes.ok) {
          const errData = await emailRes.json().catch(() => ({ error: 'Erreur inconnue' }));
          throw new Error("L'envoi de l'e-mail a échoué : " + errData.error);
      }
      
      await fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            ...item, 
            subject: item.subject || batchSubject || subject || (item as any)._comparison?.firstEval?.subject || (item as any)._comparison?.secondEval?.subject || '',
            level 
          })
      });

      setPendingReviews(current => {
        const nr = [...current];
        nr[idx] = { ...nr[idx], emailSent: true, isSendingEmail: false };
        return nr;
      });
      alert(`E-mail envoyé avec succès à ${item.studentEmail}`);
    } catch (e: any) {
      setPendingReviews(current => {
        const nr = [...current];
        if (nr[idx]) nr[idx] = { ...nr[idx], isSendingEmail: false };
        return nr;
      });
      alert(`Erreur: ${e.message}`);
    } finally {
    }
  };

  const renderOcrBadge = (info: { model: string; fallbackNotice?: string } | null) => {
    if (!info || !info.model) return null;
    const friendlyName = getFriendlyModelName(info.model);
    const isFallback = Boolean(info.fallbackNotice);

    if (isFallback) {
      return (
        <span
          title={info.fallbackNotice || `Repli automatique vers ${friendlyName}`}
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-900 border border-amber-200/90 shadow-xs cursor-help transition-all animate-fadeIn select-none"
        >
          <Zap className="w-3 h-3 text-amber-600 fill-amber-500 flex-shrink-0" />
          <span>{friendlyName}</span>
          <span className="text-[9px] font-black uppercase tracking-wider bg-amber-200/80 text-amber-950 px-1 py-0.2 rounded">Repli</span>
        </span>
      );
    }

    return (
      <span
        title={`Extraction OCR réalisée avec succès par ${friendlyName}`}
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/70 shadow-xs cursor-default transition-all animate-fadeIn select-none"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
        <span>📷</span>
        <span>{friendlyName}</span>
      </span>
    );
  };

  if (isShutdown) {
    return (
      <div className="fixed inset-0 bg-slate-900 text-white flex flex-col items-center justify-center p-6 z-50">
        <div className="bg-slate-800/80 backdrop-blur-xl border border-slate-700/50 p-8 rounded-3xl max-w-md w-full text-center space-y-6 shadow-2xl">
          <div className="bg-rose-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-rose-500">
            <Power className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold">Serveur arrêté</h1>
            <p className="text-sm text-slate-400">Le serveur local a été éteint avec succès et le port a été libéré.</p>
          </div>
          <div className="bg-slate-900/50 border border-slate-700/50 p-4 rounded-2xl text-xs text-slate-400">
            Vous pouvez maintenant fermer cet onglet en toute sécurité.
          </div>
          <button onClick={() => window.close()} className="w-full py-3 bg-slate-700 hover:bg-slate-600 transition-colors font-semibold rounded-2xl text-sm cursor-pointer">
            Fermer l'onglet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden text-slate-900 print:bg-white print:h-auto print:overflow-visible">
      <HeaderNav
        currentSection="pe"
        onOpenClasses={() => setMainView("CLASSES")}
        onOpenHistory={() => setMainView("HISTORY")}
        onOpenMaintenance={() => setMainView("MAINTENANCE")}
      />
      <div className="flex flex-1 p-6 gap-6 overflow-hidden print:p-0">
        <motion.aside initial={{ x: -50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="print:hidden w-80 flex-shrink-0 glass-card flex flex-col p-6 overflow-hidden">
        <div className="flex items-center gap-3 mb-8 px-2">
          <div className="bg-blue-600 p-2.5 rounded-2xl"><CheckCircle className="w-6 h-6 text-white" /></div>
          <div><h1 className="font-bold text-lg leading-tight">Correcteur de PE</h1><p className="text-xs text-slate-500 font-medium">Assistant AI Officiel</p></div>
        </div>

        <div className="flex flex-col gap-1 mb-8">
           <button onClick={() => setMainView("CORRECTION")} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${mainView === "CORRECTION" ? "bg-blue-50 text-blue-700 shadow-sm border border-blue-100" : "text-slate-500 hover:bg-slate-100"}`}><LayoutDashboard className="w-4 h-4"/> Correction</button>
           <button onClick={() => setMainView("GENERATOR")} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${mainView === "GENERATOR" ? "bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100" : "text-slate-500 hover:bg-slate-100"}`}><Sparkles className="w-4 h-4 text-indigo-600"/> Générateur CE/PE</button>
           <button onClick={() => setMainView("CLASSES")} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${mainView === "CLASSES" ? "bg-blue-50 text-blue-700 shadow-sm border border-blue-100" : "text-slate-500 hover:bg-slate-100"}`}><Users className="w-4 h-4"/> Classes</button>
           <button onClick={() => setMainView("HISTORY")} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${mainView === "HISTORY" ? "bg-blue-50 text-blue-700 shadow-sm border border-blue-100" : "text-slate-500 hover:bg-slate-100"}`}><Clock className="w-4 h-4"/> Historique</button>
           <button onClick={() => setMainView("MAINTENANCE")} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${mainView === "MAINTENANCE" ? "bg-rose-50 text-rose-700 shadow-sm border border-rose-100" : "text-slate-500 hover:bg-slate-100"}`}><Database className="w-4 h-4"/> Maintenance</button>
        </div>

        {mainView === "CORRECTION" && (
            <>
                <div className="flex p-1 bg-slate-100/80 rounded-2xl mb-6">
                  <button onClick={() => { setMode("SINGLE"); setEvaluationResult(null); setSingleOcrAlerts([]); }} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${mode === "SINGLE" ? "bg-white shadow-sm text-blue-700" : "text-slate-600 hover:text-slate-900"}`}>Unique</button>
                  <button onClick={() => { setMode("BATCH"); setEvaluationResult(null); setSingleOcrAlerts([]); }} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${mode === "BATCH" ? "bg-white shadow-sm text-blue-700" : "text-slate-600 hover:text-slate-900"}`}>Lot</button>
                </div>

                <div className="flex-1 overflow-y-auto pr-2">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 shadow-inner space-y-4 mb-4">
                    {/* OCR selector */}
                    <div>
                      <div className="flex items-center justify-between px-1 mb-2 gap-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase block">📷 OCR (Lecture)</label>
                        <select 
                          value={ocrKeyMode}
                          onChange={e => setOcrKeyMode(e.target.value as 'free_only' | 'paid_only' | 'both')}
                          className="bg-white border border-slate-200 rounded-xl px-1.5 py-0.5 text-[10px] font-bold text-slate-600 focus:ring-1 focus:ring-blue-500/20 outline-none cursor-pointer"
                        >
                          <option value="both">Gratuit + Payant</option>
                          <option value="free_only">Gratuit uniquement</option>
                          <option value="paid_only">Payant uniquement</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-1 bg-white p-1 rounded-xl border border-slate-200">
                        <button onClick={() => setOcrModel('gemini-3.8-flash')} className={`py-1.5 rounded-lg text-[10px] font-bold transition-all ${ocrModel === 'gemini-3.8-flash' || ocrModel === 'gemini-flash' || ocrModel === 'gemini-3.7-flash' || ocrModel === 'gemini-3.5-flash' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-blue-600'}`}>3.8 Flash</button>
                        <button onClick={() => setOcrModel('gemini-3.6-flash')} className={`py-1.5 rounded-lg text-[10px] font-bold transition-all ${ocrModel === 'gemini-3.6-flash' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-blue-600'}`}>3.6 Flash</button>
                      </div>
                    </div>

                    {/* Model Selection Grid */}
                    <div className="pt-3 border-t border-slate-200">
                      <div className="flex items-center justify-between px-1 mb-2 gap-2">
                        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2"><Brain className="w-3 h-3"/>Modèle d'évaluation</h2>
                        <select 
                          value={keyMode}
                          onChange={e => setKeyMode(e.target.value as 'free_only' | 'paid_only' | 'both')}
                          className="bg-white border border-slate-200 rounded-xl px-1.5 py-0.5 text-[10px] font-bold text-slate-600 focus:ring-1 focus:ring-blue-500/20 outline-none cursor-pointer"
                        >
                          <option value="both">Gratuit + Payant</option>
                          <option value="free_only">Gratuit uniquement</option>
                          <option value="paid_only">Payant uniquement</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-[auto_1fr_1fr] gap-1 items-center text-[10px]">
                        <div className="px-2 py-1"></div>
                        <div className="text-center font-bold text-slate-400 uppercase tracking-wider py-1">Léger</div>
                        <div className="text-center font-bold text-slate-400 uppercase tracking-wider py-1">Lourd</div>
                        {/* Gemini */}
                        <div className="px-2 py-1 font-bold text-blue-600">Gemini</div>
                        <button onClick={() => setEvalModel('flash')} className={`py-1.5 rounded-lg font-bold transition-all ${evalModel === 'flash' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-500 hover:text-blue-600 border border-slate-200'}`}>3.8 Flash</button>
                        <button onClick={() => setEvalModel('pro')} className={`py-1.5 rounded-lg font-bold transition-all ${evalModel === 'pro' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-500 hover:text-blue-600 border border-slate-200'}`}>4 Argon</button>
                      </div>
                    </div>

                    {/* Double évaluation */}
                    <div className="pt-3 border-t border-slate-200 flex flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <input type="checkbox" id="useDoubleEval" checked={useDoubleEval} onChange={e => setUseDoubleEval(e.target.checked)} className="w-5 h-5 rounded cursor-pointer accent-blue-600" />
                        <label htmlFor="useDoubleEval" className="text-sm font-bold text-slate-600 cursor-pointer flex flex-col">
                          <span className="flex items-center gap-2"><Brain className="w-4 h-4 text-purple-600" /> Double évaluation {useDoubleEval && <span className="bg-purple-100 text-purple-700 text-[10px] px-2 py-0.5 rounded-full">Actif</span>}</span>
                          <span className="text-[10px] text-slate-400 font-normal">Supervision double évaluation (temps x2)</span>
                        </label>
                      </div>
                      {(useDoubleEval || (evaluationResult && !evaluationResult._comparison)) && (
                        <div className="space-y-3 pt-2 border-t border-slate-200">
                          <div className="grid grid-cols-2 gap-1 bg-white p-1 rounded-xl border border-slate-200">
                            <button type="button" onClick={() => setSupervisionMode('internal')} className={`py-1.5 rounded-lg text-[10px] font-bold transition-all ${supervisionMode === 'internal' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500 hover:text-purple-600'}`}>Dans l'appli</button>
                            <button type="button" onClick={() => setSupervisionMode('external')} className={`py-1.5 rounded-lg text-[10px] font-bold transition-all ${supervisionMode === 'external' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-500 hover:text-violet-600'}`}>IA externe (sans clé)</button>
                          </div>
                          {supervisionMode === 'external' && (
                            <p className="text-[10px] text-slate-400 leading-snug px-1">La 1re évaluation est produite normalement, puis exportée pour une IA externe (sans clé API) et réimportée. La note du second évaluateur fait autorité. {mode === 'BATCH' ? "Le bouton « Double éval externe » apparaîtra sur l'écran de résultats du lot." : "La fenêtre d'échange s'ouvrira après la 1re évaluation."}</p>
                          )}
                          {supervisionMode === 'internal' && (
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase px-1 mb-1 block">Modèle de double évaluation</label>
                            <div className="grid grid-cols-[auto_1fr_1fr] gap-1 items-center text-[10px]">
                              <div className="px-1 py-1"></div>
                              <div className="text-center font-bold text-slate-400 uppercase py-0.5">Léger</div>
                              <div className="text-center font-bold text-slate-400 uppercase py-0.5">Lourd</div>
                              <div className="px-1 font-bold text-blue-600 text-[9px]">Gemini</div>
                              <button onClick={() => { setSupervisionProvider('gemini'); setSupervisionModel('flash'); }} className={`py-1 rounded-lg font-bold transition-all ${supervisionProvider === 'gemini' && supervisionModel === 'flash' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200 hover:text-blue-600'}`}>3.8 Flash</button>
                              <button onClick={() => { setSupervisionProvider('gemini'); setSupervisionModel('pro'); }} className={`py-1 rounded-lg font-bold transition-all ${supervisionProvider === 'gemini' && supervisionModel === 'pro' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200 hover:text-blue-600'}`}>4 Argon</button>
                            </div>
                          </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Modèle d'E-mail */}
                    <div className="pt-3 border-t border-slate-200">
                      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-1 flex items-center gap-2"><Mail className="w-3.5 h-3.5"/> Modèle d'E-mail</h2>
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase px-1">Objet</label>
                          <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs focus:ring-2 focus:ring-blue-500/20 outline-none" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase px-1">Corps du message</label>
                          <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs h-32 focus:ring-2 focus:ring-blue-500/20 outline-none resize-none" />
                        </div>
                        <button onClick={() => {
                          setEmailSubject(`Votre bilan de production écrite DELF ${level}`);
                          setEmailBody(`Bonjour,\n\nVoici la correction de votre production écrite.\n\nBien cordialement,\n\n${signature || "L'équipe pédagogique"}`);
                        }} className="w-full py-2 text-[10px] font-bold text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-widest flex items-center justify-center gap-1"><RotateCcw className="w-3 h-3"/> Réinitialiser</button>
                      </div>
                    </div>
                  </div>
                </div>
            </>
        )}
        <div className="pt-4 border-t border-slate-200 mt-auto flex-shrink-0">
          <button 
            onClick={handleShutdown} 
            className="w-full py-3 px-4 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 border border-slate-200 hover:border-rose-100 rounded-2xl flex items-center justify-center gap-2 font-bold text-slate-600 transition-all cursor-pointer"
          >
            <Power className="w-4 h-4" />
            Quitter l'application
          </button>
        </div>
      </motion.aside>

      <main className="flex-1 glass-card print:rounded-none shadow-2xl print:shadow-none flex flex-col overflow-hidden print:overflow-visible relative">
        {mainView === "CORRECTION" ? (
          <>
            <header className="print:hidden flex justify-between items-center p-8 pb-4 border-b border-slate-50">
              <h2 className="text-2xl font-bold flex items-center gap-3"><LayoutDashboard className="w-6 h-6 text-blue-500" /> {mode === "SINGLE" ? (evaluationResult ? `Correction ${examType === 'dictee' ? 'Dictée' : examType === 'traduction' ? 'Traduction' : examType === 'grammaire' ? 'Grammaire' : examType === 'composition' ? 'Composition' : level} Terminée` : "Nouvelle évaluation") : "Traitement par Lot"}</h2>
              <div className="flex flex-col items-end gap-2.5 bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold">
                {/* Première ligne : Type d'épreuve et Notation */}
                <div className="flex items-center gap-6 w-full justify-start">
                  {/* Type d'épreuve */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-900 font-bold">Épreuve :</span>
                    <div className="flex p-0.5 bg-white rounded-lg border border-slate-200">
                      <button 
                        onClick={() => handleExamTypeChange("delf_b1")} 
                        className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${examType === 'delf_b1' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-blue-600'}`}
                      >
                        DELF B1
                      </button>
                      <button 
                        onClick={() => handleExamTypeChange("delf_b2")} 
                        className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${examType === 'delf_b2' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-blue-600'}`}
                      >
                        DELF B2
                      </button>
                      <button 
                        onClick={() => handleExamTypeChange("traduction")} 
                        className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${examType === 'traduction' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-indigo-600'}`}
                      >
                        Traduction
                      </button>
                      <button 
                        onClick={() => handleExamTypeChange("dictee")} 
                        className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${examType === 'dictee' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-indigo-600'}`}
                      >
                        Dictée
                      </button>
                      <button 
                        onClick={() => handleExamTypeChange("grammaire")} 
                        className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${examType === 'grammaire' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-indigo-600'}`}
                      >
                        Grammaire
                      </button>
                      <button 
                        onClick={() => handleExamTypeChange("composition")} 
                        className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${examType === 'composition' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-indigo-600'}`}
                      >
                        Composition
                      </button>
                    </div>
                  </div>

                  {/* Type de notation */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-900 font-bold">Barème :</span>
                    {(examType === 'delf_b1' || examType === 'delf_b2') ? (
                      <div className="flex p-0.5 bg-white rounded-lg border border-slate-200">
                        <button 
                          onClick={() => setGradingMode('delf')} 
                          className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${gradingMode === 'delf' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-blue-600'}`}
                        >
                          DELF (0, 1, 3, 5)
                        </button>
                        <button 
                          onClick={() => setGradingMode('detailed')} 
                          className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${gradingMode === 'detailed' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-blue-600'}`}
                        >
                          Détaillée (0.5)
                        </button>
                      </div>
                    ) : (
                      <span className="px-2.5 py-1 bg-white border border-indigo-200 text-indigo-700 rounded-lg text-[10px] font-bold shadow-xs">
                        Note sur {customMaxScore} pts
                      </span>
                    )}
                  </div>
                </div>

                {/* Deuxième ligne : Autres options sans abréviations */}
                <div className="flex items-center gap-4 text-xs pt-2 border-t border-slate-200/60 w-full justify-start">
                  <span>Langue du feedback :</span>
                  <select value={language} onChange={e => setLanguage(e.target.value as "FR"|"VN"|"CZ"|"TW"|"EN")} className="bg-transparent font-bold text-blue-600 outline-none cursor-pointer">
                    <option value="VN">VN</option>
                    <option value="FR">FR</option>
                    <option value="CZ">CZ</option>
                    <option value="TW">TW</option>
                    <option value="EN">EN</option>
                  </select>
                  <span className="ml-2">Langue maternelle :</span>
                  <select value={nativeLanguageSelect} onChange={e => setNativeLanguageSelect(e.target.value)} className="bg-transparent font-bold text-blue-600 outline-none cursor-pointer">
                    <option value="Aucune">Non spécifiée</option>
                    <option value="vietnamien">Vietnamien</option>
                    <option value="tchèque">Tchèque</option>
                    <option value="anglais">Anglais</option>
                    <option value="chinois">Chinois</option>
                  </select>
                  <label className="ml-2 flex items-center gap-1.5 cursor-pointer select-none text-slate-500">
                    <input type="checkbox" checked={plusEnglish} onChange={e => setPlusEnglish(e.target.checked)} className="rounded text-blue-600 border-slate-300 focus:ring-blue-500/20" />
                    <span>+ anglais</span>
                  </label>
                  <button onClick={() => { setEvaluationResult(null); setBatchResults(null); setSingleOcrAlerts([]); setOcrModelInfo(null); }} className="ml-4 p-2 text-slate-400 hover:text-blue-600 cursor-pointer"><RefreshCcw className="w-4 h-4"/></button>
                </div>
              </div>
            </header>

        <div className="flex-1 overflow-y-auto p-8 print:p-0 relative">
          <AnimatePresence mode="wait">
            {mode === "SINGLE" && !evaluationResult && !isLoading && (
              <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-6 h-full p-4">
                {/* Configuration spécifique pour les épreuves personnalisées */}
                {examType !== 'delf_b1' && examType !== 'delf_b2' && (
                  <CustomExamConfigPanel
                    examType={examType}
                    maxScore={customMaxScore}
                    onMaxScoreChange={setCustomMaxScore}
                    referenceText={dictationReferenceText}
                    onReferenceTextChange={setDictationReferenceText}
                    dictationPenalties={dictationPenalties}
                    onDictationPenaltiesChange={setDictationPenalties}
                    sourceText={translationSourceText}
                    onSourceTextChange={setTranslationSourceText}
                    modelTranslation={translationModel}
                    onModelTranslationChange={setTranslationModel}
                    sourceLang={translationSourceLang}
                    onSourceLangChange={setTranslationSourceLang}
                    targetLang={translationTargetLang}
                    onTargetLangChange={setTranslationTargetLang}
                    exerciseSubject={grammarExerciseSubject}
                    onExerciseSubjectChange={setGrammarExerciseSubject}
                    answerKey={grammarAnswerKey}
                    onAnswerKeyChange={setGrammarAnswerKey}
                    compositionType={compositionType}
                    onCompositionTypeChange={setCompositionType}
                    compositionLanguage={compositionLanguage}
                    onCompositionLanguageChange={setCompositionLanguage}
                    corpusText={compositionCorpus}
                    onCorpusTextChange={setCompositionCorpus}
                    compositionSubject={compositionSubject}
                    onCompositionSubjectChange={setCompositionSubject}
                    disableStandardGrid={compositionDisableGrid}
                    onDisableStandardGridChange={setCompositionDisableGrid}
                    customInstructions={customInstructions}
                    onCustomInstructionsChange={setCustomInstructions}
                  />
                )}

                {/* Sujet DELF pour B1/B2 */}
                {(examType === 'delf_b1' || examType === 'delf_b2') && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center bg-slate-100/50 p-2 rounded-xl"><label className="text-sm font-bold text-slate-700 ml-2">Sujet de l'épreuve DELF {level}</label><button onClick={() => setSubject("")} className="text-[10px] text-slate-400 hover:text-red-500 font-bold uppercase tracking-widest flex items-center gap-1 mr-2"><RotateCcw className="w-3 h-3"/> Reset</button></div>
                    <textarea value={subject} onChange={e => setSubject(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm h-24 focus:ring-2 focus:ring-blue-500/20 outline-none resize-none" placeholder="Décrivez le sujet de production écrite..."/>
                  </div>
                )}

                <div className="space-y-2 flex-1 flex flex-col">
                  <div className="flex justify-between items-center bg-slate-100/50 p-2 rounded-xl">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-bold text-slate-700 ml-2">
                        {examType === 'dictee' ? "Copie de l'élève (Dictée rédigée)" :
                         examType === 'traduction' ? "Traduction de l'élève" :
                         examType === 'grammaire' ? "Réponses de l'élève aux exercices" :
                         examType === 'composition' ? "Copie rédigée de l'élève (Composition)" :
                         "Copie Étudiante"}
                      </label>
                      {text && renderOcrBadge(ocrModelInfo)}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const promptText = examType === 'dictee' ? getDictationOcrPrompt() : getOcrPrompt(level, nativeLanguage);
                          navigator.clipboard.writeText(promptText);
                          alert("Prompt OCR copié dans le presse-papier ! Vous pouvez coller ce prompt avec vos photos ou PDF de copies sur gemini.google.com");
                        }}
                        className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                        title="Copier le prompt de filtrage et d'extraction OCR"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Copier prompt OCR {examType === 'dictee' ? '(Dictée)' : ''}</span>
                      </button>
                      <label className="cursor-pointer px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700">📂 Importer OCR API<input type="file" className="hidden" onChange={handleFileUpload} multiple/></label>
                      <button onClick={() => { setText(""); setOcrModelInfo(null); }} className="text-[10px] text-slate-400 hover:text-red-500 font-bold uppercase tracking-widest flex items-center gap-1"><RotateCcw className="w-3 h-3"/> Reset</button>
                    </div>
                  </div>
                  <textarea rows={20} value={text} onChange={e => { setText(e.target.value); if (!e.target.value) setOcrModelInfo(null); }} className="flex-1 min-h-[450px] bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none resize-y" placeholder="Texte de la copie..."/>
                  {singleOcrAlerts.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col gap-2 shadow-sm mt-2"
                    >
                      <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
                        <Info className="w-5 h-5 text-amber-600" />
                        <span>Attention : Doutes de lecture OCR détectés par l'IA</span>
                      </div>
                      <ul className="list-disc pl-5 text-xs text-amber-700 space-y-1">
                        {singleOcrAlerts.map((alert, idx) => (
                          <li key={idx}>{alert}</li>
                        ))}
                      </ul>
                      <p className="text-[10px] text-amber-600 italic">Veuillez vérifier et corriger ces passages dans la copie avant de lancer l'évaluation.</p>
                    </motion.div>
                  )}
                </div>
                <div className="flex justify-end items-center gap-4">
                  <label className="cursor-pointer px-6 py-4 bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50 rounded-2xl font-bold flex items-center gap-2 shadow-sm transition-all">
                    <Database className="w-4 h-4 text-blue-600" /> Charger un Bilan (.json, .md)
                    <input
                      type="file"
                      accept=".json,.md,.txt"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        let errSupervision = "";
                        let errJson = "";
                        let errMd = "";
                        try {
                          const content = await file.text();
                          let parsedList: any[] = [];

                          // 1. Essayer d'abord le parser Markdown si le fichier est un .md ou contient des sections markdown
                          try {
                            const mdList = parseMultiplePEMarkdowns(content);
                            if (mdList && mdList.length > 0) {
                              parsedList = mdList;
                            }
                          } catch (err: any) {
                            errMd = err.message || String(err);
                          }

                          // 2. Essayer comme un import de supervision externe ou arbitrage
                          if (parsedList.length === 0) {
                            try {
                              const supList = parseExternalSupervisionResults(content);
                              if (supList && supList.length > 0) {
                                parsedList = supList.map(item => {
                                  const ev = item.evaluation || item;
                                  if (item.comparisonNotes) {
                                    ev._arbiterNotes = item.comparisonNotes;
                                  }
                                  return ev;
                                });
                              }
                            } catch (err: any) {
                              errSupervision = err.message || String(err);
                            }
                          }
                          
                          // 3. Essayer comme un JSON standard direct
                          if (parsedList.length === 0) {
                            try {
                              const jsonParsed = JSON.parse(escapeControlCharactersInStrings(content));
                              parsedList = Array.isArray(jsonParsed) ? jsonParsed : [jsonParsed];
                            } catch (err: any) {
                              errJson = err.message || String(err);
                            }
                          }

                          // Déballer (unwrap) si l'objet contient { evaluation, comparisonNotes } (ex: arbitrage.json)
                          parsedList = parsedList.map(item => {
                            if (item && typeof item === 'object' && item.evaluation && typeof item.evaluation === 'object') {
                              const compNotes = item.comparisonNotes || item.evaluation._arbiterNotes;
                              const ev = { ...item.evaluation };
                              if (compNotes) ev._arbiterNotes = compNotes;
                              return ev;
                            }
                            return item;
                          });

                          // Extraire le nom de l'élève depuis le nom du fichier si manquant (ex: "Han.json" -> "Han")
                          const baseFileName = file.name.replace(/\.[^/.]+$/, "").replace(/_/g, " ").trim();
                          parsedList = parsedList.map(ev => {
                            if (ev && typeof ev === 'object') {
                              if (!ev.studentName && baseFileName && !/\b(?:arbitrage|bilan|eval|evaluation|result|resultat|devoir)\b/i.test(baseFileName)) {
                                ev.studentName = baseFileName;
                              }
                            }
                            return ev;
                          });

                          // Sanitiser les scores et nettoyer les hallucinations
                          parsedList = parsedList.map(ev => {
                            if (ev && typeof ev === 'object' && (ev.criteriaScores || ev.justifications)) {
                              try {
                                const effectiveLang = ev.language || language;
                                const effectiveGrading = ev.gradingMode || gradingMode;
                                return sanitizeScores(sanitizeHallucinations(ev, effectiveLang), effectiveGrading);
                              } catch (e) {
                                console.warn("[Charger Bilan PE] Erreur sanitization:", e);
                                return ev;
                              }
                            }
                            return ev;
                          });

                          // Filtrer les évaluations valides
                          const validEvaluations = parsedList.filter(item => 
                            item && typeof item === 'object' && (item.criteriaScores || item.justifications || item.globalScore !== undefined)
                          );

                          if (validEvaluations.length > 0) {
                            const first = validEvaluations[0];
                            
                            // Sauvegarder toutes les évaluations dans l'historique
                            const itemsToSave = validEvaluations.map(ev => ({
                              ...ev,
                              subject: ev.subject || subject || 'Sujet',
                              level: ev.level || level || 'B2'
                            }));

                            await fetch("/api/history", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ records: itemsToSave })
                            }).catch(err => console.error("Erreur sauvegarde import:", err));

                            setEvaluationResult(first);
                            if (first.subject) setSubject(first.subject);
                            if (first.transcription) setText(first.transcription);
                            setEvalResultVersion(v => v + 1);

                            if (validEvaluations.length > 1) {
                              alert(`Succès ! ${validEvaluations.length} bilans ont été importés et enregistrés dans l'historique.\nLa première copie (${first.studentName || 'Inconnu'}) est affichée à l'écran.`);
                            } else {
                              alert("Bilan chargé et enregistré dans l'historique avec succès !");
                            }
                          } else {
                            alert(`Format de bilan invalide ou illisible.\n\nDétails des erreurs :\n- Markdown: ${errMd || "Aucune"}\n- IA externe: ${errSupervision || "Aucune"}\n- JSON standard: ${errJson || "Aucune"}`);
                          }
                        } catch (err: any) {
                          alert("Erreur de lecture du fichier : " + err.message);
                        } finally {
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>
                  <button
                    onClick={() => {
                      if (!subject || !text) return alert("Veuillez remplir le sujet et le texte.");
                      openExternalInitial('single', [{
                        fileId: 'single',
                        subject,
                        transcription: text,
                        result1: { transcription: text } as any
                      }]);
                    }}
                    className="flex items-center gap-2 px-6 py-4 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-2xl font-bold transition-all border border-amber-200 shadow-sm hover:shadow active:scale-95"
                    title="Procéder à l'évaluation initiale externe (sans clé API)"
                  >
                    <Brain className="w-5 h-5 text-amber-600" /> Éval. externe
                  </button>
                  <button onClick={handleEvaluate} className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-bold flex items-center gap-2 hover:bg-black">Analyser <Send className="w-4 h-4"/></button>
                </div>
              </motion.div>
            )}

            {isOcrLoading && (
              <motion.div key="ocr-loading" className="absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center p-8 z-50">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                <p className="font-bold text-xl text-slate-700 animate-pulse text-center max-w-2xl leading-relaxed">
                  Extraction de texte (OCR) de la copie en cours...
                </p>
                <button 
                  onClick={handleOcrInterrupt}
                  className="mt-6 px-6 py-2.5 bg-rose-50 text-rose-600 hover:bg-rose-100 font-bold text-sm rounded-xl border border-rose-200 transition-colors shadow-sm cursor-pointer"
                >
                  Interrompre l'extraction
                </button>
              </motion.div>
            )}

            {(isLoading || isSupervisingSingle) && (
              <motion.div key="loading" className="absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center p-8 z-50">
                {isSupervisingSingle ? <Brain className="w-12 h-12 text-purple-600 animate-pulse mb-4" /> : <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />}
                <p className="font-bold text-xl text-slate-700 animate-pulse text-center max-w-2xl leading-relaxed">
                  {loadingPhase === 5 ? "Génération du bilan et envoi de l'e-mail..." : 
                   loadingPhase === 21 ? `Double évaluation - Phase 1 : Audit de la première correction (Modèle : ${getFriendlyModelName(supervisionModel, supervisionProvider)})...` : 
                   loadingPhase === 22 ? `Double évaluation - Phase 2 : Analyse critique et correction (Modèle : ${getFriendlyModelName(supervisionModel, supervisionProvider)})...` : 
                   loadingPhase === 23 ? `Double évaluation - Phase 3 : Synthèse finale et consensus de notation (Modèle : ${getFriendlyModelName(supervisionModel, supervisionProvider)})...` :
                   loadingPhase === 1 ? `Phase 1 : Audit linguistique de la copie (Évaluateur : ${getFriendlyModelName(evalModel)})...` : 
                   loadingPhase === 2 ? `Phase 2 : Analyse qualitative de la production (Évaluateur : ${getFriendlyModelName(evalModel)})...` : 
                   `Phase 3 : Synthèse et consolidation (Évaluateur : ${getFriendlyModelName(evalModel)})...`}
                </p>
                <button 
                  onClick={() => {
                    abortControllerRef.current?.abort();
                  }}
                  className="mt-6 px-6 py-2.5 bg-rose-50 text-rose-600 hover:bg-rose-100 font-bold text-sm rounded-xl border border-rose-200 transition-colors shadow-sm cursor-pointer"
                >
                  Interrompre l'évaluation
                </button>
              </motion.div>
            )}

            {mode === "SINGLE" && evaluationResult && !isLoading && (
              <EvaluationResultView
                key={`result-${evalResultVersion}`}
                data={evaluationResult}
                level={evaluationResult.level || level} 
                gradingMode={gradingMode}
                onSendFeedback={handleSendFeedback} 
                onDataChange={(updated) => setEvaluationResult(updated)} 
                outputFolder={outputFolder}
                onSupervise={(forcedMode) => {
                  const targetMode = forcedMode || supervisionMode;
                  if (targetMode === 'internal') {
                    if (evaluationResult) {
                      const baseResult = (evaluationResult as any)._comparison?.firstEval || evaluationResult;
                      handleSuperviseResultWithState(baseResult);
                    }
                  } else {
                    if (evaluationResult) {
                      const baseResult = (evaluationResult as any)._comparison?.firstEval || evaluationResult;
                      openExternalSupervision('single', [{
                        fileId: baseResult.file || 'single',
                        subject: baseResult.subject || subject || 'Sujet',
                        transcription: baseResult.transcription || text || '',
                        result1: baseResult,
                      }]);
                    }
                  }
                }}
                isSupervising={isSupervisingSingle}
                subject={subject}
                evalModel={evalModel}
              />
            )}

            {/* Modal de correction OCR pour Lot */}
            <AnimatePresence>
              {batchCorrectionIndex !== null && pendingReviews[batchCorrectionIndex] && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-8">
                  <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-white rounded-3xl w-full max-w-5xl shadow-2xl flex flex-col overflow-hidden max-h-full">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <h2 className="text-xl font-bold flex items-center gap-2"><Edit3 className="w-6 h-6 text-amber-500" /> Correction OCR du lot</h2>
                      <div className="bg-white px-3 py-1 rounded-lg border font-mono text-sm shadow-sm">{pendingReviews[batchCorrectionIndex].file}</div>
                    </div>
                    
                    <div className="flex-1 p-6 relative flex flex-col min-h-[400px]">
                      {isBatchCorrectingEval ? (
                        <div className="absolute inset-0 bg-white/80 backdrop-blur flex flex-col items-center justify-center z-10">
                           <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                           <p className="font-bold text-xl text-slate-700 animate-pulse text-center max-w-2xl leading-relaxed">
                             {loadingPhase === 1 ? `Phase 1 : Audit linguistique de la copie corrigée (Évaluateur : ${getFriendlyModelName(evalModel)})...` : 
                              loadingPhase === 2 ? `Phase 2 : Analyse qualitative de la production corrigée (Évaluateur : ${getFriendlyModelName(evalModel)})...` : 
                              useDoubleEval ? `Phase 3 : Synthèse & Lancement de la double évaluation (Évaluateur : ${getFriendlyModelName(evalModel)} + Double évaluateur : ${getFriendlyModelName(supervisionModel, supervisionProvider)})...` :
                              `Phase 3 : Synthèse et consolidation (Évaluateur : ${getFriendlyModelName(evalModel)})...`}
                           </p>
                        </div>
                      ) : null}
                      <label className="text-sm font-bold text-slate-700 mb-2 block">Texte extrait via OCR : Corrigez les erreurs avant réévaluation</label>
                      {pendingReviews[batchCorrectionIndex].ocrAlerts && pendingReviews[batchCorrectionIndex].ocrAlerts.length > 0 && (
                        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col gap-2 shadow-sm">
                          <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
                            <Info className="w-5 h-5 text-amber-600" />
                            <span>Attention : L'IA a détecté des doutes de lecture OCR</span>
                          </div>
                          <ul className="list-disc pl-5 text-xs text-amber-700 space-y-1">
                            {pendingReviews[batchCorrectionIndex].ocrAlerts.map((alert: string, idx: number) => (
                              <li key={idx}>{alert}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <textarea 
                        value={batchCorrectionText} 
                        onChange={e => setBatchCorrectionText(e.target.value)} 
                        className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-2xl p-5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 resize-none font-medium leading-relaxed" 
                      />
                    </div>

                    <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
                      <button onClick={() => setBatchCorrectionIndex(null)} className="px-6 py-3 font-bold text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-xl transition-colors">Annuler</button>
                      <button onClick={handleBatchCorrectionEval} disabled={isBatchCorrectingEval} className="px-8 py-3 font-bold text-white bg-blue-600 disabled:opacity-50 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-500/20 flex items-center gap-2 transition-transform active:scale-95">
                         <Send className="w-5 h-5" /> Relancer l'Analyse
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Batch: Progression en temps réel */}
            {mode === "BATCH" && isBatchLoading && batchProgress && (
              <motion.div key="batch-progress" className="max-w-xl mx-auto mt-10 space-y-6">
                <div className="text-center space-y-2">
                  <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto" />
                  <h3 className="text-xl font-bold text-slate-700">Traitement en cours...</h3>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-bold text-slate-700">Fichier {batchProgress.fileIndex + 1} / {batchProgress.totalFiles}</span>
                    <span className="text-slate-400">{Math.round(((batchProgress.fileIndex + 1) / batchProgress.totalFiles) * 100)}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500" style={{ width: `${((batchProgress.fileIndex + (batchProgress.phase === 'pdf' ? 0.8 : batchProgress.phase === 'eval' ? 0.5 : 0.2)) / batchProgress.totalFiles) * 100}%` }}/>
                  </div>
                  <p className="text-sm text-slate-600 font-medium animate-pulse">{batchProgress.message}</p>
                  
                  {batchKeyInfo && (
                    <motion.div 
                      key={batchKeyInfo.key}
                      initial={{ opacity: 0, y: 5 }} 
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2 pt-2 border-t border-slate-100"
                    >
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${batchKeyInfo.source === 'perso' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                        Clé {batchKeyInfo.source}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        Active: {batchKeyInfo.key}
                      </span>
                      <motion.span 
                        animate={{ scale: [1, 1.2, 1] }} 
                        transition={{ duration: 0.5 }}
                        className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                      />
                    </motion.div>
                  )}
                </div>
                {/* Résultats au fur et à mesure */}
                {pendingReviews.length > 0 && (
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-2">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">✅ Terminés ({pendingReviews.filter(r => r.status === 'success').length})</p>
                    {pendingReviews.map((r, i) => (
                      <div key={i} className={`text-sm flex justify-between items-center py-1 ${r.status === 'error' ? 'text-red-500' : 'text-slate-600'}`}>
                        <div className="flex items-center gap-2">
                           <span>{r.status === 'error' ? '❌' : '✅'} {r.file}</span>                        </div>
                        {r.globalScore != null && <span className="font-bold">{formatScore(r.globalScore)}/25</span>}
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {mode === "BATCH" && isBatchLoading && !batchProgress && (
              <motion.div key="batch-init" className="flex flex-col items-center justify-center p-16">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
                <p className="text-slate-500 font-medium">Initialisation...</p>
              </motion.div>
            )}

            {/* Batch: Page de révision enrichie */}
            {mode === "BATCH" && !isBatchLoading && batchResults && pendingReviews.length > 0 && (
               <motion.div key="review" className="p-4 space-y-6">
                 <div className="flex items-center justify-between">
                   <h3 className="text-xl font-bold flex items-center gap-2"><Mail className="text-blue-500"/> Révision avant envoi — {pendingReviews.filter(r => r.status === 'success').length} copie(s)</h3>
                   <div className="flex flex-col items-end gap-2">
                     <div className="flex items-center gap-3 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm text-[10px] font-bold">
                       <span className="text-slate-400 uppercase tracking-wider">Actif :</span>
                       <div className="flex items-center gap-1 border-l border-slate-300 pl-3">
                         <span className="text-slate-500 uppercase">OCR</span>
                         <span className={`px-2 py-0.5 rounded-md ${ocrModel ? (ocrModel.startsWith('gemini-') ? 'bg-blue-600 text-white' : 'bg-orange-500 text-white') : 'bg-slate-300 text-slate-500'}`}>
                           {ocrModel ? getFriendlyModelName(ocrModel) : '-'}
                         </span>
                       </div>
                       <div className="flex items-center gap-1 border-l border-slate-300 pl-3">
                         <span className="text-slate-500 uppercase">Éval</span>
                         <span className={`px-2 py-0.5 rounded-md text-white ${evalModel ? 'bg-blue-600' : 'bg-slate-300 text-slate-500'}`}>
                           {evalModel ? getFriendlyModelName(evalModel) : '-'}
                         </span>
                       </div>
                       <div className="flex items-center gap-1 border-l border-slate-300 pl-3">
                         <span className="text-slate-500 uppercase">Double éval.</span>
                         <span className={`px-2 py-0.5 rounded-md text-white ${useDoubleEval && supervisionModel ? 'bg-blue-600' : 'bg-slate-300 text-slate-500'}`}>
                           {useDoubleEval && supervisionModel ? getFriendlyModelName(supervisionModel, supervisionProvider) : '-'}
                         </span>
                       </div>
                     </div>
                     <div className="flex gap-2">
                       {pendingReviews.some(r => r.isOcrOnly) && (
                          <>
                            <button
                              onClick={() => {
                                const ocrOnlyFiles = pendingReviews.filter(r => r.isOcrOnly);
                                const tasks = ocrOnlyFiles.map(r => ({
                                  fileId: r.file,
                                  subject: batchSubject || subject || 'Sujet',
                                  transcription: r.transcription || '',
                                  result1: { transcription: r.transcription } as any
                                }));
                                openExternalInitial('batch', tasks);
                              }}
                              disabled={isEvaluatingAll}
                              className="flex items-center gap-2 px-4 py-2.5 bg-amber-100 border border-amber-200 text-amber-800 rounded-xl font-bold text-sm transition-all shadow-sm hover:bg-amber-200 active:scale-95 disabled:opacity-50"
                              title="Procéder à l'évaluation initiale externe en lot (sans clé API)"
                            >
                              <Brain className="w-4 h-4 text-amber-600"/> Éval. externe en lot
                            </button>
                            <button onClick={handleEvaluateAll} disabled={isEvaluatingAll} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm transition-all shadow-sm hover:bg-blue-700 hover:shadow-md active:scale-95 disabled:opacity-50">
                              {isEvaluatingAll ? <Loader2 className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>}
                              Lancer l'Évaluation
                            </button>
                          </>
                       )}
                       {superviseUiState !== 'idle' ? (
                         <div className="flex items-center gap-2 bg-purple-50 p-1.5 rounded-2xl border border-purple-100 shadow-sm">
                           <button onClick={() => {
                             if (superviseUiState === 'running') {
                               superviseControlRef.current = 'paused';
                               setSuperviseUiState('paused');
                             } else {
                               superviseControlRef.current = 'running';
                               setSuperviseUiState('running');
                             }
                           }} className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-700 rounded-xl font-bold text-xs hover:bg-amber-200 transition-all border border-amber-200 shadow-sm">
                             {superviseUiState === 'running' ? <Pause className="w-3.5 h-3.5"/> : <Play className="w-3.5 h-3.5"/>}
                             {superviseUiState === 'running' ? "Pause double éval." : "Reprendre double éval."}
                           </button>
                           <button onClick={() => {
                             superviseControlRef.current = 'stopped';
                             setSuperviseUiState('idle');
                             setActiveSuperviseFile(null);
                           }} className="flex items-center gap-2 px-4 py-2 bg-rose-100 text-rose-700 rounded-xl font-bold text-xs hover:bg-rose-200 transition-all border border-rose-200 shadow-sm">
                             <Square className="w-3.5 h-3.5"/> Stopper
                           </button>
                         </div>
                       ) : (
                         <button onClick={handleSuperviseBatch} disabled={!pendingReviews.some(r => r.status === 'success')} className="flex items-center gap-2 px-4 py-2.5 bg-purple-100 text-purple-700 rounded-xl font-bold text-sm transition-all shadow-sm border border-purple-200 hover:bg-purple-200 hover:shadow-md active:scale-95 disabled:opacity-50">
                           <Brain className="w-4 h-4"/> Lancer la double évaluation
                         </button>
                       )}                     
                     <button 
                       onClick={() => addFilesInputRef.current?.click()}
                       disabled={isAddingToBatch}
                       className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm border ${isAddingToBatch ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-wait' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:shadow-md active:scale-95'}`}
                     >
                       {isAddingToBatch ? <Loader2 className="w-4 h-4 animate-spin" /> : <FilePlus2 className="w-4 h-4" />}
                       {isAddingToBatch ? "Traitement..." : "Ajouter des copies"}
                       </button>
                     </div>
                     {superviseUiState !== 'idle' && activeSuperviseFile && (
                       <div className="text-xs text-purple-700 font-bold flex items-center gap-1.5 bg-purple-50 px-3 py-1.5 rounded-full border border-purple-200 shadow-sm mr-1">
                         <div className="relative flex items-center justify-center w-4 h-4">
                            {superviseUiState === 'running' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600"/> : <Pause className="w-3.5 h-3.5 text-amber-600"/>}
                         </div>
                         {superviseUiState === 'running' ? "Double évaluation en cours :" : "Double évaluation en pause :"} 
                         <span className="font-mono bg-white px-2 py-0.5 rounded border border-purple-100">{activeSuperviseFile.split('.')[0]}</span>
                       </div>
                     )}
                     <input 
                       type="file" 
                       ref={addFilesInputRef}
                       className="hidden" 
                       multiple 
                       accept=".pdf,.jpg,.jpeg,.png" 
                       onChange={e => { 
                         if (e.target.files && e.target.files.length > 0) { 
                           const files = Array.from(e.target.files); 
                           handleAddToBatch(files);
                           e.target.value = ''; 
                         } 
                       }}
                     />
                  </div>
                </div>

                {/* Sujet du Lot - Permet l'insertion après OCR */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-500"/> Sujet (Consigne) pour ce lot
                    </label>
                    <button onClick={() => setBatchSubject("")} className="text-[10px] text-slate-400 hover:text-red-500 font-bold uppercase tracking-widest flex items-center gap-1">
                      <RotateCcw className="w-3 h-3"/> Reset
                    </button>
                  </div>
                  <textarea 
                    value={batchSubject} 
                    onChange={e => setBatchSubject(e.target.value)} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm h-24 focus:ring-2 focus:ring-blue-500/20 outline-none resize-none" 
                    placeholder="Saisissez le sujet ici. Il sera utilisé pour toutes les copies du lot lors de l'évaluation."
                  />
                </div>
                
                {/* Progression d'ajout de copies */}
                 {isAddingToBatch && addBatchStatus && (
                   <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
                     <Loader2 className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0" />
                     <span className="text-sm font-medium text-blue-700">{addBatchStatus}</span>
                   </motion.div>
                 )}
                 {(() => {
                   const successItems = pendingReviews.filter(r => r.status === 'success');
                   if (successItems.length === 0) return null;
                   
                   const unrecognized = successItems.filter(r => !r.studentId);
                   if (unrecognized.length === 0) {
                     return (
                       <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2">
                         <CheckCircle className="w-5 h-5" />
                         Tous les étudiants ont été automatiquement reconnus.
                       </div>
                     );
                   } else {
                     return (
                       <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
                         <p className="font-bold flex items-center gap-2 mb-2">
                           <Zap className="w-5 h-5 text-amber-600"/>
                           Attention : {unrecognized.length} étudiant(s) non reconnu(s)
                         </p>
                         <p className="text-xs mb-2">Veuillez sélectionner manuellement l'étudiant pour les fichiers suivants :</p>
                         <ul className="list-disc pl-5 text-[11px] space-y-1">
                           {unrecognized.map((u, idx) => (
                             <li key={idx}><span className="font-mono bg-white px-1 py-0.5 rounded border border-amber-100">{u.file}</span></li>
                           ))}
                         </ul>
                       </div>
                     );
                   }
                 })()}

                 <div className="space-y-4">
                   {pendingReviews.map((item, i) => {
                     if (item.status !== 'success') return null;
                     return (
                       <div key={i} className="border border-slate-200 rounded-2xl p-5 bg-white shadow-sm space-y-3">
                         {/* Ligne d'en-tête */}
                         <div className="flex justify-between items-center">
                           <h4 className="font-bold text-slate-700 flex items-center gap-2">
                             <FileText className="w-4 h-4 text-slate-400"/> {item.file.split('.')[0]}
                           </h4>
                           {item.isOcrOnly ? (
                             <div className="px-4 py-1.5 rounded-xl bg-slate-100 text-slate-500 font-bold text-xs flex items-center gap-2">
                               <RotateCcw className="w-3.5 h-3.5 animate-pulse" />
                               En attente d'évaluation
                             </div>                           ) : (
                              <div className={`px-4 py-1.5 rounded-xl font-black text-lg ${item.globalScore >= 12.5 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                {formatScore(item.globalScore)}/25
                              </div>
                            )}
                         </div>
                         {/* Notes détaillées éditables */}
                         {item.criteriaScores && (
                           <div className="flex flex-wrap gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                             {(() => {
                               const itemLevel = item.level || level;
                               const crits = getCriteriaConfig(itemLevel);
                               return crits.map((crit) => {
                                 const key = crit.key;
                                 const label = crit.label;
                                 const maxScore = crit.maxScore;
                                 const val = (item.criteriaScores as any)[key] as number;
                                 
                                 let options: number[];
                                 if (maxScore !== 5) {
                                   options = [];
                                   const steps = Math.round(maxScore * 10);
                                   for (let s = 0; s <= steps; s++) {
                                     options.push(Math.round(s) / 10);
                                   }
                                 } else {
                                   options = gradingMode === 'delf' ? [0, 1, 3, 5] : [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
                                 }
                                 if (!options.includes(val) && val !== null && val !== undefined && !isNaN(val)) {
                                   options.push(val);
                                   options.sort((a, b) => a - b);
                                 }

                                 const ratio = maxScore > 0 ? (val || 0) / maxScore : 0;
                                 const badgeClass = ratio >= 0.6
                                   ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                   : ratio >= 0.4
                                     ? 'bg-amber-50 text-amber-700 border-amber-200'
                                     : 'bg-rose-50 text-rose-700 border-rose-200';

                                 return (
                                   <div key={key} className="flex flex-col gap-1">
                                     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter truncate max-w-[120px]" title={label}>
                                       {label} (/{formatScore(maxScore)})
                                     </span>
                                     <select
                                       value={val}
                                       onChange={(e) => updateBatchScore(i, key, parseFloat(e.target.value))}
                                       className={`text-xs font-black px-2 py-1 rounded-lg border outline-none transition-colors ${badgeClass}`}
                                     >
                                       {options.map(v => <option key={v} value={v}>{formatScore(v)}</option>)}
                                     </select>
                                   </div>
                                 );
                               });
                             })()}
                             {item.isDirty && (
                               <div className="ml-auto self-end flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-lg border border-indigo-100 animate-pulse">
                                 <Zap className="w-3 h-3 fill-current" />
                                 <span className="text-[10px] font-black uppercase tracking-wider">Score ajusté</span>
                               </div>
                             )}
                           </div>
                         )}
                         {/* Source + Actions + Email */}
                         <div className="flex flex-col gap-2 text-[11px] text-slate-500 bg-white p-2 rounded-lg border border-slate-100">
                           <div className="flex flex-wrap items-center justify-between gap-3">
                             <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5 font-medium">
                                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                                  <button 
                                    onClick={() => window.open(`/api/serve-pdf?path=${encodeURIComponent(batchFolder + '/' + item.file)}&root=${encodeURIComponent(batchFolder)}`, '_blank')} 
                                    className="truncate max-w-[250px] text-left hover:text-blue-600 hover:underline cursor-pointer"
                                    title="Ouvrir le document source"
                                  >
                                    {item.file}
                                  </button>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button 
                                    onClick={() => handleSendIndividualEmail(i)}
                                    disabled={item.isSendingEmail || isSendingBatch || !item.studentEmail}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors font-bold ${item.emailSent ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'} disabled:opacity-50`}
                                    title={item.emailSent ? "Renvoyer l'e-mail avec le PDF" : "Envoyer l'e-mail avec le PDF"}
                                  >
                                    {item.isSendingEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Send className="w-3.5 h-3.5" />}
                                    {item.emailSent ? "Renvoyer" : "Envoyer"}
                                  </button>
                                  <button 
                                    onClick={() => handleTransferToSingleMode(i)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 transition-colors font-bold"
                                    title="Retirer du lot et corriger manuellement en Mode Unique"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                    Corriger
                                  </button>
                                  <button 
                                    onClick={() => handleRetryOcr(i)}
                                    disabled={isRetrying === item.file + "_ocr"}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors font-bold disabled:opacity-50"
                                    title="Relancer uniquement l'OCR (Gemini)"
                                  >
                                    {isRetrying === item.file + "_ocr" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                                    OCR
                                  </button>
                                  <button 
                                    onClick={() => handleSuperviseSingle(i)}
                                    disabled={item.isSupervising || item.isSendingEmail || isGeneratingAll || isSendingBatch}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition-colors font-bold disabled:opacity-50"
                                    title="Double évaluation"
                                  >
                                    {item.isSupervising ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                                    Double éval.
                                  </button>
                                  {item._comparison && (
                                    <button 
                                      onClick={() => setComparisonModalData(item._comparison)}
                                      className="flex items-center gap-1.5 px-3 py-1.5 bg-fuchsia-50 text-fuchsia-600 rounded-lg hover:bg-fuchsia-100 transition-colors font-bold shadow-sm"
                                      title="Voir les différences avec la première évaluation"
                                    >
                                      <GitCompare className="w-3.5 h-3.5" />
                                      Diff. double éval.
                                    </button>
                                  )}
                                  <button 
                                    onClick={() => handlePreviewPdf(item)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors font-bold"
                                    title="Aperçu du PDF"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    Aperçu
                                  </button>
                                </div>
                             </div>
                           </div>
                           
                           <div className="flex flex-wrap items-center gap-3 mt-1 pt-2 border-t border-slate-50">
                              {/* Sélecteurs Classe / Étudiant */}
                              <div className="flex items-center gap-2">
                                <select 
                                  value={item.classId || ""} 
                                  onChange={e => {
                                    const cId = e.target.value;
                                    const cls = classes.find(c => c.id === cId);
                                    const nr = [...pendingReviews];
                                    nr[i] = { ...item, classId: cId, className: cls?.name, studentId: "" };
                                    setPendingReviews(nr);
                                  }} 
                                  className="text-[10px] bg-slate-50 border rounded px-1 py-0.5 outline-none w-32"
                                >
                                  <option value="">-- Classe --</option>
                                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
  
                                {item.classId && (
                                  <select 
                                    value={item.studentId || ""} 
                                    onChange={e => {
                                      const sId = e.target.value;
                                      const cls = classes.find(c => c.id === item.classId);
                                      const stu = cls?.students.find((s: any) => s.id === sId);
                                      const nr = [...pendingReviews];
                                      nr[i] = { 
                                        ...item, 
                                        studentId: sId, 
                                        studentName: stu?.name || item.studentName,
                                        studentEmail: stu?.email !== undefined ? stu.email : item.studentEmail
                                      };
                                      setPendingReviews(nr);
                                    }} 
                                    className="text-[10px] bg-slate-50 border rounded px-1 py-0.5 outline-none w-64 max-w-full"
                                  >
                                    <option value="">-- Étudiant --</option>
                                    {classes.find(c => c.id === item.classId)?.students.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                  </select>
                                )}
                              </div>
  
                              <div className="flex items-center gap-1.5 overflow-hidden ml-auto">
                                <Mail className="w-3.5 h-3.5 text-slate-400" />
                                <input 
                                  value={item.studentEmail || ""}
                                  onChange={(e) => {
                                    const nr = [...pendingReviews];
                                    nr[i] = { ...item, studentEmail: e.target.value };
                                    setPendingReviews(nr);
                                  }}
                                  className="bg-transparent border-b border-dashed border-slate-300 focus:border-blue-500 outline-none w-48 truncate"
                                  placeholder="Email manquant..."
                                />
                              </div>
                           </div>
                         </div>
                       </div>
                     );
                   })}
                   {pendingReviews.some(r => r.status === 'error') && (
                     <div className="flex justify-between items-center bg-slate-100 p-4 rounded-2xl border border-slate-200 mb-4">
                       <span className="text-sm font-bold text-slate-600 flex items-center gap-2">
                         <Zap className="w-4 h-4 text-amber-500" />
                         Certaines évaluations ont échoué
                       </span>
                       <button 
                         onClick={handleRetryAllFailed}
                         disabled={isRetrying !== null}
                         className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-500/10 disabled:opacity-50"
                       >
                         {isRetrying !== null ? <Loader2 className="w-4 h-4 animate-spin"/> : <RefreshCcw className="w-4 h-4"/>}
                         Tout relancer
                       </button>
                     </div>
                   )}
                   {/* Erreurs */}
                   {pendingReviews.filter(r => r.status === 'error').map((item, i) => (
                     <div key={`err-${i}`} className="border border-red-200 rounded-2xl p-4 bg-red-50 text-red-700 text-sm flex justify-between items-center gap-4">
                       <div className="min-w-0 flex-1">
                         ❌ <strong>{item.file}</strong> — {item.reason}
                         {item.errorPhase === 'double_eval' && (
                           <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-semibold rounded-full whitespace-nowrap">
                             Double évaluation échouée (Correction simple OK)
                           </span>
                         )}
                       </div>
                       <div className="flex gap-2 shrink-0">
                         {item.primaryResult && (
                           <button
                             onClick={() => {
                               setPendingReviews(prev => prev.map(r => r.file === item.file ? { 
                                 ...item.primaryResult, 
                                 file: item.file, 
                                 status: 'success', 
                                 batchMode: item.batchMode, 
                                 emailSent: false,
                                 isDirty: true
                               } : r));
                             }}
                             className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-bold whitespace-nowrap cursor-pointer"
                             title="Conserver le résultat de l'évaluation simple"
                           >
                             <CheckCircle className="w-4 h-4" />
                             Garder simple
                           </button>
                         )}
                         <button 
                           onClick={() => handleRetryFile(item)} 
                           disabled={isRetrying === item.file}
                           className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-bold whitespace-nowrap disabled:opacity-50 cursor-pointer"
                           title="Relancer l'évaluation pour ce fichier"
                         >
                           {isRetrying === item.file ? <Loader2 className="w-4 h-4 animate-spin"/> : <RefreshCcw className="w-4 h-4"/>}
                           Relancer
                         </button>
                       </div>
                     </div>
                   ))}
                 </div>
                 <div className="flex justify-end gap-3 pt-4">
                   <button onClick={() => { setPendingReviews([]); setBatchResults(null); }} className="px-5 py-2.5 text-slate-500 hover:text-slate-700 font-medium">Retour</button>
                   {pendingReviews.some(r => r.status === 'success' && !r.isOcrOnly && !r._comparison) && (
                     <button
                       onClick={() => openExternalSupervision('batch', pendingReviews
                         .filter(r => r.status === 'success' && !r.isOcrOnly && !r._comparison)
                         .map(r => ({ fileId: r.file, subject: r.subject || batchSubject || 'Sujet', transcription: r.transcription || '', result1: r })))}
                       className="px-6 py-3 bg-violet-50 text-violet-700 border border-violet-200 rounded-xl font-bold flex items-center gap-2 hover:bg-violet-100 transition-colors shadow-sm"
                       title="Exporter la double évaluation vers une IA externe (sans clé API)"
                     >
                       <Brain className="w-4 h-4"/> Double éval externe
                     </button>
                   )}
                   {pendingReviews.some(r => r.status === 'error' && (!r.transcription || !r.transcription.trim())) && (
                     <button
                       onClick={() => {
                         const failed = pendingReviews.filter(r => r.status === 'error' && (!r.transcription || !r.transcription.trim()));
                         handlePrepareExternalBatch('ocr', failed.map(r => ({ file: r.file, filePath: `${batchFolder}\\${r.file}`, subject: r.subject || batchSubject || 'Sujet' })));
                       }}
                       disabled={isExternalBatchLoading}
                       className="px-5 py-3 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl font-bold flex items-center gap-2 hover:bg-amber-100 transition-colors shadow-sm cursor-pointer"
                       title="Préparer les instructions pour relancer l'OCR des copies échouées sur Claude/ChatGPT Desktop"
                     >
                       <Eye className="w-4 h-4"/> OCR échoués (Desktop)
                     </button>
                   )}
                   {pendingReviews.some(r => r.status === 'error' && r.transcription) && (
                     <button
                       onClick={() => {
                         const failed = pendingReviews.filter(r => r.status === 'error' && r.transcription);
                         handlePrepareExternalBatch('eval', failed.map(r => ({ file: r.file, filePath: `${batchFolder}\\${r.file}`, transcription: r.transcription, subject: r.subject || batchSubject || 'Sujet' })));
                       }}
                       disabled={isExternalBatchLoading}
                       className="px-5 py-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl font-bold flex items-center gap-2 hover:bg-rose-100 transition-colors shadow-sm cursor-pointer"
                       title="Préparer les instructions pour évaluer les copies échouées sur Claude/ChatGPT Desktop"
                     >
                       <AlertTriangle className="w-4 h-4"/> Évals échouées (Desktop)
                     </button>
                   )}
                   <button
                     onClick={() => handleImportExternalBatch(pendingReviews.some(r => r.status === 'error' && (!r.transcription || !r.transcription.trim())) ? 'ocr' : (pendingReviews.some(r => r.status === 'error') ? 'eval' : 'supervision'))}
                     disabled={isExternalBatchLoading}
                     className="px-5 py-3 bg-purple-50 text-purple-700 border border-purple-200 rounded-xl font-bold flex items-center gap-2 hover:bg-purple-100 transition-colors shadow-sm cursor-pointer"
                     title="Importer automatiquement les fichiers produits par Claude / ChatGPT Desktop dans le sous-dossier livrables"
                   >
                     {isExternalBatchLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : <FolderOpen className="w-4 h-4"/>} Importer livrables Desktop
                   </button>
                   <button onClick={handleGenerateAllPdfs} disabled={isGeneratingAll} className="px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-200 transition-colors border border-slate-200">
                     {isGeneratingAll ? <Loader2 className="w-4 h-4 animate-spin"/> : <FileText className="w-4 h-4"/>} Générer PDFs
                   </button>
                   <button onClick={handleExportExcel} className="px-6 py-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-100 transition-colors shadow-sm">
                     <FileSpreadsheet className="w-4 h-4"/> Exporter Excel
                   </button>
                   <button 
                      onClick={handleSyncBatchToHistory} 
                      disabled={isBatchLoading}
                      className="px-6 py-3 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-100 transition-colors shadow-sm"
                      title="Enregistrer / Synchroniser toutes les évaluations du lot dans l'historique"
                    >
                      <Database className="w-4 h-4"/> Enregistrer dans l'historique
                    </button>
                   <button onClick={handleSendBatchEmails} disabled={isSendingBatch} className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-500/20">
                     {isSendingBatch && <Loader2 className="w-4 h-4 animate-spin"/>} {pendingReviews.some(r => r.status === 'success' && r.emailSent) && pendingReviews.some(r => r.status === 'success' && !r.emailSent) ? "Envoyer les emails restants" : "Envoyer les e-mails"}
                   </button>
                 </div>
               </motion.div>
            )}

            {mode === "BATCH" && !isBatchLoading && !batchResults && (
              <motion.div key="batch" className="max-w-4xl mx-auto space-y-6 mt-6 pb-12">
                {/* En-tête informatif du mode lot */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-white p-5 rounded-3xl border border-blue-100 shadow-sm gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
                      <Folder className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-800">Évaluation par Lot (Production Écrite)</h3>
                      <p className="text-xs text-slate-500">
                        {examType === 'delf_b1' ? "Session d'examen DELF B1" :
                         examType === 'delf_b2' ? "Session d'examen DELF B2" :
                         examType === 'traduction' ? "Épreuve de Traduction" :
                         examType === 'dictee' ? "Épreuve de Dictée" :
                         examType === 'grammaire' ? "Épreuve d'Exercices de Grammaire" :
                         examType === 'composition' ? `Épreuve de Composition (${compositionType})` :
                         "Session d'examen"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-white border border-blue-200 text-blue-700 rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      {examType.toUpperCase()}
                    </span>
                    <span className="px-3 py-1 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold shadow-xs">
                      Note sur {examType === 'delf_b1' || examType === 'delf_b2' ? '25' : customMaxScore} pts
                    </span>
                  </div>
                </div>

                {/* Configuration spécifique pour les épreuves personnalisées en mode lot */}
                {examType !== 'delf_b1' && examType !== 'delf_b2' && (
                  <CustomExamConfigPanel
                    examType={examType}
                    maxScore={customMaxScore}
                    onMaxScoreChange={setCustomMaxScore}
                    referenceText={dictationReferenceText}
                    onReferenceTextChange={setDictationReferenceText}
                    dictationPenalties={dictationPenalties}
                    onDictationPenaltiesChange={setDictationPenalties}
                    sourceText={translationSourceText}
                    onSourceTextChange={setTranslationSourceText}
                    modelTranslation={translationModel}
                    onModelTranslationChange={setTranslationModel}
                    sourceLang={translationSourceLang}
                    onSourceLangChange={setTranslationSourceLang}
                    targetLang={translationTargetLang}
                    onTargetLangChange={setTranslationTargetLang}
                    exerciseSubject={grammarExerciseSubject}
                    onExerciseSubjectChange={setGrammarExerciseSubject}
                    answerKey={grammarAnswerKey}
                    onAnswerKeyChange={setGrammarAnswerKey}
                    compositionType={compositionType}
                    onCompositionTypeChange={setCompositionType}
                    compositionLanguage={compositionLanguage}
                    onCompositionLanguageChange={setCompositionLanguage}
                    corpusText={compositionCorpus}
                    onCorpusTextChange={setCompositionCorpus}
                    compositionSubject={compositionSubject}
                    onCompositionSubjectChange={setCompositionSubject}
                    disableStandardGrid={compositionDisableGrid}
                    onDisableStandardGridChange={setCompositionDisableGrid}
                    customInstructions={customInstructions}
                    onCustomInstructionsChange={setCustomInstructions}
                  />
                )}

                {/* Sujet DELF pour B1/B2 en mode lot */}
                {(examType === 'delf_b1' || examType === 'delf_b2') && (
                  <div className="bg-white border border-slate-200 p-6 rounded-3xl space-y-3 shadow-sm">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-600" />
                        <label className="text-sm font-bold text-slate-800">
                          Sujet commun de l'épreuve DELF {level} (Optionnel)
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        {subject && subject.trim() !== batchSubject.trim() && (
                          <button
                            type="button"
                            onClick={() => setBatchSubject(subject)}
                            className="px-2.5 py-1 text-[11px] bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg font-bold flex items-center gap-1 transition-colors cursor-pointer"
                            title="Copier le sujet actuellement défini en mode unique"
                          >
                            <Copy className="w-3 h-3" />
                            Reprendre sujet du mode unique
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setBatchSubject("")}
                          className="text-[10px] text-slate-400 hover:text-red-500 font-bold uppercase tracking-widest flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3"/> Reset
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={batchSubject}
                      onChange={e => setBatchSubject(e.target.value)}
                      className="w-full border border-slate-200 p-4 rounded-2xl text-sm bg-slate-50 shadow-inner resize-y h-24 focus:ring-2 focus:ring-blue-500/20 outline-none"
                      placeholder="Laissez vide pour détection automatique du sujet par l'OCR sur la première page de chaque copie, ou saisissez le sujet commun à imposer à toutes les copies..."
                    />
                    <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                      <span>
                        <strong>Conseil :</strong> Si toutes les copies traitent du même sujet et qu'il n'est pas imprimé sur la feuille de réponse, écrivez-le ci-dessus. Sinon, laissez vide : l'OCR découvrira le sujet de chaque copie automatiquement.
                      </span>
                    </div>
                  </div>
                )}

                {/* Carte Paramètres du Lot & Lancement */}
                <div className="bg-white border border-slate-200 p-6 rounded-3xl space-y-5 shadow-sm">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <FolderOpen className="w-5 h-5 text-blue-600" />
                    <h4 className="font-bold text-slate-800 text-sm">Dossiers et flux de travail</h4>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                        <span>📂 Dossier Source (Copies)</span>
                        <span className="text-[10px] text-slate-400 font-normal">PDF, JPG, PNG</span>
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={batchFolder}
                          onChange={e => setBatchFolder(e.target.value)}
                          className="flex-1 border border-slate-200 p-3 rounded-xl font-mono text-xs bg-slate-50 shadow-inner focus:ring-2 focus:ring-blue-500/20 outline-none"
                          placeholder="Chemin du dossier source..."
                        />
                        <button
                          type="button"
                          onClick={() => setFolderPickerTarget('source')}
                          className="px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl font-bold text-xs hover:bg-blue-100 flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
                        >
                          <FolderOpen className="w-4 h-4"/> Parcourir
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                        <span>📂 Dossier Sortie (Bilans & PDFs)</span>
                        <span className="text-[10px] text-slate-400 font-normal">Export automatique</span>
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={outputFolder}
                          onChange={e => setOutputFolder(e.target.value)}
                          className="flex-1 border border-slate-200 p-3 rounded-xl font-mono text-xs bg-slate-50 shadow-inner focus:ring-2 focus:ring-blue-500/20 outline-none"
                          placeholder="Chemin du dossier sortie..."
                        />
                        <button
                          type="button"
                          onClick={() => setFolderPickerTarget('output')}
                          className="px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl font-bold text-xs hover:bg-blue-100 flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
                        >
                          <FolderOpen className="w-4 h-4"/> Parcourir
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div>
                      <p className="font-bold text-sm text-slate-800">Envoi direct par e-mail</p>
                      <p className="text-xs text-slate-500">Si activé, les bilans PDF seront envoyés aux apprenants automatiquement sans écran de revue préalable.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAutoEmail(!autoEmail)}
                      className={`relative w-12 h-6 rounded-full transition-colors ${autoEmail ? 'bg-blue-600' : 'bg-slate-300'}`}
                    >
                      <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${autoEmail ? 'translate-x-6' : 'translate-x-0'}`}></span>
                    </button>
                  </div>

                  {/* Boutons d'action principaux */}
                  <div className="flex flex-col gap-3 pt-2">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button 
                        onClick={() => handleStartBatch(false)} 
                        disabled={isBatchLoading}
                        className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-xl shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {isBatchLoading ? <Loader2 className="w-5 h-5 animate-spin"/> : <Zap className="w-5 h-5"/>}
                        {isBatchLoading ? "Évaluation du lot en cours..." : "Lancer le lot complet"}
                      </button>
                      <button 
                        onClick={() => handleStartBatch(true)} 
                        disabled={isBatchLoading}
                        className="px-6 py-4 bg-slate-100 text-slate-700 rounded-2xl font-bold hover:bg-slate-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 border border-slate-200 cursor-pointer"
                        title="Extraction OCR uniquement pour vérification préalable des textes transcrits"
                      >
                        <Eye className="w-5 h-5"/>
                        OCR seul
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button 
                        onClick={handleResumeLastBatch} 
                        disabled={isBatchLoading}
                        className="py-3 bg-white text-blue-600 border-2 border-blue-100 rounded-2xl font-bold hover:bg-blue-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                      >
                        <RotateCcw className="w-4 h-4"/>
                        Récupérer le dernier lot évalué
                      </button>

                      <label className="py-3 bg-white text-indigo-600 border-2 border-indigo-100 rounded-2xl font-bold hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs">
                        <Database className="w-4 h-4 text-indigo-600"/>
                        Charger un lot sauvegardé (.json, .md)
                        <input
                          type="file"
                          accept=".json,.md,.txt"
                          className="hidden"
                          onChange={handleLoadBatchFile}
                        />
                      </label>
                    </div>

                    {/* Bloc Automatisation Externe (Claude / ChatGPT Desktop) */}
                    <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 p-5 rounded-3xl space-y-3 mt-1">
                      <div className="flex items-center gap-2 text-violet-800 font-bold text-sm">
                        <Sparkles className="w-4 h-4 text-violet-600" />
                        <span>Automatisation Externe (Claude / ChatGPT Desktop)</span>
                      </div>
                      <p className="text-xs text-violet-700/80 leading-relaxed">
                        Déléguez l'OCR ou la correction à vos applications de bureau ayant accès aux fichiers de l'ordinateur, sans clé API.
                      </p>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          onClick={() => handlePrepareExternalBatch('ocr')}
                          disabled={isExternalBatchLoading || !batchFolder}
                          className="py-2.5 px-3 bg-white text-violet-700 border border-violet-200 rounded-xl text-xs font-bold hover:bg-violet-100/50 flex items-center justify-center gap-1.5 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                          title="Génère CONSIGNES.md et prépare les copies pour OCR local"
                        >
                          <Eye className="w-3.5 h-3.5" /> Préparer OCR externe
                        </button>
                        <button
                          onClick={() => handlePrepareExternalBatch('eval')}
                          disabled={isExternalBatchLoading || !batchFolder}
                          className="py-2.5 px-3 bg-white text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold hover:bg-indigo-100/50 flex items-center justify-center gap-1.5 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                          title="Génère CONSIGNES.md et prépare les copies pour correction locale"
                        >
                          <Brain className="w-3.5 h-3.5" /> Préparer Correction
                        </button>
                      </div>
                      <button
                        onClick={() => handleImportExternalBatch('eval')}
                        disabled={isExternalBatchLoading}
                        className="w-full py-2.5 px-3 bg-violet-600 text-white rounded-xl text-xs font-bold hover:bg-violet-700 flex items-center justify-center gap-2 transition-colors shadow-md shadow-violet-500/20 disabled:opacity-50 cursor-pointer"
                        title="Importe automatiquement en 1 clic les fichiers générés dans livrables"
                      >
                        {isExternalBatchLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <FolderOpen className="w-3.5 h-3.5" />}
                        Importer livrables externes (1 clic)
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
          </>
        ) : mainView === "CLASSES" ? (
          <ClassManager />
        ) : mainView === "HISTORY" ? (
          <HistoryView onSelectRecord={handleLoadHistoryRecord} />
        ) : mainView === "GENERATOR" ? (
          <SubjectGeneratorView
            apiKeys={apiKeys?.gemini}
            onUseAsSubject={(newSubject) => {
              setSubject(newSubject);
              setMainView("CORRECTION");
            }}
          />
        ) : (
          <MaintenanceView 
            apiKeys={apiKeys}
            setApiKeys={setApiKeys}
            keyMode={keyMode}
            setKeyMode={setKeyMode}
            emailConfig={emailConfig}
            setEmailConfig={setEmailConfig}
            signature={signature}
            setSignature={setSignature}
          />
        )}
      </main>

      {/* Modale Comparaison Double évaluation */}
      <ComparisonModal
        comparisonModalData={comparisonModalData}
        setComparisonModalData={setComparisonModalData}
        level={level}
        gradingMode={gradingMode}
      />

      {/* Recovery Modal for Supervision failure */}
      <SupervisionRecoveryModal
        supervisionFailure={supervisionFailure}
        setSupervisionFailure={setSupervisionFailure}
        setEvaluationResult={setEvaluationResult}
        handleSuperviseResultWithState={handleSuperviseResultWithState}
        setIsLoading={setIsLoading}
        supervisionProvider={supervisionProvider}
        setSupervisionProvider={setSupervisionProvider}
        supervisionModel={supervisionModel}
        setSupervisionModel={setSupervisionModel}
      />

      {/* Folder Picker Modal */}
      {folderPickerTarget && (
        <FolderPicker
          currentPath={folderPickerTarget === 'source' ? batchFolder : outputFolder}
          onSelect={(selected) => {
            if (folderPickerTarget === 'source') setBatchFolder(selected);
            else setOutputFolder(selected);
            setFolderPickerTarget(null);
          }}
          onClose={() => setFolderPickerTarget(null)}
        />
      )}

      {/* Double évaluation externe (Claude, sans clé API) */}
      <AnimatePresence>
        {externalModalOpen && (
          <ExternalSupervisionModal
            mode={externalMode}
            tasks={externalTasks}
            config={{ level, language, gradingMode, nativeLanguage }}
            firstProviderLabel={getFriendlyModelName(evalModel)}
            outputFolder={outputFolder}
            onApply={handleApplyExternalSupervision}
            onClose={() => setExternalModalOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Toast Notification en direct */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-8 right-8 z-[200] max-w-md bg-slate-900 text-white p-4 rounded-2xl shadow-2xl flex items-start gap-3 border border-slate-700 font-sans"
          >
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
              <Zap className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <h5 className="font-bold text-sm leading-tight text-white">{toast.title}</h5>
              <p className="text-xs text-slate-300 mt-1 leading-snug">{toast.message}</p>
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-slate-400 hover:text-white transition-colors cursor-pointer p-1 -mr-1 -mt-1"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
