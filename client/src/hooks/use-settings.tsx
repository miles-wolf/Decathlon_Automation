import { createContext, useContext, useEffect, useState } from "react";

export type Settings = {
  defaultSessionId: number | null;
  defaultNumberOfWeeks: number;
  notificationsEnabled: boolean;
  notificationEmail: string;
};

type SettingsContextType = {
  settings: Settings;
  updateSettings: (updates: Partial<Settings>) => void;
  resetSettings: () => void;
  clearCache: () => void;
};

const defaultSettings: Settings = {
  defaultSessionId: null,
  defaultNumberOfWeeks: 3,
  notificationsEnabled: false,
  notificationEmail: "",
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    const stored = localStorage.getItem("app-settings");
    if (stored) {
      try {
        return { ...defaultSettings, ...JSON.parse(stored) };
      } catch {
        return defaultSettings;
      }
    }
    return defaultSettings;
  });

  useEffect(() => {
    localStorage.setItem("app-settings", JSON.stringify(settings));
  }, [settings]);

  const updateSettings = (updates: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  };

  const resetSettings = () => {
    setSettings(defaultSettings);
    localStorage.removeItem("app-settings");
  };

  const clearCache = () => {
    localStorage.removeItem("lunch-job-config");
    localStorage.removeItem("ampm-job-config");
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetSettings, clearCache }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return context;
}
