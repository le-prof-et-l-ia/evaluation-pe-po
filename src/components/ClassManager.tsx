"use client";

import { useState, useEffect, useRef } from "react";
import { Users, UploadCloud, Edit2, Check, X, RefreshCw, Trash2, TrendingUp, ChevronDown, ChevronRight, Download, BarChart2, Loader2, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from "xlsx";
import { formatScore } from "@/lib/scoreUtils";

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      if (workbook.SheetNames.length === 0) throw new Error("Fichier vide");
      
      const newClasses: ClassData[] = [];
      
      // On lit chaque feuille comme une classe
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        if (json.length < 2) continue; // Pas de donnees

        // Trouver les colonnes (heuristique basique)
        const headers = json[0].map(h => String(h).toLowerCase().trim());
        let nameCol = headers.findIndex(h => h.includes("nom") || h.includes("name") || h.includes("élève") || h.includes("student"));
        let emailCol = headers.findIndex(h => h.includes("email") || h.includes("e-mail") || h.includes("mail") || h.includes("courriel"));
        
        // Fallback si pas de headers explicites : 1ere col texte = nom, colonne avec @ = email
        if (nameCol === -1) nameCol = 0;
        if (emailCol === -1) {
            for(let c=0; c<json[1].length; c++) {
                if (String(json[1][c]).includes('@')) {
                    emailCol = c; break;
                }
            }
        }
        
        const students: Student[] = [];
        for (let i = 1; i < json.length; i++) {
            const row = json[i];
            const name = row[nameCol] ? String(row[nameCol]).trim() : '';
            const email = (emailCol !== -1 && row[emailCol]) ? String(row[emailCol]).trim() : '';
            if (name) {
                students.push({ id: Date.now().toString() + '-' + Math.random().toString(36).substring(2,9), name, email });
            }
        }

        if (students.length > 0) {
            newClasses.push({ id: Date.now().toString() + '-' + Math.random().toString(36).substring(2,5), name: sheetName, students });
        }
      }

      if (newClasses.length > 0) {
          const res = await fetch("/api/classes", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "MERGE_CLASSES", classesToMerge: newClasses })
          });
          if (!res.ok) throw new Error("Erreur serveur lors de l'enregistrement");
          await fetchData();
          alert(`${newClasses.length} classe(s) importée(s) avec succès !`);
      } else {
          alert("Aucune donnée valide trouvée.");
      }
    } catch (err: any) {
      alert("Erreur d'import : " + err.message);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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
           <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3"><Users className="w-7 h-7 text-blue-600" /> Gestion des Classes</h2>
           <p className="text-sm text-slate-500 mt-1">Gérez vos étudiants et analysez leur historique de progression.</p>
        </div>
        <div className="flex gap-4">
           {isLoading && <Loader2 className="w-5 h-5 text-blue-500 animate-spin self-center" />}
           <button onClick={() => fetchData()} className="p-2 text-slate-400 hover:text-blue-600 transition-colors"><RefreshCw className="w-4 h-4"/></button>
           <label className={`cursor-pointer px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all ${importing ? "bg-slate-200 text-slate-500" : "bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-500/20"}`}>
             <Download className="w-4 h-4" /> {importing ? "Importation..." : "Importer Liste (Excel/CSV)"}
             <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} disabled={importing}/>
           </label>
        </div>
      </header>

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
