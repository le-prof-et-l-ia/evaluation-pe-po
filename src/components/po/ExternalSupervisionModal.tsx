"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Download, Copy, Check, Upload, Brain, AlertTriangle, FileJson } from "lucide-react";
import Aide from "@/components/Aide";
import { motion } from "framer-motion";
import type { CorrectionResult } from "@/lib/po/geminiService";
import {
  buildExternalSupervisionMarkdown,
  parseExternalSupervisionResults,
  finalizeExternalSupervision,
  CRITERIA_BY_LEVEL,
  type ExternalSupervisionTask,
  type ExternalInitialTask,
  type ExternalSupervisionConfig,
} from "@/lib/po/externalSupervision";
import { obtenirEpreuve, estDelf, type ConfigEpreuve, type ContexteEpreuve } from "@/lib/epreuves/registre";

interface Props {
  mode?: 'initial' | 'supervision';
  tasks: ExternalSupervisionTask[];
  config: ExternalSupervisionConfig;
  firstProviderLabel?: string;
  outputFolder?: string;
  /** Type d'épreuve ('delf_b1', 'delf_b2', 'interpretation') : choisit consignes et calcul de la note (registre des épreuves). */
  examType?: string;
  /** Configuration d'une épreuve hors DELF (discours source, barème…). */
  examConfig?: ConfigEpreuve;
  onApply: (results: { fileId: string; finalResult: CorrectionResult }[]) => void;
  onClose: () => void;
}

