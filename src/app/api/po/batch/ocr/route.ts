import { extractText } from '@/lib/po/geminiService';
import fs from 'fs';
import path from 'path';

function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case '.pdf': return 'application/pdf';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.png': return 'image/png';
    case '.mp3': return 'audio/mpeg';
    case '.wav': return 'audio/wav';
    case '.m4a': return 'audio/x-m4a';
    case '.ogg': return 'audio/ogg';
    case '.webm': return 'audio/webm';
    case '.aac': return 'audio/aac';
    case '.flac': return 'audio/flac';
    case '.caf': return 'audio/x-caf';
    default: return 'text/plain';
  }
}

export async function POST(req: Request) {
  try {
    const { file, folderPath, level, ocrModel, apiKeys, nativeLanguage } = await req.json();
    
    const inputDir = folderPath && folderPath.trim() !== '' 
      ? path.resolve(folderPath) 
      : path.join(process.cwd(), 'data', 'inputs');
      
    const filePath = path.join(inputDir, file);
    
    if (!fs.existsSync(filePath)) {
      return new Response(JSON.stringify({ error: "Fichier introuvable" }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');
    const mimeType = getMimeType(file);

    const ocrResult = await extractText(base64Data, mimeType, level || 'B2', ocrModel || 'gemini-3.8-flash', apiKeys?.gemini, undefined, nativeLanguage);

    if (!ocrResult.text || !ocrResult.text.trim()) {
      return new Response(JSON.stringify({ error: "La transcription retournée est vide. L'enregistrement ne semble contenir aucune parole audible." }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ text: ocrResult.text.trim(), modelUsed: ocrResult.modelUsed, fallbackNotice: ocrResult.fallbackNotice }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error(`[PO Batch OCR] Échec de la relance OCR:`, err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
