import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DarkTheme as NavDarkTheme, DefaultTheme as NavDefaultTheme, Theme } from "@react-navigation/native";

export type ThemeMode = "system" | "light" | "dark";

type ThemeContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  effective: "light" | "dark";
  isDark: boolean;
  colors: {
    background: string;
    card: string;
    text: string;
    muted: string;
    border: string;
    accent: string;
    icon: string;
  };
  navigationTheme: Theme;
  statusBarStyle: "light" | "dark";
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "themeModePreference";
const ACCENT_BLUE = "#007BFF";

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [mode, setMode] = useState<ThemeMode>("system");
  const [hydrated, setHydrated] = useState(false);
  const [systemScheme, setSystemScheme] = useState<"light" | "dark">(() => Appearance.getColorScheme() ?? "light");

  // Load persisted preference
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored === "light" || stored === "dark" || stored === "system") {
          setMode(stored);
        }
      } catch {
        // ignore
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  // Persist preference
  useEffect(() => {
    if (!hydrated) return;
    void AsyncStorage.setItem(STORAGE_KEY, mode);
  }, [hydrated, mode]);

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme === "dark" ? "dark" : "light");
    });
    return () => subscription.remove();
  }, []);

  const effective = mode === "system" ? systemScheme : mode;
  const isDark = effective === "dark";

  const colors = useMemo(
    () => ({
      background: isDark ? "#141b2f" : "#f5f7fa",
      card: isDark ? "#1f2639" : "#ffffff",
      text: isDark ? "#f6f7ff" : "#0f172a",
      muted: isDark ? "#c8cbe0" : "#6b7280",
      border: isDark ? "#2c3653" : "#e5e7eb",
      accent: ACCENT_BLUE,
      icon: isDark ? "#d6dbf5" : "#475569",
    }),
    [isDark]
  );

  const navigationTheme: Theme = useMemo(
    () =>
      isDark
        ? {
            ...NavDarkTheme,
            colors: {
              ...NavDarkTheme.colors,
              background: colors.background,
              card: colors.card,
              text: colors.text,
              border: colors.border,
              primary: colors.accent,
            },
          }
        : {
            ...NavDefaultTheme,
            colors: {
              ...NavDefaultTheme.colors,
              background: colors.background,
              card: colors.card,
              text: colors.text,
              border: colors.border,
              primary: colors.accent,
            },
          },
    [colors, isDark]
  );

  const setModeSafe = useCallback((next: ThemeMode) => {
    setMode(next);
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        mode,
        setMode: setModeSafe,
        effective,
        isDark,
        colors,
        navigationTheme,
        statusBarStyle: isDark ? "light" : "dark",
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useAppTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useAppTheme must be used within ThemeProvider");
  return ctx;
};
