import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAppTheme } from "@/context/ThemeContext";
import { useUser } from "@/context/UserContext";
import { AdminDashboardMetrics, fetchAdminMetrics } from "@/utils/admin";

const formatNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString();
};

export default function AdminDashboard() {
  const { colors, isDark } = useAppTheme();
  const { currentUser, fetchWithAuth } = useUser();

  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!currentUser?.isAdmin) {
        setLoadingMetrics(false);
        setRefreshing(false);
        return;
      }
      const silent = options?.silent ?? false;
      if (!silent) setLoadingMetrics(true);
      setError(null);
      try {
        const data = await fetchAdminMetrics(fetchWithAuth);
        setMetrics(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch metrics";
        setError(message);
      } finally {
        if (!silent) setLoadingMetrics(false);
        setRefreshing(false);
      }
    },
    [currentUser?.isAdmin, fetchWithAuth]
  );

  useFocusEffect(
    useCallback(() => {
      void loadMetrics();
    }, [loadMetrics])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadMetrics({ silent: true });
  }, [loadMetrics]);

  const metricCards = useMemo(
    () =>
      metrics
        ? [
            { label: "Total users", value: metrics.totalUsers, icon: "people-outline" as const },
            { label: "Active (24h)", value: metrics.activePast24Hours, icon: "flash-outline" as const },
            { label: "New (7d)", value: metrics.newUsersPast7Days, icon: "trending-up-outline" as const },
            {
              label: "Banned total",
              value: metrics.bannedUsers,
              icon: "person-remove-outline" as const,
              accent: "#ef4444",
            },
            {
              label: "Bans (7d)",
              value: metrics.bansLast7Days,
              icon: "close-circle-outline" as const,
              accent: "#ef4444",
            },
            {
              label: "Open reports",
              value: metrics.openReports,
              icon: "alert-circle-outline" as const,
              accent: "#eab308",
            },
            { label: "Under review", value: metrics.underReviewReports, icon: "time-outline" as const },
            {
              label: "Resolved (7d)",
              value: metrics.resolvedLast7Days,
              icon: "checkmark-done-outline" as const,
              accent: "#22c55e",
            },
            {
              label: "Avg. trust",
              value: metrics.averageTrustScore !== null ? Math.round(metrics.averageTrustScore) : null,
              icon: "shield-checkmark-outline" as const,
            },
          ]
        : [],
    [metrics]
  );

  const renderMetricCard = (card: (typeof metricCards)[number]) => {
    const tint = card.accent ?? colors.text;
    return (
      <View
        key={card.label}
        style={[
          styles.metricCard,
          { backgroundColor: colors.card, borderColor: colors.border, shadowColor: isDark ? "#000" : "#0f172a" },
        ]}
      >
        <View style={styles.metricHeader}>
          <Ionicons name={card.icon} size={18} color={tint} />
          <Text style={[styles.metricLabel, { color: colors.muted }]}>{card.label}</Text>
        </View>
        <Text style={[styles.metricValue, { color: tint }]}>{formatNumber(card.value)}</Text>
      </View>
    );
  };

  const generatedLabel = metrics?.generatedAt ? new Date(metrics.generatedAt).toLocaleString() : null;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.heading, { color: colors.text }]}>Admin Dashboard</Text>
          <Text style={[styles.subheading, { color: colors.muted }]}>
            Moderation snapshot and quick links.
          </Text>
        </View>
        {loadingMetrics ? <ActivityIndicator size="small" color={colors.accent} /> : null}
      </View>

      {error ? (
        <View style={[styles.errorBox, { borderColor: colors.border }]}>
          <Text style={[styles.errorText, { color: colors.text }]}>Metrics unavailable</Text>
          <Text style={{ color: colors.muted }}>{error}</Text>
          <TouchableOpacity
            style={[styles.retryButton, { borderColor: colors.border }]}
            onPress={() => loadMetrics()}
          >
            <Text style={{ color: colors.text, fontWeight: "700" }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.metricsGrid}>
        {metricCards.map(renderMetricCard)}
        {metricCards.length === 0 && !loadingMetrics ? (
          <View style={styles.emptyMetrics}>
            <Text style={{ color: colors.muted }}>Metrics will appear here.</Text>
          </View>
        ) : null}
      </View>
      {generatedLabel ? (
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: -4 }}>
          Updated {generatedLabel}
        </Text>
      ) : null}

      <Text style={[styles.sectionHeading, { color: colors.text }]}>Queues</Text>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  heading: { fontSize: 22, fontWeight: "800" },
  subheading: { fontSize: 14, marginBottom: 8 },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metricCard: {
    width: "48%",
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
    gap: 6,
  },
  metricHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  metricLabel: { fontSize: 13, fontWeight: "700" },
  metricValue: { fontSize: 24, fontWeight: "800" },
  emptyMetrics: {
    width: "100%",
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeading: { fontSize: 16, fontWeight: "800", marginTop: 12 },
  cards: { gap: 12, marginTop: 8 },
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
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  metaText: { fontSize: 12 },
  errorBox: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  errorText: { fontSize: 14, fontWeight: "800" },
  retryButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
});
