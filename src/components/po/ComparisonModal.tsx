"use client";

import { motion, AnimatePresence } from "framer-motion";
import { GitCompare, FileText, Zap } from "lucide-react";
import { formatScore } from "@/lib/scoreUtils";

interface ComparisonModalProps {
  comparisonModalData: any;
  setComparisonModalData: (value: any) => void;
  level: string;
}

const b1Labels: Record<string, string> = {
  entretien: "Entretien dirigé",
  interaction: "Exercice en interaction",
  monologue: "Expression d'un point de vue",
  lexique: "Lexique / Vocabulaire",
  morphosyntaxe: "Morphosyntaxe / Grammaire",
  phonologie: "Maîtrise du système phonologique",
};

const b2Labels: Record<string, string> = {
  monologue: "Monologue suivi",
  interaction: "Exercice en interaction (Débat)",
  lexique: "Lexique / Vocabulaire",
  morphosyntaxe: "Morphosyntaxe / Grammaire",
  phonologie: "Maîtrise du système phonologique",
};

export default function ComparisonModal({
  comparisonModalData,
  setComparisonModalData,
  level,
}: ComparisonModalProps) {
  const isB1 = level === "B1";
  const criteriaLabels = isB1 ? b1Labels : b2Labels;

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
                Analyse de la double évaluation PO (DELF {level})
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
                      <th className="px-4 py-3 text-center border-l border-slate-200 text-blue-700">Modèle INITIAL ({comparisonModalData.firstProvider || 'Examinateur 1'})</th>
                      <th className="px-4 py-3 text-center border-l border-slate-200 text-purple-700">DOUBLE ÉVALUATION ({comparisonModalData.secondProvider || 'Examinateur 2'})</th>
                      <th className="px-4 py-3 text-center border-l border-slate-200 text-indigo-700">Note Finale retenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(comparisonModalData.firstEval?.criteriaScores || {}).map((crit) => {
                      const val1 = comparisonModalData.firstEval.criteriaScores[crit];
                      const val2 = comparisonModalData.secondEval?.criteriaScores?.[crit];
                      const finalVal = val2 !== undefined ? val2 : val1;
                      const maxScore = isB1 && crit === 'lexique' ? 5 : (isB1 ? 4 : 5);
                      const critLabel = criteriaLabels[crit] || crit;

                      return (
                        <tr key={crit} className="border-b border-slate-100 last:border-0 bg-white">
                          <td className="px-4 py-3 font-bold text-slate-600">{critLabel}</td>
                          <td className="px-4 py-3 text-center border-l border-slate-100 text-slate-500">{formatScore(val1)}/{maxScore}</td>
                          <td className="px-4 py-3 text-center border-l border-slate-100 border-r text-slate-500 font-medium">
                            {formatScore(val2)}/{maxScore}
                            {val1 !== undefined && val2 !== undefined && val1 !== val2 && (
                              <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-md font-bold ${val2 > val1 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                {val2 > val1 ? "+" : ""}{(Math.round((val2 - val1) * 100) / 100)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center font-black text-slate-800 bg-slate-50">{formatScore(finalVal)}/{maxScore}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-100 font-black">
                    <tr>
                      <td className="px-4 py-3 uppercase text-xs text-slate-500">Note Finale Retenue</td>
                      <td className="px-4 py-3 text-center border-l border-slate-200 text-slate-500">{formatScore(comparisonModalData.firstEval?.globalScore)}/25</td>
                      <td className="px-4 py-3 text-center border-l border-slate-200 text-slate-500">{formatScore(comparisonModalData.secondEval?.globalScore)}/25</td>
                      <td className="px-4 py-3 text-center border-l border-slate-200 text-slate-800 text-lg">{formatScore(comparisonModalData.secondEval?.globalScore ?? comparisonModalData.firstEval?.globalScore)}/25</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* FEEDBACKS MODIFIÉS */}
              <h4 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-2 mt-8 flex items-center gap-2">
                 <FileText className="w-4 h-4 text-slate-400"/> Feedbacks modifiés
              </h4>
              <div className="space-y-4">
                {Object.keys(comparisonModalData.firstEval?.criteriaScores || {}).map((crit) => {
                   const justif1 = comparisonModalData.firstEval.justifications?.[crit];
                   const justif2 = comparisonModalData.secondEval?.justifications?.[crit];
                   const adv1 = comparisonModalData.firstEval.advices?.[crit];
                   const adv2 = comparisonModalData.secondEval?.advices?.[crit];
                   const changed = (justif1 !== justif2) || (adv1 !== adv2);
                   if (!changed) return null;
                   
                   const critLabel = criteriaLabels[crit] || crit;

                   return (
                     <div key={"feedback-"+crit} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                       <div className="bg-slate-100 px-4 py-2 font-bold text-xs text-slate-500 uppercase tracking-wider border-b border-slate-200">
                         Critère: {critLabel}
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

              {/* NOUVELLES ERREURS REPÉRÉES */}
              <h4 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-2 mt-8 flex items-center gap-2">
                 <Zap className="w-4 h-4 text-amber-500"/> Fautes non repérées dans l'évaluation initiale
              </h4>
              <div className="bg-white border text-sm border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <tr><th className="px-4 py-3">Original</th><th className="px-4 py-3">Correction (Double évaluation)</th><th className="px-4 py-3">Règle</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(() => {
                      const errors1 = comparisonModalData.firstEval?.errorsTable || [];
                      const errors2 = comparisonModalData.secondEval?.errorsTable || [];
                      
                      const newErrors = errors2.filter((e2: any) => 
                        !errors1.some((e1: any) => e1?.original?.trim()?.toLowerCase() === e2?.original?.trim()?.toLowerCase())
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
