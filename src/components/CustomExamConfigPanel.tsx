"use client";

import Aide from "@/components/Aide";
import React, { useState, useEffect } from "react";
import { 
  FileText, Settings2, Bookmark, Plus, RotateCcw, Check, Sliders, 
  HelpCircle, AlertCircle, BookOpen, Layers, Languages, ShieldAlert,
  GraduationCap, PenTool
} from "lucide-react";
import { ExamType, DictationPenaltyConfig, DEFAULT_DICTATION_PENALTIES } from "@/lib/customExamTypes";
import { CustomExamPreset, getSavedPresets, saveUserPreset, deleteUserPreset } from "@/lib/customPresets";
import { getCompositionCriteria, getCompositionTypeLabel } from "@/lib/compositionEngine";

interface Props {
  examType: ExamType;
  maxScore: number;
  onMaxScoreChange: (score: number) => void;

  // Dictée
  referenceText?: string;
  onReferenceTextChange?: (text: string) => void;
  dictationPenalties?: DictationPenaltyConfig;
  onDictationPenaltiesChange?: (penalties: DictationPenaltyConfig) => void;

  // Traduction
  sourceText?: string;
  onSourceTextChange?: (text: string) => void;
  modelTranslation?: string;
  onModelTranslationChange?: (text: string) => void;
  sourceLang?: string;
  onSourceLangChange?: (lang: string) => void;
  targetLang?: string;
  onTargetLangChange?: (lang: string) => void;

  // Grammaire
  exerciseSubject?: string;
  onExerciseSubjectChange?: (text: string) => void;
  answerKey?: string;
  onAnswerKeyChange?: (text: string) => void;

  // Interprétation
  sourceSpeech?: string;
  onSourceSpeechChange?: (text: string) => void;
  interpretationMode?: 'consecutive' | 'simultaneous';
  onInterpretationModeChange?: (mode: 'consecutive' | 'simultaneous') => void;

  // Composition
  compositionType?: 'essai' | 'redaction' | 'dissertation';
  onCompositionTypeChange?: (type: 'essai' | 'redaction' | 'dissertation') => void;
  compositionLanguage?: string;
  onCompositionLanguageChange?: (lang: string) => void;
  corpusText?: string;
  onCorpusTextChange?: (text: string) => void;
  compositionSubject?: string;
  onCompositionSubjectChange?: (subject: string) => void;
  disableStandardGrid?: boolean;
  onDisableStandardGridChange?: (disabled: boolean) => void;

  // Consignes générales
  customInstructions?: string;
  onCustomInstructionsChange?: (text: string) => void;
}

