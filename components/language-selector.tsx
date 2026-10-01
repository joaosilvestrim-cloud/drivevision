"use client";
import { useSyncExternalStore, useRef, useEffect, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import {
  getLanguage,
  setLanguage,
  subscribeLanguage,
  type Language,
} from "@/lib/i18n";
export function useLanguage() {
  return useSyncExternalStore(
    subscribeLanguage,
    getLanguage,
    () => "pt-BR" as Language,
  );
}
const languages: { id: Language; name: string }[] = [
  { id: "pt-BR", name: "Português" },
  { id: "en", name: "English" },
  { id: "es", name: "Español" },
];
function Flag({ language }: { language: Language }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 30 20" width="27" height="18">
      {language === "pt-BR" ? (
        <>
          <rect width="30" height="20" fill="#159447" />
          <path d="M15 2 28 10 15 18 2 10Z" fill="#ffdc40" />
          <circle cx="15" cy="10" r="5" fill="#234399" />
          <path
            d="M10 9 Q15 8 20 12"
            fill="none"
            stroke="white"
            strokeWidth="1"
          />
        </>
      ) : language === "es" ? (
        <>
          <rect width="30" height="20" fill="#ae1c28" />
          <rect y="5" width="30" height="10" fill="#ffcd00" />
          <rect x="8" y="8" width="3" height="5" rx="1" fill="#ae1c28" />
        </>
      ) : (
        <>
          <rect width="30" height="20" fill="white" />
          {[0, 4, 8, 12, 16].map((y) => (
            <rect key={y} y={y} width="30" height="2" fill="#bd3441" />
          ))}
          <rect width="13" height="11" fill="#244679" />
          {[3, 7, 11].flatMap((x) =>
            [3, 7].map((y) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r=".7" fill="white" />
            )),
          )}
        </>
      )}
    </svg>
  );
}
export function LanguageSelector() {
  const language = useLanguage(),
    selected = languages.find((l) => l.id === language)!;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  return (
    <div className="language-bar">
      <div
        className="language-picker"
        ref={root}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            root.current?.querySelector("button")?.focus();
          }
        }}
      >
        <button
          type="button"
          className="language-current"
          aria-label="Idioma / Language / Idioma"
          aria-expanded={open}
          aria-controls="language-options"
          onClick={() => setOpen(!open)}
        >
          <Flag language={language} />
          <span>{selected.name}</span>
          <ChevronDown size={14} />
        </button>
        {open && (
          <div
            id="language-options"
            className="language-options"
            role="group"
            aria-label="Idioma / Language / Idioma"
          >
            {languages.map((l) => (
              <button
                key={l.id}
                type="button"
                lang={l.id}
                aria-pressed={language === l.id}
                onClick={() => {
                  setLanguage(l.id);
                  setOpen(false);
                  root.current?.querySelector("button")?.focus();
                }}
              >
                <Flag language={l.id} />
                <span>{l.name}</span>
                {language === l.id && <Check size={15} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
