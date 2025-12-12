import React, { useMemo } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  message?: string;
  showCancel?: boolean;
  actions: OverflowAction[];
};

export default function OverflowMenu({
  visible,
  onClose,
  title,
  message,
  showCancel = true,
  actions,
}: OverflowMenuProps) {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const palette = useMemo(
    () => ({
      surface: isDark ? "#0b1224" : "#ffffff",
      backdrop: isDark ? "rgba(2,6,23,0.78)" : "rgba(15,23,42,0.45)",
      itemBg: isDark ? "rgba(255,255,255,0.05)" : "#f8fafc",
      destructiveBg: isDark ? "rgba(248,113,113,0.15)" : "#fee2e2",
      destructiveText: isDark ? "#fca5a5" : "#b91c1c",
      icon: colors.icon,
      shadow: isDark ? "#000" : "#0f172a",
    }),
    [colors.icon, isDark]
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: palette.backdrop }]}>
        <TouchableOpacity
          style={styles.touchableBackdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: palette.surface,
              borderColor: colors.border,
              shadowColor: palette.shadow,
              paddingBottom: Math.max(insets.bottom, 18),
            },
          ]}
          accessibilityRole="menu"
        >
          <View style={styles.handleWrap}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>
          {title ? <Text style={[styles.title, { color: colors.text }]}>{title}</Text> : null}
          {message ? <Text style={[styles.message, { color: colors.muted }]}>{message}</Text> : null}

          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          >
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
                  activeOpacity={action.disabled ? 1 : 0.9}
                  onPress={() => {
                    if (action.disabled) return;
                    action.onPress();
                    onClose();
                  }}
                >
                  <View style={styles.itemContent}>
                    {action.icon ? (
                      <Ionicons name={action.icon} size={20} color={iconColor} style={styles.itemIcon} />
                    ) : null}
                    <Text style={[styles.itemText, { color: textColor }]}>{action.label}</Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={action.destructive ? palette.destructiveText : colors.muted}
                  />
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {showCancel ? (
            <TouchableOpacity
              style={[
                styles.item,
                styles.cancelItem,
                { borderColor: colors.border, backgroundColor: palette.itemBg },
              ]}
              onPress={onClose}
            >
              <Text style={[styles.itemText, { color: colors.accent }]}>Cancel</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "stretch",
  },
  touchableBackdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 12,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 26,
    elevation: 12,
    maxHeight: "80%",
  },
  handleWrap: { alignItems: "center", marginBottom: 6 },
  handle: { width: 44, height: 4, borderRadius: 2 },
  title: {
    fontSize: 17,
    marginBottom: 4,
    textAlign: "center",
    fontWeight: "800",
  },
  message: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 12,
    lineHeight: 20,
  },
  listContent: {
    paddingBottom: 12,
  },
  item: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  itemContent: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  itemIcon: { marginRight: 12 },
  itemDisabled: { opacity: 0.55 },
  itemText: { fontSize: 15, fontWeight: "700", flexShrink: 1 },
  cancelItem: {
    marginTop: 2,
    justifyContent: "center",
    alignItems: "center",
  },
});
