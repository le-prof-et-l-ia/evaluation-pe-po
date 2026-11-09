"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface HeaderNavProps {
  currentSection?: "pe" | "po";
  onOpenHistory?: () => void;
  onOpenClasses?: () => void;
  onOpenMaintenance?: () => void;
  onOpenPending?: () => void;
  pendingCount?: number;
}

export default function HeaderNav({
  currentSection,
  onOpenHistory,
  onOpenClasses,
  onOpenMaintenance,
  onOpenPending,
  pendingCount = 0,
}: HeaderNavProps) {
  const pathname = usePathname();
  const activeSection = currentSection || (pathname?.startsWith("/po") ? "po" : "pe");

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Section Switcher */}
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-2">
              <span className="text-xl">🎓</span>
              <div>
                <h1 className="font-bold text-slate-800 text-sm sm:text-base leading-tight">
                  Évaluation DELF
                </h1>
                <p className="text-[10px] text-slate-500 hidden sm:block">
                  Correction automatisée & supervisée
                </p>
              </div>
            </div>

            {/* Switcher PE / PO */}
            <nav className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80" aria-label="Mode d'épreuve">
              <Link
                href="/"
                className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                  activeSection === "pe"
                    ? "bg-white text-indigo-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                }`}
              >
                <span>✍️</span>
                <span>Production Écrite</span>
              </Link>
              <Link
                href="/po"
                className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                  activeSection === "po"
                    ? "bg-white text-emerald-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                }`}
              >
                <span>🎙️</span>
                <span>Production Orale</span>
                {pendingCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 bg-amber-500 text-white text-[10px] font-bold rounded-full">
                    {pendingCount}
                  </span>
                )}
              </Link>
            </nav>
          </div>

          {/* Right Action buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Drafts button for PO */}
            {activeSection === "po" && onOpenPending && (
              <button
                type="button"
                onClick={onOpenPending}
                className="relative flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors"
                title="Brouillons en attente de la partie 2 (interaction)"
              >
                <span>⏳</span>
                <span className="hidden sm:inline">Brouillons</span>
                {pendingCount > 0 && (
                  <span className="px-1.5 py-0.2 bg-amber-500 text-white text-[10px] font-bold rounded-full">
                    {pendingCount}
                  </span>
                )}
              </button>
            )}

            {onOpenClasses && (
              <button
                type="button"
                onClick={onOpenClasses}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors"
                title="Gérer les classes et cohortes d'élèves"
              >
                <span>👥</span>
                <span className="hidden md:inline">Classes</span>
              </button>
            )}

            {onOpenHistory && (
              <button
                type="button"
                onClick={onOpenHistory}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors"
                title="Consulter l'historique des évaluations"
              >
                <span>📜</span>
                <span className="hidden md:inline">Historique</span>
              </button>
            )}

            {onOpenMaintenance && (
              <button
                type="button"
                onClick={onOpenMaintenance}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors"
                title="Paramètres, clés API et maintenance"
              >
                <span>⚙️</span>
                <span className="hidden md:inline">Paramètres</span>
              </button>
            )}

            {/* Local Server status pill */}
            <div className="hidden lg:flex items-center gap-1.5 pl-2 ml-1 border-l border-slate-200 text-[11px] text-slate-500">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              <span>127.0.0.1:3000</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
