"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Brain } from "lucide-react";
import Aide from "@/components/Aide";

export interface SupervisionFailure {
  errorMsg: string;
  primaryResult: any;
}

interface SupervisionRecoveryModalProps {
  /** Échec en cours, ou `null` quand la modale est fermée. */
  supervisionFailure: SupervisionFailure | null;
  setSupervisionFailure: (value: SupervisionFailure | null) => void;
  /** Conserve la 1re évaluation et abandonne la double évaluation. */
  setEvaluationResult: (value: any) => void;
  /** Relance la 2e évaluation sur le résultat primaire. */
  handleSuperviseResultWithState: (primaryResult: any) => void;
  setIsLoading: (value: boolean) => void;
  /** La modale permet aussi de changer de second examinateur avant de relancer. */
  supervisionProvider: string;
  setSupervisionProvider: (value: string) => void;
  supervisionModel: string;
  setSupervisionModel: (value: string) => void;
}

export default function SupervisionRecoveryModal({
  supervisionFailure,
  setSupervisionFailure,
  setEvaluationResult,
  handleSuperviseResultWithState,
  setIsLoading,
  supervisionProvider,
  setSupervisionProvider,
  supervisionModel,
  setSupervisionModel,
}: SupervisionRecoveryModalProps) {
  return (
    <AnimatePresence>
      {supervisionFailure && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-8">
          <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-bold flex items-center gap-2 text-rose-600"><AlertTriangle className="w-6 h-6" /> Échec de la double évaluation</h2>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600 leading-relaxed">
                La double évaluation a échoué ou a été interrompue.
              </p>
              
              <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-xs text-rose-700 font-mono overflow-auto max-h-40">
                {supervisionFailure.errorMsg}
              </div>

              <div className="pt-4 border-t border-slate-100 space-y-4">
                <h3 className="text-sm font-bold text-slate-700">Options de récupération :</h3>
                
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      setEvaluationResult(supervisionFailure.primaryResult);
                      setSupervisionFailure(null);
                      setIsLoading(false);
                    }}
                    className="flex-1 p-4 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-2xl text-sm text-left transition-colors flex justify-between items-center cursor-pointer"
                  >
                    <span>Conserver l'évaluation simple (sans double évaluation)</span>
                    <span className="text-xs font-normal text-blue-500 bg-white px-2 py-0.5 rounded-full border border-blue-200">Voir le score simple</span>
                  </button>
                  <Aide cle="c_recGarder" taille={18} />
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">Changer le modèle de double évaluation pour retenter : <Aide cle="c_recModele" taille={14} /></h4>
                  
                  <div className="grid grid-cols-[auto_1fr_1fr] gap-1 items-center text-[10px] bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <div className="px-1 py-1"></div>
                    <div className="text-center font-bold text-slate-400 uppercase py-0.5">Léger</div>
                    <div className="text-center font-bold text-slate-400 uppercase py-0.5">Lourd</div>
                    
                    <div className="px-1 font-bold text-blue-600 text-[9px]">Gemini</div>
                    <button onClick={() => { setSupervisionProvider('gemini'); setSupervisionModel('flash'); }} className={`py-1.5 rounded-lg font-bold transition-all ${supervisionProvider === 'gemini' && supervisionModel === 'flash' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200 hover:text-blue-600'}`}>Léger (rapide)</button>
                    <button onClick={() => { setSupervisionProvider('gemini'); setSupervisionModel('pro'); }} className={`py-1.5 rounded-lg font-bold transition-all ${supervisionProvider === 'gemini' && supervisionModel === 'pro' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200 hover:text-blue-600'}`}>Lourd (approfondi)</button>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
              <button 
                onClick={() => {
                  setSupervisionFailure(null);
                  setIsLoading(false);
                  // On garde la 1re évaluation : seule la double évaluation est abandonnée.
                  setEvaluationResult(supervisionFailure.primaryResult);
                }} 
                className="px-6 py-3 font-bold text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-xl transition-colors text-sm cursor-pointer"
              >
                Abandonner la double évaluation
              </button>
              <Aide cle="c_recAbandonner" taille={18} className="self-center" />
              <button 
                onClick={() => {
                  const primaryRes = supervisionFailure.primaryResult;
                  setSupervisionFailure(null);
                  handleSuperviseResultWithState(primaryRes);
                }} 
                className="px-8 py-3 font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-lg shadow-purple-500/20 flex items-center gap-2 transition-all text-sm cursor-pointer"
              >
                 <Brain className="w-5 h-5" /> Relancer la double évaluation
              </button>
              <Aide cle="c_recRelancer" taille={18} className="self-center" />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
