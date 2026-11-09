import { NextResponse } from 'next/server';
import { 
  evaluateProduction, 
  extractText, 
  superviseEvaluation,
  evaluateDictation,
  evaluateTranslation,
  evaluateGrammar,
  evaluateComposition
} from '@/lib/geminiService';
import { getDictationOcrPrompt } from '@/lib/dicteeEngine';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      subject, text, mimeType, fileUri, language, temperature,
      evalModel, level, ocrModel, apiKeys,
      useDoubleEval, supervisionProvider, supervisionModel,
      gradingMode = 'delf', nativeLanguage,
      examType = 'delf',
      referenceText,
      maxScore = 10,
      dictationPenalties,
      customInstructions,
      modelTranslation,
      sourceLanguage,
      targetLanguage,
      criteria,
      answerKey,
      compositionType = 'essai',
      corpusText,
      compositionLanguage,
      disableStandardGrid = false
    } = body;

    const isCustomExam = ['dictee', 'traduction', 'grammaire', 'composition'].includes(examType);

    if (!subject && !isCustomExam) return NextResponse.json({ error: 'Le sujet est obligatoire' }, { status: 400 });
    if (!text && !fileUri) return NextResponse.json({ error: 'Le texte ou un fichier est obligatoire' }, { status: 400 });

    // OCR step (always needed if fileUri present, via Gemini)
    let studentTranscription = text || '';
    let ocrName = null;
    let ocrEmail = null;
    let ocrAlerts: string[] = [];
    if (fileUri && mimeType) {
      const ocrKeyModeVal = body.ocrKeyMode || 'both';
      const ocrApiKeys = apiKeys ? Object.fromEntries(
        Object.entries(apiKeys).map(([k, v]: [string, any]) => [k, { ...v, keyMode: ocrKeyModeVal }])
      ) : undefined;

      const customOcrPrompt = examType === 'dictee' ? getDictationOcrPrompt() : undefined;
      const ocrResult = await extractText(
        fileUri, 
        mimeType, 
        level || 'B2', 
        ocrModel || 'gemini-3.8-flash', 
        ocrApiKeys?.gemini, 
        undefined, 
        nativeLanguage,
        customOcrPrompt
      );
      studentTranscription += (studentTranscription ? '\n\n' : '') + ocrResult.transcription;
      ocrName = ocrResult.studentName;
      ocrEmail = ocrResult.studentEmail;
      ocrAlerts = ocrResult.ocrAlerts || [];
    }

    const geminiModel = (evalModel === 'pro' || evalModel === 'argon') ? 'pro' : 'flash';

    // ── NOUVEAUX TYPES D'ÉPREUVES PERSONNALISÉES ──────────────────────
    if (examType === 'dictee') {
      const refText = referenceText || subject || '';
      if (!refText.trim()) {
        return NextResponse.json({ error: 'Le texte de référence de la dictée est obligatoire.' }, { status: 400 });
      }
      const dictationRes = await evaluateDictation(
        studentTranscription,
        refText,
        Number(maxScore) || 10,
        dictationPenalties,
        customInstructions,
        geminiModel,
        apiKeys?.gemini
      );
      if (ocrName) dictationRes.studentName = ocrName;
      if (ocrEmail) dictationRes.studentEmail = ocrEmail;
      (dictationRes as any).ocrAlerts = ocrAlerts;
      return NextResponse.json(dictationRes);
    }

    if (examType === 'traduction') {
      const srcText = referenceText || subject || '';
      if (!srcText.trim()) {
        return NextResponse.json({ error: 'Le texte source de la traduction est obligatoire.' }, { status: 400 });
      }
      const transRes = await evaluateTranslation(
        studentTranscription,
        srcText,
        Number(maxScore) || 10,
        modelTranslation,
        customInstructions,
        sourceLanguage || 'Français',
        targetLanguage || 'Français',
        criteria,
        geminiModel,
        apiKeys?.gemini
      );
      if (ocrName) transRes.studentName = ocrName;
      if (ocrEmail) transRes.studentEmail = ocrEmail;
      (transRes as any).ocrAlerts = ocrAlerts;
      return NextResponse.json(transRes);
    }

    if (examType === 'grammaire') {
      const exSubject = subject || referenceText || '';
      if (!exSubject.trim()) {
        return NextResponse.json({ error: "L'énoncé des exercices est obligatoire." }, { status: 400 });
      }
      const grammarRes = await evaluateGrammar(
        studentTranscription,
        exSubject,
        Number(maxScore) || 10,
        answerKey,
        customInstructions,
        geminiModel,
        apiKeys?.gemini
      );
      if (ocrName) grammarRes.studentName = ocrName;
      if (ocrEmail) grammarRes.studentEmail = ocrEmail;
      (grammarRes as any).ocrAlerts = ocrAlerts;
      return NextResponse.json(grammarRes);
    }

    if (examType === 'composition') {
      const compSubject = subject || referenceText || '';
      if (!compSubject.trim()) {
        return NextResponse.json({ error: "Le sujet de la composition est obligatoire." }, { status: 400 });
      }
      const compRes = await evaluateComposition(
        studentTranscription,
        compSubject,
        compositionType || 'essai',
        Number(maxScore) || 20,
        corpusText,
        compositionLanguage || targetLanguage || 'Français',
        customInstructions,
        criteria,
        geminiModel,
        apiKeys?.gemini,
        undefined,
        disableStandardGrid
      );
      if (ocrName) compRes.studentName = ocrName;
      if (ocrEmail) compRes.studentEmail = ocrEmail;
      (compRes as any).ocrAlerts = ocrAlerts;
      return NextResponse.json(compRes);
    }

    // ── ÉPREUVES OFFICIELLES DELF B1 / B2 (INCHANGÉES) ───────────────
    const result: any = await evaluateProduction(
      subject, { text: studentTranscription }, language || 'FR', temperature || 0.3,
      geminiModel, level || 'B2', 'flash', apiKeys?.gemini, undefined, false, gradingMode, nativeLanguage
    );

    // Double evaluation if requested
    if (useDoubleEval && supervisionModel) {
      try {
        const supervised = await superviseEvaluation(
          result, studentTranscription, subject, language || 'FR', temperature || 0.3,
          supervisionModel as any, level || 'B2', apiKeys?.gemini, undefined, gradingMode, nativeLanguage
        );
        if (supervised._comparison) {
          supervised._comparison.firstProvider = evalModel || 'inconnu';
          if (supervised._comparison.firstEval) supervised._comparison.firstEval.subject = subject;
          if (supervised._comparison.secondEval) supervised._comparison.secondEval.subject = subject;
        }
        if (ocrName) supervised.studentName = ocrName;
        if (ocrEmail) supervised.studentEmail = ocrEmail;
        supervised.ocrAlerts = ocrAlerts;
        supervised.subject = subject;
        return NextResponse.json(supervised);
      } catch (supervisionErr: any) {
        console.warn("Échec de la 2e évaluation dans API evaluate :", supervisionErr);
        result._supervisionError = supervisionErr?.message || "Échec de la 2e évaluation";
      }
    }

    if (ocrName) result.studentName = ocrName;
    if (ocrEmail) result.studentEmail = ocrEmail;
    result.ocrAlerts = ocrAlerts;
    result.transcription = studentTranscription;
    result.subject = subject;
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("API evaluate - Erreur interne :", error);
    const detail = error?.cause?.message ? `${error.message} (${error.cause.message})` : (error?.message || 'Erreur interne de serveur lors de la communication IA');
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
