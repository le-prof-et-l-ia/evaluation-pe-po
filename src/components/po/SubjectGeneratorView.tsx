"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Search,
  BookOpen,
  FileText,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  RotateCcw,
  Copy,
  Download,
  ArrowRight,
  Loader2,
  Globe,
  Sliders,
  Layers,
  Zap,
  Info,
  ChevronRight,
  FileCheck,
  Mic
} from "lucide-react";
import {
  CandidateArticle,
  ExtractedArticle,
  SubjectGenerationResult,
  MEDIA_WHITELIST,
  countFrenchWords
} from "@/lib/subjectGeneratorService";
import { type KeyConfig } from "@/lib/retryUtils";

interface SubjectGeneratorViewProps {
  apiKeys?: KeyConfig;
  onUseAsSubject?: (subjectText: string) => void;
}

const THEME_SUGGESTIONS = [
  "Le télétravail : vers la fin du modèle hybride ?",
  "L'intelligence artificielle générative à l'école",
  "La semaine de quatre jours en entreprise",
  "L'interdiction des smartphones pour les mineurs",
  "La régulation des vols courts au profit du train",
  "L'uniforme obligatoire dans les établissements scolaires",
  "Le droit à la déconnexion et la surcharge mentale",
  "La piétonnisation intégrale des centres-villes"
];

