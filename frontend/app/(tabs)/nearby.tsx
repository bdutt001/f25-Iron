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
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  Pressable,
  Alert,
} from "react-native";
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
import ReportButton from "../../components/ReportButton";

// Fixed center: Old Dominion University (Norfolk, VA)
const ODU_CENTER = { latitude: 36.885, longitude: -76.305 };

// Types
type NearbyWithDistance = NearbyUser & {
  distanceMeters: number;
};

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
  const { status, setStatus, isStatusUpdating, accessToken, currentUser } = useUser();

  /**
   * Fetches users from the API and updates their distance relative to the current location.
   */
  const loadUsers = useCallback(
    async (
      coords: Location.LocationObjectCoords,
      options?: { silent?: boolean }
    ) => {
      try {
        if (!accessToken) {
          console.log("No access token available, using demo users");
          const demoUsers: NearbyWithDistance[] = [
            {
              id: 1,
              name: "Alice Demo",
              email: "alice@example.com",
              interestTags: ["Coffee", "Reading"],
              profilePicture: null,
              coords: {
                latitude: ODU_CENTER.latitude + 0.001,
                longitude: ODU_CENTER.longitude + 0.001,
              },
              distanceMeters: 100,
              trustScore: 99,
            },
            {
              id: 2,
              name: "Bob Demo",
              email: "bob@example.com",
              interestTags: ["Gaming", "Movies"],
              profilePicture: null,
              coords: {
                latitude: ODU_CENTER.latitude - 0.001,
                longitude: ODU_CENTER.longitude - 0.001,
              },
              distanceMeters: 150,
              trustScore: 65,
            },
            {
              id: 3,
              name: "Charlie Demo",
              email: "charlie@example.com",
              interestTags: ["Running"],
              profilePicture: null,
              coords: {
                latitude: ODU_CENTER.latitude + 0.002,
                longitude: ODU_CENTER.longitude - 0.002,
              },
              distanceMeters: 250,
              trustScore: 45,
            },
          ];
          setUsers(demoUsers);
          setError(null);
          setLoading(false);
          return;
        }

        const response = await fetch(`${API_BASE_URL}/users`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) throw new Error(`Failed to load users (${response.status})`);

        const data = (await response.json()) as ApiUser[];
        const filtered = Array.isArray(data)
          ? data.filter(
              (u) =>
                (u.visibility ?? true) && (currentUser ? u.id !== currentUser.id : true)
            )
          : [];

        const scattered = scatterUsersAround(filtered, coords.latitude, coords.longitude);
        const withDistance = scattered
          .map<NearbyWithDistance>((user) => ({
            ...user,
            distanceMeters: haversineDistanceMeters(
              coords.latitude,
              coords.longitude,
              user.coords.latitude,
              user.coords.longitude
            ),
          }))
          .sort((a, b) => a.distanceMeters - b.distanceMeters);

        setUsers(withDistance);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      } finally {
        if (!options?.silent) {
          setLoading(false);
        }
        setRefreshing(false);
      }
    },
    [accessToken, currentUser]
  );

  /**
   * Refreshes the trust score for a specific user after they have been reported.
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
              ? { ...u, trustScore: updatedUser.trustScore ?? u.trustScore }
              : u
          )
        );
        console.log(`✅ Trust score refreshed for user ID ${userId}`);
      } catch (err) {
        console.error("Failed to refresh trust score:", err);
      }
    },
    [accessToken]
  );

  /**
   * Requests location (simulated as ODU center for demo) and loads users nearby.
   */
  const hasLoadedOnceRef = useRef(false);

  const requestAndLoad = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? hasLoadedOnceRef.current;

      try {
        if (!silent) {
          setLoading(true);
        }

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
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [loadUsers]
  );

  // Load users initially and when profile picture or visibility changes
  useEffect(() => {
    void requestAndLoad({ silent: hasLoadedOnceRef.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.profilePicture, currentUser?.visibility]);

  // Pull-to-refresh functionality
  const onRefresh = useCallback(async () => {
    if (!location) {
      await requestAndLoad({ silent: false });
      return;
    }
    setRefreshing(true);
    await loadUsers(location);
  }, [loadUsers, location, requestAndLoad]);

  /**
   * ✅ Start a new chat session with another user (always fetch latest info first)
   */
  const startChat = async (receiverId: number, receiverName: string) => {
    if (!currentUser) return Alert.alert("Not logged in", "Please log in to start a chat.");

    try {
      // ✅ Step 1: Fetch the latest receiver data before starting chat
      const userResponse = await fetch(`${API_BASE_URL}/users/${receiverId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      let latestUser = null;
      if (userResponse.ok) {
        latestUser = await userResponse.json();
      }

      // ✅ Step 2: Create or retrieve the chat session
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

      // ✅ Step 3: Pass latest profile picture and name to the chat screen
      router.push({
        pathname: "/(tabs)/messages/[chatId]",
        params: {
          chatId: String(chatId),
          name: latestUser?.name || receiverName,
          receiverId: String(receiverId),
          profilePicture: latestUser?.profilePicture || "",
        },
      });
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to start chat. Please try again.");
    }
  };

  // Loading and error handling UI
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
    <Button
      title={status === "Visible" ? "Hide Me" : "Show Me"}
      onPress={() => {
        const newStatus = status === "Visible" ? "Hidden" : "Visible";
        setStatus(newStatus);
      }}
      disabled={isStatusUpdating}
    />
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
              ? `${item.profilePicture}?t=${Date.now()}`
              : item.profilePicture
              ? `${API_BASE_URL}${item.profilePicture}?t=${Date.now()}`
              : null;

          // ✅ Dynamic color based on trust score
          const score = item.trustScore ?? 0;
          let trustColor = "#007BFF"; // default blue
          if (score >= 90) trustColor = "#28a745"; // dark green
          else if (score >= 70) trustColor = "#7ED957"; // light green
          else if (score >= 51) trustColor = "#FFC107"; // yellow
          else trustColor = "#DC3545"; // red

          return (
            <View style={[styles.card, index === 0 && styles.closestCard]}>
              <View style={styles.cardHeader}>
                <View style={styles.userInfo}>
                  {imageUri ? (
                    <Image source={{ uri: imageUri }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Text style={styles.avatarInitial}>
                        {item.name?.[0]?.toUpperCase() ?? "?"}
                      </Text>
                    </View>
                  )}
                  <View>
                    <Text style={styles.cardTitle}>{item.name}</Text>
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

              {/* ✅ Bottom action bar */}
              <View style={styles.cardFooter}>
                {/* Chat button (bottom-left) */}
                <Pressable
                  onPress={() => startChat(item.id, item.name || item.email)}
                  style={({ pressed }) => [styles.chatButton, pressed && { opacity: 0.8 }]}
                >
                  <Ionicons name="chatbubble" size={18} color="white" />
                </Pressable>

                {/* Report button + trust score (bottom-right) */}
                <View style={styles.reportContainer}>
                  <ReportButton
                    reportedUserId={item.id}
                    reportedUserName={item.name}
                    size="small"
                    onReportSuccess={() => {
                      console.log(`⚠️ Reported user ${item.name}`);
                      refreshTrustScore(item.id);
                    }}
                  />
                  <Text style={[styles.trustScoreLabel, { color: trustColor }]}>
                    Trust Score: {score}  
                  </Text>
                </View>
              </View>
            </View>
          );
        }}
        contentContainerStyle={users.length === 0 ? styles.flexGrow : undefined}
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

  /* ✅ Bottom buttons layout */
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
  reportContainer: { alignItems: "center" },
  trustScoreLabel: { marginTop: 6, fontSize: 13, fontWeight: "700" },
  flexGrow: { flexGrow: 1 },
});
