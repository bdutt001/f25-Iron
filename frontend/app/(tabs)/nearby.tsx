/**
 * NearbyScreen component displays a list of users nearby relative to the current user's location.
 * For demo purposes, it simulates user proximity centered around Old Dominion University (Norfolk, VA).
 * It fetches user data from the API, calculates distances, and allows toggling visibility status.
 */

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
} from "react-native";
import { useUser } from "../../context/UserContext";
import { API_BASE_URL } from "@/utils/api";
import {
  ApiUser,
  NearbyUser,
  formatDistance,
  haversineDistanceMeters,
  scatterUsersAround,
} from "../../utils/geo";

// Constants
// Fixed center: Old Dominion University (Norfolk, VA)
const ODU_CENTER = { latitude: 36.885, longitude: -76.305 };

// Types
type NearbyWithDistance = NearbyUser & {
  distanceMeters: number;
};

export default function NearbyScreen() {
  // State variables
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

  /**
   * Fetches users from the API, filters out the current user,
   * scatters them around the given coordinates, calculates distances,
   * sorts by proximity, and updates the users state.
   * Handles loading and error states accordingly.
   */
  const loadUsers = useCallback(
    async (coords: Location.LocationObjectCoords) => {
      try {
        const response = await fetch(`${API_BASE_URL}/users`, {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        });
        if (!response.ok) {
          throw new Error(`Failed to load users (${response.status})`);
        }

        const data = (await response.json()) as ApiUser[];
        // Filter out the current user from the fetched list
        const filtered = Array.isArray(data)
          ? data.filter((u) => (currentUser ? u.id !== currentUser.id : true))
          : [];
        // Scatter users around the given coordinates for demo purposes
        const scattered = scatterUsersAround(filtered, coords.latitude, coords.longitude);
        // Calculate distance for each user and sort by closest first
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

        setUsers(withDistance); // Update users state with sorted nearby users
        setError(null); // Clear any previous errors
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message); // Set error message on failure
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  /**
   * Requests location (simulated as ODU center for demo),
   * sets the location state, and loads users near that location.
   * Handles loading and error states.
   */
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
      setLocation(coords); // Set location to ODU center
      await loadUsers(coords); // Load users near ODU center
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setLoading(false);
    }
  }, [loadUsers]);

  /**
   * Handles pull-to-refresh action.
   * If location is unavailable, triggers a full request and load.
   * Otherwise, reloads users based on current location.
   */
  const onRefresh = useCallback(async () => {
    if (!location) {
      await requestAndLoad();
      return;
    }

    setRefreshing(true);
    await loadUsers(location);
  }, [loadUsers, location, requestAndLoad]);

  // Load users on component mount or when requestAndLoad changes
  useEffect(() => {
    requestAndLoad();
  }, [requestAndLoad]);

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
            <Text style={styles.trustScoreName}>Trust Score: <Text style={styles.trustScoreNumber} >{item.trustScore}</Text></Text>
            {item.interestTags.length > 0 && (
              <Text style={styles.cardTags}>{item.interestTags.join(", ")}</Text>
            )}
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
  cardTags: {
    marginTop: 8,
    fontSize: 13,
    color: "#007BFF",
  },
  flexGrow: {
    flexGrow: 1,
  },
  trustScoreName:{
    textAlign: "right",
    fontSize: 15
  },
  trustScoreNumber:{
    color: "#007BFF"
  }
});
