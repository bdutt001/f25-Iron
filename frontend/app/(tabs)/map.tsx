import React, { useCallback, useEffect, useState, useRef } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Platform,
  PixelRatio,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import { Image as ExpoImage } from "expo-image";
import { useUser } from "../../context/UserContext";
import { API_BASE_URL } from "@/utils/api";
import { ApiUser, NearbyUser } from "../../utils/geo";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAppTheme } from "../../context/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import UserOverflowMenu from "../../components/UserOverflowMenu";
import * as Location from "expo-location";
// Overlay implementation removed in favor of native sprites

const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#111827" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#f1f5f9" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0f172a" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#dbeafe" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#dbeafe" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1f2937" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#a5f3fc" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1f2937" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#283548" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#e2e8f0" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#2d3a4f" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2937" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f8fafc" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#1f2937" }] },
  { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#dbeafe" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#14213d" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#e2e8f0" }] },
  { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#0f172a" }] },
];

const ODU_CENTER = { latitude: 36.885, longitude: -76.305 };
const NEARBY_RADIUS_METERS = 1600; // ~1 mile for demo visibility
const BASE_AVATAR_SIZE = 46;
const BASE_AVATAR_BORDER = 3;
const MAX_ANDROID_MARKER_PX = 100;

type AvatarMetrics = {
  size: number;
  border: number;
  image: number;
  font: number;
};

const normalizeTags = (tags: unknown): string[] =>
  Array.isArray(tags)
    ? tags.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    : [];

const computeAvatarMetrics = (): AvatarMetrics => {
  const imageFrom = (size: number, border: number) => Math.max(size - border * 2, 0);
  if (Platform.OS !== "android") {
    const image = imageFrom(BASE_AVATAR_SIZE, BASE_AVATAR_BORDER);
    return {
      size: BASE_AVATAR_SIZE,
      border: BASE_AVATAR_BORDER,
      image,
      font: Math.round(image * 0.42),
    };
  }

  const density = PixelRatio.get();
  const desiredPx = PixelRatio.getPixelSizeForLayoutSize(BASE_AVATAR_SIZE);
  const safePx = Math.min(desiredPx, MAX_ANDROID_MARKER_PX);
  const adjustedSize = PixelRatio.roundToNearestPixel(safePx / density);
  const proportionalBorder = (BASE_AVATAR_BORDER / BASE_AVATAR_SIZE) * adjustedSize;
  const adjustedBorder = Math.max(2, PixelRatio.roundToNearestPixel(proportionalBorder));
  const adjustedImage = imageFrom(adjustedSize, adjustedBorder);

  return {
    size: adjustedSize,
    border: adjustedBorder,
    image: adjustedImage,
    font: Math.max(14, Math.round(adjustedImage * 0.42)),
  };
};

const {
  size: AVATAR_SIZE,
  border: AVATAR_BORDER,
  image: AVATAR_IMAGE_SIZE,
  font: AVATAR_INITIAL_FONT,
} = computeAvatarMetrics();

type Coords = { latitude: number; longitude: number };
type SelectedUser = NearbyUser & { isCurrentUser?: boolean };

const areNearbyListsEqual = (prev: NearbyUser[], next: NearbyUser[]): boolean => {
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    const a = prev[i];
    const b = next[i];
    if (a.id !== b.id) return false;
    if (a.profilePicture !== b.profilePicture) return false;
    if (Math.abs(a.coords.latitude - b.coords.latitude) > 1e-6) return false;
    if (Math.abs(a.coords.longitude - b.coords.longitude) > 1e-6) return false;
    if ((a.trustScore ?? 0) !== (b.trustScore ?? 0)) return false;
  }
  return true;
};

