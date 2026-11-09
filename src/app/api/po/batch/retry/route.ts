import { evaluateProduction, superviseEvaluation, evaluateInterpretation } from '@/lib/po/geminiService';
import fs from 'fs';
import path from 'path';

function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case '.pdf': return 'application/pdf';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.png': return 'image/png';
    case '.mp3': return 'audio/mpeg';
    case '.wav': return 'audio/wav';
    case '.m4a': return 'audio/x-m4a';
    case '.ogg': return 'audio/ogg';
    case '.webm': return 'audio/webm';
    case '.aac': return 'audio/aac';
    case '.flac': return 'audio/flac';
    case '.caf': return 'audio/x-caf';
    default: return 'text/plain';
  }
}

export async function POST(req: Request) {
  try {
    const { file, folderPath, subject, level, language, evalModel, text, apiKeys,
      ocrOnly, useDoubleEval, supervisionProvider, supervisionModel, nativeLanguage,
      notationType = 'detailed', primaryResult, examType,
      sourceSpeech, interpretationMode, maxScore, customInstructions,
      sourceLanguage, targetLanguage, criteria
    } = await req.json();
    
    const inputDir = folderPath && folderPath.trim() !== '' 
      ? path.resolve(folderPath) 
      : path.join(process.cwd(), 'data', 'inputs');
      
    const filePath = path.join(inputDir, file);
    
    if (!fs.existsSync(filePath)) {
      return new Response(JSON.stringify({ error: "Le fichier « " + file + " » est introuvable dans le dossier source actuel (" + inputDir + "). Si cette copie a été ajoutée depuis un autre dossier, ou si le fichier a été déplacé, utilisez « Corriger » pour modifier son texte à la main." }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');
    const mimeType = getMimeType(file);

    let studentText = text || (primaryResult && primaryResult.transcription) || '';
    if (!studentText && !primaryResult) {
      const { extractText } = await import('@/lib/po/geminiService');
      const ocrResult = await extractText(base64Data, mimeType, level || 'B2', 'flash', apiKeys?.gemini, undefined, nativeLanguage);
      studentText = ocrResult.text;
    }

    if (ocrOnly) {
      return new Response(JSON.stringify({ file, status: 'success', transcription: studentText, isOcrOnly: true, emailSent: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const subjectStr = subject || `Sujet standard ${level || 'B2'} ou détecter depuis la copie`;
    let evaluationResult = primaryResult;

    const isInterpretation = examType === 'interpretation';

    if (!evaluationResult) {
      if (isInterpretation) {
        const srcSpeech = sourceSpeech || subjectStr;
        evaluationResult = await evaluateInterpretation(
          studentText,
          srcSpeech,
          Number(maxScore) || 10,
          interpretationMode || 'consecutive',
          sourceLanguage || 'Français',
          targetLanguage || 'Français',
          criteria,
          customInstructions,
          evalModel || 'flash',
          apiKeys?.gemini
        );
      } else {
        evaluationResult = await evaluateProduction(
          subjectStr,
          { text: studentText },
          language || 'FR',
          0.3,
          evalModel || 'flash',
          level || 'B2',
          'flash',
          apiKeys?.gemini,
          undefined,
          false,
          nativeLanguage,
          notationType
        );
      }
    }

    // La double évaluation (supervision) suit la grille DELF : jamais appliquée à l'interprétation.
    if (useDoubleEval && !isInterpretation && supervisionProvider && supervisionModel) {
      const supervised = await superviseEvaluation(
        evaluationResult,
        studentText,
        subjectStr,
        language || 'FR',
        0.3,
        supervisionModel as any,
        level || 'B2',
        apiKeys?.gemini,
        undefined,
        undefined,
        notationType
      );
      if (supervised._comparison) supervised._comparison.firstProvider = evalModel || 'inconnu';
      evaluationResult = supervised;
    }

    evaluationResult.notationType = notationType;

    return new Response(JSON.stringify({
      file,
      status: 'success',
      ...evaluationResult,
      transcription: studentText,
      emailSent: false
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error("[PO Batch Retry] Échec de la relance :", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
