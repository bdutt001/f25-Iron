import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAppTheme } from "@/context/ThemeContext";
import { useUser } from "@/context/UserContext";

export default function AdminSettings() {
  const { colors, isDark } = useAppTheme();
  const { currentUser, logout } = useUser();

  const handleLogout = () => {
    Alert.alert("Log out", "Sign out of the admin dashboard?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => void logout() },
    ]);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: 24 }}
    >
      <Text style={[styles.heading, { color: colors.text }]}>Admin settings</Text>
      <Text style={[styles.subheading, { color: colors.muted }]}>
        Manage your session and view who you are signed in as.
      </Text>

      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            shadowColor: isDark ? "#000" : "#0f172a",
          },
        ]}
      >
        <View style={styles.cardHeader}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.accent} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>Signed in as</Text>
        </View>
        <Text style={[styles.primaryText, { color: colors.text }]}>
          {currentUser?.name || currentUser?.email || "Admin"}
        </Text>
        <Text style={{ color: colors.muted }}>
          {currentUser?.email || "No email on file"}
        </Text>
        <View style={styles.metaRow}>
          <View style={[styles.metaPill, { borderColor: colors.border }]}>
            <Ionicons name="people-circle-outline" size={14} color={colors.icon} />
            <Text style={[styles.metaText, { color: colors.text }]}>Admin access</Text>
          </View>
          {currentUser?.createdAt ? (
            <View style={[styles.metaPill, { borderColor: colors.border }]}>
              <Ionicons name="calendar-outline" size={14} color={colors.icon} />
              <Text style={[styles.metaText, { color: colors.text }]}>
                Since {new Date(currentUser.createdAt).toLocaleDateString()}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: isDark ? "#231f24" : "#fff5f5",
            borderColor: isDark ? "#3f2d2f" : "#fecdd3",
            shadowColor: isDark ? "#000" : "#0f172a",
          },
        ]}
      >
        <View style={styles.cardHeader}>
          <Ionicons name="warning-outline" size={20} color="#ef4444" />
          <Text style={[styles.cardTitle, { color: colors.text }]}>Session</Text>
        </View>
        <Text style={[styles.subheading, { color: colors.muted }]}>
          If you need to switch accounts or drop admin access, sign out below.
        </Text>
        <TouchableOpacity style={[styles.logoutButton, { backgroundColor: "#ef4444" }]} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={18} color="#fff" />
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  heading: { fontSize: 22, fontWeight: "800", marginBottom: 4 },
  subheading: { fontSize: 14, marginBottom: 12 },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
    gap: 8,
    marginTop: 12,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: "800" },
  primaryText: { fontSize: 16, fontWeight: "700" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  metaText: { fontSize: 12, fontWeight: "700" },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  logoutText: { color: "#fff", fontWeight: "800" },
});
