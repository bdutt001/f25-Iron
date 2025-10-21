import * as Location from "expo-location";
import React, { useEffect, useState } from "react";
import { Button, StyleSheet, Text, View, TouchableOpacity } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useUser } from "../../context/UserContext";
import { API_BASE_URL } from "@/utils/api";
import { ApiUser, NearbyUser, scatterUsersAround } from "../../utils/geo";

// Fixed center: Old Dominion University (Norfolk, VA)
const ODU_CENTER = { latitude: 36.885, longitude: -76.305 };

type Coords = { latitude: number; longitude: number };

type SelectedUser = NearbyUser & { isCurrentUser?: boolean };

export default function MapScreen() {
  // Center the map and "you are here" at ODU for the demo
  const [center] = useState<Coords>(ODU_CENTER);
  const [myCoords] = useState<Coords>(ODU_CENTER);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<SelectedUser | null>(null);

  // shared visibility status
  const { status, setStatus, accessToken, currentUser } = useUser();

  const selfUser: SelectedUser | null = currentUser
    ? {
        id: currentUser.id,
        name: currentUser.name?.trim() || currentUser.email,
        email: currentUser.email,
        interestTags: Array.isArray(currentUser.interestTags) ? currentUser.interestTags : [],
        coords: { latitude: myCoords.latitude, longitude: myCoords.longitude },
        trustScore: currentUser.trustScore ?? 99,
        isCurrentUser: true,
      }
    : null;

  const loadUsers = async (): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/users`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });
      if (!response.ok) {
        throw new Error(`Failed to load users (${response.status})`);
      }

      const data = (await response.json()) as ApiUser[];
      const filtered = Array.isArray(data)
        ? data.filter((u) => (currentUser ? u.id !== currentUser.id : true))
        : [];
      setNearbyUsers(
        scatterUsersAround(filtered, center.latitude, center.longitude)
      );
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
        {status === "Visible" && selfUser && (
          <Marker
            coordinate={myCoords}
            pinColor="blue"
            title="You are here"
            description={selfUser.email}
            onPress={() => setSelectedUser(selfUser)}
          />
        )}

        {/* Team users scattered around ODU */}
        {nearbyUsers.map((user) => (
          <Marker
            key={user.id}
            coordinate={user.coords}
            pinColor="red"
            onPress={() => setSelectedUser(user)}
          />
        ))}
      </MapView>

      {/* Controls */}
      <View style={[
        styles.controls,
        selectedUser ? { bottom: 180 } : null,
      ]}>
        <Text style={styles.statusText}>Status: {status}</Text>
        <Button
          title={status === "Visible" ? "Hide Me" : "Show Me"}
          onPress={() => setStatus(status === "Visible" ? "Hidden" : "Visible")}
        />
        {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
      </View>

      {/* Simple bottom-sheet popup for selected user */}
      {selectedUser && (
        <>
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => setSelectedUser(null)}
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHandle} />
              <TouchableOpacity onPress={() => setSelectedUser(null)}>
                <Text style={styles.sheetClose}>Close</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.calloutHeaderRow}>
              <Text style={styles.calloutTitle}>{selectedUser.name || selectedUser.email}</Text>
              {selectedUser.isCurrentUser && <Text style={styles.calloutBadge}>You</Text>}
            </View>
            <Text style={styles.calloutSubtitle}>{selectedUser.email}</Text>
            <Text style={styles.trustScoreName}>Trust Score: <Text style={styles.trustScoreNumber} >{selectedUser.trustScore}</Text></Text>
            {selectedUser.interestTags.length > 0 ? (
              <View style={[styles.calloutTagsWrapper, { marginTop: 12 }]}>
                {selectedUser.interestTags.map((tag) => (
                  <View key={tag} style={styles.calloutTagChip}>
                    <Text style={styles.calloutTagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.calloutEmptyTags}>
                {selectedUser.isCurrentUser ? "You haven't added any interest tags yet." : "No tags selected"}
              </Text>
            )}
          </View>
        </>
      )}
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
  errorText: {
    marginTop: 8,
    color: "#c00",
    fontSize: 13,
  },
  calloutContainer: {
    backgroundColor: "white",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    minWidth: 220,
    maxWidth: 260,
  },
  calloutTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  calloutSubtitle: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  calloutHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  calloutBadge: {
    backgroundColor: "#1f5fbf",
    color: "#fff",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 8,
  },
  calloutTagsWrapper: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
  },
  calloutTagChip: {
    backgroundColor: "#e6f0ff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    marginRight: 6,
    marginBottom: 6,
  },
  calloutTagText: {
    fontSize: 12,
    color: "#1f5fbf",
    fontWeight: "500",
  },
  calloutEmptyTags: {
    marginTop: 8,
    fontSize: 12,
    color: "#999",
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  sheet: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: "white",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ddd",
  },
  sheetClose: {
    color: "#1f5fbf",
    fontWeight: "600",
  },
  trustScoreName:{
    textAlign: "right",
    fontSize: 15
  },
  trustScoreNumber:{
    color: "#007BFF"
  },
});
