import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAppTheme } from "@/context/ThemeContext";
import { useUser } from "@/context/UserContext";
import {
  AdminReportDetail,
  AdminReportUser,
  REPORT_STATUSES,
  ReportStatus,
  adjustTrustScore,
  banUser,
  fetchAdminReportDetail,
  updateReportStatus,
} from "@/utils/admin";
import { useThemedAlert } from "@/hooks/useThemedAlert";

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

const MessageBubble = ({
  content,
  createdAt,
  isReporter,
  isDark,
  colors,
}: {
  content: string;
  createdAt: string;
  isReporter: boolean;
  isDark: boolean;
  colors: ReturnType<typeof useAppTheme>["colors"];
}) => {
  const timeLabel = useMemo(() => {
    const date = new Date(createdAt);
    return date.toLocaleString();
  }, [createdAt]);

  return (
    <View
      style={[
        styles.messageRow,
        { justifyContent: isReporter ? "flex-end" : "flex-start" },
      ]}
    >
      <View
        style={[
          styles.bubble,
          isReporter
            ? {
                backgroundColor: colors.accent,
                borderColor: colors.accent,
                alignSelf: "flex-end",
              }
            : {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
        ]}
      >
        <Text style={[styles.bubbleText, { color: isReporter ? "#fff" : colors.text }]}>
          {content}
        </Text>
        <Text
          style={[
            styles.bubbleMeta,
            { color: isReporter ? "#e7ecff" : isDark ? "#cdd2eb" : "#6b7280" },
          ]}
        >
          {timeLabel}
        </Text>
      </View>
    </View>
  );
};

export default function AdminReportDetailScreen() {
  const { colors, isDark } = useAppTheme();
  const { currentUser, fetchWithAuth } = useUser();
  const router = useRouter();
  const { showError, showInfo } = useThemedAlert();
  const { reportId } = useLocalSearchParams<{ reportId?: string }>();

  const numericId = Number(reportId);
  const [detail, setDetail] = useState<AdminReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingTrust, setUpdatingTrust] = useState(false);
  const [trustSetTo, setTrustSetTo] = useState<string>("");

  const loadDetail = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!Number.isFinite(numericId) || !currentUser?.isAdmin) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
      const silent = options?.silent ?? false;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const data = await fetchAdminReportDetail(numericId, fetchWithAuth);
        setDetail(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load report";
        setError(message);
      } finally {
        if (!silent) setLoading(false);
        setRefreshing(false);
      }
    },
    [currentUser?.isAdmin, fetchWithAuth, numericId]
  );

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadDetail({ silent: true });
  }, [loadDetail]);

  const handleStatusChange = async (status: ReportStatus) => {
    if (!detail || updatingStatus) return;
    setUpdatingStatus(true);
    try {
      const updated = await updateReportStatus(detail.id, status, fetchWithAuth, detail.resolutionNote);
      setDetail((prev) => (prev ? { ...prev, ...updated } : updated));
      showInfo(status === "UNDER_REVIEW" ? "Marked as under review" : "Status updated", "Status");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const applyTrustChange = async (change: { delta?: number; setTo?: number }) => {
    if (!detail) return;
    if (updatingTrust) return;

    const nextValue = typeof change.setTo === "number" ? change.setTo : change.delta ?? 0;
    if (Math.abs(nextValue) >= 20) {
      const dropMessage =
        typeof change.setTo === "number"
          ? `Set trust score to ${change.setTo}?`
          : `Apply a ${change.delta} change to trust score?`;
      Alert.alert("Confirm trust change", dropMessage, [
        { text: "Cancel", style: "cancel" },
        { text: "Apply", style: "destructive", onPress: () => void applyTrustChangeInternal(change) },
      ]);
      return;
    }
    await applyTrustChangeInternal(change);
  };

  const applyTrustChangeInternal = async (change: { delta?: number; setTo?: number }) => {
    if (!detail) return;
    setUpdatingTrust(true);
    try {
      const newScore = await adjustTrustScore(detail.reported.id, fetchWithAuth, change);
      setDetail((prev) =>
        prev
          ? { ...prev, reported: { ...prev.reported, trustScore: newScore } }
          : prev
      );
      setTrustSetTo("");
      showInfo(`Trust score updated to ${newScore}`, "Trust score");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to update trust score");
    } finally {
      setUpdatingTrust(false);
    }
  };

  const confirmBan = () => {
    if (!detail) return;
    Alert.alert(
      "Confirm ban",
      "Are you sure you want to ban this user? They will be unable to log in or create a new account with this email.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Ban user",
          style: "destructive",
          onPress: async () => {
            try {
              const result = await banUser(detail.reported.id, fetchWithAuth);
              setDetail((prev) =>
                prev
                  ? {
                      ...prev,
                      reported: {
                        ...prev.reported,
                        banned: result.banned,
                        bannedAt: result.bannedAt ?? prev.reported.bannedAt,
                        banReason: result.banReason ?? prev.reported.banReason,
                      },
                    }
                  : prev
              );
              showInfo("User banned successfully", "Ban");
            } catch (err) {
              showError(err instanceof Error ? err.message : "Failed to ban user");
            }
          },
        },
      ]
    );
  };

  const statusBadge = (status: ReportStatus) => {
    const color = statusColors[status];
    return (
      <View
        style={[
          styles.statusPill,
          { borderColor: color, backgroundColor: `${color}1a` },
        ]}
      >
        <Text style={[styles.statusText, { color }]}>{statusLabels[status]}</Text>
      </View>
    );
  };

  const renderUserCard = (label: string, user: AdminReportUser, accent: string) => {
    return (
      <View
        style={[
          styles.userCard,
          {
            borderColor: colors.border,
            backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "#ffffff",
          },
        ]}
      >
        <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
        <Text style={[styles.personName, { color: colors.text }]}>
          {user.name || user.email || `User ${user.id}`}
        </Text>
        <View style={styles.userMetaRow}>
          <View style={styles.metaPill}>
            <Ionicons name="mail-outline" size={14} color={colors.icon} />
            <Text style={[styles.metaText, { color: colors.muted }]}>
              {user.email || "Unknown"}
            </Text>
          </View>
          {typeof user.trustScore === "number" ? (
            <View style={[styles.metaPill, { backgroundColor: `${accent}12` }]}>
              <Ionicons name="shield-checkmark-outline" size={14} color={accent} />
              <Text style={[styles.metaText, { color: accent }]}>
                Trust {user.trustScore}
              </Text>
            </View>
          ) : null}
        </View>
        {user.banned ? (
          <Text style={[styles.banLabel, { color: "#ef4444" }]}>
            Banned {user.bannedAt ? `on ${new Date(user.bannedAt).toLocaleDateString()}` : ""}
          </Text>
        ) : null}
      </View>
    );
  };

  if (!currentUser?.isAdmin) {
    return (
      <View style={styles.centered}>
        <Text style={styles.unauthorizedTitle}>Not authorized</Text>
        <Text style={styles.unauthorizedCopy}>
          You need an admin account to view this report.
        </Text>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.accent }]}
          onPress={() => router.replace("/(tabs)/nearby")}
        >
          <Text style={styles.primaryButtonText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={{ marginTop: 12, color: colors.text }}>Loading report...</Text>
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.error, { color: colors.text }]}>{error || "Report not found"}</Text>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.accent }]}
          onPress={() => loadDetail()}
        >
          <Text style={styles.primaryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const createdAt = new Date(detail.createdAt);
  const updatedAt = detail.updatedAt ? new Date(detail.updatedAt) : null;
  const trustScore =
    typeof detail.reported.trustScore === "number" ? detail.reported.trustScore : null;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerStyle={{ paddingBottom: 32 }}
    >
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
        <View style={styles.headerRow}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Report #{detail.id}
            </Text>
            <Text style={[styles.cardSubtitle, { color: colors.muted }]}>
              Created {createdAt.toLocaleString()}
            </Text>
            {updatedAt ? (
              <Text style={[styles.cardSubtitle, { color: colors.muted }]}>
                Updated {updatedAt.toLocaleString()}
              </Text>
            ) : null}
          </View>
          {statusBadge(detail.status)}
        </View>
        <Text style={[styles.reason, { color: colors.text }]}>{detail.reason}</Text>
        {detail.description ? (
          <Text style={[styles.description, { color: colors.muted }]}>{detail.description}</Text>
        ) : null}
      </View>

      <View style={styles.userRow}>
        {renderUserCard("Reporter", detail.reporter, colors.accent)}
        {renderUserCard("Reported", detail.reported, "#ef4444")}
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border, gap: 12 },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Status</Text>
        <View style={styles.chipsRow}>
          {REPORT_STATUSES.map((status) => {
            const active = status === detail.status;
            const color = statusColors[status];
            return (
              <TouchableOpacity
                key={status}
                onPress={() => handleStatusChange(status)}
                disabled={updatingStatus}
                style={[
                  styles.statusChip,
                  {
                    borderColor: active ? color : colors.border,
                    backgroundColor: active ? `${color}1a` : "transparent",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: active ? color : colors.text },
                  ]}
                >
                  {statusLabels[status]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {updatingStatus ? (
          <View style={styles.inlineRow}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={{ marginLeft: 8, color: colors.muted }}>Updating status...</Text>
          </View>
        ) : null}
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border, gap: 12 },
        ]}
      >
        <View style={styles.inlineRow}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Trust score</Text>
          {trustScore !== null ? (
            <Text style={{ color: colors.muted }}>
              Current: <Text style={{ color: colors.text, fontWeight: "700" }}>{trustScore}</Text>
            </Text>
          ) : null}
        </View>
        <View style={styles.trustButtonsRow}>
          {[-5, -10, -20].map((delta) => (
            <TouchableOpacity
              key={delta}
              style={[styles.trustButton, { borderColor: colors.border }]}
              onPress={() => applyTrustChange({ delta })}
              disabled={updatingTrust}
            >
              <Text style={{ color: colors.text, fontWeight: "700" }}>
                {delta > 0 ? `+${delta}` : delta}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.inlineRow}>
          <TextInput
            placeholder="Set to value"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            value={trustSetTo}
            onChangeText={setTrustSetTo}
            style={[
              styles.input,
              {
                borderColor: colors.border,
                color: colors.text,
                backgroundColor: isDark ? "#1f2639" : "#ffffff",
              },
            ]}
          />
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.accent }]}
            disabled={updatingTrust}
            onPress={() => {
              const setTo = Number(trustSetTo);
              if (Number.isNaN(setTo)) {
                showError("Enter a number to set the trust score");
                return;
              }
              void applyTrustChange({ setTo });
            }}
          >
            <Text style={styles.primaryButtonText}>
              {updatingTrust ? "..." : "Apply"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border, gap: 10 },
        ]}
      >
        <View style={styles.inlineRow}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Actions</Text>
        </View>
        <TouchableOpacity
          style={[styles.banButton, { borderColor: "#ef4444" }]}
          onPress={confirmBan}
        >
          <Ionicons name="hammer-outline" size={16} color="#ef4444" />
          <Text style={styles.banButtonText}>Ban user</Text>
        </TouchableOpacity>
        {detail.reported.banned && (
          <Text style={[styles.banLabel, { color: "#ef4444" }]}>
            User is banned{detail.reported.bannedAt ? ` since ${new Date(detail.reported.bannedAt).toLocaleDateString()}` : ""}.
          </Text>
        )}
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border, gap: 10 },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Context messages</Text>
        <Text style={[styles.cardSubtitle, { color: colors.muted }]}>
          Conversation between the reporter and reported user (most recent thread).
        </Text>
        {detail.contextMessages.length === 0 ? (
          <Text style={{ color: colors.muted }}>No message context found.</Text>
        ) : (
          detail.contextMessages.map((msg) => (
            <MessageBubble
              key={msg.id}
              content={msg.content}
              createdAt={msg.createdAt}
              isReporter={msg.senderId === detail.reporter.id}
              isDark={isDark}
              colors={colors}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: {
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  cardTitle: { fontSize: 18, fontWeight: "800" },
  cardSubtitle: { fontSize: 12 },
  reason: { fontSize: 16, fontWeight: "700", marginTop: 4 },
  description: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusText: { fontWeight: "700", fontSize: 12 },
  userRow: { flexDirection: "row", gap: 12, paddingHorizontal: 16, marginTop: 12 },
  userCard: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  label: { fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase" },
  personName: { fontSize: 16, fontWeight: "800" },
  userMetaRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
  },
  metaText: { fontSize: 12, fontWeight: "600" },
  sectionTitle: { fontSize: 16, fontWeight: "800" },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontWeight: "700" },
  inlineRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  trustButtonsRow: { flexDirection: "row", gap: 8 },
  trustButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  banButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
  },
  banButtonText: { color: "#ef4444", fontWeight: "800" },
  banLabel: { fontSize: 12, fontWeight: "700" },
  messageRow: { flexDirection: "row", marginVertical: 4 },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    maxWidth: "80%",
    borderWidth: StyleSheet.hairlineWidth,
  },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  bubbleMeta: { marginTop: 4, fontSize: 11 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 12 },
  error: { fontWeight: "700" },
  primaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryButtonText: { color: "#fff", fontWeight: "700" },
  unauthorizedTitle: { fontSize: 20, fontWeight: "800" },
  unauthorizedCopy: { textAlign: "center", color: "#6b7280" },
});
