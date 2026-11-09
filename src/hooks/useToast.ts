"use client";

import { useCallback, useRef, useState } from "react";

export interface ToastMessage {
  message: string;
  title?: string;
}

/**
 * Notification flottante (repli de modèle, avertissement de quota…).
 *
 * Extrait de `page.tsx`. Le minuteur est désormais mémorisé dans une ref et
 * annulé à chaque nouveau message : l'ancienne version empilait un `setTimeout`
 * par notification, si bien qu'un ancien minuteur pouvait masquer un message
 * plus récent avant ses huit secondes.
 */
export function useToast(durationMs: number = 8000) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, title: string = "Information sur le modèle") => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ message, title });
    timerRef.current = setTimeout(() => {
      setToast(prev => (prev?.message === message ? null : prev));
      timerRef.current = null;
    }, durationMs);
  }, [durationMs]);

  const dismissToast = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setToast(null);
  }, []);

  return { toast, setToast, showToast, dismissToast };
}
