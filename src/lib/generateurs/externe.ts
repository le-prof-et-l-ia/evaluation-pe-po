/**
 * Préparation des sujets par une IA externe (Claude, ChatGPT, Gemini… dans le cadre
 * d'un abonnement), sur le modèle de l'évaluation externe : l'application rédige les
 * consignes, l'enseignant les donne lui-même à l'IA de son choix, puis recolle la
 * réponse JSON. Rien n'est envoyé automatiquement.
 *
 * Les consignes reprennent mot pour mot celles données à Gemini
 * (buildDidacticDirectives, buildCeDirectives), et la réponse est normalisée par les
 * mêmes fonctions (normaliserArticles, normaliserExamenCe).
 */
import {
  MAX_SOURCE_CHARS,
  EXEMPLE_JSON_ARTICLES,
  EXEMPLE_JSON_CE,
  buildDidacticDirectives,
  buildCeDirectives,
  normaliserArticles,
  normaliserExamenCe,
  parametresCe,
  documentOriginal,
  texteSupportCe,
  type ExtractedArticle,
  type QuestionType,
  type SubjectGenerationResult,
} from '@/lib/subjectGeneratorService';
import { escapeControlCharactersInStrings } from '@/lib/externalSupervision';

/** Libellé affiché pour un sujet préparé par une IA externe. */
export const MODELE_IA_EXTERNE = 'IA externe';

export interface ParamsGenerationExterne {
  /** 'pe' : production écrite (et compréhension écrite) ; 'po' : production orale. */
  section: 'pe' | 'po';
  theme: string;
  level: 'B1' | 'B2' | 'C1';
  targetWordCount: number;
  minWordCount?: number;
  maxWordCount?: number;
  articleCount: number;
  source: ExtractedArticle;
  /** Épreuve de compréhension écrite à créer sur le texte (générateur PE uniquement). */
  ce?: {
    articleMode: 'adapted' | 'original';
    questionCount: number;
    totalPoints: number;
    questionTypes: QuestionType[];
  };
}

/** Nombre d'articles réellement demandé (dossier de 1 à 3 documents en C1 uniquement). */
function nombreArticles(p: ParamsGenerationExterne): number {
  return p.level === 'C1' ? Math.min(Math.max(p.articleCount || 1, 1), 3) : 1;
}

/** Libellé de la tâche, pour le titre des consignes et le nom du fichier. */
export function libelleGenerationExterne(p: ParamsGenerationExterne): string {
  if (p.ce) return `Épreuve de compréhension écrite ${p.level}`;
  return p.section === 'po' ? `Sujet de production orale ${p.level}` : `Sujet de production écrite ${p.level}`;
}

/** Rédige les consignes complètes (Markdown) à donner à l'IA externe. */
export function construireConsignesGeneration(p: ParamsGenerationExterne): string {
  const original = p.ce?.articleMode === 'original';
  const nb = nombreArticles(p);
  const s = p.source;
  const texteSource = s.cleanText.slice(0, MAX_SOURCE_CHARS);

  const sections: string[] = [];

  sections.push(`# 🧠 Consignes de préparation externe — ${libelleGenerationExterne(p)}
Thème : ${p.theme}

Tu es concepteur d'épreuves de certification en Français Langue Étrangère (type DELF/DALF, France Éducation international).
Réalise ${original ? "la tâche décrite" : "les étapes décrites"} ci-dessous à partir de l'article source fourni, puis réponds UNIQUEMENT par l'objet JSON décrit à la fin : aucun texte avant ni après.
N'invente aucun fait qui ne figure pas dans l'article source.`);

  sections.push(`## 📰 Article source
- Média : ${s.mediaName}
- Date : ${s.publishedDate}
- Titre : ${s.title}${s.originalUrl ? `\n- Adresse : ${s.originalUrl}` : ''}

"""
${texteSource}
"""`);

  if (!original) {
    sections.push(`## ✍️ ${p.ce ? 'Étape 1 — ' : ''}${nb > 1 ? `Les ${nb} textes déclencheurs` : 'Le texte déclencheur'}
Mission : adapter l'article source pour en faire ${nb > 1 ? `${nb} textes déclencheurs` : 'un texte déclencheur'} servant de base à ${p.ce ? "l'épreuve de compréhension écrite ci-dessous" : p.section === 'po' ? "une épreuve de production orale (exposé et débat)" : "une épreuve de production écrite"}.

${buildDidacticDirectives(p.level, p.targetWordCount, nb, p.minWordCount, p.maxWordCount)}
- Avant de répondre, vérifie le nombre de mots du corps de chaque texte. Dans ce décompte, l'apostrophe sépare deux mots (« l'homme » = 2 mots). L'application recompte et signale tout écart.
- Dans le JSON, sépare les paragraphes du champ "body" par \\n\\n.`);
  }

  if (p.ce) {
    const { questionCount, totalPoints, allowedTypes } = parametresCe({
      questionCount: p.ce.questionCount,
      totalPoints: p.ce.totalPoints,
      questionTypes: p.ce.questionTypes,
    });
    sections.push(`## ❓ ${original ? '' : 'Étape 2 — '}Questionnaire de compréhension écrite
Conçois une épreuve complète de Compréhension Écrite (CE) de niveau CECRL ${p.level}, comportant exactement ${questionCount} questions pour un total de ${totalPoints} points, accompagnée de son corrigé officiel détaillé et de son barème.
Le questionnaire porte sur ${original ? "l'article source ci-dessus, tel quel (texte original non adapté)" : (nb > 1 ? 'les textes que tu as rédigés à l\'étape 1' : 'le texte que tu as rédigé à l\'étape 1')}. Les citations justificatives doivent en être extraites mot pour mot.

${buildCeDirectives(p.level, questionCount, totalPoints, allowedTypes)}`);
  }

  const exemple: Record<string, unknown> = {};
  if (!original) exemple.articles = EXEMPLE_JSON_ARTICLES.articles;
  if (p.ce) exemple.ce = EXEMPLE_JSON_CE;
  sections.push(`## 📤 Format de la réponse (JSON strict)
Réponds uniquement par un objet JSON valide de cette forme${original ? '' : ` (${nb} élément${nb > 1 ? 's' : ''} dans "articles")`} :

${JSON.stringify(exemple, null, 2)}`);

  return sections.join('\n\n') + '\n';
}

