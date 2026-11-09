import { NextResponse } from 'next/server';
import {
  searchWhitelistArticles,
  extractArticleContent,
  findArticleForTheme,
  MIN_ARTICLE_LENGTH,
  NO_ARTICLE_FOUND_MESSAGE,
  generateTriggerSubject,
  generateReadingComprehensionExam,
  MEDIA_WHITELIST,
  countFrenchWords,
  SubjectGenerationResult
} from '@/lib/subjectGeneratorService';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;

    // 1. RECHERCHE D'ARTICLES RÉCENTS DANS LA LISTE BLANCHE
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

    // 2. EXTRACTION ÉPURÉE DU CONTENU
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

    // 3. GÉNÉRATION DIDACTIQUE & CONTRÔLE VOLUMÉTRIQUE (1-clic ou assisté, PE et CE)
    if (action === 'generate') {
      const {
        theme,
        level = 'B2',
        targetWordCount = 250,
        minWordCount,
        maxWordCount,
        articleCount = 1,
        sourceArticle,
        apiKeys,
        // Options pour la Compréhension Écrite (CE)
        generateCe = false,
        ceArticleMode = 'adapted', // 'adapted' | 'original'
        ceQuestionCount = 6,
        ceTotalPoints = 25,
        ceQuestionTypes = ['qcm', 'vrai_faux', 'reponse_ouverte']
      } = body;

      if (!theme || typeof theme !== 'string' || !theme.trim()) {
        return NextResponse.json({ error: 'Le thème est obligatoire.' }, { status: 400 });
      }

      let articleToUse = sourceArticle;

      // Si aucun article source n'a été fourni en amont, on lance la recherche et l'extraction automatique
      if (!articleToUse || !articleToUse.cleanText) {
        // On n'invente jamais de source : faute d'article lisible, l'utilisateur est prévenu.
        const found = await findArticleForTheme(theme.trim());
        if (!found) {
          return NextResponse.json({ error: NO_ARTICLE_FOUND_MESSAGE }, { status: 422 });
        }
        articleToUse = found;
      }

      // CAS A : Création de Compréhension Écrite (CE) avec article ORIGINAL
      if (generateCe && ceArticleMode === 'original') {
        const cleanBody = articleToUse.cleanText;
        const wordCount = countFrenchWords(cleanBody);

        const originalDoc = {
          documentNumber: 1,
          title: articleToUse.title || `Article : ${theme.trim()}`,
          source: `D'après ${articleToUse.mediaName}, ${articleToUse.publishedDate}`,
          body: cleanBody,
          actualWordCount: wordCount,
          targetWordCount: wordCount,
          toleranceMet: true,
          iterationCount: 0,
          viewpoint: "Texte original d'actualité (source)"
        };

        const ceExam = await generateReadingComprehensionExam({
          level: level as 'B1' | 'B2' | 'C1',
          theme: theme.trim(),
          articleTitle: originalDoc.title,
          articleSource: originalDoc.source,
          articleText: originalDoc.body,
          questionCount: Number(ceQuestionCount) || 6,
          totalPoints: Number(ceTotalPoints) || 25,
          questionTypes: ceQuestionTypes,
          apiKeys
        });

        const result: SubjectGenerationResult = {
          theme: theme.trim(),
          level: level as 'B1' | 'B2' | 'C1',
          targetWordCount: wordCount,
          minWordCount: minWordCount ? Number(minWordCount) : undefined,
          maxWordCount: maxWordCount ? Number(maxWordCount) : undefined,
          articleCount: 1,
          documents: [originalDoc],
          sourceArticle: {
            title: articleToUse.title,
            mediaName: articleToUse.mediaName,
            publishedDate: articleToUse.publishedDate,
            url: articleToUse.originalUrl
          },
          modelUsed: 'gemini-3.8-flash',
          ceExam,
          isCeExam: true
        };

        return NextResponse.json({
          success: true,
          result
        });
      }

      // CAS B : Article ADAPTÉ (pour PE ou pour CE avec article adapté)
      const baseResult = await generateTriggerSubject({
        theme: theme.trim(),
        level: level as 'B1' | 'B2' | 'C1',
        targetWordCount: Number(targetWordCount) || 250,
        minWordCount: minWordCount ? Number(minWordCount) : undefined,
        maxWordCount: maxWordCount ? Number(maxWordCount) : undefined,
        articleCount: level === 'C1' ? Number(articleCount) || 1 : 1,
        sourceArticle: articleToUse,
        apiKeys
      });

      // Si l'option CE est sélectionnée avec article adapté, on génère le questionnaire sur le texte adapté
      if (generateCe) {
        const primaryDoc = baseResult.documents[0];
        const combinedText = baseResult.documents.map(d => `${d.title}\n\n${d.body}`).join('\n\n---\n\n');

        const ceExam = await generateReadingComprehensionExam({
          level: level as 'B1' | 'B2' | 'C1',
          theme: theme.trim(),
          articleTitle: primaryDoc.title,
          articleSource: primaryDoc.source,
          articleText: combinedText,
          questionCount: Number(ceQuestionCount) || 6,
          totalPoints: Number(ceTotalPoints) || 25,
          questionTypes: ceQuestionTypes,
          apiKeys
        });

        baseResult.ceExam = ceExam;
        baseResult.isCeExam = true;
      }

      return NextResponse.json({
        success: true,
        result: baseResult
      });
    }

    return NextResponse.json({ error: `Action '${action}' non reconnue.` }, { status: 400 });
  } catch (error: any) {
    console.error('[API /api/subject] Erreur serveur :', error);
    return NextResponse.json(
      { error: error?.message || 'Erreur lors du traitement de la requête de génération de sujet.' },
      { status: 500 }
    );
  }
}
