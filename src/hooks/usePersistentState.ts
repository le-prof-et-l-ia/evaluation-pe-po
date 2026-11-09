"use client";

import { useEffect, useRef, useState } from "react";

/**
 * État React persisté dans `localStorage`.
 *
 * Remplace le motif qui était répété une trentaine de fois dans `page.tsx` :
 * un `useState`, une lecture dans l'effet de montage, puis un `useEffect`
 * d'écriture par variable. Chaque réglage coûtait ainsi trois blocs de code
 * dispersés dans le fichier.
 *
 * Deux précautions par rapport à l'ancien code :
 *  - Rien n'est lu pendant le rendu : la valeur initiale est toujours la valeur
 *    par défaut, puis l'hydratation a lieu après le montage. C'est indispensable
 *    avec le rendu serveur de Next.js, sous peine d'incohérence d'hydratation.
 *  - Rien n'est écrit avant l'hydratation. L'ancien code écrivait brièvement la
 *    valeur par défaut avant de relire la valeur sauvegardée ; si la page était
 *    fermée dans cet intervalle, le réglage était perdu.
 */
export function usePersistentState<T>(
  storageKey: string,
  defaultValue: T,
  options?: {
    /** Conversion depuis la chaîne stockée. Par défaut : JSON puis brut. */
    deserialize?: (raw: string) => T | undefined;
    /** Conversion vers la chaîne stockée. Par défaut : JSON. */
    serialize?: (value: T) => string;
  }
): [T, React.Dispatch<React.SetStateAction<T>>, { hydrated: boolean }] {
  const [value, setValue] = useState<T>(defaultValue);
  const hydratedRef = useRef(false);
  const [hydrated, setHydrated] = useState(false);

  const serialize = options?.serialize ?? ((v: T) => JSON.stringify(v));
  const deserialize = options?.deserialize;

  // 1. Hydratation depuis localStorage, après le montage uniquement.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw !== null) {
        let parsed: T | undefined;
        if (deserialize) {
          parsed = deserialize(raw);
        } else {
          try {
            parsed = JSON.parse(raw) as T;
          } catch {
            // Valeurs historiques écrites en clair (ex. "B2", "flash").
            parsed = raw as unknown as T;
          }
        }
        if (parsed !== undefined) setValue(parsed);
      }
    } catch {
      // localStorage indisponible (navigation privée, stockage bloqué) :
      // on reste sur la valeur par défaut.
    }
    hydratedRef.current = true;
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // 2. Persistance, une fois l'hydratation faite.
  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      localStorage.setItem(storageKey, serialize(value));
    } catch {
      // Quota dépassé ou stockage bloqué : sans conséquence fonctionnelle.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, value]);

  return [value, setValue, { hydrated }];
}

/**
 * Variante pour les valeurs historiquement écrites en clair (sans JSON).
 * Conserve la compatibilité avec les réglages déjà présents dans le navigateur
 * de l'utilisateur : ils ont été écrits par `localStorage.setItem(k, level)`,
 * donc sans guillemets JSON.
 */
export function usePersistentRawState<T extends string>(
  storageKey: string,
  defaultValue: T,
  isValid?: (raw: string) => boolean
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = usePersistentState<T>(storageKey, defaultValue, {
    serialize: (v) => String(v),
    deserialize: (raw) => (isValid && !isValid(raw) ? undefined : (raw as T)),
  });
  return [value, setValue];
}

/** Variante booléenne : stockée en `"true"` / `"false"`, comme auparavant. */
export function usePersistentBoolean(
  storageKey: string,
  defaultValue: boolean
): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const [value, setValue] = usePersistentState<boolean>(storageKey, defaultValue, {
    serialize: (v) => String(v),
    deserialize: (raw) => (raw === "true" ? true : raw === "false" ? false : undefined),
  });
  return [value, setValue];
}
