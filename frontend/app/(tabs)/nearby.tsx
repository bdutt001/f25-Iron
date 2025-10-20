import * as Location from "expo-location";
import React, { useCallback, useEffect, useState } from "react";
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
} from "react-native";
import { router } from "expo-router";
import { useUser } from "../../context/UserContext";
import { API_BASE_URL } from "@/utils/api";
import {
  ApiUser,
  NearbyUser,
  formatDistance,
  haversineDistanceMeters,
  scatterUsersAround,
} from "../../utils/geo";
// import ReportButton from "../../components/ReportButton";

import { Ionicons } from "@expo/vector-icons";

// Fixed center: Old Dominion University (Norfolk, VA)
const ODU_CENTER = { latitude: 36.885, longitude: -76.305 };

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
  const { status, setStatus, accessToken, currentUser } = useUser();

  const loadUsers = useCallback(
    async (coords: Location.LocationObjectCoords) => {
      try {
        // Skip loading users if no access token (not authenticated)
        if (!accessToken) {
          console.log("No access token available, using demo users");
          // Create demo users for testing report feature
          const demoUsers = [
            {
              id: 1,
              name: "Alice Demo",
              email: "alice@example.com",
              interestTags: ["Coffee", "Reading"],
              coords: { latitude: ODU_CENTER.latitude + 0.001, longitude: ODU_CENTER.longitude + 0.001 },
              distanceMeters: 100
            },
            {
              id: 2, 
              name: "Bob Demo",
              email: "bob@example.com",
              interestTags: ["Gaming", "Movies"],
              coords: { latitude: ODU_CENTER.latitude - 0.001, longitude: ODU_CENTER.longitude - 0.001 },
              distanceMeters: 150
            }
          ];
          setUsers(demoUsers);
          setError(null);
          return;
        }

        const response = await fetch(`${API_BASE_URL}/users`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) {
          throw new Error(`Failed to load users (${response.status})`);
        }

        const data = (await response.json()) as ApiUser[];
        const filtered = Array.isArray(data)
          ? data.filter((u) => (currentUser ? u.id !== currentUser.id : true))
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
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, currentUser]
  );

  const requestAndLoad = useCallback(async () => {
    try {
      setLoading(true);
      // Demo mode: center and compute distances from ODU
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
      await loadUsers(coords);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setLoading(false);
    }
  }, [loadUsers]);

  useEffect(() => {
    requestAndLoad();
  }, [requestAndLoad]);

  const onRefresh = useCallback(async () => {
    if (!location) {
      await requestAndLoad();
      return;
    }

    setRefreshing(true);
    await loadUsers(location);
  }, [loadUsers, location, requestAndLoad]);

  // 🔹 Create or get chat session
  const startChat = async (receiverId: number, receiverName: string) => {
    if (!currentUser) return Alert.alert("Not logged in", "Please log in to start a chat.");

    try {
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

      if (!response.ok) {
        throw new Error(`Failed to start chat (${response.status})`);
      }

      const data = (await response.json()) as { chatId: number };
      const { chatId } = data;

      router.push({
        pathname: "/(tabs)/messages/[chatId]",
        params: { chatId: String(chatId), name: receiverName, receiverId: String(receiverId) },
      });
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to start chat. Please try again.");
    }
  };

  if (loading) {
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
        <Button title="Try Again" onPress={requestAndLoad} />
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
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Visibility: {status}</Text>
        <Button
          title={status === "Visible" ? "Hide Me" : "Show Me"}
          onPress={() => setStatus(status === "Visible" ? "Hidden" : "Visible")}
        />
      </View>

      <FlatList
        data={users}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.note}>No other users nearby right now.</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={[styles.card, index === 0 && styles.closestCard]}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.cardDistance}>{formatDistance(item.distanceMeters)}</Text>
            </View>
            <Text style={styles.cardSubtitle}>{item.email}</Text>
            {item.interestTags.length > 0 && (
              <View style={styles.cardTagsWrapper}>
                {item.interestTags.map((tag) => (
                  <View key={tag} style={styles.cardTagChip}>
                    <Text style={styles.cardTagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* 🔹 Start Chat Button */}
            <Pressable
              onPress={() => startChat(item.id, item.name || item.email)}
              style={({ pressed }) => [
                styles.chatButton,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Ionicons name="chatbubble" size={10} color="white" />
              {/* <Text style={styles.chatButtonText}>Start Chat</Text> */}
            </Pressable>
            {/* <View style={styles.cardActions}>
              <ReportButton
                reportedUserId={item.id}
                reportedUserName={item.name}
                reporterId={currentUser?.id || 99} // Use current user ID from context
                size="small"
                onReportSuccess={() => {
                  // Optional: Could refresh the list or show a toast
                  console.log(`Reported user ${item.name}`);
                }}
              />
            </View> */}
          </View>
        )}
        contentContainerStyle={users.length === 0 ? styles.flexGrow : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#f5f7fa",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  note: {
    marginTop: 12,
    fontSize: 16,
    textAlign: "center",
    color: "#555",
  },
  error: {
    marginBottom: 12,
    fontSize: 16,
    textAlign: "center",
    color: "#c00",
  },
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
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
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
  closestCard: {
    borderWidth: 1,
    borderColor: "#007BFF",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  cardDistance: {
    fontSize: 16,
    fontWeight: "500",
    color: "#007BFF",
  },
  cardSubtitle: {
    fontSize: 14,
    color: "#666",
  },
  cardTagsWrapper: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
  },
  cardTagChip: {
    backgroundColor: "#e6f0ff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    marginRight: 6,
    marginBottom: 6,
  },
  cardTagText: {
    fontSize: 12,
    color: "#1f5fbf",
    fontWeight: "500",
  },
  chatButton: {
    position: 'absolute',
    bottom: 12,      // align bottom
    right: 12,       // align right
    width: 20,       // smaller square
    height: 20,
    backgroundColor: '#007BFF',
    borderRadius: 18, // fully rounded
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',    // optional shadow for floating effect
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  chatButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
  flexGrow: {
    flexGrow: 1,
  },
});




