import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAppTheme } from "@/context/ThemeContext";
import { useUser } from "@/context/UserContext";
import { useThemedAlert } from "@/hooks/useThemedAlert";
import { BannedUser, fetchBannedUsers, unbanUser } from "@/utils/admin";
import { AppScreen } from "@/components/layout/AppScreen";

export default function AdminBanned() {
  const { colors, isDark } = useAppTheme();
  const { currentUser, fetchWithAuth } = useUser();
  const { showError, showInfo } = useThemedAlert();

  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queryInput, setQueryInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [total, setTotal] = useState<number>(0);
  const [unbanningId, setUnbanningId] = useState<number | null>(null);

  const loadBanned = useCallback(
    async (options?: { silent?: boolean; query?: string }) => {
      if (!currentUser?.isAdmin) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
      const silent = options?.silent ?? false;
      const query = options?.query ?? activeQuery;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const data = await fetchBannedUsers(fetchWithAuth, {
          query: query.trim() || undefined,
          limit: 100,
        });
        setBannedUsers(data.users);
        setTotal(data.total ?? data.users.length);
        setActiveQuery(query);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load banned users";
        setError(message);
      } finally {
        if (!silent) setLoading(false);
        setRefreshing(false);
      }
    },
    [activeQuery, currentUser?.isAdmin, fetchWithAuth]
  );

  useFocusEffect(
    useCallback(() => {
      void loadBanned();
    }, [loadBanned])
  );

  const onSearch = () => {
    setActiveQuery(queryInput.trim());
    void loadBanned({ query: queryInput.trim() });
  };

  const clearSearch = () => {
    setQueryInput("");
    setActiveQuery("");
    void loadBanned({ query: "" });
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadBanned({ silent: true });
  }, [loadBanned]);

  const handleUnban = (user: BannedUser) => {
    Alert.alert(
      "Unban user",
      `Allow ${user.name || user.email || `User ${user.id}`} to log back in?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unban",
          style: "destructive",
          onPress: async () => {
            setUnbanningId(user.id);
            try {
              await unbanUser(user.id, fetchWithAuth);
              setBannedUsers((prev) => prev.filter((u) => u.id !== user.id));
              setTotal((prev) => Math.max(prev - 1, 0));
              showInfo("User unbanned successfully", "Unbanned");
            } catch (err) {
              showError(err instanceof Error ? err.message : "Failed to unban user");
            } finally {
              setUnbanningId(null);
            }
          },
        },
      ]
    );
  };

  const renderUser = ({ item }: { item: BannedUser }) => {
    const bannedAtLabel = item.bannedAt
      ? new Date(item.bannedAt).toLocaleDateString()
      : "Unknown date";
    const lastLoginLabel = item.lastLogin ? new Date(item.lastLogin).toLocaleDateString() : "—";
    return (
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
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
              {item.name || item.email || `User ${item.id}`}
            </Text>
            <Text style={[styles.subtle, { color: colors.muted }]} numberOfLines={1}>
              {item.email || "Email unknown"}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: "#fee2e2" }]}>
            <Text style={[styles.badgeText, { color: "#b91c1c" }]}>Banned</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaPill}>
            <Ionicons name="calendar-outline" size={14} color={colors.icon} />
            <Text style={[styles.metaText, { color: colors.text }]}>
              Banned {bannedAtLabel}
            </Text>
          </View>
          <View style={[styles.metaPill, { backgroundColor: isDark ? "#111827" : "#eef2ff" }]}>
            <Ionicons name="shield-checkmark-outline" size={14} color={colors.accent} />
            <Text style={[styles.metaText, { color: colors.accent }]}>
              Trust {typeof item.trustScore === "number" ? item.trustScore : "—"}
            </Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaPill}>
            <Ionicons name="time-outline" size={14} color={colors.icon} />
            <Text style={[styles.metaText, { color: colors.text }]}>
              Last login {lastLoginLabel}
            </Text>
          </View>
          <View style={styles.metaPill}>
            <Ionicons name="hourglass-outline" size={14} color={colors.icon} />
            <Text style={[styles.metaText, { color: colors.text }]}>
              Joined {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "—"}
            </Text>
          </View>
        </View>

        {item.banReason ? (
          <Text style={[styles.reason, { color: colors.muted }]} numberOfLines={2}>
            Reason: {item.banReason}
          </Text>
        ) : null}

        <TouchableOpacity
          style={[styles.unbanButton, { borderColor: colors.border }]}
          onPress={() => handleUnban(item)}
          disabled={unbanningId === item.id}
        >
          <Ionicons name="refresh-circle-outline" size={18} color={colors.text} />
          <Text style={[styles.unbanText, { color: colors.text }]}>
            {unbanningId === item.id ? "Unbanning..." : "Unban user"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const headerSummary = useMemo(() => {
    if (loading && bannedUsers.length === 0) return null;
    return (
      <View style={[styles.summary, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Text style={{ color: colors.text, fontWeight: "800" }}>{total} banned users</Text>
        {activeQuery ? (
          <Text style={{ color: colors.muted }}>Filtered by “{activeQuery}”</Text>
        ) : (
          <Text style={{ color: colors.muted }}>Most recent bans first</Text>
        )}
      </View>
    );
  }, [activeQuery, bannedUsers.length, colors.border, colors.card, colors.muted, colors.text, loading, total]);

  if (!currentUser?.isAdmin) {
    return (
      <AppScreen edges={["bottom"]}>
        <View style={[styles.centered, { backgroundColor: colors.background }]}>
          <Text style={[styles.heading, { color: colors.text }]}>Not authorized</Text>
          <Text style={[styles.body, { color: colors.muted }]}>
            Sign in as an admin to manage bans.
          </Text>
        </View>
      </AppScreen>
    );
  }

  const showLoader = loading && !refreshing && bannedUsers.length === 0;

  return (
    <AppScreen edges={["bottom"]}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.searchRow}>
          <View style={[styles.searchInput, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Ionicons name="search" size={16} color={colors.muted} />
            <TextInput
              placeholder="Search by email or name"
              placeholderTextColor={colors.muted}
              value={queryInput}
              onChangeText={setQueryInput}
              onSubmitEditing={onSearch}
              style={[styles.input, { color: colors.text }]}
              returnKeyType="search"
            />
            {queryInput ? (
              <TouchableOpacity onPress={clearSearch}>
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity
            style={[styles.searchButton, { backgroundColor: colors.accent }]}
            onPress={onSearch}
          >
            <Text style={styles.searchButtonText}>Search</Text>
          </TouchableOpacity>
        </View>

      {headerSummary}

      {error && !showLoader ? (
        <View style={[styles.centered, { paddingVertical: 20 }]}>
          <Text style={{ color: colors.text, fontWeight: "700" }}>Error loading bans</Text>
          <Text style={{ color: colors.muted, marginBottom: 8 }}>{error}</Text>
          <TouchableOpacity style={[styles.retryButton, { borderColor: colors.border }]} onPress={() => loadBanned()}>
            <Text style={{ color: colors.text, fontWeight: "700" }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {showLoader ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={{ marginTop: 12, color: colors.text }}>Loading banned users...</Text>
        </View>
      ) : (
        <FlatList
          data={bannedUsers}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderUser}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={[styles.listContent, bannedUsers.length === 0 && { flex: 1 }]}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="checkmark-circle" size={36} color={colors.accent} />
              <Text style={{ color: colors.text, fontWeight: "800", marginTop: 8 }}>
                No banned users
              </Text>
              <Text style={{ color: colors.muted, textAlign: "center" }}>
                Everyone is currently in good standing.
              </Text>
            </View>
          }
        />
      )}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  heading: { fontSize: 20, fontWeight: "800" },
  body: { fontSize: 14, lineHeight: 20 },
  searchRow: { flexDirection: "row", gap: 10 },
  searchInput: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  input: { flex: 1, paddingVertical: 0 },
  searchButton: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  searchButtonText: { color: "#fff", fontWeight: "800" },
  summary: {
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  listContent: { gap: 12, paddingBottom: 20 },
  card: {
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
    gap: 8,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontSize: 16, fontWeight: "800" },
  subtle: { fontSize: 12 },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: "800" },
  metaRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
  },
  metaText: { fontSize: 12, fontWeight: "700" },
  reason: { fontSize: 13, lineHeight: 18 },
  unbanButton: {
    marginTop: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  unbanText: { fontWeight: "800" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
