import { GoogleGenAI } from '@google/genai';
import { runWithGeminiModelFallback, generateContentSafe, type KeyConfig } from './geminiService';

export interface WhitelistMedia {
  domain: string;
  name: string;
  siteQuery: string;
}

export const MEDIA_WHITELIST: WhitelistMedia[] = [
  { domain: 'francetvinfo.fr', name: 'Franceinfo', siteQuery: 'site:francetvinfo.fr' },
  { domain: 'france24.com', name: 'France 24', siteQuery: 'site:france24.com' },
  { domain: 'rfi.fr', name: 'RFI', siteQuery: 'site:rfi.fr' },
  { domain: 'radiofrance.fr', name: 'Radio France', siteQuery: 'site:radiofrance.fr' },
  { domain: 'arte.tv', name: 'Arte Info', siteQuery: 'site:arte.tv/info' },
  { domain: 'tv5monde.com', name: 'TV5MONDE', siteQuery: 'site:tv5monde.com' },
  { domain: 'tf1info.fr', name: 'TF1 Info', siteQuery: 'site:tf1info.fr' },
  { domain: 'rtl.fr', name: 'RTL', siteQuery: 'site:rtl.fr' },
  { domain: 'europe1.fr', name: 'Europe 1', siteQuery: 'site:europe1.fr' },
  { domain: 'bfmtv.com', name: 'BFMTV', siteQuery: 'site:bfmtv.com' },
  { domain: '20minutes.fr', name: '20 Minutes', siteQuery: 'site:20minutes.fr' },
  { domain: 'rts.ch', name: 'RTS Info', siteQuery: 'site:rts.ch/info' },
  { domain: 'rtbf.be', name: 'RTBF', siteQuery: 'site:rtbf.be/info' },
  { domain: 'ici.radio-canada.ca', name: 'Radio-Canada', siteQuery: 'site:ici.radio-canada.ca' },
  { domain: 'noovo.info', name: 'Noovo Info', siteQuery: 'site:noovo.info' },
  { domain: 'medi1.com', name: 'Medi 1', siteQuery: 'site:medi1.com' },
];

export interface CandidateArticle {
  title: string;
  url: string;
  mediaName: string;
  publishedDate?: string;
  snippet?: string;
  ageDays?: number;
}

export interface ExtractedArticle {
  title: string;
  mediaName: string;
  publishedDate: string;
  cleanText: string;
  originalUrl: string;
}

export interface GeneratedDocument {
  documentNumber?: number;
  title: string;
  source: string;
  body: string;
  actualWordCount: number;
  targetWordCount: number;
  toleranceMet: boolean;
  iterationCount: number;
  viewpoint?: string;
}

export type QuestionType = 'qcm' | 'vrai_faux' | 'reponse_ouverte';

export interface CeQuestion {
  id: number;
  type: QuestionType;
  points: number;
  question: string;
  options?: string[]; // pour QCM (3 ou 4 options)
  correctAnswerIndex?: number; // 0, 1, 2... pour QCM
  trueFalseAnswer?: boolean; // true pour Vrai, false pour Faux
  justificationText?: string; // citation textuelle exacte justifiant la réponse
  sampleAnswer?: string; // réponse modèle pour question ouverte
  gradingCriteria?: string; // consignes de notation / barème
  cognitiveDomain?: 'globale' | 'detaillee' | 'implicite' | 'lexique';
}

export interface CeExam {
  articleTitle: string;
  articleSource: string;
  articleText: string;
  totalPoints: number;
  questionCount: number;
  questions: CeQuestion[];
  generalInstructions?: string;
}

export interface SubjectGenerationResult {
  theme: string;
  level: 'B1' | 'B2' | 'C1';
  targetWordCount: number;
  minWordCount?: number;
  maxWordCount?: number;
  articleCount: number;
  documents: GeneratedDocument[];
  sourceArticle: {
    title: string;
    mediaName: string;
    publishedDate: string;
    url: string;
  };
  modelUsed: string;
  fallbackNotice?: string;
  ceExam?: CeExam;
  isCeExam?: boolean;
}

