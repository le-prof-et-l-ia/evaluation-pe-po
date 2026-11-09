import { NextResponse } from 'next/server';
import { closePdfBrowser } from '@/lib/pdfGenerator';

export async function POST() {
  setTimeout(async () => {
    console.log("Arrêt du serveur...");
    // Fermer le navigateur partagé de génération des PDF, sinon le processus
    // Chrome peut survivre à l'arrêt du serveur.
    await closePdfBrowser().catch(() => {});
    process.exit(0);
  }, 1000);

  return NextResponse.json({ success: true, message: "Arrêt du serveur en cours..." });
}
