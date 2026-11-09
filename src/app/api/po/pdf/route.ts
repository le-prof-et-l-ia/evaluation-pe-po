import { NextResponse } from 'next/server';
import { generatePdfBuffer } from '@/lib/po/pdfGenerator';
import { EvaluationData } from '@/lib/po/types';
import fs from 'fs';
import path from 'path';
import { sanitizeFilename, timestampSlug, uniqueFilePath } from '@/lib/pathSafety';

function buildBaseName(data: EvaluationData, level: string): string {
  const candidates = [
    data.studentName,
    data.studentEmail ? String(data.studentEmail).split('@')[0] : '',
    data.file ? String(data.file).replace(/\.[^.]+$/, '') : '',
  ];

  for (const candidate of candidates) {
    if (candidate && String(candidate).trim() !== '') {
      const safe = sanitizeFilename(String(candidate));
      if (safe) return safe;
    }
  }

  const prefix = `Bilan_DELF_${level || 'B2'}`;
  return sanitizeFilename(`${prefix}_${timestampSlug()}`);
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const data: EvaluationData = rawBody.result || rawBody;
    const level: string = rawBody.level || 'B2';
    const outputFolder: string | undefined = rawBody.outputFolder;

    console.log(`[PO PDF API] Generating PDF for ${data.studentName || data.studentEmail || 'Unknown'} - Level: ${level}`);

    const pdfBuffer = await generatePdfBuffer(data, level);
    console.log(`[PO PDF API] Buffer generated: ${pdfBuffer.length} bytes`);

    const baseName = buildBaseName(data, level);
    let fileName = `${baseName}.pdf`;

    try {
      const outputDir = outputFolder && outputFolder.trim() !== ''
        ? path.resolve(outputFolder)
        : path.join(process.cwd(), 'data', 'outputs');

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const filePath = await uniqueFilePath(outputDir, baseName, '.pdf');
      fs.writeFileSync(filePath, pdfBuffer);
      fileName = path.basename(filePath);
      console.log(`[PO PDF API] Saved successfully to ${filePath}`);
    } catch (saveError: any) {
      console.warn(`[PO PDF API] Could not save to disk (${saveError?.message}), returning buffer directly`);
    }

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'X-Filename': encodeURIComponent(fileName),
      },
    });
  } catch (error: any) {
    console.error("[PO PDF API] Error generating PDF:", error);
    return NextResponse.json({ error: error.message || 'Erreur lors de la génération du PDF' }, { status: 500 });
  }
}
