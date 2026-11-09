/**
 * Dossier d'échange (applications d'IA de bureau) pour les épreuves hors DELF.
 *
 * CONSIGNES.md contient UNE SEULE FOIS les consignes de correction et les documents
 * de référence (texte de la dictée, texte source, corrigé, corpus, discours source),
 * puis la liste des copies ; chaque fichier de « sources » ne contient que le texte
 * de l'élève. Le format de réponse est celui de l'épreuve (registre des épreuves).
 */
import fs from 'fs';
import path from 'path';
import { sanitizeFilename } from '../pathSafety';
import { obtenirEpreuve, type ConfigEpreuve, type SectionEpreuve } from './registre';

export interface ItemEchange {
  file: string;
  filePath?: string;
  subject?: string;
  transcription?: string;
}

/** Rédige CONSIGNES.md (et les fichiers sources) pour l'évaluation d'une épreuve hors DELF. */
export function preparerConsignesEvalEpreuve(
  section: SectionEpreuve,
  examType: string,
  config: ConfigEpreuve,
  items: ItemEchange[],
  sourcesDir: string,
  livrablesDir: string,
): string {
  const e = obtenirEpreuve(section, examType);
  if (!e || e.id === 'delf') throw new Error(`Épreuve inconnue : ${examType}`);
  const ctx = { config };
  const manque = e.verifierConfig(ctx);
  if (manque) throw new Error(manque);

  const lignes = items.map((it, idx) => {
    const baseName = sanitizeFilename(it.file.replace(/\.[^.]+$/, ''));
    const tr = (it.transcription || '').trim();
    if (!tr) {
      return `${idx + 1}. Copie : \`${it.file}\` -> transcription absente : lis le fichier d'origine \`${it.filePath || it.file}\`, transcris-le fidèlement SANS CORRIGER AUCUNE FAUTE, ajoute cette transcription dans le champ \`transcription\` du livrable, puis évalue-la.`;
    }
    const sourcePath = path.join(sourcesDir, `${baseName}.md`);
    const contenu = `# Copie : ${it.file}\n\n${e.blocCopie(tr)}\n`;
    try { fs.writeFileSync(sourcePath, contenu, 'utf-8'); } catch { /* ignore */ }
    return `${idx + 1}. Copie : \`${it.file}\` -> Fichier source : \`${sourcePath}\``;
  });

  return `# 🧠 Instructions d'évaluation externe — ${e.libelle}
Total de copies à évaluer : ${items.length}

Tu es l'EXAMINATEUR. Tu dois évaluer chacune des copies listées ci-dessous en appliquant les consignes de correction et les documents de référence, communs à toutes les copies.
${e.avertissement ? `\n⚠️ ${e.avertissement}\n` : ''}
## 📌 Consignes de correction
${e.consignesCorrection(ctx)}

## 📚 Documents de référence (communs à toutes les copies)
${e.documentsReference(ctx) || '(aucun)'}

## 📂 Copies à évaluer
Chaque fichier source ne contient que le texte de l'élève, déposé dans :
\`${sourcesDir}\`

${lignes.join('\n')}

## 📤 Format des livrables attendus
Pour chaque copie ci-dessus, dépose ton évaluation dans :
\`${livrablesDir}\`

Nom du fichier attendu : \`<nom_copie>.eval.json\`

Contenu : l'objet JSON décrit dans le « FORMAT DE SORTIE JSON STRICT ATTENDU » des consignes de correction, avec en plus le champ \`"file": "<nom_du_fichier_d_origine>"\`.
Champs attendus : ${e.formatEvaluation(ctx)}

*(Alternative : un fichier unique \`${path.join(livrablesDir, 'resultats_eval.json')}\` contenant un tableau \`[{ "fileId": "<nom_du_fichier_d_origine>", "evaluation": { ... } }]\`.)*
`;
}

/** Finalise le livrable d'une copie (même calcul de note que la correction interne). */
export function finaliserLivrableEpreuve(
  section: SectionEpreuve,
  examType: string,
  config: ConfigEpreuve,
  item: ItemEchange,
  brut: any,
): any {
  const e = obtenirEpreuve(section, examType);
  if (!e || e.id === 'delf') throw new Error(`Épreuve inconnue : ${examType}`);
  const transcription = (item.transcription || (typeof brut?.transcription === 'string' ? brut.transcription : '') || '').trim();
  return e.finaliser(brut, { fileId: item.file, subject: item.subject || '', transcription }, { config });
}
