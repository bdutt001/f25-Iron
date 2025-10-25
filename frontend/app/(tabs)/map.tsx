import * as Location from "expo-location";
import React, { useCallback, useEffect, useState, useRef } from "react";
import {
  Animated,
  Button,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Image,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useUser } from "../../context/UserContext";
import { API_BASE_URL } from "@/utils/api";
import { ApiUser, NearbyUser, scatterUsersAround } from "../../utils/geo";

const ODU_CENTER = { latitude: 36.885, longitude: -76.305 };

type Coords = { latitude: number; longitude: number };
type SelectedUser = NearbyUser & { isCurrentUser?: boolean };

const normalizeInterestTags = (tags: ApiUser["interestTags"]): string[] | null => {
  if (!Array.isArray(tags)) return null;
  return tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0);
};

export default function MapScreen() {
  const [center] = useState<Coords>(ODU_CENTER);
  const [myCoords] = useState<Coords>(ODU_CENTER);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<SelectedUser | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const [zoomLevel, setZoomLevel] = useState(14);

  const getZoomLevel = (region: { longitudeDelta: number }) => {
    const angle = region.longitudeDelta;
    return Math.round(Math.log(360 / angle) / Math.LN2);
  };

  const { status, setStatus, accessToken, currentUser } = useUser();

  const selfUser: SelectedUser | null = currentUser
    ? {
        id: currentUser.id,
        name: currentUser.name?.trim() || currentUser.email,
        email: currentUser.email,
        interestTags: Array.isArray(currentUser.interestTags)
          ? currentUser.interestTags
          : [],
        profilePicture: currentUser.profilePicture ?? null,
        coords: { latitude: myCoords.latitude, longitude: myCoords.longitude },
        trustScore: currentUser.trustScore ?? 99,
        isCurrentUser: true,
      }
    : null;

  const loadUsers = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/users`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });
      if (!response.ok) throw new Error(`Failed to load users (${response.status})`);
      const data = (await response.json()) as ApiUser[];
      const filtered = Array.isArray(data)
        ? data.filter((u) => (currentUser ? u.id !== currentUser.id : true))
        : [];
      setNearbyUsers(scatterUsersAround(filtered, center.latitude, center.longitude));
      setErrorMsg(null);
    } catch (err) {
      console.error("Unable to load users", err);
      setErrorMsg("Unable to load users from the server");
    }
  }, [accessToken, center.latitude, center.longitude, currentUser?.id]);

  const fetchUserDetails = useCallback(
    async (userId: number): Promise<ApiUser | null> => {
      try {
        const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        });
        if (!response.ok) throw new Error(`Failed to fetch user ${userId} (${response.status})`);
        return (await response.json()) as ApiUser;
      } catch (error) {
        console.error(`Unable to refresh user ${userId}`, error);
        return null;
      }
    },
    [accessToken]
  );

  const refreshSelection = useCallback(
    async (userId: number) => {
      const details = await fetchUserDetails(userId);
      if (!details) return;
      const normalizedTags = normalizeInterestTags(details.interestTags);
      const updatedScore = typeof details.trustScore === "number" ? details.trustScore : null;
      setSelectedUser((prev) =>
        prev && prev.id === userId
          ? {
              ...prev,
              name: details.name ?? details.email ?? prev.name,
              email: details.email ?? prev.email,
              interestTags: normalizedTags ?? prev.interestTags,
              trustScore: updatedScore ?? prev.trustScore,
            }
          : prev
      );
      setNearbyUsers((prev) =>
        prev.map((user) =>
          user.id === userId
            ? { ...user, trustScore: updatedScore ?? user.trustScore, interestTags: normalizedTags ?? user.interestTags }
            : user
        )
      );
    },
    [fetchUserDetails]
  );

  const handleSelectUser = useCallback(
    (user: NearbyUser | SelectedUser, overrides?: { isCurrentUser?: boolean }) => {
      const selection: SelectedUser = {
        ...user,
        coords: { ...user.coords },
        isCurrentUser: overrides?.isCurrentUser ?? (user as SelectedUser).isCurrentUser ?? false,
      };
      setSelectedUser(selection);
      void refreshSelection(selection.id);
    },
    [refreshSelection]
  );

  useEffect(() => {
    void loadUsers();
  }, [loadUsers, currentUser?.profilePicture]);

  const selectedId = selectedUser?.id ?? null;
  useEffect(() => {
    const interval = setInterval(() => {
      void loadUsers();
      if (selectedId !== null) void refreshSelection(selectedId);
    }, 12000);
    return () => clearInterval(interval);
  }, [loadUsers, refreshSelection, selectedId]);

  const scale = Math.max(Math.min((zoomLevel - 10) / 4 + 0.6, 2.0), 0.6);
  const animatedScale = useRef(new Animated.Value(scale)).current;

  useEffect(() => {
    Animated.timing(animatedScale, {
      toValue: scale,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [scale]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: center.latitude,
          longitude: center.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        onRegionChangeComplete={(region) => {
          setZoomLevel(getZoomLevel(region));
        }}
      >
        {/* Current user marker */}
        {status === "Visible" && selfUser && (
          <Marker
            coordinate={myCoords}
            title="You are here"
            description={selfUser.email}
            onPress={() => handleSelectUser(selfUser, { isCurrentUser: true })}
            anchor={{ x: 0.5, y: 0.5 }}
            centerOffset={{ x: 0, y: 0 }}
          >
            <View style={styles.markerContainer}>
              {selfUser.profilePicture ? (
                <Animated.Image
                  source={{
                    uri: selfUser.profilePicture.startsWith("http")
                      ? `${selfUser.profilePicture}?t=${Date.now()}`
                      : `${API_BASE_URL}${selfUser.profilePicture}?t=${Date.now()}`,
                  }}
                  style={[
                    styles.markerImage,
                    { borderColor: "#1f5fbf", transform: [{ scale: animatedScale }] },
                  ]}
                />
              ) : (
                <View style={[styles.markerPlaceholder, { borderColor: "#1f5fbf" }]}>
                  <Text style={styles.markerInitials}>
                    {selfUser.name?.charAt(0)?.toUpperCase() || "U"}
                  </Text>
                </View>
              )}
            </View>
          </Marker>
        )}

        {/* Other users */}
        {nearbyUsers.map((user) => (
          <Marker
            key={user.id}
            coordinate={user.coords}
            onPress={() => handleSelectUser(user, { isCurrentUser: false })}
            anchor={{ x: 0.5, y: 0.5 }}
            centerOffset={{ x: 0, y: 0 }}
          >
            <View style={styles.markerContainer}>
              {user.profilePicture ? (
                <Image
                  source={{
                    uri: user.profilePicture.startsWith("http")
                      ? `${user.profilePicture}?t=${Date.now()}`
                      : `${API_BASE_URL}${user.profilePicture}?t=${Date.now()}`,
                  }}
                  style={[
                    styles.markerImage,
                    { borderColor: "#e63946", width: 40, height: 40, borderRadius: 20 },
                  ]}
                />
              ) : (
                <View style={[styles.markerPlaceholder, { borderColor: "#e63946" }]}>
                  <Text style={styles.markerInitials}>
                    {user.name?.charAt(0)?.toUpperCase() || "?"}
                  </Text>
                </View>
              )}
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Floating enlarged preview */}
      {selectedUser && (
        <View
          pointerEvents="none"
          style={[
            styles.floatingMarker,
            { top: "42%", left: "50%", transform: [{ translateX: -75 }, { translateY: -75 }] },
          ]}
        >
          {selectedUser.profilePicture ? (
            <Image
              source={{
                uri: selectedUser.profilePicture.startsWith("http")
                  ? `${selectedUser.profilePicture}?t=${Date.now()}`
                  : `${API_BASE_URL}${selectedUser.profilePicture}?t=${Date.now()}`,
              }}
              style={[
                styles.floatingImage,
                { borderColor: selectedUser.isCurrentUser ? "#1f5fbf" : "#e63946" },
              ]}
            />
          ) : (
            <View
              style={[
                styles.floatingPlaceholder,
                { borderColor: selectedUser.isCurrentUser ? "#1f5fbf" : "#e63946" },
              ]}
            >
              <Text style={styles.floatingInitials}>
                {selectedUser.name?.charAt(0)?.toUpperCase() || "?"}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Bottom-sheet popup */}
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

            {/* ✅ Color-coded trust score */}
            <Text style={styles.trustScoreName}>
              Trust Score:{" "}
              <Text
                style={[
                  styles.trustScoreNumber,
                  {
                    color:
                      (selectedUser.trustScore ?? 0) >= 90
                        ? "#28a745"
                        : (selectedUser.trustScore ?? 0) >= 70
                        ? "#7ED957"
                        : (selectedUser.trustScore ?? 0) >= 51
                        ? "#FFC107"
                        : "#DC3545",
                    fontWeight: (selectedUser.trustScore ?? 0) >= 90 ? "700" : "600",
                  },
                ]}
              >
                {selectedUser.trustScore ?? "—"}
              </Text>
            </Text>

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
                {selectedUser.isCurrentUser
                  ? "You haven't added any interest tags yet."
                  : "No tags selected"}
              </Text>
            )}
          </View>
        </>
      )}

      {/* Controls */}
      {(!selectedUser || selectedUser.isCurrentUser) && (
        <View style={[styles.controls, selectedUser ? { bottom: 180 } : null]}>
          <Text style={styles.statusText}>Status: {status}</Text>
          <Button
            title={status === "Visible" ? "Hide Me" : "Show Me"}
            onPress={() => setStatus(status === "Visible" ? "Hidden" : "Visible")}
          />
          {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
        </View>
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
  statusText: { fontSize: 16, marginBottom: 8, fontWeight: "bold" },
  errorText: { marginTop: 8, color: "#c00", fontSize: 13 },
  markerContainer: { alignItems: "center", justifyContent: "center", width: 40, height: 40 },
  markerImage: { width: 40, height: 40, borderRadius: 20, borderWidth: 3, backgroundColor: "#fff" },
  markerPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    backgroundColor: "#f1f1f1",
    alignItems: "center",
    justifyContent: "center",
  },
  markerInitials: { fontSize: 16, fontWeight: "600", color: "#555" },
  floatingMarker: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    elevation: 9999,
  },
  floatingImage: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 5,
    backgroundColor: "#fff",
  },
  floatingPlaceholder: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 5,
    backgroundColor: "#f1f1f1",
    alignItems: "center",
    justifyContent: "center",
  },
  floatingInitials: { fontSize: 50, fontWeight: "700", color: "#555" },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.15)" },
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
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#ddd" },
  sheetClose: { color: "#1f5fbf", fontWeight: "600" },
  calloutHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  calloutTitle: { fontSize: 16, fontWeight: "600" },
  calloutSubtitle: { fontSize: 13, color: "#666", marginTop: 2 },
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
  calloutTagsWrapper: { flexDirection: "row", flexWrap: "wrap", marginTop: 8 },
  calloutTagChip: {
    backgroundColor: "#e6f0ff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    marginRight: 6,
    marginBottom: 6,
  },
  calloutTagText: { fontSize: 12, color: "#1f5fbf", fontWeight: "500" },
  calloutEmptyTags: { marginTop: 8, fontSize: 12, color: "#999" },
  trustScoreName: { textAlign: "right", fontSize: 15, marginTop: 6 },
  trustScoreNumber: { fontSize: 15, fontWeight: "600" },
});
