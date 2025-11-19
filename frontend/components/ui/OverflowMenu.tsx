import React, { useMemo } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useAppTheme } from "../../context/ThemeContext";

export type OverflowAction = {
  key: string;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

type OverflowMenuProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  actions: OverflowAction[];
};

export default function OverflowMenu({ visible, onClose, title, actions }: OverflowMenuProps) {
  const { colors, isDark } = useAppTheme();
  const palette = useMemo(
    () => ({
      itemBg: isDark ? "#111827" : "#f9fafb",
      destructiveBg: isDark ? "#2b1315" : "#fde7e9",
      destructiveText: isDark ? "#fca5a5" : "#b00020",
      backdrop: isDark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.25)",
    }),
    [isDark]
  );

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: palette.backdrop }]}>
        <TouchableOpacity style={styles.backdropTouch} activeOpacity={1} onPress={onClose} />

        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              shadowOpacity: isDark ? 0.35 : 0.15,
            },
          ]}
          accessibilityRole="menu"
        >
          {title ? <Text style={[styles.title, { color: colors.muted }]}>{title}</Text> : null}
          {actions.map((a) => (
            <TouchableOpacity
              key={a.key}
              accessibilityRole="menuitem"
              style={[
                styles.item,
                {
                  backgroundColor: palette.itemBg,
                  borderColor: colors.border,
                },
                a.destructive && { backgroundColor: palette.destructiveBg },
                a.disabled && styles.itemDisabled,
              ]}
              activeOpacity={a.disabled ? 1 : 0.7}
              onPress={() => {
                if (a.disabled) return;
                a.onPress();
                onClose();
              }}
            >
              <Text
                style={[
                  styles.itemText,
                  { color: colors.text },
                  a.destructive && { color: palette.destructiveText },
                ]}
              >
                {a.label}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[
              styles.item,
              styles.cancelItem,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={onClose}
          >
            <Text style={[styles.itemText, { color: colors.accent }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.2)",
    justifyContent: "flex-end",
  },
  backdropTouch: { flex: 1 },
  sheet: {
    backgroundColor: "#fff",
    paddingTop: 8,
    paddingBottom: 12,
    paddingHorizontal: 12,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 14,
    color: "#666",
    marginBottom: 6,
    textAlign: "center",
  },
  item: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#f9fafb",
    marginVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
  },
  itemDisabled: { opacity: 0.5 },
  itemText: { fontSize: 16, color: "#111", textAlign: "center", fontWeight: "600" },
  cancelItem: { backgroundColor: "#fff" },
});