/**
 * Calcul du nombre de mots selon les règles de la langue française pour les examens DELF/DALF :
 * Les séparateurs d'espaces et d'apostrophes comptent pour des unités lexicales
 * (ex. « l'homme » = 2 mots, « d'accord » = 2 mots).
 */
export function countFrenchWords(text: string): number {
  if (!text) return 0;
  const normalized = text
    .replace(/['’ʻ]/g, ' ')
    .replace(/[.,;:!?«»"()[\]{}]/g, ' ')
    .trim();
  if (!normalized) return 0;
  const tokens = normalized.split(/\s+/).filter(t => t.length > 0 && !/^[-_—–]+$/.test(t));
  return tokens.length;
}

/**
 * Détecte si une date est antérieure à 9 mois (environ 274 jours).
 */
export function isWithin9Months(dateStr?: string): boolean {
  if (!dateStr) return true; // Si pas de date détectée, on ne filtre pas d'office
  try {
    const pubDate = new Date(dateStr);
    if (isNaN(pubDate.getTime())) return true;
    const diffMs = Date.now() - pubDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays <= 274;
  } catch {
    return true;
  }
}

/**
 * Trouve le nom officiel du média correspondant à une URL.
 */
export function getMediaNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    for (const media of MEDIA_WHITELIST) {
      if (host.includes(media.domain) || media.domain.includes(host)) {
        return media.name;
      }
    }
  } catch {}
  return 'Presse francophone';
}

/**
 * Décode les entités HTML courantes dans les titres et extraits.
 */
export function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .trim();
}

/**
 * Recherche des articles récents sur les diffuseurs et médias d'information de la liste blanche.
 */
export async function searchWhitelistArticles(theme: string): Promise<CandidateArticle[]> {
  const queryTheme = theme.trim();
  if (!queryTheme) return [];

  const candidates: CandidateArticle[] = [];
  const seenUrls = new Set<string>();

  // 1. Recherche via DuckDuckGo avec regroupement des domaines de la liste blanche
  try {
    const siteGroup = MEDIA_WHITELIST.map(m => m.siteQuery).join(' OR ');
    const query = encodeURIComponent(`${queryTheme} (${siteGroup})`);
    const ddgRes = await fetch(`https://html.duckduckgo.com/html/?q=${query}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8'
      },
      signal: AbortSignal.timeout(12000)
    });

    if (ddgRes.ok) {
      const html = await ddgRes.text();
      const linkRegex = /<a[^>]*class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      
      const snippets: string[] = [];
      let sm;
      while ((sm = snippetRegex.exec(html)) !== null) {
        snippets.push(decodeHtmlEntities(sm[1].replace(/<[^>]+>/g, '').trim()));
      }

      let lm;
      let sIdx = 0;
      while ((lm = linkRegex.exec(html)) !== null && candidates.length < 15) {
        const rawHref = lm[1];
        let actualUrl = rawHref;
        if (rawHref.includes('uddg=')) {
          try {
            const u = new URL(rawHref, 'https://duckduckgo.com');
            actualUrl = decodeURIComponent(u.searchParams.get('uddg') || rawHref);
          } catch {}
        }

        // Vérifier que l'URL appartient bien à la liste blanche et n'est pas une publicité
        const isWhitelisted = MEDIA_WHITELIST.some(m => actualUrl.includes(m.domain));
        if (isWhitelisted && !actualUrl.includes('ad_domain') && !actualUrl.includes('bing.com') && !seenUrls.has(actualUrl)) {
          seenUrls.add(actualUrl);
          const mediaName = getMediaNameFromUrl(actualUrl);
          const snippet = snippets[sIdx] || '';
          
          // Essayer d'extraire un titre plus propre
          let title = snippet.split(' - ')[0] || lm[2]?.replace(/<[^>]+>/g, '').trim() || `${mediaName} - ${queryTheme}`;
          title = decodeHtmlEntities(title);
          if (title.length > 120) title = title.slice(0, 117) + '...';

          candidates.push({
            title,
            url: actualUrl,
            mediaName,
            snippet
          });
        }
        sIdx++;
      }
    }
  } catch (err) {
    console.warn('[Subject Search] Erreur recherche DuckDuckGo :', err);
  }

  // 2. Recherche complémentaire via Google News RSS si moins de 3 résultats
  if (candidates.length < 3) {
    try {
      const topDomains = MEDIA_WHITELIST.slice(0, 10).map(m => `site:${m.domain}`).join(' OR ');
      const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(queryTheme + ' (' + topDomains + ')')}&hl=fr&gl=FR&ceid=FR:fr`;
      const rssRes = await fetch(rssUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(10000)
      });
      if (rssRes.ok) {
        const xml = await rssRes.text();
        const itemMatches = [...xml.matchAll(/<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<pubDate>(.*?)<\/pubDate>/g)];
        for (const m of itemMatches) {
          if (candidates.length >= 15) break;
          const rawTitle = m[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
          const pubDate = m[3].trim();
          
          // Déterminer le média à partir du titre RSS (souvent "Titre - France 24")
          let mediaName = 'Presse francophone';
          let cleanTitle = rawTitle;
          if (rawTitle.includes(' - ')) {
            const parts = rawTitle.split(' - ');
            const lastPart = parts[parts.length - 1].trim();
            const matchedMedia = MEDIA_WHITELIST.find(media => lastPart.toLowerCase().includes(media.name.toLowerCase()));
            if (matchedMedia) {
              mediaName = matchedMedia.name;
              cleanTitle = parts.slice(0, -1).join(' - ').trim();
            }
          }

          if (isWithin9Months(pubDate)) {
            candidates.push({
              title: cleanTitle,
              url: m[2].trim(),
              mediaName,
              publishedDate: pubDate
            });
          }
        }
      }
    } catch (err) {
      console.warn('[Subject Search] Erreur recherche Google News RSS :', err);
    }
  }

  return candidates;
}

/**
 * Extraction épurée du contenu d'un article via Jina Reader (ou fallback textuel).
 */
export async function extractArticleContent(url: string, defaultMediaName?: string): Promise<ExtractedArticle> {
  const mediaName = defaultMediaName || getMediaNameFromUrl(url);
  let title = '';
  let publishedDate = '';
  let cleanText = '';

  // 1. Essai via Jina Reader (https://r.jina.ai/<url>)
  try {
    const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        'Accept': 'text/plain',
        'X-No-Cache': 'true'
      },
      signal: AbortSignal.timeout(20000)
    });

    if (jinaRes.ok) {
      const markdown = await jinaRes.text();

      // Extraction du titre
      const titleMatch = markdown.match(/^Title:\s*(.+)$/m);
      if (titleMatch) {
        title = titleMatch[1].trim();
      }

      // Extraction de la date
      const dateMatch = markdown.match(/^Published Time:\s*(.+)$/m);
      if (dateMatch) {
        publishedDate = dateMatch[1].trim();
      }

      // Extraction du corps de texte nettoyé
      let bodyText = markdown;
      if (markdown.includes('Markdown Content:')) {
        bodyText = markdown.split('Markdown Content:')[1];
      }

      // Si un titre principal `# ...` est présent, démarrer à partir de là pour éliminer les menus de navigation
      const mainHeadingIdx = bodyText.search(/^#\s+/m);
      if (mainHeadingIdx !== -1) {
        bodyText = bodyText.slice(mainHeadingIdx);
      }

      // Éliminer les sections de bas de page (articles connexes, recommandations)
      const footerMatch = bodyText.search(/^##\s+.*(?:lire aussi|écouter aussi|plus lus|articles similaires|sur le même sujet|archives|podcasts)/im);
      if (footerMatch !== -1) {
        bodyText = bodyText.slice(0, footerMatch);
      }

      // Nettoyer les images markdown, liens superflus et éléments parasites
      bodyText = bodyText
        .replace(/!\[.*?\]\(.*?\)/g, '') // Supprimer images
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Garder texte du lien
        .replace(/^[#\*\-_\s]{3,}$/gm, '') // Lignes de séparation
        .replace(/\n{3,}/g, '\n\n') // Espacement
        .trim();

      // Filtrer les encarts cookies / RGPD / bandeaux de consentement fréquents
      const cleanedLines = bodyText.split('\n').filter(line => {
        const l = line.toLowerCase().trim();
        if (!l) return true;
        return (
          !l.includes('cookies') &&
          !l.includes('données personnelles') &&
          !l.includes('vos choix, notre responsabilité') &&
          !l.includes('publicité') &&
          !l.includes('tous droits réservés') &&
          !l.includes('consentement') &&
          !l.includes('partenaires') &&
          !l.includes('paramétrer') &&
          !l.includes('accéder au contenu sans accepter') &&
          !/^(paramétrer|refuser|accepter|tout accepter|tout refuser)$/i.test(l)
        );
      });

      cleanText = cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    }
  } catch (err) {
    console.warn('[Subject Extract] Erreur Jina Reader :', err);
  }

  // 2. Fallback si Jina a échoué ou a retourné trop peu de texte
  if (!cleanText || cleanText.length < 150) {
    try {
      const directRes = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(15000)
      });
      if (directRes.ok) {
        const html = await directRes.text();
        if (!title) {
          const tMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          if (tMatch) title = tMatch[1].replace(/&[^;]+;/g, ' ').trim();
        }
        // Nettoyage sommaire HTML
        const stripped = html
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
          .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
          .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
          .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (stripped.length > 200) {
          cleanText = stripped.slice(0, 3500);
        }
      }
    } catch (fallbackErr) {
      console.warn('[Subject Extract] Erreur fallback direct HTML :', fallbackErr);
    }
  }

  // Date de publication lisible
  let formattedDate = 'récemment';
  if (publishedDate) {
    try {
      const d = new Date(publishedDate);
      if (!isNaN(d.getTime())) {
        formattedDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
      }
    } catch {}
  } else {
    formattedDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  }

  if (!title) {
    title = `Actualité sur le thème : ${mediaName}`;
  }

  return {
    title,
    mediaName,
    publishedDate: formattedDate,
    cleanText,
    originalUrl: url
  };
}

