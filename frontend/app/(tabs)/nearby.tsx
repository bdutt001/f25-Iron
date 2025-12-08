/**
 * NearbyScreen component displays nearby users based on the latest locations stored in the backend.
 * It ensures the viewer has a saved location (device or fallback), fetches nearby users with distance,
 * and lets the user sort by match or distance.
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
import { useFocusEffect } from "@react-navigation/native";
import UserOverflowMenu from "../../components/UserOverflowMenu";
import { useUser } from "../../context/UserContext";
import { API_BASE_URL } from "@/utils/api";
import { useAppTheme } from "../../context/ThemeContext";
import { ApiUser, formatDistance } from "../../utils/geo";

// Fixed center: Old Dominion University (Norfolk, VA)
const ODU_CENTER = { latitude: 36.885, longitude: -76.305 };
const NEARBY_RADIUS_METERS = 500;

type Coordinates = { latitude: number; longitude: number };
type NearbyWithDistance = ApiUser & {
  latitude: number;
  longitude: number;
  distanceMeters: number;
  matchPercent: number;
  locationUpdatedAt?: string;
};
type SortMode = "match" | "distance";

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
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [users, setUsers] = useState<NearbyWithDistance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuTarget, setMenuTarget] = useState<ApiUser | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("match");

  const { status, setStatus, isStatusUpdating, accessToken, currentUser, fetchWithAuth } = useUser();
  const hasLoadedOnceRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const normalizeNearbyResponse = useCallback(
    (payload: unknown): NearbyWithDistance[] => {
      const rawList = Array.isArray((payload as any)?.users)
        ? (payload as any).users
        : Array.isArray(payload)
          ? (payload as any)
          : [];

      return rawList
        .map((item: any): NearbyWithDistance | null => {
          const id = Number(item?.id);
          const latitude = Number(item?.latitude);
          const longitude = Number(item?.longitude);
          const distanceMeters = Number(item?.distanceMeters);

          if (
            !Number.isFinite(id) ||
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            !Number.isFinite(distanceMeters)
          ) {
            return null;
          }

          const matchPercentRaw = Number(item?.matchPercent);
          const matchPercent = Number.isFinite(matchPercentRaw)
            ? Math.max(0, Math.min(100, Math.round(matchPercentRaw)))
            : 0;

          const trustScoreRaw = Number(item?.trustScore);
          const trustScore = Number.isFinite(trustScoreRaw) ? trustScoreRaw : 0;

          const email = typeof item?.email === "string" ? item.email : "";
          const name = typeof item?.name === "string" ? item.name : email;

          return {
            id,
            email,
            name,
            interestTags: normalizeTags(item?.interestTags),
            profilePicture: typeof item?.profilePicture === "string" ? item.profilePicture : null,
            trustScore,
            visibility: item?.visibility ?? true,
            latitude,
            longitude,
            distanceMeters,
            matchPercent,
            locationUpdatedAt:
              typeof item?.locationUpdatedAt === "string" ? item.locationUpdatedAt : undefined,
          };
        })
        .filter(
          (item): item is NearbyWithDistance =>
            !!item && item.distanceMeters <= NEARBY_RADIUS_METERS
        );
    },
    []
  );

  const fetchSavedLocation = useCallback(async (): Promise<Coordinates | null> => {
    if (!accessToken) return null;

    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/users/me/location`);
      if (response.status === 404) return null;
      if (!response.ok) {
        const message = await response.text().catch(() => "");
        throw new Error(message || `Failed to fetch location (${response.status})`);
      }

      const data = (await response.json()) as { latitude?: unknown; longitude?: unknown };
      const latitude = Number(data?.latitude);
      const longitude = Number(data?.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

      return { latitude, longitude };
    } catch (err) {
      console.warn("Failed to fetch saved location:", err);
      return null;
    }
  }, [accessToken, fetchWithAuth]);

  const persistLocationToBackend = useCallback(
    async (coords: Coordinates) => {
      if (!accessToken) return;
      try {
        await fetch(`${API_BASE_URL}/users/me/location`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(coords),
        });
      } catch (err) {
        console.warn("Failed to send location to backend:", err);
      }
    },
    [accessToken]
  );

  const requestDeviceLocation = useCallback(async (): Promise<Coordinates | null> => {
    try {
      const { status: permissionStatus } = await Location.requestForegroundPermissionsAsync();
      if (permissionStatus !== "granted") {
        return null;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
    } catch (err) {
      console.warn("Unable to fetch device location, falling back to ODU coords:", err);
      return null;
    }
  }, []);

  const ensureLocation = useCallback(async (): Promise<Coordinates> => {
    if (!accessToken) {
      throw new Error("Please log in to view nearby users.");
    }

    const saved = await fetchSavedLocation();
    if (saved) {
      setLocation(saved);
      return saved;
    }

    const deviceCoords = await requestDeviceLocation();
    const fallbackCoords = deviceCoords ?? ODU_CENTER;
    await persistLocationToBackend(fallbackCoords);
    setLocation(fallbackCoords);
    return fallbackCoords;
  }, [accessToken, fetchSavedLocation, persistLocationToBackend, requestDeviceLocation]);

  const loadNearbyUsers = useCallback(
    async (_coords: Coordinates, options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!accessToken) {
        setError("Please log in to view nearby users.");
        setLoading(false);
        setRefreshing(false);
        return;
      }

      try {
        if (!silent) setLoading(true);

        const params = new URLSearchParams({
          radius: String(NEARBY_RADIUS_METERS),
          sort: sortMode,
        });
        const response = await fetchWithAuth(`${API_BASE_URL}/users/nearby?${params.toString()}`);
        if (!response.ok) {
          const message = await response.text().catch(() => "");
          throw new Error(message || `Failed to load nearby users (${response.status})`);
        }

        const payload = await response.json();
        const normalized = normalizeNearbyResponse(payload).filter(
          (user) => user.distanceMeters <= NEARBY_RADIUS_METERS
        );

        setUsers(normalized);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load nearby users";
        setError(message);
      } finally {
        if (!silent) setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, fetchWithAuth, normalizeNearbyResponse, sortMode]
  );

  const ensureAndLoad = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? hasLoadedOnceRef.current;

      try {
        if (!silent) setLoading(true);
        const coords = await ensureLocation();
        await loadNearbyUsers(coords, { silent: true });
        hasLoadedOnceRef.current = true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load nearby users";
        setError(message);
      } finally {
        if (!silent) setLoading(false);
        setRefreshing(false);
      }
    },
    [ensureLocation, loadNearbyUsers]
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

  useEffect(() => {
    void ensureAndLoad({ silent: false });
  }, [ensureAndLoad]);

  useEffect(() => {
    if (!location) return;
    const silent = hasLoadedOnceRef.current;
    void loadNearbyUsers(location, { silent });
  }, [location, loadNearbyUsers, sortMode]);

  useEffect(() => {
    if (!hasLoadedOnceRef.current) return;
    void ensureAndLoad({ silent: true });
  }, [currentUser?.profilePicture, currentUser?.visibility, ensureAndLoad]);

  // Pull-to-refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const coords = location ?? (await ensureLocation());
      await loadNearbyUsers(coords, { silent: true });
      hasLoadedOnceRef.current = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to refresh nearby users";
      setError(message);
    } finally {
      setRefreshing(false);
    }
  }, [ensureLocation, loadNearbyUsers, location]);

  // Lightweight polling while the tab is focused (mirrors map tab behavior)
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const tick = async () => {
        if (cancelled) return;
        try {
          const coords = location ?? (await ensureLocation());
          if (!coords) return;
          await loadNearbyUsers(coords, { silent: true });
          hasLoadedOnceRef.current = true;
        } catch {
          // ignore transient polling errors
        }
      };

      void tick();
      pollTimerRef.current = setInterval(tick, 8000);

      return () => {
        cancelled = true;
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      };
    }, [ensureLocation, loadNearbyUsers, location])
  );

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

  const showInitialLoader = loading && !hasLoadedOnceRef.current && users.length === 0;
  const textColor = useMemo(() => ({ color: colors.text }), [colors.text]);
  const mutedText = useMemo(() => ({ color: colors.muted }), [colors.muted]);
  const visibleUsers = useMemo(
    () => users.filter((u) => u.distanceMeters <= NEARBY_RADIUS_METERS),
    [users]
  );

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
      const matchPercent =
        Number.isFinite(item.matchPercent) && item.matchPercent >= 0
          ? Math.round(item.matchPercent)
          : null;
      const userTags = normalizeTags(item.interestTags);

      return (
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              shadowColor: isDark ? "#000" : "#0f172a",
            },
            index === 0 && [styles.cardFeatured, { borderColor: colors.accent }],
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
        </View>
      );
    },
    [colors, isDark, startChat, textColor]
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
            void ensureAndLoad({ silent: false });
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
      </View>

      {/* User list */}
      <FlatList
        data={visibleUsers}
        keyExtractor={(item) => item.id.toString()}
        ListHeaderComponent={
          <View>
            <View style={styles.filterBar}>
              <Pressable
                onPress={() => setSortMode("match")}
                style={({ pressed }) => [
                  styles.toggleOption,
                  {
                    borderColor: colors.border,
                    backgroundColor:
                      sortMode === "match"
                        ? isDark
                          ? "rgba(0,123,255,0.25)"
                          : "rgba(0,123,255,0.12)"
                        : isDark
                        ? "rgba(255,255,255,0.04)"
                        : "rgba(0,0,0,0.02)",
                  },
                  pressed && styles.togglePressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.toggleText,
                    { color: sortMode === "match" ? colors.accent : colors.text },
                  ]}
                >
                  Sort by Match %
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSortMode("distance")}
                style={({ pressed }) => [
                  styles.toggleOption,
                  {
                    borderColor: colors.border,
                    backgroundColor:
                      sortMode === "distance"
                        ? isDark
                          ? "rgba(0,123,255,0.25)"
                          : "rgba(0,123,255,0.12)"
                        : isDark
                        ? "rgba(255,255,255,0.04)"
                        : "rgba(0,0,0,0.02)",
                  },
                  pressed && styles.togglePressed,
                ]}
              >
                <Text
                  style={[
                    styles.toggleText,
                    { color: sortMode === "distance" ? colors.accent : colors.text },
                  ]}
                >
                  Sort by Distance
                </Text>
              </Pressable>
            </View>
          </View>
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={[styles.note, mutedText]}>No other users nearby right now.</Text>
          </View>
        }
        renderItem={renderUserCard}
        contentContainerStyle={[styles.listContent, visibleUsers.length === 0 && styles.flexGrow]}
        showsVerticalScrollIndicator={false}
      />
      <UserOverflowMenu
        visible={!!menuTarget}
        onClose={() => setMenuTarget(null)}
        targetUser={menuTarget}
        onBlocked={(uid) => {
          setUsers((prev) => prev.filter((u) => u.id !== uid));
        }}
        onReported={(uid) => {
          void refreshTrustScore(uid);
        }}
      />
      {loading && hasLoadedOnceRef.current && (
        <View style={[styles.floatingLoader, { backgroundColor: isDark ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.78)", borderColor: colors.border }]}>
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  note: { marginTop: 12, fontSize: 16, textAlign: "center" },
  error: { marginBottom: 12, fontSize: 16, textAlign: "center", color: "#c00" },
  header: {
    marginBottom: 12,
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
  filterBar: {
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  toggleOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
  },
  toggleText: { fontSize: 14, fontWeight: "700" },
  togglePressed: { opacity: 0.85 },
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
  floatingLoader: {
    position: "absolute",
    right: 16,
    bottom: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
});
