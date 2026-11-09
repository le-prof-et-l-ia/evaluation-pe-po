"use client";

import { motion, AnimatePresence } from "framer-motion";
import { GitCompare, FileText, Zap } from "lucide-react";
import { formatScore } from "@/lib/scoreUtils";
import { getFriendlyModelName } from "@/lib/modelNames";
import { getCriteriaConfig } from "@/lib/promptUtils";
import Aide from "@/components/Aide";

interface ComparisonModalProps {
  /** Données de comparaison, ou `null` quand la modale est fermée. */
  comparisonModalData: any;
  /** Fermeture de la modale. */
  setComparisonModalData: (value: any) => void;
  level: string;
  /** Barème appliqué : influe sur l'affichage des notes. */
  gradingMode: "detailed" | "delf";
  /**
   * Bilan tel qu'il est affiché dans le rapport (notes retouchées comprises).
   * S'il est fourni, la « Note finale retenue » est celle du bilan ; sinon on
   * prend la dernière évaluation disponible (3e, sinon 2e, sinon 1re).
   */
  finalData?: { globalScore?: number; criteriaScores?: Record<string, number> } | null;
}

/**
 * Analyse comparative des deux évaluations (notes, écarts de feedback,
 * erreurs repérées par le second examinateur seulement).
 *
 * Extrait de `page.tsx` : du JSX purement présentationnel, qui ne dépend que
 * de trois valeurs.
 */