export default function ExternalSupervisionModal({ mode = 'supervision', tasks, config, firstProviderLabel, outputFolder, examType, examConfig, onApply, onClose }: Props) {
  const isInitial = mode === 'initial';
  // Évaluation initiale : consignes et finalisation propres à l'épreuve (registre).
  // La double évaluation reste réservée au DELF.
  const epreuve = obtenirEpreuve('po', isInitial ? examType : 'delf');
  const contexte: ContexteEpreuve = estDelf(examType) ? { delfPO: config } : { config: examConfig };
  const tailleConseillee = isInitial && epreuve ? epreuve.tailleSousLot : 5;
  const [copied, setCopied] = useState(false);
  const [importText, setImportText] = useState("");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalItems = tasks.length;
  const [chunkSize, setChunkSize] = useState(totalItems > 1 ? Math.min(tailleConseillee, totalItems) : 1);
  const [activeChunkIndex, setActiveChunkIndex] = useState(0);
  const [processedFileIds, setProcessedFileIds] = useState<Set<string>>(new Set());

  const chunks = useMemo(() => {
    const arr = tasks;
    const res = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
      res.push(arr.slice(i, i + chunkSize));
    }
    return res;
  }, [tasks, chunkSize]);

  const activeChunk = chunks[activeChunkIndex] || [];

  const markdown = useMemo(() => {
    if (activeChunk.length === 0) return "";
    if (isInitial) {
      if (!epreuve) return "";
      return epreuve.genererConsignes(activeChunk as ExternalInitialTask[], contexte);
    }
    return buildExternalSupervisionMarkdown(activeChunk as ExternalSupervisionTask[], config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitial, activeChunk, config, epreuve, JSON.stringify(examConfig ?? null)]);

  const requiredKeysFor = (criteriaScores: any): string[] => {
    const fromResult = criteriaScores ? Object.keys(criteriaScores) : [];
    return fromResult.length > 0 ? fromResult : (CRITERIA_BY_LEVEL[config.level] || CRITERIA_BY_LEVEL.B2);
  };

  const handleDownload = () => {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const chunkSuffix = chunks.length > 1 ? `_lot_${activeChunkIndex + 1}_sur_${chunks.length}` : '';
    a.download = `${isInitial ? 'eval_initiale_externe_PO' : 'double_eval_externe_PO'}${chunkSuffix}_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Copie impossible : téléchargez le fichier à la place.");
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setImportText(content);
    e.target.value = "";
  };

  const applyRaw = (raw: string): boolean => {
    setError("");
    setSummary(null);
    let parsed;
    try {
      parsed = parseExternalSupervisionResults(raw);
    } catch (err: any) {
      setError(err.message);
      return false;
    }

    const results: { fileId: string; finalResult: CorrectionResult }[] = [];
    const failures: string[] = [];

    const activeIds = activeChunk.map(t => t.fileId);
    for (const id of activeIds) {
      const match = parsed.find(p => p.fileId === id)
        || (activeIds.length === 1 && parsed.length === 1 ? parsed[0] : undefined);
      if (!match) {
        failures.push(`${id} : aucune évaluation trouvée`);
        continue;
      }
      try {
        let finalResult: CorrectionResult;
        if (isInitial) {
          const task = (activeChunk as ExternalSupervisionTask[]).find(t => t.fileId === id)!;
          if (!epreuve) throw new Error("Épreuve inconnue.");
          finalResult = epreuve.finaliser(match.evaluation, task, contexte);
        } else {
          const st = (activeChunk as ExternalSupervisionTask[]).find(t => t.fileId === id)!;
          finalResult = finalizeExternalSupervision(st.result1, match.evaluation, {
            level: config.level,
            language: config.language,
            notationType: config.notationType,
            requiredKeys: requiredKeysFor(st.result1?.criteriaScores),
            secondProviderLabel: "IA externe",
            firstProviderLabel,
          });
        }
        results.push({ fileId: id, finalResult });
      } catch (err: any) {
        failures.push(`${id} : ${err.message}`);
      }
    }

    if (results.length === 0) {
      setError("Aucun résultat exploitable pour ce sous-lot. " + (failures[0] || ""));
      return false;
    }

    setProcessedFileIds(prev => {
      const next = new Set(prev);
      results.forEach(r => next.add(r.fileId));
      return next;
    });

    if (failures.length > 0) {
      setSummary(`${results.length} copie(s) appliquée(s) pour ce sous-lot, ${failures.length} en échec : ${failures.join(" ; ")}`);
    } else {
      setSummary(`${results.length} copie(s) appliquée(s) avec succès pour ce sous-lot.`);
    }

    setImportText("");

    try {
      onApply(results);
      return true;
    } catch (err: any) {
      setError("Erreur d'application : " + err.message);
      return false;
    }
  };

  const handleApply = () => { applyRaw(importText); };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4 sm:p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.97 }}
        className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
            <Brain className="w-6 h-6 text-violet-600" />
            {isInitial ? `Évaluation initiale externe${epreuve && epreuve.id !== 'delf' ? ` — ${epreuve.libelle}` : ' (Examinateur 1)'}` : 'Double évaluation externe (IA externe)'}
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="overflow-y-auto p-6 space-y-6">
          <p className="text-sm text-slate-500">
            {isInitial
              ? `${totalItems} enregistrement(s) à évaluer. Sans clé API : exportez les consignes ci-dessous, faites-les traiter par une IA externe (Claude, ChatGPT, Gemini, etc.), puis réimportez la réponse JSON produite.`
              : `${totalItems} enregistrement(s) à superviser. Sans clé API : exportez les consignes, faites-les traiter par une IA externe, puis réimportez le JSON produit. La fusion des notes reste calculée par l'application.`}
          </p>

          {isInitial && epreuve?.avertissement && (
            <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> <span>{epreuve.avertissement}</span>
            </div>
          )}
          {isInitial && epreuve && epreuve.id !== 'delf' && (
            <p className="text-xs text-slate-500">
              La note est recalculée par l&apos;application à partir de la réponse de l&apos;IA (barème de l&apos;épreuve), comme pour une correction avec clé Gemini.
            </p>
          )}

          {totalItems > 1 && (
            <div className="bg-violet-50/50 border border-violet-100 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <Brain className="w-4 h-4 text-violet-600" />
                  Découpage en sous-lots ({chunks.length} sous-lot(s) de max {chunkSize})
                  <Aide cle="sousLots" />
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  Recommandé : {tailleConseillee} copie(s) max par sous-lot pour respecter les limites de sortie token.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <label className="text-xs font-bold text-slate-600">Taille :</label>
                <select
                  value={chunkSize}
                  onChange={e => {
                    const val = Number(e.target.value);
                    setChunkSize(val);
                    setActiveChunkIndex(0);
                  }}
                  className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 outline-none font-bold text-slate-700 shadow-sm"
                >
                  <option value={1}>1 copie</option>
                  <option value={2}>2 copies{tailleConseillee === 2 ? " (recommandé)" : ""}</option>
                  <option value={3}>3 copies{tailleConseillee === 3 ? " (recommandé)" : ""}</option>
                  <option value={5}>5 copies{tailleConseillee === 5 ? " (recommandé)" : ""}</option>
                  <option value={10}>10 copies</option>
                  <option value={15}>15 copies</option>
                  <option value={30}>30 copies</option>
                </select>
              </div>
            </div>
          )}

          {totalItems > 1 && chunks.length > 1 && (
            <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-2">
              {chunks.map((chunk, idx) => {
                const chunkFileIds = chunk.map(t => t.fileId);
                const doneCount = chunkFileIds.filter(id => processedFileIds.has(id)).length;
                const isCompleted = doneCount === chunk.length;
                const isActive = idx === activeChunkIndex;

                return (
                  <button
                    key={`chunk-${idx}`}
                    type="button"
                    onClick={() => {
                      setActiveChunkIndex(idx);
                      setError("");
                      setSummary(null);
                      setImportText("");
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all border ${
                      isActive
                        ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    Sous-lot {idx + 1}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      isActive
                        ? "bg-violet-700 text-violet-100"
                        : isCompleted
                        ? "bg-emerald-100 text-emerald-700"
                        : doneCount > 0
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-200 text-slate-600"
                    }`}>
                      {doneCount}/{chunk.length}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Étape 1 : export */}
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-3">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400">
              Étape 1 — Exporter les consignes {chunks.length > 1 ? `(Sous-lot ${activeChunkIndex + 1} / ${chunks.length})` : ""}
            </div>
            <div className="flex gap-3">
              <button onClick={handleDownload} className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl font-bold text-sm hover:bg-violet-700 transition-colors shadow-sm">
                <Download className="w-4 h-4" /> Télécharger (.md)
              </button>
              <button onClick={handleCopy} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-50 transition-colors">
                {copied ? <><Check className="w-4 h-4 text-emerald-500" /> Copié</> : <><Copy className="w-4 h-4" /> Copier le texte</>}
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              <strong>Consigne d'utilisation :</strong> Copiez-collez le texte ci-dessus OU téléchargez le fichier .md et soumettez-le à l'IA. 
              Laissez-la produire le JSON de réponse, puis réimportez-le ci-dessous.
            </p>
          </div>

          {/* Étape 2 : import */}
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-3">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400">
              Étape 2 — Réimporter la réponse de l'IA externe {chunks.length > 1 ? `(pour le Sous-lot ${activeChunkIndex + 1})` : ""}
            </div>
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder="Collez ici la réponse JSON de l'IA externe (ou importez un fichier)..."
              className="w-full h-40 p-3 rounded-xl border border-slate-200 font-mono text-[11px] focus:ring-2 focus:ring-violet-500/20 outline-none resize-y bg-white"
            />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-50 transition-colors cursor-pointer">
                <Upload className="w-4 h-4" /> Importer un fichier
                <input ref={fileInputRef} type="file" accept=".json,.md,.txt" className="hidden" onChange={handleFile} />
              </label>
              <button
                onClick={handleApply}
                disabled={!importText.trim()}
                className="ml-auto flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <FileJson className="w-4 h-4" /> Appliquer
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
            </div>
          )}
          {summary && (
            <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> <span>{summary}</span>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
