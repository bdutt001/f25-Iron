/**
 * NearbyScreen component displays a list of users nearby relative to the current user's location.
 * For demo purposes, it simulates user proximity centered around Old Dominion University (Norfolk, VA).
 * It fetches user data from the API, calculates distances, and allows toggling visibility status.
 */

import * as Location from "expo-location";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Button,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  Pressable,
  Alert,
  TouchableOpacity,
  Platform,
} from "react-native";
import type { AlertOptions, ListRenderItemInfo } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import UserOverflowMenu from "../../components/UserOverflowMenu";
import { useUser } from "../../context/UserContext";
import { API_BASE_URL } from "@/utils/api";
import { useAppTheme } from "../../context/ThemeContext";
import {
  ApiUser,
  NearbyUser,
  formatDistance,
  haversineDistanceMeters,
  scatterUsersAround,
} from "../../utils/geo";
import { rankNearbyUsers } from "../../utils/rank";

// Fixed center: Old Dominion University (Norfolk, VA)
const ODU_CENTER = { latitude: 36.885, longitude: -76.305 };

// Types
type NearbyWithDistance = NearbyUser & {
  distanceMeters: number;   // for display only
  score?: number;           // matchmaking score 0..1
};

// Defensive tags normalization
const normalizeTags = (tags: unknown): string[] =>
  Array.isArray(tags)
    ? tags.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    : [];

const trustColorForScore = (score: number) => {
  if (score >= 90) return "#28a745";
  if (score >= 70) return "#7ED957";
  if (score >= 51) return "#FFC107";
  return "#DC3545";
};

