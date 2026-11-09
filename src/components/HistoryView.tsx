"use client";

import Aide from "@/components/Aide";
import { useState, useEffect } from "react";
import { FileText, Trash2, Search, Calendar, Award, User, RefreshCw, ChevronRight, Download, Brain, AlertTriangle, Upload, Pencil, Check, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { parseMultiplePEMarkdowns } from "@/lib/markdownGenerator";
import { parseExternalSupervisionResults, escapeControlCharactersInStrings } from "@/lib/externalSupervision";
import { formatScore } from "@/lib/scoreUtils";

export interface EvaluationRecord {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  classId: string | null;
  className: string | null;
  date: string;
  level: string;
  type?: 'pe' | 'po';
  globalScore: number;
  criteriaScores: any;
  maxScore?: number;
  examType?: string;
}

interface Props {
  onSelectRecord: (recordId: string) => Promise<void>;
}

export default function HistoryView({ onSelectRecord }: Props) {
  const [records, setRecords] = useState<EvaluationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterLevel, setFilterLevel] = useState<string>("ALL");
  const [filterType, setFilterType] = useState<string>("ALL");
  const [loadingRecordId, setLoadingRecordId] = useState<string | null>(null);
  const [unsyncedItems, setUnsyncedItems] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [isSavingName, setIsSavingName] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleStartEdit = (record: EvaluationRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingRecordId(record.id);
    setEditingName(record.studentName || "");
  };

  const handleCancelEdit = (e?: React.SyntheticEvent) => {
    if (e) e.stopPropagation();
    setEditingRecordId(null);
    setEditingName("");
  };

  const handleSaveName = async (id: string, e?: React.SyntheticEvent) => {
    if (e) e.stopPropagation();
    if (!editingName.trim()) return;
    setIsSavingName(true);
    try {
      const res = await fetch("/api/history", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, studentName: editingName.trim() }),
      });
      if (res.ok) {
        setRecords(prev => prev.map(r => r.id === id ? { ...r, studentName: editingName.trim() } : r));
        setEditingRecordId(null);
        setEditingName("");
      } else {
        const err = await res.json();
        alert("Erreur lors de la modification du nom : " + (err.error || "erreur inconnue"));
      }
    } catch (err: any) {
      alert("Erreur réseau : " + err.message);
    } finally {
      setIsSavingName(false);
    }
  };

  const checkUnsyncedItems = (currentRecords: EvaluationRecord[]) => {
    try {
      const storedReviews = localStorage.getItem("delf_pending_reviews");
      if (!storedReviews) {
        setUnsyncedItems([]);
        return;
      }
      const parsed = JSON.parse(storedReviews);
      if (!Array.isArray(parsed)) return;

      const recordIds = new Set(currentRecords.map(r => r.id));
      const recordFiles = new Set(currentRecords.filter(r => (r as any).file).map(r => (r as any).file));

      const missing = parsed.filter((item: any) => {
        if (!item || item.status !== 'success' || item.isOcrOnly) return false;
        if (item.id && recordIds.has(item.id)) return false;
        if (item.file && recordFiles.has(item.file)) return false;
        return true;
      });

      setUnsyncedItems(missing);
    } catch (e) {
      console.error("Erreur vérification copies non synchronisées:", e);
    }
  };

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/history");
      if (res.ok) {
        const data = await res.json();
        // Trier du plus récent au plus ancien
        data.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setRecords(data);
        checkUnsyncedItems(data);
      }
    } catch (e) {
      console.error("Erreur lors de la récupération de l'historique:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncPending = async () => {
    if (unsyncedItems.length === 0) return;
    setIsSyncing(true);
    try {
      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: unsyncedItems })
      });
      if (res.ok) {
        setUnsyncedItems([]);
        await fetchHistory();
      } else {
        alert("Erreur lors de la synchronisation des évaluations.");
      }
    } catch (e: any) {
      alert("Erreur : " + e.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleImportFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsLoading(true);
    const allParsed: any[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const content = await file.text();

        // 1. Markdown parser
        try {
          const mdList = parseMultiplePEMarkdowns(content);
          if (mdList && mdList.length > 0) {
            allParsed.push(...mdList);
            continue;
          }
        } catch {}

        // 2. External supervision parser
        try {
          const supList = parseExternalSupervisionResults(content);
          if (supList && supList.length > 0) {
            const extracted = supList.map(item => {
              const ev = item.evaluation || item;
              if (item.comparisonNotes) ev._arbiterNotes = item.comparisonNotes;
              return ev;
            });
            allParsed.push(...extracted);
            continue;
          }
        } catch {}

        // 3. Direct JSON
        try {
          const jsonParsed = JSON.parse(escapeControlCharactersInStrings(content));
          const list = Array.isArray(jsonParsed) ? jsonParsed : [jsonParsed];
          allParsed.push(...list);
        } catch {}
      }

      const validRecords = allParsed.filter(p => p && typeof p === 'object' && (p.criteriaScores || p.justifications || p.globalScore !== undefined));
      if (validRecords.length === 0) {
        alert("Aucun bilan d'évaluation valide (.json ou .md) n'a pu être extrait des fichiers sélectionnés.");
        return;
      }

      const itemsToSave = validRecords.map(r => ({
        ...r,
        subject: r.subject || 'Sujet',
        // Pas de niveau inventé : s'il manque, il reste vide (« Non précisé »).
        level: r.level || ''
      }));

      // Un bilan importé qui porte le même identifiant qu'un bilan déjà présent le remplace.
      const idsExistants = new Set(records.map(r => r.id));
      const nbRemplaces = itemsToSave.filter((r: any) => r.id && idsExistants.has(r.id)).length;
      if (nbRemplaces > 0) {
        const ok = confirm(
          `${nbRemplaces} bilan${nbRemplaces > 1 ? 's' : ''} du fichier existe${nbRemplaces > 1 ? 'nt' : ''} déjà dans l'historique ` +
          `et ${nbRemplaces > 1 ? 'seront remplacés' : 'sera remplacé'} par la version importée (les modifications faites depuis seront perdues).\n\nContinuer l'import ?`
        );
        if (!ok) return;
      }

      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: itemsToSave })
      });

      if (!res.ok) throw new Error("Erreur serveur lors de la sauvegarde.");
      const data = await res.json();
      alert(`Succès ! ${data.count || itemsToSave.length} évaluation(s) importée(s) et ajoutée(s) à l'historique.`);
      await fetchHistory();
    } catch (err: any) {
      alert("Erreur lors de l'import : " + err.message);
    } finally {
      setIsLoading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette évaluation de l'historique ?")) return;

    try {
      const res = await fetch(`/api/history?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setRecords(prev => prev.filter(r => r.id !== id));
      } else {
        alert("Impossible de supprimer l'évaluation.");
      }
    } catch (err) {
      console.error(err);
      alert("Une erreur est survenue lors de la suppression.");
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer TOUTES les évaluations de l'historique ? Cette action enverra les fichiers vers la corbeille de votre ordinateur.")) return;

    setIsLoading(true);
    try {
      const res = await fetch("/api/history?all=true", {
        method: "DELETE",
      });
      if (res.ok) {
        setRecords([]);
      } else {
        alert("Impossible de supprimer tout l'historique.");
      }
    } catch (err) {
      console.error(err);
      alert("Une erreur est survenue lors de la suppression de tout l'historique.");
    } finally {
      setIsLoading(false);
    }
  };


  const handleLoadRecord = async (id: string) => {
    setLoadingRecordId(id);
    try {
      await onSelectRecord(id);
    } catch (err: any) {
      alert("Erreur lors du chargement de l'évaluation : " + err.message);
    } finally {
      setLoadingRecordId(null);
    }
  };

  const TYPES_EPREUVE: Record<string, string> = {
    dictee: "Dictée", traduction: "Traduction", grammaire: "Grammaire", interpretation: "Interprétation", composition: "Composition",
  };
  const typesPresents = Object.keys(TYPES_EPREUVE).filter(t => records.some(r => r.examType === t));

  const filteredRecords = records.filter(r => {
    const recordType = r.type || 'pe';
    const matchType = filterType === 'ALL' || recordType === filterType;
    const matchSearch = 
      r.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.studentEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.className && r.className.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchLevel = filterLevel === "ALL"
      || (filterLevel.startsWith("type:") ? r.examType === filterLevel.slice(5) : r.level === filterLevel);

    return matchType && matchSearch && matchLevel;
  });

  return (
    <div className="flex-1 overflow-y-auto p-8 relative">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
              <FileText className="w-8 h-8 text-blue-600" />
              Historique des évaluations
            </h1>
            <p className="text-slate-500 font-medium mt-1">Consultez, analysez et rechargez les bilans d'évaluation déjà réalisés.</p>
          </div>
          <div className="flex gap-2">
            <label 
              className="px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 rounded-xl transition-all cursor-pointer font-bold text-xs flex items-center gap-1.5 shadow-sm"
              title="Importer des bilans sauvegardés au format .md, .json ou .txt"
            >
              <Upload className="w-4 h-4" />
              Importer (.md, .json)
              <input
                type="file"
                accept=".json,.md,.txt"
                multiple
                className="hidden"
                onChange={handleImportFiles}
              />
            </label>
            <Aide cle="c_histImporter" taille={16} className="self-center" />
            {records.length > 0 && (
              <button 
                onClick={handleDeleteAll} 
                disabled={isLoading}
                className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl transition-all disabled:opacity-50 cursor-pointer font-bold text-xs flex items-center gap-1.5"
                title="Tout supprimer"
              >
                <Trash2 className="w-4 h-4" />
                Tout supprimer
              </button>
            )}
            {records.length > 0 && <Aide cle="c_histSupprimer" taille={16} className="self-center" />}
            <button 
              onClick={fetchHistory} 
              disabled={isLoading}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
              title="Actualiser la liste"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Unsynced Items Banner */}
        {unsyncedItems.length > 0 && (
          <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-3xl flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-indigo-900">
                  {unsyncedItems.length} évaluation{unsyncedItems.length > 1 ? 's' : ''} en attente de synchronisation
                </h4>
                <p className="text-xs text-indigo-600 font-medium">
                  Des copies évaluées récemment dans votre lot actif ne sont pas encore enregistrées dans l'historique permanent.
                </p>
              </div>
            </div>
            <button
              onClick={handleSyncPending}
              disabled={isSyncing}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSyncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Synchroniser maintenant
            </button>
            <Aide cle="c_histSync" taille={16} />
          </div>
        )}

        {/* Filters */}
        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between flex-wrap">
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Rechercher par élève, email, classe..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-11 pr-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 rounded-2xl w-full text-sm outline-none transition-all focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          
          <div className="flex items-center gap-4 flex-wrap">
            {/* Filter Épreuve */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Épreuve :</span>
              <div className="flex p-0.5 bg-slate-100 rounded-xl border border-slate-200">
                <button 
                  onClick={() => setFilterType("ALL")} 
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${filterType === 'ALL' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-blue-700'}`}
                >
                  Toutes
                </button>
                <button 
                  onClick={() => setFilterType("pe")} 
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${filterType === 'pe' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-indigo-700'}`}
                >
                  ✍️ PE
                </button>
                <button 
                  onClick={() => setFilterType("po")} 
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${filterType === 'po' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-emerald-700'}`}
                >
                  🎙️ PO
                </button>
              </div>
            </div>

            {/* Filter Niveau */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Niveau :</span>
              <div className="flex p-0.5 bg-slate-100 rounded-xl border border-slate-200">
                <button 
                  onClick={() => setFilterLevel("ALL")} 
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${filterLevel === 'ALL' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-blue-700'}`}
                >
                  Tous
                </button>
                <button 
                  onClick={() => setFilterLevel("B1")} 
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${filterLevel === 'B1' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-blue-700'}`}
                >
                  DELF B1
                </button>
                <button 
                  onClick={() => setFilterLevel("B2")} 
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${filterLevel === 'B2' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-blue-700'}`}
                >
                  DELF B2
                </button>
                {typesPresents.map(t => (
                  <button
                    key={t}
                    onClick={() => setFilterLevel("type:" + t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${filterLevel === "type:" + t ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-blue-700'}`}
                  >
                    {TYPES_EPREUVE[t]}
                  </button>
                ))}
              </div>
              <Aide cle="c_histFiltres" taille={16} />
            </div>
          </div>
        </div>

        {/* Records Table */}
        <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="p-20 flex flex-col items-center justify-center text-center">
              <RefreshCw className="w-10 h-10 text-blue-500 animate-spin mb-4" />
              <p className="text-slate-500 font-bold">Chargement de l'historique...</p>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="p-20 flex flex-col items-center justify-center text-center opacity-60">
              <AlertTriangle className="w-16 h-16 text-slate-300 mb-4" />
              <h3 className="text-xl font-bold text-slate-700">Aucune évaluation trouvée</h3>
              <p className="text-slate-500 mt-2 max-w-sm">Aucun bilan d'évaluation ne correspond aux filtres ou l'historique est encore vide.</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left text-slate-600">
              <thead className="bg-slate-50/50 border-b border-slate-200 text-slate-400 text-xs font-bold uppercase tracking-widest">
                <tr>
                  <th className="px-6 py-4">Élève / Classe</th>
                  <th className="px-6 py-4">Date de correction</th>
                  <th className="px-6 py-4 text-center">Niveau</th>
                  <th className="px-6 py-4 text-center">Score</th>
                  <th className="px-6 py-4 text-right"><span className="inline-flex items-center gap-1.5 normal-case">Actions <Aide cle="c_histVoir" taille={14} /></span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map(record => {
                  const formattedDate = new Date(record.date).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  });

                  const isCurrentlyLoading = loadingRecordId === record.id;

                  return (
                    <tr 
                      key={record.id} 
                      onClick={() => !isCurrentlyLoading && handleLoadRecord(record.id)}
                      className="hover:bg-slate-50/50 transition-colors group"
                    >
                      {/* Cellule « élève » : isolée du clic de ligne, pour que la
                          saisie du nom n'ouvre pas l'évaluation. */}
                      <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3">
                          <div className="bg-blue-50 text-blue-600 p-2 rounded-xl transition-colors">
                            <User className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            {editingRecordId === record.id ? (
                              <div 
                                className="flex items-center gap-1.5 my-0.5" 
                                onClick={e => e.stopPropagation()}
                              >
                                <input
                                  type="text"
                                  value={editingName}
                                  onChange={e => setEditingName(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") handleSaveName(record.id, e);
                                    if (e.key === "Escape") handleCancelEdit(e);
                                  }}
                                  autoFocus
                                  disabled={isSavingName}
                                  className="px-2.5 py-1 text-sm font-bold bg-white border-2 border-blue-500 rounded-lg outline-none text-slate-800 shadow-sm w-44"
                                  placeholder="Nom de l'apprenant"
                                />
                                <button
                                  type="button"
                                  onClick={(e) => handleSaveName(record.id, e)}
                                  disabled={isSavingName || !editingName.trim()}
                                  className="p-1 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                                  title="Enregistrer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleCancelEdit(e)}
                                  disabled={isSavingName}
                                  className="p-1 bg-slate-200 text-slate-600 hover:bg-slate-300 rounded-lg transition-colors cursor-pointer"
                                  title="Annuler"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => handleStartEdit(record, e)}
                                className="flex items-center gap-1.5 text-left rounded-lg px-1 -mx-1 hover:bg-blue-50 transition-colors cursor-text group/name"
                                title="Cliquer pour modifier le nom de l'apprenant"
                              >
                                <p className={`font-bold truncate ${record.studentName && record.studentName !== "Inconnu" ? "text-slate-800" : "text-slate-400 italic"}`}>
                                  {record.studentName && record.studentName !== "Inconnu" ? record.studentName : "Nommer l'apprenant"}
                                </p>
                                <Pencil className="w-3 h-3 text-slate-400 group-hover/name:text-blue-600 flex-shrink-0 transition-colors" />
                              </button>
                            )}
                            <p className="text-xs text-slate-400 font-medium">{record.studentEmail || "Pas d'email"}</p>
                            {record.className && (
                              <span className="inline-block mt-1 text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-full">
                                {record.className}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 cursor-pointer" title="Ouvrir ce bilan">
                        <div className="flex items-center gap-2 text-slate-500 font-medium">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{formattedDate}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center font-bold cursor-pointer" title="Ouvrir ce bilan">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-black uppercase ${
                            record.examType === 'dictee' ? 'bg-purple-100 text-purple-700' :
                            record.examType === 'traduction' ? 'bg-cyan-100 text-cyan-800' :
                            record.examType === 'grammaire' ? 'bg-orange-100 text-orange-800' :
                            record.examType === 'interpretation' ? 'bg-teal-100 text-teal-800' :
                            record.level === 'B2' ? 'bg-sky-50 text-sky-600' : 'bg-amber-50 text-amber-600'
                          }`}>
                            {record.examType === 'dictee' ? 'Dictée' :
                             record.examType === 'traduction' ? 'Traduction' :
                             record.examType === 'grammaire' ? 'Grammaire' :
                             record.examType === 'interpretation' ? 'Interprétation' :
                             (record.level || 'Non précisé')}
                          </span>
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            (record.type || 'pe') === 'po' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          }`}>
                            {(record.type || 'pe') === 'po' ? '🎙️ PO' : '✍️ PE'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center cursor-pointer" title="Ouvrir ce bilan">
                        <div className="inline-flex flex-col items-center">
                          <span className="text-base font-black text-slate-800">{formatScore(record.globalScore)}</span>
                          <span className="text-[10px] text-slate-400 font-bold -mt-1">
                            /{record.maxScore || (['dictee', 'traduction', 'grammaire', 'interpretation'].includes(record.examType || '') ? 10 : 25)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleLoadRecord(record.id)}
                            disabled={isCurrentlyLoading}
                            className="px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            {isCurrentlyLoading ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <>
                                Voir
                                <ChevronRight className="w-3 h-3" />
                              </>
                            )}
                          </button>
                          <button
                            onClick={(e) => handleDelete(record.id, e)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                            title="Supprimer de l'historique"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  );
}
