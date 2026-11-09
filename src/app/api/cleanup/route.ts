import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { moveToRecycleBin } from "@/lib/pathSafety";


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

    let deletedFiles = 0;
    let deletedRecords = 0;

    // 1. Outputs (*.pdf, etc)
    try {
      const outFiles = await fs.readdir(outputsDir);
      for (const f of outFiles) {
        const fp = path.join(outputsDir, f);
        const stat = await fs.stat(fp);
        if (stat.mtimeMs < cutoff) {
          await fs.unlink(fp);
          deletedFiles++;
        }
      }
    } catch {}

    // 2. Evaluations (*.json)
    try {
      const evalFiles = await fs.readdir(evalsDir);
      for (const f of evalFiles) {
        if (!f.endsWith('.json')) continue;
        const fp = path.join(evalsDir, f);
        const stat = await fs.stat(fp);
        if (stat.mtimeMs < cutoff) {
          await fs.unlink(fp);
          deletedFiles++;
        }
      }
    } catch {}

    // 3. History records
    try {
      const data = await fs.readFile(historyFile, "utf8");
      const records = JSON.parse(data);
      if (Array.isArray(records)) {
        const remaining = records.filter(r => new Date(r.date).getTime() >= cutoff);
        deletedRecords = records.length - remaining.length;
        await fs.writeFile(historyFile, JSON.stringify(remaining, null, 2), "utf8");
      }
    } catch {}

    // 4. last_batch.json
    try {
      const stat = await fs.stat(lastBatchFile);
      if (stat.mtimeMs < cutoff) {
         await fs.unlink(lastBatchFile);
         deletedFiles++;
      }
    } catch {}

    return NextResponse.json({
      success: true,
      deletedFiles,
      deletedRecords,
      message: `Nettoyage terminé : ${deletedFiles} fichiers et ${deletedRecords} copies d'historique supprimés.`
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
    const batchLastFile = path.join(dataDir, "batch_last.json");

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

    // Supprimer batch_last.json
    try { await moveToRecycleBin(batchLastFile); deletedCount++; } catch {}

    return NextResponse.json({
      success: true,
      deletedCount,
      message: `Purge terminée : ${deletedCount} fichiers envoyés à la corbeille. L'historique a été réinitialisé.`
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

