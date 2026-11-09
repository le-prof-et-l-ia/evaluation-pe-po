import { NextResponse } from 'next/server';
import { superviseEvaluation } from '@/lib/po/geminiService';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      result, subject, language, temperature, evalModel, level,
      supervisionModel,
      apiKeys, notationType = 'detailed'
    } = body;
    let text = body.text;

    if (!text && result?.transcription) {
      text = result.transcription;
    }

    if (!result || !text || !subject) {
      return NextResponse.json({ error: 'result, text et subject sont obligatoires' }, { status: 400 });
    }

    const supervisedResult: any = await superviseEvaluation(
      result, text, subject, language || 'FR', temperature || 0.3,
      supervisionModel || 'flash', level || 'B2', apiKeys?.gemini, undefined, undefined, notationType
    );

    if (supervisedResult._comparison) {
      supervisedResult._comparison.firstProvider = result?.modelUsed || evalModel || 'inconnu';
      if (supervisedResult.modelUsed) {
        supervisedResult._comparison.secondProvider = supervisedResult.modelUsed;
      }
    }
    supervisedResult.notationType = notationType;
    return NextResponse.json(supervisedResult);
  } catch (error: any) {
    console.error("[PO API supervise] Erreur interne :", error);
    const causeMsg = error?.cause?.message || error?.cause?.code;
    const detail = (causeMsg && !error?.message?.includes(causeMsg)) ? `${error.message} (${causeMsg})` : (error?.message || 'Erreur interne lors de la supervision PO');
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
