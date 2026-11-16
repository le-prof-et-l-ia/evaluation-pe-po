"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle, AlertCircle, Plus, Trash2 } from "lucide-react";
import type { CeQuestion, QuestionType, SubjectGenerationResult } from "@/lib/subjectGeneratorService";
import { bornesLongueur } from "@/lib/subjectGeneratorService";
import {
  modifierDocument,
  modifierConsignesCe,
  modifierQuestion,
  supprimerQuestion,
  deplacerQuestion,
  ajouterQuestion,
} from "@/lib/generateurs/edition";

interface Props {
  result: SubjectGenerationResult;
  onChange: (result: SubjectGenerationResult) => void;
}

const LIBELLES_TYPES: Record<QuestionType, string> = {
  qcm: "QCM",
  vrai_faux: "Vrai / Faux avec justification",
  reponse_ouverte: "Réponse ouverte",
};

const DOMAINES: { id: NonNullable<CeQuestion["cognitiveDomain"]>; label: string }[] = [
  { id: "globale", label: "Compréhension globale" },
  { id: "detaillee", label: "Compréhension détaillée" },
  { id: "implicite", label: "Implicite" },
  { id: "lexique", label: "Lexique" },
];

const champ = "w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400";
const etiquette = "text-[11px] font-bold text-slate-500 uppercase tracking-wide block mb-1";

