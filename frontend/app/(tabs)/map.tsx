import * as Location from "expo-location";
import React, { useEffect, useState } from "react";
import { Button, StyleSheet, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useUser } from "../context/UserContext";

// Helper: create random nearby coordinates
function generateNearbyUsers(baseLat: number, baseLng: number, count = 5) {
  const users = [];
  for (let i = 0; i < count; i++) {
    // ~0.001 latitude/longitude ≈ 100m
    const latOffset = (Math.random() - 1) * 0.01; // ±0.01 ≈ 1000m
    const lngOffset = (Math.random() - 1) * 0.01;
    users.push({
      id: i + 1,
      name: `User ${i + 1}`,
      coords: {
        latitude: baseLat + latOffset,
        longitude: baseLng + lngOffset,
      },
    });
  }
  return users;
}

export default function MapScreen() {
  const [location, setLocation] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nearbyUsers, setNearbyUsers] = useState<any[]>([]);

  // use shared context instead of local state
  const { status, setStatus } = useUser();

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setErrorMsg("Permission to access location was denied");
        return;
      }
      let currentLocation = await Location.getCurrentPositionAsync({});
      setLocation(currentLocation.coords);

      // Generate 5 random nearby users once we know location
      const fakeUsers = generateNearbyUsers(
        currentLocation.coords.latitude,
        currentLocation.coords.longitude,
        5
      );
      setNearbyUsers(fakeUsers);
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

        {/* Fake nearby users */}
        {nearbyUsers.map((user) => (
          <Marker
            key={user.id}
            coordinate={user.coords}
            title={user.name}
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
