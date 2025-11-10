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
  Platform,
  LayoutAnimation,
  UIManager,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import UserOverflowMenu from "../../components/UserOverflowMenu";
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
  // Blocked UI moved to Profile
  const [blockedVisible, setBlockedVisible] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
  const [menuTarget, setMenuTarget] = useState<ApiUser | null>(null);
  

  useEffect(() => {
    // @ts-ignore
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      // @ts-ignore
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

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

  // Blocked list now shown in Profile tab; local loader removed

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
        setPrefetchedUsers(prefetchedUsers ? prefetchedUsers.filter((u) => u.id !== userId) : null);
      } catch (err) {
        console.error(err);
        Alert.alert("Error", "Could not block user. Please try again.");
      }
    },
    [accessToken, setPrefetchedUsers, prefetchedUsers]
  );

  // Unblock flow moved to Profile tab

  // Removed old inline toggle; actions now in overflow menu

  const startReportFlow = useCallback(
    (user: ApiUser) => {
      if (!accessToken || !currentUser) {
        Alert.alert("Error", "You must be logged in to report users.");
        return;
      }
      if (currentUser.id === user.id) {
        Alert.alert("Error", "You cannot report yourself.");
        return;
      }
      const submitReport = async (reason: string, severity = 1) => {
        try {
          const resp = await fetch(`${API_BASE_URL}/api/report`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ reportedId: user.id, reason, severity }),
          });
          const payload = (await resp.json()) as { trustScore?: number; error?: string };
          if (!resp.ok) throw new Error(payload?.error || "Failed to submit report");
          Alert.alert("Report Submitted", "Thank you for your report.");
          void refreshTrustScore(user.id);
        } catch (e: any) {
          Alert.alert("Error", e?.message || "Failed to submit report");
        }
      };
      Alert.alert(
        "Report User",
        `Report ${user.name || user.email}?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Inappropriate", onPress: () => void submitReport("Inappropriate Behavior") },
          { text: "Spam/Fake", onPress: () => void submitReport("Spam/Fake Profile") },
          { text: "Harassment", onPress: () => void submitReport("Harassment") },
          { text: "Other", onPress: () => void submitReport("Other") },
        ]
      );
    },
    [accessToken, currentUser, refreshTrustScore]
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
        {/* Blocked list moved to Profile tab */}
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
                <View style={styles.rightInfo}>
                  <Text style={styles.cardDistance}>{formatDistance(item.distanceMeters)}</Text>
                  <Text style={[styles.rightTrustLabel, { color: trustColor }]}>Trust Score: {scoreTS}</Text>
                </View>
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
                {/* Chat */}
                <Pressable
                  onPress={() => startChat(item.id, item.name || item.email)}
                  style={({ pressed }) => [styles.chatButton, pressed && { opacity: 0.8 }]}
                >
                  <Ionicons
                    name="chatbubble"
                    size={18}
                    color="white"
                    style={Platform.OS === 'android' ? { includeFontPadding: false, textAlignVertical: 'center', lineHeight: 18 } : undefined}
                  />
                </Pressable>

                {/* spacer */}
                <View style={{ flex: 1 }} />

                {/* Inline expanding actions to the left of the icon */}
                <View
                  style={[
                    styles.inlineActionsWrap,
                    expandedUserId === (item as any).id
                      ? styles.inlineActionsWrapOpen
                      : styles.inlineActionsWrapClosed,
                  ]}
                >
                  <TouchableOpacity
                    onPress={() => {
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      setExpandedUserId(null);
                      startReportFlow(item as unknown as ApiUser);
                    }}
                  >
                    <Text style={styles.inlineActionDanger}>Report</Text>
                  </TouchableOpacity>
                  <View style={{ width: 8 }} />
                  <TouchableOpacity
                    onPress={() => {
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      setExpandedUserId(null);
                      void handleBlock((item as any).id);
                    }}
                  >
                    <Text style={styles.inlineActionDanger}>Block</Text>
                  </TouchableOpacity>
                </View>

                {/* Three-dot menu (modern) */}
                <TouchableOpacity
                  onPress={() => setMenuTarget(item as unknown as ApiUser)}
                  style={styles.moreButton}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="ellipsis-vertical"
                    size={18}
                    color="#333"
                    style={Platform.OS === 'android' ? { includeFontPadding: false, textAlignVertical: 'center', lineHeight: 18 } : undefined}
                  />
                </TouchableOpacity>
              </View>

              {/* Inline below actions removed; using same-line expansion next to icon */}
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
        <View />
      </Modal>
      <UserOverflowMenu
        visible={!!menuTarget}
        onClose={() => setMenuTarget(null)}
        targetUser={menuTarget}
        onBlocked={(uid) => {
          setUsers((prev) => prev.filter((u) => u.id !== uid));
        }}
      />
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
  inlineActionsWrap: { overflow: 'hidden', flexDirection: 'row', alignItems: 'center', marginRight: 6 },
  inlineActionsWrapClosed: { width: 0, opacity: 0 },
  inlineActionsWrapOpen: { width: 'auto', opacity: 1 },
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
  rightInfo: { alignItems: "flex-end" },
  rightTrustLabel: { fontSize: 13, marginTop: 4, fontWeight: "700" },
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
    alignItems: "center",
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
  reportContainer: { alignItems: "center", minWidth: 20 },
  moreButton: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
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
  
  inlineActionDanger: {
    color: "#dc3545",
    fontWeight: "700",
    paddingVertical: 6,
    paddingHorizontal: 0,
    fontSize: 15,
    backgroundColor: "#fff",
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
});