/** Formulaire de modification du sujet généré (textes, questionnaire et corrigé). */
export default function EditeurSujet({ result, onChange }: Props) {
  const [typeAjout, setTypeAjout] = useState<QuestionType>("reponse_ouverte");
  const { min, max } = bornesLongueur(result.targetWordCount, result.minWordCount, result.maxWordCount);
  const ce = result.ceExam;

  return (
    <div className="space-y-6">
      {/* Textes */}
      {result.documents.map((doc, idx) => (
        <div key={idx} className="space-y-3 bg-slate-50/70 rounded-2xl p-5 border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">
              {result.documents.length > 1 ? `Document ${idx + 1}` : ce ? "Texte support" : "Texte déclencheur"}
            </span>
            <span
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 ${
                doc.toleranceMet ? "bg-emerald-100/80 text-emerald-900" : "bg-amber-100/80 text-amber-900"
              }`}
            >
              {doc.toleranceMet ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              {doc.actualWordCount} mots{doc.texteOriginal ? " (texte original)" : ` — visé : ${min} à ${max}`}
            </span>
          </div>
          <div>
            <label className={etiquette}>Titre</label>
            <input className={`${champ} font-bold`} value={doc.title} onChange={e => onChange(modifierDocument(result, idx, { title: e.target.value }))} />
          </div>
          <div>
            <label className={etiquette}>Source</label>
            <input className={`${champ} italic`} value={doc.source} onChange={e => onChange(modifierDocument(result, idx, { source: e.target.value }))} />
          </div>
          <div>
            <label className={etiquette}>Texte (séparez les paragraphes par une ligne vide)</label>
            <textarea
              className={`${champ} font-serif leading-relaxed resize-y`}
              rows={14}
              value={doc.body}
              onChange={e => onChange(modifierDocument(result, idx, { body: e.target.value }))}
            />
          </div>
        </div>
      ))}

      {/* Questionnaire CE et corrigé */}
      {ce && (
        <div className="space-y-4">
          <div className="bg-indigo-50/70 rounded-2xl p-5 border border-indigo-100 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-indigo-950 uppercase tracking-wider">Consignes pour le candidat</label>
              <span className="text-xs font-black text-indigo-700">
                {ce.questionCount} question{ce.questionCount > 1 ? "s" : ""} — total : {ce.totalPoints} point{ce.totalPoints > 1 ? "s" : ""}
              </span>
            </div>
            <textarea
              className={`${champ} resize-y`}
              rows={2}
              value={ce.generalInstructions || ""}
              onChange={e => onChange(modifierConsignesCe(result, e.target.value))}
            />
          </div>

          {ce.questions.map((q, idx) => {
            const maj = (champs: Partial<CeQuestion>) => onChange(modifierQuestion(result, idx, champs));
            return (
              <div key={idx} className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center">{idx + 1}</span>
                    <span className="text-xs font-bold text-slate-700">{LIBELLES_TYPES[q.type]}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={q.cognitiveDomain || "detaillee"}
                      onChange={e => maj({ cognitiveDomain: e.target.value as CeQuestion["cognitiveDomain"] })}
                      className="text-[11px] bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 outline-none"
                      title="Dimension évaluée"
                    >
                      {DOMAINES.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                    </select>
                    <label className="flex items-center gap-1 text-[11px] font-bold text-slate-600">
                      <input
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={q.points}
                        onChange={e => maj({ points: Math.max(0, Number(e.target.value) || 0) })}
                        className="w-16 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-center outline-none"
                      />
                      pt(s)
                    </label>
                    <button type="button" onClick={() => onChange(deplacerQuestion(result, idx, -1))} disabled={idx === 0} className="p-1 rounded-lg hover:bg-slate-100 disabled:opacity-30" title="Monter">
                      <ArrowUp className="w-4 h-4 text-slate-500" />
                    </button>
                    <button type="button" onClick={() => onChange(deplacerQuestion(result, idx, 1))} disabled={idx === ce.questions.length - 1} className="p-1 rounded-lg hover:bg-slate-100 disabled:opacity-30" title="Descendre">
                      <ArrowDown className="w-4 h-4 text-slate-500" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Supprimer la question ${idx + 1} ?`)) onChange(supprimerQuestion(result, idx));
                      }}
                      className="p-1 rounded-lg hover:bg-rose-50"
                      title="Supprimer la question"
                    >
                      <Trash2 className="w-4 h-4 text-rose-500" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className={etiquette}>{q.type === "vrai_faux" ? "Affirmation" : "Énoncé"}</label>
                  <textarea className={`${champ} resize-y`} rows={2} value={q.question} onChange={e => maj({ question: e.target.value })} />
                </div>

                {q.type === "qcm" && (
                  <div className="space-y-2">
                    <label className={etiquette}>Options (cochez la bonne réponse)</label>
                    {(q.options || []).map((opt, oIdx) => (
                      <div key={oIdx} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`edit_qcm_${idx}`}
                          checked={(q.correctAnswerIndex ?? 0) === oIdx}
                          onChange={() => maj({ correctAnswerIndex: oIdx })}
                          className="w-4 h-4 text-emerald-600"
                          title="Bonne réponse"
                        />
                        <input
                          className={champ}
                          value={opt}
                          onChange={e => maj({ options: (q.options || []).map((o, i) => (i === oIdx ? e.target.value : o)) })}
                        />
                        <button
                          type="button"
                          disabled={(q.options || []).length <= 2}
                          onClick={() => {
                            const options = (q.options || []).filter((_, i) => i !== oIdx);
                            const bonne = q.correctAnswerIndex ?? 0;
                            maj({ options, correctAnswerIndex: bonne === oIdx ? 0 : bonne > oIdx ? bonne - 1 : bonne });
                          }}
                          className="p-1 rounded-lg hover:bg-rose-50 disabled:opacity-30"
                          title="Retirer cette option"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => maj({ options: [...(q.options || []), `${String.fromCharCode(65 + (q.options || []).length)}. `] })}
                      className="text-[11px] font-bold text-indigo-600 hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Ajouter une option
                    </button>
                  </div>
                )}

                {q.type === "vrai_faux" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-6 text-xs font-bold text-slate-700">
                      <span className={etiquette + " mb-0"}>Réponse attendue :</span>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name={`edit_vf_${idx}`} checked={q.trueFalseAnswer === true} onChange={() => maj({ trueFalseAnswer: true })} /> VRAI
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name={`edit_vf_${idx}`} checked={q.trueFalseAnswer === false} onChange={() => maj({ trueFalseAnswer: false })} /> FAUX
                      </label>
                    </div>
                    <div>
                      <label className={etiquette}>Citation justificative exacte</label>
                      <textarea className={`${champ} resize-y italic`} rows={2} value={q.justificationText || ""} onChange={e => maj({ justificationText: e.target.value })} />
                    </div>
                  </div>
                )}

                {q.type === "reponse_ouverte" && (
                  <div>
                    <label className={etiquette}>Réponse modèle attendue</label>
                    <textarea className={`${champ} resize-y`} rows={3} value={q.sampleAnswer || ""} onChange={e => maj({ sampleAnswer: e.target.value })} />
                  </div>
                )}

                <div>
                  <label className={etiquette}>Critères d&apos;attribution des points</label>
                  <textarea className={`${champ} resize-y text-xs`} rows={2} value={q.gradingCriteria || ""} onChange={e => maj({ gradingCriteria: e.target.value })} />
                </div>
              </div>
            );
          })}

          <div className="flex flex-wrap items-center gap-2 p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
            <select
              value={typeAjout}
              onChange={e => setTypeAjout(e.target.value as QuestionType)}
              className="text-xs bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none font-semibold text-slate-700"
            >
              {(Object.keys(LIBELLES_TYPES) as QuestionType[]).map(t => <option key={t} value={t}>{LIBELLES_TYPES[t]}</option>)}
            </select>
            <button
              type="button"
              onClick={() => onChange(ajouterQuestion(result, typeAjout))}
              className="px-4 py-2 bg-white border border-slate-200 hover:bg-indigo-50 hover:border-indigo-200 text-indigo-700 rounded-xl text-xs font-bold flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Ajouter une question
            </button>
            <span className="text-[11px] text-slate-500">Le total des points est recalculé à chaque modification.</span>
          </div>
        </div>
      )}
    </div>
  );
}