export default function MapScreen() {
  const [center, setCenter] = useState<Coords>(ODU_CENTER);
  const [myCoords, setMyCoords] = useState<Coords>(ODU_CENTER);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<SelectedUser | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const isMountedRef = useRef(true);
  const userFetchAbortRef = useRef<AbortController | null>(null);
  const hasAnimatedRegion = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [menuTarget, setMenuTarget] = useState<SelectedUser | null>(null);
  const [freezeMarkers, setFreezeMarkers] = useState(false);
  const [, setIsRefreshingUsers] = useState(false);
  const { colors, isDark } = useAppTheme();
  const {
    status,
    setStatus,
    accessToken,
    currentUser,
    isStatusUpdating,
    fetchWithAuth,
  } = useUser();
  const currentUserId = currentUser?.id;
  const deviceLocationAttemptedRef = useRef(false);

  const stopUserPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      userFetchAbortRef.current?.abort();
      stopUserPolling();
    };
  }, [stopUserPolling]);

  const selfUser: SelectedUser | null = currentUser
    ? {
        id: currentUser.id,
        name: currentUser.name?.trim() || currentUser.email,
        email: currentUser.email,
        interestTags: Array.isArray(currentUser.interestTags) ? currentUser.interestTags : [],
        profilePicture: currentUser.profilePicture ?? null,
        coords: { latitude: myCoords.latitude, longitude: myCoords.longitude },
        trustScore: currentUser.trustScore ?? 99,
        isCurrentUser: true,
      }
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
    } catch {
      return null;
    }
  }, [accessToken, fetchWithAuth]);

  const persistLocationToBackend = useCallback(
    async (coords: Coords) => {
      if (!accessToken) return;
      try {
        await fetch(`${API_BASE_URL}/users/me/location`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(coords),
        });
      } catch (err) {
        console.warn("Failed to send location to backend:", err);
      }
    },
    [accessToken]
  );

  const requestDeviceLocation = useCallback(async (): Promise<Coords | null> => {
    try {
      const { status: permissionStatus } = await Location.requestForegroundPermissionsAsync();
      if (permissionStatus !== "granted") {
        return null;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
    } catch (err) {
      console.warn("Unable to fetch device location, falling back to ODU coords:", err);
      return null;
    }
  }, []);

  const ensureLocation = useCallback(async (): Promise<Coords> => {
    const saved = await fetchSavedLocation();

    let nextCoords: Coords | null = saved ?? null;
    if (!deviceLocationAttemptedRef.current) {
      deviceLocationAttemptedRef.current = true;
      const deviceCoords = await requestDeviceLocation();
      if (deviceCoords) {
        nextCoords = deviceCoords;
        if (accessToken) {
          await persistLocationToBackend(deviceCoords);
        }
      }
    }

    if (nextCoords) {
      setCenter(nextCoords);
      setMyCoords(nextCoords);
      return nextCoords;
    }

    // If we failed to get device location, fall back to ODU without re-prompting.
    const fallback = ODU_CENTER;
    if (accessToken) {
      await persistLocationToBackend(fallback);
    }
    setCenter(fallback);
    setMyCoords(fallback);
    return fallback;
  }, [accessToken, fetchSavedLocation, persistLocationToBackend, requestDeviceLocation]);

  const normalizeNearby = useCallback(
    (payload: unknown): NearbyUser[] => {
      const list = Array.isArray((payload as any)?.users) ? (payload as any).users : [];
      return list
        .map((item: any): NearbyUser | null => {
          const id = Number(item?.id);
          const latitude = Number(item?.latitude);
          const longitude = Number(item?.longitude);
          if (!Number.isFinite(id) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return null;
          }
          const email = typeof item?.email === "string" ? item.email : "";
          const name = typeof item?.name === "string" ? item.name : email;
          return {
            id,
            email,
            name,
            interestTags: normalizeTags(item?.interestTags),
            profilePicture: typeof item?.profilePicture === "string" ? item.profilePicture : null,
            coords: { latitude, longitude },
            trustScore: Number.isFinite(Number(item?.trustScore)) ? Number(item?.trustScore) : 0,
          };
        })
        .filter((u: NearbyUser | null): u is NearbyUser => Boolean(u));
    },
    []
  );

  const loadNearbyUsers = useCallback(
    async (coords: Coords) => {
      userFetchAbortRef.current?.abort();
      const controller = new AbortController();
      userFetchAbortRef.current = controller;
      setIsRefreshingUsers(true);
      try {
        if (!accessToken) {
          setErrorMsg("Please log in to view the map.");
          setNearbyUsers([]);
          return;
        }

        const params = new URLSearchParams({
          radius: String(NEARBY_RADIUS_METERS),
          sort: "distance",
        });
        const response = await fetchWithAuth(`${API_BASE_URL}/users/nearby?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Failed to load nearby users (${response.status})`);
        const payload = await response.json();
        const users = normalizeNearby(payload).filter((u: NearbyUser) => {
          if (!currentUserId) return true;
          return u.id !== currentUserId;
        });
        if (!isMountedRef.current || controller.signal.aborted) return;
        setNearbyUsers((prev) => (areNearbyListsEqual(prev, users) ? prev : users));
        setErrorMsg(null);

        if (!hasAnimatedRegion.current && mapRef.current && users.length > 0) {
          const first = users[0].coords;
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
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        console.error("Unable to load nearby users:", err);
        if (!isMountedRef.current) return;
        setErrorMsg("Unable to load nearby users");
      } finally {
        if (userFetchAbortRef.current?.signal === controller.signal) {
          userFetchAbortRef.current = null;
        }
        if (isMountedRef.current) {
          setIsRefreshingUsers(false);
        }
      }
    },
    [accessToken, currentUserId, fetchWithAuth, normalizeNearby]
  );

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

  // Start a chat with selected user
  const startChat = useCallback(
    async (receiverId: number, receiverName: string) => {
      if (!currentUser) return;
      try {
        // Fetch latest receiver for display info
      const userResponse = await fetchWithAuth(`${API_BASE_URL}/users/${receiverId}`, {
        skipAuth: !accessToken,
      });
        let latestUser: ApiUser | null = null;
        if (userResponse.ok) latestUser = (await userResponse.json()) as ApiUser;

        // Create or get chat session
        const resp = await fetchWithAuth(`${API_BASE_URL}/api/messages/session`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
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
            returnToMessages: "1",
          },
        });
      } catch (e) {
        console.error(e);
      }
    },
    [accessToken, currentUser, fetchWithAuth]
  );

  // Actions handled by shared UserOverflowMenu

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        const coords = await ensureLocation();
        if (!active) return;
        await loadNearbyUsers(coords);
      })();

      return () => {
        active = false;
        userFetchAbortRef.current?.abort();
      };
    }, [ensureLocation, loadNearbyUsers])
  );

  // Removed markerTracks effect

  // Helpers for UI coloring
  const trustColor = (score?: number) => {
    const s = score ?? 0;
    if (s >= 90) return "#28a745";
    if (s >= 70) return "#7ED957";
    if (s >= 51) return "#FFC107";
    return "#DC3545";
  };

  const avatarUri = useCallback((profilePicture?: string | null): string | null => {
    if (!profilePicture) return null;
    return profilePicture.startsWith("http") ? profilePicture : `${API_BASE_URL}${profilePicture}`;
  }, []);

  const userInitial = useCallback((user: { name?: string | null; email?: string | null }) => {
    const letter = user.name?.trim()?.[0] || user.email?.trim()?.[0];
    return (letter || "?").toUpperCase();
  }, []);

  // Use a View-based marker (instead of marker image assets) to avoid Android DPI clipping
  const renderAvatarMarker = useCallback(
    (user: NearbyUser | SelectedUser, isSelf = false, options?: { dimmed?: boolean }) => {
      const uri = avatarUri(user.profilePicture as string | null);
      const ringColor = isSelf ? colors.accent : "#e63946";
      const fallbackBg = isDark ? colors.card : "#f0f0f0";
      const initials = userInitial(user);
      const dimmed = options?.dimmed;

      return (
        <View
          style={[
            styles.avatarMarker,
            { borderColor: ringColor, shadowColor: ringColor },
            dimmed && { opacity: 0.35 },
          ]}
        >
          {uri ? (
            <ExpoImage
              source={{ uri }}
              style={styles.avatarImage}
              contentFit="cover"
              transition={0}
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: fallbackBg }]}>
              <Text style={[styles.avatarInitial, { color: isDark ? colors.text : "#4a4a4a" }]}>{initials}</Text>
            </View>
          )}
        </View>
      );
    },
    [avatarUri, userInitial, colors.accent, colors.card, colors.text, isDark]
  );

  const selectedUserAvatarUri = selectedUser
    ? avatarUri(selectedUser.profilePicture as string | null)
    : null;
  const previousStatusRef = useRef(status);

  // On Android custom view markers sometimes don't appear when tracksViewChanges is false immediately.
  // Keep tracksViewChanges=true briefly, then freeze to avoid flicker.
  useEffect(() => {
    setFreezeMarkers(false);
    const timer = setTimeout(() => setFreezeMarkers(true), 750);
    return () => clearTimeout(timer);
  }, [nearbyUsers, status]);

  useEffect(() => {
    if (previousStatusRef.current === status) return;
    previousStatusRef.current = status;

    setSelectedUser(null);
    setMenuTarget(null);

    void (async () => {
      const coords = await ensureLocation();
      await loadNearbyUsers(coords);
    })();
  }, [status, ensureLocation, loadNearbyUsers]);

  // Always refresh user list when the map tab gains focus (covers block/unblock changes)
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const tick = () => {
        if (cancelled) return;
        void (async () => {
          const coords = await ensureLocation();
          await loadNearbyUsers(coords);
        })();
      };

      stopUserPolling();
      tick();
      pollTimerRef.current = setInterval(tick, 3000);

      return () => {
        cancelled = true;
        stopUserPolling();
      };
    }, [ensureLocation, loadNearbyUsers, stopUserPolling])
  );

  const textColor = { color: colors.text };
  const mutedText = { color: colors.muted };
  const selectedMatchPercent = selectedUser ? matchPercent(selectedUser) : null;

  return (
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
        userInterfaceStyle={isDark ? "dark" : "light"}
        customMapStyle={isDark ? DARK_MAP_STYLE : []}
        showsPointsOfInterest
        showsBuildings
      >
        {/* Current user */}
        {selfUser && (
          <Marker
            key={`self-${selfUser.id}-${selfUser.profilePicture ?? "nop"}`}
            coordinate={myCoords}
            onPress={() => setSelectedUser(selfUser)}
            anchor={{ x: 0.5, y: 0.5 }}
            centerOffset={{ x: 0, y: 0 }}
            tracksViewChanges={!freezeMarkers}
          >
            {renderAvatarMarker(selfUser, true, { dimmed: status !== "Visible" })}
          </Marker>
        )}

        {/* Other users */}
        {nearbyUsers.map((user) => {
          return (
            <Marker
              key={`${user.id}-${user.profilePicture ?? 'nop'}`}
              coordinate={user.coords}
              onPress={() => setSelectedUser(user)}
              anchor={{ x: 0.5, y: 0.5 }}
              centerOffset={{ x: 0, y: 0 }}
              tracksViewChanges={!freezeMarkers}
            >
              {renderAvatarMarker(user)}
            </Marker>
          );
        })}
      </MapView>

      <UserOverflowMenu
        visible={!!menuTarget}
        onClose={() => setMenuTarget(null)}
        targetUser={menuTarget}
        onBlocked={(uid) => {
          setNearbyUsers((prevUsers: NearbyUser[]) => prevUsers.filter((user) => user.id !== uid));
          void loadNearbyUsers(center);
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
          {selectedUserAvatarUri ? (
            <ExpoImage
              source={{ uri: selectedUserAvatarUri }}
              style={[
                styles.floatingImage,
                { borderColor: selectedUser.isCurrentUser ? colors.accent : "#e63946", backgroundColor: colors.card },
              ]}
              cachePolicy="memory-disk"
              transition={0}
              contentFit="cover"
            />
          ) : (
            <View
              style={[
                styles.floatingPlaceholder,
                { borderColor: selectedUser.isCurrentUser ? colors.accent : "#e63946", backgroundColor: colors.card },
              ]}
            >
              <Text style={[styles.floatingInitials, { color: isDark ? colors.text : "#555" }]}>{userInitial(selectedUser)}</Text>
            </View>
          )}
        </View>
      )}

      {/* Bottom sheet */}
      {selectedUser && (
        <>
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => setSelectedUser(null)}
          />
          <View
            style={[
              styles.sheet,
              { backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, shadowColor: isDark ? "#000" : "#000" },
            ]}
          >
            <View style={styles.sheetHeader}>
              <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
              <TouchableOpacity onPress={() => setSelectedUser(null)}>
                <Text style={[styles.sheetClose, { color: colors.accent }]}>Close</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.calloutHeaderRow}>
              <View style={styles.calloutTextBlock}>
                <View style={styles.calloutTitleRow}>
                  <Text style={[styles.calloutTitle, textColor]} numberOfLines={1}>
                    {selectedUser.name || selectedUser.email}
                  </Text>
                  {selectedUser.isCurrentUser && (
                    <Text style={[styles.calloutBadge, { backgroundColor: colors.accent }]}>
                      You
                    </Text>
                  )}
                </View>
                <Text style={[styles.calloutSubtitle, mutedText]} numberOfLines={1}>
                  {selectedUser.email}
                </Text>
                {!selectedUser.isCurrentUser && selectedMatchPercent !== null && (
                  <View
                    style={[
                      styles.metaPill,
                      styles.metaPillUnderText,
                      {
                        borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
                        backgroundColor: isDark ? "rgba(0,123,255,0.2)" : "rgba(0,123,255,0.08)",
                      },
                    ]}
                  >
                    <Text style={[styles.metaText, { color: colors.accent }]}>
                      {selectedMatchPercent}% match
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.calloutMetrics}>
                <Text
                  style={[
                    styles.metricValueSmall,
                    { color: trustColor(selectedUser.trustScore) },
                  ]}
                >
                  Trust Score:{" "}
                  <Text style={styles.trustScoreNumber}>{selectedUser.trustScore ?? "-"}</Text>
                </Text>
              </View>
            </View>

            {selectedUser.interestTags.length > 0 ? (
              <View style={[styles.calloutTagsWrapper, { marginTop: 12 }]}>
                {selectedUser.interestTags.map((tag) => (
                  <View key={tag} style={[styles.calloutTagChip, { backgroundColor: isDark ? colors.background : "#e6f0ff" }]}>
                    <Text style={[styles.calloutTagText, { color: colors.accent }]}>{tag}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.calloutEmptyTags, mutedText]}>
                {selectedUser.isCurrentUser
                  ? "You haven't added any interest tags yet."
                  : "No tags selected"}
              </Text>
            )}

            {/* Action bar: message + more menu (report/block) */}
            {!selectedUser.isCurrentUser && (
              <>
              <View style={styles.calloutActionsRow}>
                <TouchableOpacity
                  onPress={() => startChat(selectedUser.id, selectedUser.name || selectedUser.email)}
                  style={[styles.calloutActionButton, { backgroundColor: colors.accent }]}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Message user"
                >
                  <Ionicons name="chatbubble" size={18} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setMenuTarget(selectedUser)}
                  hitSlop={{ left: 8, right: 8, top: 6, bottom: 6 }}
                  style={styles.calloutActionMenu}
                  activeOpacity={0.7}
                >
                  <Ionicons name="ellipsis-vertical" size={20} color={colors.icon} />
                </TouchableOpacity>
              </View>
              </>
            )}
          </View>

          {/* Popover moved to screen root for proper z-ordering */}
        </>
      )}

      {/* Inline actions are rendered inside the sheet above */}

      {/*  Controls (lift when sheet is open) */}
      <View
        style={[
          styles.controls,
          { backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, shadowColor: isDark ? "#000" : "#000" },
          selectedUser ? { display: 'none' } : null,
        ]}
      >
        <Text style={[styles.statusText, textColor]}>Visibility: {status}</Text>
        <TouchableOpacity
          style={[
            styles.visibilityToggle,
            { backgroundColor: colors.accent },
            isStatusUpdating && styles.visibilityToggleDisabled,
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
        {!!errorMsg && <Text style={[styles.errorText, { color: "#c00" }]}>{errorMsg}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  avatarMarker: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: AVATAR_BORDER,
    backgroundColor: "#fff",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3.5,
    elevation: 6,
  },
  avatarImage: {
    width: AVATAR_IMAGE_SIZE,
    height: AVATAR_IMAGE_SIZE,
    borderRadius: AVATAR_IMAGE_SIZE / 2,
  },
  avatarFallback: {
    width: AVATAR_IMAGE_SIZE,
    height: AVATAR_IMAGE_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontSize: AVATAR_INITIAL_FONT, fontWeight: "700" },

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
  sheetClose: { color: "#66a8ff", fontWeight: "600" },

  calloutHeaderRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  calloutTextBlock: { flex: 1, minWidth: 0 },
  calloutTitleRow: { flexDirection: "row", alignItems: "center" },
  calloutTitle: { fontSize: 16, fontWeight: "600", flexShrink: 1 },
  calloutSubtitle: { fontSize: 13, color: "#666", marginTop: 2 },
  calloutBadge: {
    backgroundColor: "#66a8ff",
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
    backgroundColor: "#e6f0ff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    marginRight: 6,
    marginBottom: 6,
  },
  calloutTagText: { fontSize: 12, color: "#66a8ff", fontWeight: "500" },
  calloutEmptyTags: { marginTop: 8, fontSize: 12, color: "#999" },
  calloutActionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
  },
  calloutActionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  calloutActionMenu: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },

  calloutMetrics: { alignItems: "flex-end", minWidth: 120, marginLeft: 12, gap: 6 },
  metricValueSmall: { fontSize: 14, fontWeight: "700", textAlign: "right" },
  trustScoreNumber: { fontSize: 15, fontWeight: "700" },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  metaPillUnderText: { marginTop: 6 },
  metaText: { fontSize: 12, fontWeight: "600" },
  
  inlineActionsWrap: { overflow: 'hidden', flexDirection: 'row', alignItems: 'center', marginRight: 6 },
  inlineActionsWrapClosed: { width: 0, opacity: 0 },
  inlineActionsWrapOpen: { width: 'auto', opacity: 1 },
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
  
});



