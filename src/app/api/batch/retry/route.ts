import { 
  evaluateProduction, 
  superviseEvaluation, 
  extractText,
  evaluateDictation,
  evaluateTranslation,
  evaluateGrammar,
  evaluateComposition 
} from '@/lib/geminiService';
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
  try {
    const { file, folderPath, subject, level, language, evalModel, text, apiKeys,
      ocrOnly, useDoubleEval, supervisionProvider, supervisionModel,
      gradingMode = 'delf', nativeLanguage,
      primaryResult, examType, customConfig
    } = await req.json();
    
    
    const inputDir = folderPath && folderPath.trim() !== '' 
      ? path.resolve(folderPath) 
      : path.join(process.cwd(), 'data', 'inputs');
      
    const filePath = path.join(inputDir, file);
    
    if (!fs.existsSync(filePath)) {
      return new Response(JSON.stringify({ error: "Fichier introuvable" }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    let studentText = text || (primaryResult && primaryResult.transcription) || '';
    let ocrName = null;
    let ocrEmail = null;
    let ocrAlerts: string[] = [];
    if (!studentText && !primaryResult) {
      const fileBuffer = fs.readFileSync(filePath);
      const base64Data = fileBuffer.toString('base64');
      const ext = path.extname(file).toLowerCase();
      let mimeType = 'text/plain';
      if (ext === '.pdf') mimeType = 'application/pdf';
      else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else if (ext === '.png') mimeType = 'image/png';

      // OCR always via Gemini for retry with file
      const ocrResult = await extractText(base64Data, mimeType, level || 'B2', 'flash', apiKeys?.gemini, undefined, nativeLanguage);
      studentText = ocrResult.transcription;
      ocrName = ocrResult.studentName;
      ocrEmail = ocrResult.studentEmail;
      ocrAlerts = ocrResult.ocrAlerts || [];
    }

    // OCR-only mode: return transcription without evaluation
    if (ocrOnly) {
      return new Response(JSON.stringify({ 
        file, 
        status: 'success', 
        transcription: studentText, 
        studentName: ocrName,
        studentEmail: ocrEmail,
        ocrAlerts,
        isOcrOnly: true, 
        emailSent: false 
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const subjectStr = subject || `Sujet standard ${level || 'B2'} ou détecter depuis la copie`;
    let evaluationResult = primaryResult;

    const isDictee = examType === 'dictee';
    const isTrad = examType === 'traduction';
    const isGramm = examType === 'grammaire';
    const isComposition = examType === 'composition';

    if (!evaluationResult) {
      if (isDictee) {
        evaluationResult = await evaluateDictation(
          studentText,
          customConfig?.referenceText || subjectStr,
          customConfig?.maxScore || 10,
          customConfig?.dictationPenalties,
          customConfig?.customInstructions,
          evalModel || 'flash',
          apiKeys?.gemini
        );
      } else if (isTrad) {
        evaluationResult = await evaluateTranslation(
          studentText,
          customConfig?.referenceText || subjectStr,
          customConfig?.maxScore || 10,
          customConfig?.modelTranslation,
          customConfig?.customInstructions,
          customConfig?.sourceLanguage || 'Français',
          customConfig?.targetLanguage || 'Français',
          customConfig?.criteria,
          evalModel || 'flash',
          apiKeys?.gemini
        );
      } else if (isGramm) {
        evaluationResult = await evaluateGrammar(
          studentText,
          customConfig?.referenceText || subjectStr,
          customConfig?.maxScore || 10,
          customConfig?.modelTranslation,
          customConfig?.customInstructions,
          evalModel || 'flash',
          apiKeys?.gemini
        );
      } else if (isComposition) {
        evaluationResult = await evaluateComposition(
          studentText,
          customConfig?.referenceText || subjectStr,
          customConfig?.compositionType || 'essai',
          customConfig?.maxScore || 20,
          customConfig?.corpusText,
          customConfig?.targetLanguage || 'Français',
          customConfig?.customInstructions,
          customConfig?.criteria,
          evalModel || 'flash',
          apiKeys?.gemini,
          undefined,
          customConfig?.disableStandardGrid
        );
      } else {
        evaluationResult = await evaluateProduction(
          subjectStr, 
          { text: studentText }, 
          language || 'VN', 
          0.3, 
          evalModel || 'flash', 
          level || 'B2', 
          'flash', 
          apiKeys?.gemini, 
          undefined, 
          false, 
          gradingMode, 
          nativeLanguage
        );
      }
    }

    // Double evaluation (jury) if requested : réservée au DELF (la supervision suit la grille DELF,
    // elle remplacerait le résultat d'une dictée, traduction, grammaire ou composition par un rapport DELF).
    const supervisionAllowed = !(isDictee || isTrad || isGramm || isComposition);
    if (useDoubleEval && supervisionModel && supervisionAllowed) {
      try {
        const supervised = await superviseEvaluation(evaluationResult, studentText, subjectStr, language || 'VN', 0.3, supervisionModel, level || 'B2', apiKeys?.gemini, undefined, gradingMode, nativeLanguage);
        if (supervised._comparison) supervised._comparison.firstProvider = evalModel || 'inconnu';
        evaluationResult = supervised;
      } catch (supervisionErr: any) {
        console.warn(`[Batch Retry PE] Échec de la double évaluation pour ${file} :`, supervisionErr);
        if (evaluationResult) {
          evaluationResult._supervisionError = supervisionErr?.message || "Échec de la 2e évaluation";
        }
      }
    }

    // Inject OCR detected details if available
    if (ocrName) evaluationResult.studentName = ocrName;
    if (ocrEmail) evaluationResult.studentEmail = ocrEmail;
    evaluationResult.ocrAlerts = ocrAlerts;

    const result = {
      file,
      status: 'success',
      ...evaluationResult,
      emailSent: false
    };

    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error(`Echec de la réévaluation pour file:`, err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
