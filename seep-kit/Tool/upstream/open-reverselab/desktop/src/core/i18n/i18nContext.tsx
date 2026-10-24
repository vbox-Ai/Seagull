import React, { createContext, useContext, useState, useEffect } from "react";
import { en, TranslationKey } from "./locales/en";
import { zh } from "./locales/zh";

export type Locale = "zh" | "en";

interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: TranslationKey;
}

const dictionaries: Record<Locale, TranslationKey> = {
  zh,
  en,
};

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    return (localStorage.getItem("reverselab_locale") as Locale) || "zh";
  });

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("reverselab_locale", l);
  };

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t: dictionaries[locale] }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextType {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}
