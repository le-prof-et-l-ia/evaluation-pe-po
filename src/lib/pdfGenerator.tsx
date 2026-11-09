import { formatScore } from '@/lib/scoreUtils';
import { EvaluationData } from '@/components/EvaluationResultView';
import { getCriteriaConfig } from '@/lib/promptUtils';
import { DEFAULT_TRANSLATION_CRITERIA } from '@/lib/traductionEngine';
import { getCompositionCriteria, getCompositionTypeLabel } from '@/lib/compositionEngine';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

function findBrowserExecutable(): string | undefined {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe') : '',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function getScoreColor(score: number, maxScore: number = 5): string {
  const ratio = maxScore > 0 ? score / maxScore : 0;
  if (ratio >= 0.8) return '#059669';
  if (ratio >= 0.6) return '#d97706';
  if (ratio >= 0.4) return '#ea580c';
  return '#dc2626';
}

function getScoreLabel(score: number, level: string, maxScore: number = 5): string {
  const displayLevel = level;
  const ratio = maxScore > 0 ? score / maxScore : 0;
  if (ratio >= 0.9) return `${displayLevel}+ (Maîtrise complète)`;
  if (ratio >= 0.7) return `${displayLevel} (Très bon contrôle)`;
  if (ratio >= 0.5) return `${displayLevel} (Acquis)`;
  if (ratio >= 0.3) return `Sous ${displayLevel} (Transition)`;
  if (ratio >= 0.1) return `Sous ${displayLevel} (Insuffisant)`;
  return 'Non répondu ou insuffisant';
}

