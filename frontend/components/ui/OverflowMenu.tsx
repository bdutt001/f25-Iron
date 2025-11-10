import React from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";

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
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTouch} activeOpacity={1} onPress={onClose} />

        <View style={styles.sheet} accessibilityRole="menu">
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {actions.map((a) => (
            <TouchableOpacity
              key={a.key}
              accessibilityRole="menuitem"
              style={[styles.item, a.destructive && styles.itemDestructive, a.disabled && styles.itemDisabled]}
              activeOpacity={a.disabled ? 1 : 0.7}
              onPress={() => {
                if (a.disabled) return;
                a.onPress();
                onClose();
              }}
            >
              <Text style={[styles.itemText, a.destructive && styles.itemTextDestructive]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[styles.item, styles.cancelItem]} onPress={onClose}>
            <Text style={[styles.itemText, styles.cancelText]}>Cancel</Text>
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
  },
  itemDestructive: {
    backgroundColor: Platform.OS === "ios" ? "#fff5f5" : "#fde7e9",
  },
  itemDisabled: { opacity: 0.5 },
  itemText: { fontSize: 16, color: "#111", textAlign: "center", fontWeight: "600" },
  itemTextDestructive: { color: "#b00020" },
  cancelItem: { backgroundColor: "#fff" },
  cancelText: { color: "#1f5fbf", fontWeight: "700" },
});

