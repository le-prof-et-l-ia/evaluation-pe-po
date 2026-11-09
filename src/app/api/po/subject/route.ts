import { NextResponse } from 'next/server';
import {
  searchWhitelistArticles,
  extractArticleContent,
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
        const candidates = await searchWhitelistArticles(theme.trim());
        if (!candidates || candidates.length === 0) {
          articleToUse = {
            title: `Débat d'actualité : ${theme.trim()}`,
            mediaName: 'Franceinfo',
            publishedDate: new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()),
            cleanText: `Actualité récente et enjeux de société autour du thème : ${theme.trim()}. Confrontation des points de vue des usagers, des experts et des pouvoirs publics.`,
            originalUrl: 'https://www.francetvinfo.fr'
          };
        } else {
          const topCandidate = candidates[0];
          articleToUse = await extractArticleContent(topCandidate.url, topCandidate.mediaName);
          if (!articleToUse.cleanText || articleToUse.cleanText.length < 100) {
            articleToUse.cleanText = topCandidate.snippet || `Débat d'actualité sur le sujet : ${theme.trim()}`;
          }
        }
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