/** Isole et lit le premier objet JSON d'une réponse collée (balises de code, texte autour…). */
function lireJson(raw: string): any {
  if (!raw || !raw.trim()) throw new Error('La réponse collée est vide.');
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const debut = text.indexOf('{');
  const fin = text.lastIndexOf('}');
  if (debut === -1 || fin <= debut) throw new Error("Aucun objet JSON n'a été trouvé dans la réponse collée.");
  const bloc = text.slice(debut, fin + 1);
  try {
    return JSON.parse(bloc);
  } catch {
    try {
      return JSON.parse(escapeControlCharactersInStrings(bloc));
    } catch (err: any) {
      throw new Error(`Le JSON de la réponse est invalide (${err?.message || 'erreur de syntaxe'}). Vérifiez que la réponse a été copiée en entier.`);
    }
  }
}

/** Transforme la réponse de l'IA externe en sujet affichable, exportable et modifiable. */
export function importerReponseGeneration(raw: string, p: ParamsGenerationExterne): SubjectGenerationResult {
  const json = lireJson(raw);
  const original = p.ce?.articleMode === 'original';
  const s = p.source;

  let documents;
  if (original) {
    documents = [documentOriginal(s, p.theme)];
  } else {
    const bruts: any[] = Array.isArray(json?.articles)
      ? json.articles
      : Array.isArray(json) ? json : (json?.body ? [json] : []);
    documents = normaliserArticles(bruts, s, p.targetWordCount, p.minWordCount, p.maxWordCount);
    if (documents.length === 0) {
      throw new Error('La réponse ne contient aucun texte déclencheur (champ "articles" absent ou vide).');
    }
  }

  const result: SubjectGenerationResult = {
    theme: p.theme,
    level: p.level,
    targetWordCount: original ? documents[0].actualWordCount : p.targetWordCount,
    minWordCount: p.minWordCount,
    maxWordCount: p.maxWordCount,
    articleCount: documents.length,
    documents,
    sourceArticle: {
      title: s.title,
      mediaName: s.mediaName,
      publishedDate: s.publishedDate,
      url: s.originalUrl,
    },
    modelUsed: MODELE_IA_EXTERNE,
  };

  if (p.ce) {
    // Questionnaire attendu sous "ce" ; tolère aussi "questionnaire" ou des questions à la racine.
    const brutCe = json?.ce || json?.questionnaire || (Array.isArray(json?.questions) ? json : null);
    if (!brutCe) throw new Error('La réponse ne contient pas le questionnaire de compréhension écrite (champ "ce").');
    const { totalPoints, allowedTypes } = parametresCe({
      questionCount: p.ce.questionCount,
      totalPoints: p.ce.totalPoints,
      questionTypes: p.ce.questionTypes,
    });
    result.ceExam = normaliserExamenCe(brutCe, {
      articleTitle: documents[0].title,
      articleSource: documents[0].source,
      articleText: texteSupportCe(documents),
      totalPoints,
      allowedTypes,
    });
    result.isCeExam = true;
  }

  return result;
}
