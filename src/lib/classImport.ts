/**
 * Lecture d'une liste d'élèves exportée d'un tableur (Excel, LibreOffice, CSV).
 *
 * Règles (expliquées à l'utilisateur dans la fenêtre d'import) :
 * - chaque onglet du classeur devient une classe, qui prend le nom de l'onglet ;
 * - la première ligne peut contenir des titres de colonnes ; elle n'est ignorée
 *   que si elle en contient vraiment ;
 * - le nom de l'élève est pris dans une colonne « Nom complet » / « Élève », ou
 *   reconstitué à partir de deux colonnes « Prénom » et « Nom » ;
 * - l'e-mail est facultatif.
 *
 * Fonction pure (sans dépendance au navigateur), testable isolément.
 */

export interface ImportedStudent {
  name: string;
  email: string;
}

export interface ImportedSheet {
  /** Nom de l'onglet, qui devient le nom de la classe. */
  sheetName: string;
  students: ImportedStudent[];
  /** Description lisible des colonnes reconnues. */
  columnsDescription: string;
  /** Avertissements à montrer avant l'import. */
  warnings: string[];
}

const normalize = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

type HeaderKind = "email" | "full" | "first" | "last" | "other";

/** Reconnaît le rôle d'un titre de colonne (déjà normalisé : minuscules, sans accents). */
function classifyHeader(h: string): HeaderKind {
  if (!h) return "other";
  if (h.includes("mail") || h.includes("courriel") || h.includes("adresse electronique")) return "email";
  if (/\bnoms?\s*(et|\/|-|,)?\s*prenoms?\b|\bprenoms?\s*(et|\/|-|,)?\s*noms?\b|nom complet|full name/.test(h)) return "full";
  if (/\bprenoms?\b|first ?name/.test(h)) return "first";
  if (/^noms?\b|nom de famille|last ?name|surname|family name/.test(h)) return "last";
  if (/\b(eleves?|etudiante?s?|apprenante?s?|candidate?s?|students?|names?|identite)\b/.test(h)) return "full";
  return "other";
}

const cell = (row: unknown[], col: number) =>
  col >= 0 && row[col] !== undefined && row[col] !== null ? String(row[col]).trim() : "";

export function parseStudentSheet(sheetName: string, rows: unknown[][]): ImportedSheet {
  const warnings: string[] = [];
  const nonEmpty = rows.filter((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== ""));
  if (nonEmpty.length === 0) {
    return { sheetName, students: [], columnsDescription: "", warnings: ["Onglet vide : ignoré."] };
  }

  const kinds = nonEmpty[0].map((h) => classifyHeader(normalize(h)));
  const firstCol = kinds.indexOf("first");
  const lastCol = kinds.indexOf("last");
  const fullCol = kinds.indexOf("full");
  const emailHeaderCol = kinds.indexOf("email");
  const hasHeaders = firstCol !== -1 || lastCol !== -1 || fullCol !== -1 || emailHeaderCol !== -1;
  const dataRows = hasHeaders ? nonEmpty.slice(1) : nonEmpty;

  // Colonne e-mail : titre explicite, sinon première colonne contenant un « @ ».
  let emailCol = emailHeaderCol;
  if (emailCol === -1) {
    const sample = dataRows.find((r) => r.some((c) => String(c ?? "").includes("@")));
    if (sample) emailCol = sample.findIndex((c) => String(c ?? "").includes("@"));
  }

  let mode: "full" | "split" | "single";
  let singleCol = -1;
  let columnsDescription: string;
  const label = (i: number) => (hasHeaders ? `« ${String(nonEmpty[0][i]).trim()} »` : `colonne ${String.fromCharCode(65 + i)}`);

  if (firstCol !== -1 && lastCol !== -1) {
    mode = "split";
    columnsDescription = `Prénom : ${label(firstCol)} + Nom : ${label(lastCol)}`;
  } else if (fullCol !== -1) {
    mode = "full";
    columnsDescription = `Nom de l'élève : ${label(fullCol)}`;
  } else {
    mode = "single";
    singleCol = firstCol !== -1 ? firstCol : lastCol !== -1 ? lastCol : 0;
    if (singleCol === emailCol) singleCol = emailCol === 0 ? 1 : 0;
    columnsDescription = `Nom de l'élève : ${label(singleCol)}`;
    if (firstCol !== -1) warnings.push("Seule une colonne « Prénom » a été trouvée : les élèves seront enregistrés par leur seul prénom.");
    if (!hasHeaders) warnings.push("Aucune ligne de titres reconnue : la première ligne est considérée comme un élève.");
  }
  columnsDescription += emailCol !== -1 ? ` · E-mail : ${label(emailCol)}` : " · Aucune colonne d'e-mail";

  const students: ImportedStudent[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  for (const row of dataRows) {
    let name: string;
    if (mode === "full") name = cell(row, fullCol);
    else if (mode === "split") name = [cell(row, firstCol), cell(row, lastCol)].filter(Boolean).join(" ");
    else name = cell(row, singleCol);
    name = name.replace(/\s+/g, " ");
    if (!name) continue;
    const email = cell(row, emailCol);
    const key = normalize(name) + "|" + email.toLowerCase();
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    students.push({ name, email: email.includes("@") ? email : "" });
  }

  if (duplicates > 0) warnings.push(`${duplicates} ligne(s) en double ignorée(s).`);
  const withoutEmail = students.filter((s) => !s.email).length;
  if (emailCol !== -1 && withoutEmail > 0) warnings.push(`${withoutEmail} élève(s) sans adresse e-mail valide.`);

  return { sheetName, students, columnsDescription, warnings };
}
