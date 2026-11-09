import { EvaluationData } from './types';
import { formatScore } from '../scoreUtils';
import { DEFAULT_INTERPRETATION_CRITERIA } from './interpretationEngine';
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
  const isB2 = level === 'B2';
  if (isB2) {
    if (score >= 4.5) return 'B2+ (Maîtrise complète)';
    if (score >= 2.5) return 'B2 (Acquis / Au niveau)';
    if (score >= 0.5) return 'Sous B2 (Transition/Insuffisant)';
  } else {
    if (score >= 3.5) return 'B1+ (Très bon contrôle)';
    if (score >= 2.25) return 'B1 (Acquis / Au niveau)';
    if (score >= 0.5) return 'Sous B1 (Transition/Insuffisant)';
  }
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
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  const pattern = words.map(w => escapeRegex(w)).join('[\\s\\r\\n.,;:!?\'"«»\\-–—]+');
  return pattern;
}

function highlightTranscriptionInHtml(transcription: string, errorsTable: any[]): string {
  if (!transcription) return '';
  if (!errorsTable || errorsTable.length === 0) return escapeHtml(transcription);

  const sortedErrors = [...errorsTable]
    .map(err => {
      const orig = typeof err === 'string' ? err : (err?.original || '');
      return { original: orig, length: orig.length };
    })
    .filter(item => item.original.trim().length > 0)
    .sort((a, b) => b.length - a.length);

  let result = transcription;
  const placeholders: [string, string][] = [];
  let pIdx = 0;

  for (const item of sortedErrors) {
    const patternStr = buildFlexibleRegexPattern(item.original);
    if (!patternStr) continue;

    try {
      const regex = new RegExp(`(${patternStr})`, 'gi');
      if (regex.test(result)) {
        const ph = `___ERR_PH_${pIdx++}___`;
        const matched = result.match(regex);
        if (matched && matched[0]) {
          const actualText = matched[0];
          placeholders.push([ph, `<span style="background-color: #fef2f2; border-bottom: 2px solid #dc2626; color: #991b1b; padding: 0 2px; border-radius: 2px;">${escapeHtml(actualText)}</span>`]);
          result = result.replace(regex, ph);
        }
      }
    } catch (e) {
      console.warn("[PDF PO] Erreur regex highlight:", e);
    }
  }

  result = escapeHtml(result);
  for (const [placeholder, html] of placeholders) {
    result = result.replace(new RegExp(escapeHtml(placeholder), 'g'), html);
  }

  return result;
}

const b1CriteriaLabels: Record<string, string> = {
  entretien: "1. Entretien dirigé",
  interaction: "2. Exercice en interaction",
  monologue: "3. Expression d'un point de vue",
  lexique: "Lexique (étendue et maîtrise)",
  morphosyntaxe: "Morphosyntaxe",
  phonologie: "Maîtrise du système phonologique",
};

const b2CriteriaLabels: Record<string, string> = {
  monologue: "1. Monologue suivi (Défense d'un point de vue)",
  interaction: "2. Exercice en interaction (Débat)",
  lexique: "Lexique (étendue et maîtrise)",
  morphosyntaxe: "Morphosyntaxe",
  phonologie: "Maîtrise du système phonologique",
};

