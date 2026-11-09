"use client";

import { useState, useEffect, useRef } from "react";
import { Users, UploadCloud, FileSpreadsheet, AlertTriangle, Edit2, Check, X, RefreshCw, Trash2, TrendingUp, ChevronDown, ChevronRight, Download, BarChart2, Loader2, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from "xlsx";
import { formatScore } from "@/lib/scoreUtils";
import { parseStudentSheet, type ImportedSheet } from "@/lib/classImport";
import Aide from "@/components/Aide";

export interface Student {
  id: string;
  name: string;
  email: string;
}

export interface ClassData {
  id: string;
  name: string;
  students: Student[];
}

export interface EvaluationRecord {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  classId: string | null;
  className: string | null;
  date: string;
  level: string;
  globalScore: number;
  criteriaScores: {
    realisation?: number;
    coherence?: number;
    sociolinguistique?: number;
    lexique?: number;
    morphosyntaxe?: number;
  };
}

export default function ClassManager() {
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [history, setHistory] = useState<EvaluationRecord[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingEmail, setEditingEmail] = useState<{ studentId: string; email: string } | null>(null);
  const [editingClassName, setEditingClassName] = useState<{ classId: string; name: string } | null>(null);
  
  const [importing, setImporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportedSheet[] | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const clsRes = await fetch("/api/classes");
      let classesData: ClassData[] = [];
      if (clsRes.ok) {
        classesData = await clsRes.json();
        setClasses(classesData);
      }
      const histRes = await fetch("/api/history");
      if (histRes.ok) setHistory(await histRes.json());
      
      if (classesData.length > 0 && !selectedClassId) {
        setSelectedClassId(classesData[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const openImport = () => {
    setImportPreview(null);
    setImportFileName("");
    setImportOpen(true);
  };

  const closeImport = () => {
    if (importing) return;
    setImportOpen(false);
    setImportPreview(null);
    setImportFileName("");
  };

  /** Lit le classeur ; un CSV est décodé en UTF-8 s'il en est, sinon en Windows-1252. */
  const readWorkbook = async (file: File) => {
    const data = await file.arrayBuffer();
    if (/\.(csv|txt)$/i.test(file.name)) {
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
        return XLSX.read(text.replace(/^\uFEFF/, ""), { type: "string" });
      } catch {
        /* pas de l'UTF-8 : lecture par défaut (Windows-1252) */
      }
    }
    return XLSX.read(data);
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const workbook = await readWorkbook(file);
      // Un CSV n'a pas d'onglet nommé : la classe prend alors le nom du fichier.
      const isCsv = /\.(csv|txt)$/i.test(file.name);
      const sheets = workbook.SheetNames.map(sheetName =>
        parseStudentSheet(
          isCsv && workbook.SheetNames.length === 1 ? file.name.replace(/\.[^.]+$/, "") : sheetName,
          XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" }) as unknown[][]
        )
      );
      setImportPreview(sheets);
      setImportFileName(file.name);
    } catch (err: any) {
      alert("Impossible de lire ce fichier : " + (err?.message || err));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleConfirmImport = async () => {
    const sheets = (importPreview || []).filter(s => s.students.length > 0);
    if (sheets.length === 0) return;
    if (sheets.some(s => !s.sheetName.trim())) return alert("Donnez un nom à chaque classe avant d'importer.");
    setImporting(true);
    try {
      const newClasses: ClassData[] = sheets.map(s => ({
        id: Date.now().toString() + '-' + Math.random().toString(36).substring(2, 5),
        name: s.sheetName.trim(),
        students: s.students.map(st => ({ id: Date.now().toString() + '-' + Math.random().toString(36).substring(2, 9), name: st.name, email: st.email })),
      }));
      const res = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "MERGE_CLASSES", classesToMerge: newClasses })
      });
      if (!res.ok) throw new Error("Erreur serveur lors de l'enregistrement");
      await fetchData();
      setImportOpen(false);
      setImportPreview(null);
      const total = newClasses.reduce((n, c) => n + c.students.length, 0);
      alert(`${total} élève(s) importé(s) dans ${newClasses.length} classe(s).`);
    } catch (err: any) {
      alert("Erreur d'import : " + err.message);
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const exemple1 = XLSX.utils.aoa_to_sheet([
      ["Prénom", "Nom", "E-mail"],
      ["Léa", "Durand", "lea.durand@exemple.fr"],
      ["Minh Anh", "Nguyen", "minhanh.nguyen@exemple.fr"],
      ["Paul", "Martin", ""],
    ]);
    const exemple2 = XLSX.utils.aoa_to_sheet([
      ["Prénom", "Nom", "E-mail"],
      ["Sofia", "Rossi", "sofia.rossi@exemple.fr"],
    ]);
    exemple1["!cols"] = exemple2["!cols"] = [{ wch: 16 }, { wch: 18 }, { wch: 32 }];
    XLSX.utils.book_append_sheet(wb, exemple1, "B2 groupe 1");
    XLSX.utils.book_append_sheet(wb, exemple2, "B1 groupe 2");
    XLSX.writeFile(wb, "modele-liste-eleves.xlsx");
  };

  const handleSaveEmail = async (classId: string, studentId: string) => {
    if (!editingEmail) return;
    try {
      await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "UPDATE_STUDENT_EMAIL", studentEmailUpdates: { classId, studentId, email: editingEmail.email } })
      });
      setClasses(classes.map(c => {
         if (c.id === classId) {
             return { ...c, students: c.students.map(s => s.id === studentId ? { ...s, email: editingEmail.email } : s) };
         }
         return c;
      }));
    } catch (e) {
      alert("Erreur lors de la sauvegarde.");
    } finally {
      setEditingEmail(null);
    }
  };

  const handleSaveClassName = async (classId: string) => {
    if (!editingClassName || !editingClassName.name.trim()) return;
    try {
      await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "UPDATE_CLASS_NAME", classId, newName: editingClassName.name })
      });
      setClasses(classes.map(c => c.id === classId ? { ...c, name: editingClassName.name } : c));
    } catch (e) {
      alert("Erreur lors de la sauvegarde.");
    } finally {
      setEditingClassName(null);
    }
  };

  const handleDeleteClass = async (classId: string) => {
      if (!confirm("Voulez-vous vraiment supprimer cette classe ? L'historique des notes sera conservé.")) return;
      try {
          await fetch("/api/classes", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "DELETE_CLASS", classId })
          });
          setClasses(classes.filter(c => c.id !== classId));
          if (selectedClassId === classId) setSelectedClassId(classes[0]?.id || null);
      } catch (e) {
          alert("Erreur de suppression");
      }
  };

  const selectedClass = classes.find(c => c.id === selectedClassId);
  const classHistory = history.filter(h => h.classId === selectedClassId);

  // Stats calculate
  const avgGlobalScore = classHistory.length > 0 ? (classHistory.reduce((acc, h) => acc + h.globalScore, 0) / classHistory.length).toFixed(1) : 0;
  const B2Count = classHistory.filter(h => h.level === "B2").length;
  const B1Count = classHistory.filter(h => h.level === "B1").length;

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      <header className="flex justify-between items-center p-8 pb-4 border-b border-slate-200 bg-white shadow-sm z-10">
        <div>
           <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3"><Users className="w-7 h-7 text-blue-600" /> Gestion des Classes <Aide cle="classesUtilite" taille={18} /></h2>
           <p className="text-sm text-slate-500 mt-1">Gérez vos étudiants et analysez leur historique de progression.</p>
        </div>
        <div className="flex gap-3 items-center">
           {isLoading && <Loader2 className="w-5 h-5 text-blue-500 animate-spin self-center" />}
           <button onClick={() => fetchData()} title="Recharger les classes" aria-label="Recharger les classes" className="p-2 text-slate-400 hover:text-blue-600 transition-colors"><RefreshCw className="w-4 h-4"/></button>
           <button onClick={openImport} className="px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-500/20">
             <Download className="w-4 h-4" /> Importer une liste (Excel/CSV)
           </button>
           <Aide cle="importClasses" taille={18} />
        </div>
      </header>

      {importOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={closeImport}>
          <div role="dialog" aria-modal="true" aria-labelledby="import-titre" className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 id="import-titre" className="text-xl font-black text-slate-800 flex items-center gap-3"><FileSpreadsheet className="w-6 h-6 text-blue-600" /> Importer une liste d'élèves</h3>
              <button onClick={closeImport} aria-label="Fermer" className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <div className="overflow-y-auto p-6 space-y-6">
              {!importPreview ? (
                <>
                  <section className="space-y-3 text-sm text-slate-600">
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Format attendu</h4>
                    <p>Un fichier Excel (.xlsx, .xls), LibreOffice ou CSV. <strong>Chaque onglet devient une classe</strong>, qui porte le nom de l'onglet (par exemple « B2 groupe 1 ») ; un fichier CSV donne une seule classe, qui porte le nom du fichier. Vous pourrez renommer les classes dans l'aperçu.</p>
                    <div className="overflow-x-auto">
                      <table className="text-xs border border-slate-200 rounded-xl overflow-hidden">
                        <thead className="bg-slate-100 text-slate-500">
                          <tr><th className="px-2 py-1 border-r border-slate-200"></th><th className="px-4 py-1 border-r border-slate-200">A</th><th className="px-4 py-1 border-r border-slate-200">B</th><th className="px-4 py-1">C</th></tr>
                        </thead>
                        <tbody>
                          <tr className="font-bold text-slate-800"><td className="px-2 py-1 bg-slate-100 text-slate-500 border-r border-slate-200">1</td><td className="px-4 py-1 border-r border-slate-100">Prénom</td><td className="px-4 py-1 border-r border-slate-100">Nom</td><td className="px-4 py-1">E-mail</td></tr>
                          <tr><td className="px-2 py-1 bg-slate-100 text-slate-500 border-r border-slate-200">2</td><td className="px-4 py-1 border-r border-slate-100">Léa</td><td className="px-4 py-1 border-r border-slate-100">Durand</td><td className="px-4 py-1">lea.durand@exemple.fr</td></tr>
                          <tr><td className="px-2 py-1 bg-slate-100 text-slate-500 border-r border-slate-200">3</td><td className="px-4 py-1 border-r border-slate-100">Paul</td><td className="px-4 py-1 border-r border-slate-100">Martin</td><td className="px-4 py-1 text-slate-400 italic">(vide)</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <ul className="list-disc pl-5 space-y-1">
                      <li><strong>Ligne 1 : les titres des colonnes.</strong> L'ordre des colonnes n'a pas d'importance : elles sont reconnues par leur titre.</li>
                      <li><strong>Nom de l'élève</strong> : soit deux colonnes « Prénom » et « Nom » (elles sont réunies), soit une seule colonne « Nom complet » (ou « Élève », « Étudiant », « Apprenant »).</li>
                      <li><strong>E-mail</strong> (facultatif) : une colonne « E-mail », « Mail » ou « Courriel ». Il sert à reconnaître l'élève sur sa copie et à lui envoyer son bilan.</li>
                      <li>Une ligne par élève ; les lignes vides et les doublons sont ignorés. Les autres colonnes (numéro, date de naissance…) sont ignorées.</li>
                      <li>Si une classe du même nom existe déjà, les nouveaux élèves y sont <strong>ajoutés</strong> et les élèves déjà présents (même nom ou même e-mail) sont mis à jour. Rien n'est supprimé.</li>
                    </ul>
                  </section>
                  <div className="flex flex-wrap gap-3">
                    <label className="cursor-pointer px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-500/20">
                      <UploadCloud className="w-4 h-4" /> Choisir un fichier…
                      <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx,.xls,.ods,.csv" onChange={handleFileSelected} />
                    </label>
                    <button onClick={downloadTemplate} className="px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50">
                      <Download className="w-4 h-4" /> Télécharger un modèle Excel
                    </button>
                  </div>
                </>
              ) : (
                <section className="space-y-4">
                  <p className="text-sm text-slate-600">Aperçu de <strong>{importFileName}</strong>. Vérifiez que les noms sont bien reconnus avant de confirmer : rien n'est encore enregistré.</p>
                  {importPreview.map((sheet, idx) => {
                    const existing = classes.find(c => c.name === sheet.sheetName.trim());
                    return (
                      <div key={idx} className={`rounded-2xl border p-4 space-y-2 ${sheet.students.length === 0 ? "border-slate-200 bg-slate-50 opacity-70" : "border-blue-100 bg-blue-50/40"}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          {sheet.students.length > 0 ? (
                            <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
                              Classe :
                              <input
                                value={sheet.sheetName}
                                onChange={e => setImportPreview(importPreview.map((s, i) => i === idx ? { ...s, sheetName: e.target.value } : s))}
                                className="text-sm font-bold text-slate-800 bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-blue-400 min-w-[200px]"
                              />
                            </label>
                          ) : (
                            <p className="font-bold text-slate-800">{sheet.sheetName}</p>
                          )}
                          <span className="text-xs font-bold text-slate-500">
                            {sheet.students.length} élève(s) · {sheet.students.length === 0 ? "onglet ignoré" : existing ? "classe existante : élèves ajoutés ou mis à jour" : "nouvelle classe"}
                          </span>
                        </div>
                        {sheet.columnsDescription && <p className="text-xs text-slate-500">Colonnes reconnues : {sheet.columnsDescription}</p>}
                        {sheet.students.length > 0 && (
                          <p className="text-xs text-slate-600">
                            {sheet.students.slice(0, 5).map(s => s.email ? `${s.name} (${s.email})` : s.name).join(" · ")}
                            {sheet.students.length > 5 && ` · … et ${sheet.students.length - 5} autre(s)`}
                          </p>
                        )}
                        {sheet.warnings.map((w, i) => (
                          <p key={i} className="text-xs text-amber-700 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {w}</p>
                        ))}
                      </div>
                    );
                  })}
                </section>
              )}
            </div>

            {importPreview && (
              <div className="flex flex-wrap justify-end gap-3 p-6 border-t border-slate-100">
                <button onClick={() => setImportPreview(null)} disabled={importing} className="px-5 py-2.5 text-slate-500 hover:text-slate-700 font-medium">Choisir un autre fichier</button>
                <button
                  onClick={handleConfirmImport}
                  disabled={importing || !importPreview.some(s => s.students.length > 0)}
                  className="px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Importer {importPreview.reduce((n, s) => n + s.students.length, 0)} élève(s)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Classes List Sidebar (Inner) */}
        <aside className="w-64 bg-white border-r border-slate-200 overflow-y-auto hidden md:block">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-2">Vos Classes ({classes.length})</h3>
          </div>
          <div className="p-2">
            {classes.length === 0 && !isLoading && <p className="text-sm text-slate-500 italic p-4 text-center">Aucune classe pour le moment.</p>}
            {classes.map(c => (
               <button 
                 key={c.id} 
                 onClick={() => setSelectedClassId(c.id)}
                 className={`w-full flex items-center justify-between p-3 rounded-xl transition-all mb-1 ${selectedClassId === c.id ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
               >
                 <span className="truncate">{c.name}</span>
                 <span className={`text-xs px-2 py-0.5 rounded-full ${selectedClassId === c.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>{c.students.length}</span>
               </button>
            ))}
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-8 relative">
           {selectedClass ? (
              <div className="max-w-5xl mx-auto space-y-8">
                 {/* Class Header */}
                 <div className="flex justify-between items-end">
                    <div>
                       {editingClassName?.classId === selectedClass.id ? (
                          <div className="flex items-center gap-3">
                             <input 
                               autoFocus
                               className="text-3xl font-black text-slate-800 border-b-2 border-blue-500 outline-none bg-transparent"
                               value={editingClassName.name}
                               onChange={e => setEditingClassName({ ...editingClassName, name: e.target.value })}
                               onKeyDown={e => e.key === 'Enter' && handleSaveClassName(selectedClass.id)}
                             />
                             <button onClick={() => handleSaveClassName(selectedClass.id)} className="text-emerald-500 hover:text-emerald-600"><Check className="w-6 h-6"/></button>
                             <button onClick={() => setEditingClassName(null)} className="text-slate-400 hover:text-red-500"><X className="w-6 h-6"/></button>
                          </div>
                       ) : (
                          <div className="flex items-center gap-3 group">
                             <h1 className="text-3xl font-black text-slate-800">{selectedClass.name}</h1>
                             <button onClick={() => setEditingClassName({ classId: selectedClass.id, name: selectedClass.name })} className="opacity-0 group-hover:opacity-100 p-1 text-blue-500 hover:bg-blue-50 rounded transition-all"><Edit2 className="w-5 h-5"/></button>
                          </div>
                       )}
                       <p className="text-slate-500 font-medium mt-1">{selectedClass.students.length} étudiants enregistrés</p>
                    </div>
                    <button onClick={() => handleDeleteClass(selectedClass.id)} className="px-4 py-2 border border-red-200 text-red-600 rounded-xl text-sm font-bold hover:bg-red-50 flex items-center gap-2 transition-colors"><Trash2 className="w-4 h-4"/> Supprimer Classe</button>
                 </div>

                 {/* Stats Dashboard */}
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 justify-between flex rounded-3xl border border-slate-200 shadow-sm">
                       <div>
                         <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Moyenne Globale</p>
                         <h3 className="text-4xl font-black text-slate-800 mt-2">{formatScore(avgGlobalScore)}/25</h3>
                       </div>
                       <div className="bg-indigo-50 w-12 h-12 rounded-2xl flex items-center justify-center"><BarChart2 className="w-6 h-6 text-indigo-500" /></div>
                    </div>
                    <div className="bg-white p-6 justify-between flex rounded-3xl border border-slate-200 shadow-sm">
                       <div>
                         <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Évaluations B2</p>
                         <h3 className="text-4xl font-black text-slate-800 mt-2">{B2Count}</h3>
                       </div>
                       <div className="bg-sky-50 w-12 h-12 rounded-2xl flex items-center justify-center"><Check className="w-6 h-6 text-sky-500" /></div>
                    </div>
                    <div className="bg-white p-6 justify-between flex rounded-3xl border border-slate-200 shadow-sm">
                       <div>
                         <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Évaluations B1</p>
                         <h3 className="text-4xl font-black text-slate-800 mt-2">{B1Count}</h3>
                       </div>
                       <div className="bg-amber-50 w-12 h-12 rounded-2xl flex items-center justify-center"><Check className="w-6 h-6 text-amber-500" /></div>
                    </div>
                 </div>

                 {/* Students Table */}
                 <div className="bg-white border text-left border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                    <table className="w-full text-sm text-slate-600">
                       <thead className="bg-slate-50/50 border-b border-slate-200 text-slate-400 text-xs font-bold uppercase tracking-widest">
                          <tr>
                             <th className="px-6 py-4">Nom de l'étudiant</th>
                             <th className="px-6 py-4">Adresse Email</th>
                             <th className="px-6 py-4 text-center">Historique</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100">
                          {selectedClass.students.map(student => {
                             const historyCount = classHistory.filter(h => h.studentId === student.id || h.studentName.toLowerCase().includes(student.name.split(' ')[0].toLowerCase())).length;
                             return (
                             <tr key={student.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-6 py-4 font-bold text-slate-800">{student.name}</td>
                                <td className="px-6 py-4">
                                   {editingEmail?.studentId === student.id ? (
                                      <div className="flex items-center gap-2">
                                         <input 
                                           autoFocus
                                           className="border-b-2 border-blue-500 outline-none bg-transparent px-1 min-w-[200px]" 
                                           value={editingEmail.email} 
                                           onChange={e => setEditingEmail({ ...editingEmail, email: e.target.value })}
                                           onKeyDown={e => e.key === 'Enter' && handleSaveEmail(selectedClass.id, student.id)}
                                         />
                                         <button onClick={() => handleSaveEmail(selectedClass.id, student.id)} className="text-emerald-500 hover:text-emerald-600"><Check className="w-4 h-4"/></button>
                                         <button onClick={() => setEditingEmail(null)} className="text-slate-400 hover:text-red-500"><X className="w-4 h-4"/></button>
                                      </div>
                                   ) : (
                                       <div className="flex items-center gap-2 group">
                                          <span className={student.email ? "text-slate-600" : "text-rose-400 font-medium italic"}>{student.email || "Non défini"}</span>
                                          <button onClick={() => setEditingEmail({ studentId: student.id, email: student.email })} className="opacity-0 group-hover:opacity-100 p-1 text-blue-500 hover:bg-blue-50 rounded transition-all"><Edit2 className="w-3.5 h-3.5"/></button>
                                       </div>
                                   )}
                                </td>
                                <td className="px-6 py-4 text-center">
                                   <div className="flex justify-center items-center gap-2 group/btn">
                                     <div className="inline-flex items-center justify-center px-3 py-1 bg-slate-100 rounded-full font-bold text-slate-500">
                                        {historyCount} <span className="text-[10px] ml-1 uppercase">éval.</span>
                                     </div>
                                   </div>
                                </td>
                             </tr>
                          )})}
                       </tbody>
                    </table>
                 </div>
              </div>
           ) : (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
                 <Users className="w-20 h-20 text-slate-300 mb-6" />
                 <h3 className="text-2xl font-bold text-slate-700">Aucune classe sélectionnée</h3>
                 <p className="text-slate-500 mt-2 max-w-sm">Sélectionnez une classe dans le panneau gauche ou importez un nouveau fichier de classe Excel/CSV pour commencer.</p>
              </div>
           )}
        </div>
      </div>
    </div>
  );
}
