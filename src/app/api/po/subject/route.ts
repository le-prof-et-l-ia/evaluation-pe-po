import { NextResponse } from 'next/server';
import {
  searchWhitelistArticles,
  extractArticleContent,
  findArticleForTheme,
  MIN_ARTICLE_LENGTH,
  NO_ARTICLE_FOUND_MESSAGE,
  generateTriggerSubject,
  MEDIA_WHITELIST
} from '@/lib/subjectGeneratorService';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;

    // 1. Recherche d'articles récents
    if (action === 'search') {
      const { theme } = body;
      if (!theme || typeof theme !== 'string' || !theme.trim()) {
        return NextResponse.json({ error: 'Le thème est obligatoire pour la recherche.' }, { status: 400 });
      }

      const candidates = await searchWhitelistArticles(theme.trim());
      return NextResponse.json({
        success: true,
        candidates,
        whitelist: MEDIA_WHITELIST.map(m => m.name)
      });
    }

    // 2. Extraction du contenu
    if (action === 'extract') {
      const { url, mediaName } = body;
      if (!url || typeof url !== 'string') {
        return NextResponse.json({ error: "L'URL de l'article est obligatoire." }, { status: 400 });
      }

      const article = await extractArticleContent(url.trim(), mediaName);
      if (!article.cleanText || article.cleanText.length < MIN_ARTICLE_LENGTH) {
        return NextResponse.json({ error: "Le texte de cet article n'a pas pu être récupéré (site protégé ou page sans texte). Choisissez un autre article, ou collez son texte en mode manuel." }, { status: 422 });
      }
      return NextResponse.json({
        success: true,
        article
      });
    }

    // 2 bis. Recherche et extraction automatiques d'un article (1-clic), sans appel à l'IA :
    // sert à la préparation par une IA externe, qui reçoit ensuite le texte de l'article.
    if (action === 'find') {
      const { theme } = body;
      if (!theme || typeof theme !== 'string' || !theme.trim()) {
        return NextResponse.json({ error: 'Le thème est obligatoire pour la recherche.' }, { status: 400 });
      }
      const article = await findArticleForTheme(theme.trim());
      if (!article) {
        return NextResponse.json({ error: NO_ARTICLE_FOUND_MESSAGE }, { status: 422 });
      }
      return NextResponse.json({ success: true, article });
    }

    // 3. Génération du texte déclencheur
    if (action === 'generate') {
      const { theme, level = 'B2', targetWordCount = 250, articleCount = 1, sourceArticle, apiKeys } = body;

      if (!theme || typeof theme !== 'string' || !theme.trim()) {
        return NextResponse.json({ error: 'Le thème est obligatoire.' }, { status: 400 });
      }

      let articleToUse = sourceArticle;

      if (!articleToUse || !articleToUse.cleanText) {
        // On n'invente jamais de source : faute d'article lisible, l'utilisateur est prévenu.
        const found = await findArticleForTheme(theme.trim());
        if (!found) {
          return NextResponse.json({ error: NO_ARTICLE_FOUND_MESSAGE }, { status: 422 });
        }
        articleToUse = found;
      }

      const result = await generateTriggerSubject({
        theme: theme.trim(),
        // Le niveau C1 et son dossier de 1 à 3 documents, proposés à l'écran, sont respectés.
        level: (level === 'B1' || level === 'C1' ? level : 'B2') as 'B1' | 'B2' | 'C1',
        targetWordCount: Number(targetWordCount) || 250,
        articleCount: level === 'C1' ? Number(articleCount) || 1 : 1,
        sourceArticle: articleToUse,
        apiKeys
      });

      return NextResponse.json({
        success: true,
        result
      });
    }

    return NextResponse.json({ error: `Action '${action}' non reconnue.` }, { status: 400 });
  } catch (error: any) {
    console.error('[PO API subject] Erreur serveur :', error);
    return NextResponse.json(
      { error: error?.message || 'Erreur lors de la génération de sujet.' },
      { status: 500 }
    );
  }
}
