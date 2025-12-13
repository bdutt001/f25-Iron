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
import MapLibreGL from "@maplibre/maplibre-react-native";
import { Image as ExpoImage } from "expo-image";
import { useUser } from "../../context/UserContext";
import { API_BASE_URL } from "@/utils/api";
import { ApiUser, NearbyUser, scatterUsersAround } from "../../utils/geo";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import UserOverflowMenu from "../../components/UserOverflowMenu";
import { AppScreen } from "@/components/layout/AppScreen";
import { useAppTheme } from "../../context/ThemeContext";
import { type Feature, type FeatureCollection, type LineString, type Point, type Polygon } from "geojson";
import {
  type Expression,
  type MapViewRef,
  type CameraRef,
  type ShapeSourceRef,
} from "@maplibre/maplibre-react-native";

const ODU_CENTER = { latitude: 36.885, longitude: -76.305 };
const DEFAULT_ZOOM = 14.2;
const RECENTER_ZOOM = 15.6;
const CENTER_EPSILON = 0.0008;

// Allow swapping to a stub map in Expo Go without the native module.
const DISABLE_NATIVE_MAP = process.env.EXPO_PUBLIC_NO_NATIVE_MAP === "1";
const MAP_STYLE_LIGHT =
  process.env.EXPO_PUBLIC_MAP_STYLE_LIGHT_URL || "https://demotiles.maplibre.org/style.json";
const MAP_STYLE_DARK = process.env.EXPO_PUBLIC_MAP_STYLE_DARK_URL || MAP_STYLE_LIGHT;

const CLUSTER_TEXT_STEPS: Expression = ["step", ["get", "point_count"], "1", 10, "10+", 25, "25+", 50, "50+", 100, "100+"];

const HEATMAP_WEIGHT: Expression = [
  "interpolate",
  ["linear"],
  ["coalesce", ["get", "weight"], 0.4],
  0,
  0.2,
  1,
  1,
];

const HEATMAP_COLOR: Expression = [
  "interpolate",
  ["linear"],
  ["heatmap-density"],
  0,
  "rgba(56,189,248,0)",
  0.2,
  "rgba(56,189,248,0.55)",
  0.4,
  "rgba(59,130,246,0.7)",
  0.6,
  "rgba(249,115,22,0.78)",
  0.8,
  "rgba(239,68,68,0.85)",
  1,
  "rgba(220,38,38,0.9)",
];

const CAMPUS_ZONES: FeatureCollection<Polygon> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        id: "odu-core",
        name: "ODU Core",
        fill: "rgba(14,165,233,0.18)",
        stroke: "#0ea5e9",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-76.3112, 36.8885],
            [-76.3112, 36.8825],
            [-76.2998, 36.8825],
            [-76.2998, 36.8885],
            [-76.3112, 36.8885],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        id: "student-core",
        name: "Student Hub",
        fill: "rgba(34,197,94,0.16)",
        stroke: "#22c55e",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-76.3056, 36.8866],
            [-76.3056, 36.8842],
            [-76.3022, 36.8842],
            [-76.3022, 36.8866],
            [-76.3056, 36.8866],
          ],
        ],
      },
    },
  ],
};

const CAMPUS_ROUTES: FeatureCollection<LineString> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { id: "monarch-walk", name: "Monarch Walk", color: "#22d3ee" },
      geometry: {
        type: "LineString",
        coordinates: [
          [-76.3098, 36.8872],
          [-76.3065, 36.8859],
          [-76.3041, 36.8852],
          [-76.3019, 36.8834],
        ],
      },
    },
    {
      type: "Feature",
      properties: { id: "kaufman-loop", name: "Kaufman Loop", color: "#a855f7" },
      geometry: {
        type: "LineString",
        coordinates: [
          [-76.3074, 36.8832],
          [-76.3058, 36.8846],
          [-76.3037, 36.8841],
          [-76.3026, 36.883],
        ],
      },
    },
  ],
};

MapLibreGL.setAccessToken("");

type Coords = { latitude: number; longitude: number };
type SelectedUser = NearbyUser & { isCurrentUser?: boolean };

