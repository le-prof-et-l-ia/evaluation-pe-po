import fs from 'fs';
import path from 'path';
import {
  buildEvalSystemPrompt,
  buildEvalUserPrompt,
  buildSupervisorPrompt,
  buildSupervisorUserPrompt,
  getOcrPrompt,
  getCriteriaKeys,
  safeParseJson,
} from './promptUtils';
import {
  finalizeExternalInitial,
  finalizeExternalSupervision,
  parseExternalSupervisionResults,
  type ExternalSupervisionConfig,
} from './externalSupervision';
import { sanitizeFilename } from './pathSafety';

export type ExternalBatchTaskType = 'ocr' | 'eval' | 'supervision';

export interface BatchExternalItem {
  file: string;
  filePath?: string;
  subject?: string;
  transcription?: string;
  studentName?: string;
  studentEmail?: string;
  result1?: any;
}

export interface PrepareBatchExternalParams {
  taskType: ExternalBatchTaskType;
  exchangeFolder: string;
  items: BatchExternalItem[];
  config: ExternalSupervisionConfig;
}

export interface ImportBatchExternalParams {
  taskType: ExternalBatchTaskType;
  exchangeFolder: string;
  items: BatchExternalItem[];
  config: ExternalSupervisionConfig;
}

/**
 * Prépare l'arborescence et les fichiers d'instructions pour l'IA externe
 * (Claude Desktop, ChatGPT Desktop ou IA agentique avec accès aux fichiers locaux).
 */
export async function prepareBatchExternalPackage(params: PrepareBatchExternalParams) {
  const { taskType, exchangeFolder, items, config } = params;

  if (!fs.existsSync(exchangeFolder)) {
    fs.mkdirSync(exchangeFolder, { recursive: true });
  }

  const sourcesDir = path.join(exchangeFolder, 'sources');
  const livrablesDir = path.join(exchangeFolder, 'livrables');
  if (!fs.existsSync(sourcesDir)) fs.mkdirSync(sourcesDir, { recursive: true });
  if (!fs.existsSync(livrablesDir)) fs.mkdirSync(livrablesDir, { recursive: true });

  const examTitle = `DELF ${config.level}`;
  const criteriaKeys = getCriteriaKeys(config.level).join(', ');

  let instructionsMd = '';

  if (taskType === 'ocr') {
    const ocrGuidelines = getOcrPrompt(config.level, config.nativeLanguage);
    instructionsMd = `# 📄 Instructions d'OCR Externe — ${examTitle}
Total de copies à transcrire : ${items.length}

Tu es l'agent IA de bureau (Claude / ChatGPT Desktop). Tu as accès aux fichiers sur cet ordinateur.
Ta mission est de transcrire fidèlement les copies manuscrites répertoriées ci-dessous, en respectant scrupuleusement les consignes d'OCR officielles.

## 📌 Consignes officielles de transcription
${ocrGuidelines}

## 📂 Fichiers à traiter (${items.length} copies) :
${items.map((it, idx) => `${idx + 1}. Fichier : \`${it.file}\` | Chemin : \`${it.filePath || it.file}\``).join('\n')}

## 📤 Format des livrables attendus :
Pour chaque copie ci-dessus, crée un fichier dans le dossier :
\`${livrablesDir}\`

Nom du fichier pour chaque copie :
\`<nom_du_fichier>.ocr.json\` (ou simplement \`<nom_du_fichier>.txt\`)

Format JSON attendu (\`<nom_du_fichier>.ocr.json\`) :
\`\`\`json
{
  "file": "<nom_du_fichier_d_origine>",
  "studentName": "<Nom détecté ou null>",
  "studentEmail": "<Email détecté ou null>",
  "transcription": "<Texte intégral fidèlement transcrit>",
  "ocrAlerts": []
}
\`\`\`

*(Alternative : tu peux aussi créer un unique fichier consolidé \`${path.join(livrablesDir, 'resultats_ocr.json')}\` contenant un tableau de ces objets).*
`;
  } else if (taskType === 'eval') {
    const systemPrompt = buildEvalSystemPrompt(config.level, config.language, config.gradingMode, config.nativeLanguage);

    instructionsMd = `# 🧠 Instructions de Première Évaluation Externe — ${examTitle}
Total de copies à évaluer : ${items.length}

Tu es l'EXAMINATEUR INITIAL officiel. Tu dois évaluer chacune des copies listées ci-dessous en appliquant la grille et les consignes de notation.

## 📌 Grille et consignes de notation
${systemPrompt}

## 📂 Copies à évaluer :
Les textes de chaque copie ont été déposés dans le dossier :
\`${sourcesDir}\`

${items.map((it, idx) => {
  const baseName = sanitizeFilename(it.file.replace(/\.[^.]+$/, ''));
  const sourcePath = path.join(sourcesDir, `${baseName}.md`);
  // Écriture du fichier source
  const sourceContent = `# Copie : ${it.file}\n\n## Sujet :\n${it.subject || 'Sujet standard DELF'}\n\n## Transcription de l'étudiant :\n${it.transcription || ''}\n`;
  try { fs.writeFileSync(sourcePath, sourceContent, 'utf-8'); } catch (e) { /* ignore */ }

  return `${idx + 1}. Copie : \`${it.file}\` -> Fichier source : \`${sourcePath}\``;
}).join('\n')}

