import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View, TouchableOpacity } from "react-native";
import { useAppTheme } from "@/context/ThemeContext";
import { useUser } from "@/context/UserContext";
import { router } from "expo-router";

export default function AdminDashboard() {
  const { colors } = useAppTheme();
  const { currentUser } = useUser();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.heading, { color: colors.text }]}>Admin Dashboard</Text>
      <Text style={[styles.subheading, { color: colors.muted }]}>
        Quick links to moderation queues.
      </Text>

      <View style={styles.cards}>
        <TouchableOpacity
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push("/(admin)/reports")}
        >
          <View style={styles.cardHeader}>
            <Ionicons name="alert-circle-outline" size={20} color={colors.accent} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Reports</Text>
          </View>
          <Text style={[styles.cardBody, { color: colors.muted }]}>
            Review and resolve user reports.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push("/(admin)/banned")}
        >
          <View style={styles.cardHeader}>
            <Ionicons name="person-remove-outline" size={20} color={colors.accent} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Banned Users</Text>
          </View>
          <Text style={[styles.cardBody, { color: colors.muted }]}>
            View or manage banned accounts.
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.meta, { borderColor: colors.border }]}>
        <Text style={[styles.metaText, { color: colors.muted }]}>
          Signed in as {currentUser?.email ?? "Admin"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  heading: { fontSize: 22, fontWeight: "800" },
  subheading: { fontSize: 14, marginBottom: 8 },
  cards: { gap: 12 },
  card: {
    padding: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: "800" },
  cardBody: { fontSize: 14, lineHeight: 20 },
  meta: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  metaText: { fontSize: 12 },
});
