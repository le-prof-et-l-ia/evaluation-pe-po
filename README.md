# Évaluation PE et PO (Public)

Application locale et unifiée d'évaluation assistée par IA pour les épreuves de **Production Écrite (PE)** et **Production Orale (PO)** du **DELF B1** et **DELF B2**.

## Fonctionnalités principales

- **Production Écrite (`/`)** :
  - Évaluation de copies manuscrites (OCR multimodal) ou dactylographiées.
  - Double évaluation avec arbitrage automatique.
  - Mode sans clé API via supervision externe (export/import Claude Web).
  - Génération de bilans PDF anonymes et détaillés pour l'apprenant.
  - Traitement unitaire et traitement par lot (SSE stream en temps réel).
- **Production Orale (`/po`)** :
  - Évaluation de transcriptions audio (monologue suivi, débat, entretien).
  - Mode en deux étapes (évaluation exposé partie 1 + relances / questions générées pour la partie 2 + bilan complet).
  - Générateur de sujets oraux DELF B1 / B2.
  - Bilans PDF oraux personnalisés.
- **Gestion commune** :
  - Clés API Google Gemini (gratuites et/ou payante) partagées entre PE et PO, avec bascule automatique entre les clés.
  - Gestion des classes et réconciliation automatique des apprenants.
  - Historique unifié avec filtrage par épreuve (`Toutes`, `Production Écrite`, `Production Orale`).

## Avant le premier lancement

1. **Installez Node.js** (version LTS) depuis [https://nodejs.org/](https://nodejs.org/), puis redémarrez l'ordinateur si l'application ne le détecte pas.
2. **Extrayez l'archive** (depuis GitHub : bouton vert **Code**, puis **Download ZIP**) dans un dossier de votre choix, de préférence en dehors de OneDrive, iCloud ou Google Drive (par exemple `C:\Correcteur` ou `Documents/Correcteur`). Ne lancez jamais l'application depuis l'intérieur du fichier ZIP.
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
