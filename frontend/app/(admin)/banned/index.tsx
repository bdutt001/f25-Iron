import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "@/context/ThemeContext";

export default function AdminBanned() {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.heading, { color: colors.text }]}>Banned Users</Text>
      <Text style={[styles.body, { color: colors.muted }]}>
        Banned user management will live here. Add list + unban actions once backend endpoints are ready.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 8 },
  heading: { fontSize: 20, fontWeight: "800" },
  body: { fontSize: 14, lineHeight: 20 },
});
