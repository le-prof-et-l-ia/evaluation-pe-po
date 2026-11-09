import { NextResponse } from 'next/server';
import { extractText } from '@/lib/po/geminiService';

export async function POST(req: Request) {
  try {
    const { fileUri, mimeType, ocrModel, level, apiKeys, nativeLanguage } = await req.json();

    if (!fileUri || !mimeType) {
      return NextResponse.json({ error: 'Fichier manquant.' }, { status: 400 });
    }

    const ocrResult = await extractText(
      fileUri,
      mimeType,
      level || 'B2',
      ocrModel || 'gemini-3.8-flash',
      apiKeys?.gemini,
      undefined,
      nativeLanguage
    );

    if (!ocrResult.text || !ocrResult.text.trim()) {
      return NextResponse.json({ 
        error: "La transcription retournée est vide. L'enregistrement ne semble contenir aucune parole audible ou le modèle n'a pas pu extraire de texte." 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      text: ocrResult.text.trim(), 
      modelUsed: ocrResult.modelUsed || ocrModel || 'gemini-3.8-flash', 
      fallbackNotice: ocrResult.fallbackNotice 
    });
  } catch (err: any) {
    console.error("[PO API OCR] Erreur:", err);
    return NextResponse.json({ error: err.message || "Erreur interne lors de l'extraction audio" }, { status: 500 });
  }
}
