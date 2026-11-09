import { NextResponse } from 'next/server';
import { generatePdfBuffer } from '@/lib/pdfGenerator';
import { EvaluationData } from '@/components/EvaluationResultView';
import fs from 'fs';
import path from 'path';

import { sanitizeFilename, timestampSlug, uniqueFilePath } from '@/lib/pathSafety';

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const data: EvaluationData = rawBody.result || rawBody;
    const level: string = rawBody.level || 'B2';
    const outputFolder: string | undefined = rawBody.outputFolder;

    console.log(`[PDF API] Generating PDF for ${data.studentName || data.studentEmail || 'Unknown'} - Level: ${level}`);

    // Générer le PDF via Puppeteer (HTML → Chrome/Edge → PDF)
    const pdfBuffer = await generatePdfBuffer(data, level);
    console.log(`[PDF API] Buffer generated successfully: ${pdfBuffer.length} bytes`);

    let baseName = "";
    if (data.studentName && data.studentName.trim() !== '') {
      baseName = sanitizeFilename(data.studentName);
    } else if (data.studentEmail && data.studentEmail.trim() !== '') {
      baseName = sanitizeFilename(data.studentEmail.split('@')[0]);
    } else if (data.file && data.file.trim() !== '') {
      baseName = sanitizeFilename(data.file.split('.')[0]);
    }

    // Repli : DATE ET HEURE de l'évaluation. L'ancien nom fixe faisait que
    // deux copies sans nom d'apprenant s'écrasaient systématiquement.
    if (!baseName || baseName === '_') {
      baseName = sanitizeFilename(`Bilan_DELF_${level}_${timestampSlug()}`);
    }

    let fileName = `${baseName}.pdf`;

    // Sauvegarder localement de manière sécurisée (ne bloque pas le téléchargement en cas d'erreur de verrou disque)
    try {
      const outputDir = outputFolder && outputFolder.trim() !== ''
        ? path.resolve(outputFolder)
        : path.join(process.cwd(), 'data', 'outputs');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      // Ne jamais écraser un bilan existant (homonymes, relance d'une copie…).
      const filePath = await uniqueFilePath(outputDir, baseName, '.pdf');
      fs.writeFileSync(filePath, pdfBuffer);
      fileName = path.basename(filePath);
      console.log(`[PDF API] Local copy saved to: ${filePath}`);
    } catch (saveErr: any) {
      console.warn(`[PDF API] Attention : impossible d'enregistrer la copie locale sur le disque (${saveErr?.message}). Le PDF est quand même renvoyé au client.`);
    }

    // Retourner le PDF binaire au navigateur
    const encodedFileName = encodeURIComponent(fileName);
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (err: any) {
    console.error("[PDF API] Erreur critique lors de la génération PDF :", err);
    return NextResponse.json(
      { error: err?.message || 'Erreur inconnue lors de la génération du PDF' },
      { status: 500 }
    );
  }
}
