/**
 * Textes d'aide affichés par les bulles « ? » (composant `Aide`).
 *
 * Tous les textes sont regroupés ici pour pouvoir être relus et corrigés sans
 * toucher à l'interface. Chaque entrée : un titre court et une liste de
 * paragraphes ; un paragraphe commençant par « • » s'affiche comme une puce.
 *
 * Règles de rédaction : s'adresser à un enseignant, dire à quoi sert l'élément,
 * ce qui va se passer quand on l'utilise et ce qu'il faut préparer. Pas de
 * jargon technique.
 */

import { AIDE_PARTAGE } from "./aide-partage";
import { AIDE_PE } from "./aide-pe";
import { AIDE_PO } from "./aide-po";
import { AIDE_COMPOSANTS } from "./aide-composants";

export interface EntreeAide {
  titre: string;
  texte: string[];
}

/**
 * Organisation :
 * - ce fichier : textes généraux (classes, double évaluation, IA externe) ;
 * - aide-partage.ts : éléments présents à la fois en production écrite et orale ;
 * - aide-pe.ts / aide-po.ts : éléments propres à un module ;
 * - aide-composants.ts : écrans communs (bilan, historique, générateur, paramètres…).
 */
const AIDE_GENERAL = {
  // ---------------------------------------------------------------- Classes
  importClasses: {
    titre: "Importer une liste d'élèves",
    texte: [
      "Importez un fichier Excel (.xlsx, .xls), LibreOffice ou CSV. Une fenêtre vous montre le format attendu et un aperçu avant tout enregistrement.",
      "• Chaque onglet du classeur devient une classe, qui porte le nom de l'onglet.",
      "• Ligne 1 : les titres de colonnes (« Prénom », « Nom », « E-mail »… ou « Nom complet »).",
      "• Une ligne par élève ; l'e-mail est facultatif.",
      "Si une classe du même nom existe déjà, les nouveaux élèves y sont ajoutés et les élèves déjà présents sont mis à jour.",
    ],
  },
  classesUtilite: {
    titre: "À quoi servent les classes ?",
    texte: [
      "Les listes de classes permettent à l'application de reconnaître automatiquement l'élève de chaque copie (par son e-mail, sinon par son nom), de ranger ses notes dans l'historique et d'envoyer son bilan par e-mail.",
      "Elles sont facultatives : sans liste, la correction fonctionne normalement, mais les copies ne sont rattachées à aucun élève.",
    ],
  },

  // ------------------------------------------------- Double évaluation
  doubleEvaluation: {
    titre: "Double évaluation",
    texte: [
      "Chaque copie est corrigée deux fois, comme par deux examinateurs : une première évaluation, puis une seconde qui la relit, la contrôle et la rectifie si besoin.",
      "La note du second évaluateur fait autorité. Vous pouvez comparer les deux évaluations critère par critère dans l'écran de résultats.",
      "Le temps de correction est environ doublé.",
      "Disponible pour le DELF uniquement.",
    ],
  },
  modeSupervision: {
    titre: "Qui fait la seconde évaluation ?",
    texte: [
      "• Dans l'appli : la seconde évaluation est faite automatiquement par Gemini, avec votre clé API.",
      "• IA externe (sans clé) : l'application prépare un texte de consignes que vous donnez vous-même à l'IA de votre choix (Claude, ChatGPT, Gemini…), dans le cadre de votre abonnement, puis vous recollez sa réponse. Rien n'est envoyé automatiquement.",
      "L'IA externe n'est disponible que pour le DELF B1 et B2 (production écrite et orale).",
    ],
  },

  // ------------------------------------------- Évaluation par une IA externe
  evalExterneUnique: {
    titre: "Évaluation externe (sans clé API)",
    texte: [
      "Fait corriger cette copie par une IA externe (Claude, ChatGPT…) au lieu de Gemini. Aucune clé API n'est nécessaire.",
      "Avant de cliquer : remplissez le sujet et le texte à évaluer (texte de la copie ou transcription de l'enregistrement, tapé, collé ou obtenu automatiquement).",
      "Une fenêtre s'ouvre en deux étapes : 1) copiez ou téléchargez les consignes et donnez-les à l'IA ; 2) collez sa réponse dans la fenêtre. Le bilan s'affiche alors comme une correction normale.",
      "Disponible pour le DELF B1 et B2 uniquement : les consignes données à l'IA suivent la grille du DELF.",
    ],
  },
  evalExterneLot: {
    titre: "Évaluation externe en lot",
    texte: [
      "Fait corriger par une IA externe (Claude, ChatGPT…) toutes les copies de ce lot dont le texte a été lu mais pas encore évalué. Aucune clé API n'est nécessaire.",
      "Les copies sont réparties en sous-lots (5 par défaut). Pour chaque sous-lot : copiez les consignes, soumettez-les à l'IA dans une nouvelle conversation, puis collez sa réponse. Les notes s'ajoutent au lot au fur et à mesure.",
      "Disponible pour le DELF B1 et B2 uniquement.",
    ],
  },
  doubleEvalExterneLot: {
    titre: "Double évaluation externe",
    texte: [
      "Envoie les copies déjà évaluées de ce lot à une IA externe (Claude, ChatGPT…), qui joue le rôle de second examinateur : elle relit chaque première évaluation, la contrôle et produit l'évaluation finale.",
      "Même fonctionnement en deux étapes (copier les consignes, puis coller la réponse), par sous-lots. La note de l'IA externe remplace la première ; la comparaison reste consultable.",
      "Disponible pour le DELF B1 et B2 uniquement.",
    ],
  },
  sousLots: {
    titre: "Découpage en sous-lots",
    texte: [
      "Une IA ne peut pas rédiger une réponse trop longue en une seule fois : au-delà de quelques copies, sa réponse risque d'être coupée.",
      "Les copies sont donc réparties en petits groupes. Traitez chaque sous-lot dans une nouvelle conversation avec l'IA, puis collez sa réponse dans l'onglet correspondant. Un compteur indique les copies déjà traitées.",
      "5 copies par sous-lot conviennent dans la plupart des cas ; réduisez à 1 ou 3 si les réponses sont coupées.",
    ],
  },
  automatisationExterne: {
    titre: "Automatisation externe (Claude / ChatGPT pour ordinateur)",
    texte: [
      "Pour les gros lots, sans clé API, avec une application d'IA installée sur l'ordinateur et autorisée à lire et écrire vos fichiers (par exemple Claude pour ordinateur ou ChatGPT pour ordinateur).",
      "• 1. Choisissez le dossier du lot, puis cliquez sur « Préparer… ». L'application crée un dossier d'échange (_ECHANGE_IA) contenant un fichier CONSIGNES.md.",
      "• 2. Dans votre application d'IA, donnez-lui ce fichier CONSIGNES.md. Elle traite toutes les copies et dépose ses résultats dans le sous-dossier « livrables ».",
      "• 3. Revenez ici et cliquez sur « Importer livrables ». Les résultats s'affichent dans l'écran de révision du lot.",
      "Le dossier d'échange est créé dans le dossier de sortie s'il est défini, sinon dans le dossier de l'application (data/outputs).",
      "La lecture des copies (OCR, transcription) fonctionne pour toutes les épreuves ; la correction, pour le DELF B1 et B2 uniquement.",
    ],
  },
} satisfies Record<string, EntreeAide>;

export const AIDE = {
  ...AIDE_GENERAL,
  ...AIDE_PARTAGE,
  ...AIDE_PE,
  ...AIDE_PO,
  ...AIDE_COMPOSANTS,
};

export type CleAide = keyof typeof AIDE;
