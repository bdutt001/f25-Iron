import React, { useMemo } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../../context/ThemeContext";

export type OverflowAction = {
  key: string;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
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
      surface: isDark ? "#0f172a" : "#ffffff",
      backdrop: isDark ? "rgba(2,6,23,0.75)" : "rgba(15,23,42,0.35)",
      itemBg: isDark ? "rgba(255,255,255,0.04)" : "#f8fafc",
      destructiveBg: isDark ? "rgba(248,113,113,0.12)" : "#fee2e2",
      destructiveText: isDark ? "#fca5a5" : "#b91c1c",
      icon: colors.icon,
      shadow: isDark ? "#000" : "#0f172a",
    }),
    [colors.icon, isDark]
  );

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: palette.backdrop }]}>
        <TouchableOpacity style={styles.touchableBackdrop} activeOpacity={1} onPress={onClose} />
        <View
          style={[
            styles.panel,
            {
              backgroundColor: palette.surface,
              borderColor: colors.border,
              shadowColor: palette.shadow,
            },
          ]}
          accessibilityRole="menu"
        >
          {title ? <Text style={[styles.title, { color: colors.muted }]}>{title}</Text> : null}
          {actions.map((action) => {
            const iconColor = action.destructive ? palette.destructiveText : palette.icon;
            const textColor = action.destructive ? palette.destructiveText : colors.text;
            return (
              <TouchableOpacity
                key={action.key}
                style={[
                  styles.item,
                  {
                    backgroundColor: action.destructive ? palette.destructiveBg : palette.itemBg,
                    borderColor: colors.border,
                  },
                  action.disabled && styles.itemDisabled,
                ]}
                accessibilityRole="menuitem"
                activeOpacity={action.disabled ? 1 : 0.85}
                onPress={() => {
                  if (action.disabled) return;
                  action.onPress();
                  onClose();
                }}
              >
                <View style={styles.itemContent}>
                  {action.icon ? (
                    <Ionicons name={action.icon} size={18} color={iconColor} style={styles.itemIcon} />
                  ) : null}
                  <Text style={[styles.itemText, { color: textColor }]}>{action.label}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={[
              styles.item,
              styles.cancelItem,
              { borderColor: colors.border, backgroundColor: colors.card },
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
    justifyContent: "center",
    alignItems: "center",
  },
  touchableBackdrop: { ...StyleSheet.absoluteFillObject },
  panel: {
    width: "90%",
    maxWidth: 380,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 25,
    elevation: 10,
  },
  title: {
    fontSize: 14,
    marginBottom: 12,
    textAlign: "center",
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  item: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  itemContent: { flexDirection: "row", alignItems: "center" },
  itemIcon: { marginRight: 10 },
  itemDisabled: { opacity: 0.55 },
  itemText: { fontSize: 15, fontWeight: "600" },
  cancelItem: {
    marginTop: 4,
    justifyContent: "center",
    alignItems: "center",
  },
});

