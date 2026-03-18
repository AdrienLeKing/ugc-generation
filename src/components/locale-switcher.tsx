"use client";

import { LOCALES } from "@/lib/i18n/dictionaries";
import { useI18n } from "@/lib/i18n/context";

export function LocaleSwitcher() {
  const { locale, setLocale } = useI18n();

  return (
    <div className="locale-switcher">
      {LOCALES.map((l) => (
        <button
          className={`locale-btn${locale === l.value ? " active" : ""}`}
          key={l.value}
          onClick={() => setLocale(l.value)}
          type="button"
        >
          {l.value === "fr" ? "FR" : "EN"}
        </button>
      ))}
    </div>
  );
}
