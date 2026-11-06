import type { ReactNode } from "react";
export type AppSettingsSection = "audio" | "summary" | "interface" | "export" | "ai" | "skills" | "capabilities" | "system";
export type SettingsSaveDomain = "app" | "ai" | "export";
export type SettingsSaveFailure = {id: SettingsSaveDomain; label: string; message: string};

export type SettingsWorkspace = {
  open: boolean;
  content: ReactNode;
  navigation: (actions: {onNavigate: () => void; onHide: () => void}) => ReactNode;
  context: ReactNode;
  onClose: () => void;
};
