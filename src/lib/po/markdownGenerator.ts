import { EvaluationData } from './types';
import { getFriendlyModelName } from '../modelNames';
import { formatScore } from '../scoreUtils';

interface MarkdownExportOptions {
  level?: string;
  subject?: string;
  evalModel?: string;
  notationType?: 'detailed' | 'delf';
}

const b1CriteriaLabels: Record<string, { label: string; maxScore: number }> = {
  entretien: { label: "Réalisation : Entretien dirigé", maxScore: 4 },
  interaction: { label: "Réalisation : Exercice en interaction", maxScore: 4 },
  monologue: { label: "Réalisation : Expression d'un point de vue", maxScore: 4 },
  lexique: { label: "Lexique / Vocabulaire", maxScore: 5 },
  morphosyntaxe: { label: "Morphosyntaxe / Grammaire", maxScore: 4 },
  phonologie: { label: "Maîtrise du système phonologique", maxScore: 4 },
};

const b2CriteriaLabels: Record<string, { label: string; maxScore: number }> = {
  monologue: { label: "Réalisation : Monologue suivi (Défense de point de vue)", maxScore: 5 },
  interaction: { label: "Réalisation : Exercice en interaction (Débat)", maxScore: 5 },
  lexique: { label: "Lexique / Vocabulaire", maxScore: 5 },
  morphosyntaxe: { label: "Morphosyntaxe / Grammaire", maxScore: 5 },
  phonologie: { label: "Maîtrise du système phonologique", maxScore: 5 },
};

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
  return 'Non répondu ou production insuffisante';
}

export function generatePOMarkdown(data: EvaluationData, options: MarkdownExportOptions = {}): string {
  const level = options.level || 'B2';
  const isB1 = level === 'B1';
  const maxGlobal = 25;
  const criteriaConfig = isB1 ? b1CriteriaLabels : b2CriteriaLabels;
  const globalScore = Number(data.globalScore) || 0;
  const effectiveSubject = options.subject || data.subject || 'Sujet non spécifié';
  const llmName = options.evalModel ? getFriendlyModelName(options.evalModel) : (data.modelUsed ? getFriendlyModelName(data.modelUsed) : 'Non spécifié');

  const now = new Date();
  const dateFormatted = now.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const lines: string[] = [];

  lines.push(`# Évaluation DELF ${level} — Production Orale (PO)`);
  lines.push('');
  lines.push(`- **Apprenant :** ${data.studentName || 'Non spécifié'}${data.className ? ` (${data.className})` : ''}`);
  if (data.studentEmail) {
    lines.push(`- **Email :** ${data.studentEmail}`);
  }
  lines.push(`- **Date de l'évaluation :** ${dateFormatted}`);
  lines.push(`- **Modèle LLM utilisé :** ${llmName}`);
  lines.push(`- **Score Global :** **${formatScore(globalScore)} / ${maxGlobal}**`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // 1. Sujet
  lines.push('## 📌 Sujet / Thème');
  lines.push('');
  lines.push(effectiveSubject);
  lines.push('');
  lines.push('---');
  lines.push('');

  // 2. Transcription brute (sans soulignement pour analyse)
  lines.push("## 🎙️ Transcription de la production orale (texte brut)");
  lines.push('');
  lines.push(data.transcription ? data.transcription.trim() : '*(Aucune transcription fournie)*');
  lines.push('');

  if (data.transcriptionCorrigee) {
    lines.push('---');
    lines.push('');
    lines.push('## ✨ Transcription corrigée (reconstitution)');
    lines.push('');
    lines.push(data.transcriptionCorrigee.trim());
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // 3. Performance et critères
  lines.push(`## 📊 Performance Grille Officielle DELF ${level}`);
  lines.push('');

  const criteriaScores = (data.criteriaScores || {}) as Record<string, any>;
  const justifications = (data.justifications || {}) as Record<string, any>;
  const advices = (data.advices || {}) as Record<string, any>;

  for (const [key, { label, maxScore }] of Object.entries(criteriaConfig)) {
    const score = Number(criteriaScores[key]) || 0;
    const justification = String(justifications[key] || '').trim();
    const advice = String(advices[key] || '').trim();
    const scoreLabel = getScoreLabel(score, level, maxScore);

    lines.push(`### ${label}`);
    lines.push(`- **Note :** **${formatScore(score)} / ${maxScore}** (${scoreLabel})`);
    if (justification) {
      lines.push(`- **Descripteur de performance / Justification :**`);
      lines.push(`  > ${justification.replace(/\n/g, '\n  > ')}`);
    }
    if (advice) {
      lines.push(`- **Axes d'amélioration / Recommandations :**`);
      lines.push(`  > ${advice.replace(/\n/g, '\n  > ')}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // 4. Détails des corrections linguistiques
  lines.push('## 🔍 Détails des corrections linguistiques');
  lines.push('');

  const errorsTable = Array.isArray(data.errorsTable) ? data.errorsTable : [];
  if (errorsTable.length > 0) {
    lines.push('| # | Forme produite | Correction suggérée | Explication de la règle |');
    lines.push('|---|:---|:---|:---|');
    errorsTable.forEach((err, idx) => {
      const orig = (err.original || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
      const corr = (err.correction || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
      const rule = (err.rule || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
      lines.push(`| ${idx + 1} | ~~${orig}~~ | **${corr}** | *${rule}* |`);
    });
  } else {
    lines.push('*Aucune erreur linguistique relevée.*');
  }
  lines.push('');

  // 5. Section d'analyse / Supervision si disponible
  if ((data as any)._arbiterNotes) {
    lines.push('---');
    lines.push('');
    lines.push('## ⚖️ Synthèse et arbitrage (3e évaluation)');
    lines.push('');
    lines.push((data as any)._arbiterNotes);
    lines.push('');
  }

  if (data._comparison) {
    lines.push('---');
    lines.push('');
    lines.push('## 🔬 Données de double évaluation');
    lines.push('');
    const firstScore = data._comparison.firstEval?.globalScore ?? 'N/A';
    const secondScore = data._comparison.secondEval?.globalScore ?? 'N/A';
    lines.push(`- **Examinateur 1 (${getFriendlyModelName(data._comparison.firstProvider)}) :** ${formatScore(firstScore)} / ${maxGlobal}`);
    lines.push(`- **Examinateur 2 (${getFriendlyModelName(data._comparison.secondProvider)}) :** ${formatScore(secondScore)} / ${maxGlobal}`);
    if (data._comparison.thirdEval) {
      const thirdScore = data._comparison.thirdEval?.globalScore ?? 'N/A';
      lines.push(`- **Examinateur 3 / Arbitre (${getFriendlyModelName(data._comparison.thirdProvider || 'Arbitre')}) :** ${formatScore(thirdScore)} / ${maxGlobal}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
