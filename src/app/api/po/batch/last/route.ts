import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const outputFolder = url.searchParams.get('outputFolder');
    
    const outputDir = outputFolder && outputFolder.trim() !== ''
      ? path.resolve(outputFolder)
      : path.join(process.cwd(), 'data', 'outputs');
    
    const backupPath = path.join(outputDir, 'last_batch_po.json');
    const legacyPath = path.join(outputDir, 'last_batch.json');
    const targetPath = fs.existsSync(backupPath) ? backupPath : legacyPath;
    
    if (!fs.existsSync(targetPath)) {
      return NextResponse.json({ results: [] }, { status: 200 });
    }

    const data = fs.readFileSync(targetPath, 'utf8');
    const results = JSON.parse(data);

    return NextResponse.json({ results }, { status: 200 });
  } catch (err: any) {
    console.error("[PO Batch] Erreur lecture dernier lot :", err);
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { results, outputFolder } = await req.json();
    
    const outputDir = outputFolder && outputFolder.trim() !== ''
      ? path.resolve(outputFolder)
      : path.join(process.cwd(), 'data', 'outputs');
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const backupPath = path.join(outputDir, 'last_batch_po.json');
    fs.writeFileSync(backupPath, JSON.stringify(results, null, 2));
    
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    console.error("[PO Batch] Erreur sauvegarde dernier lot :", err);
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}