## 📤 Format des livrables attendus :
Pour chaque copie ci-dessus, analyse le texte et génère un rapport d'évaluation dans :
\`${livrablesDir}\`

Nom du fichier attendu :
\`<nom_copie>.eval.json\`

Schéma JSON attendu :
\`\`\`json
{
  "file": "<nom_du_fichier_d_origine>",
  "studentName": "<nom>",
  "studentEmail": "<email>",
  "transcription": "<transcription>",
  "brouillon_phase1_audit": "...",
  "brouillon_phase2_analyse": "...",
  "globalScore": 15,
  "criteriaScores": { ${criteriaKeys} },
  "justifications": { ${criteriaKeys} },
  "advices": { ${criteriaKeys} },
  "errorsTable": [
    { "original": "...", "correction": "...", "rule": "..." }
  ]
}
\`\`\`

*(Alternative : tu peux aussi produire un fichier unique \`${path.join(livrablesDir, 'resultats_eval.json')}\` contenant la liste des évaluations).*
`;
  } else if (taskType === 'supervision') {
    const supervisorPrompt = buildSupervisorPrompt(config.level, config.language, config.gradingMode, config.nativeLanguage);

    instructionsMd = `# ⚖️ Instructions de Double Évaluation (Supervision) — ${examTitle}
Total de copies à superviser : ${items.length}

Tu es la DOUBLE ÉVALUATION (examinateur superviseur d'autorité). Tu dois analyser chaque copie et l'évaluation du 1er examinateur, rectifier les erreurs et produire le rapport officiel final.
**RÈGLE D'OR :** Tes notes et ton rapport font autorité et seront retenus pour le bilan de l'élève. L'application compare automatiquement ton rapport avec le 1er examinateur pour l'audit du correcteur.

## 📌 Consignes du Superviseur
${supervisorPrompt}

## 📂 Fiches des copies à superviser :
Les données complètes de chaque copie (texte + évaluation du 1er correcteur) ont été déposées dans :
\`${sourcesDir}\`

${items.map((it, idx) => {
  const baseName = sanitizeFilename(it.file.replace(/\.[^.]+$/, ''));
  const sourcePath = path.join(sourcesDir, `${baseName}_eval1.json`);
  const data = {
    file: it.file,
    subject: it.subject || it.result1?.subject || 'Sujet',
    transcription: it.transcription || it.result1?.transcription || '',
    firstEvaluation: it.result1 || {}
  };
  try { fs.writeFileSync(sourcePath, JSON.stringify(data, null, 2), 'utf-8'); } catch (e) { /* ignore */ }

  return `${idx + 1}. Copie : \`${it.file}\` -> Fiche complète : \`${sourcePath}\``;
}).join('\n')}

## 📤 Format des livrables attendus :
Pour chaque copie ci-dessus, analyse la copie et le 1er rapport, puis dépose ton évaluation consolidée dans :
\`${livrablesDir}\`

Nom du fichier attendu :
\`<nom_copie>.supervision.json\`

Schéma JSON attendu :
\`\`\`json
{
  "file": "<nom_du_fichier_d_origine>",
  "studentName": "<nom>",
  "studentEmail": "<email>",
  "transcription": "<transcription>",
  "brouillon_phase1_audit": "...",
  "brouillon_phase2_analyse": "...",
  "globalScore": 15,
  "criteriaScores": { ${criteriaKeys} },
  "justifications": { ${criteriaKeys} },
  "advices": { ${criteriaKeys} },
  "errorsTable": [
    { "original": "...", "correction": "...", "rule": "..." }
  ]
}
\`\`\`

*(Alternative : tu peux aussi créer un unique fichier \`${path.join(livrablesDir, 'resultats_supervision.json')}\` contenant la liste des objets).*
`;
  }

  const instructionsPath = path.join(exchangeFolder, 'CONSIGNES.md');
  fs.writeFileSync(instructionsPath, instructionsMd, 'utf-8');

  return {
    success: true,
    exchangeFolder,
    instructionsPath,
    sourcesDir,
    livrablesDir,
    totalItems: items.length
  };
}

/**
 * Scanne le dossier de livrables et le dossier d'échange pour importer
 * les résultats livrés par l'IA de bureau (Claude / ChatGPT).
 */
