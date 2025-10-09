import * as Location from "expo-location";
import React, { useEffect, useState } from "react";
import { Button, StyleSheet, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useUser } from "../../context/UserContext";
import { ApiUser, NearbyUser, scatterUsersAround } from "../../utils/geo";

// Ensure the fallback includes the /api prefix
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000/api";

// Fixed center: Old Dominion University (Norfolk, VA)
const ODU_CENTER = { latitude: 36.885, longitude: -76.305 };

type Coords = { latitude: number; longitude: number };

export default function MapScreen() {
  // Center the map and "you are here" at ODU for the demo
  const [center] = useState<Coords>(ODU_CENTER);
  const [myCoords] = useState<Coords>(ODU_CENTER);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);

  // shared visibility status
  const { status, setStatus } = useUser();

  const loadUsers = async (): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/users`);
      if (!response.ok) {
        throw new Error(`Failed to load users (${response.status})`);
      }

      const data = (await response.json()) as ApiUser[];
      setNearbyUsers(scatterUsersAround(data, center.latitude, center.longitude));
      setErrorMsg(null);
    } catch (err) {
      console.error("Unable to load users", err);
      setErrorMsg("Unable to load users from the server");
    }
  };

  useEffect(() => {
    // Always load users around ODU
    void loadUsers();
  }, []);

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: center.latitude,
          longitude: center.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {/* Current user marker (optional) */}
        {status === "Visible" && myCoords && (
          <Marker
            coordinate={myCoords}
            title="You are here"
            pinColor="blue"
          />)
        }

        {/* Team users scattered around ODU */}
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
