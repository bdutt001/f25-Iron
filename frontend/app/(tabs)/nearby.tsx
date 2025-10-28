/**
 * NearbyScreen component displays a list of users nearby relative to the current user's location.
 * For demo purposes, it simulates user proximity centered around Old Dominion University (Norfolk, VA).
 * It fetches user data from the API, calculates distances, and allows toggling visibility status.
 */

import * as Location from "expo-location";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
  Modal,
  ScrollView,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useUser } from "../../context/UserContext";
import { API_BASE_URL } from "@/utils/api";
import {
  ApiUser,
  NearbyUser,
  formatDistance,
  haversineDistanceMeters,
  scatterUsersAround,
} from "../../utils/geo";
import { rankNearbyUsers } from "../../utils/rank";
import ReportButton from "../../components/ReportButton";

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

export default function NearbyScreen() {
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
  const [blockedVisible, setBlockedVisible] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<ApiUser[]>([]);

  const {
    status,
    setStatus,
    isStatusUpdating,
    accessToken,
    currentUser,
    prefetchedUsers,
    setPrefetchedUsers,
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

        const response = await fetch(`${API_BASE_URL}/users`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
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
    [accessToken, setPrefetchedUsers, buildRankedList]
  );

  /**
   * Refresh just one user's trust score after a report.
   */
  const refreshTrustScore = useCallback(
    async (userId: number) => {
      try {
        const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
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
    [accessToken]
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
  const startChat = async (receiverId: number, receiverName: string) => {
    if (!currentUser) return Alert.alert("Not logged in", "Please log in to start a chat.");

    try {
      // Fetch latest receiver (for name/picture)
      const userResponse = await fetch(`${API_BASE_URL}/users/${receiverId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      let latestUser: ApiUser | null = null;
      if (userResponse.ok) latestUser = (await userResponse.json()) as ApiUser;

      // Create or get chat session
      const response = await fetch(`${API_BASE_URL}/api/messages/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
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
        },
      });
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to start chat. Please try again.");
    }
  };

  const loadBlockedUsers = useCallback(async () => {
    if (!accessToken) return setBlockedUsers([]);
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/me/blocks`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error(`Failed to load blocked users (${response.status})`);
      const data = (await response.json()) as ApiUser[];
      setBlockedUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load blocked users", err);
      setBlockedUsers([]);
    }
  }, [accessToken]);

  const handleBlock = useCallback(
    async (userId: number) => {
      if (!accessToken) return Alert.alert("Not logged in", "Please log in to block users.");
      try {
        const res = await fetch(`${API_BASE_URL}/api/users/${userId}/block`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) throw new Error(`Failed to block (${res.status})`);
        setUsers((prev) => prev.filter((u) => u.id !== userId));
        setPrefetchedUsers((prev) => (prev ? prev.filter((u) => u.id !== userId) : prev));
      } catch (err) {
        console.error(err);
        Alert.alert("Error", "Could not block user. Please try again.");
      }
    },
    [accessToken, setPrefetchedUsers]
  );

  const handleUnblock = useCallback(
    async (userId: number) => {
      if (!accessToken) return Alert.alert("Not logged in", "Please log in to unblock users.");
      try {
        const res = await fetch(`${API_BASE_URL}/api/users/${userId}/block`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok && res.status !== 204) throw new Error(`Failed to unblock (${res.status})`);
        setBlockedUsers((prev) => prev.filter((u) => u.id !== userId));
        void requestAndLoad({ silent: true });
      } catch (err) {
        console.error(err);
        Alert.alert("Error", "Could not unblock user. Please try again.");
      }
    },
    [accessToken, requestAndLoad]
  );

  // Loading and error UI
  const showInitialLoader = loading && !hasLoadedOnceRef.current && users.length === 0;

  if (showInitialLoader) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007BFF" />
        <Text style={styles.note}>Locating you and finding nearby users...</Text>
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
        <Text style={styles.note}>Location unavailable. Pull to refresh to retry.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Visibility: {status}</Text>
        <TouchableOpacity
          style={[
            styles.visibilityToggle,
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
        <TouchableOpacity
          style={styles.blockedBtn}
          onPress={() => {
            setBlockedVisible(true);
            void loadBlockedUsers();
          }}
        >
          <Text style={styles.blockedBtnText}>Blocked</Text>
        </TouchableOpacity>
      </View>

      {loading && hasLoadedOnceRef.current && (
        <View style={styles.inlineLoader}>
          <ActivityIndicator size="small" color="#007BFF" />
          <Text style={styles.inlineLoaderText}>Updating nearby users…</Text>
        </View>
      )}

      {/* User list */}
      <FlatList
        data={users}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.note}>No other users nearby right now.</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const imageUri =
            item.profilePicture && item.profilePicture.startsWith("http")
              ? item.profilePicture
              : item.profilePicture
              ? `${API_BASE_URL}${item.profilePicture}`
              : null;

          // Dynamic color based on trust score
          const scoreTS = item.trustScore ?? 0;
          let trustColor = "#007BFF";
          if (scoreTS >= 90) trustColor = "#28a745";
          else if (scoreTS >= 70) trustColor = "#7ED957";
          else if (scoreTS >= 51) trustColor = "#FFC107";
          else trustColor = "#DC3545";

          return (
            <View style={[styles.card, index === 0 && styles.closestCard]}>
              <View style={styles.cardHeader}>
                <View style={styles.userInfo}>
                  {imageUri ? (
                    <ExpoImage
                      source={{ uri: imageUri }}
                      style={styles.avatar}
                      cachePolicy="memory-disk"
                      transition={0}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Text style={styles.avatarInitial}>
                        {item.name?.[0]?.toUpperCase() ?? "?"}
                      </Text>
                    </View>
                  )}
                  <View>
                    <Text style={styles.cardTitle}>{item.name}</Text>
                    {/* ✅ show score-only % match */}
                    {typeof item.score === "number" && (
                      <Text style={{ fontSize: 13, color: "#666", marginTop: 2 }}>
                        {Math.round(item.score * 100)}% match
                      </Text>
                    )}
                  </View>
                </View>
                <Text style={styles.cardDistance}>{formatDistance(item.distanceMeters)}</Text>
              </View>

              {item.interestTags.length > 0 && (
                <View style={styles.cardTagsWrapper}>
                  {item.interestTags.map((tag) => (
                    <View key={tag} style={styles.cardTagChip}>
                      <Text style={styles.cardTagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Bottom action bar */}
              <View style={styles.cardFooter}>
                {/* Chat button */}
                <Pressable
                  onPress={() => startChat(item.id, item.name || item.email)}
                  style={({ pressed }) => [styles.chatButton, pressed && { opacity: 0.8 }]}
                >
                  <Ionicons name="chatbubble" size={18} color="white" />
                </Pressable>

                {/* Report + Trust score */}
                <View style={styles.reportContainer}>
                  <ReportButton
                    reportedUserId={item.id}
                    reportedUserName={item.name}
                    size="small"
                    onReportSuccess={() => {
                      refreshTrustScore(item.id);
                    }}
                  />
                  <Text style={[styles.trustScoreLabel, { color: trustColor }]}> 
                    Trust Score: {scoreTS}
                  </Text>
                </View>
                {/* Block button */}
                <Pressable
                  onPress={() =>
                    Alert.alert(
                      "Block User",
                      `Hide ${item.name || item.email} and prevent messages?`,
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Block",
                          style: "destructive",
                          onPress: () => void handleBlock(item.id),
                        },
                      ]
                    )
                  }
                  style={({ pressed }) => [styles.blockButton, pressed && { opacity: 0.85 }]}
                >
                  <Ionicons name="remove-circle" size={18} color="white" />
                </Pressable>
              </View>
            </View>
          );
        }}
        contentContainerStyle={users.length === 0 ? styles.flexGrow : undefined}
      />
      {/* Blocked users modal */}
      <Modal
        visible={blockedVisible}
        animationType="slide"
        onRequestClose={() => setBlockedVisible(false)}
        transparent={true}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Blocked Users</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {blockedUsers.length === 0 ? (
                <Text style={styles.note}>No blocked users.</Text>
              ) : (
                blockedUsers.map((u) => (
                  <View key={u.id} style={styles.blockedRow}>
                    <Text style={styles.blockedName}>{u.name || u.email}</Text>
                    <TouchableOpacity
                      style={styles.unblockBtn}
                      onPress={() => void handleUnblock(u.id)}
                    >
                      <Text style={styles.unblockBtnText}>Unblock</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setBlockedVisible(false)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#f5f7fa" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  note: { marginTop: 12, fontSize: 16, textAlign: "center", color: "#555" },
  error: { marginBottom: 12, fontSize: 16, textAlign: "center", color: "#c00" },
  header: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fff",
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "600" },
  visibilityToggle: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    minWidth: 120,
    alignItems: "center",
    backgroundColor: "#007BFF",
  },
  visibilityShow: {},
  visibilityHide: {},
  visibilityToggleDisabled: { opacity: 0.6 },
  visibilityToggleText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  blockedBtn: {
    marginLeft: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "#6c757d",
  },
  blockedBtnText: { color: "#fff", fontWeight: "700" },
  inlineLoader: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  inlineLoaderText: { marginLeft: 8, fontSize: 13, color: "#555" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  closestCard: { borderWidth: 1, borderColor: "#007BFF" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  userInfo: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 48, height: 48, borderRadius: 24, marginRight: 12 },
  avatarPlaceholder: { backgroundColor: "#ddd", justifyContent: "center", alignItems: "center" },
  avatarInitial: { fontSize: 18, fontWeight: "bold", color: "#555" },
  cardTitle: { fontSize: 18, fontWeight: "600" },
  cardDistance: { fontSize: 16, fontWeight: "500", color: "#007BFF" },
  cardTagsWrapper: { flexDirection: "row", flexWrap: "wrap", marginTop: 8 },
  cardTagChip: {
    backgroundColor: "#e6f0ff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    marginRight: 6,
    marginBottom: 6,
  },
  cardTagText: { fontSize: 12, color: "#1f5fbf", fontWeight: "500" },

  /* Bottom buttons layout */
  cardFooter: {
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  chatButton: {
    width: 44,
    height: 44,
    backgroundColor: "#007BFF",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  blockButton: {
    width: 44,
    height: 44,
    backgroundColor: "#dc3545",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  reportContainer: { alignItems: "center" },
  trustScoreLabel: { marginTop: 6, fontSize: 13, fontWeight: "700" },
  flexGrow: { flexGrow: 1 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 12 },
  blockedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
  },
  blockedName: { fontSize: 16 },
  unblockBtn: {
    backgroundColor: "#28a745",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  unblockBtnText: { color: "#fff", fontWeight: "700" },
  closeBtn: {
    marginTop: 12,
    alignSelf: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#007BFF",
    borderRadius: 18,
  },
  closeBtnText: { color: "#fff", fontWeight: "700" },
});