export async function importBatchExternalPackage(params: ImportBatchExternalParams) {
  const { taskType, exchangeFolder, items, config } = params;

  if (!fs.existsSync(exchangeFolder)) {
    throw new Error(`Le dossier d'échange "${exchangeFolder}" n'existe pas.`);
  }

  const livrablesDir = path.join(exchangeFolder, 'livrables');
  const dirsToScan = [exchangeFolder];
  if (fs.existsSync(livrablesDir)) dirsToScan.unshift(livrablesDir);

  // Collecte de tous les fichiers disponibles
  const availableFiles: { fullPath: string; fileName: string; content: string }[] = [];
  for (const dir of dirsToScan) {
    try {
      const list = fs.readdirSync(dir);
      for (const f of list) {
        if (f.startsWith('.') || f.toLowerCase() === 'consignes.md') continue;
        const full = path.join(dir, f);
        try {
          const st = fs.statSync(full);
          if (st.isFile()) {
            const content = fs.readFileSync(full, 'utf-8');
            availableFiles.push({ fullPath: full, fileName: f, content });
          }
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }

  // Vérifier d'abord s'il y a un fichier groupé (ex: resultats_ocr.json, resultats_eval.json, etc.)
  let globalParsed: any[] = [];
  for (const af of availableFiles) {
    if (af.fileName.toLowerCase().endsWith('.json') && af.fileName.toLowerCase().includes('resultat')) {
      try {
        const parsed = parseExternalSupervisionResults(af.content);
        if (Array.isArray(parsed) && parsed.length > 0) {
          globalParsed = parsed;
          break;
        }
      } catch { /* continue */ }
    }
  }

  const results: any[] = [];
  const errors: string[] = [];

  for (const item of items) {
    const rawBase = item.file.replace(/\.[^.]+$/, '').toLowerCase();
    const cleanBase = sanitizeFilename(rawBase).toLowerCase();

    // 1. Chercher dans les résultats globaux si existants
    const matchGlobal = globalParsed.find(p => {
      const pId = String(p.fileId || p.file || '').toLowerCase();
      return pId === item.file.toLowerCase() || pId === rawBase || pId === cleanBase;
    });

    let rawData: any = null;

    if (matchGlobal) {
      rawData = matchGlobal.evaluation || matchGlobal;
    } else {
      // 2. Chercher dans les fichiers individuels
      const foundFile = availableFiles.find(af => {
        const lower = af.fileName.toLowerCase();
        return (
          lower === `${rawBase}.${taskType}.json` ||
          lower === `${cleanBase}.${taskType}.json` ||
          lower === `${item.file.toLowerCase()}.${taskType}.json` ||
          lower === `${rawBase}.json` ||
          lower === `${cleanBase}.json` ||
          lower.startsWith(cleanBase) ||
          lower.startsWith(rawBase)
        );
      });

      if (foundFile) {
        if (taskType === 'ocr' && (foundFile.fileName.endsWith('.txt') || foundFile.fileName.endsWith('.md'))) {
          // Cas simple : fichier texte de transcription
          rawData = { transcription: foundFile.content.trim() };
        } else {
          try {
            const parsedList = parseExternalSupervisionResults(foundFile.content);
            if (parsedList.length > 0) {
              rawData = parsedList[0].evaluation || parsedList[0];
            }
          } catch {
            rawData = safeParseJson(foundFile.content);
          }
        }
      }
    }

    if (!rawData) {
      continue; // Pas encore livré pour cette copie
    }

    try {
      if (taskType === 'ocr') {
        const transcription = rawData.transcription || (typeof rawData === 'string' ? rawData : '');
        if (!transcription || !transcription.trim()) {
          throw new Error("Transcription vide ou absente.");
        }
        results.push({
          file: item.file,
          status: 'success',
          isOcrOnly: true,
          transcription: transcription.trim(),
          studentName: rawData.studentName || item.studentName || null,
          studentEmail: rawData.studentEmail || item.studentEmail || null,
          ocrAlerts: Array.isArray(rawData.ocrAlerts) ? rawData.ocrAlerts : [],
          modelUsed: 'IA externe (Desktop)',
        });
      } else if (taskType === 'eval') {
        const text = item.transcription || rawData.transcription || '';
        const finalized = finalizeExternalInitial(rawData, config.gradingMode, text, config.level);
        results.push({
          ...finalized,
          file: item.file,
          status: 'success',
          isOcrOnly: false,
          modelUsed: 'IA externe (Examinateur 1)',
        });
      } else if (taskType === 'supervision') {
        const baseResult = item.result1 || {};
        const text = item.transcription || baseResult.transcription || rawData.transcription || '';
        const finalized = finalizeExternalSupervision(
          baseResult,
          rawData,
          config.gradingMode,
          'IA externe (Desktop)',
          baseResult.modelUsed || 'Examinateur 1',
          config.level
        );
        results.push({
          ...finalized,
          file: item.file,
          status: 'success',
          isOcrOnly: false,
        });
      }
    } catch (err: any) {
      errors.push(`${item.file} : ${err.message}`);
    }
  }

  return {
    success: results.length > 0,
    totalFound: results.length,
    totalExpected: items.length,
    results,
    errors
  };
}