export function buildHtml(data: EvaluationData, level: string): string {
  const isInterpretation = data?.examType === 'interpretation';
  const isB1 = level === 'B1';
  const maxGlobal = Number(data?.maxScore) || (isInterpretation ? 10 : 25);
  const globalScore = Number(data?.globalScore) || 0;
  const globalColor = globalScore >= (maxGlobal / 2) ? '#059669' : '#d97706';

  const criteriaScores = data?.criteriaScores || {};
  const justifications = data?.justifications || {};
  const advices = data?.advices || {};
  const errorsTable = Array.isArray(data?.errorsTable) ? data.errorsTable : [];

  let criteriaRows = '';
  if (isInterpretation) {
    criteriaRows = DEFAULT_INTERPRETATION_CRITERIA.map(c => {
      const score = Number((criteriaScores as any)[c.key]) || 0;
      const justification = String((justifications as any)[c.key] || '');
      const advice = String((advices as any)[c.key] || '');
      const maxScore = c.maxScore;
      const color = getScoreColor(score, maxScore);

      return `
    <div style="border:1px solid #e2e8f0; border-radius:12px; padding:16px 20px; margin-bottom:12px; background:#fff; page-break-inside: avoid;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div>
          <strong style="font-size:14px; color:#1e293b;">${c.label}</strong>
          ${c.description ? `<div style="font-size:11px; color:#64748b; margin-top:2px;">${escapeHtml(c.description)}</div>` : ''}
        </div>
        <div style="background:${color}15; border:2px solid ${color}40; color:${color}; font-weight:900; font-size:18px; padding:6px 16px; border-radius:10px; min-width:60px; text-align:center;">
          ${formatScore(score)} / ${maxScore}
        </div>
      </div>
      <div style="background:#f0f9ff; border-left:4px solid #3b82f6; padding:10px 14px; border-radius:0 8px 8px 0; margin-bottom:8px;">
        <div style="font-size:10px; font-weight:700; color:#3b82f6; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">Appréciation</div>
        <p style="font-size:12px; color:#334155; font-style:italic; margin:0; line-height:1.6;">"${escapeHtml(justification)}"</p>
      </div>
      ${advice ? `
      <div style="background:#f0fdf4; border-left:4px solid #10b981; padding:10px 14px; border-radius:0 8px 8px 0;">
        <div style="font-size:10px; font-weight:700; color:#10b981; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">Recommandation pour la prestation</div>
        <p style="font-size:12px; color:#334155; margin:0; line-height:1.6;">${escapeHtml(advice)}</p>
      </div>` : ''}
    </div>`;
    }).join('');
  } else {
    const criteriaLabels = isB1 ? b1CriteriaLabels : b2CriteriaLabels;
    criteriaRows = Object.entries(criteriaLabels).map(([key, label]) => {
      const score = Number((criteriaScores as any)[key]) || 0;
      const justification = String((justifications as any)[key] || '');
      const advice = String((advices as any)[key] || '');
      const maxScore = isB1 && key === 'lexique' ? 5 : (isB1 ? 4 : 5);
      const color = getScoreColor(score, maxScore);

      return `
    <div style="border:1px solid #e2e8f0; border-radius:12px; padding:16px 20px; margin-bottom:12px; background:#fff; page-break-inside: avoid;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div>
          <strong style="font-size:14px; color:#1e293b;">${label}</strong>
          <div style="font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:1px; margin-top:2px;">${getScoreLabel(score, level, maxScore)}</div>
        </div>
        <div style="background:${color}15; border:2px solid ${color}40; color:${color}; font-weight:900; font-size:18px; padding:6px 16px; border-radius:10px; min-width:60px; text-align:center;">
          ${formatScore(score)} / ${maxScore}
        </div>
      </div>
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
    }).join('');
  }

  const errorsRows = errorsTable.map((err: any) => `
    <tr style="page-break-inside: avoid;">
      <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#dc2626; text-decoration:line-through; font-size:12px;">${escapeHtml(err?.original || '')}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#059669; font-weight:600; font-size:12px;">${escapeHtml(err?.correction || '')}</td>
      <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#475569; font-size:11px;">${escapeHtml(err?.rule || '')}</td>
    </tr>
  `).join('');

  const highlightedTranscription = highlightTranscriptionInHtml(data?.transcription || '', errorsTable);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <style>
    @page { margin: 20px 25px; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      margin: 0;
      padding: 0;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <!-- HEADER -->
  <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px; padding-bottom:16px; border-bottom:2px solid #e2e8f0;">
    <div>
      <h1 style="font-size:22px; font-weight:800; color:#0f172a; margin:0 0 4px 0;">
        ${isInterpretation ? "Bilan d'Évaluation — Interprétation Orale" : "Bilan d'Évaluation — Production Orale"}
      </h1>
      <div style="font-size:13px; color:#64748b; font-weight:500;">
        ${isInterpretation 
          ? `Interprétation ${data?.mode === 'simultaneous' ? 'Simultanée' : 'Consécutive'} &bull; Évaluation automatisée et supervisée` 
          : `DELF ${level} &bull; Évaluation automatisée et supervisée`}
      </div>
      <div style="font-size:12px; color:#94a3b8; margin-top:6px;">
        Candidat : <strong style="color:#334155;">${escapeHtml(data?.studentName || 'Non spécifié')}</strong>
        ${data?.studentEmail ? ` &bull; ${escapeHtml(data.studentEmail)}` : ''}
        ${data?.className ? ` &bull; Classe : <strong style="color:#334155;">${escapeHtml(data.className)}</strong>` : ''}
      </div>
    </div>
    <div style="text-align:right;">
      <div style="background:${globalColor}; color:#fff; padding:10px 18px; border-radius:12px; text-align:center; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
        <div style="font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; opacity:0.9;">Note Globale</div>
        <div style="font-size:26px; font-weight:900; line-height:1.1; margin-top:2px;">
          ${formatScore(globalScore)}<span style="font-size:16px; opacity:0.8;">/${maxGlobal}</span>
        </div>
      </div>
      <div style="font-size:10px; color:#94a3b8; margin-top:6px;">
        ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
      </div>
    </div>
  </div>

  <!-- DISCOURS SOURCE (POUR INTERPRÉTATION) -->
  ${isInterpretation && data?.sourceSpeech ? `
  <div style="background:#eff6ff; border:1px solid #bfdbfe; border-left:4px solid #3b82f6; border-radius:4px 12px 12px 4px; padding:14px 18px; margin-bottom:24px;">
    <div style="font-size:11px; font-weight:700; color:#1d4ed8; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">🎤 Discours Source de référence (${escapeHtml(data?.sourceLanguage || 'Français')} ➔ ${escapeHtml(data?.targetLanguage || 'Français')})</div>
    <div style="font-size:12px; color:#1e293b; line-height:1.6; white-space:pre-wrap;">${escapeHtml(data.sourceSpeech)}</div>
  </div>` : ''}

  <!-- SUJET -->
  ${!isInterpretation && data?.subject ? `
  <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px 18px; margin-bottom:24px;">
    <div style="font-size:11px; font-weight:700; color:#475569; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">Sujet / Consigne</div>
    <div style="font-size:13px; color:#334155; line-height:1.6;">${escapeHtml(data.subject)}</div>
  </div>` : ''}

  <!-- TRANSCRIPTION -->
  <div style="margin-bottom:28px;">
    <h2 style="font-size:16px; font-weight:700; color:#1e293b; margin-bottom:10px;">
      ${isInterpretation ? "🎙️ Retranscription de l'interprétation orale restituée" : "🎙️ Transcription de la production orale"}
    </h2>
    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px 20px; font-size:12px; color:#334155; line-height:1.8; white-space:pre-wrap;">${highlightedTranscription}</div>
    ${errorsTable.length > 0 ? '<p style="font-size:9px; color:#94a3b8; margin-top:4px; font-style:italic;">Les passages <span style="background:#fef2f2; border-bottom:2px solid #dc2626; padding:0 2px;">soulignés en rouge</span> indiquent les anomalies signalées.</p>' : ''}
  </div>

  <!-- TRANSCRIPTION CORRIGÉE -->
  ${data?.transcriptionCorrigee ? `
  <div style="margin-bottom:28px; page-break-inside: avoid;">
    <h2 style="font-size:16px; font-weight:700; color:#1e293b; margin-bottom:10px;">✨ Transcription corrigée (reconstitution)</h2>
    <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-left:4px solid #10b981; border-radius:4px 12px 12px 4px; padding:16px 20px; font-size:12px; color:#14532d; line-height:1.8; white-space:pre-wrap;">${escapeHtml(data.transcriptionCorrigee)}</div>
  </div>` : ''}

  <!-- CRITÈRES -->
  <div style="margin-bottom:28px;">
    <h2 style="font-size:16px; font-weight:700; color:#1e293b; margin-bottom:14px;">
      ${isInterpretation ? "📊 Performance — Grille d'évaluation d'interprétation" : `📊 Performance — Grille Officielle DELF ${level}`}
    </h2>
    ${criteriaRows}
  </div>

  <!-- TABLEAU DES ERREURS -->
  ${errorsTable.length > 0 ? `
  <div>
    <h2 style="font-size:16px; font-weight:700; color:#1e293b; margin-bottom:14px;">
      ${isInterpretation ? "🔍 Détails des écarts et recommandations" : "🔍 Détails des corrections linguistiques"}
    </h2>
    <table style="width:100%; border-collapse:collapse; border:1px solid #e2e8f0; border-radius:8px;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="padding:10px 12px; text-align:left; font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:1px; border-bottom:2px solid #e2e8f0; width:28%;">
            ${isInterpretation ? 'Segment prononcé' : 'Forme produite'}
          </th>
          <th style="padding:10px 12px; text-align:left; font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:1px; border-bottom:2px solid #e2e8f0; width:28%;">
            ${isInterpretation ? 'Formulation recommandée' : 'Correction'}
          </th>
          <th style="padding:10px 12px; text-align:left; font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:1px; border-bottom:2px solid #e2e8f0; width:44%;">
            ${isInterpretation ? "Nature de l'écart / Explication" : "Explication de la règle"}
          </th>
        </tr>
      </thead>
      <tbody>${errorsRows}</tbody>
    </table>
  </div>` : ''}

  <!-- FOOTER -->
  <div style="margin-top:30px; padding-top:12px; border-top:1px solid #e2e8f0; text-align:center; font-size:9px; color:#94a3b8; page-break-inside: avoid;">
    Généré automatiquement par Évaluation DELF — ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
  </div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// GESTION DU NAVIGATEUR PUPPETEER PARTAGÉ (SINGLETON)
// ═══════════════════════════════════════════════════════════════════════════

const BROWSER_IDLE_TIMEOUT_MS = 60_000;

interface PdfBrowserPool {
  browser: any;
  launching: Promise<any> | null;
  idleTimer: NodeJS.Timeout | null;
}

const globalPool = globalThis as unknown as { __correcteurPdfPool?: PdfBrowserPool };
const pool: PdfBrowserPool = globalPool.__correcteurPdfPool || {
  browser: null,
  launching: null,
  idleTimer: null,
};
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
      console.log('[PDF PO] Navigateur fermé après inactivité.');
    }
  }, BROWSER_IDLE_TIMEOUT_MS);
  if (typeof pool.idleTimer?.unref === 'function') pool.idleTimer.unref();
}

async function getBrowser(): Promise<any> {
  if (pool.browser && pool.browser.connected !== false && (!pool.browser.isConnected || pool.browser.isConnected())) {
    return pool.browser;
  }
  if (pool.launching) {
    return pool.launching;
  }

  pool.launching = (async () => {
    try {
      return await puppeteer.launch(buildLaunchOptions(true));
    } catch (launchErr) {
      console.warn('[PDF PO] Échec avec executablePath, essai par défaut :', launchErr);
      return await puppeteer.launch(buildLaunchOptions(false));
    }
  })();

  try {
    pool.browser = await pool.launching;
    console.log('[PDF PO] Navigateur lancé (réutilisé pour les bilans suivants).');
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
      console.warn('[PDF PO] Navigateur indisponible, relance :', pageErr);
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
    if (page) await page.close().catch(() => {});
    scheduleIdleShutdown();
  }
}

export async function closePdfBrowser(): Promise<void> {
  if (pool.idleTimer) { clearTimeout(pool.idleTimer); pool.idleTimer = null; }
  const browser = pool.browser;
  pool.browser = null;
  if (browser) await browser.close().catch(() => {});
}
