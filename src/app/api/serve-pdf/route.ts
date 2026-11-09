import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * Sert un document source ou un bilan déjà généré.
 *
 * Cette route lisait auparavant N'IMPORTE QUEL chemin transmis en paramètre :
 * `?path=C:\Users\...\.env.local` renvoyait le contenu du fichier. Deux garde-fous
 * la ramènent à son usage réel :
 *
 *  1. Extension : seuls les documents affichables (PDF, images) sont servis.
 *     La route ne peut donc plus servir de primitive de lecture générique sur
 *     les clés, fichiers de configuration ou bases de données locales.
 *  2. Confinement : le fichier doit se trouver dans les dossiers de travail de
 *     l'application, ou dans le dossier de lot que l'interface transmet
 *     explicitement (`root`).
 *
 * La frontière de sécurité principale reste l'écoute sur 127.0.0.1 uniquement
 * (voir le script `dev` de package.json) : l'application n'est pas exposée au
 * réseau local.
 */

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png']);

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

function isInside(root: string, candidate: string): boolean {
  const withSep = root.endsWith(path.sep) ? root : root + path.sep;
  return candidate === root || candidate.startsWith(withSep);
}

/** Dossiers dans lesquels la lecture est autorisée. */
function allowedRoots(req: NextRequest): string[] {
  const roots = [
    path.resolve(process.cwd(), 'data', 'outputs'),
    path.resolve(process.cwd(), 'data', 'inputs'),
  ];
  // Dossier de lot / de sortie choisi par l'utilisateur dans l'interface.
  for (const param of ['root', 'outputFolder']) {
    const value = req.nextUrl.searchParams.get(param);
    if (value && value.trim() !== '') {
      roots.push(path.resolve(value));
    }
  }
  return roots;
}

export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get('path');

  if (!filePath) {
    return NextResponse.json({ error: 'Chemin manquant.' }, { status: 400 });
  }

  const resolvedPath = path.resolve(filePath);
  const extension = path.extname(resolvedPath).toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return NextResponse.json(
      { error: 'Type de fichier non autorisé (PDF et images uniquement).' },
      { status: 400 }
    );
  }

  if (!allowedRoots(req).some(root => isInside(root, resolvedPath))) {
    return NextResponse.json(
      { error: "Accès refusé : ce fichier est hors des dossiers de travail de l'application." },
      { status: 403 }
    );
  }

  if (!fs.existsSync(resolvedPath)) {
    return NextResponse.json({ error: 'Fichier introuvable.' }, { status: 404 });
  }

  const buffer = fs.readFileSync(resolvedPath);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': MIME_BY_EXTENSION[extension] || 'application/octet-stream',
      'Content-Disposition': 'inline',
    },
  });
}
