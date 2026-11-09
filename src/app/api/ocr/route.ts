import { NextResponse } from 'next/server';
import { extractText } from '@/lib/geminiService';
import { getDictationOcrPrompt } from '@/lib/dicteeEngine';

export async function POST(req: Request) {
  try {
    const { files, fileUri, mimeType, ocrModel, level, apiKeys, nativeLanguage, examType } = await req.json();

    if (!files && (!fileUri || !mimeType)) {
      return NextResponse.json({ error: 'Fichier manquant.' }, { status: 400 });
    }

    const customPrompt = examType === 'dictee' ? getDictationOcrPrompt() : undefined;
    const ocrResult = await extractText(
      files || fileUri,
      mimeType,
      level || 'B2',
      ocrModel || 'gemini-3.8-flash',
      apiKeys?.gemini,
      undefined,
      nativeLanguage,
      customPrompt
    );

    if (!ocrResult.transcription || !ocrResult.transcription.trim()) {
      return NextResponse.json({ error: "L'extraction OCR n'a retourné aucun texte." }, { status: 500 });
    }

    return NextResponse.json({ 
      text: ocrResult.transcription.trim(),
      studentName: ocrResult.studentName,
      studentEmail: ocrResult.studentEmail,
      ocrAlerts: ocrResult.ocrAlerts,
      fallbackNotice: (ocrResult as any).fallbackNotice,
      modelUsed: (ocrResult as any).modelUsed
    });
  } catch (err: any) {
    console.error("API OCR Error:", err);
    return NextResponse.json({ error: err.message || 'Erreur interne lors de l\'extraction' }, { status: 500 });
  }
}
