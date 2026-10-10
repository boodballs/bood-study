"use client";

import {
  createContext,
  useCallback,
  useContext,
  type ReactNode,
} from "react";
import { translate, type Lang } from "@/lib/i18n";

// English-only for now — the i18n dictionary keeps both languages so a
// toggle can be re-added later without touching every component again.
const LANG: Lang = "en";

type LangContextValue = {
  lang: Lang;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const LangContext = createContext<LangContextValue>({
  lang: LANG,
  t: (key) => key,
});

export function LangProvider({ children }: { children: ReactNode }) {
  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      translate(LANG, key, vars),
    [],
  );
  return <LangContext.Provider value={{ lang: LANG, t }}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}
