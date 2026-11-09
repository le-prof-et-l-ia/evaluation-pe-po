import type { EntreeAide } from "./aide";

/** Textes d'aide : éléments propres à la production écrite, src/app/page.tsx (clés « pe_ »). Voir les règles de rédaction dans aide.ts. */
export const AIDE_PE = {
  pe_modeUniqueLot: {
    titre: "Unique ou Lot",
    texte: [
      "« Unique » corrige une copie que vous collez ou importez. « Lot » corrige tout un dossier de copies en une fois.",
      "Changer de mode ferme le bilan affiché ; un bilan déjà enregistré reste dans l'Historique.",
    ],
  },
  pe_epreuve: {
    titre: "Type d'épreuve",
    texte: [
      "Choisissez ce que vous corrigez. DELF B1 et B2 utilisent la grille officielle.",
      "Traduction, Dictée, Grammaire et Composition affichent d'abord un panneau où saisir votre texte de référence, votre corrigé et votre barème.",
    ],
  },
  pe_copierPromptOcr: {
    titre: "Copier le prompt OCR",
    texte: [
      "Pour lire une copie sans clé API : copiez ce texte, collez-le dans gemini.google.com avec vos photos ou PDF, puis recollez le résultat dans la zone de la copie.",
      "Aucune IA n'est appelée par ce bouton.",
    ],
  },
  pe_importerOcr: {
    titre: "Importer une copie (OCR)",
    texte: [
      "Choisissez la photo ou le PDF de la copie : l'IA lit l'écriture et remplit la zone de texte. Si la zone contient déjà du texte, l'application vous demande confirmation avant de le remplacer.",
      "Plusieurs fichiers sont lus comme les pages d'une même copie, du plus ancien au plus récent. Relisez toujours le résultat.",
    ],
  },
  pe_zoneCopie: {
    titre: "Texte de la copie",
    texte: [
      "Texte exact qui sera corrigé. Corrigez ici les erreurs de lecture avant d'analyser.",
      "Si le nom et l'e-mail de l'élève ont été repérés, ils apparaissent en tête du texte. « Reset » vide la zone.",
    ],
  },
  pe_alertesOcr: {
    titre: "Doutes de lecture",
    texte: [
      "Passages que l'IA n'a pas su lire avec certitude, par exemple une écriture peu lisible.",
      "Vérifiez-les dans la zone de texte, et corrigez-les avant de lancer l'évaluation.",
    ],
  },
  pe_enregistrerHistorique: {
    titre: "Enregistrer dans l'historique",
    texte: [
      "Envoie à l'Historique les bilans terminés du lot, avec les notes que vous avez ajustées.",
    ],
  },
} satisfies Record<string, EntreeAide>;
