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
import MapView, { Marker } from "react-native-maps";
import { Image as ExpoImage } from "expo-image";
import { useUser } from "../../context/UserContext";
import { API_BASE_URL } from "@/utils/api";
import { ApiUser, NearbyUser, scatterUsersAround } from "../../utils/geo";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import UserOverflowMenu from "../../components/UserOverflowMenu";
import { AppScreen } from "@/components/layout/AppScreen";
// Overlay implementation removed in favor of native sprites

const ODU_CENTER = { latitude: 36.885, longitude: -76.305 };
const IS_ANDROID = Platform.OS === "android";
// Marker sizing tuned for Android to avoid clipping
const MARKER_DIAMETER = IS_ANDROID ? 36 : 44;
const MARKER_BORDER_WIDTH = IS_ANDROID ? 2 : 3;
const MARKER_IMAGE_SIZE = MARKER_DIAMETER - MARKER_BORDER_WIDTH * 2;
// Density-aware sizing (used by overlay avatars)

type Coords = { latitude: number; longitude: number };
type SelectedUser = NearbyUser & { isCurrentUser?: boolean };

export default function MapScreen() {
  const [center] = useState<Coords>(ODU_CENTER);
  const [myCoords] = useState<Coords>(ODU_CENTER);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<SelectedUser | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const [menuTarget, setMenuTarget] = useState<SelectedUser | null>(null);
  const [readyMarkers, setReadyMarkers] = useState<Record<string, boolean>>({});
  // Keep stable map positions across refreshes to avoid jitter
  const positionsRef = useRef<Map<number, Coords>>(new Map());
  
  
  // Enable LayoutAnimation on Android
  useEffect(() => {
    // @ts-ignore
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      // @ts-ignore
      UIManager.setLayoutAnimationEnabledExperimental(true);
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
  } = useUser();
  const currentUserId = currentUser?.id;
  const isAdmin = currentUser?.isAdmin;

  const selfUser: SelectedUser | null = useMemo(
    () =>
      currentUser
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
        : null,
    [currentUser, myCoords]
  );
  const selfPictureToken = (selfUser?.profilePicture as string | null) ?? null;
  const selfReadyKey = `self:${selfPictureToken ?? "nop"}`;
  const selfImageUri = selfPictureToken
    ? selfPictureToken.startsWith("http")
      ? selfPictureToken
      : `${API_BASE_URL}${selfPictureToken}`
    : null;

  const markMarkerReady = useCallback((key: string) => {
    setReadyMarkers((prev) => {
      if (prev[key]) return prev;
      return { ...prev, [key]: true };
    });
  }, []);


  const loadUsers = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/users`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });
      if (!response.ok) throw new Error(`Failed to load users (${response.status})`);
      const data = (await response.json()) as ApiUser[];
      const filtered = data.filter(
        (u) => (u.visibility ?? true) && (currentUserId ? u.id !== currentUserId : true)
      );
      setPrefetchedUsers(filtered);
      setErrorMsg(null);
    } catch (err) {
      console.error("❌ Unable to load users:", err);
      setErrorMsg("Unable to load users from the server");
    }
  }, [accessToken, currentUserId, setPrefetchedUsers]);

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
        const userResponse = await fetch(`${API_BASE_URL}/users/${receiverId}`, {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        });
        let latestUser: ApiUser | null = null;
        if (userResponse.ok) latestUser = (await userResponse.json()) as ApiUser;

        // Create or get chat session
        const resp = await fetch(`${API_BASE_URL}/api/messages/session`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
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
          },
        });
      } catch (e) {
        console.error(e);
      }
    },
    [accessToken, currentUser]
  );

  // Actions handled by shared UserOverflowMenu

  // Report flow (inline) similar to ReportButton
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
        (u) => (u.visibility ?? true) && (currentUserId ? u.id !== currentUserId : true)
      );
      // Only scatter for users without a stored position
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
      // Seed readyMarkers for new keys (false = not ready -> track until image loads)
      setReadyMarkers((prev) => {
        const keys = new Set<string>();
        if (selfUser) keys.add(`self:${(selfUser.profilePicture as string | null) ?? "nop"}`);
        for (const u of filtered) keys.add(`${u.id}:${(u.profilePicture as string | null) ?? "nop"}`);
        const nextMap: Record<string, boolean> = {};
        // false => not ready => tracksViewChanges stays true until image loads
        for (const k of keys) nextMap[k] = k in prev ? prev[k] : false;
        return nextMap;
      });

      // Animate to first result only once
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
      (u) => (u.visibility ?? true) && (currentUserId ? u.id !== currentUserId : true)
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

  // Removed markerTracks effect

  const hasAnimatedRegion = useRef(false);

  // Helpers for UI coloring
  const trustColor = (score?: number) => {
    const s = score ?? 0;
    if (s >= 90) return "#28a745";
    if (s >= 70) return "#7ED957";
    if (s >= 51) return "#FFC107";
    return "#DC3545";
  };

  return (
    <AppScreen style={isAdmin ? { backgroundColor: "#0f172a" } : undefined}>
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
      >
        {/* 👤 Current user */}
        {status === "Visible" && selfUser && (
          <Marker
            key={`self:${selfPictureToken ?? "nop"}`}
            coordinate={myCoords}
            onPress={() => setSelectedUser(selfUser)}
            anchor={{ x: 0.5, y: 0.5 }}
            centerOffset={{ x: 0, y: 0 }}
            tracksViewChanges={IS_ANDROID ? !readyMarkers[selfReadyKey] : false}
          >
            <View
              collapsable={false}
              needsOffscreenAlphaCompositing
              renderToHardwareTextureAndroid
              style={[styles.markerWrap, { borderColor: "#1f5fbf" }]}
            >
              {selfImageUri ? (
                <ExpoImage
                  source={{ uri: selfImageUri }}
                  style={styles.markerAvatar}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={0}
                  onLoad={() => markMarkerReady(selfReadyKey)}
                  onError={() => markMarkerReady(selfReadyKey)}
                />
              ) : (
                <Text
                  style={styles.markerInitial}
                  onLayout={() => markMarkerReady(selfReadyKey)}
                >
                  {(selfUser.name || selfUser.email)?.charAt(0)?.toUpperCase() || "?"}
                </Text>
              )}
            </View>
          </Marker>
        )}

        {/* 👥 Other users */}
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
            <Marker
              key={markerKey}
              coordinate={user.coords}
              onPress={() => setSelectedUser(user)}
              anchor={{ x: 0.5, y: 0.5 }}
              centerOffset={{ x: 0, y: 0 }}
              tracksViewChanges={IS_ANDROID ? !readyMarkers[markerKey] : false}
            >
              <View
                collapsable={false}
                needsOffscreenAlphaCompositing
                renderToHardwareTextureAndroid
                style={[styles.markerWrap, { borderColor: "#e63946" }]}
              >
                {uri ? (
                  <ExpoImage
                    source={{ uri }}
                    style={styles.markerAvatar}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={0}
                    onLoad={() => markMarkerReady(markerKey)}
                    onError={() => markMarkerReady(markerKey)}
                  />
                ) : (
                  <Text
                    style={styles.markerInitial}
                    onLayout={() => markMarkerReady(markerKey)}
                  >
                    {(user.name || user.email)?.charAt(0)?.toUpperCase() || "?"}
                  </Text>
                )}
              </View>
            </Marker>
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

      {/* 🔍 Floating enlarged preview */}
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

      {/* 🧾 Bottom sheet */}
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

            {/* Color-coded trust score */}
            <Text style={styles.trustScoreName}>
              Trust Score:{" "}
              <Text
                style={[
                  styles.trustScoreNumber,
                  { color: trustColor(selectedUser.trustScore) },
                ]}
              >
                {selectedUser.trustScore ?? "-"}
              </Text>
            </Text>

            {/* Match percent */}
            {!selectedUser.isCurrentUser && (
              <Text style={[styles.calloutSubtitle, { marginTop: 4 }]}>Match: {matchPercent(selectedUser)}%</Text>
            )}

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

            {/* Action bar: message + more menu (report/block) */}
            {!selectedUser.isCurrentUser && (
              <>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 16, alignItems: "center" }}>
                <TouchableOpacity
                  onPress={() => startChat(selectedUser.id, selectedUser.name || selectedUser.email)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: "#007BFF",
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
                  <Ionicons name="ellipsis-vertical" size={20} color="#333" />
                </TouchableOpacity>
              </View>
              </>
            )}
          </View>

          {/* Popover moved to screen root for proper z-ordering */}
        </>
      )}

      {/* Inline actions are rendered inside the sheet above */}

      {/* 🔘 Controls (lift when sheet is open) */}
      <View style={[styles.controls, selectedUser ? { display: "none" } : null]}>
        <Text style={styles.statusText}>Visibility: {status}</Text>
        <TouchableOpacity
          style={[
            styles.visibilityToggle,
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
        {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
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
    backgroundColor: "#007BFF",
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
  calloutTagsWrapper: { flexDirection: "row", flexWrap: "wrap", marginTop: 12 },
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
  trustScoreNumber: { fontSize: 15, fontWeight: "700" },
  
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