/**
 * Construit le prompt système pour la génération de texte déclencheur FLE.
 */
function buildDidacticSystemPrompt(
  level: 'B1' | 'B2' | 'C1',
  targetWordCount: number,
  articleCount: number,
  minWordCount?: number,
  maxWordCount?: number
): string {
  let levelCalibration = '';
  if (level === 'B1') {
    levelCalibration = `- B1 : Lexique usuel, phrases directes et courtes, articulations logiques courantes (mais, donc, pourtant, parce que), explicitation des idées sans ambiguïté.`;
  } else if (level === 'B2') {
    levelCalibration = `- B2 : Lexique thématique et conceptuel plus riche, syntaxe complexe (subordination, subjonctif, passif, tournures de concession), confrontation d'arguments contradictoires nuancés.`;
  } else {
    levelCalibration = `- C1 : Registre soutenu, style journalistique élégant, recours à l'implicite, tournures rhétoriques et projections prospectives.`;
  }

  const multiDocInstruction = level === 'C1' && articleCount > 1 ? `
Spécificité DALF C1 (${articleCount} documents distincts) :
Vous devez générer un ensemble de ${articleCount} documents déclencheurs distincts composant un dossier de synthèse/débat.
RÉPARTITION OBLIGATOIRE : Les points de vue divergents ou arguments contradictoires doivent être répartis entre les articles :
- Document 1 : présente un premier angle d'attaque ou arguments en faveur de la question / aspects positifs.
- Document 2 : présente un angle contradictoire, les contestations, réserves ou contre-arguments.
${articleCount === 3 ? '- Document 3 : apporte un regard tiers, des constats sociologiques, des projections prospectives ou des nuances d\'experts.' : ''}
Chaque document individuel doit viser très exactement ${targetWordCount} mots.
` : '';

  const volumeInstruction = (minWordCount && maxWordCount)
    ? `- Longueur cible : le corps de texte doit obligatoirement compter entre ${minWordCount} et ${maxWordCount} mots (idéalement environ ${targetWordCount} mots, hors titre et source).`
    : `- Longueur cible : vise très exactement ${targetWordCount} mots par article (dans le corps de texte, hors titre et source).`;

  return `Rôle : Concepteur d'épreuves de certification en Français Langue Étrangère (type DELF/DALF).
Mission : Adapter l'article source fourni pour en faire un texte déclencheur servant de base à une épreuve de production (écrite ou orale).

Règles formelles de présentation :
- Titre : court, percutant, avec une majuscule uniquement au premier mot (typographie française).
- Source : indiquer la mention éditoriale sous le titre (ex. « D'après RTS Info, 12 août 2026 »).
- Structure : 2 à 4 paragraphes bien délimités.
- Aucun propos introductif ou métadiscours (ne dites pas "Voici le texte déclencheur").

Objectif didactique :
- Le document ne doit pas être un compte-rendu neutre. Il doit exposer une problématique, soulever des enjeux sociétaux et confronter explicitement au moins deux points de vue divergents ou arguments contradictoires afin d'alimenter la prise de position du candidat.
${multiDocInstruction}
Calibrage syntaxique et lexical selon le niveau :
${levelCalibration}

Contrainte volumétrique :
${volumeInstruction}

Format de réponse obligatoire en JSON pur et valide :
{
  "articles": [
    {
      "documentNumber": 1,
      "title": "Titre typographié français",
      "source": "D'après Nom du média, Date",
      "body": "Corps du texte en 2 à 4 paragraphes séparés par deux retours à la ligne...",
      "viewpoint": "Bref résumé de la thèse / perspective défendue"
    }
  ]
}`;
}

