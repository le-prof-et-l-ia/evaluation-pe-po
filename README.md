# Le Prof et l'IA

Application locale de **correction et de création d'épreuves assistée par IA**, pour les enseignants de français et de FLE.

Elle fonctionne avec une clé API Google Gemini (une clé gratuite suffit pour commencer), **ou sans aucune clé API** : vous confiez alors le travail à l'IA de votre choix (Claude, ChatGPT, Gemini…) dans le cadre de votre abonnement, par simple copier-coller.

## ⬇️ Télécharger l'application

**[Cliquez ici pour télécharger la dernière version (fichier ZIP)](https://github.com/le-prof-et-l-ia/evaluation-pe-po/archive/refs/heads/main.zip)**

Ce lien fournit toujours la version la plus récente. Consultez ensuite la section [Avant le premier lancement](#avant-le-premier-lancement).

## Ce que fait l'application

### Correction

- **DELF B1 et B2** : production écrite (PE) et production orale (PO), selon les grilles officielles.
  - À l'oral : monologue suivi, débat, entretien, avec une évaluation en deux étapes (exposé, puis relances et questions générées pour la seconde partie).
- **Dictées** : barème classique (/10) ou de concours (/20 avec points négatifs).
- **Rédactions** de niveau collège (type DNB) et **dissertations** de niveau lycée (type baccalauréat de français), sur 20.
- **Essais en langue étrangère**, **traductions**, **exercices de grammaire** et **interprétation consécutive**.
- Copies manuscrites (lecture automatique, OCR) ou dactylographiées ; enregistrements audio des productions orales (MP3, WAV, M4A…), transcrits automatiquement.
- Double évaluation avec arbitrage, correction unitaire ou par lot, bilans PDF anonymes et détaillés pour les apprenants, envoi des bilans par e-mail.

### Création d'épreuves FLE

- **Textes déclencheurs** adaptés d'articles de presse récents, pour la production écrite et la production orale (B1, B2, C1).
- **Épreuves complètes de compréhension écrite** : texte, questionnaire (QCM, vrai/faux, questions ouvertes), corrigé et barème.

### Deux façons d'utiliser l'IA

- **Avec une clé API Google Gemini** : tout est automatique. Plusieurs clés (gratuites et/ou payantes) peuvent être enregistrées, avec bascule automatique de l'une à l'autre.
- **Sans clé API** : l'application prépare les consignes, vous les soumettez à une IA externe avec votre abonnement, puis vous réimportez sa réponse. Ce mode couvre la lecture des copies, la transcription, l'évaluation et la double évaluation. La création d'épreuves nécessite en revanche une clé Gemini.

### Gestion

- Classes et réconciliation automatique des apprenants.
- Historique unifié, filtrable par épreuve (`Toutes`, `Production Écrite`, `Production Orale`).

## Avant le premier lancement

1. **Installez Node.js** (version LTS) depuis [https://nodejs.org/](https://nodejs.org/), puis redémarrez l'ordinateur si l'application ne le détecte pas.
2. **Téléchargez puis extrayez l'archive** ([lien direct vers le ZIP](https://github.com/le-prof-et-l-ia/evaluation-pe-po/archive/refs/heads/main.zip), ou sur GitHub : bouton vert **Code**, puis **Download ZIP**) dans un dossier de votre choix, de préférence en dehors de OneDrive, iCloud ou Google Drive (par exemple `C:\Correcteur` ou `Documents/Correcteur`). Ne lancez jamais l'application depuis l'intérieur du fichier ZIP.
3. **Prévoyez une connexion Internet et quelques minutes** : au premier lancement, l'application télécharge ses composants puis se compile. Les lancements suivants sont rapides.

## Lancement

### Windows
- **Lancement discret (recommandé)** : double-cliquez sur `Lancer_Arriere_Plan.vbs`. Aucune fenêtre de console ne s'affiche ; votre navigateur s'ouvre automatiquement sur `http://127.0.0.1:3000`. Au premier lancement, une fenêtre d'information vous prévient que l'installation est en cours : patientez sans relancer le fichier.
- **Lancement avec console** : double-cliquez sur `Lancer_Correcteur_Ameliore.bat`. La progression et les éventuelles erreurs s'affichent dans la fenêtre. Utilisez ce lanceur si le lancement discret signale une erreur.
- Si Windows affiche un avertissement de sécurité, choisissez « Exécuter » (ou « Informations complémentaires » puis « Exécuter quand même »).
- **Pour arrêter le serveur** : double-cliquez sur `Arreter_Serveur.bat` (ou tapez `Q` dans la console si vous avez utilisé le lanceur `.bat`).

En cas d'échec du lancement discret, les détails se trouvent dans `journal_installation.txt` ou `journal_compilation.txt`, dans le dossier de l'application.

### macOS
Le double-clic sur `Lancer_Correcteur.command` est généralement refusé par macOS (fichier téléchargé et non signé). Lancez-le plutôt depuis le Terminal :

1. Ouvrez l'application **Terminal** (Applications > Utilitaires).
2. Tapez `bash` suivi d'une espace, **sans appuyer sur Entrée**.
3. Faites glisser le fichier `Lancer_Correcteur.command` depuis le Finder dans la fenêtre du Terminal.
4. Appuyez sur Entrée.

Gardez la fenêtre du Terminal ouverte pendant l'utilisation. Pour arrêter le serveur : tapez `Q` puis Entrée dans cette fenêtre (ou lancez `Arreter_Serveur.command` de la même manière, avec `bash`).

### Manuel
```bash
npm install
npm run build
npm run start
```
Accédez ensuite à [http://127.0.0.1:3000](http://127.0.0.1:3000).

## Référentiels officiels

Les grilles d'évaluation et les descripteurs de performance du DELF sont publiés par France Éducation international. Consultez-les sur son site :

- [DELF B1](https://www.france-education-international.fr/diplome/delf-tout-public/niveau-b1)
- [DELF B2](https://www.france-education-international.fr/diplome/delf-tout-public/niveau-b2)

L'application intègre ses propres critères d'évaluation : elle n'a pas besoin de ces documents pour fonctionner.
