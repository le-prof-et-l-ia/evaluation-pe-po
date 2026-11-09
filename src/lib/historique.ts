/**
 * Corps JSON envoyé à POST /api/history, avec la section (PE ou PO) indiquée
 * explicitement sur chaque bilan.
 *
 * Sans ce champ, la route devinait la section d'après la présence d'une
 * transcription : or les bilans PE en ont une aussi (texte issu de l'OCR),
 * si bien qu'ils étaient rangés en « po ».
 */
export type SectionHistorique = 'pe' | 'po';

export function jsonHistorique(section: SectionHistorique, corps: Record<string, any>): string {
  if (corps && Array.isArray(corps.records)) {
    return JSON.stringify({ ...corps, records: corps.records.map((r: any) => ({ ...r, type: section })) });
  }
  return JSON.stringify({ ...corps, type: section });
}
