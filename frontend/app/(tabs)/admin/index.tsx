import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAppTheme } from "@/context/ThemeContext";
import { useUser } from "@/context/UserContext";
import {
  AdminReportSummary,
  REPORT_STATUSES,
  ReportStatus,
  fetchAdminReports,
} from "@/utils/admin";

const statusPriority: Record<ReportStatus, number> = {
  NEEDS_REVIEW: 0,
  UNDER_REVIEW: 1,
  RESOLVED_ACTION: 2,
  RESOLVED_NO_ACTION: 3,
};

const statusLabels: Record<ReportStatus, string> = {
  NEEDS_REVIEW: "Needs review",
  UNDER_REVIEW: "Under review",
  RESOLVED_ACTION: "Action taken",
  RESOLVED_NO_ACTION: "No action",
};

const statusColors: Record<ReportStatus, string> = {
  NEEDS_REVIEW: "#ef4444",
  UNDER_REVIEW: "#eab308",
  RESOLVED_ACTION: "#22c55e",
  RESOLVED_NO_ACTION: "#0ea5e9",
};

const Unauthorized = ({ onBack }: { onBack?: () => void }) => (
  <View style={styles.centered}>
    <Text style={styles.unauthorizedTitle}>Not authorized</Text>
    <Text style={styles.unauthorizedCopy}>
      You need an admin account to view moderation tools.
    </Text>
    {onBack ? (
      <TouchableOpacity style={styles.primaryButton} onPress={onBack}>
        <Text style={styles.primaryButtonText}>Go back</Text>
      </TouchableOpacity>
    ) : null}
  </View>
);

