import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Keyboard,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "../../context/ThemeContext";
import { CenterModal } from "./CenterModal";

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
  const { height: windowHeight } = useWindowDimensions();
  const [contentHeight, setContentHeight] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const hasHeader = !!title || !!message;
  const palette = useMemo(
    () => ({
      itemBg: isDark ? "rgba(255,255,255,0.05)" : "#f8fafc",
      destructiveBg: isDark ? "rgba(248,113,113,0.15)" : "#fee2e2",
      destructiveText: isDark ? "#fca5a5" : "#b91c1c",
      icon: colors.icon,
    }),
    [colors.icon, isDark]
  );
  const maxMenuHeight = useMemo(() => {
    const safeHeight = Math.max(0, windowHeight - insets.top - insets.bottom);
    const capped = safeHeight > 0 ? Math.min(safeHeight * 0.85, safeHeight - 32) : 0;
    const target = Math.max(240, capped);
    return safeHeight > 0 ? Math.min(target, safeHeight) : target;
  }, [insets.bottom, insets.top, windowHeight]);
  const scrollEnabled = keyboardVisible || contentHeight > maxMenuHeight;
  const handleContentSizeChange = useCallback((_: number, height: number) => {
    setContentHeight(height);
  }, []);

  return (
    <CenterModal
      visible={visible}
      onRequestClose={onClose}
      cardStyle={[styles.card, { maxHeight: maxMenuHeight }]}
      contentContainerStyle={styles.contentContainer}
      scrollEnabled={scrollEnabled}
      onContentSizeChange={handleContentSizeChange}
    >
      <View accessibilityRole="menu">
        {hasHeader ? (
          <View style={styles.header}>
            {title ? <Text style={[styles.title, { color: colors.text }]}>{title}</Text> : null}
            {message ? (
              <Text style={[styles.message, { color: colors.muted }]}>{message}</Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.listContent}>
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
        </View>

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
    </CenterModal>
  );
}

const styles = StyleSheet.create({
  card: { maxWidth: 420 },
  contentContainer: { paddingBottom: 12 },
  header: { alignItems: "center", marginBottom: 10 },
  title: { fontSize: 17, marginBottom: 4, textAlign: "center", fontWeight: "800" },
  message: { fontSize: 14, textAlign: "center", marginBottom: 10, lineHeight: 20 },
  listContent: { marginBottom: 6 },
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
