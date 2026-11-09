import { extractText } from '@/lib/geminiService';
import fs from 'fs';
import path from 'path';

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
    const ext = path.extname(file).toLowerCase();
    let mimeType = 'text/plain';
    
    if (ext === '.pdf') mimeType = 'application/pdf';
    else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    else if (ext === '.png') mimeType = 'image/png';

    const ocrResult = await extractText(base64Data, mimeType, level || 'B2', ocrModel || 'gemini-3.8-flash', apiKeys?.gemini, undefined, nativeLanguage);

    return new Response(JSON.stringify({ 
      text: ocrResult.transcription,
      studentName: ocrResult.studentName,
      studentEmail: ocrResult.studentEmail,
      ocrAlerts: ocrResult.ocrAlerts,
      fallbackNotice: (ocrResult as any).fallbackNotice,
      modelUsed: (ocrResult as any).modelUsed
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error(`Echec de la relance OCR pour file:`, err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
