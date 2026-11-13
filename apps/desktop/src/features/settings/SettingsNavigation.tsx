import { PanelLeftClose } from "lucide-react";
import { useEffect, useRef } from "react";
import type { AppSettingsSection } from "../../types/settings";
import { getSettingsSections } from "./settingsSections";
import { settingsCopy } from "./settingsCopy";

export function SettingsNavigation({language, section, onSelectSection, onNavigate, onHide}: {
  language: "es" | "en"; section: AppSettingsSection; onSelectSection: (section: AppSettingsSection) => void;
  onNavigate: () => void; onHide: () => void;
}) {
  const sections = getSettingsSections(language);
  const nav = useRef<HTMLElement>(null);
  const focusFrame = useRef<number | undefined>();
  useEffect(() => () => { if (focusFrame.current !== undefined) cancelAnimationFrame(focusFrame.current); }, []);
  function activate(next: AppSettingsSection) {
    onSelectSection(next); onNavigate();
    if (focusFrame.current !== undefined) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() => {
      const panel = document.getElementById(`app-settings-panel-${next}`);
      if (panel && !panel.closest('[hidden],[inert]') && getComputedStyle(panel).display !== "none") panel.focus({preventScroll:true});
    });
  }
  return <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-2">
    <header className="flex shrink-0 items-center justify-between gap-2 px-2 py-1"><h2 className="text-sm font-semibold">{language === "en" ? "Settings" : "Configuración"}</h2><button aria-label={language === "en" ? "Hide settings navigation" : "Ocultar navegación de configuración"} className="grid h-11 w-11 place-items-center rounded-md text-ink-secondary hover:bg-panel lg:hidden" onClick={onHide}><PanelLeftClose size={16}/></button></header>
    <p className="mb-4 px-2 text-xs text-ink-secondary">{language === "en" ? "This device" : "Este dispositivo"}</p>
    <nav ref={nav} aria-label={settingsCopy[language].sectionsLabel} role="tablist" aria-orientation="vertical" className="min-h-0 overflow-y-auto" onKeyDown={event => {
      const index = sections.findIndex(item => item.id === section);
      const next = event.key === "ArrowDown" ? (index + 1) % sections.length : event.key === "ArrowUp" ? (index + sections.length - 1) % sections.length : event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault();onSelectSection(sections[next].id);
      nav.current?.querySelector<HTMLButtonElement>(`[data-settings-section="${sections[next].id}"]`)?.focus();
    }}>
      {sections.map(item => <button key={item.id} id={`app-settings-tab-${item.id}`} data-settings-section={item.id} role="tab" tabIndex={section === item.id ? 0 : -1} aria-selected={section === item.id} aria-controls={`app-settings-panel-${item.id}`} onClick={() => activate(item.id)} className={`mb-1 flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm ${section === item.id ? "bg-brand-hover font-semibold text-ink-primary" : "text-ink-secondary hover:bg-panel"}`}><item.icon aria-hidden size={17} className={section === item.id ? "text-brand-orange" : ""}/><span>{item.label}</span></button>)}
    </nav>
  </div>;
}
