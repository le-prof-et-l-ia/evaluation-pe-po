import { NextResponse } from 'next/server';
import { generateB2Questions } from '@/lib/po/geminiService';

export async function POST(req: Request) {
  try {
    const { subject, transcription, apiKeys } = await req.json();

    if (!subject || !transcription) {
      return NextResponse.json({ error: 'Sujet ou transcription manquante.' }, { status: 400 });
    }

    const geminiApiKeys = apiKeys ? {
      ...apiKeys.gemini,
      keyMode: apiKeys.gemini?.keyMode || 'both'
    } : undefined;

    const questionsJsonText = await generateB2Questions(
      subject,
      transcription,
      geminiApiKeys
    );

    let parsedQuestions;
    try {
      const cleanJsonText = questionsJsonText
        .replace(/^```json\s*/i, '')
        .replace(/```\s*$/, '')
        .trim();
      parsedQuestions = JSON.parse(cleanJsonText);
    } catch (parseError) {
      console.error("[PO generate-questions] Failed to parse JSON:", questionsJsonText);
      return NextResponse.json({
        error: "Le modèle IA a renvoyé un format de questions invalide.",
        rawResponse: questionsJsonText
      }, { status: 500 });
    }

    return NextResponse.json(parsedQuestions);
  } catch (err: any) {
    console.error("[PO generate-questions] Error:", err);
    return NextResponse.json({ error: err.message || 'Erreur lors de la génération de questions' }, { status: 500 });
  }
}
