/**
 * Modification par l'enseignant d'un sujet généré, avant export ou impression.
 * Chaque fonction renvoie un nouveau sujet (aucune mutation) et garde la cohérence :
 * décompte de mots, texte support du questionnaire CE, total des points.
 */
import {
  countFrenchWords,
  bornesLongueur,
  texteSupportCe,
  type CeQuestion,
  type GeneratedDocument,
  type QuestionType,
  type SubjectGenerationResult,
} from '@/lib/subjectGeneratorService';

type ChampsDocument = Partial<Pick<GeneratedDocument, 'title' | 'source' | 'body' | 'viewpoint'>>;

/** Modifie un document (titre, source, texte) et recompte ses mots. */
export function modifierDocument(result: SubjectGenerationResult, index: number, champs: ChampsDocument): SubjectGenerationResult {
  const { min, max } = bornesLongueur(result.targetWordCount, result.minWordCount, result.maxWordCount);
  const documents = result.documents.map((d, i) => {
    if (i !== index) return d;
    const doc = { ...d, ...champs };
    doc.actualWordCount = countFrenchWords(doc.body);
    if (doc.texteOriginal) {
      doc.targetWordCount = doc.actualWordCount;
      doc.toleranceMet = true;
    } else {
      doc.toleranceMet = doc.actualWordCount >= min && doc.actualWordCount <= max;
    }
    return doc;
  });
  const suivant: SubjectGenerationResult = { ...result, documents };
  // Le questionnaire CE porte sur ces textes : son texte support suit les modifications.
  if (result.ceExam && documents.length > 0) {
    suivant.ceExam = {
      ...result.ceExam,
      articleTitle: documents[0].title,
      articleSource: documents[0].source,
      articleText: texteSupportCe(documents),
    };
  }
  return suivant;
}

/** Recalcule le nombre de questions, les numéros et le total des points. */
function recalculerCe(result: SubjectGenerationResult, questions: CeQuestion[]): SubjectGenerationResult {
  if (!result.ceExam) return result;
  const numerotees = questions.map((q, i) => ({ ...q, id: i + 1 }));
  return {
    ...result,
    ceExam: {
      ...result.ceExam,
      questions: numerotees,
      questionCount: numerotees.length,
      totalPoints: Number(numerotees.reduce((s, q) => s + (Number(q.points) || 0), 0).toFixed(2)),
    },
  };
}

/** Modifie les consignes générales du questionnaire CE. */
export function modifierConsignesCe(result: SubjectGenerationResult, generalInstructions: string): SubjectGenerationResult {
  if (!result.ceExam) return result;
  return { ...result, ceExam: { ...result.ceExam, generalInstructions } };
}

/** Modifie une question CE (énoncé, options, réponse, barème, points…). */
export function modifierQuestion(result: SubjectGenerationResult, index: number, champs: Partial<CeQuestion>): SubjectGenerationResult {
  if (!result.ceExam) return result;
  const questions = result.ceExam.questions.map((q, i) => (i === index ? { ...q, ...champs } : q));
  return recalculerCe(result, questions);
}

/** Supprime une question CE. */
export function supprimerQuestion(result: SubjectGenerationResult, index: number): SubjectGenerationResult {
  if (!result.ceExam) return result;
  return recalculerCe(result, result.ceExam.questions.filter((_, i) => i !== index));
}

/** Déplace une question CE d'un rang vers le haut (-1) ou vers le bas (+1). */
export function deplacerQuestion(result: SubjectGenerationResult, index: number, sens: -1 | 1): SubjectGenerationResult {
  if (!result.ceExam) return result;
  const cible = index + sens;
  const questions = [...result.ceExam.questions];
  if (cible < 0 || cible >= questions.length) return result;
  [questions[index], questions[cible]] = [questions[cible], questions[index]];
  return recalculerCe(result, questions);
}

/** Ajoute une question CE vierge du type choisi, à la fin du questionnaire. */
export function ajouterQuestion(result: SubjectGenerationResult, type: QuestionType): SubjectGenerationResult {
  if (!result.ceExam) return result;
  const nouvelle: CeQuestion = {
    id: result.ceExam.questions.length + 1,
    type,
    points: 2,
    question: '',
    gradingCriteria: '',
    cognitiveDomain: 'detaillee',
  };
  if (type === 'qcm') {
    nouvelle.options = ['A. ', 'B. ', 'C. '];
    nouvelle.correctAnswerIndex = 0;
  } else if (type === 'vrai_faux') {
    nouvelle.trueFalseAnswer = true;
    nouvelle.justificationText = '';
  } else {
    nouvelle.sampleAnswer = '';
  }
  return recalculerCe(result, [...result.ceExam.questions, nouvelle]);
}
