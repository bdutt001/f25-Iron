import { useMemo } from "react";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppTheme } from "@/context/ThemeContext";

export const useTabHeaderOptions = () => {
  const { isDark } = useAppTheme();
  const insets = useSafeAreaInsets();

  return useMemo(() => {
    const baseHeaderHeight = Platform.OS === "ios" ? 44 : 56; // matches react-navigation defaults
    const headerHeight = baseHeaderHeight + insets.top;

    const headerStyle = {
      backgroundColor: isDark ? "#0f172a" : "#f7f8fb",
      height: headerHeight,
    };
    const headerTitleStyle = {
      color: isDark ? "#ffffff" : "#0f172a",
      fontWeight: "700" as const,
      fontSize: 17,
      lineHeight: 22,
    };
    const headerTintColor = isDark ? "#ffffff" : "#0f172a";

    return {
      headerStyle,
      headerTitleStyle,
      headerTintColor,
      headerShadowVisible: false,
      headerStatusBarHeight: insets.top,
    };
  }, [insets.top, isDark]);
};
