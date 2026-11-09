#!/bin/bash
# Forcer le terminal à se situer dans le dossier du script
cd "$(dirname "$0")"

# Charger les chemins usuels sur macOS (Homebrew Apple Silicon/Intel, MacPorts, NVM, Volta, fnm)
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
if [ -d "$HOME/.nvm" ]; then
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" 2>/dev/null
fi
if [ -d "$HOME/.volta/bin" ]; then
    export PATH="$HOME/.volta/bin:$PATH"
fi
if [ -d "$HOME/.fnm" ]; then
    export PATH="$HOME/.fnm:$PATH"
fi

echo "===================================================================="
echo "         Evaluation DELF B1/B2 (PE & PO) - Lanceur macOS"
echo "===================================================================="
echo ""

# 1. Vérification des prérequis (Node.js)
if ! command -v node >/dev/null 2>&1; then
    echo "[ERREUR] Node.js n'est pas installé ou n'est pas dans le PATH."
    echo "Veuillez installer Node.js depuis https://nodejs.org/ pour lancer l'application."
    echo ""
    read -n 1 -s -r -p "Appuyez sur une touche pour quitter..."
    echo ""
    exit 1
fi

# 2. Vérification et installation automatique des dépendances (node_modules)
if [ ! -d "node_modules" ]; then
    echo "[INFO] Dossier node_modules absent. Installation des dépendances..."
    npm install
    if [ $? -ne 0 ]; then
        echo "[ERREUR] L'installation des dépendances a échoué."
        read -n 1 -s -r -p "Appuyez sur une touche pour quitter..."
        echo ""
        exit 1
    fi
fi

# 3. Libération du port 3000 si déjà occupé
echo "[1/3] Nettoyage du port 3000..."
PIDS=$(lsof -ti:3000 2>/dev/null)
if [ -n "$PIDS" ]; then
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
fi

# 4. Démarrage du serveur local
echo "[2/3] Démarrage du serveur local Next.js..."
# Compilation optimisée (mode production), uniquement si le code a changé
if [ ! -f ".next/BUILD_ID" ] || [ -n "$(find src package.json next.config.ts -newer .next/BUILD_ID 2>/dev/null | head -n 1)" ]; then
    echo "[INFO] Compilation de l'application en cours (peut prendre une minute)..."
    npm run build || {
        echo ""
        echo "[ERREUR] La compilation a échoué."
        read -n 1 -s -r -p "Appuyez sur une touche pour quitter..."
        echo ""
        exit 1
    }
fi

npm run start &
NODE_PID=$!

# Définir une fonction pour arrêter le serveur proprement
cleanup() {
    trap - SIGINT SIGTERM SIGHUP EXIT
    echo ""
    echo "Arrêt du serveur et libération du port 3000..."
    if [ -n "$NODE_PID" ]; then
        kill -TERM "$NODE_PID" 2>/dev/null || kill -9 "$NODE_PID" 2>/dev/null || true
    fi
    PIDS=$(lsof -ti:3000 2>/dev/null)
    if [ -n "$PIDS" ]; then
        echo "$PIDS" | xargs kill -9 2>/dev/null || true
    fi
    echo "Au revoir !"
    exit 0
}
trap cleanup SIGINT SIGTERM SIGHUP

# 5. Attente dynamique du serveur (Polling actif sur 127.0.0.1)
echo "[3/3] Attente du chargement de l'application..."
echo ""
echo "Note : Ne fermez pas cette fenêtre pendant l'utilisation."
echo ""

max_attempts=30
attempt=0
server_ready=0

while [ $attempt -lt $max_attempts ]; do
    attempt=$((attempt + 1))
    # Tester si le port 3000 répond sur 127.0.0.1
    if nc -z 127.0.0.1 3000 2>/dev/null; then
        server_ready=1
        break
    fi
    echo -n "."
    sleep 1
done

if [ $server_ready -eq 0 ]; then
    echo ""
    echo "[ATTENTION] Le serveur met du temps à répondre."
    echo "Ouverture du navigateur tout de même..."
fi

echo ""
echo "[OK] Serveur détecté et actif !"
echo "Ouverture de l'application dans votre navigateur..."
open http://127.0.0.1:3000

echo ""
echo "===================================================================="
echo "--- SERVEUR ACTIF (http://127.0.0.1:3000) ---"
echo ""
echo "IMPORTANT : Ne fermez pas cette fenêtre Terminal pendant votre travail !"
echo ""
echo "Pour arrêter proprement le serveur lorsque vous avez terminé :"
echo "Tapez 'Q' et appuyez sur Entrée (ou faites Ctrl+C)."
echo "===================================================================="
echo ""

while true; do
    read -r -p "Arrêter le serveur ? (Tapez Q pour quitter) : " user_choice
    case "$user_choice" in
        [Qq]*) cleanup ;;
    esac
done
