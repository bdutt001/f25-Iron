import * as Location from "expo-location";
import React, { useEffect, useState } from "react";
import { Button, StyleSheet, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useUser } from "../../context/UserContext";
import { ApiUser, NearbyUser, scatterUsersAround } from "../../utils/geo";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL  ?? "http://localhost:8000";

export default function MapScreen() {
  const [location, setLocation] =
    useState<Location.LocationObjectCoords | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);

  // use shared context instead of local state
  const { status, setStatus } = useUser();

  const loadUsers = async (
    coords: Location.LocationObjectCoords
  ): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/users`);
      if (!response.ok) {
        throw new Error(`Failed to load users (${response.status})`);
      }

      const data = (await response.json()) as ApiUser[];
      setNearbyUsers(scatterUsersAround(data, coords.latitude, coords.longitude));
      setErrorMsg(null);
    } catch (err) {
      console.error("Unable to load users", err);
      setErrorMsg("Unable to load users from the server");
    }
  };

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setErrorMsg("Permission to access location was denied");
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({});
      setLocation(currentLocation.coords);
      await loadUsers(currentLocation.coords);
    })();
  }, []);

  if (!location) {
    return (
      <View style={styles.container}>
        <Text>{errorMsg || "Fetching location..."}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {/* Current user marker */}
        {status === "Visible" && (
          <Marker
            coordinate={{
              latitude: location.latitude,
              longitude: location.longitude,
            }}
            title="You are here"
            pinColor="blue"
          />
        )}

        {/* Nearby users fetched from the API (fake coordinates for now) */}
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
          onPress={() =>
            setStatus(status === "Visible" ? "Hidden" : "Visible")
          }
        />
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
