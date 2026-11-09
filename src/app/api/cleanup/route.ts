import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { moveToRecycleBin, moveManyToRecycleBin } from "@/lib/pathSafety";


async function getDirSize(dirPath: string): Promise<number> {
  let size = 0;
  try {
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    for (const file of files) {
      if (file.isDirectory()) continue;
      const stat = await fs.stat(path.join(dirPath, file.name));
      size += stat.size;
    }
  } catch (e) {
    // Ignore ENOENT
  }
  return size;
}

export async function GET(req: Request) {
  try {
    const outputsDir = path.join(process.cwd(), "data", "outputs");
    const evalsDir = path.join(process.cwd(), "data", "evaluations");
    const historyFile = path.join(process.cwd(), "data", "history.json");

    let historySize = 0;
    try {
      const hStat = await fs.stat(historyFile);
      historySize = hStat.size;
    } catch {}

    const outSize = await getDirSize(outputsDir);
    const evalSize = await getDirSize(evalsDir);

    const totalBytes = outSize + evalSize + historySize;

    return NextResponse.json({
      success: true,
      stats: {
        outputsBytes: outSize,
        evaluationsBytes: evalSize,
        historyBytes: historySize,
        totalBytes
      }
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { dateBefore } = await req.json(); // ISO string
    if (!dateBefore) throw new Error("dateBefore est requis.");

    const cutoff = new Date(dateBefore).getTime();

    const outputsDir = path.join(process.cwd(), "data", "outputs");
    const evalsDir = path.join(process.cwd(), "data", "evaluations");
    const historyFile = path.join(process.cwd(), "data", "history.json");
    const lastBatchFile = path.join(process.cwd(), "data", "outputs", "last_batch.json");

    // Tout passe par la corbeille Windows (récupérable) ; hors Windows, suppression directe.
    const toRecycle: string[] = [];
    let deletedRecords = 0;

    // 1. Outputs (*.pdf, etc)
    try {
      const outFiles = await fs.readdir(outputsDir, { withFileTypes: true });
      for (const f of outFiles) {
        if (!f.isFile()) continue;
        const fp = path.join(outputsDir, f.name);
        const stat = await fs.stat(fp);
        if (stat.mtimeMs < cutoff) toRecycle.push(fp);
      }
    } catch {}

    // 2. Evaluations (*.json)
    try {
      const evalFiles = await fs.readdir(evalsDir);
      for (const f of evalFiles) {
        if (!f.endsWith('.json')) continue;
        const fp = path.join(evalsDir, f);
        const stat = await fs.stat(fp);
        if (stat.mtimeMs < cutoff) toRecycle.push(fp);
      }
    } catch {}

    // 3. History records : les fiches retirées sont d'abord copiées dans un fichier
    //    de sauvegarde, envoyé lui aussi à la corbeille (restaurable en cas d'erreur).
    try {
      const data = await fs.readFile(historyFile, "utf8");
      const records = JSON.parse(data);
      if (Array.isArray(records)) {
        const remaining = records.filter(r => new Date(r.date).getTime() >= cutoff);
        const removed = records.filter(r => new Date(r.date).getTime() < cutoff);
        deletedRecords = removed.length;
        if (removed.length > 0) {
          const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
          const backupFile = path.join(process.cwd(), "data", `historique-nettoye-${stamp}.json`);
          await fs.writeFile(backupFile, JSON.stringify(removed, null, 2), "utf8");
          toRecycle.push(backupFile);
          await fs.writeFile(historyFile, JSON.stringify(remaining, null, 2), "utf8");
        }
      }
    } catch {}

    // 4. last_batch.json (déjà couvert par le dossier outputs s'il s'y trouve)
    try {
      const stat = await fs.stat(lastBatchFile);
      if (stat.mtimeMs < cutoff && !toRecycle.includes(lastBatchFile)) toRecycle.push(lastBatchFile);
    } catch {}

    await moveManyToRecycleBin(toRecycle);
    const backupCount = deletedRecords > 0 ? 1 : 0;
    const deletedFiles = toRecycle.length - backupCount;
    const where = process.platform === 'win32'
      ? "Les fichiers ont été envoyés à la Corbeille de Windows, d'où vous pouvez les restaurer (les fiches d'historique retirées s'y trouvent dans un fichier « historique-nettoye-… .json »)."
      : "Les fichiers ont été supprimés définitivement.";

    return NextResponse.json({
      success: true,
      deletedFiles,
      deletedRecords,
      message: `Nettoyage terminé : ${deletedFiles} fichier(s) et ${deletedRecords} fiche(s) d'historique retirés. ${where}`
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const dataDir    = path.join(process.cwd(), "data");
    const tmpDir     = path.join(process.cwd(), "tmp");
    const outputsDir = path.join(dataDir, "outputs");
    const evalsDir   = path.join(dataDir, "evaluations");
    const inputsDir  = path.join(dataDir, "inputs");
    const historyFile   = path.join(dataDir, "history.json");

    let deletedCount = 0;

    const purgeDir = async (dirPath: string) => {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) continue;
          const fp = path.join(dirPath, entry.name);
          await moveToRecycleBin(fp);
          deletedCount++;
        }
      } catch {}
    };

    await purgeDir(outputsDir);
    await purgeDir(evalsDir);
    await purgeDir(inputsDir);
    await purgeDir(tmpDir);

    // Réinitialiser history.json à []
    try {
      await moveToRecycleBin(historyFile);
    } catch {}
    try {
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(historyFile, "[]", "utf8");
    } catch {}

    // La sauvegarde du dernier lot (last_batch.json) se trouve dans data/outputs : elle est déjà purgée ci-dessus.

    return NextResponse.json({
      success: true,
      deletedCount,
      message: `Purge terminée : ${deletedCount} fichiers envoyés à la corbeille. L'historique a été réinitialisé.`
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

