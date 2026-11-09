import { evaluateProduction, extractText, superviseEvaluation, evaluateInterpretation } from '@/lib/po/geminiService';
import { generatePdfBuffer } from '@/lib/po/pdfGenerator';
import { sanitizeFilename, timestampSlug, uniqueFilePath } from '@/lib/pathSafety';
import fs from 'fs';
import path from 'path';
// @ts-expect-error NodeMailer lacks full types here without @types/nodemailer
import nodemailer from 'nodemailer';

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
      nativeLanguage,
      notationType = 'detailed',
      signature = "L'équipe pédagogique",
      examType = 'delf',
      sourceSpeech,
      maxScore = 10,
      interpretationMode = 'consecutive',
      sourceLanguage,
      targetLanguage,
      criteria,
      customInstructions
    } = await req.json();
    
    if (!folderPath) {
      return new Response(JSON.stringify({ error: "Chemin du dossier source requis." }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const inputDir = folderPath;
    const outputDir = outputFolderPath || path.join(process.cwd(), 'data/outputs');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const files = fs.readdirSync(inputDir)
      .filter(f => !f.startsWith('.'))
      .map(f => { const fullPath = path.join(inputDir, f); const stat = fs.statSync(fullPath); return { name: f, st: stat }; })
      .filter(item => !item.st.isDirectory())
      .sort((a, b) => a.st.mtimeMs - b.st.mtimeMs)
      .map(item => item.name);

    if (files.length === 0) {
      return new Response(JSON.stringify({ error: "Aucun fichier trouvé dans le dossier source." }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    let transporter = null;
    const emailUser = emailConfig?.user || process.env.EMAIL_USER;
    const emailPass = emailConfig?.pass || process.env.EMAIL_PASS;

    if (autoEmail && emailUser && emailPass) {
      transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: emailUser, pass: emailPass } });
    }

    const { searchParams } = new URL(req.url);
    const useDoubleEval = searchParams.get('useDoubleEval') === 'true';
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); };
        const batchMode = ocrOnly ? 'ocr' : (useDoubleEval && supervisionProvider && supervisionModel) ? 'ocr+eval+jury' : 'ocr+eval';
        send({ type: 'start', totalFiles: files.length });
        const results: any[] = [];
        let lastKey = '';

        const onKeySelected = (info: { key: string, isCustom: boolean }) => {
          const maskedKey = info.key.length > 8 ? `${info.key.substring(0, 4)}...${info.key.substring(info.key.length - 4)}` : '***';
          if (lastKey !== info.key) { send({ type: 'key_update', source: info.isCustom ? 'perso' : 'service', key: maskedKey }); lastKey = info.key; }
        };

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const filePath = path.join(inputDir, file);
          const mimeType = getMimeType(file);

          let transcription = "";
          try {
            const fileBuffer = fs.readFileSync(filePath);
            const base64Data = fileBuffer.toString('base64');

            send({ type: 'progress', fileIndex: i, fileName: file, totalFiles: files.length, phase: 'ocr', message: `🎙️ Transcription audio de "${file}"...` });

            let evaluationResult: any = null;

            const ocrKeyModeVal = ocrKeyMode || 'both';
            const ocrApiKeys = apiKeys ? Object.fromEntries(
              Object.entries(apiKeys).map(([k, v]: [string, any]) => [k, { ...v, keyMode: ocrKeyModeVal }])
            ) : undefined;

            const isInterpretation = examType === 'interpretation';

            if (ocrOnly) {
              const ocrResOnly = await extractText(base64Data, mimeType, level || 'B2', ocrModel || 'gemini-3.8-flash', ocrApiKeys?.gemini, onKeySelected, nativeLanguage);
              transcription = ocrResOnly.text;
              evaluationResult = { transcription, isOcrOnly: true, examType };
            } else {
              send({ type: 'progress', fileIndex: i, fileName: file, totalFiles: files.length, phase: 'eval', message: `🧠 Évaluation IA de "${file}"...` });

              const subjectStr = subject || `Sujet standard ${level || 'B2'} ou détecter depuis la copie`;

              // OCR step
              let ocrFallbackNotice: string | undefined;
              const ocrRes = await extractText(base64Data, mimeType, level || 'B2', ocrModel || 'gemini-3.8-flash', ocrApiKeys?.gemini, onKeySelected, nativeLanguage);
              transcription = ocrRes.text;
              if (ocrRes.fallbackNotice) {
                ocrFallbackNotice = ocrRes.fallbackNotice;
              }

              if (isInterpretation) {
                const srcSpeech = sourceSpeech || subjectStr;
                evaluationResult = await evaluateInterpretation(
                  transcription,
                  srcSpeech,
                  Number(maxScore) || 10,
                  interpretationMode,
                  sourceLanguage || 'Français',
                  targetLanguage || 'Français',
                  criteria,
                  customInstructions,
                  evalModel || 'flash',
                  apiKeys?.gemini,
                  onKeySelected
                );
              } else {
                // Primary evaluation (standard DELF)
                evaluationResult = await evaluateProduction(
                  subjectStr, 
                  { text: transcription }, 
                  language || 'FR', 
                  0.3, 
                  evalModel || 'flash', 
                  level || 'B2', 
                  'flash', 
                  apiKeys?.gemini, 
                  onKeySelected, 
                  false,
                  nativeLanguage,
                  notationType
                );
              }

              if (ocrFallbackNotice && !evaluationResult.fallbackNotice) {
                evaluationResult.fallbackNotice = ocrFallbackNotice;
              }

              // Double evaluation
              if (useDoubleEval && supervisionProvider && supervisionModel) {
                try {
                  const supervised = await superviseEvaluation(
                    evaluationResult, transcription,
                    subjectStr, language || 'FR', 0.3, supervisionModel as any, level || 'B2', apiKeys?.gemini,
                    onKeySelected, undefined, notationType
                  );
                  if (supervised._comparison) supervised._comparison.firstProvider = evalModel || 'inconnu';
                  evaluationResult = supervised;
                } catch (supervisionError: any) {
                  console.error(`[PO Batch] Échec de la double évaluation pour ${file}:`, supervisionError);
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

            if (evaluationResult) {
              evaluationResult.notationType = notationType;
            }

            // Envoi automatique de l'e-mail
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
                  const fallbackPrefix = `Bilan_DELF_${level || 'B2'}`;
                  const baseName = sanitizeFilename(
                    evaluationResult.studentName ||
                    recipient.split('@')[0] ||
                    file.replace(/\.[^.]+$/, '')
                  ) || sanitizeFilename(`${fallbackPrefix}_${timestampSlug()}`);

                  const pdfPath = await uniqueFilePath(outputDir, baseName, '.pdf');
                  try {
                    fs.writeFileSync(pdfPath, pdfBuffer);
                  } catch (writeErr: any) {
                    console.warn(`[PO Batch] Copie locale impossible pour ${file} : ${writeErr?.message}`);
                  }

                  const levelLabel = `DELF ${level || 'B2'}`;
                  const subjectHeader = isInterpretation ? "Votre bilan d'évaluation — Interprétation orale" : `Votre bilan de production orale ${levelLabel}`;
                  const bodyIntro = isInterpretation ? "Voici le bilan de votre interprétation orale." : `Voici le bilan de votre production orale ${levelLabel}.`;
                  await transporter.sendMail({
                    from: `"Évaluation DELF" <${emailUser}>`,
                    to: recipient,
                    subject: subjectHeader,
                    text: `Bonjour,\n\n${bodyIntro}\n\nBien cordialement,\n\n${signature}`,
                    attachments: [{ filename: path.basename(pdfPath), content: pdfBuffer }],
                  });
                  emailSent = true;
                } catch (mailErr: any) {
                  emailError = mailErr?.message || "Échec de l'envoi de l'e-mail";
                  console.error(`[PO Batch] Échec de l'envoi du bilan pour ${file} :`, mailErr);
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
            console.error(`[PO Batch] Échec fichier ${file}:`, err);
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

        const backupPath = path.join(outputDir, 'last_batch_po.json');
        try { fs.writeFileSync(backupPath, JSON.stringify(results, null, 2)); } catch (e) { console.error("[PO Batch] Erreur de sauvegarde last_batch_po.json", e); }
        send({ type: 'done', results });
        controller.close();
      }
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
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
    return Response.json({ files });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
