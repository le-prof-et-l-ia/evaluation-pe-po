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

    // 3. Génération du texte déclencheur
    if (action === 'generate') {
      const { theme, level = 'B2', targetWordCount = 250, sourceArticle, apiKeys } = body;

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
        level: (level === 'B1' ? 'B1' : 'B2') as 'B1' | 'B2',
        targetWordCount: Number(targetWordCount) || 250,
        articleCount: 1,
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
