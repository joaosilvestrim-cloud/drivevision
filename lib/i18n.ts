import en from "./locales/en.json";
import es from "./locales/es.json";
export type Language = "pt-BR" | "en" | "es";
const dictionaries: Record<string, Record<string, string>> = { en, es };
const listeners = new Set<() => void>();
let language: Language = "pt-BR";
let initialized = false;
function updateDocument(next: Language) {
  document.documentElement.lang = next;
  document.title =
    next === "en"
      ? "DriveVision | Your analytics workspace"
      : next === "es"
        ? "DriveVision | Tu espacio de análisis"
        : "DriveVision | Seu workspace de análises";
}
export function getLanguage(): Language {
  if (!initialized && typeof window !== "undefined") {
    initialized = true;
    try {
      const saved = localStorage.getItem("drivevision.language.v1");
      if (saved === "en" || saved === "es" || saved === "pt-BR")
        language = saved;
    } catch {
      /* Language remains usable when browser storage is unavailable. */
    }
    updateDocument(language);
  }
  return language;
}
export function setLanguage(next: Language) {
  if (!["pt-BR", "en", "es"].includes(next)) return;
  language = next;
  initialized = true;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("drivevision.language.v1", next);
    } catch {}
    updateDocument(next);
  }
  listeners.forEach((fn) => fn());
}
export function subscribeLanguage(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function locale() {
  return getLanguage() === "en"
    ? "en-US"
    : getLanguage() === "es"
      ? "es-ES"
      : "pt-BR";
}
// Call only for interface copy. Customer names, columns, file contents and dashboard titles stay untouched.
export function t(
  text: string | null | undefined,
  values?: Record<string, string | number>,
): string {
  if (text == null) return "";
  const key = text.replace(/\s+/g, " ").trim();
  const translated = dictionaries[getLanguage()]?.[key];
  let result = translated
    ? (text.match(/^\s*/)?.[0] || "") +
      translated +
      (text.match(/\s*$/)?.[0] || "")
    : text;
  if (values)
    result = result.replace(/\{(\w+)\}/g, (match, name) =>
      String(values[name] ?? match),
    );
  return result;
}
