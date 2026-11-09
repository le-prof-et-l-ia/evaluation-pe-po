"use client";

import { useState, useEffect } from "react";
import { Database, Trash2, Calendar, Loader2, RefreshCw, AlertTriangle, Key, Mail, Lock, ShieldAlert } from "lucide-react";
import { motion } from "framer-motion";
import Aide from "@/components/Aide";

interface Props {
  apiKeys: any;
  setApiKeys: (keys: any) => void;
  keyMode: 'free_only' | 'paid_only' | 'both';
  setKeyMode: (val: 'free_only' | 'paid_only' | 'both') => void;
  emailConfig: { user: string; pass: string };
  setEmailConfig: (config: { user: string; pass: string }) => void;
  signature?: string;
  setSignature?: (sig: string) => void;
}

export default function MaintenanceView({ 
  apiKeys, 
  setApiKeys, 
  keyMode, 
  setKeyMode,
  emailConfig,
  setEmailConfig,
  signature,
  setSignature
}: Props) {
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  
  // Date proposée par défaut : il y a 6 mois (on ne propose jamais « aujourd'hui », qui viderait tout).
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString().split("T")[0];
  });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/cleanup");
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleCleanup = async () => {
    if (!selectedDate) return alert("Veuillez choisir une date.");
    
    // Safety confirm
    const confirmMsg = `Supprimer tout ce qui a été produit AVANT le ${new Date(selectedDate).toLocaleDateString()} : bilans PDF et fichiers du dossier de sortie de l'application, évaluations enregistrées et fiches de l'historique ?

Sous Windows, les fichiers vont dans la Corbeille et peuvent être restaurés. Sur Mac, la suppression est définitive.`;
    if (!confirm(confirmMsg)) return;

    setIsDeleting(true);
    try {
      const res = await fetch("/api/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateBefore: new Date(selectedDate).toISOString() }) // Need full ISO string for backend
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchStats();
      } else {
        alert("Erreur: " + data.error);
      }
    } catch (e) {
      alert("Erreur de connexion.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePurge = async () => {
    setShowPurgeModal(false);
    setIsPurging(true);
    try {
      const res = await fetch("/api/cleanup", { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        alert("✅ " + data.message);
        fetchStats();
      } else {
        alert("Erreur : " + (data.error || "Inconnue"));
      }
    } catch (e) {
      alert("Erreur de connexion.");
    } finally {
      setIsPurging(false);
    }
  };

  const handleTestEmail = async () => {
    if (!emailConfig.user || !emailConfig.pass) {
      return alert("Veuillez saisir votre email et votre mot de passe d'application.");
    }

    setIsTestingEmail(true);
    try {
      const res = await fetch("/api/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(emailConfig)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert("✅ Succès : Connexion au serveur SMTP réussie !");
      } else {
        alert("❌ Échec : " + (data.error || "Erreur inconnue"));
      }
    } catch (e) {
      alert("❌ Erreur de connexion au serveur de test.");
    } finally {
      setIsTestingEmail(false);
    }
  };

  return (
    <>
    <div className="flex flex-col h-full bg-slate-50 relative">
      <header className="flex items-center gap-3 p-8 pb-4 border-b border-slate-200 bg-white shadow-sm z-10">
        <Database className="w-7 h-7 text-blue-600" />
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Maintenance & Paramètres</h2>
          <p className="text-sm text-slate-500 mt-1">Gérez vos clés API, vos accès email et l'espace disque.</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8 relative">
        <div className="max-w-6xl mx-auto space-y-8">
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* GESTION DES CLÉS API */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-lg font-bold flex items-center gap-2 text-slate-800"><Key className="w-5 h-5 text-blue-500"/> Gestion des Clés API <Aide cle="c_paramSauvegardeAuto" taille={16} /></h3>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider whitespace-nowrap">Mode :</span>
                  <Aide cle="c_paramModeCles" taille={14} />
                  <select 
                    value={keyMode}
                    onChange={e => setKeyMode(e.target.value as 'free_only' | 'paid_only' | 'both')}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500/20 outline-none cursor-pointer"
                  >
                    <option value="both">Gratuit + Payant</option>
                    <option value="free_only">Gratuit uniquement</option>
                    <option value="paid_only">Payant uniquement</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {/* Gemini */}
                <div className="bg-blue-50/30 p-4 rounded-2xl border border-blue-100 space-y-3">
                  <label className="text-xs font-black text-blue-600 uppercase flex items-center gap-2">
                    <img src="https://www.gstatic.com/lamda/images/favicon_v2_16x16.png" className="w-3 h-3" alt="Gemini" /> Gemini
                  </label>
                  <textarea 
                    value={apiKeys.gemini.freeKeys} 
                    onChange={e => setApiKeys((prev: any) => ({ ...prev, gemini: { ...prev.gemini, freeKeys: e.target.value } }))}
                    className="w-full bg-white border border-slate-200 rounded-xl p-3 text-[11px] h-24 focus:ring-2 focus:ring-blue-500/20 outline-none resize-none font-mono" 
                    placeholder="Clés Gratuites (une par ligne)"
                  />
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase">
                    Clés gratuites et clé payante <Aide cle="c_paramClesGratuites" taille={13} /> <Aide cle="c_paramClePayante" taille={13} />
                  </div>
                  <input 
                    value={apiKeys.gemini.paidKey} 
                    onChange={e => setApiKeys((prev: any) => ({ ...prev, gemini: { ...prev.gemini, paidKey: e.target.value } }))}
                    className="w-full bg-white border border-slate-200 rounded-xl p-3 text-[11px] focus:ring-2 focus:ring-blue-500/20 outline-none font-mono" 
                    placeholder="Clé Payante (optionnel)"
                  />
                  <p className="text-[10px] text-slate-500 italic leading-snug">
                    Les clés et le mot de passe de messagerie sont mémorisés automatiquement dans ce navigateur, sur cet ordinateur (sans bouton « Enregistrer »). Sur un ordinateur partagé, effacez-les en fin de séance.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              {/* CONFIGURATION EMAIL */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-lg font-bold flex items-center gap-2 text-slate-800"><Mail className="w-5 h-5 text-indigo-500"/> Serveur d'Envoi (Gmail) <Aide cle="c_paramEmail" taille={16} /></h3>
                <p className="text-sm text-slate-500">Configurez l'adresse qui expédiera les bilans aux élèves.</p>
                
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase px-1">Adresse Email</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        type="email"
                        value={emailConfig.user}
                        onChange={e => setEmailConfig({ ...emailConfig, user: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-11 pr-4 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                        placeholder="exemple@gmail.com"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase px-1">Mot de passe d'application</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        type="password"
                        value={emailConfig.pass}
                        onChange={e => setEmailConfig({ ...emailConfig, pass: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-11 pr-4 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                        placeholder="•••• •••• •••• ••••"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 px-1">
                      <p className="text-[10px] text-slate-400 italic">
                        Note: Utilisez un "Mot de passe d'application" Google.
                      </p>
                      <button 
                        onClick={handleTestEmail}
                        disabled={isTestingEmail}
                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors disabled:opacity-50"
                      >
                        {isTestingEmail ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <RefreshCw className="w-2.5 h-2.5" />}
                        Tester la connexion
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase px-1 flex items-center gap-1.5">Signature d'e-mail <Aide cle="c_paramSignature" taille={13} /></label>
                    <input 
                      type="text"
                      value={signature ?? "L'équipe pédagogique"}
                      onChange={e => setSignature?.(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                      placeholder="Ex: L'équipe pédagogique"
                    />
                    <p className="text-[10px] text-slate-400 italic px-1">
                      Signature affichée au bas des courriels d'évaluation envoyés aux élèves.
                    </p>
                  </div>
                </div>
              </div>

              {/* NETTOYAGE */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-bold flex items-center gap-2 text-slate-800"><Trash2 className="w-5 h-5 text-rose-500"/> Purge de l'Espace</h3>
                  <div className="bg-slate-50 px-3 py-1 rounded-full border border-slate-100 flex items-center gap-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Utilisé:</span>
                    <Aide cle="c_paramEspace" taille={13} />
                    <span className="text-[11px] font-bold text-slate-700">{stats ? formatBytes(stats.totalBytes) : '...'}</span>
                    <button onClick={fetchStats} className="ml-1 text-slate-400 hover:text-blue-500"><RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`}/></button>
                  </div>
                </div>
                
                <div className="space-y-4 pt-2">
                   <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase px-1 flex items-center gap-1.5">Tout nettoyer AVANT le : <Aide cle="c_paramNettoyer" taille={13} /></label>
                    <div className="flex items-center gap-4">
                       <input 
                         type="date" 
                         value={selectedDate}
                         onChange={e => setSelectedDate(e.target.value)}
                         className="flex-1 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold bg-slate-50 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 transition-all"
                       />
                       <button 
                        onClick={handleCleanup}
                        disabled={isDeleting || !selectedDate}
                        className="px-6 py-3 bg-rose-600 text-white font-bold rounded-xl flex items-center gap-2 hover:bg-rose-700 transition-colors shadow-lg shadow-rose-500/20 disabled:opacity-50"
                      >
                        {isDeleting ? <Loader2 className="w-5 h-5 animate-spin"/> : <Trash2 className="w-5 h-5" />}
                        Nettoyer
                      </button>
                    </div>
                  </div>

                  {/* Séparateur */}
                  <div className="border-t border-slate-100 pt-4">
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <ShieldAlert className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-bold text-red-700 flex items-center gap-1.5">Purge complète de l'application <Aide cle="c_paramPurge" taille={14} /></p>
                          <p className="text-[11px] text-red-500 mt-0.5">Supprime <strong>toutes</strong> les évaluations, rapports PDF, fichiers image et textes et l'historique. Les données sont envoyées à la corbeille Windows.</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowPurgeModal(true)}
                        disabled={isPurging}
                        className="w-full py-3 bg-red-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-red-700 transition-colors shadow-lg shadow-red-500/20 disabled:opacity-50"
                      >
                        {isPurging ? <Loader2 className="w-5 h-5 animate-spin"/> : <ShieldAlert className="w-5 h-5" />}
                        {isPurging ? 'Purge en cours...' : 'Purger l\'application'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>

    {/* Modal de confirmation de purge */}
    {showPurgeModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full mx-4 border border-red-100"
        >
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
              <ShieldAlert className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-black text-slate-800">Purge complète ?</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Cette action va envoyer <strong className="text-red-600">TOUTES</strong> les données de l'application à la corbeille Windows :
            </p>
            <ul className="text-left text-sm text-slate-600 space-y-1 w-full bg-slate-50 rounded-2xl p-4">
              <li className="flex items-center gap-2"><Trash2 className="w-4 h-4 text-red-400 flex-shrink-0" /> Évaluations et bilans détaillés</li>
              <li className="flex items-center gap-2"><Trash2 className="w-4 h-4 text-red-400 flex-shrink-0" /> Rapports PDF générés</li>
              <li className="flex items-center gap-2"><Trash2 className="w-4 h-4 text-red-400 flex-shrink-0" /> Fichiers image et textes des copies</li>
              <li className="flex items-center gap-2"><Trash2 className="w-4 h-4 text-red-400 flex-shrink-0" /> Historique complet</li>
              <li className="flex items-center gap-2"><Trash2 className="w-4 h-4 text-red-400 flex-shrink-0" /> Fichiers temporaires</li>
            </ul>
            <p className="text-xs text-slate-400 italic">Les classes et élèves, les clés API et la configuration email ne sont PAS supprimés.</p>
            <div className="flex gap-3 w-full pt-2">
              <button
                onClick={() => setShowPurgeModal(false)}
                className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handlePurge}
                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-500/20"
              >
                Oui, purger
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    )}
    </>
  );
}
