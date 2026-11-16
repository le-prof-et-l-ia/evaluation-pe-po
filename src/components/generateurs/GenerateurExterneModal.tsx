"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { X, Download, Copy, Check, Upload, Brain, AlertTriangle, FileJson } from "lucide-react";
import Aide from "@/components/Aide";
import type { SubjectGenerationResult } from "@/lib/subjectGeneratorService";
import {
  construireConsignesGeneration,
  importerReponseGeneration,
  libelleGenerationExterne,
  type ParamsGenerationExterne,
} from "@/lib/generateurs/externe";

interface Props {
  params: ParamsGenerationExterne;
  onApply: (result: SubjectGenerationResult) => void;
  onClose: () => void;
}

/**
 * Préparation d'un sujet par une IA externe (sans clé API) :
 * étape 1, exporter les consignes ; étape 2, recoller la réponse JSON de l'IA.
 */
export default function GenerateurExterneModal({ params, onApply, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [importText, setImportText] = useState("");
  const [error, setError] = useState("");

  const consignes = useMemo(() => construireConsignesGeneration(params), [params]);
  const libelle = libelleGenerationExterne(params);

  const handleDownload = () => {
    const blob = new Blob([consignes], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const theme = params.theme.slice(0, 25).replace(/[^a-z0-9]/gi, "_");
    a.download = `preparation_externe_${params.ce ? "CE" : params.section.toUpperCase()}_${params.level}_${theme}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(consignes);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Copie impossible : téléchargez le fichier à la place.");
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportText(await file.text());
    e.target.value = "";
  };

  const handleApply = () => {
    setError("");
    try {
      onApply(importerReponseGeneration(importText, params));
    } catch (err: any) {
      setError(err?.message || "Réponse illisible.");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4 sm:p-6 print:hidden"
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
            Préparation par une IA externe — {libelle}
            <Aide cle="c_genExterne" taille={18} />
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="overflow-y-auto p-6 space-y-6">
          <p className="text-sm text-slate-500">
            Sans clé API : exportez les consignes ci-dessous (elles contiennent déjà le texte de l&apos;article source),
            faites-les traiter par l&apos;IA de votre abonnement (Claude, ChatGPT, Gemini…), puis recollez la réponse JSON produite.
            Rien n&apos;est envoyé automatiquement.
          </p>
          <p className="text-xs text-slate-500">
            Source : <strong className="text-slate-700">{params.source.mediaName}</strong>
            {params.source.title ? <> — {params.source.title}</> : null}.
            L&apos;application recompte les mots de chaque texte et vous pourrez tout modifier avant l&apos;export.
          </p>

          {/* Étape 1 : export */}
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-3">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400">Étape 1 — Exporter les consignes</div>
            <div className="flex gap-3">
              <button onClick={handleDownload} className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl font-bold text-sm hover:bg-violet-700 transition-colors shadow-sm">
                <Download className="w-4 h-4" /> Télécharger (.md)
              </button>
              <button onClick={handleCopy} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-50 transition-colors">
                {copied ? <><Check className="w-4 h-4 text-emerald-500" /> Copié</> : <><Copy className="w-4 h-4" /> Copier le texte</>}
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              <strong>Consigne d&apos;utilisation :</strong> collez le texte dans une nouvelle discussion avec l&apos;IA, ou joignez-lui le fichier .md.
            </p>
            <details className="text-[11px] text-slate-500">
              <summary className="cursor-pointer font-semibold">Voir les consignes</summary>
              <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap bg-white border border-slate-200 rounded-xl p-3 font-mono text-[10px] text-slate-600">{consignes}</pre>
            </details>
          </div>

          {/* Étape 2 : import */}
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-3">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400">Étape 2 — Réimporter la réponse de l&apos;IA externe</div>
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder="Collez ici la réponse JSON de l'IA externe (ou importez un fichier)..."
              className="w-full h-40 p-3 rounded-xl border border-slate-200 font-mono text-[11px] focus:ring-2 focus:ring-violet-500/20 outline-none resize-y bg-white"
            />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-50 transition-colors cursor-pointer">
                <Upload className="w-4 h-4" /> Importer un fichier
                <input type="file" accept=".json,.md,.txt" className="hidden" onChange={handleFile} />
              </label>
              <button
                onClick={handleApply}
                disabled={!importText.trim()}
                className="ml-auto flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <FileJson className="w-4 h-4" /> Afficher le sujet
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> <span>{error}</span>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