export default function ComparisonModal({
  comparisonModalData,
  setComparisonModalData,
  level,
  gradingMode,
  finalData,
}: ComparisonModalProps) {
  // Critères et barèmes réels de la grille (et non des valeurs codées en dur).
  const criteria = getCriteriaConfig(level);
  const maxGlobal: number =
    Number(comparisonModalData?.firstEval?.maxScore) ||
    criteria.reduce((somme, c) => somme + c.maxScore, 0);
  const noteFinaleGlobale = (): number | undefined =>
    finalData?.globalScore ??
    comparisonModalData?.thirdEval?.globalScore ??
    comparisonModalData?.secondEval?.globalScore ??
    comparisonModalData?.firstEval?.globalScore;

  return (
    <AnimatePresence>
      {comparisonModalData && (
        <motion.div 
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6"
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
                Analyse de la Double évaluation
                <Aide cle="c_cmpColonnes" taille={18} />
              </h3>
              <button onClick={() => setComparisonModalData(null)} className="p-2 border-2 border-slate-200 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-all font-bold">
                ✕
              </button>
            </div>
            
            <div className="overflow-y-auto pr-2 custom-scrollbar flex-1 space-y-6">
              <p className="text-xs text-slate-500">
                Barème appliqué : {gradingMode === "delf" ? "DELF officiel (notes 0, 1, 3 ou 5 par critère)" : "détaillé (au demi-point)"}, total sur {maxGlobal} points.
              </p>
              {/* TABLEAU DES NOTES */}
              <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-black">
                    <tr>
                      <th className="px-4 py-3">Critère</th>
                      <th className="px-4 py-3 text-center border-l border-slate-200 text-blue-700">Modèle INITIAL ({getFriendlyModelName(comparisonModalData.firstProvider).toUpperCase()})</th>
                      <th className="px-4 py-3 text-center border-l border-slate-200 text-purple-700">DOUBLE ÉVALUATION ({getFriendlyModelName(comparisonModalData.secondProvider).toUpperCase()})</th>
                      <th className="px-4 py-3 text-center border-l border-slate-200 text-indigo-700"><span className="inline-flex items-center gap-1">Note Finale retenue <Aide cle="c_cmpNoteFinale" taille={13} /></span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {criteria.map((c) => {
                      const crit = c.key;
                      const val1 = comparisonModalData.firstEval.criteriaScores?.[crit];
                      const val2 = comparisonModalData.secondEval.criteriaScores?.[crit];
                      const finalVal = finalData?.criteriaScores?.[crit] ?? comparisonModalData.thirdEval?.criteriaScores?.[crit] ?? val2 ?? val1;
                      const max = formatScore(c.maxScore);
                      return (
                        <tr key={crit} className="border-b border-slate-100 last:border-0 bg-white">
                          <td className="px-4 py-3 font-bold text-slate-600">{c.label}</td>
                          <td className="px-4 py-3 text-center border-l border-slate-100 text-slate-500">{formatScore(val1)}/{max}</td>
                          <td className="px-4 py-3 text-center border-l border-slate-100 border-r text-slate-500 font-medium">
                            {formatScore(val2)}/{max}
                            {val1 !== undefined && val2 !== undefined && val1 !== val2 && (
                              <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-md font-bold ${val2 > val1 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                {val2 > val1 ? "+" : ""}{formatScore(val2 - val1)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center font-black text-slate-800 bg-slate-50">{formatScore(finalVal)}/{max}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-100 font-black">
                    <tr>
                      <td className="px-4 py-3 uppercase text-xs text-slate-500">Note Finale Retenue</td>
                      <td className="px-4 py-3 text-center border-l border-slate-200 text-slate-500">{formatScore(comparisonModalData.firstEval.globalScore)}/{maxGlobal}</td>
                      <td className="px-4 py-3 text-center border-l border-slate-200 text-slate-500">{formatScore(comparisonModalData.secondEval.globalScore)}/{maxGlobal}</td>
                      <td className="px-4 py-3 text-center border-l border-slate-200 text-slate-800 text-lg">
                        {formatScore(noteFinaleGlobale())}/{maxGlobal}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* SEVERAL CHANGES IN FEEDBACK */}
              <h4 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-2 mt-8 flex items-center gap-2">
                 <FileText className="w-4 h-4 text-slate-400"/> Feedbacks modifiés <Aide cle="c_cmpFeedbacks" taille={14} />
              </h4>
              <div className="space-y-4">
                {criteria.map((c) => {
                   const crit = c.key;
                   const justif1 = comparisonModalData.firstEval.justifications?.[crit];
                   const justif2 = comparisonModalData.secondEval.justifications?.[crit];
                   const adv1 = comparisonModalData.firstEval.advices?.[crit];
                   const adv2 = comparisonModalData.secondEval.advices?.[crit];
                   const changed = (justif1 !== justif2) || (adv1 !== adv2);
                   if (!changed) return null;
                   
                   return (
                     <div key={"feedback-"+crit} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                       <div className="bg-slate-100 px-4 py-2 font-bold text-xs text-slate-500 uppercase tracking-wider border-b border-slate-200">
                         Critère : {c.label}
                       </div>
                       <div className="grid grid-cols-2 divide-x divide-slate-100">
                         <div className="p-4 bg-slate-50">
                            <div className="text-[10px] font-bold text-slate-400 mb-2 uppercase">Initial</div>
                            {justif1 !== justif2 && <p className="text-xs text-slate-600 mb-3"><strong className="text-slate-800">Justif:</strong> {justif1}</p>}
                            {adv1 !== adv2 && <p className="text-xs text-slate-600"><strong className="text-slate-800">Conseil:</strong> {adv1}</p>}
                         </div>
                         <div className="p-4 bg-fuchsia-50/30">
                            <div className="text-[10px] font-bold text-fuchsia-400 mb-2 uppercase">Double éval.</div>
                            {justif1 !== justif2 && <p className="text-xs text-slate-800 mb-3"><strong>Justif:</strong> {justif2}</p>}
                            {adv1 !== adv2 && <p className="text-xs text-slate-800"><strong>Conseil:</strong> {adv2}</p>}
                         </div>
                       </div>
                     </div>
                   );
                })}
              </div>

              {/* NOUVELLES ERREURS REPEREES */}
              <h4 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-2 mt-8 flex items-center gap-2">
                 <Zap className="w-4 h-4 text-amber-500"/> Fautes non repérées dans l'évaluation initiale <Aide cle="c_cmpFautes" taille={14} />
              </h4>
              <div className="bg-white border text-sm border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <tr><th className="px-4 py-3">Original</th><th className="px-4 py-3">Correction (Double évaluation)</th><th className="px-4 py-3">Règle</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(() => {
                      const errors1 = comparisonModalData.firstEval.errorsTable || [];
                      const errors2 = comparisonModalData.secondEval.errorsTable || [];
                      
                      // On trouve les erreurs de la 2nde qui n'étaient pas dans la 1ère (même original approximatif)
                      const newErrors = errors2.filter((e2: any) => 
                        !errors1.some((e1: any) => e1.original.trim().toLowerCase() === e2.original.trim().toLowerCase())
                      );

                      if (newErrors.length === 0) {
                        return <tr><td colSpan={3} className="p-6 text-center text-slate-400 italic font-medium text-xs">La double évaluation n'a trouvé aucune faute supplémentaire.</td></tr>;
                      }

                      return newErrors.map((err: any, i: number) => (
                        <tr key={i} className="hover:bg-amber-50/50 transition-colors">
                          <td className="px-4 py-3 text-red-500 font-medium text-xs line-through decoration-red-300">{err.original}</td>
                          <td className="px-4 py-3 text-emerald-600 font-medium text-xs">{err.correction}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs italic">{err.rule}</td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>

            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