export default function AdminReportsScreen() {
  const { colors, isDark } = useAppTheme();
  const { currentUser, fetchWithAuth } = useUser();
  const router = useRouter();

  const [reports, setReports] = useState<AdminReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStatuses, setSelectedStatuses] = useState<Set<ReportStatus>>(
    () => new Set<ReportStatus>(["NEEDS_REVIEW", "UNDER_REVIEW"])
  );
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const loadReports = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!currentUser?.isAdmin) {
        setLoading(false);
        setRefreshing(false);
        setReports([]);
        return;
      }
      const silent = options?.silent ?? false;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const statuses = Array.from(selectedStatuses);
        const data = await fetchAdminReports(fetchWithAuth, {
          statuses: statuses.length ? statuses : undefined,
          order,
        });
        setReports(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load reports";
        setError(message);
      } finally {
        if (!silent) setLoading(false);
        setRefreshing(false);
      }
    },
    [currentUser?.isAdmin, fetchWithAuth, order, selectedStatuses]
  );

  useFocusEffect(
    useCallback(() => {
      void loadReports();
    }, [loadReports])
  );

  const toggleStatus = (status: ReportStatus) => {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  const visibleReports = useMemo(() => {
    const activeStatuses = Array.from(selectedStatuses);
    const filtered = activeStatuses.length
      ? reports.filter((r) => activeStatuses.includes(r.status))
      : reports;

    return filtered.sort((a, b) => {
      const priorityDiff = statusPriority[a.status] - statusPriority[b.status];
      if (priorityDiff !== 0) return priorityDiff;
      const aDate = new Date(a.createdAt).getTime();
      const bDate = new Date(b.createdAt).getTime();
      return order === "asc" ? aDate - bDate : bDate - aDate;
    });
  }, [order, reports, selectedStatuses]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadReports({ silent: true });
  }, [loadReports]);

  const resetFilters = () => {
    setSelectedStatuses(new Set<ReportStatus>(["NEEDS_REVIEW", "UNDER_REVIEW"]));
    setOrder("desc");
  };

  const renderStatusChip = (status: ReportStatus) => {
    const active = selectedStatuses.has(status);
    return (
      <Pressable
        key={status}
        onPress={() => toggleStatus(status)}
        style={({ pressed }) => [
          styles.chip,
          {
            backgroundColor: active
              ? `${statusColors[status]}22`
              : isDark
              ? "rgba(255,255,255,0.05)"
              : "rgba(0,0,0,0.03)",
            borderColor: active ? statusColors[status] : colors.border,
          },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Text
          style={[
            styles.chipText,
            { color: active ? statusColors[status] : colors.text },
          ]}
        >
          {statusLabels[status]}
        </Text>
      </Pressable>
    );
  };

  const renderReport = ({ item }: { item: AdminReportSummary }) => {
    const createdAt = new Date(item.createdAt);
    const statusColor = statusColors[item.status];
    const trustScore =
      typeof item.reported.trustScore === "number" ? item.reported.trustScore : null;
    return (
      <Pressable
        onPress={() =>
          router.push({
            pathname: "/(tabs)/admin/[reportId]",
            params: { reportId: String(item.id) },
          })
        }
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            shadowColor: isDark ? "#000" : "#0f172a",
          },
          pressed && { opacity: 0.9 },
        ]}
      >
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Report #{item.id}</Text>
            <Text style={[styles.cardSubtitle, { color: colors.muted }]}>
              {createdAt.toLocaleString()}
            </Text>
          </View>
          <View
            style={[
              styles.statusPill,
              { borderColor: statusColor, backgroundColor: `${statusColor}1a` },
            ]}
          >
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabels[item.status]}</Text>
          </View>
        </View>

        <Text style={[styles.reason, { color: colors.text }]} numberOfLines={2}>
          {item.reason || "No reason provided"}
        </Text>
        {item.description ? (
          <Text style={[styles.description, { color: colors.muted }]} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}

        <View style={styles.row}>
          <View style={styles.personBlock}>
            <Text style={[styles.label, { color: colors.muted }]}>Reporter</Text>
            <Text style={[styles.personName, { color: colors.text }]} numberOfLines={1}>
              {item.reporter.name || item.reporter.email || `User ${item.reporter.id}`}
            </Text>
          </View>
          <View style={styles.personBlock}>
            <Text style={[styles.label, { color: colors.muted }]}>Reported</Text>
            <Text style={[styles.personName, { color: colors.text }]} numberOfLines={1}>
              {item.reported.name || item.reported.email || `User ${item.reported.id}`}
            </Text>
            {trustScore !== null ? (
              <Text style={[styles.trust, { color: colors.text }]}>
                Trust {trustScore}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  };

  if (!currentUser?.isAdmin) {
    return <Unauthorized onBack={() => router.replace("/(tabs)/nearby")} />;
  }

  if (loading && !refreshing && reports.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={{ marginTop: 12, color: colors.text }}>Loading reports...</Text>
      </View>
    );
  }

  if (error && reports.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.error, { color: colors.text }]}>Error: {error}</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => loadReports()}>
          <Text style={styles.primaryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.filterBar}>
        <View style={styles.chipsRow}>
          {REPORT_STATUSES.map(renderStatusChip)}
        </View>
        <View style={styles.filterActions}>
          <TouchableOpacity
            style={[
              styles.secondaryButton,
              {
                borderColor: colors.border,
                backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "#ffffff",
              },
            ]}
            onPress={() => setOrder((prev) => (prev === "desc" ? "asc" : "desc"))}
          >
            <Ionicons
              name={order === "desc" ? "arrow-down" : "arrow-up"}
              size={16}
              color={colors.text}
              style={{ marginRight: 6 }}
            />
            <Text style={{ color: colors.text, fontWeight: "700" }}>
              {order === "desc" ? "Newest first" : "Oldest first"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: colors.border }]}
            onPress={resetFilters}
          >
            <Text style={{ color: colors.text, fontWeight: "700" }}>Reset</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={visibleReports}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderReport}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={[styles.listContent, visibleReports.length === 0 && { flex: 1 }]}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={{ color: colors.muted }}>No reports found for the selected filters.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 10 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  error: { fontWeight: "700" },
  filterBar: { gap: 10 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontWeight: "700", fontSize: 12 },
  filterActions: { flexDirection: "row", gap: 8 },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
  },
  primaryButton: {
    backgroundColor: "#0ea5e9",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryButtonText: { color: "#fff", fontWeight: "700" },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
    gap: 8,
  },
  cardHeader: { flexDirection: "row", alignItems: "center" },
  cardTitle: { fontSize: 16, fontWeight: "800" },
  cardSubtitle: { fontSize: 12 },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusText: { fontWeight: "700", fontSize: 12 },
  reason: { fontSize: 15, fontWeight: "700" },
  description: { fontSize: 13, lineHeight: 18 },
  row: { flexDirection: "row", gap: 12, marginTop: 4 },
  personBlock: { flex: 1 },
  label: { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 },
  personName: { fontSize: 14, fontWeight: "700" },
  trust: { marginTop: 2, fontWeight: "700", fontSize: 12 },
  listContent: { paddingBottom: 24, gap: 12 },
  unauthorizedTitle: { fontSize: 20, fontWeight: "800" },
  unauthorizedCopy: { textAlign: "center" },
});
