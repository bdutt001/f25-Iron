import * as Location from "expo-location";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Platform,
  Alert,
  UIManager,
} from "react-native";
import MapView, { Marker, Region } from "react-native-maps";
import { Image as ExpoImage } from "expo-image";
import { useUser } from "../../context/UserContext";
import { API_BASE_URL } from "@/utils/api";
import { ApiUser, NearbyUser, scatterUsersAround } from "../../utils/geo";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import UserOverflowMenu from "../../components/UserOverflowMenu";
import { AppScreen } from "@/components/layout/AppScreen";
import { useAppTheme } from "../../context/ThemeContext";

const ODU_CENTER = { latitude: 36.885, longitude: -76.305 };
const IS_ANDROID = Platform.OS === "android";
const MARKER_DIAMETER = IS_ANDROID ? 36 : 44;
const MARKER_BORDER_WIDTH = IS_ANDROID ? 2 : 3;
const MARKER_IMAGE_SIZE = MARKER_DIAMETER - MARKER_BORDER_WIDTH * 2;
const RECENTER_DELTA = 0.012;
const CENTER_EPSILON = 0.0008;

// Lightweight dark map style for night theme
const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#0b1220" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#f1f5f9" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0b1220" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#334155" }] },
  { featureType: "landscape.man_made", elementType: "geometry.stroke", stylers: [{ color: "#64748b" }] },
  { featureType: "poi", elementType: "geometry.stroke", stylers: [{ color: "#64748b" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1e293b" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#475569" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#f8fafc" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#0f172a" }] },
  { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#12324f" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0b2f4a" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

const LIGHT_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#f8fafc" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#0f172a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f8fafc" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#94a3b8" }] },
  { featureType: "landscape.man_made", elementType: "geometry.stroke", stylers: [{ color: "#94a3b8" }] },
  { featureType: "poi", elementType: "geometry.stroke", stylers: [{ color: "#94a3b8" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#e2e8f0" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#cbd5e1" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#475569" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#e2e8f0" }] },
  { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#d9f2e6" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#cfe8ff" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

type Coords = { latitude: number; longitude: number };
type SelectedUser = NearbyUser & { isCurrentUser?: boolean };

type AvatarMarkerProps = {
  coordinate: Coords;
  borderColor: string;
  opacity?: number;
  imageUri: string | null;
  initial: string;
  onPress: () => void;
};

const AvatarMarker = React.memo(function AvatarMarker({
  coordinate,
  borderColor,
  opacity = 1,
  imageUri,
  initial,
  onPress,
}: AvatarMarkerProps) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTrackingSoon = useCallback(() => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      setTracksViewChanges(false);
    }, 50);
  }, []);

  useEffect(() => {
    setTracksViewChanges(true);
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    };
  }, [borderColor, imageUri, initial, opacity, coordinate.latitude, coordinate.longitude]);

  return (
    <Marker
      coordinate={coordinate}
      onPress={onPress}
      anchor={{ x: 0.5, y: 0.5 }}
      centerOffset={{ x: 0, y: 0 }}
      tracksViewChanges={tracksViewChanges}
    >
      <View
        collapsable={false}
        needsOffscreenAlphaCompositing
        renderToHardwareTextureAndroid
        style={[styles.markerWrap, { borderColor, opacity }]}
      >
        {imageUri ? (
          <ExpoImage
            source={{ uri: imageUri }}
            style={styles.markerAvatar}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={0}
            onLoad={stopTrackingSoon}
            onError={stopTrackingSoon}
          />
        ) : (
          <Text style={styles.markerInitial} onLayout={stopTrackingSoon}>
            {initial}
          </Text>
        )}
      </View>
    </Marker>
  );
},
// Avoid re-rendering markers on unrelated state changes (e.g. map panning UI state)
(prev, next) =>
  prev.coordinate.latitude === next.coordinate.latitude &&
  prev.coordinate.longitude === next.coordinate.longitude &&
  prev.borderColor === next.borderColor &&
  prev.opacity === next.opacity &&
  prev.imageUri === next.imageUri &&
  prev.initial === next.initial
);

export default function MapScreen() {
  const { colors, isDark } = useAppTheme();
  const [center, setCenter] = useState<Coords>(ODU_CENTER);
  const [myCoords, setMyCoords] = useState<Coords | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<SelectedUser | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const [menuTarget, setMenuTarget] = useState<SelectedUser | null>(null);
  const positionsRef = useRef<Map<number, Coords>>(new Map());
  const hasAnimatedRegion = useRef(false);
  const hasAnimatedToUser = useRef(false);
  const [isCenteredOnUser, setIsCenteredOnUser] = useState(true);

  // Enable LayoutAnimation on Android (skip on New Architecture to avoid warning)
  useEffect(() => {
    const isAndroid = Platform.OS === "android";
    const isNewArch = Boolean((global as any).__turboModuleProxy);
    if (isAndroid && UIManager.setLayoutAnimationEnabledExperimental && !isNewArch) {
      try {
        UIManager.setLayoutAnimationEnabledExperimental(true);
      } catch {
        // ignore if unavailable
      }
    }
  }, []);

  const {
    status,
    setStatus,
    accessToken,
    currentUser,
    prefetchedUsers,
    setPrefetchedUsers,
    isStatusUpdating,
    fetchWithAuth,
  } = useUser();
  const currentUserId = currentUser?.id;
  const isAdmin = currentUser?.isAdmin;

  const markerBaseCoords = myCoords ?? center;

  const selfUser: SelectedUser | null = useMemo(
    () =>
      currentUser
        ? {
            id: currentUser.id,
            name: currentUser.name?.trim() || currentUser.email,
            email: currentUser.email,
            interestTags: Array.isArray(currentUser.interestTags) ? currentUser.interestTags : [],
            profilePicture: currentUser.profilePicture ?? null,
            coords: { latitude: markerBaseCoords.latitude, longitude: markerBaseCoords.longitude },
            trustScore: currentUser.trustScore ?? 99,
            isCurrentUser: true,
          }
        : null,
    [currentUser, markerBaseCoords]
  );
  const selfPictureToken = (selfUser?.profilePicture as string | null) ?? null;
  const selfImageUri = selfPictureToken
    ? selfPictureToken.startsWith("http")
      ? selfPictureToken
      : `${API_BASE_URL}${selfPictureToken}`
    : null;

  const fetchSavedLocation = useCallback(async (): Promise<Coords | null> => {
    if (!accessToken) return null;
    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/users/me/location`);
      if (response.status === 404) return null;
      if (!response.ok) return null;
      const data = (await response.json()) as { latitude?: unknown; longitude?: unknown };
      const latitude = Number(data?.latitude);
      const longitude = Number(data?.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      return { latitude, longitude };
    } catch (err) {
      console.warn("Failed to fetch saved location:", err);
      return null;
    }
  }, [accessToken, fetchWithAuth]);

  const persistLocation = useCallback(
    async (coords: Coords) => {
      if (!accessToken) return;
      try {
        await fetchWithAuth(`${API_BASE_URL}/users/me/location`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(coords),
        });
      } catch (err) {
        console.warn("Failed to persist location:", err);
      }
    },
    [accessToken, fetchWithAuth]
  );

  const requestDeviceLocation = useCallback(async (): Promise<Coords | null> => {
    try {
      const { status: permissionStatus } = await Location.requestForegroundPermissionsAsync();
      if (permissionStatus !== "granted") return null;
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return { latitude: position.coords.latitude, longitude: position.coords.longitude };
    } catch (err) {
      console.warn("Unable to fetch device location:", err);
      return null;
    }
  }, []);

  const applyCenter = useCallback((coords: Coords) => {
    setCenter((prev) => {
      const sameLat = Math.abs(prev.latitude - coords.latitude) < 1e-6;
      const sameLng = Math.abs(prev.longitude - coords.longitude) < 1e-6;
      if (!sameLat || !sameLng) {
        positionsRef.current.clear();
        hasAnimatedRegion.current = false;
        hasAnimatedToUser.current = false;
      }
      return coords;
    });
    setMyCoords(coords);
  }, []);

  const hydrateLocation = useCallback(async () => {
    if (isAdmin) return;
    setLoadingLocation(true);
    try {
      let coords = await fetchSavedLocation();
      if (!coords) {
        const deviceCoords = await requestDeviceLocation();
        if (deviceCoords) {
          coords = deviceCoords;
          await persistLocation(deviceCoords);
        }
      }
      applyCenter(coords ?? ODU_CENTER);
    } finally {
      setLoadingLocation(false);
    }
  }, [applyCenter, fetchSavedLocation, isAdmin, persistLocation, requestDeviceLocation]);

  const loadUsers = useCallback(async () => {
    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/users`);
      if (!response.ok) throw new Error(`Failed to load users (${response.status})`);
      const data = (await response.json()) as ApiUser[];
      const filtered = data.filter(
        (u) =>
          (u.visibility ?? true) &&
          !u.isAdmin &&
          (currentUserId ? u.id !== currentUserId : true)
      );
      setPrefetchedUsers(filtered);
      setErrorMsg(null);
    } catch (err) {
      console.error("Unable to load users:", err);
      setErrorMsg("Unable to load users from the server");
    }
  }, [currentUserId, fetchWithAuth, setPrefetchedUsers]);

  // Compute simple match score (% overlap of tags using Jaccard)
  const matchPercent = useCallback(
    (other: { interestTags: string[] }): number => {
      const a = new Set((currentUser?.interestTags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean));
      const b = new Set((other.interestTags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean));
      if (a.size === 0 && b.size === 0) return 0;
      let inter = 0;
      for (const t of a) if (b.has(t)) inter++;
      const union = a.size + b.size - inter;
      return union > 0 ? Math.round((inter / union) * 100) : 0;
    },
    [currentUser?.interestTags]
  );

  const startChat = useCallback(
    async (receiverId: number, receiverName: string) => {
      if (!currentUser) return;
      try {
        const userResponse = await fetchWithAuth(`${API_BASE_URL}/users/${receiverId}`);
        let latestUser: ApiUser | null = null;
        if (userResponse.ok) latestUser = (await userResponse.json()) as ApiUser;

        const resp = await fetchWithAuth(`${API_BASE_URL}/api/messages/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participants: [currentUser.id, receiverId] }),
        });
        if (!resp.ok) throw new Error(`Failed to start chat (${resp.status})`);
        const data = (await resp.json()) as { chatId: number };
        router.push({
          pathname: "/(tabs)/messages/[chatId]",
          params: {
            chatId: String(data.chatId),
            name: latestUser?.name || receiverName,
            receiverId: String(receiverId),
            profilePicture: (latestUser?.profilePicture as string) || "",
          },
        });
      } catch (e) {
        console.error(e);
      }
    },
    [currentUser, fetchWithAuth]
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const startReportFlow = useCallback(() => {
    if (!selectedUser || !accessToken || !currentUser) {
      Alert.alert("Error", "You must be logged in to report users.");
      return;
    }
    if (currentUser.id === selectedUser.id) {
      Alert.alert("Error", "You cannot report yourself.");
      return;
    }
    const submitReport = async (reason: string, severity = 1) => {
      try {
        const resp = await fetch(`${API_BASE_URL}/api/report`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ reportedId: selectedUser.id, reason, severity }),
        });
        const payload = (await resp.json()) as { error?: string };
        if (!resp.ok) throw new Error(payload?.error || "Failed to submit report");
        Alert.alert("Report Submitted", "Thank you for your report.");
      } catch (e: any) {
        Alert.alert("Error", e?.message || "Failed to submit report");
      }
    };
    Alert.alert(
      "Report User",
      `Report ${selectedUser.name || selectedUser.email}?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Inappropriate", onPress: () => { void submitReport("Inappropriate Behavior"); } },
        { text: "Spam/Fake", onPress: () => { void submitReport("Spam/Fake Profile"); } },
        { text: "Harassment", onPress: () => { void submitReport("Harassment"); } },
        { text: "Other", onPress: () => { void submitReport("Other"); } },
      ]
    );
  }, [accessToken, currentUser, selectedUser]);

  useEffect(() => {
    if (isAdmin) return;
    if (prefetchedUsers && prefetchedUsers.length > 0) {
      const filtered = prefetchedUsers.filter(
        (u) =>
          (u.visibility ?? true) &&
          !u.isAdmin &&
          (currentUserId ? u.id !== currentUserId : true)
      );
      const missing = filtered.filter((u) => !positionsRef.current.has(u.id));
      if (missing.length) {
        const scattered = scatterUsersAround(missing, center.latitude, center.longitude);
        for (const u of scattered) positionsRef.current.set(u.id, u.coords);
      }
      const next = filtered.map<NearbyUser>((u) => ({
        id: u.id,
        name: u.name ?? u.email,
        email: u.email,
        interestTags: Array.isArray(u.interestTags) ? u.interestTags : [],
        profilePicture: (u.profilePicture ?? null) as any,
        coords: positionsRef.current.get(u.id) as Coords,
        trustScore: (u as any).trustScore ?? undefined,
      }));
      setNearbyUsers((prev) => {
        if (prev.length === next.length && prev.every((p, i) => p.id === next[i].id)) return prev;
        return next;
      });

      if (!hasAnimatedRegion.current && mapRef.current && next.length > 0) {
        const first = next[0].coords;
        mapRef.current.animateToRegion(
          {
            latitude: first.latitude,
            longitude: first.longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          },
          400
        );
        hasAnimatedRegion.current = true;
      }
      return;
    }

    if (!accessToken || !currentUser) return;
    void loadUsers();
  }, [
    accessToken,
    center.latitude,
    center.longitude,
    currentUser,
    currentUserId,
    isAdmin,
    loadUsers,
    prefetchedUsers,
    selfUser,
  ]);

  // Bridge effect for late prefetched users
  useEffect(() => {
    if (isAdmin || !prefetchedUsers?.length || nearbyUsers.length > 0) return;
    const filtered = prefetchedUsers.filter(
      (u) =>
        (u.visibility ?? true) &&
        !u.isAdmin &&
        (currentUserId ? u.id !== currentUserId : true)
    );
    const missing = filtered.filter((u) => !positionsRef.current.has(u.id));
    if (missing.length) {
      const scattered = scatterUsersAround(missing, center.latitude, center.longitude);
      for (const u of scattered) positionsRef.current.set(u.id, u.coords);
    }
    const next = filtered.map<NearbyUser>((u) => ({
      id: u.id,
      name: u.name ?? u.email,
      email: u.email,
      interestTags: Array.isArray(u.interestTags) ? u.interestTags : [],
      profilePicture: (u.profilePicture ?? null) as any,
      coords: positionsRef.current.get(u.id) as Coords,
      trustScore: (u as any).trustScore ?? undefined,
    }));
    setNearbyUsers(next);
  }, [center.latitude, center.longitude, currentUserId, isAdmin, nearbyUsers.length, prefetchedUsers]);

  useEffect(() => {
    void hydrateLocation();
  }, [hydrateLocation]);

  useEffect(() => {
    if (!myCoords || !mapRef.current || hasAnimatedToUser.current) return;
    mapRef.current.animateToRegion(
      {
        latitude: myCoords.latitude,
        longitude: myCoords.longitude,
        latitudeDelta: RECENTER_DELTA,
        longitudeDelta: RECENTER_DELTA,
      },
      350
    );
    hasAnimatedToUser.current = true;
  }, [myCoords]);

  const recenterOnUser = useCallback(() => {
    const target = myCoords ?? center;
    if (!target || !mapRef.current) return;
    setIsCenteredOnUser(true);
    mapRef.current.animateToRegion(
      {
        latitude: target.latitude,
        longitude: target.longitude,
        latitudeDelta: RECENTER_DELTA,
        longitudeDelta: RECENTER_DELTA,
      },
      300
    );
  }, [center, myCoords]);

  const handleRegionChangeComplete = useCallback(
    (region: Region) => {
      const target = myCoords ?? center;
      if (!target) return;
      const latDiff = Math.abs(region.latitude - target.latitude);
      const lngDiff = Math.abs(region.longitude - target.longitude);
      const centered = latDiff < CENTER_EPSILON && lngDiff < CENTER_EPSILON;
      setIsCenteredOnUser(centered);
    },
    [center, myCoords]
  );

  // Helpers for UI coloring
  const trustColor = (score?: number) => {
    const s = score ?? 0;
    if (s >= 90) return "#28a745";
    if (s >= 70) return "#7ED957";
    if (s >= 51) return "#FFC107";
    return "#DC3545";
  };

  const textPrimary = useMemo(() => ({ color: colors.text }), [colors.text]);
  const textMuted = useMemo(() => ({ color: colors.muted }), [colors.muted]);

  return (
    <AppScreen edges={["left", "right"]} style={{ backgroundColor: isAdmin ? "#0f172a" : colors.background }}>
      {isAdmin ? (
        <View style={[styles.centered, { padding: 24 }]}>
          <Text style={[styles.title, { color: "#fff" }]}>Admin-only account</Text>
          <Text style={[styles.subtitle, { color: "#cbd5e1" }]}>
            Admin accounts cannot access the user map. Open the moderation dashboard instead.
          </Text>
          <TouchableOpacity
            style={[styles.ctaButton, { backgroundColor: "#0ea5e9" }]}
            onPress={() => router.replace("/(admin)")}
          >
            <Text style={[styles.ctaText, { color: "#fff" }]}>Go to Admin Dashboard</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={{
              latitude: center.latitude,
              longitude: center.longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
            customMapStyle={isDark ? DARK_MAP_STYLE : LIGHT_MAP_STYLE}
            onRegionChangeComplete={handleRegionChangeComplete}
          >
            {/* Current user (opacity lowered when hidden) */}
            {selfUser && (
              <AvatarMarker
                coordinate={selfUser.coords}
                onPress={() => setSelectedUser(selfUser)}
                borderColor={status === "Hidden" ? "#94a3b8" : "#1f5fbf"}
                opacity={status === "Hidden" ? 0.35 : 1}
                imageUri={selfImageUri}
                initial={(selfUser.name || selfUser.email)?.charAt(0)?.toUpperCase() || "?"}
              />
            )}

            {/* Other users */}
            {nearbyUsers.map((user) => {
              const pictureToken = (user.profilePicture as string | null) ?? null;
              const markerKey = `${user.id}:${pictureToken ?? "nop"}`;
              const uri =
                pictureToken && pictureToken.length > 0
                  ? pictureToken.startsWith("http")
                    ? pictureToken
                    : `${API_BASE_URL}${pictureToken}`
                  : null;
              return (
                <AvatarMarker
                  key={markerKey}
                  coordinate={user.coords}
                  onPress={() => setSelectedUser(user)}
                  borderColor="#e63946"
                  imageUri={uri}
                  initial={(user.name || user.email)?.charAt(0)?.toUpperCase() || "?"}
                />
              );
            })}
          </MapView>

          <UserOverflowMenu
            visible={!!menuTarget}
            onClose={() => setMenuTarget(null)}
            targetUser={menuTarget}
            onBlocked={(uid) => {
              setNearbyUsers((prev) => prev.filter((u) => u.id !== uid));
              setSelectedUser(null);
            }}
          />

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
                <ExpoImage
                  source={{
                    uri: selectedUser.profilePicture.startsWith("http")
                      ? selectedUser.profilePicture
                      : `${API_BASE_URL}${selectedUser.profilePicture}`,
                  }}
                  style={[
                    styles.floatingImage,
                    { borderColor: selectedUser.isCurrentUser ? "#1f5fbf" : "#e63946" },
                  ]}
                  cachePolicy="memory-disk"
                  transition={0}
                  contentFit="cover"
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

          {/* Bottom sheet */}
          {selectedUser && (
            <>
              <TouchableOpacity
                style={[
                  styles.backdrop,
                  { backgroundColor: isDark ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.15)" },
                ]}
                activeOpacity={1}
                onPress={() => setSelectedUser(null)}
              />
              <View
                style={[
                  styles.sheet,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    shadowColor: isDark ? "#000" : "#0f172a",
                  },
                ]}
              >
                <View style={styles.sheetHeader}>
                  <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
                  <TouchableOpacity onPress={() => setSelectedUser(null)}>
                    <Text style={[styles.sheetClose, { color: colors.accent }]}>Close</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.calloutHeaderRow}>
                  <Text style={[styles.calloutTitle, textPrimary]}>
                    {selectedUser.name || selectedUser.email}
                  </Text>
                  {selectedUser.isCurrentUser && (
                    <Text style={[styles.calloutBadge, { backgroundColor: colors.accent }]}>You</Text>
                  )}
                </View>

                <Text style={[styles.calloutSubtitle, textMuted]}>{selectedUser.email}</Text>

                <Text style={[styles.trustScoreName, textPrimary]}>
                  Trust Score:{" "}
                  <Text style={[styles.trustScoreNumber, { color: trustColor(selectedUser.trustScore) }]}>
                    {selectedUser.trustScore ?? "-"}
                  </Text>
                </Text>

                {!selectedUser.isCurrentUser && (
                  <Text style={[styles.calloutSubtitle, { marginTop: 4 }, textMuted]}>
                    Match: {matchPercent(selectedUser)}%
                  </Text>
                )}

                {selectedUser.interestTags.length > 0 ? (
                  <View style={[styles.calloutTagsWrapper, { marginTop: 12 }]}>
                    {selectedUser.interestTags.map((tag) => (
                      <View
                        key={tag}
                        style={[
                          styles.calloutTagChip,
                          {
                            backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "#e6f0ff",
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <Text style={[styles.calloutTagText, { color: colors.accent }]}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={[styles.calloutEmptyTags, textMuted]}>
                    {selectedUser.isCurrentUser
                      ? "You haven't added any interest tags yet."
                      : "No tags selected"}
                  </Text>
                )}

                {!selectedUser.isCurrentUser && (
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      marginTop: 16,
                      alignItems: "center",
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => startChat(selectedUser.id, selectedUser.name || selectedUser.email)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: colors.accent,
                        borderRadius: 18,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                      }}
                    >
                      <Ionicons name="chatbubble" size={18} color="#fff" />
                      <Text style={{ color: "#fff", marginLeft: 8, fontWeight: "700" }}>Message</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setMenuTarget(selectedUser)}
                      hitSlop={{ left: 8, right: 8, top: 6, bottom: 6 }}
                      style={{ paddingHorizontal: 2, paddingVertical: 6 }}
                    >
                      <Ionicons name="ellipsis-vertical" size={20} color={colors.icon} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </>
          )}

          {/* Recenter button */}
          {!selectedUser && myCoords && !isCenteredOnUser && (
            <TouchableOpacity
              style={[
                styles.recenterButton,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  shadowColor: isDark ? "#000" : "#0f172a",
                },
                !myCoords ? styles.recenterButtonDisabled : null,
              ]}
              onPress={recenterOnUser}
              activeOpacity={0.85}
            >
              {loadingLocation ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Ionicons name="locate" size={20} color={colors.icon} />
              )}
            </TouchableOpacity>
          )}

          {/* Controls */}
          <View
            style={[
              styles.controls,
              {
                backgroundColor: colors.card,
                shadowColor: isDark ? "#000" : "#0f172a",
                borderColor: colors.border,
              },
              selectedUser ? { display: "none" } : null,
            ]}
          >
            <Text style={[styles.statusText, textPrimary]}>Visibility: {status}</Text>
            <TouchableOpacity
              style={[
                styles.visibilityToggle,
                isStatusUpdating && styles.visibilityToggleDisabled,
                { backgroundColor: colors.accent },
              ]}
              onPress={() => {
                if (isStatusUpdating) return;
                setStatus(status === "Visible" ? "Hidden" : "Visible");
              }}
              activeOpacity={0.85}
              disabled={isStatusUpdating}
            >
              {isStatusUpdating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.visibilityToggleText}>
                  {status === "Visible" ? "Hide Me" : "Show Me"}
                </Text>
              )}
            </TouchableOpacity>
            {!!errorMsg && <Text style={[styles.errorText, textPrimary]}>{errorMsg}</Text>}
          </View>
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 8 },
  subtitle: { textAlign: "center", fontSize: 14, marginBottom: 16, lineHeight: 20 },
  ctaButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  ctaText: { fontWeight: "700", fontSize: 15 },
  map: { flex: 1 },
  // Circular marker avatar styles
  markerWrap: {
    width: MARKER_DIAMETER,
    height: MARKER_DIAMETER,
    borderRadius: MARKER_DIAMETER / 2,
    borderWidth: MARKER_BORDER_WIDTH,
    padding: MARKER_BORDER_WIDTH,
    backgroundColor: "#fff",
    // Overflow visible avoids Android corner clipping when the map snapshots markers
    overflow: "visible",
    alignItems: "center",
    justifyContent: "center",
  },
  markerAvatar: {
    width: MARKER_IMAGE_SIZE,
    height: MARKER_IMAGE_SIZE,
    borderRadius: MARKER_IMAGE_SIZE / 2,
  },
  markerInitial: {
    fontSize: 16,
    fontWeight: "700",
    color: "#555",
    textAlign: "center",
    lineHeight: MARKER_IMAGE_SIZE,
  },
  controls: {
    position: "absolute",
    bottom: 40,
    alignSelf: "center",
    alignItems: "center",
    padding: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  statusText: { fontSize: 16, marginBottom: 8, fontWeight: "bold" },
  errorText: { marginTop: 8, color: "#c00", fontSize: 13 },
  visibilityToggle: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    minWidth: 120,
    alignItems: "center",
  },
  visibilityToggleDisabled: { opacity: 0.6 },
  visibilityToggleText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  // Floating preview
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
  // Bottom sheet
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: StyleSheet.hairlineWidth,
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
    color: "#fff",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 8,
  },
  calloutTagsWrapper: { flexDirection: "row", flexWrap: "wrap", marginTop: 12 },
  calloutTagChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    marginRight: 6,
    marginBottom: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  calloutTagText: { fontSize: 12, fontWeight: "500" },
  calloutEmptyTags: { marginTop: 8, fontSize: 12 },
  trustScoreName: { textAlign: "right", fontSize: 15, marginTop: 6 },
  trustScoreNumber: { fontSize: 15, fontWeight: "700" },
  inlineActionsWrap: { overflow: "hidden", flexDirection: "row", alignItems: "center", marginRight: 6 },
  inlineActionsWrapClosed: { width: 0, opacity: 0 },
  inlineActionsWrapOpen: { width: "auto", opacity: 1 },
  inlineActionDanger: {
    color: "#dc3545",
    fontWeight: "700",
    paddingVertical: 6,
    paddingHorizontal: 0,
    fontSize: 15,
    backgroundColor: "#fff",
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  // Recenter button
  recenterButton: {
    position: "absolute",
    right: 16,
    bottom: 40,
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  recenterButtonDisabled: { opacity: 0.6 },
});
