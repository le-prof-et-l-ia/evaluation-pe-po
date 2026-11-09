import type { EntreeAide } from "./aide";

/** Textes d'aide : écrans et fenêtres communs (en-tête, sélecteur de dossier, bilan, historique, générateur, paramètres, comparaison, panneau d'épreuves personnalisées). Clés « c_ ». Voir les règles de rédaction dans aide.ts. */
export const AIDE_COMPOSANTS = {
  // ------------------------------------------------ En-tête (HeaderNav)
  c_brouillons: {
    titre: "Brouillons",
    texte: [
      "Ce sont les candidats dont le monologue est évalué et dont l'interaction reste à faire (épreuve en deux temps).",
      "Cliquez pour ouvrir la liste et reprendre un dossier là où vous vous étiez arrêté.",
    ],
  },
  c_pastilleOrale: {
    titre: "Nombre de brouillons",
    texte: [
      "Ce chiffre indique combien d'oraux commencés (première partie faite) attendent encore leur seconde partie.",
    ],
  },
  c_parametresNav: {
    titre: "Paramètres",
    texte: [
      "Ouvre l'écran des clés Gemini, du compte e-mail d'envoi des bilans, et du nettoyage de l'espace disque (suppression des anciens bilans).",
    ],
  },
  c_adresseLocale: {
    titre: "Adresse du programme",
    texte: [
      "C'est l'adresse du programme sur votre ordinateur. Elle ne change pas et il n'y a rien à régler.",
      "Le point à gauche est vert quand le programme répond, rouge quand il ne répond plus (par exemple si vous avez quitté l'application). Il est vérifié toutes les 30 secondes.",
    ],
  },

  // ------------------------------------------------ Sélecteur de dossier
  c_selectionnerDossier: {
    titre: "Sélectionner ce dossier",
    texte: [
      "Ouvrez d'abord le dossier voulu en cliquant sur son nom : vous devez être à l'intérieur.",
      "Puis cliquez ici : c'est le chemin affiché en bas à gauche qui est retenu.",
    ],
  },
  c_raccourcisDossiers: {
    titre: "Raccourcis",
    texte: [
      "La maison revient à la liste des disques de l'ordinateur.",
      "Bureau, Documents et Téléchargements ouvrent directement ces dossiers de votre session.",
    ],
  },
  c_fichiersTraitables: {
    titre: "Fichiers traitables",
    texte: [
      "Nombre de fichiers que le programme sait lire dans le dossier ouvert : PDF, photos (JPG, PNG), textes (.txt) et enregistrements audio (MP3, WAV, M4A, OGG, WebM, AAC, FLAC, CAF).",
      "Les autres types de fichiers ne sont pas comptés ici.",
    ],
  },

  // ------------------------------------------------ Bilan
  c_noteCritere: {
    titre: "Note d'un critère",
    texte: [
      "Vous pouvez corriger la note proposée par l'IA : la note finale se recalcule seule.",
      "Générez ensuite le PDF pour conserver vos changements. Avec le barème DELF, seuls les paliers officiels sont proposés.",
    ],
  },
  c_motsSurlignes: {
    titre: "Mots surlignés",
    texte: [
      "Chaque faute repérée est surlignée dans le texte.",
      "Passez la souris sur un mot surligné pour voir la correction attendue et la règle. Dans le PDF, le mot fautif est barré.",
    ],
  },
  c_classeBilan: {
    titre: "Classe du bilan",
    texte: [
      "Choisissez la classe pour retrouver l'élève dans votre liste et rattacher le bilan à sa fiche.",
      "La croix, ou « Non définie », retire le rattachement et remet le nom lu sur la copie.",
    ],
  },
  c_emailBilan: {
    titre: "Adresse e-mail",
    texte: [
      "Adresse à laquelle « Valider et Envoyer l'E-mail » enverra le PDF. Si elle est vide, aucun e-mail n'est envoyé.",
      "Elle est aussi enregistrée dans la fiche de l'élève au moment de l'envoi.",
    ],
  },
  c_identiteEleve: {
    titre: "Nom de l'étudiant",
    texte: [
      "Nom lu sur la copie. « auto » : l'élève a été reconnu dans votre classe. Vos corrections de nom s'enregistrent toutes seules.",
      "Taper un autre nom détache l'élève de sa fiche. « Choisir dans la classe » reprend nom et e-mail ; cliquez sur une proposition de nom voisin, ou sur « Ignorer ».",
    ],
  },
  c_voirSujet: {
    titre: "Sujet de la copie",
    texte: [
      "Ouvre le sujet avec la copie (ou la transcription) pour les relire côte à côte.",
      "« Modifier » permet de corriger le sujet ; il sera inscrit dans le bilan.",
    ],
  },
  c_repli: {
    titre: "Changement de modèle",
    texte: [
      "L'IA prévue n'était pas disponible (quota atteint ou erreur) : un autre modèle a corrigé à sa place.",
      "Le résultat reste valable ; vérifiez-le comme d'habitude.",
    ],
  },
  c_deuxiemeEval: {
    titre: "Seconde évaluation du bilan",
    texte: [
      "• 2e éval. (externe) : sans clé, vous copiez la demande dans une autre IA (Claude, ChatGPT), puis collez sa réponse ici.",
      "• 2e éval. (interne) : une autre IA, avec vos clés, refait la correction à partir de la première. Elle remplace le résultat affiché, retouches manuelles comprises : faites-la avant de modifier.",
    ],
  },
  c_voirDifferences: {
    titre: "Voir les différences",
    texte: [
      "Compare la première et la seconde correction, critère par critère.",
      "S'il y a un arbitrage, le commentaire de la 3e évaluation vous aide à décider ; il reste à l'écran et n'est pas dans le PDF.",
    ],
  },
  c_descripteurs: {
    titre: "Explication de la note",
    texte: [
      "Justification rédigée par l'IA. Vous pouvez la réécrire : ce texte figure dans le PDF et l'e-mail envoyés à l'élève.",
    ],
  },
  c_axesAmelioration: {
    titre: "Axes d'amélioration",
    texte: [
      "Conseils personnalisés pour l'élève, modifiables.",
      "Laissez la zone vide pour ne pas les inclure dans le PDF.",
    ],
  },
  c_notationPo: {
    titre: "Notation (oral)",
    texte: [
      "« Détaillée » permet de noter par demi-point ; « DELF » ne propose que les paliers officiels du barème.",
      "Changer ce choix ne modifie pas les notes déjà données.",
    ],
  },
  c_genererPdf: {
    titre: "Générer PDF",
    texte: [
      "Fabrique le PDF du bilan, le télécharge et en garde un exemplaire dans votre dossier de sortie.",
      "Le bilan est aussi enregistré dans l'Historique.",
    ],
  },
  c_validerEnvoyer: {
    titre: "Valider et envoyer l'e-mail",
    texte: [
      "Génère le PDF, l'envoie à l'adresse de l'élève avec le compte e-mail réglé dans Paramètres, puis l'enregistre dans l'Historique.",
      "Vérifiez l'adresse avant de cliquer.",
    ],
  },
  c_imprimerExporter: {
    titre: "Imprimer / Exporter MD",
    texte: [
      "« Imprimer le Bilan » ouvre l'impression du navigateur (papier ou PDF) ; rien n'est enregistré.",
      "« Exporter MD » télécharge le bilan en fichier texte (.md), utile pour l'archiver. Il se ré-importe depuis l'Historique.",
    ],
  },

  // ------------------------------------------------ Historique
  c_histImporter: {
    titre: "Importer des bilans",
    texte: [
      "Ajoute à l'historique des bilans exportés auparavant (« Exporter MD ») ou reçus d'une IA externe : fichiers .md, .json ou .txt.",
      "Si un bilan porte le même identifiant qu'un bilan déjà présent, il le remplace : l'application vous demande confirmation avant.",
    ],
  },
  c_histSync: {
    titre: "Synchroniser maintenant",
    texte: [
      "Certaines copies corrigées dans votre lot ne sont pas encore archivées.",
      "Ce bouton les enregistre dans l'Historique pour que vous les retrouviez plus tard.",
    ],
  },
  c_histVoir: {
    titre: "Ouvrir un bilan",
    texte: [
      "Rouvre ce bilan dans l'écran de correction pour le relire, le modifier ou le renvoyer.",
      "Ce qui était affiché dans l'écran de correction est remplacé.",
    ],
  },
  c_histFiltres: {
    titre: "Filtres de l'historique",
    texte: [
      "Épreuve : PE = production écrite, PO = production orale.",
      "Niveau : B1 ou B2. Les types d'épreuve présents dans l'historique (dictée, traduction, etc.) sont proposés à la suite. Un niveau absent s'affiche « Non précisé ».",
    ],
  },
  c_histSupprimer: {
    titre: "Supprimer de l'historique",
    texte: [
      "La corbeille d'une ligne retire ce bilan de l'historique ; « Tout supprimer » vide tout l'historique.",
      "Les fichiers sont envoyés à la corbeille de Windows. Les PDF déjà créés dans votre dossier de sortie ne sont pas touchés.",
    ],
  },

  // ------------------------------------------------ Générateur d'épreuves
  c_genDiffuseurs: {
    titre: "Sources des articles",
    texte: [
      "Le programme cherche les articles dans une liste de médias francophones (TV, radio, presse) à accès libre.",
      "Survolez le badge pour voir la liste.",
    ],
  },
  c_genNiveau: {
    titre: "Niveau visé",
    texte: [
      "Le niveau fixe la difficulté du texte et propose une longueur adaptée (B1 : 180 mots, B2 et C1 : 250 mots), que vous pouvez modifier ensuite.",
    ],
  },
  c_genNbArticles: {
    titre: "Nombre d'articles (C1)",
    texte: [
      "Un dossier C1 oppose plusieurs points de vue.",
      "Avec 2 articles, l'un défend l'idée et l'autre la critique ; avec 3, un article d'expert s'ajoute.",
    ],
  },
  c_genLongueur: {
    titre: "Longueur du texte",
    texte: [
      "Longueur voulue, en mots. Le programme vérifie le nombre de mots après génération et accepte un écart de 5 %.",
      "« Définir un intervalle personnalisé » remplace cette tolérance par vos propres minimum et maximum.",
    ],
  },
  c_genMode: {
    titre: "Mode de recherche",
    texte: [
      "• 1-Clic : le programme choisit l'article pour vous.",
      "• Choisir : vous voyez une liste d'articles avant de décider.",
      "• Manuel : vous fournissez votre propre article, par son adresse ou en collant le texte.",
    ],
  },
  c_genSource: {
    titre: "Article source (mode Manuel)",
    texte: [
      "Collez l'adresse OU le texte de l'article. Si vous remplissez les deux, c'est le texte qui est utilisé.",
      "Seul le début d'un texte très long est transmis à l'IA.",
    ],
  },
  c_genCe: {
    titre: "Compréhension écrite (CE)",
    texte: [
      "Cochez pour obtenir une épreuve de compréhension complète : un article, des questions et le corrigé avec barème.",
      "Elle remplace le sujet de production écrite.",
    ],
  },
  c_genTexteSupport: {
    titre: "Article adapté ou original",
    texte: [
      "• Adapté : l'IA réécrit l'article au niveau et à la longueur choisis.",
      "• Original : le texte du journal est repris tel quel, parfois plus long ou plus difficile que le niveau visé.",
    ],
  },
  c_genQuestions: {
    titre: "Questions et points",
    texte: [
      "Choisissez le nombre de questions et le total de points : l'IA répartit ces points entre les questions.",
      "Cochez au moins un type de question : QCM, Vrai/Faux avec justification, ou champ de réponse (question ouverte courte).",
    ],
  },
  c_genChoisir: {
    titre: "Choisir cet article",
    texte: [
      "Génère l'épreuve à partir de cet article, sans autre confirmation.",
      "Cela utilise votre quota d'IA.",
    ],
  },
  c_genVues: {
    titre: "Fiche apprenant, corrigé, vue intégrale",
    texte: [
      "« Fiche Apprenant » : la version à distribuer. « Corrigé & Barème » : pour vous.",
      "« Vue Intégrale » réunit les deux ; ne l'imprimez pas pour les élèves.",
    ],
  },
  c_genCopierImprimer: {
    titre: "Copier et imprimer",
    texte: [
      "Les boutons « Copier » placent le texte dans le presse-papiers, pour le coller dans Word.",
      "« Imprimer » imprime l'onglet affiché : choisissez « Fiche Apprenant » pour la version élève.",
    ],
  },
  c_genTelecharger: {
    titre: "Télécharger (.md)",
    texte: [
      "Pour une épreuve de compréhension écrite, deux fichiers sont proposés : « Épreuve (élèves) » contient le texte et les questions sans corrigé ; « Corrigé (enseignant) » contient en plus le corrigé et le barème.",
      "Pour un sujet de production écrite, un seul fichier est téléchargé.",
    ],
  },
  c_genUtiliserSujet: {
    titre: "Utiliser comme sujet",
    texte: [
      "Reprend le thème et le ou les textes comme sujet de la correction, et vous y ramène.",
      "Les questions et le corrigé ne sont pas repris.",
    ],
  },
  c_genOralGenerer: {
    titre: "Générer le sujet pour l'oral",
    texte: [
      "Crée les documents à présenter au candidat (1 à 3 textes selon le niveau).",
      "Les questions de l'examinateur ne sont pas créées ici. « Copier tout le dossier » copie les documents d'un coup.",
    ],
  },

  // ------------------------------------------------ Paramètres
  c_paramModeCles: {
    titre: "Mode d'utilisation des clés",
    texte: [
      "• Gratuit + Payant : vos clés gratuites sont utilisées d'abord, puis la clé payante quand elles sont épuisées.",
      "• Gratuit uniquement : la clé payante n'est jamais utilisée, rien n'est facturé.",
      "• Payant uniquement : seule la clé payante est utilisée.",
    ],
  },
  c_paramClesGratuites: {
    titre: "Clés gratuites",
    texte: [
      "Collez ici vos clés Gemini gratuites (obtenues sur Google AI Studio), une par ligne.",
      "Plusieurs clés permettent de corriger plus de copies par jour.",
    ],
  },
  c_paramClePayante: {
    titre: "Clé payante",
    texte: [
      "Facultatif. Clé associée à un compte facturé : elle ne sert que si le mode l'autorise, par exemple quand les clés gratuites sont épuisées, et peut entraîner des frais.",
    ],
  },
  c_paramEmail: {
    titre: "Compte e-mail d'envoi",
    texte: [
      "Votre adresse Gmail et un mot de passe d'application : un code de 16 caractères créé dans votre compte Google (avec la validation en 2 étapes). Ce n'est pas votre mot de passe habituel.",
      "« Tester la connexion » vérifie que Gmail accepte ces identifiants, sans envoyer d'e-mail.",
    ],
  },
  c_paramSignature: {
    titre: "Signature d'e-mail",
    texte: [
      "Nom qui termine vos messages aux élèves (par exemple « Mme Martin »).",
      "Il est ajouté au message type, que vous pouvez encore modifier avant l'envoi.",
    ],
  },
  c_paramSauvegardeAuto: {
    titre: "Enregistrement des réglages",
    texte: [
      "Vos clés et vos réglages d'e-mail sont enregistrés automatiquement sur cet ordinateur, dans ce navigateur.",
      "Il n'y a pas de bouton « Enregistrer ».",
    ],
  },
  c_paramEspace: {
    titre: "Espace utilisé",
    texte: [
      "Place occupée par vos bilans (PDF et fichiers de résultats). Le bouton rond actualise le chiffre.",
      "Les copies originales ne sont pas comptées.",
    ],
  },
  c_paramNettoyer: {
    titre: "Nettoyer avant une date",
    texte: [
      "Retire les PDF, les fichiers de résultats et les entrées d'historique créés avant la date choisie ; ils sont envoyés à la corbeille de Windows.",
      "Vérifiez la date avant de cliquer : par défaut, c'est il y a six mois. Une confirmation vous est demandée.",
    ],
  },
  c_paramPurge: {
    titre: "Purge de l'application",
    texte: [
      "Efface tous vos bilans et l'historique, après confirmation ; les fichiers vont à la corbeille de Windows.",
      "Vos classes, vos clés et votre e-mail restent intacts.",
    ],
  },

  // ------------------------------------------------ Fenêtres de comparaison et de reprise
  c_cmpColonnes: {
    titre: "Comparaison des évaluations",
    texte: [
      "La copie a été corrigée deux fois, par deux IA différentes : vous voyez ici les deux notes, critère par critère.",
      "Une pastille verte indique que la seconde correction donne plus de points, rouge qu'elle en donne moins.",
    ],
  },
  c_cmpNoteFinale: {
    titre: "Note finale retenue",
    texte: [
      "C'est la note de la seconde évaluation s'il y en a une, sinon celle de la première : ce n'est pas une moyenne.",
      "Vous pouvez la modifier ensuite dans le rapport.",
    ],
  },
  c_cmpFeedbacks: {
    titre: "Feedbacks modifiés",
    texte: [
      "Seuls les commentaires qui ont changé d'une correction à l'autre sont affichés. S'il n'y en a pas, rien n'apparaît.",
    ],
  },
  c_cmpFautes: {
    titre: "Fautes non repérées au départ",
    texte: [
      "Fautes trouvées par la seconde IA et oubliées par la première.",
      "La comparaison se fait sur le mot ou l'expression : deux écritures proches peuvent être comptées comme différentes.",
    ],
  },
  c_recGarder: {
    titre: "Conserver l'évaluation simple",
    texte: [
      "La seconde correction a échoué. Vous gardez la première, qui reste valable, sans la contre-vérification.",
      "Aucun appel à l'IA n'est fait.",
    ],
  },
  c_recModele: {
    titre: "Modèle de la seconde correction",
    texte: [
      "Choisissez l'IA qui fera la seconde correction. Léger : plus rapide et économe. Lourd : plus précis, mais plus lent et plus coûteux en quota.",
      "Cliquer ici ne lance rien : validez avec « Relancer la double évaluation ».",
    ],
  },
  c_recRelancer: {
    titre: "Relancer la double évaluation",
    texte: [
      "Demande de nouveau la seconde correction avec le modèle choisi. Cela peut prendre une minute et utilise votre quota d'IA.",
      "Le résultat remplace celui affiché et est enregistré dans l'Historique.",
    ],
  },
  c_recAbandonner: {
    titre: "Abandonner la double évaluation",
    texte: [
      "Ferme cette fenêtre et renonce à la seconde correction. La première évaluation reste affichée et utilisable.",
      "Vous pourrez relancer une double évaluation plus tard depuis le bilan.",
    ],
  },

  // ------------------------------------------------ Panneau d'épreuves personnalisées
  c_cfgCharger: {
    titre: "Charger un modèle",
    texte: [
      "Préremplit les réglages avec un modèle que vous avez enregistré (★ = modèle personnel).",
      "Les champs vides du modèle ne remplacent pas ce que vous avez déjà saisi. Le menu n'apparaît que s'il existe des modèles pour ce type d'épreuve.",
    ],
  },
  c_cfgEnregistrer: {
    titre: "Enregistrer un modèle",
    texte: [
      "Sauvegarde les réglages actuels pour les réutiliser plus tard : donnez un nom au modèle, puis validez.",
      "Le modèle reste sur cet ordinateur, dans ce navigateur : il n'est pas partagé avec un autre poste.",
    ],
  },
  c_cfgTexteDictee: {
    titre: "Texte officiel de la dictée",
    texte: [
      "Collez le texte tel que vous l'avez dicté, avec sa ponctuation.",
      "Chaque écart de la copie sera relevé par rapport à ce texte. Champ obligatoire.",
    ],
  },
  c_cfgNoteDepart: {
    titre: "Note de départ",
    texte: [
      "Note d'une copie sans aucune faute. Les pénalités sont retirées de ce nombre.",
    ],
  },
  c_cfgPenalites: {
    titre: "Pénalités par type de faute",
    texte: [
      "Indiquez combien de points une faute de chaque type fait perdre.",
      "L'IA range chaque erreur dans une catégorie ; le total est ensuite calculé automatiquement.",
    ],
  },
  c_cfgOptionsNote: {
    titre: "Faute répétée et note négative",
    texte: [
      "« Ne pénaliser qu'une seule fois » : si un élève écrit trois fois le même mot faux, il perd les points une seule fois.",
      "« Autoriser une note finale négative » : sans cette case, la note ne descend jamais en dessous de 0.",
    ],
  },
  c_cfgTexteSource: {
    titre: "Texte source et traduction de référence",
    texte: [
      "Texte source : collez le texte que les élèves devaient traduire.",
      "Traduction de référence (facultative) : votre propre traduction. L'IA s'en sert comme repère, mais d'autres traductions valables restent acceptées.",
    ],
  },
  c_cfgLangues: {
    titre: "Langues source et cible",
    texte: [
      "Écrivez le nom des langues en toutes lettres, par exemple « Anglais » vers « Français ».",
      "Ce texte est transmis tel quel à l'IA.",
    ],
  },
  c_cfgEnonce: {
    titre: "Énoncé, questions ou discours source",
    texte: [
      "Collez le texte tel que les élèves l'ont eu : énoncé des exercices, sujet de la composition, ou discours que l'interprète devait restituer.",
      "L'IA s'en sert pour juger la copie. Le corpus de documents d'une composition est facultatif.",
    ],
  },
  c_cfgCorrige: {
    titre: "Corrigé et barème par question",
    texte: [
      "Notez pour chaque question la bonne réponse et son nombre de points (par exemple « Q1 : qu'il vienne (2 pts) »).",
      "Plus c'est précis, plus la correction est fidèle. L'IA évalue question par question, puis le total est calculé automatiquement.",
    ],
  },
  c_cfgModalite: {
    titre: "Modalité d'interprétation",
    texte: [
      "Consécutive : l'interprète parle après le discours. Simultanée : il parle en même temps.",
      "Ce choix est transmis à l'IA, qui adapte ses attentes.",
    ],
  },
  c_cfgTypeComposition: {
    titre: "Type de composition",
    texte: [
      "Choisissez le type de texte à évaluer : il détermine la grille de critères.",
      "Pour des élèves de FLE, prenez « Essai argumenté ».",
    ],
  },
  c_cfgGrilleLibre: {
    titre: "Grille de critères personnelle",
    texte: [
      "À cocher seulement si vous voulez votre propre barème à la place de la grille officielle.",
      "Les notes seront moins comparables d'une copie à l'autre : rédigez des critères précis, avec les points.",
    ],
  },
  c_cfgConsignes: {
    titre: "Consignes de correction",
    texte: [
      "Ajoutez ce que l'IA doit surveiller (par exemple « Pénaliser le tutoiement »).",
      "Avec une grille personnelle, indiquez ici chaque critère et ses points : le champ devient obligatoire.",
    ],
  },
} satisfies Record<string, EntreeAide>;
