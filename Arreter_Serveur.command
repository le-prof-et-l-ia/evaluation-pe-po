#!/bin/bash
export PATH="/usr/sbin:/usr/bin:/bin:$PATH"
cd "$(dirname "$0")"

echo "==================================================="
echo "    Arrêt de Le Prof et l'IA..."
echo "==================================================="
echo ""

# Tuer proprement le processus écoutant sur le port 3000
PIDS=$(lsof -ti:3000 2>/dev/null)
if [ -n "$PIDS" ]; then
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
    echo "[OK] Serveur arrêté et port 3000 libéré."
else
    echo "[INFO] Aucun serveur actif détecté sur le port 3000."
fi

sleep 2
exit 0