/**
 * Exécute la réécriture didactique avec la chaîne de repli Gemini Flash
 * et applique la boucle programmatique de contrôle du décompte de mots (tolérance ±5 % ou intervalle personnalisé, max 2 itérations).
 */
export async function generateTriggerSubject(params: {
  theme: string;
  level: 'B1' | 'B2' | 'C1';
  targetWordCount: number;
  minWordCount?: number;
  maxWordCount?: number;
  articleCount?: number;
  sourceArticle: ExtractedArticle;
  apiKeys?: KeyConfig;
}): Promise<SubjectGenerationResult> {
  const { theme, level, targetWordCount, minWordCount, maxWordCount, sourceArticle, apiKeys } = params;
  const articleCount = level === 'C1' ? Math.min(Math.max(params.articleCount || 1, 1), 3) : 1;

  const minTarget = minWordCount ?? Math.round(targetWordCount * 0.95);
  const maxTarget = maxWordCount ?? Math.round(targetWordCount * 1.05);

  const systemPrompt = buildDidacticSystemPrompt(level, targetWordCount, articleCount, minWordCount, maxWordCount);
  const userPrompt = `Voici les informations de l'article source :
- Thème : ${theme}
- Média d'origine : ${sourceArticle.mediaName}
- Date d'origine : ${sourceArticle.publishedDate}
- Titre d'origine : ${sourceArticle.title}
- Extrait / texte source :
${sourceArticle.cleanText.slice(0, 4000)}

Générez maintenant ${articleCount} article(s) déclencheur(s) au format JSON demandé.`;

  // 1. Première passe de génération avec la chaîne de repli Gemini Flash
  const generationResult = await runWithGeminiModelFallback(
    'gemini-3.8-flash',
    async (activeModel, activeKey) => {
      const ai = new GoogleGenAI({ apiKey: activeKey });
      const response = await generateContentSafe(ai, activeModel, {
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json'
        }
      });

      const responseText = response.text || '';
      return { responseText, activeModel };
    },
    apiKeys,
    undefined,
    2,
    1,
    35000,
    60000
  );

  let parsedData: any = null;
  try {
    const raw = generationResult.responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    parsedData = JSON.parse(raw);
  } catch (err) {
    console.error('[Subject Generation] Échec de parsing JSON initial :', err, generationResult.responseText);
    throw new Error("L'IA n'a pas renvoyé une structure JSON valide pour le sujet. Veuillez réessayer.");
  }

  const rawArticles: any[] = Array.isArray(parsedData?.articles)
    ? parsedData.articles
    : [parsedData];

  // 2. Boucle de contrôle programmatique du décompte de mots
  const finalizedDocuments: GeneratedDocument[] = [];

  for (let i = 0; i < rawArticles.length; i++) {
    const rawArt = rawArticles[i];
    const currentTitle = rawArt.title || `Article déclencheur ${i + 1}`;
    const currentSource = rawArt.source || `D'après ${sourceArticle.mediaName}, ${sourceArticle.publishedDate}`;
    let currentBody = rawArt.body || '';
    const currentViewpoint = rawArt.viewpoint || '';

    let actualCount = countFrenchWords(currentBody);
    let iterations = 0;
    let toleranceMet = actualCount >= minTarget && actualCount <= maxTarget;

    // Si le corps sort de la tolérance / de l'intervalle visé, relance ciblée jusqu'à 2 itérations max
    while (!toleranceMet && iterations < 2) {
      iterations++;
      console.log(`[Word Count Loop] Document ${i + 1} : ${actualCount} mots (visé: ${targetWordCount} [${minTarget}-${maxTarget}]). Lancement itération d'ajustement ${iterations}/2...`);

      const adjustmentPrompt = `Rôle : Concepteur d'épreuves de certification FLE (DELF/DALF).
Instruction stricte :
Le texte ci-dessous comporte ${actualCount} mots. Réécris-le pour qu'il contienne strictement entre ${minTarget} et ${maxTarget} mots, sans altérer le niveau didactique (${level}) ni les arguments présentés.
Conserve la structure en 2 à 4 paragraphes. Réponds uniquement avec le corps du texte réécrit, sans méta-commentaire, sans titre et sans mention de source.

Texte à ajuster :
${currentBody}`;

      try {
        const adjustmentResult = await runWithGeminiModelFallback(
          'gemini-3.8-flash',
          async (activeModel, activeKey) => {
            const ai = new GoogleGenAI({ apiKey: activeKey });
            const resp = await generateContentSafe(ai, activeModel, {
              contents: [{ role: 'user', parts: [{ text: adjustmentPrompt }] }],
              config: {}
            });
            return resp.text || '';
          },
          apiKeys,
          undefined,
          2,
          1,
          30000,
          50000
        );

        if (adjustmentResult && adjustmentResult.trim().length > 50) {
          currentBody = adjustmentResult.trim();
          actualCount = countFrenchWords(currentBody);
          toleranceMet = actualCount >= minTarget && actualCount <= maxTarget;
        }
      } catch (adjErr) {
        console.warn(`[Word Count Loop] Erreur lors de l'itération ${iterations} :`, adjErr);
        break;
      }
    }

    finalizedDocuments.push({
      documentNumber: i + 1,
      title: currentTitle,
      source: currentSource,
      body: currentBody,
      actualWordCount: actualCount,
      targetWordCount,
      toleranceMet,
      iterationCount: iterations,
      viewpoint: currentViewpoint
    });
  }

  return {
    theme,
    level,
    targetWordCount,
    minWordCount,
    maxWordCount,
    articleCount: finalizedDocuments.length,
    documents: finalizedDocuments,
    sourceArticle: {
      title: sourceArticle.title,
      mediaName: sourceArticle.mediaName,
      publishedDate: sourceArticle.publishedDate,
      url: sourceArticle.originalUrl
    },
    modelUsed: (generationResult as any).modelUsed || 'gemini-3.8-flash',
    fallbackNotice: (generationResult as any).fallbackNotice
  };
}

