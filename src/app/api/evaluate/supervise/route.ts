import { NextResponse } from 'next/server';
import { superviseEvaluation } from '@/lib/geminiService';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      result, text, subject, language, temperature, evalModel, level,
      supervisionModel,
      apiKeys,
      gradingMode = 'delf',
      examType
    } = body;

    // La double évaluation suit la grille DELF : on la refuse pour les autres épreuves.
    if (examType && ['dictee', 'traduction', 'grammaire', 'composition'].includes(examType)) {
      return NextResponse.json({ error: "La double évaluation n'est disponible que pour le DELF (pas pour la dictée, la traduction, la grammaire ni la composition)." }, { status: 400 });
    }

    if (!result || !text || !subject) {
      return NextResponse.json({ error: 'result, text et subject sont obligatoires' }, { status: 400 });
    }

    const supervisedResult: any = await superviseEvaluation(
      result, text, subject, language || 'FR', temperature || 0.3,
      supervisionModel || 'flash', level || 'B2', apiKeys?.gemini, undefined, gradingMode
    );

    if (supervisedResult._comparison) {
      supervisedResult._comparison.firstProvider = result?.modelUsed || evalModel || 'inconnu';
      if (supervisedResult.modelUsed) {
        supervisedResult._comparison.secondProvider = supervisedResult.modelUsed;
      }
    }
    return NextResponse.json(supervisedResult);
  } catch (error: any) {
    console.error("API supervise - Erreur interne :", error);
    const causeMsg = error?.cause?.message || error?.cause?.code;
    const detail = (causeMsg && !error?.message?.includes(causeMsg)) ? `${error.message} (${causeMsg})` : (error?.message || 'Erreur interne de serveur lors de la supervision IA');
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