export default function MapScreen() {
  const { colors, isDark } = useAppTheme();
  const [center, setCenter] = useState<Coords>(ODU_CENTER);
  const [myCoords, setMyCoords] = useState<Coords | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<SelectedUser | null>(null);
  const mapRef = useRef<MapViewRef | null>(null);
  const cameraRef = useRef<CameraRef | null>(null);
  const userSourceRef = useRef<ShapeSourceRef | null>(null);
  const [menuTarget, setMenuTarget] = useState<SelectedUser | null>(null);
  const positionsRef = useRef<Map<number, Coords>>(new Map());
  const hasAnimatedToUser = useRef(false);
  const [isCenteredOnUser, setIsCenteredOnUser] = useState(true);
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM);

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
    if (!myCoords || !cameraRef.current || hasAnimatedToUser.current) return;
    cameraRef.current.setCamera({
      centerCoordinate: [myCoords.longitude, myCoords.latitude],
      zoomLevel: RECENTER_ZOOM,
      animationDuration: 350,
    });
    hasAnimatedToUser.current = true;
  }, [myCoords]);

  const recenterOnUser = useCallback(() => {
    const target = myCoords ?? center;
    if (!target || !cameraRef.current) return;
    setIsCenteredOnUser(true);
    cameraRef.current.setCamera({
      centerCoordinate: [target.longitude, target.latitude],
      zoomLevel: RECENTER_ZOOM,
      animationDuration: 300,
    });
  }, [center, myCoords]);

  const handleRegionDidChange = useCallback(
    (payload: any) => {
      const coords = (payload?.geometry?.coordinates ?? []) as number[];
      const zoomLevel = payload?.properties?.zoomLevel;
      if (typeof zoomLevel === "number") setCurrentZoom(zoomLevel);

      if (coords.length >= 2) {
        const target = myCoords ?? center;
        const latDiff = Math.abs(coords[1] - target.latitude);
        const lngDiff = Math.abs(coords[0] - target.longitude);
        const centered = latDiff < CENTER_EPSILON && lngDiff < CENTER_EPSILON;
        setIsCenteredOnUser(centered);
      }
    },
    [center, myCoords]
  );

  const mapStyleUrl = isDark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT;

  const userLookup = useMemo(() => {
    const map = new Map<number, SelectedUser>();
    if (selfUser) map.set(selfUser.id, selfUser);
    for (const u of nearbyUsers) map.set(u.id, u);
    return map;
  }, [nearbyUsers, selfUser]);

  const userFeatures = useMemo<Feature<Point>[]>(() => {
    const features: Feature<Point>[] = [];

    if (selfUser) {
      features.push({
        type: "Feature",
        id: `self-${selfUser.id}`,
        properties: {
          userId: selfUser.id,
          name: selfUser.name,
          email: selfUser.email,
          isSelf: true,
          trustScore: selfUser.trustScore ?? 0,
          initial: (selfUser.name || selfUser.email)?.charAt(0)?.toUpperCase() || "?",
          weight: status === "Hidden" ? 0.25 : 1,
        },
        geometry: {
          type: "Point",
          coordinates: [selfUser.coords.longitude, selfUser.coords.latitude],
        },
      });
    }

    for (const user of nearbyUsers) {
      features.push({
        type: "Feature",
        id: `user-${user.id}`,
        properties: {
          userId: user.id,
          name: user.name,
          email: user.email,
          isSelf: false,
          trustScore: user.trustScore ?? 0,
          initial: (user.name || user.email)?.charAt(0)?.toUpperCase() || "?",
          weight: 0.9,
        },
        geometry: {
          type: "Point",
          coordinates: [user.coords.longitude, user.coords.latitude],
        },
      });
    }

    return features;
  }, [nearbyUsers, selfUser, status]);

  const userCollection = useMemo<FeatureCollection<Point>>(
    () => ({
      type: "FeatureCollection",
      features: userFeatures,
    }),
    [userFeatures]
  );

  const heatmapVisible = currentZoom < 15.5;

  const onUserSourcePress = useCallback(
    async (event: any) => {
      const feature = event?.features?.[0];
      if (!feature) return;
      const props = feature.properties as any;
      const coords = (feature.geometry?.coordinates ?? []) as number[];

      if (props?.cluster) {
        try {
          const zoom = await userSourceRef.current?.getClusterExpansionZoom(props.cluster_id);
          if (typeof zoom === "number") {
            cameraRef.current?.setCamera({
              centerCoordinate: coords,
              zoomLevel: zoom + 0.5,
              animationDuration: 400,
            });
          }
        } catch (err) {
          console.warn("Failed to expand cluster", err);
        }
        return;
      }

      const userId = Number(props?.userId ?? props?.id);
      const user = userLookup.get(userId);
      if (user) setSelectedUser(user);
    },
    [userLookup]
  );

  const handleMapPress = useCallback(() => {
    setSelectedUser(null);
  }, []);

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
          {DISABLE_NATIVE_MAP ? (
            <View
              style={[
                styles.map,
                styles.mapStub,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.stubTitle, textPrimary]}>MapLibre disabled</Text>
              <Text style={[styles.stubBody, textMuted]}>
                Run a dev build with MapLibre enabled to preview clusters, heatmaps, and zones.
              </Text>
            </View>
          ) : (
            <MapLibreGL.MapView
              ref={mapRef}
              style={styles.map}
              mapStyle={mapStyleUrl}
              attributionEnabled={false}
              logoEnabled={false}
              compassEnabled={false}
              onRegionDidChange={handleRegionDidChange}
              onPress={handleMapPress}
            >
              <MapLibreGL.Camera
                ref={cameraRef}
                defaultSettings={{
                  centerCoordinate: [center.longitude, center.latitude],
                  zoomLevel: DEFAULT_ZOOM,
                }}
              />

              <MapLibreGL.ShapeSource
                id="users"
                ref={userSourceRef}
                shape={userCollection}
                cluster
                clusterRadius={56}
                clusterMaxZoomLevel={18}
                onPress={onUserSourcePress}
              >
                {heatmapVisible && (
                  <MapLibreGL.HeatmapLayer
                    id="users-heat"
                    maxZoomLevel={17}
                    minZoomLevel={9}
                    style={{
                      heatmapOpacity: 0.55,
                      heatmapRadius: ["interpolate", ["linear"], ["zoom"], 10, 18, 16, 32] as Expression,
                      heatmapWeight: HEATMAP_WEIGHT,
                      heatmapColor: HEATMAP_COLOR,
                    }}
                  />
                )}

                <MapLibreGL.CircleLayer
                  id="user-clusters"
                  filter={["has", "point_count"]}
                  style={{
                    circleColor: [
                      "step",
                      ["get", "point_count"],
                      "#2563eb",
                      10,
                      "#0ea5e9",
                      25,
                      "#22c55e",
                      50,
                      "#f59e0b",
                      100,
                      "#ef4444",
                    ],
                    circleRadius: [
                      "step",
                      ["get", "point_count"],
                      18,
                      10,
                      22,
                      25,
                      28,
                      50,
                      34,
                      100,
                      38,
                    ],
                    circleOpacity: 0.86,
                    circleStrokeColor: isDark ? "#0f172a" : "#fff",
                    circleStrokeWidth: 2,
                  }}
                />
                <MapLibreGL.SymbolLayer
                  id="user-cluster-count"
                  filter={["has", "point_count"]}
                  style={{
                    textField: CLUSTER_TEXT_STEPS,
                    textColor: "#fff",
                    textSize: 13,
                    textIgnorePlacement: true,
                    textAllowOverlap: true,
                  }}
                />
                <MapLibreGL.CircleLayer
                  id="user-points"
                  filter={["!", ["has", "point_count"]]}
                  style={{
                    circleRadius: ["interpolate", ["linear"], ["zoom"], 12, 6, 16, 10, 18, 12],
                    circleColor: [
                      "case",
                      ["==", ["get", "isSelf"], true],
                      status === "Hidden" ? "rgba(148,163,184,0.6)" : "#1f5fbf",
                      "#e63946",
                    ],
                    circleOpacity: [
                      "case",
                      ["==", ["get", "isSelf"], true],
                      status === "Hidden" ? 0.45 : 1,
                      0.92,
                    ],
                    circleStrokeColor: isDark ? "#0f172a" : "#fff",
                    circleStrokeWidth: 2,
                  }}
                />
                <MapLibreGL.SymbolLayer
                  id="user-initials"
                  filter={["!", ["has", "point_count"]]}
                  style={{
                    textField: ["get", "initial"],
                    textColor: "#fff",
                    textSize: 12,
                    textIgnorePlacement: true,
                    textAllowOverlap: true,
                  }}
                />
              </MapLibreGL.ShapeSource>

              <MapLibreGL.ShapeSource id="campus-zones" shape={CAMPUS_ZONES}>
                <MapLibreGL.FillLayer
                  id="campus-fill"
                  style={{
                    fillColor: ["coalesce", ["get", "fill"], "rgba(14,165,233,0.2)"],
                    fillOutlineColor: ["coalesce", ["get", "stroke"], "#0ea5e9"],
                  }}
                />
                <MapLibreGL.LineLayer
                  id="campus-outline"
                  style={{
                    lineColor: ["coalesce", ["get", "stroke"], "#0ea5e9"],
                    lineWidth: 2,
                    lineDasharray: [2, 1],
                    lineOpacity: 0.9,
                  }}
                />
              </MapLibreGL.ShapeSource>

              <MapLibreGL.ShapeSource id="campus-routes" shape={CAMPUS_ROUTES}>
                <MapLibreGL.LineLayer
                  id="route-lines"
                  style={{
                    lineColor: ["coalesce", ["get", "color"], "#22d3ee"],
                    lineWidth: 4,
                    lineOpacity: 0.85,
                    lineCap: "round",
                    lineJoin: "round",
                    lineBlur: 0.4,
                  }}
                />
              </MapLibreGL.ShapeSource>
            </MapLibreGL.MapView>
          )}

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
          {!DISABLE_NATIVE_MAP && !selectedUser && myCoords && !isCenteredOnUser && (
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
  mapStub: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  stubTitle: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
  stubBody: { fontSize: 13, textAlign: "center", lineHeight: 18 },
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
