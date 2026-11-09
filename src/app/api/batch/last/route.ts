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
    
    const backupPath = path.join(outputDir, 'last_batch.json');
    
    if (!fs.existsSync(backupPath)) {
      return NextResponse.json({ results: [] }, { status: 200 });
    }

    const data = fs.readFileSync(backupPath, 'utf8');
    const results = JSON.parse(data);

    return NextResponse.json({ results }, { status: 200 });
  } catch (err: any) {
    console.error("Erreur lors de la lecture du dernier lot :", err);
    return NextResponse.json({ error: 'Erreur interne ou aucun JSON valide.' }, { status: 500 });
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
    
    const backupPath = path.join(outputDir, 'last_batch.json');
    fs.writeFileSync(backupPath, JSON.stringify(results, null, 2));
    
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    console.error("Erreur lors de la sauvegarde du dernier lot :", err);
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}
