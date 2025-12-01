// app/user/[id].tsx
import { useLocalSearchParams, useNavigation } from "expo-router";
import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Image,
} from "react-native";
import { useUser, type CurrentUser } from "../../context/UserContext";
import { API_BASE_URL, fetchUserById } from "@/utils/api";
import ReportButton from "../../components/ReportButton";

const sortTags = (tags: string[]): string[] => [...tags].sort((a, b) => a.localeCompare(b));
const toPossessive = (name: string) =>
  !name ? "Profile" : /s$/i.test(name) ? `${name}’ Profile` : `${name}’s Profile`;

export default function OtherUserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const { accessToken, currentUser } = useUser();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const u = await fetchUserById(Number(id), accessToken || undefined);
        if (!cancelled) setUser(u);
      } catch {
        if (!cancelled) {
          setError("Unable to load profile.");
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [id, accessToken]);

  const displayName = useMemo(() => {
    if (!user) return "";
    return user.name?.trim()?.length ? user.name : user.email;
  }, [user]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: toPossessive(displayName || "User") });
  }, [navigation, displayName]);

  const profilePicture = useMemo(() => {
    if (!user?.profilePicture) return null;
    return user.profilePicture.startsWith("http")
      ? user.profilePicture
      : `${API_BASE_URL}${user.profilePicture}`;
  }, [user?.profilePicture]);

  const sortedTags = useMemo(() => sortTags(user?.interestTags ?? []), [user?.interestTags]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007BFF" />
        <Text style={styles.note}>Loading profile…</Text>
      </View>
    );
  }

  if (error || !user) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error ?? "Profile not found."}</Text>
      </View>
    );
  }

  const isSelf = currentUser?.id === user.id;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.card}>
        <View style={styles.profilePictureSection}>
          {profilePicture ? (
            <Image source={{ uri: profilePicture }} style={styles.profilePicture} />
          ) : (
            <View style={[styles.profilePicture, styles.profilePlaceholder]}>
              <Text>No Picture</Text>
            </View>
          )}
        </View>

        <Text style={styles.label}>Name:</Text>
        <View style={styles.valueRow}>
          <Text style={[styles.value, styles.nameValue]}>{displayName}</Text>
        </View>

        {isSelf && (
          <>
            <Text style={styles.label}>Email:</Text>
            <Text style={styles.value}>{user.email}</Text>
          </>
          )}
        
        <View style={styles.divider} />

        <View style={styles.tagHeader}>
          <Text style={styles.label}>Interest Tags</Text>
        </View>

        {sortedTags.length === 0 ? (
          <Text style={styles.emptyTags}>No tags to show.</Text>
        ) : (
          <View style={styles.selectedTagsWrapper}>
            {sortedTags.map((tag) => (
              <View key={tag} style={styles.selectedChip}>
                <Text style={styles.selectedChipText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ marginTop: 24, alignItems: "center" }}>
          <ReportButton
            reportedUserId={user.id}
            reportedUserName={displayName}
            size="medium"
            onReportSuccess={() => {}}
            disabled={isSelf}
          />
          {isSelf && <Text style={styles.helperText}>You can’t report yourself.</Text>}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f2f2f2" },
  scrollContent: { alignItems: "center", padding: 20, paddingBottom: 40 },
  card: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 10,
    width: "100%",
    maxWidth: 580,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  note: { marginTop: 12, fontSize: 16, textAlign: "center", color: "#555" },
  error: { marginTop: 8, fontSize: 16, textAlign: "center", color: "#c00" },
  label: { fontSize: 16, fontWeight: "600", marginTop: 10 },
  value: { fontSize: 16, color: "#333" },
  valueRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  nameValue: { flex: 1, marginRight: 12 },
  divider: { marginVertical: 16, height: 1, backgroundColor: "#eee" },
  helperText: { marginTop: 8, fontSize: 13, color: "#666" },
  emptyTags: { marginTop: 8, fontSize: 14, color: "#666" },
  selectedTagsWrapper: { flexDirection: "row", flexWrap: "wrap", marginTop: 8 },
  selectedChip: { backgroundColor: "#e6f0ff", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 8, marginBottom: 8 },
  selectedChipText: { color: "#1f5fbf", fontSize: 14, fontWeight: "500" },
  profilePictureSection: { alignItems: "center", marginBottom: 20 },
  profilePicture: { width: 120, height: 120, borderRadius: 60, marginBottom: 10 },
  profilePlaceholder: { backgroundColor: "#ddd", justifyContent: "center", alignItems: "center" },
});
