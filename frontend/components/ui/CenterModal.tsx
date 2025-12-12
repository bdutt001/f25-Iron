import React, { ReactNode, useMemo } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { useAppTheme } from "@/context/ThemeContext";

type CenterModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  children: ReactNode;
  cardStyle?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollEnabled?: boolean;
};

/**
 * Shared, centered modal surface that respects safe areas and keyboard movement.
 * Use this for any overflow or dialog UI so we keep the same behavior everywhere.
 */
export function CenterModal({
  visible,
  onRequestClose,
  children,
  cardStyle,
  contentContainerStyle,
  scrollEnabled = true,
}: CenterModalProps) {
  const { colors, isDark } = useAppTheme();

  const palette = useMemo(
    () => ({
      backdrop: isDark ? "rgba(2,6,23,0.78)" : "rgba(15,23,42,0.48)",
      shadow: isDark ? "#000" : "#0f172a",
    }),
    [isDark]
  );

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onRequestClose}
    >
      <View style={[styles.backdrop, { backgroundColor: palette.backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onRequestClose} />
        <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                shadowColor: palette.shadow,
              },
              cardStyle,
            ]}
          >
            <KeyboardAwareScrollView
              style={styles.scroll}
              contentContainerStyle={[
                styles.contentContainer,
                contentContainerStyle,
              ]}
              keyboardShouldPersistTaps="handled"
              enableAutomaticScroll
              scrollEnabled={scrollEnabled}
              showsVerticalScrollIndicator={false}
              extraScrollHeight={Platform.OS === "ios" ? 18 : 0}
            >
              {children}
            </KeyboardAwareScrollView>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
  },
  safeArea: {
    width: "100%",
    alignItems: "center",
  },
  card: {
    width: "92%",
    maxWidth: 520,
    maxHeight: "85%",
    minWidth: 280,
    minHeight: 120,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 26,
    elevation: 14,
  },
  scroll: {
    width: "100%",
    maxHeight: "100%",
  },
  contentContainer: {
    padding: 18,
  },
});
