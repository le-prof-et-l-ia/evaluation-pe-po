import { NextResponse } from 'next/server';
import { superviseEvaluation } from '@/lib/geminiService';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      result, text, subject, language, temperature, evalModel, level,
      supervisionModel,
      apiKeys,
      gradingMode = 'delf'
    } = body;

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
