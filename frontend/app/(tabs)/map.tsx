import * as Location from "expo-location";
import React, { useEffect, useState } from "react";
import { Button, StyleSheet, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useUser } from "../../context/UserContext";
import { ApiUser, NearbyUser, scatterUsersAround } from "../../utils/geo";

// Ensure fallback includes /api
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000/api";

// Fixed center for demo: Old Dominion University
const ODU_CENTER = { latitude: 36.885, longitude: -76.305 };

export default function MapScreen() {
  // Always center and scatter around ODU for the demo
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { status, setStatus } = useUser();

  const loadUsers = async (): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/users`);
      if (!response.ok) {
        throw new Error(`Failed to load users (${response.status})`);
      }
      const data = (await response.json()) as ApiUser[];
      setNearbyUsers(
        scatterUsersAround(data, ODU_CENTER.latitude, ODU_CENTER.longitude)
      );
      setErrorMsg(null);
    } catch (err) {
      console.error("Unable to load users", err);
      setErrorMsg("Unable to load users from the server");
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: ODU_CENTER.latitude,
          longitude: ODU_CENTER.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {/* Current user marker fixed at ODU for demo */}
        {status === "Visible" && (
          <Marker
            coordinate={ODU_CENTER}
            title="You are here"
            pinColor="blue"
          />
        )}

        {/* Nearby users fetched from the API, scattered around ODU */}
        {nearbyUsers.map((user) => (
          <Marker
            key={user.id}
            coordinate={user.coords}
            title={user.name}
            description={
              user.interestTags.length ? user.interestTags.join(", ") : undefined
            }
            pinColor="red"
          />
        ))}
      </MapView>

      {/* Controls */}
      <View style={styles.controls}>
        <Text style={styles.statusText}>Status: {status}</Text>
        <Button
          title={status === "Visible" ? "Hide Me" : "Show Me"}
          onPress={() => setStatus(status === "Visible" ? "Hidden" : "Visible")}
        />
        {!!errorMsg && <Text>{errorMsg}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  controls: {
    position: "absolute",
    bottom: 40,
    alignSelf: "center",
    alignItems: "center",
    backgroundColor: "white",
    padding: 10,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 16,
    marginBottom: 8,
    fontWeight: "bold",
  },
});
