import type { EntreeAide } from "./aide";

/** Textes d'aide : éléments communs à la production écrite et orale, src/app/page.tsx et src/app/po/page.tsx (clés « partage_ »). Voir les règles de rédaction dans aide.ts. */
export const AIDE_PARTAGE = {
  // ------------------------------------------------ Barre latérale et en-tête
  partage_maintenance: {
    titre: "Maintenance",
    texte: [
      "Ouvre l'écran où vous saisissez vos clés Gemini, le compte e-mail qui envoie les bilans et où vous nettoyez l'espace disque.",
      "À régler une fois, avant la première correction.",
    ],
  },
  partage_generateur: {
    titre: "Générateur de sujets",
    texte: [
      "Crée avec l'IA un sujet d'épreuve à partir d'un thème et d'un article de presse.",
      "Le bouton « Utiliser comme sujet » du générateur recopie le résultat dans le champ Sujet de l'écran de correction (mode Unique) et vous y ramène.",
    ],
  },
  partage_quitter: {
    titre: "Quitter l'application",
    texte: [
      "Éteint le programme sur votre ordinateur, après confirmation, puis ferme l'onglet.",
      "Utilisez ce bouton à la fin de la séance plutôt que la croix du navigateur : sinon le programme reste actif en arrière-plan.",
    ],
  },

  // ------------------------------------------------ Réglages de la barre latérale
  partage_cleLecture: {
    titre: "Clés utilisées pour la lecture",
    texte: [
      "Choisit quelles clés Gemini lisent les copies scannées ou transcrivent les enregistrements.",
      "• Gratuit + Payant : les clés gratuites d'abord, la clé payante en secours.",
      "• Gratuit uniquement : rien n'est facturé, mais la lecture peut s'arrêter quand le quota gratuit est atteint.",
      "• Payant uniquement : seule la clé payante est utilisée.",
    ],
  },
  partage_modeleLecture: {
    titre: "Modèle de lecture",
    texte: [
      "Choisit le modèle Gemini qui transforme les scans (ou les enregistrements) en texte.",
      "Laissez 3.8 Flash. 3.6 Flash est une solution de secours si le premier est surchargé.",
    ],
  },
  partage_cleEvaluation: {
    titre: "Clés utilisées pour la correction",
    texte: [
      "Même principe que pour la lecture, mais pour la correction : Gratuit + Payant, Gratuit uniquement ou Payant uniquement.",
      "Avec « Gratuit uniquement », rien n'est facturé, mais la correction peut échouer si le quota gratuit du jour est épuisé.",
    ],
  },
  partage_modeleEvaluation: {
    titre: "Modèle d'évaluation",
    texte: [
      "Choisit le modèle qui note la copie. « Léger » (3.8 Flash) est rapide et suffit pour la plupart des copies.",
      "« Lourd » (4 Argon) est plus fin, mais plus lent et plus coûteux en quota : à réserver aux cas difficiles.",
    ],
  },
  partage_modeleDoubleEval: {
    titre: "Modèle de la double évaluation",
    texte: [
      "Choisit le modèle du second évaluateur quand la seconde évaluation est faite dans l'application.",
      "Prenez de préférence un modèle au moins aussi puissant que celui de la première évaluation.",
    ],
  },
  partage_modeleEmail: {
    titre: "Modèle d'e-mail",
    texte: [
      "Objet et message qui accompagnent le bilan PDF envoyé à l'élève depuis cette page. Le PDF est joint automatiquement.",
      "« Réinitialiser » remet le message type, avec votre signature : votre texte actuel est remplacé.",
      "L'envoi direct du lot utilise son propre texte, pas celui-ci.",
    ],
  },
  partage_bareme: {
    titre: "Barème",
    texte: [
      "« DELF (0, 1, 3, 5) » : chaque critère reçoit une note par paliers, comme dans la grille officielle.",
      "« Détaillée (0.5) » : les notes peuvent avoir des demi-points, pour une évaluation plus fine.",
    ],
  },
  partage_langueFeedback: {
    titre: "Langue du feedback",
    texte: [
      "Langue dans laquelle l'IA rédige les commentaires destinés à l'élève.",
      "VN : vietnamien. FR : français. CZ : tchèque. TW : chinois (Taïwan). EN : anglais.",
    ],
  },
  partage_langueMaternelle: {
    titre: "Langue maternelle",
    texte: [
      "Indique la langue de l'élève à l'IA, pour qu'elle repère les erreurs typiques (interférences) d'un vietnamophone, d'un tchécophone, etc.",
      "Laissez « Non spécifiée » si la classe est mixte. « + anglais » ajoute l'anglais, si l'élève le connaît aussi.",
    ],
  },
  partage_remiseAZero: {
    titre: "Repartir de zéro",
    texte: [
      "Ferme le bilan ou le lot affichés ainsi que les alertes de lecture.",
      "Vos réglages, le sujet et le texte saisis ne sont pas effacés ; un bilan déjà enregistré reste dans l'Historique.",
      "S'il reste des bilans non envoyés, une confirmation vous est demandée.",
    ],
  },

  // ------------------------------------------------ Correction unitaire
  partage_sujet: {
    titre: "Sujet de l'épreuve",
    texte: [
      "Collez la consigne que l'élève devait traiter. L'IA s'en sert pour juger si la production répond au sujet.",
      "Il est obligatoire pour un DELF B1 ou B2. « Reset » vide le champ.",
    ],
  },
  partage_chargerBilan: {
    titre: "Charger un bilan",
    texte: [
      "Rouvre un bilan déjà produit : fichier enregistré par l'application ou réponse rapportée d'une IA externe.",
      "Le bilan est ajouté à l'Historique, puis affiché. Si le fichier en contient plusieurs, seul le premier est affiché.",
    ],
  },
  partage_analyser: {
    titre: "Analyser",
    texte: [
      "Lance la correction par l'IA. Prévoyez quelques minutes, le double si « Double évaluation » est cochée.",
      "Le bilan s'affiche ensuite et s'enregistre dans l'Historique. Remplissez d'abord le sujet et le texte de la copie.",
    ],
  },
  partage_interrompre: {
    titre: "Interrompre",
    texte: [
      "Arrête le traitement en cours : rien n'est enregistré.",
      "Les appels à l'IA déjà partis comptent quand même dans votre quota.",
    ],
  },

  // ------------------------------------------------ Lot : écran de départ
  partage_sujetLot: {
    titre: "Sujet commun du lot",
    texte: [
      "Renseignez-le si tous les candidats ont traité le même sujet ; sinon laissez vide et l'IA le déduira de chaque copie.",
      "« Reprendre sujet du mode unique » recopie le sujet saisi en mode Unique et remplace celui-ci.",
    ],
  },
  partage_dossierSource: {
    titre: "Dossier source",
    texte: [
      "Dossier de votre ordinateur qui contient les copies à traiter. « Parcourir » vous évite de taper le chemin.",
      "Mettez-y un fichier par élève. Seules les copies sont lues (PDF, JPG, PNG ou TXT pour l'écrit ; fichiers audio pour l'oral) : les autres fichiers sont ignorés et signalés à l'écran, ainsi que les sous-dossiers.",
    ],
  },
  partage_dossierSortie: {
    titre: "Dossier de sortie",
    texte: [
      "Dossier où sont enregistrés les bilans PDF, la sauvegarde du dernier lot et le dossier d'échange avec une IA externe.",
      "Laissé vide, l'application utilise son propre dossier interne.",
    ],
  },
  partage_envoiDirect: {
    titre: "Envoi direct par e-mail",
    texte: [
      "Activé, chaque bilan PDF part par e-mail dès qu'il est prêt, sans que vous le relisiez, à l'adresse détectée sur la copie.",
      "Le message reprend le « Modèle d'e-mail » des réglages. Il faut que l'e-mail d'envoi soit réglé dans Maintenance. Laissez désactivé pour vérifier les notes avant envoi.",
    ],
  },
  partage_lancerLot: {
    titre: "Lancer le lot complet",
    texte: [
      "Lit puis corrige toutes les copies du dossier source, l'une après l'autre. Cela peut durer longtemps.",
      "Les bilans s'enregistrent dans l'Historique et le lot s'affiche pour relecture. Si « Double évaluation » est cochée, cochez-la avant de lancer.",
    ],
  },
  partage_lectureSeule: {
    titre: "Lecture seule (OCR / transcription)",
    texte: [
      "Ne fait que lire les copies (ou transcrire les enregistrements) : aucune note, aucun e-mail.",
      "Les copies apparaissent « En attente d'évaluation » : vérifiez et corrigez les textes, puis cliquez sur « Lancer l'Évaluation ».",
    ],
  },
  partage_dernierLot: {
    titre: "Récupérer le dernier lot",
    texte: [
      "Recharge le dernier lot sauvegardé dans le dossier de sortie, pour reprendre un lot interrompu ou fermé.",
      "Le dossier de sortie doit être le même que lors du lot. Le lot affiché est remplacé.",
    ],
  },
  partage_chargerLot: {
    titre: "Charger un lot sauvegardé",
    texte: [
      "Rouvre un lot enregistré dans un fichier (ou rapporté d'une IA externe). Le lot affiché est remplacé.",
      "Ce chargement n'ajoute pas les bilans à l'Historique.",
    ],
  },

  // ------------------------------------------------ Lot : écran de révision
  partage_lancerEvaluation: {
    titre: "Lancer l'évaluation",
    texte: [
      "Note, une par une, les copies dont vous n'avez fait que la lecture.",
      "Vérifiez d'abord les textes : une erreur de lecture fausse la note. La double évaluation s'applique si la case est cochée.",
    ],
  },
  partage_doubleEvalLot: {
    titre: "Lancer la double évaluation",
    texte: [
      "Fait relire les copies évaluées du lot par un second évaluateur. Sa note remplace la première, mais la comparaison reste consultable.",
      "Les copies déjà double-évaluées sont ignorées. Si vous avez ajusté des notes à la main, une confirmation vous est demandée, car elles seront remplacées.",
      "Réservée au DELF : les autres épreuves n'ont pas de seconde évaluation.",
    ],
  },
  partage_pauseStop: {
    titre: "Pause / Stopper",
    texte: [
      "Pause : suspend la double évaluation après la copie en cours ; vous pourrez la reprendre.",
      "Stopper : arrête définitivement ; les copies déjà revues gardent leur nouvelle note.",
    ],
  },
  partage_ajouterCopies: {
    titre: "Ajouter des copies",
    texte: [
      "Ajoute au lot des copies oubliées : elles sont lues et corrigées tout de suite, une par une.",
      "Un fichier dont le nom est déjà dans le lot est ignoré.",
    ],
  },
  partage_sujetLotRevision: {
    titre: "Sujet du lot (révision)",
    texte: [
      "Sujet utilisé pour les copies ajoutées, les corrections refaites et les doubles évaluations de cet écran.",
      "Complétez-le ici si vous ne l'aviez pas renseigné avant la lecture.",
    ],
  },
  partage_notesLot: {
    titre: "Notes par critère",
    texte: [
      "Vous pouvez corriger la note de chaque critère ; le total se recalcule, et la copie est marquée « Score ajusté ».",
      "Les commentaires de l'IA ne changent pas : vérifiez qu'ils restent cohérents avec vos notes.",
    ],
  },
  partage_etudiantsNonReconnus: {
    titre: "Élèves non reconnus",
    texte: [
      "Ces copies portent un nom ou un e-mail qui ne correspond à aucun élève de vos classes.",
      "Choisissez la classe puis l'élève dans les listes sous chaque copie, pour retrouver son adresse e-mail.",
    ],
  },
  partage_rattacherEleve: {
    titre: "Rattacher la copie à un élève",
    texte: [
      "Associe la copie à un élève de vos classes : son nom et son e-mail sont repris de sa fiche, et sa note ira dans l'export Excel.",
      "Changer de classe vide le choix de l'élève. Si l'adresse manque, saisissez-la dans la case prévue.",
    ],
  },
  partage_envoyerBilan: {
    titre: "Envoyer le bilan",
    texte: [
      "Crée le PDF du bilan, l'envoie à l'élève avec le modèle d'e-mail de la barre latérale et l'enregistre dans l'Historique.",
      "Il faut une adresse e-mail. « Renvoyer » permet un second envoi.",
    ],
  },
  partage_corrigerCopie: {
    titre: "Corriger",
    texte: [
      "Ouvre une fenêtre pour corriger le texte de la copie (mots mal lus ou mal transcrits), puis refaire la notation de cette seule copie.",
      "La nouvelle évaluation remplace l'ancienne : les notes que vous aviez ajustées sont perdues.",
    ],
  },
  partage_relancerLecture: {
    titre: "Relancer la lecture (« OCR » / « Relire »)",
    texte: [
      "Relit la copie (ou retranscrit l'enregistrement) depuis le dossier source et remplace son texte.",
      "La note n'est pas recalculée : utilisez ensuite « Corriger » pour refaire la notation.",
    ],
  },
  partage_doubleEvalCopie: {
    titre: "Double évaluation d'une copie",
    texte: [
      "Fait relire cette copie par un second évaluateur, qui peut changer la note. La fiche est remplacée.",
      "« Diff. double éval. » montre ce que la seconde évaluation a modifié.",
      "Réservée au DELF.",
    ],
  },
  partage_garderSimple: {
    titre: "Garder l'évaluation simple",
    texte: [
      "La seconde évaluation de cette copie a échoué.",
      "Ce bouton conserve la note de la première évaluation, qui reste valable, comme résultat.",
    ],
  },
  partage_relancerEchecs: {
    titre: "Relancer",
    texte: [
      "Retente la correction des copies qui ont échoué, une par une. « Tout relancer » traite toutes les copies en erreur.",
      "Chaque nouvel essai utilise votre quota d'IA.",
    ],
  },
  partage_apercuPdf: {
    titre: "Aperçu et PDF",
    texte: [
      "« Aperçu » ouvre le bilan tel que l'élève le recevra, dans un nouvel onglet, sans rien enregistrer.",
      "« Générer PDFs » enregistre dans le dossier de sortie le PDF de toutes les copies réussies, sans envoyer d'e-mail.",
    ],
  },
  partage_exportExcel: {
    titre: "Exporter Excel",
    texte: [
      "Télécharge un tableau de notes à ouvrir dans Excel : une feuille par classe, plus une feuille « Sans classe ».",
      "Rattachez d'abord chaque copie à son élève, pour que les notes se placent dans la bonne classe.",
    ],
  },
  partage_envoyerEmails: {
    titre: "Envoyer les e-mails",
    texte: [
      "Envoie leur bilan PDF à tous les élèves du lot qui ont une adresse e-mail et n'ont pas encore été servis.",
      "Une confirmation indique d'abord le nombre de destinataires et les copies laissées de côté faute d'adresse.",
      "À la fin, un message récapitule les envois réussis et les échecs. Le lot reste affiché tant qu'un envoi a échoué.",
    ],
  },
  partage_retourLot: {
    titre: "Retour",
    texte: [
      "Quitte le lot affiché et revient à l'écran de départ. S'il reste des bilans non envoyés ou des notes ajustées, une confirmation vous est demandée.",
      "Pour retrouver le lot, utilisez « Récupérer le dernier lot évalué ».",
    ],
  },
  partage_livrablesDesktop: {
    titre: "Reprise avec l'IA de bureau",
    texte: [
      "« OCR échoués » et « Évals échouées » préparent un dossier d'échange pour que votre application d'IA de bureau rattrape seulement les copies en échec.",
      "« Importer livrables Desktop » récupère ses résultats. Ce qui sera importé (lecture des copies, correction ou double évaluation) est indiqué sous le bouton : c'est la dernière tâche préparée.",
    ],
  },
  partage_enAttenteEvaluation: {
    titre: "En attente d'évaluation",
    texte: [
      "Cette copie n'a que sa transcription (lecture seule).",
      "Vérifiez et corrigez le texte, puis lancez l'évaluation.",
    ],
  },
  partage_relancerAnalyse: {
    titre: "Relancer l'analyse",
    texte: [
      "Refait la correction à partir du texte que vous venez de corriger.",
      "Les notes précédentes de cette copie sont remplacées par le nouveau résultat.",
    ],
  },
} satisfies Record<string, EntreeAide>;
