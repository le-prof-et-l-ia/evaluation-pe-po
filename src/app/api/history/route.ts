import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { isSafeId, moveToRecycleBin, moveManyToRecycleBin } from "@/lib/pathSafety";


const HISTORY_FILE_PATH = path.join(process.cwd(), "data", "history.json");

export interface EvaluationRecord {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  classId: string | null;
  className: string | null;
  date: string;
  level: string;
  type?: 'pe' | 'po';
  globalScore: number;
  criteriaScores: Record<string, number | undefined>;
}

async function getHistoryData(): Promise<EvaluationRecord[]> {
  try {
    const data = await fs.readFile(HISTORY_FILE_PATH, "utf8");
    return JSON.parse(data);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

async function saveHistoryData(data: EvaluationRecord[]): Promise<void> {
  const dir = path.dirname(HISTORY_FILE_PATH);
  try { await fs.mkdir(dir, { recursive: true }); } catch (e) {}
  await fs.writeFile(HISTORY_FILE_PATH, JSON.stringify(data, null, 2), "utf8");
}

const EVALUATIONS_DIR = path.join(process.cwd(), "data", "evaluations");

/**
 * Chemin du fichier détaillé d'une évaluation.
 * Renvoie `null` si l'identifiant n'a pas la forme attendue : cela empêche
 * qu'un `id` du type `../../autre` sorte du dossier `data/evaluations`.
 */
function evaluationFilePath(id: unknown): string | null {
  return isSafeId(id) ? path.join(EVALUATIONS_DIR, `${id}.json`) : null;
}

async function saveDetailedEvaluation(id: string, data: any): Promise<void> {
  const filePath = evaluationFilePath(id);
  if (!filePath) throw new Error(`Identifiant d'évaluation invalide : ${id}`);
  try { await fs.mkdir(EVALUATIONS_DIR, { recursive: true }); } catch (e) {}
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (id) {
      const filePath = evaluationFilePath(id);
      if (!filePath) {
        return NextResponse.json({ error: "Identifiant d'évaluation invalide" }, { status: 400 });
      }
      try {
        const data = await fs.readFile(filePath, "utf8");
        return NextResponse.json(JSON.parse(data));
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          return NextResponse.json({ error: "Évaluation non trouvée" }, { status: 404 });
        }
        throw err;
      }
    }

    const classId = searchParams.get('classId');
    const studentId = searchParams.get('studentId');
    const type = searchParams.get('type');

    let history = await getHistoryData();

    if (type) {
      if (type === 'pe') {
        history = history.filter(h => !h.type || h.type === 'pe');
      } else {
        history = history.filter(h => h.type === type);
      }
    }
    if (classId) {
        history = history.filter(h => h.classId === classId);
    }
    if (studentId) {
        history = history.filter(h => h.studentId === studentId);
    }

    return NextResponse.json(history);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function processRecord(body: any, existingHistory: EvaluationRecord[]): { record: EvaluationRecord; detailed: any } {
  const recordId = body.id || `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const existing = existingHistory.find(h => h.id === recordId);

  const globalScore = typeof body.globalScore === 'number'
    ? body.globalScore
    : (body.totalScore !== undefined ? body.totalScore : 0);

  const type = body.type || existing?.type || (body.transcription !== undefined ? 'po' : 'pe');

  const newRecord: EvaluationRecord = {
    id: recordId,
    studentId: body.studentId || existing?.studentId || "unknown",
    studentName: body.studentName || existing?.studentName || "Inconnu",
    studentEmail: body.studentEmail || existing?.studentEmail || "",
    classId: body.classId !== undefined ? body.classId : (existing?.classId || null),
    className: body.className !== undefined ? body.className : (existing?.className || null),
    date: body.date || existing?.date || new Date().toISOString(),
    level: body.level || existing?.level || "",
    type,
    globalScore,
    criteriaScores: body.criteriaScores || existing?.criteriaScores || {}
  };

  const detailed = {
    ...body,
    id: recordId,
    type,
    studentId: newRecord.studentId,
    studentName: newRecord.studentName,
    studentEmail: newRecord.studentEmail,
    classId: newRecord.classId,
    className: newRecord.className,
    date: newRecord.date,
    level: newRecord.level,
    globalScore: newRecord.globalScore,
    criteriaScores: newRecord.criteriaScores
  };

  return { record: newRecord, detailed };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const history = await getHistoryData();

    const items = Array.isArray(body) ? body : (Array.isArray(body.records) ? body.records : [body]);
    const savedRecords: EvaluationRecord[] = [];

    for (const item of items) {
      if (!item) continue;
      const { record, detailed } = processRecord(item, history);

      const existingIndex = history.findIndex(h => h.id === record.id);
      if (existingIndex >= 0) {
        history[existingIndex] = record;
      } else {
        history.push(record);
      }

      await saveDetailedEvaluation(record.id, detailed);
      savedRecords.push(record);
    }

    await saveHistoryData(history);

    if (savedRecords.length === 1 && !Array.isArray(body) && !Array.isArray(body.records)) {
      return NextResponse.json({ success: true, record: savedRecords[0] });
    }

    return NextResponse.json({ success: true, records: savedRecords, count: savedRecords.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const all = searchParams.get('all');

    if (all === 'true') {
      const history = await getHistoryData();
      
      // 1. Envoyer tous les fichiers détaillés + history.json à la corbeille
      //    en un seul appel système (au lieu d'un processus PowerShell par fichier).
      const targets = history
        .map(record => evaluationFilePath(record.id))
        .filter((p): p is string => p !== null);
      targets.push(HISTORY_FILE_PATH);
      await moveManyToRecycleBin(targets);

      // 2. Recréer un historique vide []
      await saveHistoryData([]);
      
      return NextResponse.json({ success: true });
    }

    if (!id) {
      return NextResponse.json({ error: "L'ID de l'évaluation ou le paramètre all est obligatoire" }, { status: 400 });
    }

    const filePath = evaluationFilePath(id);
    if (!filePath) {
      return NextResponse.json({ error: "Identifiant d'évaluation invalide" }, { status: 400 });
    }

    let history = await getHistoryData();
    history = history.filter(h => h.id !== id);
    await saveHistoryData(history);

    // Supprimer le fichier d'évaluation détaillée (envoi à la corbeille)
    await moveToRecycleBin(filePath);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, studentName, studentEmail, className, classId, studentId, classDetached } = body;

    if (!id) {
      return NextResponse.json({ error: "L'ID de l'évaluation est obligatoire" }, { status: 400 });
    }
    if (!studentName || typeof studentName !== "string" || !studentName.trim()) {
      return NextResponse.json({ error: "Le nom de l'apprenant ne peut pas être vide" }, { status: 400 });
    }

    if (!isSafeId(id)) {
      return NextResponse.json({ error: "Identifiant d'évaluation invalide" }, { status: 400 });
    }

    const trimmedName = studentName.trim();
    const history = await getHistoryData();
    const recordIndex = history.findIndex(h => h.id === id);

    if (recordIndex === -1) {
      return NextResponse.json({ error: "Évaluation introuvable dans l'historique" }, { status: 404 });
    }

    // Mettre à jour l'entrée dans history.json
    history[recordIndex].studentName = trimmedName;
    if (studentEmail !== undefined) history[recordIndex].studentEmail = typeof studentEmail === "string" ? studentEmail.trim() : "";
    if (className !== undefined) history[recordIndex].className = typeof className === "string" ? className.trim() : null;
    // Rattachement de classe : `null` retire explicitement l'association.
    // Sans cela, un détachement manuel était perdu à la réouverture du bilan.
    if (classId !== undefined) history[recordIndex].classId = classId || null;
    if (studentId !== undefined) history[recordIndex].studentId = studentId || null;
    await saveHistoryData(history);

    // Mettre à jour le fichier d'évaluation détaillée (data/evaluations/${id}.json) s'il existe
    const detailedPath = evaluationFilePath(id) as string; // `id` déjà validé par isSafeId
    try {
      const detailedRaw = await fs.readFile(detailedPath, "utf8");
      const detailed = JSON.parse(detailedRaw);
      detailed.studentName = trimmedName;
      if (studentEmail !== undefined) detailed.studentEmail = typeof studentEmail === "string" ? studentEmail.trim() : "";
      if (className !== undefined) detailed.className = typeof className === "string" ? className.trim() : null;
      if (classId !== undefined) detailed.classId = classId || null;
      if (studentId !== undefined) detailed.studentId = studentId || null;
      // Mémorise le refus de rattachement pour que l'appariement automatique
      // ne repropose pas le même élève à la réouverture.
      if (classDetached !== undefined) detailed.classDetached = !!classDetached;
      await saveDetailedEvaluation(id, detailed);
    } catch (err: any) {
      console.warn(`[PATCH /api/history] Note: fichier détaillé ${id}.json non trouvé ou non mis à jour :`, err?.message);
    }

    return NextResponse.json({ success: true, record: history[recordIndex] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