export default function CustomExamConfigPanel({
  examType,
  maxScore,
  onMaxScoreChange,
  referenceText = "",
  onReferenceTextChange,
  dictationPenalties = DEFAULT_DICTATION_PENALTIES,
  onDictationPenaltiesChange,
  sourceText = "",
  onSourceTextChange,
  modelTranslation = "",
  onModelTranslationChange,
  sourceLang = "Français",
  onSourceLangChange,
  targetLang = "Français",
  onTargetLangChange,
  exerciseSubject = "",
  onExerciseSubjectChange,
  answerKey = "",
  onAnswerKeyChange,
  sourceSpeech = "",
  onSourceSpeechChange,
  interpretationMode = 'consecutive',
  onInterpretationModeChange,
  compositionType = 'essai',
  onCompositionTypeChange,
  compositionLanguage = "Français",
  onCompositionLanguageChange,
  corpusText = "",
  onCorpusTextChange,
  compositionSubject = "",
  onCompositionSubjectChange,
  disableStandardGrid = false,
  onDisableStandardGridChange,
  customInstructions = "",
  onCustomInstructionsChange
}: Props) {
  const [presets, setPresets] = useState<CustomExamPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");

  useEffect(() => {
    setPresets(getSavedPresets().filter(p => p.examType === examType));
  }, [examType]);

  const handleApplyPreset = (preset: CustomExamPreset) => {
    setSelectedPresetId(preset.id);
    // Toutes les valeurs du modèle sont appliquées (y compris les textes vides) :
    // un modèle ne doit pas se mélanger avec les réglages précédents.
    if (preset.config.maxScore !== undefined) onMaxScoreChange(preset.config.maxScore);
    if (preset.config.dictationPenalties && onDictationPenaltiesChange) {
      onDictationPenaltiesChange(preset.config.dictationPenalties);
    }
    if (preset.config.sourceLanguage !== undefined && onSourceLangChange) onSourceLangChange(preset.config.sourceLanguage);
    if (preset.config.targetLanguage !== undefined && onTargetLangChange) onTargetLangChange(preset.config.targetLanguage);
    if (preset.config.interpretationMode && onInterpretationModeChange) {
      onInterpretationModeChange(preset.config.interpretationMode);
    }
    if (preset.config.compositionType && onCompositionTypeChange) {
      onCompositionTypeChange(preset.config.compositionType);
    }
    if (onCorpusTextChange) {
      onCorpusTextChange(preset.config.corpusText ?? "");
    }
    if (preset.config.disableStandardGrid !== undefined && onDisableStandardGridChange) {
      onDisableStandardGridChange(preset.config.disableStandardGrid);
    }
    if (preset.config.targetLanguage !== undefined && onCompositionLanguageChange) {
      onCompositionLanguageChange(preset.config.targetLanguage);
    }
    if (onCustomInstructionsChange) {
      onCustomInstructionsChange(preset.config.customInstructions ?? "");
    }
    if (onReferenceTextChange) onReferenceTextChange(preset.config.referenceText ?? "");
    if (onModelTranslationChange) onModelTranslationChange(preset.config.modelTranslation ?? "");
  };

  const handleSavePreset = () => {
    if (!newPresetName.trim()) return;
    saveUserPreset({
      name: newPresetName.trim(),
      examType,
      config: {
        maxScore,
        dictationPenalties: examType === 'dictee' ? dictationPenalties : undefined,
        sourceLanguage: sourceLang,
        targetLanguage: examType === 'composition' ? compositionLanguage : targetLang,
        interpretationMode: examType === 'interpretation' ? interpretationMode : undefined,
        compositionType: examType === 'composition' ? compositionType : undefined,
        corpusText: examType === 'composition' ? corpusText : undefined,
        disableStandardGrid: examType === 'composition' ? disableStandardGrid : undefined,
        customInstructions,
        referenceText: examType === 'dictee' ? referenceText : undefined,
        modelTranslation: examType === 'traduction' ? modelTranslation : undefined,
      }
    });
    setNewPresetName("");
    setIsSavingPreset(false);
    setPresets(getSavedPresets().filter(p => p.examType === examType));
  };

  const handleDeletePreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Supprimer ce modèle personnalisé ?")) {
      deleteUserPreset(id);
      setPresets(getSavedPresets().filter(p => p.examType === examType));
      if (selectedPresetId === id) setSelectedPresetId("");
    }
  };

  return (
    <div className="bg-gradient-to-br from-slate-50 to-indigo-50/30 border border-indigo-100 rounded-2xl p-5 mb-6 shadow-sm">
      {/* Top Header : Title + Preset selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-indigo-100/70 mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              Paramètres de l'épreuve : <span className="text-indigo-600 font-extrabold capitalize">{examType}</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              Définissez votre grille, vos pénalités et les critères spécifiques ci-dessous.
            </p>
          </div>
        </div>

        {/* Presets bar */}
        <div className="flex items-center gap-2">
          {presets.length > 0 && (
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs">
              <Bookmark className="w-3.5 h-3.5 text-indigo-500" />
              <select
                value={selectedPresetId}
                onChange={(e) => {
                  const p = presets.find(x => x.id === e.target.value);
                  if (p) handleApplyPreset(p);
                }}
                className="bg-transparent font-semibold text-slate-700 outline-none text-xs cursor-pointer"
              >
                <option value="">Charger un modèle...</option>
                {presets.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.id.startsWith('preset-user-') ? '★' : ''}
                  </option>
                ))}
              </select>
              <Aide cle="c_cfgCharger" taille={13} />
            </div>
          )}

          {isSavingPreset ? (
            <div className="flex items-center gap-1.5 bg-white border border-indigo-300 rounded-xl px-2 py-1">
              <input
                type="text"
                placeholder="Nom du modèle..."
                value={newPresetName}
                onChange={e => setNewPresetName(e.target.value)}
                className="text-xs outline-none w-32 font-medium"
                autoFocus
              />
              <button 
                onClick={handleSavePreset}
                className="text-indigo-600 hover:text-indigo-800 p-0.5 rounded cursor-pointer"
                title="Enregistrer"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => setIsSavingPreset(false)}
                className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                title="Annuler (ne pas enregistrer)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsSavingPreset(true)}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-indigo-200 hover:border-indigo-300 bg-white hover:bg-indigo-50/50 text-indigo-700 flex items-center gap-1 transition-all cursor-pointer"
              title="Enregistrer les réglages actuels comme modèle réutilisable"
            >
              <Plus className="w-3 h-3" />
              Enregistrer modèle
            </button>
          )}
          <Aide cle="c_cfgEnregistrer" taille={14} />
        </div>
      </div>

      {/* Main Form Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* === SECTION DICTÉE === */}
        {examType === 'dictee' && (
          <>
            <div className="space-y-4 md:col-span-2">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-600" />
                    Texte officiel de la dictée (Texte de référence)
                    <span className="text-rose-500">*</span>
                    <Aide cle="c_cfgTexteDictee" taille={13} />
                  </label>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {referenceText.trim().split(/\s+/).filter(Boolean).length} mots
                  </span>
                </div>
                <textarea
                  value={referenceText}
                  onChange={e => onReferenceTextChange?.(e.target.value)}
                  placeholder="Collez ici le texte officiel exact de la dictée que l'enseignant a lu aux apprenants..."
                  className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs leading-relaxed h-28 focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none font-serif text-slate-800"
                />
              </div>

              {/* Barème & Pénalités */}
              <div className="bg-white/80 border border-indigo-100/80 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Settings2 className="w-3.5 h-3.5 text-indigo-600" />
                    Barème des pénalités arithmétiques
                  </span>
                  <Aide cle="c_cfgPenalites" taille={13} />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-600 font-medium">Note de départ :</span>
                    <Aide cle="c_cfgNoteDepart" taille={13} />
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={maxScore}
                      onChange={e => onMaxScoreChange(Number(e.target.value) || 10)}
                      className="w-16 px-2 py-0.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-indigo-700 text-center"
                    />
                    <span className="text-xs font-bold text-slate-500">pts</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
                  <div className="space-y-1 bg-slate-50/70 p-2.5 rounded-lg border border-slate-200/60">
                    <span className="text-[11px] font-semibold text-slate-700 block">Grammaire / Accord</span>
                    <div className="flex items-center gap-1">
                      <span className="text-rose-600 font-bold">-</span>
                      <input
                        type="number"
                        step={0.25}
                        min={0}
                        value={dictationPenalties.grammar}
                        onChange={e => onDictationPenaltiesChange?.({ ...dictationPenalties, grammar: Number(e.target.value) || 0 })}
                        className="w-full px-1.5 py-0.5 bg-white border border-slate-200 rounded text-xs font-bold text-slate-800 text-center"
                      />
                      <span className="text-[10px] text-slate-400">pt</span>
                    </div>
                  </div>

                  <div className="space-y-1 bg-slate-50/70 p-2.5 rounded-lg border border-slate-200/60">
                    <span className="text-[11px] font-semibold text-slate-700 block">Usage / Vocabulaire</span>
                    <div className="flex items-center gap-1">
                      <span className="text-rose-600 font-bold">-</span>
                      <input
                        type="number"
                        step={0.25}
                        min={0}
                        value={dictationPenalties.usage}
                        onChange={e => onDictationPenaltiesChange?.({ ...dictationPenalties, usage: Number(e.target.value) || 0 })}
                        className="w-full px-1.5 py-0.5 bg-white border border-slate-200 rounded text-xs font-bold text-slate-800 text-center"
                      />
                      <span className="text-[10px] text-slate-400">pt</span>
                    </div>
                  </div>

                  <div className="space-y-1 bg-slate-50/70 p-2.5 rounded-lg border border-slate-200/60">
                    <span className="text-[11px] font-semibold text-slate-700 block">Accent / Cédille</span>
                    <div className="flex items-center gap-1">
                      <span className="text-rose-600 font-bold">-</span>
                      <input
                        type="number"
                        step={0.25}
                        min={0}
                        value={dictationPenalties.accent}
                        onChange={e => onDictationPenaltiesChange?.({ ...dictationPenalties, accent: Number(e.target.value) || 0 })}
                        className="w-full px-1.5 py-0.5 bg-white border border-slate-200 rounded text-xs font-bold text-slate-800 text-center"
                      />
                      <span className="text-[10px] text-slate-400">pt</span>
                    </div>
                  </div>

                  <div className="space-y-1 bg-slate-50/70 p-2.5 rounded-lg border border-slate-200/60">
                    <span className="text-[11px] font-semibold text-slate-700 block">Ponctuation / Maj.</span>
                    <div className="flex items-center gap-1">
                      <span className="text-rose-600 font-bold">-</span>
                      <input
                        type="number"
                        step={0.25}
                        min={0}
                        value={dictationPenalties.punctuation}
                        onChange={e => onDictationPenaltiesChange?.({ ...dictationPenalties, punctuation: Number(e.target.value) || 0 })}
                        className="w-full px-1.5 py-0.5 bg-white border border-slate-200 rounded text-xs font-bold text-slate-800 text-center"
                      />
                      <span className="text-[10px] text-slate-400">pt</span>
                    </div>
                  </div>

                  <div className="space-y-1 bg-slate-50/70 p-2.5 rounded-lg border border-slate-200/60">
                    <span className="text-[11px] font-semibold text-slate-700 block">Mot manquant / Ajouté</span>
                    <div className="flex items-center gap-1">
                      <span className="text-rose-600 font-bold">-</span>
                      <input
                        type="number"
                        step={0.25}
                        min={0}
                        value={dictationPenalties.omissionWord}
                        onChange={e => onDictationPenaltiesChange?.({ ...dictationPenalties, omissionWord: Number(e.target.value) || 0 })}
                        className="w-full px-1.5 py-0.5 bg-white border border-slate-200 rounded text-xs font-bold text-slate-800 text-center"
                      />
                      <span className="text-[10px] text-slate-400">pt</span>
                    </div>
                  </div>
                </div>

                {/* Options arithmétiques */}
                <div className="flex flex-wrap items-center gap-5 pt-2 border-t border-slate-100 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-slate-700 font-medium">
                    <input
                      type="checkbox"
                      checked={dictationPenalties.countRepeatedOnce}
                      onChange={e => onDictationPenaltiesChange?.({ ...dictationPenalties, countRepeatedOnce: e.target.checked })}
                      className="rounded text-indigo-600 border-slate-300 focus:ring-indigo-500/20"
                    />
                    <span>Ne pénaliser qu'une seule fois la même faute répétée</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none text-slate-700 font-medium">
                    <input
                      type="checkbox"
                      checked={dictationPenalties.allowNegative}
                      onChange={e => onDictationPenaltiesChange?.({ ...dictationPenalties, allowNegative: e.target.checked })}
                      className="rounded text-indigo-600 border-slate-300 focus:ring-indigo-500/20"
                    />
                    <span>Autoriser une note finale négative (sans plancher à 0)</span>
                    <Aide cle="c_cfgOptionsNote" taille={13} />
                  </label>
                </div>
              </div>
            </div>
          </>
        )}

        {/* === SECTION TRADUCTION === */}
        {examType === 'traduction' && (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                Texte source original <span className="text-rose-500">*</span>
                <Aide cle="c_cfgTexteSource" taille={13} />
              </label>
              <textarea
                value={sourceText}
                onChange={e => onSourceTextChange?.(e.target.value)}
                placeholder="Collez ici le texte d'origine dans la langue de départ..."
                className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs h-32 focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none font-serif text-slate-800"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                Traduction de référence (optionnel)
              </label>
              <textarea
                value={modelTranslation}
                onChange={e => onModelTranslationChange?.(e.target.value)}
                placeholder="Traduction modèle ou corrigé type pour orienter l'évaluation (optionnel)..."
                className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs h-32 focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none font-serif text-slate-800"
              />
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs md:col-span-2 bg-white/70 p-3 rounded-xl border border-slate-200/60">
              <div className="flex items-center gap-1.5">
                <Languages className="w-3.5 h-3.5 text-indigo-600" />
                <span className="font-semibold text-slate-700">Langues :</span>
                <Aide cle="c_cfgLangues" taille={13} />
                <input
                  type="text"
                  value={sourceLang}
                  onChange={e => onSourceLangChange?.(e.target.value)}
                  placeholder="Source (ex: Français)"
                  className="px-2 py-1 bg-white border border-slate-200 rounded-lg w-28 font-medium"
                />
                <span className="text-slate-400">➔</span>
                <input
                  type="text"
                  value={targetLang}
                  onChange={e => onTargetLangChange?.(e.target.value)}
                  placeholder="Cible (ex: Français)"
                  className="px-2 py-1 bg-white border border-slate-200 rounded-lg w-28 font-medium"
                />
              </div>

              <div className="flex items-center gap-1.5 ml-auto">
                <span className="font-semibold text-slate-700">Note maximale :</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={maxScore}
                  onChange={e => onMaxScoreChange(Number(e.target.value) || 10)}
                  className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg font-bold text-indigo-700 text-center"
                />
                <span className="font-bold text-slate-500">pts</span>
              </div>
            </div>
          </>
        )}

        {/* === SECTION GRAMMAIRE === */}
        {examType === 'grammaire' && (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-600" />
                Énoncé des exercices / Questions <span className="text-rose-500">*</span>
                <Aide cle="c_cfgEnonce" taille={13} />
              </label>
              <textarea
                value={exerciseSubject}
                onChange={e => onExerciseSubjectChange?.(e.target.value)}
                placeholder="Ex : Question 1 : Mettez au subjonctif... / Question 2 : Transformez au passif..."
                className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs h-32 focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none font-sans text-slate-800"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                Corrigé officiel & Barème par item <span className="text-rose-500">*</span>
                <Aide cle="c_cfgCorrige" taille={13} />
              </label>
              <textarea
                value={answerKey}
                onChange={e => onAnswerKeyChange?.(e.target.value)}
                placeholder="Ex : Q1 : 'qu'il vienne' (2 pts) / Q2 : 'La porte a été fermée' (2 pts)..."
                className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs h-32 focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none font-sans text-slate-800"
              />
            </div>

            <div className="flex items-center justify-between text-xs md:col-span-2 bg-white/70 p-3 rounded-xl border border-slate-200/60">
              <span className="text-slate-500 text-[11px]">
                Le système évalue question par question et calcule la note de façon arithmétique.
              </span>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-700">Note totale :</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={maxScore}
                  onChange={e => onMaxScoreChange(Number(e.target.value) || 10)}
                  className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg font-bold text-indigo-700 text-center"
                />
                <span className="font-bold text-slate-500">pts</span>
              </div>
            </div>
          </>
        )}

        {/* === SECTION INTERPRÉTATION === */}
        {examType === 'interpretation' && (
          <>
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-indigo-600" />
                Discours source original (Texte ou transcription du discours prononcé) <span className="text-rose-500">*</span>
                <Aide cle="c_cfgEnonce" taille={13} />
              </label>
              <textarea
                value={sourceSpeech}
                onChange={e => onSourceSpeechChange?.(e.target.value)}
                placeholder="Collez ici le discours original auquel l'interprète devait répondre..."
                className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs h-28 focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none font-sans text-slate-800"
              />
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs md:col-span-2 bg-white/70 p-3 rounded-xl border border-slate-200/60">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-700">Modalité :</span>
                <Aide cle="c_cfgModalite" taille={13} />
                <div className="flex p-0.5 bg-slate-100 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => onInterpretationModeChange?.('consecutive')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                      interpretationMode === 'consecutive' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-indigo-600'
                    }`}
                  >
                    Consécutive
                  </button>
                  <button
                    type="button"
                    onClick={() => onInterpretationModeChange?.('simultaneous')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                      interpretationMode === 'simultaneous' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-indigo-600'
                    }`}
                  >
                    Simultanée
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-700">Langues :</span>
                <input
                  type="text"
                  value={sourceLang}
                  onChange={e => onSourceLangChange?.(e.target.value)}
                  placeholder="Source (ex: Français)"
                  className="px-2 py-0.5 bg-white border border-slate-200 rounded-lg w-24 text-xs font-medium"
                />
                <span className="text-slate-400">➔</span>
                <input
                  type="text"
                  value={targetLang}
                  onChange={e => onTargetLangChange?.(e.target.value)}
                  placeholder="Cible (ex: Français)"
                  className="px-2 py-0.5 bg-white border border-slate-200 rounded-lg w-24 text-xs font-medium"
                />
              </div>

              <div className="flex items-center gap-1.5 ml-auto">
                <span className="font-semibold text-slate-700">Note maximale :</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={maxScore}
                  onChange={e => onMaxScoreChange(Number(e.target.value) || 10)}
                  className="w-16 px-2 py-0.5 bg-white border border-slate-200 rounded-lg font-bold text-indigo-700 text-center"
                />
                <span className="font-bold text-slate-500">pts</span>
              </div>
            </div>
          </>
        )}

        {/* === SECTION COMPOSITION === */}
        {examType === 'composition' && (
          <>
            {/* Choix du sous-type de composition */}
            <div className="md:col-span-2 space-y-2">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <PenTool className="w-3.5 h-3.5 text-indigo-600" />
                Type de composition à évaluer :
                <Aide cle="c_cfgTypeComposition" taille={13} />
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => onCompositionTypeChange?.('essai')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    compositionType === 'essai'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-500/30'
                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  <div className="font-bold text-xs flex items-center gap-1.5">
                    <span>✍️</span> Essai argumenté
                  </div>
                  <div className={`text-[10px] mt-1 ${compositionType === 'essai' ? 'text-indigo-100' : 'text-slate-500'}`}>
                    En langue étrangère (FLE ou langue vivante)
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => onCompositionTypeChange?.('redaction')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    compositionType === 'redaction'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-500/30'
                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  <div className="font-bold text-xs flex items-center gap-1.5">
                    <span>📖</span> Rédaction
                  </div>
                  <div className={`text-[10px] mt-1 ${compositionType === 'redaction' ? 'text-indigo-100' : 'text-slate-500'}`}>
                    Niveau collège français (DNB / cycle 4)
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => onCompositionTypeChange?.('dissertation')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    compositionType === 'dissertation'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-500/30'
                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  <div className="font-bold text-xs flex items-center gap-1.5">
                    <span>🏛️</span> Dissertation
                  </div>
                  <div className={`text-[10px] mt-1 ${compositionType === 'dissertation' ? 'text-indigo-100' : 'text-slate-500'}`}>
                    Niveau lycée français (Baccalauréat / EAF)
                  </div>
                </button>
              </div>
            </div>

            {/* Sujet de la composition */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-indigo-600" />
                Sujet / Énoncé de la composition <span className="text-rose-500">*</span>
                <Aide cle="c_cfgEnonce" taille={13} />
              </label>
              <textarea
                value={compositionSubject}
                onChange={e => onCompositionSubjectChange?.(e.target.value)}
                placeholder="Ex : « Selon vous, la littérature a-t-elle pour rôle de dénoncer les travers de la société ? Vous répondrez en vous appuyant sur vos lectures... »"
                className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs h-32 focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none font-sans text-slate-800"
              />
            </div>

            {/* Texte support ou Corpus documentaire */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                Texte support ou corpus documentaire (optionnel)
              </label>
              <textarea
                value={corpusText}
                onChange={e => onCorpusTextChange?.(e.target.value)}
                placeholder="Collez ici les textes d'appui, citations clés ou documents déclencheurs éventuels..."
                className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs h-32 focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none font-serif text-slate-800"
              />
            </div>

            {/* Barre de contrôle : Langue cible (si essai) + Note maximale */}
            <div className="flex flex-wrap items-center gap-4 text-xs md:col-span-2 bg-white/70 p-3 rounded-xl border border-slate-200/60">
              {compositionType === 'essai' ? (
                <div className="flex items-center gap-2">
                  <Languages className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="font-semibold text-slate-700">Langue de rédaction :</span>
                  <input
                    type="text"
                    value={compositionLanguage}
                    onChange={e => onCompositionLanguageChange?.(e.target.value)}
                    placeholder="ex: Français (FLE), Anglais..."
                    className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg w-44 text-xs font-medium text-slate-800"
                  />
                  <span className="text-[11px] text-slate-400 italic">(Défaut : Français)</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-slate-500 text-[11px]">
                  <span>Langue d'évaluation : <strong>Français</strong></span>
                </div>
              )}

              <div className="flex items-center gap-1.5 ml-auto">
                <span className="font-semibold text-slate-700">Note maximale :</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={maxScore}
                  onChange={e => onMaxScoreChange(Number(e.target.value) || 20)}
                  className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg font-bold text-indigo-700 text-center"
                />
                <span className="font-bold text-slate-500">pts</span>
              </div>
            </div>

            {/* Option de remplacement de la grille officielle */}
            <div className="md:col-span-2 bg-white/90 p-3.5 rounded-xl border border-slate-200 space-y-2.5">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={disableStandardGrid}
                  onChange={e => onDisableStandardGridChange?.(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                />
                <div>
                  <span className="text-xs font-bold text-slate-800">
                    Désactiver la grille de critères officielle et utiliser mes propres critères rédigés
                  </span>
                  <Aide cle="c_cfgGrilleLibre" taille={13} />
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    Remplace la grille standard ({getCompositionTypeLabel(compositionType)}) par votre barème ou vos critères personnalisés rédigés ci-dessous.
                  </p>
                </div>
              </label>

              {disableStandardGrid && (
                <div className="p-3 bg-amber-50/90 border border-amber-200/80 rounded-xl text-amber-900 text-xs flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-bold">⚠️ Avertissement sur la fiabilité de la notation libre :</span>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      L'évaluation par critères libres repose sur l'interprétation de texte libre par l'IA sans ancrage dans une grille normée (DELF / DNB / Baccalauréat). Ce procédé peut entraîner une plus grande variabilité et une moindre reproductibilité dans l'attribution des points. Pour une meilleure précision, formulez des critères détaillés avec la répartition exacte des points souhaitée.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Aperçu des critères retenus pour le type de composition */}
            <div className={`md:col-span-2 p-3.5 rounded-xl border transition-all ${
              disableStandardGrid 
                ? 'bg-slate-100/70 border-slate-200/60 opacity-60' 
                : 'bg-slate-50/80 border-slate-200/80'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                  {disableStandardGrid 
                    ? `Grille standard non retenue (${getCompositionTypeLabel(compositionType)}) :` 
                    : `Grille de critères appliquée (${getCompositionTypeLabel(compositionType)} — ${maxScore} pts) :`}
                </span>
                {disableStandardGrid && (
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                    Désactivée (remplacée par vos critères)
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {getCompositionCriteria(compositionType, maxScore).map(crit => (
                  <div key={crit.key} className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs shadow-2xs">
                    <div className="flex items-center justify-between font-bold text-slate-800 mb-1">
                      <span>{crit.label}</span>
                      <span className="text-indigo-600 text-[11px] bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                        /{crit.maxScore}
                      </span>
                    </div>
                    {crit.description && (
                      <p className="text-[10px] text-slate-500 leading-snug">{crit.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Consignes personnalisées supplémentaires ou Barème libre */}
        {examType !== 'dictee' && (
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
              {examType === 'composition' && disableStandardGrid ? (
                <>
                  <span>Barème et critères d'évaluation rédigés</span>
                  <span className="text-rose-500 font-bold">* (Obligatoire en mode libre)</span>
                </>
              ) : (
                <span>Consignes spécifiques ou critères de correction rédigés (optionnel)</span>
              )}
              <Aide cle="c_cfgConsignes" taille={13} />
            </label>
            {examType === 'composition' && disableStandardGrid ? (
              <textarea
                value={customInstructions}
                onChange={e => onCustomInstructionsChange?.(e.target.value)}
                placeholder={"Rédigez ici vos critères et barème précis...\nExemple :\n1. Compréhension du sujet et problématisation (5 pts) : ...\n2. Richesse argumentative et exemples (8 pts) : ...\n3. Qualité de la langue et syntaxe (7 pts) : ..."}
                className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs h-28 focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none font-sans text-slate-800"
              />
            ) : (
              <input
                type="text"
                value={customInstructions}
                onChange={e => onCustomInstructionsChange?.(e.target.value)}
                placeholder="Ex : Pénaliser particulièrement les faux-sens et le non-respect du vouvoiement..."
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500/20 outline-none text-slate-700"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
