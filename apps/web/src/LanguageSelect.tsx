import { useTranslation } from "react-i18next";
import { supportedLanguages } from "./i18n";

export function LanguageSelect({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation();
  return (
    <label className={`global-language-select ${compact ? "compact" : ""}`}>
      {!compact && <span>{t("language")}</span>}
      <select
        aria-label={t("language")}
        value={i18n.resolvedLanguage || "en"}
        onChange={(event) => {
          localStorage.setItem("adnecta-language", event.target.value);
          document.documentElement.lang = event.target.value;
          void i18n.changeLanguage(event.target.value);
        }}
      >
        {supportedLanguages.map(([code, name]) => (
          <option value={code} key={code}>
            {compact ? code.toUpperCase() : name}
          </option>
        ))}
      </select>
    </label>
  );
}
