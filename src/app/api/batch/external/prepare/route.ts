import { NextResponse } from 'next/server';
import { prepareBatchExternalPackage, type ExternalBatchTaskType } from '@/lib/externalBatchManager';
import path from 'path';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { taskType, exchangeFolder, items, config, examType } = body as {
      taskType: ExternalBatchTaskType;
      examType?: string;
      exchangeFolder?: string;
      items: any[];
      config: any;
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Aucun fichier à préparer." }, { status: 400 });
    }

    const defaultFolder = exchangeFolder || path.join(process.cwd(), 'data/outputs/_ECHANGE_IA');

    const result = await prepareBatchExternalPackage({
      taskType,
      exchangeFolder: defaultFolder,
      items,
      examType,
      config: config || { level: 'B2', language: 'FR', gradingMode: 'delf' }
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Erreur prepareBatchExternalPackage :", err);
    return NextResponse.json({ error: err.message || "Erreur interne" }, { status: 500 });
  }
}
