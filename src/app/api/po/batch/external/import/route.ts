import { NextResponse } from 'next/server';
import { importBatchExternalPackage, type ExternalBatchTaskType } from '@/lib/po/externalBatchManager';
import path from 'path';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { taskType, exchangeFolder, items, config } = body as {
      taskType: ExternalBatchTaskType;
      exchangeFolder?: string;
      items: any[];
      config: any;
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Aucun fichier à importer." }, { status: 400 });
    }

    const defaultFolder = exchangeFolder || path.join(process.cwd(), 'data/outputs/_ECHANGE_IA');

    const result = await importBatchExternalPackage({
      taskType,
      exchangeFolder: defaultFolder,
      items,
      config: config || { level: 'B2', language: 'FR', notationType: 'detailed' }
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[PO Batch] Erreur importBatchExternalPackage :", err);
    return NextResponse.json({ error: err.message || "Erreur interne" }, { status: 500 });
  }
}
