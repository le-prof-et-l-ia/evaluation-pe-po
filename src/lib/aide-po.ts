import type { EntreeAide } from "./aide";

/** Textes d'aide : éléments propres à la production orale, src/app/po/page.tsx (clés « po_ »). Voir les règles de rédaction dans aide.ts. */
export const AIDE_PO = {
  // ------------------------------------------------ Navigation et réglages
  po_modes: {
    titre: "Unique, 2 Étapes, Lot",
    texte: [
      "• Unique : l'oral d'un candidat, enregistré en une fois.",
      "• 2 Étapes : exposé puis débat, enregistrés à deux moments différents.",
      "• Lot : tout un dossier d'enregistrements.",
      "Changer d'onglet ferme le bilan affiché ; une confirmation est demandée s'il n'est pas enregistré ou a été modifié.",
    ],
  },
  po_epreuve: {
    titre: "Type d'épreuve orale",
    texte: [
      "Choisissez l'examen avant de charger les enregistrements : la grille de critères en dépend (B1 avec Entretien, B2, ou Interprétation).",
      "Changer d'épreuve remet les modèles d'évaluation sur « Léger ». Pour l'interprétation, la note se fait sur le maximum que vous définissez.",
    ],
  },
  po_sujetsPo: {
    titre: "Sujets PO",
    texte: [
      "Crée avec l'IA les documents à présenter au candidat pour un oral (de 1 à 3 textes selon le niveau).",
      "Les questions de l'examinateur ne sont pas créées ici. « Utiliser comme sujet » recopie les textes dans le champ Sujet, dont le contenu est remplacé.",
    ],
  },
  po_bandeauActif: {
    titre: "Réglages actifs",
    texte: [
      "Rappelle les modèles de lecture, d'évaluation et de double évaluation qui serviront aux prochaines relances de cet écran.",
      "Ce bandeau est informatif : on ne clique pas dessus.",
    ],
  },

  // ------------------------------------------------ Mode Unique
  po_copierPromptIpa: {
    titre: "Transcrire gratuitement avec Gemini",
    texte: [
      "« Copier Prompt IPA » copie des consignes de transcription phonétique, adaptées au niveau et à la langue de l'élève. Aucune IA n'est appelée.",
      "Ouvrez « Chat Gemini Web », collez les consignes avec votre fichier audio, puis recopiez la transcription dans la zone ci-dessous.",
    ],
  },
  po_importerAudio: {
    titre: "Importer un enregistrement",
    texte: [
      "Choisissez l'enregistrement du candidat : l'IA le transcrit en texte, ce qui peut prendre quelques minutes. Le texte déjà présent est remplacé.",
      "En mode Unique, plusieurs fichiers sont assemblés dans l'ordre alphabétique de leurs noms (enregistrement2 avant enregistrement10) ; l'ordre retenu est affiché. « Abandonner » arrête la transcription sans rien ajouter.",
    ],
  },
  po_zoneTranscription: {
    titre: "Transcription",
    texte: [
      "L'évaluation porte sur ce texte, pas directement sur l'audio : relisez-le et corrigez les mots mal compris avant d'analyser.",
      "« Reset » vide le texte et libère aussi l'audio importé : « Analyser » n'évaluera plus cet enregistrement à votre insu.",
    ],
  },

  // ------------------------------------------------ Mode 2 Étapes
  po_deuxEtapes: {
    titre: "Épreuve en deux temps",
    texte: [
      "1) Importez l'exposé du candidat : l'IA propose des questions de débat, et vous mettez le dossier de côté.",
      "2) Après le débat, reprenez le dossier, importez le second enregistrement et lancez la notation de l'ensemble.",
      "Ce mode ne concerne que le DELF B2 : choisissez-le en haut de la page.",
    ],
  },
  po_effacerEtape: {
    titre: "Réinitialiser / Effacer",
    texte: [
      "Vide les zones de cette étape pour recommencer : sujet, transcription et questions pour l'étape 1 ; transcription du débat pour l'étape 2.",
      "Le nom, l'e-mail et la classe du candidat sont conservés. Une confirmation est demandée avant d'effacer.",
    ],
  },
  po_sujetExpose: {
    titre: "Sujet de l'exposé",
    texte: [
      "Collez le sujet traité par le candidat. Il est nécessaire pour générer les questions et pour enregistrer le dossier.",
    ],
  },
  po_importerAudioEtape: {
    titre: "Importer l'enregistrement de l'étape",
    texte: [
      "Importez l'exposé (étape 1) ou les réponses du candidat au débat (étape 2) : un seul fichier à la fois, transcrit par l'IA en quelques minutes. « Annuler » arrête la transcription ; au-delà de 3 minutes, elle s'arrête d'elle-même (découpez alors l'enregistrement).",
      "La transcription remplace le texte déjà présent dans la zone.",
    ],
  },
  po_transcriptionEtape: {
    titre: "Transcription de l'étape",
    texte: [
      "Vous pouvez aussi y coller directement une transcription. Relisez et corrigez-la : les questions de débat, puis la note, s'appuient sur ce texte.",
      "Le bouton d'évaluation finale apparaît dès que la transcription du débat n'est pas vide.",
    ],
  },
  po_genererQuestions: {
    titre: "Générer les questions de débat",
    texte: [
      "L'IA lit l'exposé et propose des questions de relance adaptées au candidat, chacune avec son objectif pédagogique.",
      "Relancer le bouton remplace les questions précédentes. « Copier les questions » les place dans le presse-papiers, pour les imprimer ou les lire au candidat.",
    ],
  },
  po_identiteDossier: {
    titre: "Nom, e-mail et classe",
    texte: [
      "Rattachent le dossier à un élève, pour le retrouver et lui envoyer son bilan par e-mail. La classe est facultative.",
      "Sans nom, le dossier s'appellera « Inconnu ».",
    ],
  },
  po_enregistrerAttente: {
    titre: "Enregistrer en attente",
    texte: [
      "Met le dossier de côté (exposé, questions, élève) pour la suite : il apparaît dans « Dossiers en attente ».",
      "Le formulaire est vidé après l'enregistrement et un message le confirme.",
    ],
  },
  po_dossiersAttente: {
    titre: "Dossiers en attente",
    texte: [
      "Candidats dont l'exposé est fait mais pas le débat. « Reprendre » ouvre le dossier : le sujet, les textes, les questions, l'élève, le niveau et la langue de feedback actuels sont remplacés par ceux du dossier.",
      "La corbeille supprime définitivement le dossier, après confirmation.",
    ],
  },
  po_sauvegarderFermer: {
    titre: "Sauvegarder ou fermer le dossier",
    texte: [
      "« Sauvegarder les modifications » enregistre vos ajouts (par exemple la transcription du débat) ; le dossier reste ouvert.",
      "« Fermer le dossier » et la flèche de retour quittent le dossier ; si du texte n'est pas sauvegardé, une confirmation est demandée.",
    ],
  },
  po_evaluationFinale: {
    titre: "Lancer l'évaluation finale",
    texte: [
      "Note l'ensemble de l'épreuve (exposé et débat) en une seule évaluation, avec la double évaluation si elle est cochée. Le bilan est enregistré dans l'Historique.",
      "Le dossier en attente est supprimé quand vous générez ou envoyez le bilan.",
    ],
  },
} satisfies Record<string, EntreeAide>;
