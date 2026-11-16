"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";

/** Délai au-delà duquel l'attente d'une réponse de Gemini est signalée comme anormale. */
export const DELAI_AVERTISSEMENT_MS = 30000;

/**
 * Surveille une requête longue adressée à Gemini : au bout de 30 secondes sans réponse,
 * une fenêtre propose d'annuler ou de patienter.
 *
 * - `demarrer()` lance le minuteur et renvoie le signal à passer à `fetch`.
 * - `terminer()` arrête le minuteur et ferme la fenêtre (à appeler dans `finally`).
 * - `estAnnulation(err)` reconnaît l'erreur levée par `fetch` après « Annuler ».
 * - `fenetre` est l'élément à insérer dans le rendu.
 */
export function useAttenteGemini() {
  const [visible, setVisible] = useState(false);
  const [debut, setDebut] = useState(0);
  const controleur = useRef<AbortController | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const arreterMinuteur = () => {
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = null;
  };

  const demarrer = useCallback((): AbortSignal => {
    arreterMinuteur();
    controleur.current = new AbortController();
    setDebut(Date.now());
    setVisible(false);
    minuteur.current = setTimeout(() => setVisible(true), DELAI_AVERTISSEMENT_MS);
    return controleur.current.signal;
  }, []);

  const terminer = useCallback(() => {
    arreterMinuteur();
    controleur.current = null;
    setVisible(false);
  }, []);

  const annuler = () => {
    arreterMinuteur();
    controleur.current?.abort();
    setVisible(false);
  };

  // Plus de fenêtre après « Patienter » : la génération continue jusqu'à sa fin ou son échec.
  const patienter = () => setVisible(false);

  useEffect(() => () => {
    arreterMinuteur();
    controleur.current?.abort();
  }, []);

  const fenetre = visible ? (
    <FenetreAttente debut={debut} onAnnuler={annuler} onPatienter={patienter} />
  ) : null;

  return { demarrer, terminer, fenetre, estAnnulation };
}

export function estAnnulation(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === "AbortError";
}

function FenetreAttente({ debut, onAnnuler, onPatienter }: { debut: number; onAnnuler: () => void; onPatienter: () => void }) {
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const secondes = Math.max(0, Math.round((maintenant - debut) / 1000));

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="attente-gemini-titre"
      aria-describedby="attente-gemini-texte"
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4">
        <h2 id="attente-gemini-titre" className="text-lg font-bold flex items-center gap-2 text-amber-600">
          <Clock className="w-6 h-6 shrink-0" /> Réponse de Gemini anormalement lente
        </h2>
        <div id="attente-gemini-texte" className="text-sm text-slate-600 space-y-2">
          <p>
            Gemini n&apos;a toujours pas répondu ({secondes} s). Ses serveurs sont probablement surchargés :
            la génération peut encore prendre une à trois minutes, ou échouer.
          </p>
          <p>Vous pouvez patienter, ou annuler et réessayer plus tard.</p>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onAnnuler}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onPatienter}
            autoFocus
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700"
          >
            Patienter
          </button>
        </div>
      </div>
    </div>
  );
}
