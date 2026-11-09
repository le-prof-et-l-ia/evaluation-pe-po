import { evaluateProduction, extractText, superviseEvaluation, evaluateDictation, evaluateTranslation, evaluateGrammar, evaluateComposition } from '@/lib/geminiService';
import { getDictationOcrPrompt } from '@/lib/dicteeEngine';
import { generatePdfBuffer } from '@/lib/pdfGenerator';
import { sanitizeFilename, timestampSlug, uniqueFilePath } from '@/lib/pathSafety';
import fs from 'fs';
import path from 'path';
// @ts-expect-error NodeMailer lacks full types here without @types/nodemailer
import nodemailer from 'nodemailer';

// Formats de copie lus par le lot (PDF, images, texte).
const COPY_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.txt'];
const isCopyFile = (f: string) => COPY_EXTENSIONS.includes(path.extname(f).toLowerCase());

export async function POST(req: Request) {
  try {
    const {
      folderPath,
      outputFolderPath,
      language,
      level,
      subject,
      autoEmail,
      evalModel,
      ocrModel,
      ocrOnly,
      supervisionProvider,
      supervisionModel,
      apiKeys,
      ocrKeyMode,
      emailConfig,
      emailSignature = "L'équipe pédagogique",
      gradingMode = 'delf',
      nativeLanguage,
      examType = 'delf_b2',
      customConfig,
      emailSubject,
      emailBody,
    } = await req.json();
    
    if (!folderPath) {
      return new Response(JSON.stringify({ error: "Chemin du dossier source requis." }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const inputDir = folderPath;
    const outputDir = outputFolderPath || path.join(process.cwd(), 'data/outputs');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const allFiles = fs.readdirSync(inputDir)
      .filter(f => !f.startsWith('.'))
      .map(f => { const fullPath = path.join(inputDir, f); const stat = fs.statSync(fullPath); return { name: f, st: stat }; })
      .filter(item => !item.st.isDirectory())
      .sort((a, b) => a.st.mtimeMs - b.st.mtimeMs)
      .map(item => item.name);
    // Seules les copies (PDF, images, texte) sont lues : un .docx ou un Thumbs.db partirait sinon à l'IA.
    const files = allFiles.filter(isCopyFile);
    const ignoredFiles = allFiles.filter(f => !isCopyFile(f));

    if (files.length === 0) {
      const detail = ignoredFiles.length > 0 ? ` ${ignoredFiles.length} fichier(s) ignoré(s), car ce ne sont pas des copies (${COPY_EXTENSIONS.join(', ')}).` : "";
      return new Response(JSON.stringify({ error: "Aucune copie trouvée dans le dossier source." + detail }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Transporteur e-mail : l'option « Envoi direct » de l'interface était
    // transmise mais jamais exploitée côté serveur, aucun message n'était envoyé.
    let transporter: any = null;
    const emailUser = emailConfig?.user || process.env.EMAIL_USER;
    const emailPass = emailConfig?.pass || process.env.EMAIL_PASS;
    if (autoEmail && emailUser && emailPass) {
      transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: emailUser, pass: emailPass } });
    }



    const { searchParams } = new URL(req.url);
    // La double évaluation (supervision) suit la grille DELF : on ne l'applique jamais à une dictée,
    // une traduction, des exercices de grammaire ou une composition (le résultat serait remplacé par un rapport DELF).
    const isCustomExamType = ['dictee', 'traduction', 'grammaire', 'composition'].includes(examType);
    const useDoubleEval = searchParams.get('useDoubleEval') === 'true' && !isCustomExamType;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); };
        const batchMode = ocrOnly ? 'ocr' : (useDoubleEval && supervisionProvider && supervisionModel) ? 'ocr+eval+jury' : 'ocr+eval';
        send({ type: 'start', totalFiles: files.length, ignoredFiles });
        const results: any[] = [];
        let lastKey = '';

        const onKeySelected = (info: { key: string, isCustom: boolean }) => {
          const maskedKey = info.key.length > 8 ? `${info.key.substring(0, 4)}...${info.key.substring(info.key.length - 4)}` : '***';
          if (lastKey !== info.key) { send({ type: 'key_update', source: info.isCustom ? 'perso' : 'service', key: maskedKey }); lastKey = info.key; }
        };

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const filePath = path.join(inputDir, file);
          const ext = path.extname(file).toLowerCase();
          let mimeType = 'text/plain';
          if (ext === '.pdf') mimeType = 'application/pdf';
          else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
          else if (ext === '.png') mimeType = 'image/png';

          let transcription = "";
          try {
            const fileBuffer = fs.readFileSync(filePath);
            const base64Data = fileBuffer.toString('base64');

            send({ type: 'progress', fileIndex: i, fileName: file, totalFiles: files.length, phase: 'ocr', message: `📄 Lecture de "${file}"...` });

            let evaluationResult: any = null;

            let detectedName = null;
            let detectedEmail = null;
            let ocrAlerts: string[] = [];

            const ocrKeyModeVal = ocrKeyMode || 'both';
            const ocrApiKeys = apiKeys ? Object.fromEntries(
              Object.entries(apiKeys).map(([k, v]: [string, any]) => [k, { ...v, keyMode: ocrKeyModeVal }])
            ) : undefined;

            const isDictee = examType === 'dictee';
            const isTrad = examType === 'traduction';
            const isGramm = examType === 'grammaire';
            const isComposition = examType === 'composition';
            const ocrPrompt = isDictee ? getDictationOcrPrompt() : undefined;

            if (ocrOnly) {
              // OCR only (Gemini)
              const ocrResult = await extractText(base64Data, mimeType, level || 'B2', ocrModel || 'gemini-3.8-flash', ocrApiKeys?.gemini, onKeySelected, nativeLanguage, ocrPrompt);
              transcription = ocrResult.transcription;
              detectedName = ocrResult.studentName;
              ocrAlerts = ocrResult.ocrAlerts || [];
              evaluationResult = { transcription, studentName: detectedName, studentEmail: detectedEmail, ocrAlerts, isOcrOnly: true, fallbackNotice: ocrResult.fallbackNotice, modelUsed: ocrResult.modelUsed, examType };
            } else {
              send({ type: 'progress', fileIndex: i, fileName: file, totalFiles: files.length, phase: 'eval', message: `🧠 Évaluation IA de "${file}"...` });

              const subjectStr = subject || `Sujet standard ${level || 'B2'} ou détecter depuis la copie`;

              // OCR step (Gemini)
              const ocrResult = await extractText(base64Data, mimeType, level || 'B2', ocrModel || 'gemini-3.8-flash', ocrApiKeys?.gemini, onKeySelected, nativeLanguage, ocrPrompt);
              transcription = ocrResult.transcription;
              detectedName = ocrResult.studentName;
              detectedEmail = ocrResult.studentEmail;
              ocrAlerts = ocrResult.ocrAlerts || [];

              if (isDictee) {
                evaluationResult = await evaluateDictation(
                  transcription,
                  customConfig?.referenceText || subjectStr,
                  customConfig?.maxScore || 10,
                  customConfig?.dictationPenalties,
                  customConfig?.customInstructions,
                  evalModel || 'flash',
                  apiKeys?.gemini,
                  onKeySelected
                );
              } else if (isTrad) {
                evaluationResult = await evaluateTranslation(
                  transcription,
                  customConfig?.referenceText || subjectStr,
                  customConfig?.maxScore || 10,
                  customConfig?.modelTranslation,
                  customConfig?.customInstructions,
                  customConfig?.sourceLanguage || 'Français',
                  customConfig?.targetLanguage || 'Français',
                  customConfig?.criteria,
                  evalModel || 'flash',
                  apiKeys?.gemini,
                  onKeySelected
                );
              } else if (isGramm) {
                evaluationResult = await evaluateGrammar(
                  transcription,
                  customConfig?.referenceText || subjectStr,
                  customConfig?.maxScore || 10,
                  customConfig?.modelTranslation,
                  customConfig?.customInstructions,
                  evalModel || 'flash',
                  apiKeys?.gemini,
                  onKeySelected
                );
              } else if (isComposition) {
                evaluationResult = await evaluateComposition(
                  transcription,
                  customConfig?.referenceText || subjectStr,
                  customConfig?.compositionType || 'essai',
                  customConfig?.maxScore || 20,
                  customConfig?.corpusText,
                  customConfig?.targetLanguage || 'Français',
                  customConfig?.customInstructions,
                  customConfig?.criteria,
                  evalModel || 'flash',
                  apiKeys?.gemini,
                  onKeySelected,
                  customConfig?.disableStandardGrid
                );
              } else {
                // Primary evaluation (Gemini standard DELF)
                evaluationResult = await evaluateProduction(subjectStr, { text: transcription }, language || 'VN', 0.3, evalModel || 'flash', level || 'B2', 'flash', apiKeys?.gemini, onKeySelected, false, gradingMode, nativeLanguage);
              }

              if (ocrResult.fallbackNotice && !evaluationResult.fallbackNotice) {
                evaluationResult.fallbackNotice = ocrResult.fallbackNotice;
              }

              // Inject OCR details
              if (detectedName) evaluationResult.studentName = detectedName;
              if (detectedEmail) evaluationResult.studentEmail = detectedEmail;
              evaluationResult.ocrAlerts = ocrAlerts;

              // Double evaluation (Gemini)
              if (useDoubleEval && supervisionModel) {
                try {
                  const supervised = await superviseEvaluation(
                    evaluationResult, transcription,
                    subjectStr, language || 'VN', 0.3, supervisionModel as any, level || 'B2', apiKeys?.gemini, undefined, gradingMode, nativeLanguage
                  );
                  if (supervised._comparison) supervised._comparison.firstProvider = evalModel || 'inconnu';
                  evaluationResult = supervised;

                  // Inject again in case double evaluation overrode them
                  if (detectedName) evaluationResult.studentName = detectedName;
                  if (detectedEmail) evaluationResult.studentEmail = detectedEmail;
                  evaluationResult.ocrAlerts = ocrAlerts;
                } catch (supervisionError: any) {
                  console.error(`Echec de la double evaluation pour ${file}:`, supervisionError);
                  const errResult = {
                    file,
                    status: 'error',
                    errorPhase: 'double_eval',
                    reason: supervisionError.message || "Erreur de double évaluation",
                    batchMode,
                    transcription,
                    primaryResult: evaluationResult
                  };
                  results.push(errResult);
                  send({ type: 'file_error', fileIndex: i, fileName: file, totalFiles: files.length, error: supervisionError.message, batchMode, result: errResult });
                  continue;
                }
              }
            }

            // ── ENVOI AUTOMATIQUE DU BILAN ────────────────────────────────
            let emailSent = false;
            let emailError: string | undefined;

            if (transporter && !ocrOnly && evaluationResult) {
              const recipient = (evaluationResult.studentEmail || '').trim();
              if (!recipient) {
                emailError = "Aucune adresse e-mail détectée pour cet apprenant.";
              } else {
                try {
                  send({
                    type: 'progress', fileIndex: i, fileName: file, totalFiles: files.length,
                    phase: 'email', message: `✉️ Envoi du bilan à ${recipient}...`
                  });

                  const pdfBuffer = await generatePdfBuffer(evaluationResult, level || 'B2');
                  const levelPrefix = level || 'B2';
                  const baseName = sanitizeFilename(
                    evaluationResult.studentName ||
                    recipient.split('@')[0] ||
                    file.replace(/.[^.]+$/, '')
                  ) || sanitizeFilename(`Bilan_${levelPrefix}_${timestampSlug()}`);

                  const pdfPath = await uniqueFilePath(outputDir, baseName, '.pdf');
                  try {
                    fs.writeFileSync(pdfPath, pdfBuffer);
                  } catch (writeErr: any) {
                    console.warn(`[Batch] Copie locale impossible pour ${file} : ${writeErr?.message}`);
                  }

                  await transporter.sendMail({
                    from: `"Évaluation DELF" <${emailUser}>`,
                    to: recipient,
                    // Modèle d'e-mail des réglages, comme l'envoi manuel ; texte par défaut s'il est vide.
                    subject: (typeof emailSubject === 'string' && emailSubject.trim()) ? emailSubject : `Votre bilan de production écrite DELF ${level || 'B2'}`,
                    text: (typeof emailBody === 'string' && emailBody.trim()) ? emailBody : `Bonjour,\n\nVoici la correction de votre production écrite.\n\nBien cordialement,\n\n${emailSignature}`,
                    attachments: [{ filename: path.basename(pdfPath), content: pdfBuffer }],
                  });
                  emailSent = true;
                } catch (mailErr: any) {
                  emailError = mailErr?.message || "Échec de l'envoi de l'e-mail";
                  console.error(`[Batch] Échec de l'envoi du bilan pour ${file} :`, mailErr);
                }
              }
            }

            const result = {
              file, status: 'success', batchMode, ...evaluationResult,
              emailSent,
              ...(emailError ? { emailError } : {}),
            };
            results.push(result);
            send({ type: 'file_done', fileIndex: i, fileName: file, totalFiles: files.length, result });

          } catch (err: any) {
            console.error(`Echec fichier ${file}`, err);
            const errorPhase = transcription ? 'primary_eval' : 'ocr';
            const errResult = {
              file,
              status: 'error',
              errorPhase,
              reason: err.message,
              batchMode,
              ...(transcription ? { transcription } : {})
            };
            results.push(errResult);
            send({ type: 'file_error', fileIndex: i, fileName: file, totalFiles: files.length, error: err.message, batchMode, result: errResult });
          }
        }

        const backupPath = path.join(outputDir, 'last_batch.json');
        try { fs.writeFileSync(backupPath, JSON.stringify(results, null, 2)); } catch (e) { console.error("Erreur de sauvegarde de last_batch.json", e); }
        send({ type: 'done', results });
        controller.close();
      }
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const folder = searchParams.get('folder');
    if (!folder || !fs.existsSync(folder)) {
      return Response.json({ files: [] });
    }
    const files = fs.readdirSync(folder)
      .filter(f => !f.startsWith('.'))
      .filter(f => {
        try {
          return fs.statSync(path.join(folder, f)).isFile();
        } catch {
          return false;
        }
      });
    return Response.json({ files: files.filter(isCopyFile), ignored: files.filter(f => !isCopyFile(f)) });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