function escapeHtml(text: unknown): string {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildFlexibleRegexPattern(original: string): string | null {
  if (!original || typeof original !== 'string') return null;
  const trimmed = original.trim();
  if (!trimmed) return null;

  const escapeRegex = (str: string) => str.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  // Séparateur flexible : espaces, sauts de ligne, ponctuations, guillemets, tirets
  const fillerPattern = `(?:\\s+|[,;:.…—–\\-«»"'\u2019\u2018\u201c\u201d]|\\[[^\\]]*\\])+`;

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  const escapedWords = words.map(w => {
    let esc = escapeRegex(w);
    esc = esc.replace(/['\u2019\u0027]/g, "['’\u2019\u0027]");
    esc = esc.replace(/["«»\u201c\u201d]/g, '["«»\u201c\u201d]');
    return esc;
  });

  return escapedWords.join(fillerPattern);
}

function highlightErrorsInTranscription(transcription: string, errorsTable: any[]): string {
  if (!transcription) return '(Non disponible)';
  if (!errorsTable || !Array.isArray(errorsTable) || errorsTable.length === 0) return escapeHtml(transcription);

  const validErrors = errorsTable.filter(err => err && typeof err.original === 'string' && err.original.trim() !== '');
  const sortedErrors = [...validErrors].sort((a, b) => (b.original?.length || 0) - (a.original?.length || 0));

  let result = transcription;
  const placeholders: Map<string, string> = new Map();

  for (const err of sortedErrors) {
    if (!err.original || typeof err.original !== 'string' || err.original.trim() === '') continue;
    const regexPattern = buildFlexibleRegexPattern(err.original);
    if (!regexPattern) continue;

    try {
      let regex: RegExp;
      try {
        regex = new RegExp(regexPattern, 'giu');
      } catch {
        regex = new RegExp(regexPattern, 'gi');
      }

      let match: RegExpExecArray | null;
      while ((match = regex.exec(result)) !== null) {
        const placeholder = `__ERR_${placeholders.size}__`;
        const matchedText = match[0];
        const idx = match.index;
        const preChar = result[idx - 1];
        const postChar = result[idx + matchedText.length];
        const isBoundaryBefore = !preChar || /[^\p{L}\p{N}]/u.test(preChar);
        const isBoundaryAfter = !postChar || /[^\p{L}\p{N}]/u.test(postChar);

        if (isBoundaryBefore && isBoundaryAfter) {
          placeholders.set(placeholder, 
            `<span style="background:#fef2f2; border-bottom:2px solid #dc2626; padding:0 2px; border-radius:2px; color:#991b1b;" title="${escapeHtml(err.correction || '')}">${escapeHtml(matchedText)}</span>`);
          result = result.substring(0, idx) + placeholder + result.substring(idx + matchedText.length);
          regex.lastIndex = idx + placeholder.length;
        } else {
          if (matchedText.length === 0) regex.lastIndex++;
        }
      }
    } catch (e) {
      console.warn("[PDF] Erreur regex highlight:", e);
    }
  }

  result = escapeHtml(result);
  for (const [placeholder, html] of placeholders) {
    result = result.replace(new RegExp(escapeHtml(placeholder), 'g'), html);
  }

  return result;
}

function buildHtml(data: EvaluationData, level: string): string {
  const isDictee = data?.examType === 'dictee';
  const isTraduction = data?.examType === 'traduction';
  const isGrammaire = data?.examType === 'grammaire';
  const isComposition = data?.examType === 'composition';
  const isCustom = isDictee || isTraduction || isGrammaire || isComposition;

  const maxGlobal = Number(data?.maxScore) || (isComposition ? 20 : isCustom ? 10 : 25);
  const globalScore = Number(data?.globalScore) || 0;
  const globalThreshold = maxGlobal / 2;
  const globalColor = globalScore >= globalThreshold ? '#059669' : '#d97706';

  const compositionLabel = getCompositionTypeLabel((data as any)?.compositionType || 'essai');

  const examMainTitle = isDictee ? 'Évaluation de la Dictée' :
                        isTraduction ? 'Évaluation de la Traduction' :
                        isGrammaire ? 'Évaluation des Exercices de Grammaire' :
                        isComposition ? `Évaluation de la Composition — ${compositionLabel}` :
                        'Évaluation de votre production écrite';

  const examSubtitle = isDictee ? `Épreuve de dictée — Barème sur ${maxGlobal} points` :
                       isTraduction ? `Épreuve de traduction — Barème sur ${maxGlobal} points` :
                       isGrammaire ? `Exercices de grammaire — Barème sur ${maxGlobal} points` :
                       isComposition ? (
                         (data as any)?.disableStandardGrid 
                           ? `Épreuve de composition (Barème libre enseignant) — ${maxGlobal} points`
                           : `Épreuve de composition (${compositionLabel}) — Barème sur ${maxGlobal} points`
                       ) :
                       `Certification Assistée par IA — Niveau ${level}`;

  const configList = isTraduction ? DEFAULT_TRANSLATION_CRITERIA :
                     isComposition ? (
                       (data as any)?.disableStandardGrid && Array.isArray((data as any)?.customCriteriaEvaluated) && (data as any)?.customCriteriaEvaluated.length > 0
                         ? (data as any).customCriteriaEvaluated
                         : getCompositionCriteria((data as any)?.compositionType || 'essai', maxGlobal)
                     ) :
                     getCriteriaConfig(level);
  const criteriaScores = data?.criteriaScores || {};
  const justifications = data?.justifications || {};
  const advices = data?.advices || {};
  const errorsTable = Array.isArray(data?.errorsTable) ? data.errorsTable : [];

  let criteriaRows = '';

  for (const crit of configList) {
    const score = Number((criteriaScores as any)[crit.key]) || 0;
    const justification = String((justifications as any)[crit.key] || '');
    const advice = String((advices as any)[crit.key] || '');
    const color = getScoreColor(score, crit.maxScore);

    criteriaRows += `
      <div style="border:1px solid #e2e8f0; border-radius:12px; padding:16px 20px; margin-bottom:12px; background:#fff; page-break-inside: avoid;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div>
            <strong style="font-size:14px; color:#1e293b;">${escapeHtml(crit.label)}</strong>
            <div style="font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:1px; margin-top:2px;">${getScoreLabel(score, level, crit.maxScore)}</div>
          </div>
          <div style="background:${color}15; border:2px solid ${color}40; color:${color}; font-weight:900; font-size:18px; padding:6px 16px; border-radius:10px; min-width:70px; text-align:center;">
            ${formatScore(score)} / ${crit.maxScore.toString().replace('.', ',')}
          </div>
        </div>
        ${crit.description ? `
        <div style="font-size:11px; color:#64748b; margin-bottom:8px; font-style:italic;">
          ${escapeHtml(crit.description)}
        </div>` : ''}
        <div style="background:#f0f9ff; border-left:4px solid #3b82f6; padding:10px 14px; border-radius:0 8px 8px 0; margin-bottom:8px;">
          <div style="font-size:10px; font-weight:700; color:#3b82f6; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">Descripteur de performance</div>
          <p style="font-size:12px; color:#334155; font-style:italic; margin:0; line-height:1.6;">"${escapeHtml(justification)}"</p>
        </div>
        ${advice ? `
        <div style="background:#f0fdf4; border-left:4px solid #10b981; padding:10px 14px; border-radius:0 8px 8px 0;">
          <div style="font-size:10px; font-weight:700; color:#10b981; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">Axes d'amélioration</div>
          <p style="font-size:12px; color:#334155; margin:0; line-height:1.6;">${escapeHtml(advice)}</p>
        </div>` : ''}
      </div>`;
  }

  const errorsRows = errorsTable.map((err: any) => `
    <tr style="page-break-inside: avoid;">
      <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#dc2626; text-decoration:line-through; font-size:12px;">${escapeHtml(err?.original || '')}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#059669; font-weight:600; font-size:12px;">${escapeHtml(err?.correction || '')}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#475569; font-style:italic; font-size:11px;">${escapeHtml(err?.rule || '')}</td>
    </tr>`).join('');

  const highlightedTranscription = highlightErrorsInTranscription(data?.transcription || '', errorsTable);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color:#0f172a; background:#fff; font-size:13px; line-height:1.5; }
    @page { margin:30px 35px; size:A4; }
  </style>
</head>
<body>
  <!-- HEADER -->
  <div style="display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:24px; border-bottom:3px solid #f1f5f9; margin-bottom:32px; position:relative;">
    <div style="flex:1;">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
        <div style="background:#2563eb; width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
        </div>
        <h1 style="font-size:26px; font-weight:900; color:#0f172a; margin:0; letter-spacing:-0.5px;">${examMainTitle}</h1>
      </div>
      <p style="font-size:12px; color:#64748b; font-weight:700; text-transform:uppercase; letter-spacing:2px; margin-bottom:8px;">${examSubtitle}</p>
      <div style="display:flex; gap:16px;">
        <div style="font-size:11px; color:#334155;"><strong style="color:#94a3b8; font-weight:600;">NOM :</strong> ${escapeHtml(data?.studentName || 'Non spécifié')}</div>
        <div style="font-size:11px; color:#334155;"><strong style="color:#94a3b8; font-weight:600;">DATE :</strong> ${new Date().toLocaleDateString('fr-FR')}</div>
      </div>
    </div>
    <div style="text-align:center; background:linear-gradient(135deg, ${globalColor} 0%, ${globalColor}dd 100%); padding:20px 30px; border-radius:24px; box-shadow: 0 10px 15px -3px ${globalColor}33; color:white;">
      <div style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:2px; opacity:0.9; margin-bottom:4px;">Score Global</div>
      <div style="font-size:46px; font-weight:900; line-height:1;">${formatScore(globalScore)}<span style="font-size:22px; opacity:0.6;">/${maxGlobal}</span></div>
    </div>
  </div>

  <!-- CORPUS / TEXTE SUPPORT SI COMPOSITION -->
  ${isComposition && (data as any)?.corpusText ? `
  <div style="margin-bottom:20px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px 18px;">
    <h3 style="font-size:12px; font-weight:800; color:#475569; margin:0 0 6px 0; text-transform:uppercase; letter-spacing:1px;">📚 Texte support / Corpus documentaire</h3>
    <p style="font-size:11px; color:#334155; line-height:1.6; margin:0; white-space:pre-wrap;">${escapeHtml((data as any).corpusText)}</p>
  </div>` : ''}

  <!-- TRANSCRIPTION (erreurs soulignées en rouge) -->
  <div style="margin-bottom:28px;">
    <h2 style="font-size:16px; font-weight:700; color:#1e293b; margin-bottom:10px;">📝 ${isDictee ? "Copie de l'élève" : isTraduction ? "Traduction de l'élève" : isGrammaire ? "Réponses de l'élève" : isComposition ? "Copie rédigée de l'élève" : "Transcription de l'étudiant"}</h2>
    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px 20px; font-size:12px; color:#334155; line-height:1.8; white-space:pre-wrap;">${highlightedTranscription}</div>
    ${errorsTable.length > 0 ? '<p style="font-size:9px; color:#94a3b8; margin-top:4px; font-style:italic;">Les passages <span style="background:#fef2f2; border-bottom:2px solid #dc2626; padding:0 2px;">soulignés en rouge</span> indiquent les erreurs détectées.</p>' : ''}
  </div>

  <!-- SECTION SPÉCIFIQUE DICTÉE -->
  ${isDictee && data.breakdown ? `
  <div style="margin-bottom:28px;">
    <h2 style="font-size:16px; font-weight:700; color:#1e293b; margin-bottom:14px;">📊 Synthèse du calcul et décompte des pénalités</h2>
    <div style="display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap;">
      <div style="flex:1; min-width:110px; background:#fef2f2; border:1px solid #fecaca; border-radius:10px; padding:12px; text-align:center;">
        <div style="font-size:9px; font-weight:800; text-transform:uppercase; color:#991b1b;">Grammaire</div>
        <div style="font-size:18px; font-weight:900; color:#dc2626;">${data.breakdown.grammar?.count || 0}</div>
        <div style="font-size:10px; color:#b91c1c;">-${data.breakdown.grammar?.penaltyPoints || 0} pt</div>
      </div>
      <div style="flex:1; min-width:110px; background:#fffbeb; border:1px solid #fde68a; border-radius:10px; padding:12px; text-align:center;">
        <div style="font-size:9px; font-weight:800; text-transform:uppercase; color:#92400e;">Usage / Lexique</div>
        <div style="font-size:18px; font-weight:900; color:#d97706;">${data.breakdown.usage?.count || 0}</div>
        <div style="font-size:10px; color:#b45309;">-${data.breakdown.usage?.penaltyPoints || 0} pt</div>
      </div>
      <div style="flex:1; min-width:110px; background:#f0f9ff; border:1px solid #bae6fd; border-radius:10px; padding:12px; text-align:center;">
        <div style="font-size:9px; font-weight:800; text-transform:uppercase; color:#0369a1;">Accents</div>
        <div style="font-size:18px; font-weight:900; color:#0284c7;">${data.breakdown.accent?.count || 0}</div>
        <div style="font-size:10px; color:#0284c7;">-${data.breakdown.accent?.penaltyPoints || 0} pt</div>
      </div>
      <div style="flex:1; min-width:110px; background:#eef2ff; border:1px solid #c7d2fe; border-radius:10px; padding:12px; text-align:center;">
        <div style="font-size:9px; font-weight:800; text-transform:uppercase; color:#3730a3;">Ponctuation</div>
        <div style="font-size:18px; font-weight:900; color:#4f46e5;">${data.breakdown.punctuation?.count || 0}</div>
        <div style="font-size:10px; color:#4338ca;">-${data.breakdown.punctuation?.penaltyPoints || 0} pt</div>
      </div>
      <div style="flex:1; min-width:110px; background:#faf5ff; border:1px solid #e9d5ff; border-radius:10px; padding:12px; text-align:center;">
        <div style="font-size:9px; font-weight:800; text-transform:uppercase; color:#6b21a8;">Mots manquants</div>
        <div style="font-size:18px; font-weight:900; color:#7e22ce;">${data.breakdown.omission?.count || 0}</div>
        <div style="font-size:10px; color:#7e22ce;">-${data.breakdown.omission?.penaltyPoints || 0} pt</div>
      </div>
    </div>
    ${data.referenceText ? `
    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 16px; margin-bottom:12px;">
      <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase; margin-bottom:4px;">Texte officiel de référence :</div>
      <p style="font-size:11px; color:#334155; margin:0; line-height:1.6; font-style:italic;">${escapeHtml(data.referenceText)}</p>
    </div>` : ''}
    ${data.feedback ? `
    <div style="background:#eff6ff; border-left:4px solid #3b82f6; border-radius:0 8px 8px 0; padding:10px 14px;">
      <div style="font-size:10px; font-weight:700; color:#1d4ed8; text-transform:uppercase; margin-bottom:4px;">Bilan de l'évaluateur :</div>
      <p style="font-size:11px; color:#1e293b; margin:0; line-height:1.6;">${escapeHtml(data.feedback)}</p>
    </div>` : ''}
  </div>` : ''}

  <!-- SECTION SPÉCIFIQUE GRAMMAIRE -->
  ${isGrammaire && Array.isArray(data.items) && data.items.length > 0 ? `
  <div style="margin-bottom:28px;">
    <h2 style="font-size:16px; font-weight:700; color:#1e293b; margin-bottom:14px;">📊 Évaluation question par question</h2>
    <table style="width:100%; border-collapse:collapse; border:1px solid #e2e8f0; border-radius:8px;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="padding:8px 10px; text-align:left; font-size:11px; font-weight:700; color:#64748b; width:15%;">Question</th>
          <th style="padding:8px 10px; text-align:left; font-size:11px; font-weight:700; color:#64748b; width:30%;">Réponse élève</th>
          <th style="padding:8px 10px; text-align:left; font-size:11px; font-weight:700; color:#64748b; width:30%;">Corrigé attendu</th>
          <th style="padding:8px 10px; text-align:center; font-size:11px; font-weight:700; color:#64748b; width:15%;">Points</th>
        </tr>
      </thead>
      <tbody>
        ${data.items.map((item: any) => `
          <tr style="page-break-inside: avoid; border-bottom:1px solid #e2e8f0;">
            <td style="padding:8px 10px; font-size:11px; font-weight:700; color:#1e293b;">Q${escapeHtml(item.questionNumber)}</td>
            <td style="padding:8px 10px; font-size:11px; color:#334155;">${escapeHtml(item.studentAnswer || '(Vide)')}</td>
            <td style="padding:8px 10px; font-size:11px; color:#059669; font-weight:600;">${escapeHtml(item.correctAnswer || '')}</td>
            <td style="padding:8px 10px; font-size:12px; font-weight:800; text-align:center; color:#1e293b;">${formatScore(item.pointsAwarded)} / ${item.pointsMax}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ${data.summaryFeedback ? `
    <div style="background:#eff6ff; border-left:4px solid #3b82f6; border-radius:0 8px 8px 0; padding:10px 14px; margin-top:12px;">
      <p style="font-size:11px; color:#1e293b; margin:0; line-height:1.6;">${escapeHtml(data.summaryFeedback)}</p>
    </div>` : ''}
  </div>` : ''}

  <!-- CRITÈRES (POUR TRADUCTION, COMPOSITION ET DELF) -->
  ${!isDictee && !isGrammaire ? `
  <div style="margin-bottom:28px;">
    <h2 style="font-size:16px; font-weight:700; color:#1e293b; margin-bottom:14px;">📊 ${isTraduction ? "Critères d'évaluation de la Traduction" : isComposition ? `Critères d'évaluation — ${compositionLabel}` : `Performance — Grille DELF ${level}`}</h2>
    ${criteriaRows}
  </div>` : ''}

  <!-- BILAN FORMATEUR COMPOSITION -->
  ${isComposition && (data as any)?.generalFeedback ? `
  <div style="margin-bottom:28px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:12px; padding:16px 20px;">
    <h3 style="font-size:13px; font-weight:800; color:#1e40af; margin:0 0 8px 0; text-transform:uppercase; letter-spacing:1px;">💡 Bilan formateur & Appréciation générale</h3>
    <p style="font-size:11px; color:#1e293b; line-height:1.7; margin:0; white-space:pre-wrap;">${escapeHtml((data as any).generalFeedback)}</p>
  </div>` : ''}

  <!-- TABLEAU DES ERREURS -->
  ${errorsTable.length > 0 ? `
  <div>
    <h2 style="font-size:16px; font-weight:700; color:#1e293b; margin-bottom:14px;">🔍 Détails des corrections linguistiques</h2>
    <table style="width:100%; border-collapse:collapse; border:1px solid #e2e8f0; border-radius:8px;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="padding:10px 12px; text-align:left; font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:1px; border-bottom:2px solid #e2e8f0; width:25%;">Original</th>
          <th style="padding:10px 12px; text-align:left; font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:1px; border-bottom:2px solid #e2e8f0; width:25%;">Correction</th>
          <th style="padding:10px 12px; text-align:left; font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:1px; border-bottom:2px solid #e2e8f0; width:50%;">Explication</th>
        </tr>
      </thead>
      <tbody>${errorsRows}</tbody>
    </table>
  </div>` : ''}

  <!-- FOOTER -->
  <div style="margin-top:30px; padding-top:12px; border-top:1px solid #e2e8f0; text-align:center; font-size:9px; color:#94a3b8; page-break-inside: avoid;">
    Généré automatiquement par Le Prof et l'IA — ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
  </div>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigateur réutilisé
//
// Chaque bilan relançait auparavant un Chrome complet (~1 s de démarrage par
// PDF, soit une trentaine de secondes perdues sur un lot de 30 copies).
// L'instance est désormais lancée une seule fois puis réutilisée ; seul l'onglet
// est créé et fermé à chaque bilan. Elle est stockée sur `globalThis` afin de
// survivre au rechargement à chaud des modules en développement, et se ferme
// d'elle-même après une période d'inactivité pour libérer la mémoire.
// ─────────────────────────────────────────────────────────────────────────────

/** Durée d'inactivité au bout de laquelle le navigateur est fermé. */
const BROWSER_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

interface BrowserPool {
  browser: any | null;
  launching: Promise<any> | null;
  idleTimer: any | null;
}

const globalPool = globalThis as unknown as { __correcteurPdfPool?: BrowserPool };
const pool: BrowserPool = globalPool.__correcteurPdfPool ?? { browser: null, launching: null, idleTimer: null };
globalPool.__correcteurPdfPool = pool;

function buildLaunchOptions(withExecutablePath: boolean): any {
  const options: any = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none',
    ],
  };
  if (withExecutablePath) {
    const executablePath = findBrowserExecutable();
    if (executablePath) options.executablePath = executablePath;
  }
  return options;
}

function scheduleIdleShutdown() {
  if (pool.idleTimer) clearTimeout(pool.idleTimer);
  pool.idleTimer = setTimeout(() => {
    const browser = pool.browser;
    pool.browser = null;
    pool.idleTimer = null;
    if (browser) {
      browser.close().catch(() => {});
      console.log('[PDF Generator] Navigateur fermé après inactivité.');
    }
  }, BROWSER_IDLE_TIMEOUT_MS);
  // Ne pas maintenir le processus Node en vie uniquement pour ce minuteur.
  if (typeof pool.idleTimer?.unref === 'function') pool.idleTimer.unref();
}

/** Renvoie le navigateur partagé, en le lançant ou le relançant si besoin. */
async function getBrowser(): Promise<any> {
  if (pool.browser && pool.browser.connected !== false && (!pool.browser.isConnected || pool.browser.isConnected())) {
    return pool.browser;
  }
  // Un seul lancement à la fois, même si plusieurs bilans arrivent en parallèle.
  if (pool.launching) {
    return pool.launching;
  }

  pool.launching = (async () => {
    try {
      return await puppeteer.launch(buildLaunchOptions(true));
    } catch (launchErr) {
      console.warn('[PDF Generator] Échec avec executablePath, essai avec la configuration par défaut :', launchErr);
      return await puppeteer.launch(buildLaunchOptions(false));
    }
  })();

  try {
    pool.browser = await pool.launching;
    console.log('[PDF Generator] Navigateur lancé (réutilisé pour les bilans suivants).');
    return pool.browser;
  } finally {
    pool.launching = null;
  }
}

export async function generatePdfBuffer(data: EvaluationData, level: string = 'B2'): Promise<Buffer> {
  const html = buildHtml(data, level);

  let browser = await getBrowser();
  let page: any = null;

  try {
    try {
      page = await browser.newPage();
    } catch (pageErr) {
      // Le navigateur partagé a pu être fermé entre-temps (veille, arrêt manuel).
      console.warn('[PDF Generator] Navigateur indisponible, relance :', pageErr);
      pool.browser = null;
      browser = await getBrowser();
      page = await browser.newPage();
    }

    await page.setContent(html, { waitUntil: ['domcontentloaded', 'load'], timeout: 20000 });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', bottom: '20px', left: '25px', right: '25px' },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    // On ferme l'onglet, jamais le navigateur : c'est tout l'intérêt du partage.
    if (page) await page.close().catch(() => {});
    scheduleIdleShutdown();
  }
}

/** Ferme explicitement le navigateur partagé (arrêt de l'application). */
export async function closePdfBrowser(): Promise<void> {
  if (pool.idleTimer) { clearTimeout(pool.idleTimer); pool.idleTimer = null; }
  const browser = pool.browser;
  pool.browser = null;
  if (browser) await browser.close().catch(() => {});
}