/**
 * Génère une épreuve complète de Compréhension Écrite (CE) à partir d'un article :
 * Questions variées et équilibrées (QCM, Vrai/Faux avec justification, réponse ouverte),
 * Corrigé officiel détaillé avec barème d'évaluation et citations textuelles.
 */
export async function generateReadingComprehensionExam(params: {
  level: 'B1' | 'B2' | 'C1';
  theme: string;
  articleTitle: string;
  articleSource: string;
  articleText: string;
  questionCount?: number;
  totalPoints?: number;
  questionTypes?: QuestionType[];
  apiKeys?: KeyConfig;
}): Promise<CeExam> {
  const {
    level,
    theme,
    articleTitle,
    articleSource,
    articleText,
    apiKeys
  } = params;

  const questionCount = Math.min(Math.max(params.questionCount || 6, 3), 15);
  const totalPoints = Math.max(params.totalPoints || 25, 5);
  const allowedTypes: QuestionType[] = (params.questionTypes && params.questionTypes.length > 0)
    ? params.questionTypes
    : ['qcm', 'vrai_faux', 'reponse_ouverte'];

  let levelGuidelines = '';
  if (level === 'B1') {
    levelGuidelines = `- DELF B1 :
  * Questions directes portant sur des faits concrets, des avis exprimés ou des informations explicites.
  * Vocabulaire courant et formulation simple et transparente des questions.
  * Distracteurs plausibles mais sans piège linguistique excessif.`;
  } else if (level === 'B2') {
    levelGuidelines = `- DELF B2 :
  * Questions portant sur l'argumentation, la confrontation des idées, les nuances et les intentions de l'auteur.
  * Présence de questions sollicitant la compréhension fine de l'implicite ou du ton du texte.
  * Distracteurs subtils requérant une lecture attentive de tout le passage.`;
  } else {
    levelGuidelines = `- DALF C1 :
  * Questions analytiques portant sur la posture énonciative, l'ironie, les sous-entendus et les procédés rhétoriques.
  * Formulation soutenue, questions ouvertes demandant une réelle capacité de synthèse et de reformulation critique.`;
  }

  const typesListFormatted = allowedTypes.map(t => {
    if (t === 'qcm') return '- "qcm" : Question à choix multiples avec 3 options (A, B, C) et 1 seule bonne réponse indiscutable.';
    if (t === 'vrai_faux') return '- "vrai_faux" : Affirmation avec choix Vrai/Faux et OBLIGATION de citer le passage exact du texte justifiant la réponse.';
    return '- "reponse_ouverte" : Question ouverte demandant une réponse rédigée précise (1 à 3 phrases).';
  }).join('\n');

  const systemPrompt = `Rôle : Concepteur d'épreuves officielles de certification en Français Langue Étrangère (DELF / DALF, France Éducation international).
Mission : Concevoir une épreuve complète de Compréhension Écrite (CE) de niveau CECRL ${level}, comportant exactement ${questionCount} questions pour un total de ${totalPoints} points, accompagnée de son corrigé officiel détaillé et de son barème.

Article support :
Titre : ${articleTitle}
Source : ${articleSource}
Texte :
"""
${articleText.slice(0, 4500)}
"""

Directives didactiques CECRL (${level}) :
${levelGuidelines}

Types de questions à intégrer impérativement parmi la sélection de l'utilisateur :
${typesListFormatted}
(Si plusieurs types sont autorisés, variez impérativement les types au sein du questionnaire de manière équilibrée).

Équilibrage cognitif obligatoire :
Répartissez judicieusement les questions selon les 4 dimensions fondamentales de la compréhension écrite :
1. "globale" : identifier le thème, la visée informative ou polémique, la thèse principale.
2. "detaillee" : repérer des informations factuelles précises, des explications, des relations de cause à effet.
3. "implicite" : déduire le point de vue de l'auteur, les sous-entendus, l'attitude ou le ton (ironique, alarmiste, nuancé).
4. "lexique" : comprendre le sens d'un terme ou d'une expression en contexte.

Barème et attribution des points :
- Le total des points distribués sur l'ensemble des ${questionCount} questions doit faire TRÈS EXACTEMENT ${totalPoints} points.
- Pour chaque question, attribuez des points cohérents (ex: 2 à 5 points selon la complexité). Les questions Vrai/Faux avec justification et les questions ouvertes valent généralement plus de points qu'un QCM simple.
- Pour chaque question, détaillez le barème officiel d'attribution (ex: pour Vrai/Faux, la règle stricte DELF est que la justification exacte est indispensable pour avoir les points).

Format de réponse OBLIGATOIRE en JSON pur et valide (aucun préambule ni balisage markdown) :
{
  "generalInstructions": "Lisez attentivement l'article ci-dessus, puis répondez aux questions suivantes en cochant la bonne réponse ou en rédigeant la réponse demandée.",
  "questions": [
    {
      "id": 1,
      "type": "qcm",
      "cognitiveDomain": "globale",
      "points": 3,
      "question": "Quel est l'objectif principal de cet article ?",
      "options": [
        "A. Première option...",
        "B. Deuxième option...",
        "C. Troisième option..."
      ],
      "correctAnswerIndex": 1,
      "gradingCriteria": "1 point pour la bonne réponse cochée."
    },
    {
      "id": 2,
      "type": "vrai_faux",
      "cognitiveDomain": "detaillee",
      "points": 4,
      "question": "Selon l'auteur, la mesure a été accueillie favorablement par l'ensemble des acteurs.",
      "trueFalseAnswer": false,
      "justificationText": "« Citation exacte et intégrale extraite de l'article »",
      "gradingCriteria": "La totalité des points n'est accordée que si la case Faux est cochée ET que la citation textuelle exacte est fournie."
    },
    {
      "id": 3,
      "type": "reponse_ouverte",
      "cognitiveDomain": "implicite",
      "points": 5,
      "question": "Expliquez pourquoi l'auteur qualifie cette évolution de « paradoxale ».",
      "sampleAnswer": "Réponse modèle complète rédigée...",
      "gradingCriteria": "Attribuer la totalité des points si les deux éléments suivants sont explicités..."
    }
  ]
}`;

  const userPrompt = `Générez l'épreuve de Compréhension Écrite (${level}) avec ${questionCount} questions pour un total de ${totalPoints} points sur le thème « ${theme} », en respectant scrupuleusement la structure JSON demandée.`;

  const rawGeneration = await runWithGeminiModelFallback(
    'gemini-3.8-flash',
    async (activeModel, activeKey) => {
      const ai = new GoogleGenAI({ apiKey: activeKey });
      const response = await generateContentSafe(ai, activeModel, {
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json'
        }
      });
      return response.text || '{}';
    },
    apiKeys,
    undefined,
    2,
    1,
    35000,
    60000
  );

  let parsed: any = null;
  try {
    const cleaned = (rawGeneration || '{}').replace(/```json/g, '').replace(/```/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error('[CE Generation] Erreur parsing JSON :', err, rawGeneration);
    throw new Error("L'IA n'a pas renvoyé un format JSON valide pour l'épreuve de Compréhension Écrite. Veuillez réessayer.");
  }

  const rawQuestions: any[] = Array.isArray(parsed?.questions) ? parsed.questions : [];
  if (rawQuestions.length === 0) {
    throw new Error("Aucune question n'a été générée pour l'épreuve de Compréhension Écrite.");
  }

  // Normalisation programmatique des questions et du total de points
  const validatedQuestions: CeQuestion[] = rawQuestions.map((q, idx) => {
    const qType: QuestionType = allowedTypes.includes(q.type) ? q.type : allowedTypes[0];
    const pts = typeof q.points === 'number' && q.points > 0 ? q.points : 2;

    const baseQ: CeQuestion = {
      id: idx + 1,
      type: qType,
      points: pts,
      question: q.question || `Question ${idx + 1}`,
      gradingCriteria: q.gradingCriteria || '',
      cognitiveDomain: q.cognitiveDomain || 'detaillee'
    };

    if (qType === 'qcm') {
      baseQ.options = Array.isArray(q.options) && q.options.length >= 2 ? q.options : ['Option A', 'Option B', 'Option C'];
      baseQ.correctAnswerIndex = typeof q.correctAnswerIndex === 'number' ? q.correctAnswerIndex : 0;
    } else if (qType === 'vrai_faux') {
      baseQ.trueFalseAnswer = typeof q.trueFalseAnswer === 'boolean' ? q.trueFalseAnswer : false;
      baseQ.justificationText = q.justificationText || '';
    } else if (qType === 'reponse_ouverte') {
      baseQ.sampleAnswer = q.sampleAnswer || '';
    }

    return baseQ;
  });

  // Ajustement strict des points pour que la somme corresponde exactement à totalPoints
  const currentSum = validatedQuestions.reduce((sum, q) => sum + q.points, 0);
  if (currentSum !== totalPoints && validatedQuestions.length > 0) {
    const diff = totalPoints - currentSum;
    const lastQ = validatedQuestions[validatedQuestions.length - 1];
    if (lastQ.points + diff >= 1) {
      lastQ.points = Number((lastQ.points + diff).toFixed(1));
    }
  }

  return {
    articleTitle,
    articleSource,
    articleText,
    totalPoints,
    questionCount: validatedQuestions.length,
    questions: validatedQuestions,
    generalInstructions: parsed?.generalInstructions || "Lisez attentivement l'article puis répondez aux questions ci-dessous."
  };
}
