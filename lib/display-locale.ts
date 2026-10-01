// Presentation only: parsing, stored values and CSV exports do not depend on language.
export function displayLocale() {
  const lang = typeof document === "undefined" ? "pt-BR" : document.documentElement.lang;
  return lang === "en" ? "en-US" : lang === "es" ? "es-ES" : "pt-BR";
}
