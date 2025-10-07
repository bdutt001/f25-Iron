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
import {
  ApiUser,
  NearbyUser,
  formatDistance,
  haversineDistanceMeters,
  scatterUsersAround,
} from "../../utils/geo";
import ReportButton from "../../components/ReportButton";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

type NearbyWithDistance = NearbyUser & {
  distanceMeters: number;
};

export default function NearbyScreen() {
  const [location, setLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [users, setUsers] = useState<NearbyWithDistance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { status, setStatus } = useUser();

  const loadUsers = useCallback(
    async (coords: Location.LocationObjectCoords) => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/users`);
        if (!response.ok) {
          throw new Error(`Failed to load users (${response.status})`);
        }

        const data = (await response.json()) as ApiUser[];
        const scattered = scatterUsersAround(data, coords.latitude, coords.longitude);
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
    []
  );

  const requestAndLoad = useCallback(async () => {
    try {
      setLoading(true);
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setError("Permission to access location was denied");
        setLoading(false);
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({});
      setLocation(currentLocation.coords);
      await loadUsers(currentLocation.coords);
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
              <Text style={styles.cardTags}>{item.interestTags.join(", ")}</Text>
            )}
            <View style={styles.cardActions}>
              <ReportButton
                reportedUserId={item.id}
                reportedUserName={item.name}
                reporterId={1} // TODO: Replace with actual logged-in user ID from auth context
                size="small"
                onReportSuccess={() => {
                  // Optional: Could refresh the list or show a toast
                  console.log(`Reported user ${item.name}`);
                }}
              />
            </View>
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
  cardActions: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  flexGrow: {
    flexGrow: 1,
  },
});
