import { Alert } from "react-native";
import type { AlertOptions } from "react-native";
import { useMemo } from "react";
import { useAppTheme } from "../context/ThemeContext";

/**
 * Centralized alert helpers to keep styling and copy consistent.
 */
export function useThemedAlert() {
  const { isDark } = useAppTheme();

  const alertOptions = useMemo<AlertOptions>(
    () => ({
      userInterfaceStyle: isDark ? "dark" : "light",
    }),
    [isDark]
  );

  const show = (title: string, message: string) => Alert.alert(title, message, undefined, alertOptions);
  const showError = (message: string, title = "Error") => show(title, message);
  const showSuccess = (message: string, title = "Success") => show(title, message);
  const showInfo = (message: string, title = "Info") => show(title, message);

  return { alertOptions, show, showError, showSuccess, showInfo };
}
