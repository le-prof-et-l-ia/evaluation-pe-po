"use client";

import { Brain, Sparkles } from "lucide-react";
import Aide from "@/components/Aide";
import { usePersistentRawState } from "@/hooks/usePersistentState";

export type MoteurGenerateur = "gemini" | "externe";

/** Choix du moteur des générateurs, mémorisé dans le navigateur (commun PE et PO). */
export function useMoteurGenerateur() {
  return usePersistentRawState<MoteurGenerateur>(
    "generateur_moteur",
    "gemini",
    v => v === "gemini" || v === "externe"
  );
}

interface Props {
  moteur: MoteurGenerateur;
  onChange: (m: MoteurGenerateur) => void;
}

/** Sélecteur « Gemini (clé API) » / « IA externe (abonnement) ». */
export default function ChoixMoteur({ moteur, onChange }: Props) {
  const bouton = (actif: boolean, couleur: string) =>
    `py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
      actif ? `bg-white shadow-xs border border-slate-200/80 ${couleur}` : "text-slate-500 hover:text-slate-900"
    }`;
  return (
    <div className="space-y-2 pt-2 border-t border-slate-100">
      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
        Préparer avec <Aide cle="c_genMoteur" taille={14} />
      </label>
      <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100/70 rounded-2xl border border-slate-200/60">
        <button type="button" onClick={() => onChange("gemini")} className={bouton(moteur === "gemini", "text-indigo-700")}>
          <Sparkles className="w-3.5 h-3.5" /> Gemini (clé API)
        </button>
        <button type="button" onClick={() => onChange("externe")} className={bouton(moteur === "externe", "text-violet-700")}>
          <Brain className="w-3.5 h-3.5" /> IA externe (abonnement)
        </button>
      </div>
      {moteur === "externe" && (
        <p className="text-[11px] text-slate-500 leading-snug px-1">
          L&apos;application trouve l&apos;article source, puis prépare des consignes à donner vous-même à Claude, ChatGPT, Gemini…
          Vous recollez ensuite sa réponse. Aucune clé API n&apos;est utilisée.
        </p>
      )}
    </div>
  );
}