export default function NearbyScreen() {
  const { colors, isDark } = useAppTheme();
  const alertAppearance = useMemo<AlertOptions>(
    () => ({ userInterfaceStyle: isDark ? "dark" : "light" }),
    [isDark]
  );
  const [location, setLocation] = useState<Location.LocationObjectCoords | null>({
    latitude: ODU_CENTER.latitude,
    longitude: ODU_CENTER.longitude,
    altitude: undefined as any,
    accuracy: undefined as any,
    altitudeAccuracy: undefined as any,
    heading: undefined as any,
    speed: undefined as any,
  });
  const [users, setUsers] = useState<NearbyWithDistance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuTarget, setMenuTarget] = useState<ApiUser | null>(null);

  const {
    status,
    setStatus,
    isStatusUpdating,
    accessToken,
    currentUser,
    prefetchedUsers,
    setPrefetchedUsers,
    fetchWithAuth,
  } = useUser();

  /**
   * Build final ranked list:
   * 1) filter (visibility, not current user)
   * 2) scatter (demo coords)
   * 3) rank by SCORE ONLY (tagSim weight 1.0, distance weight 0.0)
   * 4) compute distance for display (does NOT affect order)
   */
  const buildRankedList = useCallback(
    (rawUsers: ApiUser[], coords: Location.LocationObjectCoords): NearbyWithDistance[] => {
      const filtered = Array.isArray(rawUsers)
        ? rawUsers.filter(
            (u) => (u.visibility ?? true) && (currentUser ? u.id !== currentUser.id : true)
          )
        : [];

      const scattered = scatterUsersAround(filtered, coords.latitude, coords.longitude);

      const ranked = rankNearbyUsers(
        {
          id: currentUser?.id ?? -1,
          interestTags: normalizeTags(currentUser?.interestTags),
          coords: { latitude: coords.latitude, longitude: coords.longitude },
        },
        scattered,
        {
          weights: { tagSim: 1.0, distance: 0.0 }, // 👈 rank strictly by tag similarity (score)
          // halfLifeMeters still accepted but irrelevant with distance weight 0
          halfLifeMeters: 1200,
        }
      );

      // Preserve ranked order; enrich with distance for UI only
      const rankedWithDistance: NearbyWithDistance[] = ranked.map((u) => ({
        ...u,
        distanceMeters: haversineDistanceMeters(
          coords.latitude,
          coords.longitude,
          u.coords.latitude,
          u.coords.longitude
        ),
      }));

      return rankedWithDistance;
    },
    [currentUser]
  );

  /**
   * Fetches users and sets ranked list (score-only ordering).
   */
  const loadUsers = useCallback(
    async (
      coords: Location.LocationObjectCoords,
      options?: { silent?: boolean }
    ) => {
      try {
        if (!accessToken) {
          // Demo users when not authenticated
          const demoUsers: ApiUser[] = [
            {
              id: 1,
              name: "Alice Demo",
              email: "alice@example.com",
              interestTags: ["Coffee", "Reading"],
              profilePicture: null,
              visibility: true,
            } as unknown as ApiUser,
            {
              id: 2,
              name: "Bob Demo",
              email: "bob@example.com",
              interestTags: ["Gaming", "Movies"],
              profilePicture: null,
              visibility: true,
            } as unknown as ApiUser,
            {
              id: 3,
              name: "Charlie Demo",
              email: "charlie@example.com",
              interestTags: ["Running"],
              profilePicture: null,
              visibility: true,
            } as unknown as ApiUser,
          ];

          const rankedList = buildRankedList(demoUsers, coords);
          setUsers(rankedList);
          setError(null);
          if (!options?.silent) setLoading(false);
          return;
        }

        const response = await fetchWithAuth(`${API_BASE_URL}/users`);
        if (!response.ok) throw new Error(`Failed to load users (${response.status})`);

        const data = (await response.json()) as ApiUser[];

        // Keep a warm cache of raw users
        setPrefetchedUsers(data);

        // Build ranked output strictly by score
        const rankedList = buildRankedList(data, coords);
        setUsers(rankedList);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      } finally {
        if (!options?.silent) setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, fetchWithAuth, setPrefetchedUsers, buildRankedList]
  );

  /**
   * Refresh just one user's trust score after a report.
   */
  const refreshTrustScore = useCallback(
    async (userId: number) => {
      try {
        const response = await fetchWithAuth(`${API_BASE_URL}/users/${userId}`);
        if (!response.ok) throw new Error(`Failed to fetch user ${userId} (${response.status})`);
        const updatedUser = (await response.json()) as ApiUser;

        setUsers((prevUsers) =>
          prevUsers.map((u) =>
            u.id === userId
              ? { ...u, trustScore: (updatedUser.trustScore ?? u.trustScore) as number }
              : u
          )
        );
      } catch (err) {
        console.error("Failed to refresh trust score:", err);
      }
    },
    [fetchWithAuth]
  );

  /**
   * Request (simulated) location and load users.
   */
  const hasLoadedOnceRef = useRef(false);

  const requestAndLoad = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? hasLoadedOnceRef.current;

      try {
        if (!silent) setLoading(true);

        const coords = {
          latitude: ODU_CENTER.latitude,
          longitude: ODU_CENTER.longitude,
          altitude: undefined as any,
          accuracy: undefined as any,
          altitudeAccuracy: undefined as any,
          heading: undefined as any,
          speed: undefined as any,
        };
        setLocation(coords);
        await loadUsers(coords, { silent });
        hasLoadedOnceRef.current = true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        if (!silent) setLoading(false);
      }
    },
    [loadUsers]
  );

  /**
   * Rebuild from warm cache when it changes.
   * Still rank strictly by score; distance only displayed.
   */
  useEffect(() => {
    if (!prefetchedUsers) return;

    const coords =
      location ?? {
        latitude: ODU_CENTER.latitude,
        longitude: ODU_CENTER.longitude,
        altitude: undefined as any,
        accuracy: undefined as any,
        altitudeAccuracy: undefined as any,
        heading: undefined as any,
        speed: undefined as any,
      };

    const rankedList = buildRankedList(prefetchedUsers, coords);
    setUsers(rankedList);
    setLoading(false);
    hasLoadedOnceRef.current = true;
  }, [prefetchedUsers, location, buildRankedList]);

  // Reload when profile picture or visibility changes
  useEffect(() => {
    void requestAndLoad({ silent: hasLoadedOnceRef.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.profilePicture, currentUser?.visibility]);

  // Pull-to-refresh
  const onRefresh = useCallback(async () => {
    if (!location) {
      await requestAndLoad({ silent: false });
      return;
    }
    setRefreshing(true);
    await loadUsers(location);
  }, [loadUsers, location, requestAndLoad]);

  /**
   * Start a new chat session (fetch latest receiver first).
   */
  const startChat = useCallback(
    async (receiverId: number, receiverName: string) => {
      if (!currentUser)
        return Alert.alert(
          "Not logged in",
          "Please log in to start a chat.",
          undefined,
          alertAppearance
        );

      try {
        // Fetch latest receiver (for name/picture)
        const userResponse = await fetchWithAuth(`${API_BASE_URL}/users/${receiverId}`);
        let latestUser: ApiUser | null = null;
        if (userResponse.ok) latestUser = (await userResponse.json()) as ApiUser;

        // Create or get chat session
        const response = await fetchWithAuth(`${API_BASE_URL}/api/messages/session`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            participants: [currentUser.id, receiverId],
          }),
        });
        if (!response.ok) throw new Error(`Failed to start chat (${response.status})`);

        const data = (await response.json()) as { chatId: number };
        const { chatId } = data;

        // Navigate with latest user info
        router.push({
          pathname: "/(tabs)/messages/[chatId]",
          params: {
            chatId: String(chatId),
            name: latestUser?.name || receiverName,
            receiverId: String(receiverId),
            profilePicture: (latestUser?.profilePicture as string) || "",
            returnToMessages: "1",
          },
        });
      } catch (err) {
        console.error(err);
        Alert.alert("Error", "Failed to start chat. Please try again.", undefined, alertAppearance);
      }
    },
    [alertAppearance, currentUser, fetchWithAuth]
  );

  // Blocked list now shown in Profile tab; local loader removed
  // Unblock flow moved to Profile tab

  // Removed old inline toggle; actions now in overflow menu

  // Loading and error UI
  const showInitialLoader = loading && !hasLoadedOnceRef.current && users.length === 0;
  const textColor = useMemo(() => ({ color: colors.text }), [colors.text]);
  const mutedText = useMemo(() => ({ color: colors.muted }), [colors.muted]);

  const renderUserCard = useCallback(
    ({ item, index }: ListRenderItemInfo<NearbyWithDistance>) => {
      const imageUri =
        item.profilePicture && item.profilePicture.startsWith("http")
          ? item.profilePicture
          : item.profilePicture
          ? `${API_BASE_URL}${item.profilePicture}`
          : null;

      const trustScore = item.trustScore ?? 0;
      const trustColor = trustColorForScore(trustScore);
      const matchPercent = typeof item.score === "number" ? Math.round(item.score * 100) : null;
      const userTags = normalizeTags(item.interestTags);

      // ⬇️ Make the whole card pressable to open the user's profile (keeps Tabs visible)
      return (
        <Pressable
          onPress={() =>
            router.push({ 
              pathname: "/user/[id]",
              params: { id: String(item.id), from: "nearby" }, 
              })
          }
          style={({ pressed }) => [
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              shadowColor: isDark ? "#000" : "#0f172a",
            },
            index === 0 && [styles.cardFeatured, { borderColor: colors.accent }],
            pressed && { opacity: 0.96 },
          ]}
        >
          <View style={styles.cardTop}>
            <View style={styles.avatarRow}>
              <View style={[styles.avatarShell, { borderColor: colors.border }]}>
                {imageUri ? (
                  <ExpoImage
                    source={{ uri: imageUri }}
                    style={styles.avatar}
                    cachePolicy="memory-disk"
                    transition={150}
                    contentFit="cover"
                  />
                ) : (
                  <View
                    style={[
                      styles.avatar,
                      styles.avatarPlaceholder,
                      { backgroundColor: isDark ? "#2c3653" : "#e2e8f0" },
                    ]}
                  >
                    <Text style={[styles.avatarInitial, textColor]}>
                      {item.name?.[0]?.toUpperCase() ?? "?"}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.nameBlock}>
                <Text style={[styles.cardTitle, textColor]} numberOfLines={1}>
                  {item.name}
                </Text>
                {matchPercent !== null && (
                  <View
                    style={[
                      styles.metaPill,
                      styles.matchPill,
                      {
                        borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
                        backgroundColor: isDark ? "rgba(0,123,255,0.2)" : "rgba(0,123,255,0.08)",
                      },
                    ]}
                  >
                    <Text style={[styles.metaText, { color: colors.accent }]}>
                      {matchPercent}% match
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.metricsColumn}>
              <Text style={[styles.metricValue, textColor]}>
                {formatDistance(item.distanceMeters)}
              </Text>
              <Text style={[styles.metricValueSmall, { color: trustColor }]}>
                Trust Score: <Text style={{ color: trustColor }}>{trustScore}</Text>
              </Text>
            </View>
          </View>

          {userTags.length > 0 && (
            <View style={styles.tagsRow}>
              {userTags.map((tag) => (
                <View
                  key={tag}
                  style={[
                    styles.tagChip,
                    {
                      borderColor: colors.border,
                      backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,123,255,0.06)",
                    },
                  ]}
                >
                  <Text style={[styles.tagText, { color: colors.accent }]}>{tag}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.cardFooter}>
            {/* Chat stays a separate, tappable target */}
            <Pressable
              onPress={() => startChat(item.id, item.name || item.email)}
              style={({ pressed }) => [
                styles.iconButton,
                styles.primaryIconButton,
                { backgroundColor: colors.accent },
                pressed && styles.iconButtonPressed,
              ]}
            >
              <Ionicons
                name="chatbubble"
                size={18}
                color="white"
                style={
                  Platform.OS === "android"
                    ? { includeFontPadding: false, textAlignVertical: "center", lineHeight: 18 }
                    : undefined
                }
              />
            </Pressable>

            <View style={{ flex: 1 }} />

            {/* Overflow (•••) opens block/report etc. */}
            <TouchableOpacity
              onPress={() => setMenuTarget(item as unknown as ApiUser)}
              style={[
                styles.iconButton,
                {
                  backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                  borderColor: colors.border,
                },
              ]}
              activeOpacity={0.8}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons
                name="ellipsis-vertical"
                size={18}
                color={colors.icon}
                style={
                  Platform.OS === "android"
                    ? { includeFontPadding: false, textAlignVertical: "center", lineHeight: 18 }
                    : undefined
                }
              />
            </TouchableOpacity>
          </View>
        </Pressable>
      );
    },
    [colors, isDark, mutedText, startChat, textColor]
  );

  if (showInitialLoader) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.note, mutedText]}>Locating you and finding nearby users...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
        <Button
          title="Try Again"
          onPress={() => {
            void requestAndLoad({ silent: false });
          }}
        />
      </View>
    );
  }

  if (!location) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.note, mutedText]}>Location unavailable. Pull to refresh to retry.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: colors.card, borderColor: colors.border, shadowColor: isDark ? "#000" : "#0f172a" },
        ]}
      >
        <Text style={[styles.headerTitle, textColor]}>Visibility: {status}</Text>
        <TouchableOpacity
          style={[
            styles.visibilityToggle,
            { backgroundColor: colors.accent },
            status === "Visible" ? styles.visibilityHide : styles.visibilityShow,
            isStatusUpdating && styles.visibilityToggleDisabled,
          ]}
          onPress={() => {
            if (isStatusUpdating) return;
            const newStatus = status === "Visible" ? "Hidden" : "Visible";
            setStatus(newStatus);
          }}
          disabled={isStatusUpdating}
          activeOpacity={0.85}
        >
          {isStatusUpdating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.visibilityToggleText}>
              {status === "Visible" ? "Hide Me" : "Show Me"}
            </Text>
          )}
        </TouchableOpacity>
        {/* Blocked list moved to Profile tab */}
      </View>

      {loading && hasLoadedOnceRef.current && (
        <View style={styles.inlineLoader}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={[styles.inlineLoaderText, mutedText]}>Updating nearby users…</Text>
        </View>
      )}

      {/* User list */}
      <FlatList
        data={users}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={[styles.note, mutedText]}>No other users nearby right now.</Text>
          </View>
        }
        renderItem={renderUserCard}
        contentContainerStyle={[styles.listContent, users.length === 0 && styles.flexGrow]}
        showsVerticalScrollIndicator={false}
      />
      <UserOverflowMenu
        visible={!!menuTarget}
        onClose={() => setMenuTarget(null)}
        targetUser={menuTarget}
        onBlocked={(uid) => {
          setUsers((prev) => prev.filter((u) => u.id !== uid));
          setPrefetchedUsers((prev) => (prev ? prev.filter((u) => u.id !== uid) : prev));
        }}
        onReported={(uid) => {
          void refreshTrustScore(uid);
        }}
        onViewProfile={(userId) => {
        // Close the menu first
        setMenuTarget(null);
        // Navigate to the same profile screen you use when pressing the card
        router.push({
          pathname: "/user/[id]",
          params: { id: String(userId), from: "nearby" },  // 👈 mark origin
          });
          }}
          />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  note: { marginTop: 12, fontSize: 16, textAlign: "center" },
  error: { marginBottom: 12, fontSize: 16, textAlign: "center", color: "#c00" },
  header: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#fff",
    elevation: 2,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  visibilityToggle: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    minWidth: 120,
    alignItems: "center",
  },
  visibilityShow: {},
  visibilityHide: {},
  visibilityToggleDisabled: { opacity: 0.6 },
  visibilityToggleText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  inlineLoader: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  inlineLoaderText: { marginLeft: 8, fontSize: 13 },
  listContent: { paddingBottom: 24 },
  flexGrow: { flexGrow: 1 },
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 3,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  cardFeatured: { borderWidth: 1 },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  avatarRow: { flexDirection: "row", alignItems: "center", flex: 1, minWidth: 0 },
  avatarShell: {
    width: 56,
    height: 56,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 2,
    marginRight: 12,
    overflow: "hidden",
  },
  avatar: { width: "100%", height: "100%", borderRadius: 14 },
  avatarPlaceholder: { justifyContent: "center", alignItems: "center" },
  avatarInitial: { fontSize: 18, fontWeight: "700", color: "#555" },
  nameBlock: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 18, fontWeight: "700" },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 6,
  },
  matchPill: {},
  metaText: { fontSize: 12, fontWeight: "600" },
  metricsColumn: { marginLeft: 12, alignItems: "flex-end", minWidth: 96, gap: 4 },
  metricValue: { fontSize: 16, fontWeight: "700", textAlign: "right" },
  metricValueSmall: { fontSize: 14, fontWeight: "700", textAlign: "right" },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 12 },
  tagChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginRight: 8,
    marginBottom: 8,
  },
  tagText: { fontSize: 12, fontWeight: "700" },
  divider: { height: StyleSheet.hairlineWidth, marginTop: 12, marginBottom: 10 },
  cardFooter: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  primaryIconButton: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  iconButtonPressed: { opacity: 0.9 },
});
