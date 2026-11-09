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
  Printer,
  CheckSquare,
  HelpCircle,
  Award,
  Check
} from "lucide-react";
import {
  CandidateArticle,
  ExtractedArticle,
  SubjectGenerationResult,
  CeExam,
  CeQuestion,
  QuestionType,
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
  const [articleCount, setArticleCount] = useState<number>(2); // pour C1 multi-documents
  const [targetWordCount, setTargetWordCount] = useState<number>(250);

  // Intervalle personnalisé
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [minWords, setMinWords] = useState<number>(200);
  const [maxWords, setMaxWords] = useState<number>(250);

  // Mode de recherche
  const [searchMode, setSearchMode] = useState<"DIRECT" | "ASSISTED" | "MANUAL">("DIRECT");
  const [manualUrl, setManualUrl] = useState("");
  const [manualText, setManualText] = useState("");

  // Options Compréhension Écrite (CE)
  const [generateCe, setGenerateCe] = useState(false);
  const [ceArticleMode, setCeArticleMode] = useState<"adapted" | "original">("adapted");
  const [ceQuestionCount, setCeQuestionCount] = useState<number>(6);
  const [ceTotalPoints, setCeTotalPoints] = useState<number>(25);
  const [ceQuestionTypes, setCeQuestionTypes] = useState<QuestionType[]>([
    "qcm",
    "vrai_faux",
    "reponse_ouverte"
  ]);

  // ── Processing & Data State ───────────────────────────────────────────────
  const [isSearching, setIsSearching] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressStep, setProgressStep] = useState<string>("");
  const [candidates, setCandidates] = useState<CandidateArticle[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateArticle | null>(null);
  const [extractedSource, setExtractedSource] = useState<ExtractedArticle | null>(null);
  const [result, setResult] = useState<SubjectGenerationResult | null>(null);
  const [activeDocTab, setActiveDocTab] = useState<number>(0);
  const [ceViewTab, setCeViewTab] = useState<"student" | "teacher" | "full">("student");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleLevelSelect = (newLevel: "B1" | "B2" | "C1") => {
    setLevel(newLevel);
    if (newLevel === "B1") {
      setTargetWordCount(180);
      setMinWords(160);
      setMaxWords(200);
    } else if (newLevel === "B2") {
      setTargetWordCount(250);
      setMinWords(230);
      setMaxWords(270);
    } else if (newLevel === "C1") {
      setTargetWordCount(250);
      setMinWords(230);
      setMaxWords(280);
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
      const res = await fetch("/api/subject", {
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

    if (generateCe && ceQuestionTypes.length === 0) {
      setErrorMsg("Veuillez cocher au moins un type de question pour la Compréhension Écrite.");
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
      // Étape 2 : Si un candidat spécifique est choisi
      else if (candidateToUse) {
        setProgressStep(`Extraction propre du texte depuis ${candidateToUse.mediaName}...`);
        const extRes = await fetch("/api/subject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "extract",
            url: candidateToUse.url,
            mediaName: candidateToUse.mediaName
          })
        });
        const extData = await extRes.json();
        if (extRes.ok && extData.article) {
          sourceArticleData = extData.article;
        }
      }
      // Étape 3 : Si mode Manuel avec URL seulement
      else if (searchMode === "MANUAL" && manualUrl.trim()) {
        setProgressStep("Extraction de l'article depuis l'URL fournie...");
        const extRes = await fetch("/api/subject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "extract", url: manualUrl.trim() })
        });
        const extData = await extRes.json();
        if (extRes.ok && extData.article) {
          sourceArticleData = extData.article;
        }
      }

      const effectiveTargetCount = useCustomRange ? Math.round((minWords + maxWords) / 2) : targetWordCount;

      setProgressStep(
        generateCe
          ? `Conception de l'épreuve de Compréhension Écrite CE (${level}, ${ceQuestionCount} questions, ${ceTotalPoints} pts)...`
          : `Génération didactique et contrôle volumétrique (${level}, ${effectiveTargetCount} mots)...`
      );

      const res = await fetch("/api/subject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          theme: theme.trim(),
          level,
          targetWordCount: effectiveTargetCount,
          minWordCount: useCustomRange ? minWords : undefined,
          maxWordCount: useCustomRange ? maxWords : undefined,
          articleCount: level === "C1" ? articleCount : 1,
          sourceArticle: sourceArticleData,
          apiKeys,
          generateCe,
          ceArticleMode,
          ceQuestionCount,
          ceTotalPoints,
          ceQuestionTypes
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec de la génération");

      setResult(data.result);
      setActiveDocTab(0);
      setCeViewTab("student");
    } catch (err: any) {
      setErrorMsg(err.message || "Erreur lors de la génération du sujet");
    } finally {
      setIsGenerating(false);
      setProgressStep("");
    }
  };

  // ── Copie et Téléchargement ───────────────────────────────────────────────

  const notifyCopy = (msg: string) => {
    setCopySuccess(msg);
    setTimeout(() => setCopySuccess(null), 3000);
  };

  const handleCopyDocument = (doc: any) => {
    if (!doc) return;
    const text = `${doc.title}\n${doc.source}\n\n${doc.body}`;
    navigator.clipboard.writeText(text);
    notifyCopy("Texte de l'article copié dans le presse-papier !");
  };

  const handleCopyFullSubject = () => {
    if (!result) return;
    let full = `SUJET D'ÉPREUVE FLE (${result.level}) - Thème : ${result.theme}\n\n`;
    result.documents.forEach((doc, idx) => {
      if (result.documents.length > 1) {
        full += `--- DOCUMENT ${idx + 1} ${doc.viewpoint ? `(${doc.viewpoint})` : ""} ---\n`;
      }
      full += `${doc.title}\n${doc.source}\n\n${doc.body}\n\n`;
    });
    navigator.clipboard.writeText(full.trim());
    notifyCopy("L'ensemble du sujet a été copié dans le presse-papier !");
  };

  const handleCopyStudentExam = () => {
    if (!result || !result.ceExam) return;
    const ce = result.ceExam;
    let text = `# ÉPREUVE DE COMPRÉHENSION ÉCRITE - ${result.level}\n`;
    text += `**Thème :** ${result.theme}\n`;
    text += `**Barème total :** ${ce.totalPoints} points\n\n`;
    text += `## DOCUMENT SUPPORT\n### ${ce.articleTitle}\n*${ce.articleSource}*\n\n`;
    text += `${ce.articleText}\n\n`;
    text += `---\n\n## QUESTIONNAIRE APPRENANT\n${ce.generalInstructions || ""}\n\n`;

    ce.questions.forEach((q, idx) => {
      text += `### Question ${idx + 1} (${q.points} pt${q.points > 1 ? "s" : ""})\n`;
      text += `${q.question}\n\n`;
      if (q.type === "qcm" && q.options) {
        q.options.forEach((opt) => {
          text += `[ ] ${opt}\n`;
        });
        text += `\n`;
      } else if (q.type === "vrai_faux") {
        text += `[ ] Vrai      [ ] Faux\n\n`;
        text += `Justification (recopiez le passage du texte) :\n`;
        text += `« ___________________________________________________________ »\n\n`;
      } else if (q.type === "reponse_ouverte") {
        text += `Réponse :\n`;
        text += `_______________________________________________________________\n`;
        text += `_______________________________________________________________\n\n`;
      }
    });

    navigator.clipboard.writeText(text);
    notifyCopy("Fiche apprenant (Article + Questions) copiée !");
  };

  const handleCopyTeacherKey = () => {
    if (!result || !result.ceExam) return;
    const ce = result.ceExam;
    let text = `# CORRIGÉ OFFICIEL & BARÈME - COMPRÉHENSION ÉCRITE (${result.level})\n`;
    text += `**Thème :** ${result.theme} | **Total :** ${ce.totalPoints} points\n\n`;

    ce.questions.forEach((q, idx) => {
      text += `### Question ${idx + 1} (${q.points} pt${q.points > 1 ? "s" : ""}) - [${q.cognitiveDomain || "Compréhension"}]\n`;
      text += `**Énoncé :** ${q.question}\n\n`;
      if (q.type === "qcm" && q.options) {
        const correctIndex = q.correctAnswerIndex ?? 0;
        text += `**Bonne réponse :** ${q.options[correctIndex] || "Option correcte"}\n`;
      } else if (q.type === "vrai_faux") {
        text += `**Réponse attendue :** ${q.trueFalseAnswer ? "VRAI" : "FAUX"}\n`;
        text += `**Citation justificative exacte :** ${q.justificationText || "N/A"}\n`;
      } else if (q.type === "reponse_ouverte") {
        text += `**Exemple de réponse modèle :** ${q.sampleAnswer || "N/A"}\n`;
      }
      if (q.gradingCriteria) {
        text += `**Barème & critères :** ${q.gradingCriteria}\n`;
      }
      text += `\n---\n\n`;
    });

    navigator.clipboard.writeText(text);
    notifyCopy("Corrigé officiel et barème copiés !");
  };

  const handleDownloadSubject = () => {
    if (!result) return;
    let content = `# Épreuve FLE (${result.level}) : ${result.theme}\n\n`;
    content += `**Niveau CECRL :** ${result.level}\n`;
    content += `**Date de génération :** ${new Date().toLocaleDateString("fr-FR")}\n`;
    content += `**Source d'origine :** ${result.sourceArticle.mediaName} - [Consulter l'article original](${result.sourceArticle.url})\n\n`;

    if (result.ceExam) {
      const ce = result.ceExam;
      content += `## PARTIE 1 : TEXTE SUPPORT\n\n`;
      content += `### ${ce.articleTitle}\n`;
      content += `*${ce.articleSource}*\n\n`;
      content += `${ce.articleText}\n\n`;
      content += `---\n\n`;

      content += `## PARTIE 2 : QUESTIONNAIRE APPRENANT (${ce.totalPoints} points)\n\n`;
      content += `*${ce.generalInstructions}*\n\n`;
      ce.questions.forEach((q, idx) => {
        content += `### Question ${idx + 1} (${q.points} point${q.points > 1 ? "s" : ""})\n`;
        content += `${q.question}\n\n`;
        if (q.type === "qcm" && q.options) {
          q.options.forEach((opt) => {
            content += `- [ ] ${opt}\n`;
          });
          content += `\n`;
        } else if (q.type === "vrai_faux") {
          content += `- [ ] Vrai\n- [ ] Faux\n\n*Justification (recopiez la phrase du texte) :*\n> « _________________________________________________ »\n\n`;
        } else if (q.type === "reponse_ouverte") {
          content += `*Votre réponse :*\n> \n> \n\n`;
        }
      });

      content += `---\n\n`;
      content += `## PARTIE 3 : CORRIGÉ OFFICIEL & BARÈME D'ÉVALUATION\n\n`;
      ce.questions.forEach((q, idx) => {
        content += `### Question ${idx + 1} - Corrigé\n`;
        if (q.type === "qcm" && q.options) {
          const correctIdx = q.correctAnswerIndex ?? 0;
          content += `- **Réponse correcte :** ${q.options[correctIdx]}\n`;
        } else if (q.type === "vrai_faux") {
          content += `- **Choix :** ${q.trueFalseAnswer ? "VRAI" : "FAUX"}\n`;
          content += `- **Citation justificative :** ${q.justificationText}\n`;
        } else if (q.type === "reponse_ouverte") {
          content += `- **Réponse modèle attendue :** ${q.sampleAnswer}\n`;
        }
        if (q.gradingCriteria) {
          content += `- **Consignes de notation :** ${q.gradingCriteria}\n`;
        }
        content += `\n`;
      });
    } else {
      result.documents.forEach((doc, idx) => {
        if (result.documents.length > 1) {
          content += `## Document ${idx + 1} ${doc.viewpoint ? `(${doc.viewpoint})` : ""}\n\n`;
        }
        content += `### ${doc.title}\n`;
        content += `*${doc.source}*\n\n`;
        content += `${doc.body}\n\n`;
        content += `> Décompte de mots : ${doc.actualWordCount} mots (visé : ${doc.targetWordCount})\n\n`;
      });
    }

    const blob = new Blob([content], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const prefix = result.ceExam ? "Epreuve_CE" : "Sujet_PE";
    a.download = `${prefix}_${result.level}_${result.theme.slice(0, 25).replace(/[^a-z0-9]/gi, "_")}.md`;
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

  const minTolerance = useCustomRange ? minWords : Math.round(targetWordCount * 0.95);
  const maxTolerance = useCustomRange ? maxWords : Math.round(targetWordCount * 1.05);

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-8 gap-8 max-w-7xl mx-auto w-full print:p-0 print:max-w-none">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6 print:hidden">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
              <BookOpen className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span>Générateur CE/PE</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-bold tracking-normal flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> FLE
              </span>
            </h1>
          </div>
          <p className="text-sm text-slate-500 font-medium">
            Création d'épreuves journalistiques argumentatives pour la Compréhension Écrite (CE) et la Production Écrite (PE) B1 / B2 et C1.
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
        <div className="lg:col-span-5 space-y-6 print:hidden">
          <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm space-y-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-600" /> Paramètres de l'Épreuve
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
                {level === "B1" && "B1 : Lexique usuel, phrases directes, connecteurs logiques courants."}
                {level === "B2" && "B2 : Syntaxe complexe, nuances conceptuelles, confrontation d'arguments."}
                {level === "C1" && "C1 : Registre soutenu, implicite, rhétorique et perspective prospective."}
              </p>
            </div>

            {/* 3. Spécificité C1 : Sélecteur de nombre d'articles */}
            <AnimatePresence>
              {level === "C1" && !generateCe && (
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

            {/* 4. Longueur cible en mots & Intervalle */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-700">Longueur cible en mots {level === "C1" && articleCount > 1 && !generateCe ? "(par article)" : ""}</label>
                <span className="text-[11px] font-semibold text-slate-500">
                  {useCustomRange ? (
                    <>Intervalle : <span className="text-indigo-600 font-bold">{minWords} à {maxWords} mots</span></>
                  ) : (
                    <>Tolérance ±5% : <span className="text-indigo-600 font-bold">{minTolerance} - {maxTolerance} mots</span></>
                  )}
                </span>
              </div>

              {/* Paliers prédéfinis */}
              <div className="flex items-center gap-2">
                {[180, 200, 250, 300].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      setTargetWordCount(val);
                      setUseCustomRange(false);
                    }}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      !useCustomRange && targetWordCount === val
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
                  onChange={e => {
                    setTargetWordCount(Number(e.target.value));
                    setUseCustomRange(false);
                  }}
                  className="w-20 bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold text-center outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              {/* Possibilité de saisir un intervalle personnalisé */}
              <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useCustomRange}
                    onChange={e => setUseCustomRange(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-slate-700">Définir un intervalle personnalisé</span>
                </label>

                {useCustomRange && (
                  <div className="flex items-center gap-2 bg-indigo-50/50 p-3 rounded-2xl border border-indigo-100 animate-fadeIn">
                    <span className="text-xs font-medium text-slate-600">De</span>
                    <input
                      type="number"
                      min={30}
                      max={1200}
                      value={minWords}
                      onChange={e => setMinWords(Number(e.target.value))}
                      className="w-20 bg-white border border-slate-200 rounded-xl px-2 py-1.5 text-xs font-bold text-center outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                    <span className="text-xs font-medium text-slate-600">à</span>
                    <input
                      type="number"
                      min={30}
                      max={1500}
                      value={maxWords}
                      onChange={e => setMaxWords(Number(e.target.value))}
                      className="w-20 bg-white border border-slate-200 rounded-xl px-2 py-1.5 text-xs font-bold text-center outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                    <span className="text-xs font-bold text-indigo-900">mots</span>
                  </div>
                )}
              </div>
            </div>

            {/* 5. Mode de recherche */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-700 block">Mode de recherche de l'article source</label>
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
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Ou copier-coller le texte</label>
                    <textarea
                      rows={3}
                      value={manualText}
                      onChange={e => setManualText(e.target.value)}
                      placeholder="Collez ici le texte brut de l'article..."
                      className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs outline-none resize-y"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 6. SECTION CRÉATION DE CE (Compréhension Écrite) */}
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={generateCe}
                    onChange={e => setGenerateCe(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                  />
                  <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-indigo-600" />
                    Créer une épreuve de Compréhension Écrite (CE)
                  </span>
                </label>
                {generateCe && (
                  <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-md">
                    Article + Questions + Corrigé
                  </span>
                )}
              </div>

              <AnimatePresence>
                {generateCe && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-4 bg-indigo-50/60 p-4 rounded-2xl border border-indigo-100 overflow-hidden"
                  >
                    {/* Sélecteur Article original / Article adapté */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-indigo-950 block">Texte support du questionnaire</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setCeArticleMode("adapted")}
                          className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer text-left flex items-center gap-2 ${
                            ceArticleMode === "adapted"
                              ? "bg-white text-indigo-700 border-indigo-300 shadow-xs"
                              : "bg-white/60 text-slate-600 border-slate-200 hover:bg-white"
                          }`}
                        >
                          <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          <div>
                            <div className="font-bold">Article adapté</div>
                            <div className="text-[10px] text-slate-400 font-normal">Calibré FLE & longueur</div>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setCeArticleMode("original")}
                          className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer text-left flex items-center gap-2 ${
                            ceArticleMode === "original"
                              ? "bg-white text-indigo-700 border-indigo-300 shadow-xs"
                              : "bg-white/60 text-slate-600 border-slate-200 hover:bg-white"
                          }`}
                        >
                          <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <div>
                            <div className="font-bold">Article original</div>
                            <div className="text-[10px] text-slate-400 font-normal">Texte source brut épuré</div>
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* Nombre de questions et Total de points */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-indigo-950 block">Nombre de questions</label>
                        <input
                          type="number"
                          min={3}
                          max={15}
                          value={ceQuestionCount}
                          onChange={e => setCeQuestionCount(Math.min(15, Math.max(3, Number(e.target.value))))}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-indigo-950 block">Nombre total de points</label>
                        <input
                          type="number"
                          min={5}
                          max={50}
                          value={ceTotalPoints}
                          onChange={e => setCeTotalPoints(Math.max(5, Number(e.target.value)))}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                    </div>

                    {/* Types de questions (cases à cocher multiples) */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-indigo-950 block">Types de questions (au moins 1 requis)</label>
                      <div className="space-y-1.5">
                        {[
                          { id: "qcm" as QuestionType, label: "QCM", desc: "Choix multiples (3 options) avec 1 bonne réponse" },
                          { id: "vrai_faux" as QuestionType, label: "Vrai / Faux avec justification", desc: "Option binaire avec citation exacte du texte obligatoire" },
                          { id: "reponse_ouverte" as QuestionType, label: "Champ de réponse", desc: "Question ouverte demandant une réponse rédigée courte" }
                        ].map(item => {
                          const isChecked = ceQuestionTypes.includes(item.id);
                          return (
                            <label
                              key={item.id}
                              className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                                isChecked ? "bg-white border-indigo-200 shadow-xs" : "bg-white/40 border-transparent hover:bg-white/80"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  if (isChecked) {
                                    if (ceQuestionTypes.length > 1) {
                                      setCeQuestionTypes(ceQuestionTypes.filter(t => t !== item.id));
                                    }
                                  } else {
                                    setCeQuestionTypes([...ceQuestionTypes, item.id]);
                                  }
                                }}
                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 mt-0.5 cursor-pointer"
                              />
                              <div className="text-xs leading-snug">
                                <span className="font-bold text-slate-800">{item.label}</span>
                                <span className="text-[11px] text-slate-500 block">{item.desc}</span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
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
                  <span>{isGenerating ? "Création en cours..." : generateCe ? "Générer l'épreuve CE (Article + Questions + Corrigé)" : "Générer le sujet PE"}</span>
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

        {/* COLONNE DROITE : RÉSULTATS & PROGRESSION (Col 7) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Indicateur de chargement */}
          {isGenerating && (
            <div className="bg-white border border-indigo-100 rounded-3xl p-8 shadow-sm text-center space-y-4">
              <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
              <div className="space-y-1">
                <h4 className="font-bold text-slate-800 text-base">Traitement IA en cours...</h4>
                <p className="text-xs text-slate-500">{progressStep || "Génération et ajustement didactique..."}</p>
              </div>
            </div>
          )}

          {/* Candidats trouvés (Mode Assisté) */}
          {searchMode === "ASSISTED" && candidates.length > 0 && !result && !isGenerating && (
            <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Search className="w-4 h-4 text-indigo-600" /> Articles récents trouvés ({candidates.length})
                </h3>
                <span className="text-[11px] font-semibold text-slate-400">&lt; 9 mois</span>
              </div>

              <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                {candidates.map((cand, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl border border-slate-150 hover:border-indigo-300 hover:bg-indigo-50/20 transition-all space-y-2 group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                          {cand.mediaName}
                        </span>
                        <h4 className="font-bold text-sm text-slate-900 group-hover:text-indigo-600 transition-colors leading-snug">
                          {cand.title}
                        </h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleGenerate(cand)}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shrink-0 transition-all flex items-center gap-1 shadow-sm cursor-pointer"
                      >
                        <span>Choisir</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {cand.snippet && (
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                        {cand.snippet}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* RÉSULTAT DE L'ÉPREUVE (CE ou PE) */}
          {result && (
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
                    <h3 className="font-black text-slate-900 text-base">
                      {result.ceExam ? `Épreuve Complète de Compréhension Écrite (${result.level})` : `Sujet de Production Écrite (${result.level})`}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Thème : <strong className="text-slate-700">{result.theme}</strong>
                      {result.ceExam && (
                        <span className="ml-2 font-bold text-indigo-600">
                          • {result.ceExam.questionCount} questions ({result.ceExam.totalPoints} points)
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Bannière de repli si applicable */}
                {result.fallbackNotice && (
                  <span className="px-3 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-full text-xs font-bold flex items-center gap-1.5 print:hidden">
                    <Zap className="w-3 h-3 text-amber-600 fill-amber-500" />
                    <span>Repli : {result.modelUsed}</span>
                  </span>
                )}
              </div>

              {/* Si CE : Onglets Fiche Apprenant / Corrigé Enseignant / Vue Complète */}
              {result.ceExam && (
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-2xl border border-slate-200/60 print:hidden">
                  <button
                    type="button"
                    onClick={() => setCeViewTab("student")}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      ceViewTab === "student"
                        ? "bg-white text-indigo-700 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Fiche Apprenant (Article + Questions)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCeViewTab("teacher")}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      ceViewTab === "teacher"
                        ? "bg-white text-emerald-700 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Award className="w-3.5 h-3.5" />
                    <span>Corrigé & Barème Officiel</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCeViewTab("full")}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      ceViewTab === "full"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Vue Intégrale</span>
                  </button>
                </div>
              )}

              {/* Onglets multi-documents si C1 (mode PE) */}
              {!result.ceExam && result.documents.length > 1 && (
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

              {/* 1. TEXTE DE L'ARTICLE SUPPORT */}
              {(ceViewTab === "student" || ceViewTab === "full" || !result.ceExam) && (
                <div className="space-y-4 bg-slate-50/70 rounded-2xl p-6 border border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">
                      Document Support ({result.ceExam ? "Lecture" : `Texte déclencheur ${result.level}`})
                    </span>
                    {result.documents[activeDocTab] && (
                      <span className="text-xs font-bold text-slate-500">
                        {result.documents[activeDocTab].actualWordCount} mots
                      </span>
                    )}
                  </div>

                  <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight leading-snug">
                      {result.documents[activeDocTab]?.title || result.ceExam?.articleTitle}
                    </h2>
                    <p className="text-xs font-semibold text-slate-500 mt-1 italic flex items-center gap-1.5">
                      <span>{result.documents[activeDocTab]?.source || result.ceExam?.articleSource}</span>
                      {result.sourceArticle?.url && (
                        <a
                          href={result.sourceArticle.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline inline-flex items-center gap-0.5 ml-1 font-normal not-italic print:hidden"
                          title="Consulter l'article original"
                        >
                          <ExternalLink className="w-3 h-3" /> Source d'origine
                        </a>
                      )}
                    </p>
                  </div>

                  <div className="text-sm leading-relaxed text-slate-800 space-y-4 pt-2 border-t border-slate-200/60 whitespace-pre-line font-serif">
                    {result.documents[activeDocTab]?.body || result.ceExam?.articleText}
                  </div>
                </div>
              )}

              {/* 2. QUESTIONNAIRE CE : FICHE APPRENANT */}
              {result.ceExam && (ceViewTab === "student" || ceViewTab === "full") && (
                <div className="space-y-6 pt-4 border-t border-slate-100">
                  <div className="bg-indigo-50/80 p-4 rounded-2xl border border-indigo-100 flex items-start gap-3">
                    <HelpCircle className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wider">Consignes pour le candidat</h4>
                      <p className="text-xs text-indigo-900 mt-0.5 leading-relaxed">
                        {result.ceExam.generalInstructions}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-5">
                    {result.ceExam.questions.map((q, idx) => (
                      <div
                        key={q.id || idx}
                        className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="text-xs font-bold text-slate-700">Question {idx + 1}</span>
                            {q.cognitiveDomain && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 uppercase">
                                {q.cognitiveDomain}
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                            {q.points} point{q.points > 1 ? "s" : ""}
                          </span>
                        </div>

                        <p className="text-sm font-semibold text-slate-900 leading-snug">
                          {q.question}
                        </p>

                        {/* Format QCM */}
                        {q.type === "qcm" && q.options && (
                          <div className="space-y-2 pt-1">
                            {q.options.map((opt, oIdx) => (
                              <label
                                key={oIdx}
                                className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
                              >
                                <span className="w-4 h-4 rounded-full border-2 border-slate-300 flex items-center justify-center text-[10px] font-bold text-slate-500">
                                  {String.fromCharCode(65 + oIdx)}
                                </span>
                                <span className="text-xs text-slate-700 font-medium">{opt}</span>
                              </label>
                            ))}
                          </div>
                        )}

                        {/* Format Vrai / Faux */}
                        {q.type === "vrai_faux" && (
                          <div className="space-y-3 pt-1">
                            <div className="flex items-center gap-6 p-2 bg-slate-50 rounded-xl border border-slate-200/80">
                              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                                <input type="radio" name={`vf_${idx}`} className="w-4 h-4 text-indigo-600" />
                                <span>VRAI</span>
                              </label>
                              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                                <input type="radio" name={`vf_${idx}`} className="w-4 h-4 text-indigo-600" />
                                <span>FAUX</span>
                              </label>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[11px] font-semibold text-slate-500 block">
                                Justification : Recopiez la phrase du texte qui justifie votre réponse
                              </label>
                              <div className="w-full h-12 border-b-2 border-dotted border-slate-300 bg-slate-50/50 rounded-lg p-2 text-xs text-slate-400 italic">
                                « ... »
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Format Réponse Ouverte */}
                        {q.type === "reponse_ouverte" && (
                          <div className="space-y-1 pt-1">
                            <label className="text-[11px] font-semibold text-slate-500 block">Votre réponse rédigée :</label>
                            <div className="w-full h-16 border border-slate-200 rounded-xl bg-slate-50/40 p-3 text-xs text-slate-400">
                              Rédigez votre réponse ici...
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. CORRIGÉ ET BARÈME ENSEIGNANT */}
              {result.ceExam && (ceViewTab === "teacher" || ceViewTab === "full") && (
                <div className="space-y-6 pt-4 border-t border-slate-100">
                  <div className="bg-emerald-50/80 p-4 rounded-2xl border border-emerald-200 flex items-start gap-3">
                    <Award className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wider">Fiche Correcteur & Barème Officiel</h4>
                      <p className="text-xs text-emerald-900 mt-0.5 leading-relaxed">
                        Total de l'épreuve : <strong>{result.ceExam.totalPoints} points</strong>. Barème officiel avec critères d'acceptabilité et citations textuelles.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {result.ceExam.questions.map((q, idx) => (
                      <div
                        key={q.id || idx}
                        className="p-5 bg-white rounded-2xl border border-emerald-150 shadow-xs space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                          <span className="text-xs font-bold text-slate-800">
                            Question {idx + 1} • <span className="text-emerald-700 font-black">{q.points} pt{q.points > 1 ? "s" : ""}</span>
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 uppercase">
                            {q.type}
                          </span>
                        </div>

                        <p className="text-xs font-semibold text-slate-700">
                          {q.question}
                        </p>

                        {/* Réponse QCM */}
                        {q.type === "qcm" && q.options && (
                          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1.5">
                            <span className="text-[11px] font-bold text-emerald-950 uppercase block">Réponse attendue :</span>
                            <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
                              <Check className="w-4 h-4 text-emerald-600" />
                              <span>{q.options[q.correctAnswerIndex ?? 0]}</span>
                            </div>
                          </div>
                        )}

                        {/* Réponse Vrai/Faux */}
                        {q.type === "vrai_faux" && (
                          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2 text-xs">
                            <div className="flex items-center gap-2 font-bold text-emerald-950">
                              <span>Choix :</span>
                              <span className="px-2 py-0.5 rounded bg-emerald-200 text-emerald-950 uppercase">
                                {q.trueFalseAnswer ? "VRAI" : "FAUX"}
                              </span>
                            </div>
                            {q.justificationText && (
                              <div className="space-y-1">
                                <span className="text-[11px] font-bold text-emerald-950 uppercase block">Citation justificative exacte :</span>
                                <blockquote className="italic text-emerald-900 border-l-2 border-emerald-500 pl-2">
                                  {q.justificationText}
                                </blockquote>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Réponse Ouverte */}
                        {q.type === "reponse_ouverte" && q.sampleAnswer && (
                          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1.5 text-xs">
                            <span className="text-[11px] font-bold text-emerald-950 uppercase block">Réponse modèle attendue :</span>
                            <p className="text-emerald-900 leading-relaxed font-medium">
                              {q.sampleAnswer}
                            </p>
                          </div>
                        )}

                        {/* Barème et critères */}
                        {q.gradingCriteria && (
                          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600">
                            <strong>Critères d'attribution des points :</strong> {q.gradingCriteria}
                          </div>
                        )}
                      </div>
                    ))}
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
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100 print:hidden">
                <div className="flex flex-wrap items-center gap-2">
                  {result.ceExam ? (
                    <>
                      <button
                        type="button"
                        onClick={handleCopyStudentExam}
                        className="px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copier Sujet Élève</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleCopyTeacherKey}
                        className="px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <Award className="w-3.5 h-3.5" />
                        <span>Copier Corrigé & Barème</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleCopyDocument(result.documents[activeDocTab])}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copier le texte</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleDownloadSubject}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    title="Télécharger l'épreuve complète au format Markdown"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Télécharger (.md)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    title="Imprimer l'épreuve"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Imprimer</span>
                  </button>
                </div>

                {onUseAsSubject && (
                  <button
                    type="button"
                    onClick={handleTransferToCorrection}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-indigo-500/20 flex items-center gap-2 cursor-pointer"
                  >
                    <span>Utiliser comme sujet de correction</span>
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
                <BookOpen className="w-7 h-7" />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <h3 className="font-bold text-slate-800 text-base">Prêt à concevoir une épreuve FLE (CE ou PE)</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Indiquez un thème d'actualité, choisissez le niveau souhaité (B1, B2 ou C1) et configurez selon vos besoins :
                  sujet de Production Écrite ou épreuve complète de Compréhension Écrite (Article original ou adapté, Questionnaire équilibré et Corrigé avec barème officiel).
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