export default function SubjectGeneratorView({ apiKeys, onUseAsSubject }: SubjectGeneratorViewProps) {
  // ── Form State ─────────────────────────────────────────────────────────────
  const [theme, setTheme] = useState("");
  const [level, setLevel] = useState<"B1" | "B2" | "C1">("B2");
  const [articleCount, setArticleCount] = useState<number>(2); // for C1
  const [targetWordCount, setTargetWordCount] = useState<number>(250);
  const [searchMode, setSearchMode] = useState<"DIRECT" | "ASSISTED" | "MANUAL">("DIRECT");
  const [manualUrl, setManualUrl] = useState("");
  const [manualText, setManualText] = useState("");

  // ── Processing & Data State ───────────────────────────────────────────────
  const [isSearching, setIsSearching] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressStep, setProgressStep] = useState<string>("" );
  const [candidates, setCandidates] = useState<CandidateArticle[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateArticle | null>(null);
  const [extractedSource, setExtractedSource] = useState<ExtractedArticle | null>(null);
  const [result, setResult] = useState<SubjectGenerationResult | null>(null);
  const [activeDocTab, setActiveDocTab] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleLevelSelect = (newLevel: "B1" | "B2" | "C1") => {
    setLevel(newLevel);
    if (newLevel === "B1") {
      setTargetWordCount(180);
    } else if (newLevel === "B2") {
      setTargetWordCount(250);
    } else if (newLevel === "C1") {
      setTargetWordCount(250);
      if (articleCount < 2) setArticleCount(2);
    }
  };

  const handleSearchCandidates = async () => {
    if (!theme.trim()) {
      setErrorMsg("Veuillez saisir un thème d'actualité.");
      return;
    }
    setErrorMsg(null);
    setIsSearching(true);
    setCandidates([]);
    setSelectedCandidate(null);
    setProgressStep(`Recherche d'articles récents (< 9 mois) parmi les ${MEDIA_WHITELIST.length} diffuseurs...`);

    try {
      const res = await fetch("/api/po/subject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "search", theme })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec de la recherche");
      setCandidates(data.candidates || []);
      if ((data.candidates || []).length === 0) {
        setErrorMsg("Aucun article récent trouvé pour ce thème sur les diffuseurs. Vous pouvez passer en mode 'Article direct' ou 'Génération 1-clic'.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Erreur lors de la recherche");
    } finally {
      setIsSearching(false);
      setProgressStep("");
    }
  };

  const handleGenerate = async (candidateToUse?: CandidateArticle) => {
    if (!theme.trim()) {
      setErrorMsg("Veuillez indiquer un thème.");
      return;
    }

    setErrorMsg(null);
    setIsGenerating(true);
    setResult(null);

    try {
      let sourceArticleData: ExtractedArticle | undefined = undefined;

      // Étape 1 : Si mode Manuel avec texte
      if (searchMode === "MANUAL" && manualText.trim()) {
        sourceArticleData = {
          title: `Document source : ${theme.trim()}`,
          mediaName: "Presse francophone",
          publishedDate: new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date()),
          cleanText: manualText.trim(),
          originalUrl: manualUrl.trim() || "https://francetvinfo.fr"
        };
      }
      // Étape 2 : Si mode Manuel avec URL ou candidat sélectionné
      else if (candidateToUse || selectedCandidate || (searchMode === "MANUAL" && manualUrl.trim())) {
        const urlToExtract = candidateToUse?.url || selectedCandidate?.url || manualUrl.trim();
        const media = candidateToUse?.mediaName || selectedCandidate?.mediaName;

        setProgressStep(`Extraction textuelle épurée via Jina Reader...`);
        const extRes = await fetch("/api/po/subject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "extract", url: urlToExtract, mediaName: media })
        });
        const extData = await extRes.json();
        if (!extRes.ok) throw new Error(extData.error || "Erreur d'extraction de l'article");
        sourceArticleData = extData.article;
        setExtractedSource(extData.article);
      } else {
        setProgressStep(`Recherche d'un article pertinent sur les ${MEDIA_WHITELIST.length} diffuseurs...`);
      }

      // Étape 3 : Réécriture didactique et boucle de décompte de mots
      setProgressStep(`Génération didactique ${level} avec Gemini Flash & boucle de comptage de mots (±5%)...`);

      const genRes = await fetch("/api/po/subject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          theme,
          level,
          targetWordCount,
          articleCount: level === "C1" ? articleCount : 1,
          sourceArticle: sourceArticleData,
          apiKeys
        })
      });

      const genData = await genRes.json();
      if (!genRes.ok) throw new Error(genData.error || "Erreur lors de la génération du sujet");

      setResult(genData.result);
      setActiveDocTab(0);
    } catch (err: any) {
      setErrorMsg(err.message || "Erreur inconnue lors de la génération");
    } finally {
      setIsGenerating(false);
      setProgressStep("");
    }
  };

  const handleCopyDocument = (doc: any) => {
    const textToCopy = `${doc.title}\n${doc.source}\n\n${doc.body}`;
    navigator.clipboard.writeText(textToCopy);
    setCopySuccess(`Document copié ! (${doc.actualWordCount} mots)`);
    setTimeout(() => setCopySuccess(null), 2500);
  };

  const handleCopyFullSubject = () => {
    if (!result) return;
    const fullText = result.documents.map(d => `${d.title}\n${d.source}\n\n${d.body}`).join("\n\n---\n\n");
    navigator.clipboard.writeText(fullText);
    setCopySuccess("Dossier complet copié !");
    setTimeout(() => setCopySuccess(null), 2500);
  };

  const handleDownloadSubject = () => {
    if (!result) return;
    let content = `# Sujet d'épreuve : Production Orale ${result.level}\n`;
    content += `**Thème :** ${result.theme}\n`;
    content += `**Date de génération :** ${new Date().toLocaleDateString("fr-FR")}\n`;
    content += `**Source d'origine :** ${result.sourceArticle.mediaName} - [Consulter l'article original](${result.sourceArticle.url})\n\n`;
    content += `---\n\n`;

    result.documents.forEach((doc, idx) => {
      if (result.documents.length > 1) {
        content += `## Document ${idx + 1} ${doc.viewpoint ? `(${doc.viewpoint})` : ""}\n\n`;
      }
      content += `### ${doc.title}\n`;
      content += `*${doc.source}*\n\n`;
      content += `${doc.body}\n\n`;
      content += `> Décompte de mots : ${doc.actualWordCount} mots (visé : ${doc.targetWordCount})\n\n`;
    });

    const blob = new Blob([content], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Sujet_PO_${result.level}_${result.theme.slice(0, 25).replace(/[^a-z0-9]/gi, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleTransferToCorrection = () => {
    if (!result || !onUseAsSubject) return;
    const subjectSummary = result.documents
      .map((d, i) => (result.documents.length > 1 ? `[Document ${i + 1}] ${d.title}\n${d.body}` : `${d.title}\n\n${d.body}`))
      .join("\n\n---\n\n");

    onUseAsSubject(`Thème : ${result.theme}\n\n${subjectSummary}`);
  };

  const minTolerance = Math.round(targetWordCount * 0.95);
  const maxTolerance = Math.round(targetWordCount * 1.05);

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-8 gap-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
              <Sparkles className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span>Générateur de Sujets & Textes Déclencheurs FLE</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-bold tracking-normal flex items-center gap-1">
                <Mic className="w-3 h-3" /> PO
              </span>
            </h1>
          </div>
          <p className="text-sm text-slate-500 font-medium">
            Création de documents déclencheurs journalistiques argumentatifs pour les épreuves orales B1 / B2 et C1.
          </p>
        </div>

        {/* Badge diffuseurs */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600"
          title={MEDIA_WHITELIST.map(m => m.name).join(", ")}
        >
          <Globe className="w-3.5 h-3.5 text-blue-600" />
          <span>{MEDIA_WHITELIST.length} diffuseurs TV, Radio & Presse (sans paywall)</span>
        </div>
      </div>

      {/* Main Grid: Form Left, Results Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* FORMULAIRE (Col 5) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm space-y-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-600" /> Paramètres du Sujet
            </h3>

            {/* 1. Thème */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">Thème d'actualité ou problématique</label>
              <div className="relative">
                <input
                  type="text"
                  value={theme}
                  onChange={e => setTheme(e.target.value)}
                  placeholder="Ex : Le télétravail obligatoire, l'uniforme scolaire..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all pr-10"
                />
                {theme && (
                  <button
                    onClick={() => setTheme("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Suggestions rapides */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {THEME_SUGGESTIONS.slice(0, 4).map((sugg, i) => (
                  <button
                    key={i}
                    onClick={() => setTheme(sugg)}
                    className="text-[11px] px-2.5 py-1 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 rounded-lg border border-slate-200/60 transition-colors cursor-pointer"
                  >
                    {sugg}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Niveau CECRL */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">Niveau CECRL visé</label>
              <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100/70 rounded-2xl border border-slate-200/60">
                {(["B1", "B2", "C1"] as const).map(lvl => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => handleLevelSelect(lvl)}
                    className={`py-2 text-xs font-black rounded-xl transition-all cursor-pointer ${
                      level === lvl
                        ? "bg-white text-indigo-700 shadow-sm border border-slate-200/80"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 italic px-1">
                {level === "B1" && "B1 : Déclencheur court pour exprimer un point de vue personnel (Partie 3 de l'oral)."}
                {level === "B2" && "B2 : Document argumentatif pour l'exposé et le débat oral."}
                {level === "C1" && "C1 : Registre soutenu, implicite et problématique riche pour l'exposé et le débat."}
              </p>
            </div>

            {/* 3. Spécificité C1 : Sélecteur de nombre d'articles */}
            <AnimatePresence>
              {level === "C1" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2 bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100 overflow-hidden"
                >
                  <label className="text-xs font-bold text-indigo-900 flex items-center justify-between">
                    <span>Nombre d'articles à générer (Dossier C1)</span>
                    <span className="text-[10px] font-black uppercase bg-indigo-200/70 text-indigo-900 px-2 py-0.5 rounded-md">
                      Contradictoire
                    </span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3].map(count => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => setArticleCount(count)}
                        className={`py-2 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                          articleCount === count
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                            : "bg-white text-slate-700 border-slate-200 hover:border-indigo-300"
                        }`}
                      >
                        {count} article{count > 1 ? "s" : ""}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-indigo-700/80 leading-snug">
                    {articleCount === 1 && "Un article unique confrontant les deux points de vue dans le même texte."}
                    {articleCount === 2 && "Deux articles distincts avec répartition des points de vue opposés (Pour / Contre)."}
                    {articleCount === 3 && "Trois articles : point de vue favorable, point de vue critique et analyse d'expert / prospective."}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 4. Longueur cible en mots */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-700">Longueur cible en mots {level === "C1" && articleCount > 1 ? "(par article)" : ""}</label>
                <span className="text-[11px] font-semibold text-slate-500">
                  Tolérance ±5% : <span className="text-indigo-600 font-bold">{minTolerance} - {maxTolerance} mots</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                {[180, 200, 250, 300].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setTargetWordCount(val)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      targetWordCount === val
                        ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {val}
                  </button>
                ))}
                <input
                  type="number"
                  min={100}
                  max={600}
                  value={targetWordCount}
                  onChange={e => setTargetWordCount(Number(e.target.value))}
                  className="w-20 bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold text-center outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            {/* 5. Mode de recherche */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-700 block">Mode de recherche</label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100/70 rounded-2xl border border-slate-200/60 text-xs">
                <button
                  type="button"
                  onClick={() => setSearchMode("DIRECT")}
                  className={`py-2 rounded-xl font-bold transition-all cursor-pointer ${
                    searchMode === "DIRECT" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  ⚡ 1-Clic
                </button>
                <button
                  type="button"
                  onClick={() => setSearchMode("ASSISTED")}
                  className={`py-2 rounded-xl font-bold transition-all cursor-pointer ${
                    searchMode === "ASSISTED" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  🔍 Choisir
                </button>
                <button
                  type="button"
                  onClick={() => setSearchMode("MANUAL")}
                  className={`py-2 rounded-xl font-bold transition-all cursor-pointer ${
                    searchMode === "MANUAL" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  ✍️ Manuel
                </button>
              </div>

              {searchMode === "MANUAL" && (
                <div className="space-y-3 p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">URL de l'article source</label>
                    <input
                      type="url"
                      value={manualUrl}
                      onChange={e => setManualUrl(e.target.value)}
                      placeholder="https://www.francetvinfo.fr/..."
                      className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Ou collez un extrait / texte brut</label>
                    <textarea
                      rows={4}
                      value={manualText}
                      onChange={e => setManualText(e.target.value)}
                      placeholder="Collez ici le texte brut de l'article..."
                      className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs outline-none resize-y"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Boutons d'action */}
            <div className="pt-2">
              {searchMode === "ASSISTED" ? (
                <button
                  type="button"
                  onClick={handleSearchCandidates}
                  disabled={isSearching || isGenerating}
                  className="w-full py-3.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  <span>{isSearching ? "Recherche en cours..." : "Rechercher parmi les 15 médias"}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleGenerate()}
                  disabled={isGenerating || isSearching}
                  className="w-full py-4 px-6 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-2xl font-black text-sm shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                  <span>{isGenerating ? "Création en cours..." : "Générer le sujet pour l'oral"}</span>
                </button>
              )}
            </div>

            {/* Message d'erreur */}
            {errorMsg && (
              <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          {/* Liste des 15 médias pris en charge */}
          <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-4">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-blue-500" /> {MEDIA_WHITELIST.length} Diffuseurs Francophones interrogés
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {MEDIA_WHITELIST.map(m => (
                <span
                  key={m.domain}
                  className="text-[10px] px-2 py-0.5 bg-white rounded-md border border-slate-200/70 text-slate-600 font-medium"
                >
                  {m.name}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ZONE DE RÉSULTATS (Col 7) */}
        <div className="lg:col-span-7 space-y-6">
          {/* État de chargement / progression */}
          {isGenerating && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white border border-indigo-100 rounded-3xl p-8 shadow-xl space-y-6 text-center"
            >
              <div className="w-16 h-16 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto text-indigo-600">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
              <div className="space-y-2">
                <h3 className="font-black text-lg text-slate-900">Génération du document déclencheur oral en cours</h3>
                <p className="text-xs text-indigo-600 font-medium animate-pulse">{progressStep || "Traitement avec Gemini Flash..."}</p>
              </div>

              <div className="space-y-2 max-w-sm mx-auto text-left text-xs text-slate-500 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  <span>Recherche ciblée sur les 15 diffuseurs TV/Radio</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  <span>Extraction épurée via Jina Reader</span>
                </div>
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                  <span>Calibrage syntaxique et lexical ({level})</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <span className="w-4 h-4 rounded-full border border-slate-300 flex items-center justify-center text-[9px] font-bold">4</span>
                  <span>Routine de comptage et contrôle volumétrique (±5%)</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* Liste des articles candidats si mode "Choisir" */}
          {searchMode === "ASSISTED" && candidates.length > 0 && !isGenerating && !result && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4"
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-blue-600" /> {candidates.length} article(s) trouvé(s) sur les 15 diffuseurs
                </h3>
                <span className="text-[11px] text-slate-400">Cliquez pour générer</span>
              </div>

              <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                {candidates.map((cand, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl border border-slate-200/80 hover:border-indigo-300 hover:bg-indigo-50/20 transition-all flex flex-col gap-2 group"
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md">
                            {cand.mediaName}
                          </span>
                          {cand.publishedDate && (
                            <span className="text-[11px] text-slate-400">{cand.publishedDate}</span>
                          )}
                        </div>
                        <h4 className="font-bold text-sm text-slate-800 leading-snug group-hover:text-indigo-600 transition-colors">
                          {cand.title}
                        </h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleGenerate(cand)}
                        className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
                      >
                        <span>Choisir</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {cand.snippet && (
                      <p className="text-xs text-slate-500 line-clamp-2">{cand.snippet}</p>
                    )}

                    <a
                      href={cand.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-slate-400 hover:text-blue-600 flex items-center gap-1 mt-1 truncate"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span className="truncate">{cand.url}</span>
                    </a>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* RÉSULTAT DU SUJET GÉNÉRÉ */}
          {result && !isGenerating && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white border border-slate-200/90 rounded-3xl p-7 shadow-sm space-y-6"
            >
              {/* Header résultat */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
                    <FileCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 text-base">Sujet d'épreuve {result.level} (Production Orale)</h3>
                    <p className="text-xs text-slate-500">Thème : <strong className="text-slate-700">{result.theme}</strong></p>
                  </div>
                </div>

                {/* Bannière de repli si applicable */}
                {result.fallbackNotice && (
                  <span className="px-3 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-full text-xs font-bold flex items-center gap-1.5">
                    <Zap className="w-3 h-3 text-amber-600 fill-amber-500" />
                    <span>Repli : {result.modelUsed}</span>
                  </span>
                )}
              </div>

              {/* Onglets multi-documents si C1 */}
              {result.documents.length > 1 && (
                <div className="flex items-center gap-2 p-1 bg-slate-100/80 rounded-2xl border border-slate-200/60">
                  {result.documents.map((doc, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveDocTab(idx)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        activeDocTab === idx
                          ? "bg-white text-indigo-700 shadow-sm border border-slate-200/70"
                          : "text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Document {idx + 1}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${doc.toleranceMet ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                        {doc.actualWordCount} mots
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Affichage du document actif */}
              {result.documents[activeDocTab] && (
                <div className="space-y-5 bg-slate-50/70 rounded-2xl p-6 border border-slate-100">
                  {/* Angle / Thèse si C1 */}
                  {result.documents[activeDocTab].viewpoint && (
                    <div className="text-[11px] font-bold text-indigo-700 bg-indigo-50/70 px-3 py-1 rounded-lg border border-indigo-100/60 inline-flex items-center gap-1.5">
                      <span>Perspective :</span>
                      <span>{result.documents[activeDocTab].viewpoint}</span>
                    </div>
                  )}

                  {/* Titre formel */}
                  <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight leading-snug">
                      {result.documents[activeDocTab].title}
                    </h2>
                    {/* Mention éditoriale de source */}
                    <p className="text-xs font-semibold text-slate-500 mt-1 italic flex items-center gap-1.5">
                      <span>{result.documents[activeDocTab].source}</span>
                      {result.sourceArticle?.url && (
                        <a
                          href={result.sourceArticle.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline inline-flex items-center gap-0.5 ml-1 font-normal not-italic"
                          title="Consulter l'article original"
                        >
                          <ExternalLink className="w-3 h-3" /> Source d'origine
                        </a>
                      )}
                    </p>
                  </div>

                  {/* Corps de texte réécrit en 2-4 paragraphes */}
                  <div className="text-sm leading-relaxed text-slate-800 space-y-4 pt-2 border-t border-slate-200/60 whitespace-pre-line font-serif">
                    {result.documents[activeDocTab].body}
                  </div>

                  {/* Badge de validation du décompte de mots */}
                  <div className="pt-4 border-t border-slate-200/60 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <div
                        className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 ${
                          result.documents[activeDocTab].toleranceMet
                            ? "bg-emerald-100/80 text-emerald-900 border border-emerald-200"
                            : "bg-amber-100/80 text-amber-900 border border-amber-200"
                        }`}
                      >
                        {result.documents[activeDocTab].toleranceMet ? (
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-amber-600" />
                        )}
                        <span>
                          {result.documents[activeDocTab].actualWordCount} mots réels / {result.documents[activeDocTab].targetWordCount} visés
                        </span>
                      </div>

                      <span className="text-[11px] text-slate-500">
                        Tolérance : ±5% ({minTolerance} à {maxTolerance} mots)
                      </span>
                    </div>

                    <div className="text-[11px] font-semibold text-slate-400">
                      {result.documents[activeDocTab].iterationCount > 0
                        ? `Ajusté en ${result.documents[activeDocTab].iterationCount} itération(s) LLM`
                        : "Conforme dès le premier essai"}
                    </div>
                  </div>
                </div>
              )}

              {/* Notification de copie */}
              {copySuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold text-center animate-fadeIn">
                  {copySuccess}
                </div>
              )}

              {/* Barre d'actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyDocument(result.documents[activeDocTab])}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copier ce document</span>
                  </button>

                  {result.documents.length > 1 && (
                    <button
                      type="button"
                      onClick={handleCopyFullSubject}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Copier tout le dossier</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleDownloadSubject}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    title="Télécharger au format Markdown"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Télécharger (.md)</span>
                  </button>
                </div>

                {onUseAsSubject && (
                  <button
                    type="button"
                    onClick={handleTransferToCorrection}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-indigo-500/20 flex items-center gap-2 cursor-pointer"
                  >
                    <span>Utiliser comme sujet pour l'oral</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {/* Guide / Aide si aucun résultat */}
          {!result && !isGenerating && candidates.length === 0 && (
            <div className="bg-slate-50/70 border border-slate-200/80 rounded-3xl p-8 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center mx-auto text-indigo-500 shadow-xs">
                <FileText className="w-7 h-7" />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <h3 className="font-bold text-slate-800 text-base">Prêt à générer un sujet d'épreuve orale</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Indiquez un thème d'actualité, choisissez le niveau souhaité (B1, B2 ou C1) et lancez la génération.
                  Le système recherchera un article récent (&lt; 9 mois) parmi les 15 diffuseurs TV/radio francophones et adaptera
                  rigoureusement le texte déclencheur avec contrôle automatique du décompte de mots.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
