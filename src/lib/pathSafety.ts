/**
 * Sécurité des chemins de fichiers et suppression sans interpolation shell.
 *
 * Ce module est partagé à l'identique entre `correcteur-PO` et `correcteur-PE`.
 *
 * Il répond à deux problèmes distincts :
 *  1. Les identifiants reçus par les routes API (`?id=...`, `/pending/[id]`) étaient
 *     concaténés directement dans un chemin : un `id` du type `../../autre/fichier`
 *     permettait de lire ou de supprimer n'importe quel fichier du disque.
 *  2. La mise à la corbeille construisait une commande PowerShell par concaténation
 *     de chaînes : un chemin contenant un guillemet cassait le parsing de `cmd /c`
 *     et permettait l'exécution de commandes arbitraires.
 */
import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Un identifiant d'évaluation / de brouillon est toujours généré par
 * `Date.now().toString()` (éventuellement suffixé). On n'accepte donc que des
 * caractères alphanumériques simples : ni séparateur de chemin, ni point, ni
 * caractère susceptible d'avoir un sens pour le système de fichiers.
 */
export function isSafeId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

/**
 * Construit un chemin à l'intérieur de `baseDir` et vérifie que le résultat
 * ne s'en échappe pas. Renvoie `null` si le nom est invalide ou s'évade.
 */
export function safeJoin(baseDir: string, ...segments: string[]): string | null {
  const resolvedBase = path.resolve(baseDir);
  const candidate = path.resolve(resolvedBase, ...segments);
  const withSep = resolvedBase.endsWith(path.sep) ? resolvedBase : resolvedBase + path.sep;
  if (candidate !== resolvedBase && !candidate.startsWith(withSep)) {
    return null;
  }
  return candidate;
}

/** Caractères interdits dans un nom de fichier Windows, séparateurs inclus. */
const FORBIDDEN_FILENAME_CHARS = new Set(['<', '>', ':', '"', '/', '|', '?', '*']);

/**
 * Nettoie une chaîne pour en faire un nom de fichier valide sous Windows,
 * macOS et Linux. Supprime tout séparateur de chemin ainsi que les caractères
 * de contrôle : le résultat ne peut donc jamais faire sortir du dossier de
 * destination, quel que soit le nom saisi ou renvoyé par le modèle.
 */
export function sanitizeFilename(name: string): string {
  let out = '';
  for (const ch of String(name ?? '')) {
    const code = ch.codePointAt(0) ?? 0;
    const isControl = code < 32 || code === 127;
    const isBackslash = code === 92;
    out += (isControl || isBackslash || FORBIDDEN_FILENAME_CHARS.has(ch)) ? '_' : ch;
  }
  return out
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+|[._]+$/g, '') // évite ".", "..", et les noms cachés
    .trim()
    .slice(0, 100);
}

/**
 * Horodatage utilisable comme nom de fichier : `2026-09-10_14h32m05s`.
 * Sert de nom de repli lorsqu'aucun nom d'apprenant n'est disponible ; il est
 * unique à la seconde près, ce qui évite l'écrasement silencieux des bilans
 * anonymes entre eux.
 */
export function timestampSlug(date: Date = new Date()): string {
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p2(date.getMonth() + 1)}-${p2(date.getDate())}` +
         `_${p2(date.getHours())}h${p2(date.getMinutes())}m${p2(date.getSeconds())}s`;
}

/**
 * Renvoie un chemin libre dans `dir` : si `<base><ext>` existe déjà, on
 * suffixe `_2`, `_3`, … Évite qu'un second bilan portant le même nom écrase
 * silencieusement le premier (homonymes, copies « Anonyme », relances).
 */
export async function uniqueFilePath(dir: string, baseName: string, ext: string): Promise<string> {
  const safeBase = sanitizeFilename(baseName) || 'Bilan';
  let candidate = path.join(dir, `${safeBase}${ext}`);
  let counter = 2;
  // 500 : garde-fou, on ne boucle jamais indéfiniment.
  while (counter < 500) {
    try {
      await fs.access(candidate);
    } catch {
      return candidate; // le fichier n'existe pas : chemin libre
    }
    candidate = path.join(dir, `${safeBase}_${counter}${ext}`);
    counter++;
  }
  return path.join(dir, `${safeBase}_${Date.now()}${ext}`);
}

/**
 * Variable d'environnement servant à transmettre les chemins à PowerShell.
 * Passer par l'environnement plutôt que par la ligne de commande supprime
 * toute possibilité d'injection : la valeur n'est jamais interprétée comme
 * du code, ni par `cmd.exe`, ni par PowerShell.
 */
const ENV_TARGETS = 'CORRECTEUR_DELETE_TARGETS';

const PS_DELETE_SCRIPT = [
  'Add-Type -AssemblyName Microsoft.VisualBasic;',
  `foreach ($p in ($env:${ENV_TARGETS} -split [char]10)) {`,
  '  if ($p) {',
  '    try {',
  "      [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p, 'OnlyErrorDialogs', 'SendToRecycleBin')",
  '    } catch { }',
  '  }',
  '}',
].join(' ');

/**
 * Envoie un lot de fichiers à la corbeille Windows en UN SEUL appel PowerShell.
 *
 * - Aucune interpolation dans la commande : les chemins transitent par une
 *   variable d'environnement (voir `ENV_TARGETS`).
 * - Un seul processus pour tout le lot (l'ancienne version en lançait un par
 *   fichier, soit plus de 300 processus lors d'une purge complète).
 * - Hors Windows (les lanceurs `.command` de macOS), on supprime directement.
 */
export async function moveManyToRecycleBin(absolutePaths: string[]): Promise<void> {
  const targets = absolutePaths.filter(Boolean).map(p => path.resolve(p));
  if (targets.length === 0) return;

  if (process.platform !== 'win32') {
    await Promise.all(targets.map(p => fs.unlink(p).catch(() => {})));
    return;
  }

  try {
    await execFileAsync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', PS_DELETE_SCRIPT],
      {
        env: { ...process.env, [ENV_TARGETS]: targets.join('\n') },
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      }
    );
  } catch (e) {
    console.error('Erreur Corbeille (repli sur suppression directe):', e);
    await Promise.all(targets.map(p => fs.unlink(p).catch(() => {})));
  }
}

/** Envoie un fichier unique à la corbeille. */
export async function moveToRecycleBin(absolutePath: string): Promise<void> {
  return moveManyToRecycleBin([absolutePath]);
}
