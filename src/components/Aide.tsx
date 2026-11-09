"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { HelpCircle, X } from "lucide-react";
import { AIDE, type CleAide } from "@/lib/aide";

interface AideProps {
  /** Clé d'un texte de `src/lib/aide.ts`. */
  cle?: CleAide;
  /** Titre et contenu libres (si aucune clé n'est donnée). */
  titre?: string;
  children?: ReactNode;
  /** Taille de l'icône en pixels. */
  taille?: number;
  className?: string;
}

const LARGEUR = 380;
const MARGE = 12;

/**
 * Petit bouton « ? » qui ouvre une bulle d'explication au clic.
 * La bulle est affichée par-dessus la page (portail) pour ne jamais être
 * coupée par un conteneur ; elle se ferme au clic extérieur ou avec Échap.
 */
export default function Aide({ cle, titre, children, taille = 16, className = "" }: AideProps) {
  const [ouvert, setOuvert] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const boutonRef = useRef<HTMLButtonElement>(null);
  const bulleRef = useRef<HTMLDivElement>(null);

  const entree = cle ? AIDE[cle] : undefined;
  const titreAffiche = titre ?? entree?.titre ?? "Aide";
  const contenu = children ?? (entree ? <ContenuAide paragraphes={entree.texte} /> : null);

  const placer = () => {
    const b = boutonRef.current?.getBoundingClientRect();
    if (!b) return;
    const largeur = Math.min(LARGEUR, window.innerWidth - 2 * MARGE);
    let left = b.left + b.width / 2 - largeur / 2;
    left = Math.max(MARGE, Math.min(left, window.innerWidth - largeur - MARGE));
    const hauteur = bulleRef.current?.scrollHeight ?? 200;
    const placeDessous = window.innerHeight - b.bottom - 8 - MARGE;
    const placeDessus = b.top - 8 - MARGE;
    // Dessous si ça tient, sinon dessus si ça tient, sinon du côté le plus grand avec ascenseur.
    const enHaut = hauteur > placeDessous && (hauteur <= placeDessus || placeDessus > placeDessous);
    const hauteurMax = enHaut ? placeDessus : placeDessous;
    const hauteurAffichee = Math.min(hauteur, hauteurMax);
    const top = enHaut ? b.top - 8 - hauteurAffichee : b.bottom + 8;
    setPos({ top, left, maxHeight: hauteurMax });
  };

  useLayoutEffect(() => {
    if (ouvert) placer();
  }, [ouvert]);

  useEffect(() => {
    if (!ouvert) return;
    const fermerSiDehors = (e: MouseEvent) => {
      const cible = e.target as Node;
      if (!bulleRef.current?.contains(cible) && !boutonRef.current?.contains(cible)) setOuvert(false);
    };
    const touche = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOuvert(false);
        boutonRef.current?.focus();
      }
    };
    const replacer = () => placer();
    document.addEventListener("mousedown", fermerSiDehors);
    document.addEventListener("keydown", touche);
    window.addEventListener("resize", replacer);
    window.addEventListener("scroll", replacer, true);
    return () => {
      document.removeEventListener("mousedown", fermerSiDehors);
      document.removeEventListener("keydown", touche);
      window.removeEventListener("resize", replacer);
      window.removeEventListener("scroll", replacer, true);
    };
  }, [ouvert]);

  return (
    <>
      <button
        ref={boutonRef}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOuvert((v) => !v);
        }}
        aria-label={`Aide : ${titreAffiche}`}
        aria-expanded={ouvert}
        title={`Aide : ${titreAffiche}`}
        className={`inline-flex items-center justify-center shrink-0 rounded-full text-slate-400 hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 transition-colors align-middle ${ouvert ? "text-blue-600" : ""} ${className}`}
      >
        <HelpCircle style={{ width: taille, height: taille }} />
      </button>
      {ouvert &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={bulleRef}
            role="dialog"
            aria-label={titreAffiche}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              width: Math.min(LARGEUR, typeof window !== "undefined" ? window.innerWidth - 2 * MARGE : LARGEUR),
              maxHeight: pos?.maxHeight,
              overflowY: "auto",
              zIndex: 10000,
            }}
            className="bg-white text-slate-700 text-sm leading-relaxed text-left font-normal normal-case tracking-normal rounded-2xl shadow-2xl border border-slate-200 p-4"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <p className="font-bold text-slate-800 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-blue-600 shrink-0" />
                {titreAffiche}
              </p>
              <button type="button" onClick={() => setOuvert(false)} aria-label="Fermer l'aide" className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">{contenu}</div>
          </div>,
          document.body
        )}
    </>
  );
}

/** Affiche une liste de paragraphes ; une ligne commençant par « • » devient une puce. */
export function ContenuAide({ paragraphes }: { paragraphes: string[] }) {
  return (
    <>
      {paragraphes.map((p, i) =>
        p.startsWith("• ") ? (
          <p key={i} className="pl-4 -indent-3">
            • {p.slice(2)}
          </p>
        ) : (
          <p key={i}>{p}</p>
        )
      )}
    </>
  );
}
