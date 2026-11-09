import { NextResponse } from 'next/server';
import { evaluateProduction, extractText, superviseEvaluation, evaluateInterpretation } from '@/lib/po/geminiService';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      subject, text, mimeType, fileUri, language, temperature,
      evalModel, level, ocrModel, apiKeys,
      useDoubleEval, supervisionProvider, supervisionModel,
      nativeLanguage, notationType = 'detailed',
      examType = 'delf',
      sourceSpeech,
      maxScore = 10,
      interpretationMode = 'consecutive',
      sourceLanguage,
      targetLanguage,
      criteria,
      customInstructions
    } = body;

    const isInterpretation = examType === 'interpretation';

    if (!subject && !isInterpretation) return NextResponse.json({ error: 'Le sujet est obligatoire' }, { status: 400 });
    if (!text && !fileUri) return NextResponse.json({ error: 'Le texte ou un fichier audio est obligatoire' }, { status: 400 });

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); };

        try {
          // 1. Transcription audio / OCR si besoin
          let studentTranscription = text || '';
          if (!studentTranscription && fileUri && mimeType) {
            send({ type: 'progress', message: "🎙️ Phase 1 : Transcription audio..." });
            const ocrKeyModeVal = body.ocrKeyMode || 'both';
            const ocrApiKeys = apiKeys ? Object.fromEntries(
              Object.entries(apiKeys).map(([k, v]: [string, any]) => [k, { ...v, keyMode: ocrKeyModeVal }])
            ) : undefined;

            const ocrRes = await extractText(fileUri, mimeType, level || 'B2', ocrModel || 'gemini-3.8-flash', ocrApiKeys?.gemini, undefined, nativeLanguage);
            studentTranscription = ocrRes.text;
          }

          // 2. Évaluation initiale
          const modelLabel = (evalModel === 'pro' || evalModel === 'argon') ? 'Gemini 4 Argon' : evalModel === 'flash' ? 'Gemini Flash' : (evalModel || 'Gemini Flash');
          send({ type: 'progress', message: `🧠 Phase 2 : Évaluation initiale (${modelLabel})...` });

          const geminiModel = (evalModel === 'pro' || evalModel === 'argon') ? 'pro' : 'flash';
          let result: any;

          if (isInterpretation) {
            const srcSpeech = sourceSpeech || subject || '';
            if (!srcSpeech.trim()) {
              send({ type: 'error', error: "Le discours source original est obligatoire pour l'interprétation." });
              controller.close();
              return;
            }
            result = await evaluateInterpretation(
              studentTranscription,
              srcSpeech,
              Number(maxScore) || 10,
              interpretationMode,
              sourceLanguage || 'Français',
              targetLanguage || 'Français',
              criteria,
              customInstructions,
              geminiModel,
              apiKeys?.gemini
            );
          } else {
            result = await evaluateProduction(
              subject, { text: studentTranscription }, language || 'FR', temperature || 0.3,
              geminiModel, level || 'B2', 'flash', apiKeys?.gemini, undefined, false, nativeLanguage, notationType
            );
          }

          // 3. Double évaluation si demandée
          if (useDoubleEval && supervisionProvider && supervisionModel) {
            const superModelLabel = supervisionModel.replace('-latest', '');
            send({ type: 'progress', message: `⚖️ Phase 3 : Double évaluation (${supervisionProvider.toUpperCase()} ${superModelLabel})...` });
            try {
              const supervised = await superviseEvaluation(
                result, studentTranscription, subject, language || 'FR', temperature || 0.3,
                supervisionModel as any, level || 'B2', apiKeys?.gemini, undefined, undefined, notationType
              );
              if (supervised._comparison) {
                supervised._comparison.firstProvider = evalModel || 'inconnu';
                if (supervised._comparison.firstEval) supervised._comparison.firstEval.subject = subject;
                if (supervised._comparison.secondEval) supervised._comparison.secondEval.subject = subject;
              }
              result = supervised;
            } catch (supervisionErr: any) {
              console.warn("[PO API evaluate] Échec de la double évaluation en phase 3 :", supervisionErr);
              result._supervisionError = supervisionErr?.message || "Échec de la 2e évaluation";
              send({
                type: 'progress',
                message: `⚠️ La 2e évaluation n'a pas pu aboutir (${supervisionErr?.message}). Conservation du résultat de la 1re évaluation...`
              });
            }
          }

          send({ type: 'progress', message: "✨ Phase 4 : Finalisation du bilan d'évaluation..." });
          result.notationType = notationType;
          result.transcription = studentTranscription;
          result.subject = subject;
          send({ type: 'done', result });
          controller.close();
        } catch (err: any) {
          send({ type: 'error', error: err.message || "Erreur lors de l'évaluation" });
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    });

  } catch (error: any) {
    console.error("[PO API evaluate] Erreur interne :", error);
    const detail = error?.cause?.message ? `${error.message} (${error.cause.message})` : (error?.message || 'Erreur interne de serveur lors de la communication IA');
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
