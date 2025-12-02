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
import { ApiUser, NearbyUser, scatterUsersAround } from "../../utils/geo";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAppTheme } from "../../context/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import UserOverflowMenu from "../../components/UserOverflowMenu";
// Overlay implementation removed in favor of native sprites

const ODU_CENTER = { latitude: 36.885, longitude: -76.305 };
const BASE_AVATAR_SIZE = 46;
const BASE_AVATAR_BORDER = 3;
const MAX_ANDROID_MARKER_PX = 100;

type AvatarMetrics = {
  size: number;
  border: number;
  image: number;
  font: number;
};

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

export default function MapScreen() {
  const [center] = useState<Coords>(ODU_CENTER);
  const [myCoords] = useState<Coords>(ODU_CENTER);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<SelectedUser | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const isMountedRef = useRef(true);
  const userFetchAbortRef = useRef<AbortController | null>(null);
  const hasAnimatedRegion = useRef(false);
  // Removed markerTracks; no longer needed
  const [markersVersion, setMarkersVersion] = useState(0);
  const [menuTarget, setMenuTarget] = useState<SelectedUser | null>(null);
  const [freezeMarkers, setFreezeMarkers] = useState(false);
  const [, setIsRefreshingUsers] = useState(false);
  const { colors, isDark } = useAppTheme();
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

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      userFetchAbortRef.current?.abort();
    };
  }, []);

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

  const loadUsers = useCallback(async () => {
    userFetchAbortRef.current?.abort();
    const controller = new AbortController();
    userFetchAbortRef.current = controller;
    setIsRefreshingUsers(true);
    try {
      const response = await fetchWithAuth(
        `${API_BASE_URL}/users`,
        { signal: controller.signal, skipAuth: !accessToken }
      );
      if (!response.ok) throw new Error(`Failed to load users (${response.status})`);
      const data = (await response.json()) as ApiUser[];
      const filtered = data.filter(
        (u) => (u.visibility ?? true) && (currentUserId ? u.id !== currentUserId : true)
      );
      if (!isMountedRef.current || controller.signal.aborted) return;
      setPrefetchedUsers(filtered);
      setErrorMsg(null);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      console.error("? Unable to load users:", err);
      if (!isMountedRef.current) return;
      setErrorMsg("Unable to load users from the server");
    } finally {
      if (userFetchAbortRef.current?.signal === controller.signal) {
        userFetchAbortRef.current = null;
      }
      if (isMountedRef.current) {
        setIsRefreshingUsers(false);
      }
    }
  }, [accessToken, currentUserId, fetchWithAuth, setPrefetchedUsers]);

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

  useEffect(() => {
    if (prefetchedUsers && prefetchedUsers.length > 0) {
      const filtered = prefetchedUsers.filter(
        (u) => (u.visibility ?? true) && (currentUserId ? u.id !== currentUserId : true)
      );
      const scattered = scatterUsersAround(filtered, center.latitude, center.longitude);
      setNearbyUsers(scattered);

      // ? Only animate/zoom once on initial mount
      if (!hasAnimatedRegion.current && mapRef.current && scattered.length > 0) {
        const first = scattered[0].coords;
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
        setTimeout(() => setMarkersVersion((v) => v + 1), 600);
      }
      return;
    }

    if (!currentUser) return;
    void loadUsers();
  }, [prefetchedUsers, currentUser, currentUserId, center.latitude, center.longitude, loadUsers]);

  // 🧠 Bridge effect for late prefetched users
  useEffect(() => {
    if (!prefetchedUsers?.length || nearbyUsers.length > 0) return;
    const filtered = prefetchedUsers.filter(
      (u) => (u.visibility ?? true) && (currentUserId ? u.id !== currentUserId : true)
    );
    const scattered = scatterUsersAround(filtered, center.latitude, center.longitude);
    setNearbyUsers(scattered);
  }, [prefetchedUsers, nearbyUsers.length, currentUserId, center.latitude, center.longitude]);

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
  }, [markersVersion, nearbyUsers.length]);

  // Ensure marker list updates when visibility status toggles
  useEffect(() => {
    setMarkersVersion((v) => v + 1);
  }, [status]);

  useEffect(() => {
    if (previousStatusRef.current === status) return;
    previousStatusRef.current = status;

    if (status === "Hidden") {
      setSelectedUser(null);
      setMenuTarget(null);
      return;
    }

    void loadUsers();
  }, [status, loadUsers]);

  // Always refresh user list when the map tab gains focus (covers block/unblock changes)
  useFocusEffect(
    useCallback(() => {
      if (!currentUser) return;
      void loadUsers();
    }, [currentUser, loadUsers])
  );

  const textColor = { color: colors.text };
  const mutedText = { color: colors.muted };
  const selectedMatchPercent = selectedUser ? matchPercent(selectedUser) : null;

  // ✅ Safe display name for the selected user (no email shown)
  const selectedDisplayName =
    selectedUser && selectedUser.name && selectedUser.name.trim().length > 0
      ? selectedUser.name.trim()
      : "Anonymous";

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
      >
        {/* 👤 Current user */}
        {selfUser && (
          <Marker
            key={`self-${markersVersion}-${selfUser.profilePicture ?? "nop"}`}
            coordinate={myCoords}
            onPress={() => setSelectedUser(selfUser)}
            anchor={{ x: 0.5, y: 0.5 }}
            centerOffset={{ x: 0, y: 0 }}
            tracksViewChanges={!freezeMarkers}
          >
            {renderAvatarMarker(selfUser, true, { dimmed: status !== "Visible" })}
          </Marker>
        )}

        {/* 👥 Other users */}
        {nearbyUsers.map((user) => {
          return (
            <Marker
              key={`${user.id}-${markersVersion}-${user.profilePicture ?? "nop"}`}
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
          setPrefetchedUsers((prevUsers) =>
            prevUsers ? prevUsers.filter((user) => user.id !== uid) : prevUsers
          );
          setMarkersVersion((v) => v + 1);
          void loadUsers();
          setSelectedUser(null);
        }}
        onReported={() => {
          // optional extra behavior after report; leave empty or add toast if desired
        }}
        onViewProfile={(uid) => {
          // Only ever called for non-self users (UserOverflowMenu already guards this)
          setMenuTarget(null);
          setSelectedUser(null);
          router.push(`/user/${uid}`);
        }}
      />

      {/* 🔍 Floating enlarged preview */}
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
                {
                  borderColor: selectedUser.isCurrentUser ? colors.accent : "#e63946",
                  backgroundColor: colors.card,
                },
              ]}
              cachePolicy="memory-disk"
              transition={0}
              contentFit="cover"
            />
          ) : (
            <View
              style={[
                styles.floatingPlaceholder,
                {
                  borderColor: selectedUser.isCurrentUser ? colors.accent : "#e63946",
                  backgroundColor: colors.card,
                },
              ]}
            >
              <Text style={[styles.floatingInitials, { color: isDark ? colors.text : "#555" }]}>
                {userInitial(selectedUser)}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* 🧾 Bottom sheet */}
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
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderWidth: StyleSheet.hairlineWidth,
                shadowColor: isDark ? "#000" : "#000",
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
              <View style={styles.calloutTextBlock}>
                <View style={styles.calloutTitleRow}>
                  <Text style={[styles.calloutTitle, textColor]} numberOfLines={1}>
                    {selectedDisplayName}
                  </Text>
                  {selectedUser.isCurrentUser && (
                    <Text style={[styles.calloutBadge, { backgroundColor: colors.accent }]}>
                      You
                    </Text>
                  )}
                </View>
                {/* Email removed from map tab for all users */}
                {!selectedUser.isCurrentUser && selectedMatchPercent !== null && (
                  <View
                    style={[
                      styles.metaPill,
                      styles.metaPillUnderText,
                      {
                        borderColor: isDark
                          ? "rgba(255,255,255,0.08)"
                          : "rgba(0,0,0,0.05)",
                        backgroundColor: isDark
                          ? "rgba(0,123,255,0.2)"
                          : "rgba(0,123,255,0.08)",
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
                  <Text style={styles.trustScoreNumber}>
                    {selectedUser.trustScore ?? "-"}
                  </Text>
                </Text>
              </View>
            </View>

            {selectedUser.interestTags.length > 0 ? (
              <View style={[styles.calloutTagsWrapper, { marginTop: 12 }]}>
                {selectedUser.interestTags.map((tag) => (
                  <View
                    key={tag}
                    style={[
                      styles.calloutTagChip,
                      { backgroundColor: isDark ? colors.background : "#e6f0ff" },
                    ]}
                  >
                    <Text
                      style={[styles.calloutTagText, { color: colors.accent }]}
                    >
                      {tag}
                    </Text>
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

            {/* Action bar: message + more menu (view profile / report / block) */}
            {!selectedUser.isCurrentUser && (
              <View style={styles.calloutActionsRow}>
                <TouchableOpacity
                  onPress={() =>
                    startChat(
                      selectedUser.id,
                      selectedDisplayName
                    )
                  }
                  style={[
                    styles.calloutActionButton,
                    { backgroundColor: colors.accent },
                  ]}
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
                  <Ionicons
                    name="ellipsis-vertical"
                    size={20}
                    color={colors.icon}
                  />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </>
      )}

      {/* 🔘 Controls (lift when sheet is open) */}
      <View
        style={[
          styles.controls,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderWidth: StyleSheet.hairlineWidth,
            shadowColor: isDark ? "#000" : "#000",
          },
          selectedUser ? { display: "none" } : null,
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
        {!!errorMsg && (
          <Text style={[styles.errorText, { color: "#c00" }]}>{errorMsg}</Text>
        )}
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
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#ddd" },
  sheetClose: { color: "#66a8ff", fontWeight: "600" },

  calloutHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
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
  calloutTagsWrapper: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
  },
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

  inlineActionsWrap: {
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    marginRight: 6,
  },
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
});
