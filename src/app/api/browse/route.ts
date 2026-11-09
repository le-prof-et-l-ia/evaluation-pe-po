import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

function getWindowsDrives(): { name: string; path: string }[] {
  const drives: { name: string; path: string }[] = [];
  for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    const drivePath = `${letter}:/`;
    try {
      fs.accessSync(drivePath, fs.constants.R_OK);
      drives.push({ name: `${letter}:`, path: drivePath });
    } catch { /* drive not accessible */ }
  }
  return drives;
}

function getFavorites(): { name: string; path: string; icon: string }[] {
  const home = os.homedir();
  const favorites = [
    { name: 'Bureau', path: path.join(home, 'Desktop'), icon: '🖥️' },
    { name: 'Documents', path: path.join(home, 'Documents'), icon: '📄' },
    { name: 'Téléchargements', path: path.join(home, 'Downloads'), icon: '⬇️' },
    { name: 'Images', path: path.join(home, 'Pictures'), icon: '🖼️' },
  ];
  return favorites
    .filter(f => fs.existsSync(f.path))
    .map(f => ({ ...f, path: f.path.replace(/\\/g, '/') }));
}

export async function POST(req: Request) {
  try {
    const { dirPath } = await req.json();

    // Mode racine "Ce PC" : pas de chemin ou chemin spécial
    if (!dirPath || dirPath.trim() === '' || dirPath === 'ROOT') {
      const drives = getWindowsDrives();
      const favorites = getFavorites();
      return NextResponse.json({
        currentPath: 'Ce PC',
        parentPath: 'ROOT',
        isRoot: true,
        drives,
        favorites,
        folders: [],
        files: [],
      });
    }
    
    const targetPath = path.resolve(dirPath);

    if (!fs.existsSync(targetPath)) {
      return NextResponse.json({ error: 'Chemin introuvable.' }, { status: 404 });
    }

    const stat = fs.statSync(targetPath);
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: 'Ce chemin n\'est pas un dossier.' }, { status: 400 });
    }

    const entries = fs.readdirSync(targetPath, { withFileTypes: true });
    const folders = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== '.next')
      .map(e => ({
        name: e.name,
        path: path.join(targetPath, e.name).replace(/\\/g, '/'),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const files = entries
      .filter(e => e.isFile() && /\.(pdf|jpg|jpeg|png|txt)$/i.test(e.name))
      .map(e => e.name);

    // Déterminer le parent (remonter à "Ce PC" si on est à la racine d'un lecteur)
    const parentDir = path.dirname(targetPath).replace(/\\/g, '/');
    const isAtDriveRoot = /^[A-Z]:\/?$/i.test(targetPath.replace(/\\/g, '/'));
    const parentPath = isAtDriveRoot ? 'ROOT' : parentDir;

    return NextResponse.json({
      currentPath: targetPath.replace(/\\/g, '/'),
      parentPath,
      isRoot: false,
      folders,
      files,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
