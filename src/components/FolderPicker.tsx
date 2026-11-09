"use client";

import { useState, useEffect } from "react";
import { Folder, FolderOpen, ChevronRight, ChevronUp, Check, X, Loader2, HardDrive, Star, Home } from "lucide-react";

interface FolderPickerProps {
  currentPath: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

interface BrowseResult {
  currentPath: string;
  parentPath: string;
  isRoot?: boolean;
  drives?: { name: string; path: string }[];
  favorites?: { name: string; path: string; icon: string }[];
  folders: { name: string; path: string }[];
  files: string[];
}

export default function FolderPicker({ currentPath, onSelect, onClose }: FolderPickerProps) {
  const [browseData, setBrowseData] = useState<BrowseResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const browse = async (dirPath: string) => {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch("/api/browse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dirPath }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBrowseData(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Toujours démarrer sur "Ce PC"
    browse("ROOT");
  }, []);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[75vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-slate-100">
          <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-blue-500" /> Sélectionner un dossier
          </h3>
          <div className="flex items-center gap-2">
            <button onClick={() => browse("ROOT")} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-blue-600" title="Ce PC">
              <Home className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5 text-slate-400" /></button>
          </div>
        </div>

        {/* Breadcrumb / Current Path */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
          <button onClick={() => browse("ROOT")} className="text-xs font-bold text-blue-600 hover:underline">💻 Ce PC</button>
          {browseData && !browseData.isRoot && browseData.currentPath !== 'Ce PC' && (
            <>
              <ChevronRight className="w-3 h-3 text-slate-300" />
              <p className="text-xs font-mono text-slate-500 truncate">{browseData.currentPath}</p>
            </>
          )}
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar: Favorites (always visible) */}
          {browseData?.favorites && browseData.favorites.length > 0 && (
            <div className="w-48 flex-shrink-0 border-r border-slate-100 bg-slate-50/50 p-3 overflow-y-auto">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-2 flex items-center gap-1"><Star className="w-3 h-3" /> Favoris</p>
              {browseData.favorites.map(fav => (
                <button
                  key={fav.path}
                  onClick={() => browse(fav.path)}
                  className="w-full flex items-center gap-2 p-2.5 rounded-xl hover:bg-blue-50 text-slate-700 transition-colors text-sm"
                >
                  <span className="text-base">{fav.icon}</span>
                  <span className="font-medium truncate">{fav.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto p-3">
            {isLoading && (
              <div className="flex items-center justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
            )}
            {error && <p className="text-sm text-red-500 p-3">{error}</p>}

            {/* Root View: Drives */}
            {browseData?.isRoot && browseData.drives && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 mb-2 flex items-center gap-1"><HardDrive className="w-3 h-3" /> Lecteurs</p>
                {browseData.drives.map(drive => (
                  <button
                    key={drive.path}
                    onClick={() => browse(drive.path)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-blue-50 text-slate-700 transition-colors group"
                  >
                    <HardDrive className="w-5 h-5 text-slate-400 group-hover:text-blue-500" />
                    <span className="text-sm font-bold">{drive.name}</span>
                    <span className="text-xs text-slate-400 ml-1">{drive.path}</span>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-400 ml-auto" />
                  </button>
                ))}
              </div>
            )}

            {/* Normal View: Folders */}
            {!browseData?.isRoot && browseData && !isLoading && (
              <>
                {/* Go Up */}
                <button
                  onClick={() => browse(browseData.parentPath)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-slate-600 transition-colors"
                >
                  <ChevronUp className="w-4 h-4" />
                  <span className="text-sm font-medium">Dossier parent</span>
                </button>

                {/* Subfolders */}
                {browseData.folders.map(folder => (
                  <button
                    key={folder.path}
                    onClick={() => browse(folder.path)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-blue-50 text-slate-700 transition-colors group"
                  >
                    <Folder className="w-4 h-4 text-blue-400 group-hover:text-blue-600" />
                    <span className="text-sm font-medium flex-1 text-left truncate">{folder.name}</span>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-400" />
                  </button>
                ))}

                {browseData.folders.length === 0 && (
                  <p className="text-sm text-slate-400 text-center p-6 italic">Aucun sous-dossier</p>
                )}

                {/* Files preview */}
                {browseData.files.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 mb-2">{browseData.files.length} fichier(s) traitable(s)</p>
                    <div className="flex flex-wrap gap-1 px-3">
                      {browseData.files.slice(0, 10).map(f => (
                        <span key={f} className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-md truncate max-w-[150px]">{f}</span>
                      ))}
                      {browseData.files.length > 10 && <span className="text-xs text-slate-400 px-2 py-1">+{browseData.files.length - 10} autres</span>}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer: Select Button */}
        <div className="p-4 border-t border-slate-100 flex justify-between items-center">
          <span className="text-xs text-slate-400 truncate max-w-[300px]">{browseData?.isRoot ? 'Choisissez un lecteur ou un favori' : browseData?.currentPath}</span>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2.5 text-sm text-slate-500 hover:text-slate-700 font-medium">Annuler</button>
            <button
              onClick={() => { if (browseData && !browseData.isRoot) onSelect(browseData.currentPath); }}
              disabled={browseData?.isRoot}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4" /> Sélectionner ce dossier
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
