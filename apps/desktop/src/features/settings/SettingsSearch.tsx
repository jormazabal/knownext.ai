import { useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { AppSettingsSection } from "../../types/settings";
import { searchSettingsSections } from "./settingsSearchIndex";

export function SettingsSearch({ language, onSelect }: { language: "es" | "en"; onSelect: (section: AppSettingsSection) => void }) {
  const [query, setQuery] = useState("");
  const searchId = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const english = language === "en";
  const results = searchSettingsSections(query, language);
  function clear() { setQuery(""); input.current?.focus(); }
  return <div className="settings-search shrink-0 px-6 pb-3" onKeyDown={event => {
    if (event.key === "Escape" && query) { event.preventDefault(); event.stopPropagation(); clear(); }
  }}>
    <div className="mx-auto max-w-[1000px]">
      <div className="flex min-h-11 items-center gap-2 rounded-md bg-panel px-3 text-ink-secondary"><Search aria-hidden size={16} className="shrink-0"/><label htmlFor={searchId} className="sr-only">{english ? "Find settings by topic" : "Buscar ajustes por tema"}</label><input id={searchId} ref={input} type="search" autoComplete="off" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "ArrowDown" && results.length) { event.preventDefault(); list.current?.querySelector<HTMLButtonElement>("button")?.focus(); } }} placeholder={english ? "Find a topic or section…" : "Buscar un tema o apartado…"} className="min-h-11 min-w-0 flex-1 bg-transparent text-sm text-ink-primary outline-none"/>{!!query && <button type="button" aria-label={english ? "Clear settings search" : "Limpiar búsqueda de ajustes"} className="grid h-11 w-11 shrink-0 place-items-center rounded-md hover:bg-brand-hover" onClick={clear}><X size={16}/></button>}</div>
      {!!query.trim() && <div className="mt-2">
        <p role="status" className="mb-1 text-xs text-ink-secondary">{english ? `${results.length} matching ${results.length === 1 ? "section" : "sections"}. Opens the section; advanced options remain inside it.` : `${results.length} ${results.length === 1 ? "apartado encontrado" : "apartados encontrados"}. Abre el apartado; las opciones avanzadas están dentro.`}</p>
        {!results.length ? <p className="py-3 text-sm">{english ? "Try another topic, such as microphone, margins or permissions." : "Prueba otro tema, como micrófono, márgenes o permisos."}</p> : <ul ref={list} aria-label={english ? "Matching settings sections" : "Apartados de configuración encontrados"} className="max-h-[35dvh] overflow-y-auto rounded-md bg-panel p-1">
          {results.map(section => <li key={section.id}><button type="button" className="flex min-h-11 w-full items-start gap-3 rounded-md p-3 text-left hover:bg-brand-hover" onClick={() => { setQuery(""); onSelect(section.id); }} onKeyDown={event => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault(); const buttons = Array.from(list.current?.querySelectorAll<HTMLButtonElement>("button") ?? []); const index = buttons.indexOf(event.currentTarget);
            if (event.key === "ArrowUp" && index === 0) input.current?.focus();
            else buttons[(index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
          }}><section.icon aria-hidden size={17} className="mt-0.5 shrink-0 text-brand-orange"/><span className="min-w-0"><span className="block text-sm font-semibold">{section.label}</span><span className="mt-1 block text-xs text-ink-secondary">{section.description}</span></span></button></li>)}
        </ul>}
      </div>}
    </div>
  </div>;
}
