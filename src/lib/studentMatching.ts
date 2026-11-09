/**
 * Rapprochement automatique entre l'apprenant détecté par l'IA et les listes
 * de classes : d'abord par e-mail (fiable), puis par similarité de nom.
 *
 * Extrait de `page.tsx`. Fonction pure, testable isolément.
 */
export interface StudentMatch {
  classId: string;
  className: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
}

export function findMatchingStudent(
  detectedName: string | null, 
  detectedEmail: string | null, 
  classes: any[]
): { classId: string; className: string; studentId: string; studentName: string; studentEmail: string } | null {
  
  if (classes.length === 0) return null;

  // 1. Match by Email first (highest accuracy)
  if (detectedEmail) {
    const normEmail = detectedEmail.toLowerCase().trim();
    for (const c of classes) {
      const m = c.students.find((s: any) => s.email && s.email.toLowerCase().trim() === normEmail);
      if (m) {
        return {
          classId: c.id,
          className: c.name,
          studentId: m.id,
          studentName: m.name,
          studentEmail: m.email || detectedEmail
        };
      }
    }
  }

  // 2. Match by Name / Prénom if no email match was found
  if (detectedName) {
    const normDetected = detectedName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").trim();
    if (normDetected.length > 2) {
      const detectedWords = normDetected.split(/\s+/).filter((w: string) => w.length > 1);
      let matchedStudent: any = null;
      let matchedClass: any = null;
      let highestScore = 0;

      for (const c of classes) {
        for (const s of c.students) {
          const normStudent = s.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").trim();
          
          // Check exact match
          if (normStudent === normDetected) {
            matchedStudent = s;
            matchedClass = c;
            highestScore = 1.0;
            break;
          }

          // Word-based score
          const studentWords = normStudent.split(/\s+/).filter((w: string) => w.length > 1);
          let matchingWordsCount = 0;
          for (const word of detectedWords) {
            if (studentWords.includes(word)) {
              matchingWordsCount++;
            }
          }

          const maxWords = Math.max(detectedWords.length, studentWords.length);
          const score = maxWords > 0 ? matchingWordsCount / maxWords : 0;
          
          // Substring match fallback (for name/surname)
          const isSub = (normDetected.length > 3 && normStudent.includes(normDetected)) || 
                        (normStudent.length > 3 && normDetected.includes(normStudent));
          const finalScore = score > 0 ? score : (isSub ? 0.4 : 0);

          if (finalScore > 0.3 && finalScore > highestScore) {
            highestScore = finalScore;
            matchedStudent = s;
            matchedClass = c;
          }
        }
        if (highestScore === 1.0) break;
      }

      if (matchedStudent && matchedClass) {
        return {
          classId: matchedClass.id,
          className: matchedClass.name,
          studentId: matchedStudent.id,
          studentName: matchedStudent.name,
          studentEmail: matchedStudent.email || detectedEmail || ""
        };
      }
    }
  }

  return null;
}
