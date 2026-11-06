import { Brain, Download, Grid2X2, Mic, Monitor, Settings, Sparkles, Wrench } from "lucide-react";
import { settingsCopy } from "./settingsCopy";
import type { AppSettingsSection } from "../../types/settings";

export function getSettingsSections(language: "es" | "en") {
  const text = settingsCopy[language];
  return [
    {id: "summary", label: text.summaryNav, description: text.summaryNavDescription, icon: Grid2X2},
    {id: "interface", label: text.interfaceNav, description: text.interfaceNavDescription, icon: Monitor},
    {id: "ai", label: text.aiNav, description: text.aiNavDescription, icon: Brain},
    {id: "audio", label: "Audio", description: language === "en" ? "Meeting recording and transcription" : "Grabación y transcripción de reuniones", icon: Mic},
    {id: "skills", label: text.skillsNav, description: text.skillsNavDescription, icon: Sparkles},
    {id: "capabilities", label: text.capabilitiesNav, description: text.capabilitiesNavDescription, icon: Wrench},
    {id: "export", label: text.exportNav, description: text.exportNavDescription, icon: Download},
    {id: "system", label: text.systemNav, description: text.systemNavDescription, icon: Settings},
  ] satisfies Array<{id: AppSettingsSection; label: string; description: string; icon: typeof Settings}>;
}
