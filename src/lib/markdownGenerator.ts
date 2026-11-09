import { formatScore } from '@/lib/scoreUtils';
import { EvaluationData } from '@/components/EvaluationResultView';
import { getFriendlyModelName } from '@/lib/modelNames';
import { getCriteriaConfig } from '@/lib/promptUtils';
import { DEFAULT_TRANSLATION_CRITERIA } from '@/lib/traductionEngine';
import { getCompositionCriteria, getCompositionTypeLabel } from '@/lib/compositionEngine';

interface MarkdownExportOptions {
  level?: string;
  subject?: string;
  evalModel?: string;
  gradingMode?: 'detailed' | 'delf';
}

export function generatePEMarkdown(data: EvaluationData, options: MarkdownExportOptions = {}): string {
  const level = options.level || 'B2';
  const effectiveSubject = options.subject || data.subject || (data as any)._comparison?.firstEval?.subject || (data as any)._comparison?.secondEval?.subject || 'Non spécifié';
  const globalScore = Number(data.globalScore) || 0;

  // Résolution du modèle LLM
  let llmName = 'Non spécifié';
  if (data._comparison) {
    const p1 = getFriendlyModelName(data._comparison.firstProvider || options.evalModel || 'Examinateur 1');
    const p2 = getFriendlyModelName(data._comparison.secondProvider || 'Examinateur 2');
    if (data._comparison.thirdEval) {
      const p3 = getFriendlyModelName(data._comparison.thirdProvider || 'Arbitre (3e éval)');
      llmName = `${p1} + ${p2} (Arbitrage : ${p3})`;
    } else {
      llmName = `${p1} + ${p2} (Double évaluation)`;
    }
  } else {
    const raw = (data as any).model || (data as any).evalModel || options.evalModel || 'Modèle IA';
    llmName = getFriendlyModelName(raw);
  }

  const getScoreLabel = (score: number, lvl: string, maxScore: number = 5) => {
    const displayLvl = lvl;
    const ratio = maxScore > 0 ? score / maxScore : 0;
    if (ratio >= 0.9) return `${displayLvl}+ (Maîtrise complète)`;
    if (ratio >= 0.7) return `${displayLvl} (Très bon contrôle)`;
    if (ratio >= 0.5) return `${displayLvl} (Acquis)`;
    if (ratio >= 0.3) return `Sous ${displayLvl} (Transition)`;
    if (ratio >= 0.1) return `Sous ${displayLvl} (Insuffisant)`;
    return 'Non répondu';
  };

  const now = new Date();
  const dateFormatted = now.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const lines: string[] = [];

  const isComposition = data.examType === 'composition';
  const isTraduction = data.examType === 'traduction';
  const compositionLabel = isComposition ? getCompositionTypeLabel(data.compositionType || 'essai') : '';

  const titleHeader = isComposition
    ? `# Évaluation de la Composition — ${compositionLabel}`
    : isTraduction
    ? `# Évaluation de la Traduction`
    : `# Évaluation DELF ${level} — Production Écrite (PE)`;

  const maxScoreVal = Number(data.maxScore) || (isComposition ? 20 : isTraduction ? 10 : 25);
  const totalMaxStr = String(maxScoreVal);

  lines.push(titleHeader);
  lines.push('');
  lines.push(`- **Apprenant :** ${data.studentName || 'Non spécifié'}${data.className ? ` (${data.className})` : ''}`);
  if (data.studentEmail) {
    lines.push(`- **Email :** ${data.studentEmail}`);
  }
  lines.push(`- **Date de l'évaluation :** ${dateFormatted}`);
  lines.push(`- **Modèle LLM utilisé :** ${llmName}`);
  lines.push(`- **Score Global :** **${formatScore(globalScore)} / ${totalMaxStr}**`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // 1. Sujet
  lines.push('## 📌 Sujet / Consigne');
  lines.push('');
  lines.push(effectiveSubject);
  lines.push('');

  // Corpus support si présent
  if (isComposition && data.corpusText) {
    lines.push('### 📚 Texte support / Corpus documentaire');
    lines.push('');
    lines.push(data.corpusText.trim());
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // 2. Production écrite brute
  lines.push("## 📝 Production écrite de l'apprenant (texte brut)");
  lines.push('');
  lines.push(data.transcription ? data.transcription.trim() : '*(Aucun texte fourni)*');
  lines.push('');
  lines.push('---');
  lines.push('');

  // 3. Performance et critères
  const perfHeader = isComposition
    ? ((data as any).disableStandardGrid 
        ? `## 📊 Critères d'évaluation personnalisés (Barème libre enseignant)` 
        : `## 📊 Critères d'évaluation — ${compositionLabel}`)
    : isTraduction
    ? `## 📊 Critères d'évaluation de la Traduction`
    : `## 📊 Performance Grille Officielle DELF ${level}`;
  lines.push(perfHeader);
  lines.push('');

  const configList = isComposition
    ? ((data as any).disableStandardGrid && Array.isArray((data as any).customCriteriaEvaluated) && (data as any).customCriteriaEvaluated.length > 0
        ? (data as any).customCriteriaEvaluated
        : getCompositionCriteria(data.compositionType || 'essai', maxScoreVal))
    : isTraduction
    ? DEFAULT_TRANSLATION_CRITERIA
    : getCriteriaConfig(level);
  const criteriaScores = (data.criteriaScores || {}) as Record<string, any>;
  const justifications = (data.justifications || {}) as Record<string, any>;
  const advices = (data.advices || {}) as Record<string, any>;

  for (const crit of configList) {

    const score = Number(criteriaScores[crit.key]) || 0;
    const justification = String(justifications[crit.key] || '').trim();
    const advice = String(advices[crit.key] || '').trim();
    const scoreLabel = getScoreLabel(score, level, crit.maxScore);

    lines.push(`#### ${crit.label}`);
    lines.push(`- **Note :** **${formatScore(score)} / ${crit.maxScore.toString().replace('.', ',')}** (${scoreLabel})`);
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
    lines.push('| # | Forme produite | Correction suggérée | Règle / Explication |');
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

  if (data.generalFeedback) {
    lines.push('---');
    lines.push('');
    lines.push('## 💡 Bilan formateur & Appréciation générale');
    lines.push('');
    lines.push(data.generalFeedback.trim());
    lines.push('');
  }

  if (data._comparison) {
    lines.push('---');
    lines.push('');
    lines.push('## 🔬 Données de double évaluation');
    lines.push('');
    const firstScore = data._comparison.firstEval?.globalScore ?? 'N/A';
    const secondScore = data._comparison.secondEval?.globalScore ?? 'N/A';
    lines.push(`- **Examinateur 1 (${getFriendlyModelName(data._comparison.firstProvider)}) :** ${formatScore(firstScore)} / ${totalMaxStr}`);
    lines.push(`- **Examinateur 2 (${getFriendlyModelName(data._comparison.secondProvider)}) :** ${formatScore(secondScore)} / ${totalMaxStr}`);
    if (data._comparison.thirdEval) {
      const thirdScore = data._comparison.thirdEval?.globalScore ?? 'N/A';
      lines.push(`- **Examinateur 3 / Arbitre (${getFriendlyModelName(data._comparison.thirdProvider || 'Arbitre')}) :** ${formatScore(thirdScore)} / ${totalMaxStr}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Analyse un texte Markdown pour en extraire une ou plusieurs évaluations complètes.
 */
export function parseMultiplePEMarkdowns(mdContent: string): EvaluationData[] {
  if (!mdContent || !mdContent.trim()) return [];

  // 1. Si le markdown contient des blocs de code JSON explicites
  const jsonBlocks = Array.from(mdContent.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi));
  for (const match of jsonBlocks) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (Array.isArray(parsed)) {
        const valid = parsed.filter(p => p && (p.criteriaScores || p.justifications || p.globalScore !== undefined));
        if (valid.length > 0) return valid;
      } else if (parsed && (parsed.criteriaScores || parsed.justifications || parsed.globalScore !== undefined)) {
        return [parsed];
      }
    } catch {
      // Continuer si ce n'est pas un JSON valide
    }
  }

  // 2. Découper par sections principales d'évaluation
  const splitRegex = /(?=(?:^|\n)#+\s*(?:Évaluation|Bilan)\s+DELF)/i;
  const sections = mdContent.split(splitRegex).map(s => s.trim()).filter(Boolean);

  if (sections.length > 1) {
    const results: EvaluationData[] = [];
    for (const section of sections) {
      const single = parseSinglePEMarkdown(section);
      if (single) results.push(single);
    }
    if (results.length > 0) return results;
  }

  // Si une seule section globale
  const single = parseSinglePEMarkdown(mdContent);
  return single ? [single] : [];
}

/**
 * Parse une section Markdown unique d'évaluation DELF PE.
 */
export function parseSinglePEMarkdown(md: string): EvaluationData | null {
  if (!md || !md.trim()) return null;

  // 1. Vérifier si c'est du JSON direct
  try {
    const directJson = JSON.parse(md.trim());
    if (directJson && (directJson.criteriaScores || directJson.justifications || directJson.globalScore !== undefined)) {
      return directJson;
    }
  } catch {}

  const result: any = {
    studentName: "",
    studentEmail: "",
    className: "",
    subject: "",
    transcription: "",
    level: "B2",
    globalScore: 0,
    criteriaScores: {
      realisation: 0,
      coherence: 0,
      sociolinguistique: 0,
      lexique: 0,
      morphosyntaxe: 0
    },
    justifications: {},
    advices: {},
    errorsTable: []
  };

  // Extraction Niveau
  const levelMatch = md.match(/#+\s*(?:Évaluation|Bilan)\s+DELF\s+([A-C][1-2])/i)
    || md.match(/- \*\*Niveau\s*:\*\*\s*([A-C][1-2])/i);
  if (levelMatch) {
    result.level = levelMatch[1].toUpperCase();
  }

  // Extraction Apprenant / Classe
  const studentMatch = md.match(/- \*\*Apprenant\s*:\*\*\s*([^\n\r]+)/i)
    || md.match(/- \*\*Élève\s*:\*\*\s*([^\n\r]+)/i)
    || md.match(/- \*\*Nom\s*:\*\*\s*([^\n\r]+)/i);
  if (studentMatch) {
    let nameStr = studentMatch[1].trim();
    if (nameStr.toLowerCase() !== 'non spécifié' && nameStr.toLowerCase() !== 'inconnu') {
      const classInName = nameStr.match(/\((.*?)\)/);
      if (classInName) {
        result.className = classInName[1].trim();
        nameStr = nameStr.replace(/\(.*?\)/, '').trim();
      }
      result.studentName = nameStr;
    }
  }

  // Extraction Email
  const emailMatch = md.match(/- \*\*Email\s*:\*\*\s*([^\s\n\r]+@[^\s\n\r]+)/i);
  if (emailMatch) {
    result.studentEmail = emailMatch[1].trim();
  }

  // Extraction Modèle
  const modelMatch = md.match(/- \*\*Modèle LLM utilisé\s*:\*\*\s*([^\n\r]+)/i);
  if (modelMatch) {
    result.evalModel = modelMatch[1].trim();
  }

  // Extraction Score Global
  const scoreMatch = md.match(/- \*\*Score Global\s*:\*\*\s*\*\*?(\d+(?:[.,]\d+)?)\s*(?:\/\s*(?:25|4(?:[.,]0)?))?\*\*?/i)
    || md.match(/Score Global\s*:\s*(\d+(?:[.,]\d+)?)\s*\/\s*(?:25|4(?:[.,]0)?)/i);
  if (scoreMatch) {
    result.globalScore = parseFloat(scoreMatch[1].replace(',', '.'));
  }

  // Extraction Sujet / Consigne
  const subjectMatch = md.match(/##\s*📌?\s*(?:Sujet\s*\/\s*Consigne|Sujet|Consigne)\s*\n+([\s\S]*?)(?=\n+---|\n+##|$)/i);
  if (subjectMatch) {
    const subj = subjectMatch[1].trim();
    if (subj && subj.toLowerCase() !== 'non spécifié') {
      result.subject = subj;
    }
  }

  // Extraction Production écrite brute
  const transMatch = md.match(/##\s*📝?\s*(?:Production écrite[^\n]*|Texte de la copie|Transcription)\s*\n+([\s\S]*?)(?=\n+---|\n+##|$)/i);
  if (transMatch) {
    const tr = transMatch[1].trim();
    if (tr && !tr.startsWith('*(') && !tr.endsWith(')*')) {
      result.transcription = tr;
    }
  }

  // Extraction Critères
  const criteriaMap: Record<string, string> = {
    realisation: 'realisation',
    consigne: 'realisation',
    coherence: 'coherence',
    cohesion: 'coherence',
    sociolinguistique: 'sociolinguistique',
    lexique: 'lexique',
    vocabulaire: 'lexique',
    morphosyntaxe: 'morphosyntaxe',
    grammaire: 'morphosyntaxe'
  };

  // Découper les sous-sections ### ou ####
  const subSections = md.split(/\n#{3,4}\s+/);
  for (let i = 1; i < subSections.length; i++) {
    const chunk = subSections[i];
    const headerLine = chunk.split('\n')[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    let matchedKey: string | null = null;
    for (const [pattern, key] of Object.entries(criteriaMap)) {
      if (headerLine.includes(pattern)) {
        matchedKey = key;
        break;
      }
    }

    if (matchedKey) {
      // Note
      const noteMatch = chunk.match(/- \*\*Note\s*:\*\*\s*\*\*?(\d+(?:[.,]\d+)?)\s*(?:\/\s*(?:5|1(?:[.,]0)?|0[.,][58]|1[.,]2))?\*\*?/i);
      if (noteMatch) {
        result.criteriaScores[matchedKey] = parseFloat(noteMatch[1].replace(',', '.'));
      }

      // Justification
      const justMatch = chunk.match(/- \*\*Descripteur[^\n]*:\*\*\s*\n+((?:\s*>[^\n]*\n*)+)/i)
        || chunk.match(/- \*\*Justification[^\n]*:\*\*\s*\n+((?:\s*>[^\n]*\n*)+)/i);
      if (justMatch) {
        result.justifications[matchedKey] = justMatch[1].replace(/^\s*>\s?/gm, '').trim();
      }

      // Recommandations
      const advMatch = chunk.match(/- \*\*Axes d'amélioration[^\n]*:\*\*\s*\n+((?:\s*>[^\n]*\n*)+)/i)
        || chunk.match(/- \*\*Recommandations?[^\n]*:\*\*\s*\n+((?:\s*>[^\n]*\n*)+)/i);
      if (advMatch) {
        result.advices[matchedKey] = advMatch[1].replace(/^\s*>\s?/gm, '').trim();
      }
    }
  }

  // Si le score global est 0 mais qu'on a des notes par critères, on le calcule
  const sumScores = Object.values(result.criteriaScores as Record<string, number>).reduce((a, b) => a + (Number(b) || 0), 0);
  if (!result.globalScore && sumScores > 0) {
    result.globalScore = sumScores;
  }

  // Extraction Tableau des Erreurs
  const tableSectionMatch = md.match(/##\s*🔍?\s*(?:Détails des corrections|Corrections linguistiques|Tableau des erreurs)\s*\n+([\s\S]*?)(?=\n+---|\n+##|$)/i);
  if (tableSectionMatch) {
    const tableText = tableSectionMatch[1];
    const rows = tableText.split('\n').filter(line => line.trim().startsWith('|') && !line.includes('---'));
    // Ignorer l'en-tête s'il contient 'Forme produite' ou '#'
    for (const row of rows) {
      if (row.toLowerCase().includes('forme produite') || row.toLowerCase().includes('correction suggérée')) continue;
      const cols = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length >= 3) {
        // cols[0] = index, cols[1] = original, cols[2] = correction, cols[3] = rule
        const orig = (cols[1] || '').replace(/~~/g, '').trim();
        const corr = (cols[2] || '').replace(/\*\*/g, '').trim();
        const rule = (cols[3] || '').replace(/\*/g, '').trim();
        if (orig || corr) {
          result.errorsTable.push({ original: orig, correction: corr, rule: rule });
        }
      }
    }
  }

  // Extraction Arbitrage / Notes
  const arbiterMatch = md.match(/##\s*⚖️?\s*(?:Synthèse et arbitrage[^\n]*)\s*\n+([\s\S]*?)(?=\n+---|\n+##|$)/i);
  if (arbiterMatch) {
    result._arbiterNotes = arbiterMatch[1].trim();
  }

  return result;
}

export function parsePEMarkdown(mdContent: string): EvaluationData | null {
  const all = parseMultiplePEMarkdowns(mdContent);
  return all.length > 0 ? all[0] : null;
}

