import React, { ReactNode } from "react";
import { Platform, StyleProp, ViewStyle } from "react-native";
import { Edge, SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { useAppTheme } from "@/context/ThemeContext";

type AppScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  keyboardShouldPersistTaps?: "always" | "handled" | "never";
};

const DEFAULT_EDGES: Edge[] = ["top", "bottom"];

export function AppScreen({
  children,
  scroll = false,
  edges = DEFAULT_EDGES,
  contentContainerStyle,
  style,
  keyboardShouldPersistTaps = "handled",
}: AppScreenProps) {
  const { colors } = useAppTheme();

  const safeAreaStyle = [{ flex: 1, backgroundColor: colors.background }, style];

  if (scroll) {
    return (
      <SafeAreaView style={safeAreaStyle} edges={edges}>
        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[{ flexGrow: 1 }, contentContainerStyle]}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          extraKeyboardSpace={Platform.OS === "ios" ? 16 : 0}
        >
          {children}
        </KeyboardAwareScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={safeAreaStyle} edges={edges}>
      {children}
    </SafeAreaView>
  );
}
