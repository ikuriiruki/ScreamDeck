import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../i18n/en.json";
import ru from "../i18n/ru.json";
import type { Settings } from "../lib/types";

export type Language = "ru" | "en";

/** The saved choice, else the system's: Russian for ru-*, English for everything else. */
export function languageOf(settings: Settings | null): Language {
  const lang = settings?.language ?? navigator.language;
  return lang.startsWith("ru") ? "ru" : "en";
}

void i18n.use(initReactI18next).init({
  resources: { ru: { translation: ru }, en: { translation: en } },
  lng: languageOf(null),
  fallbackLng: "en",
  initAsync: false,
  interpolation: { escapeValue: false }, // React escapes
});

export default i18n;
