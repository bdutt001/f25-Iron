// app/user/[id].tsx
// -------------------------------------------------------------
// Read-only view of another user's profile.
// - Hides their visibility setting
// - Hides their email
// - Shows trust score with color coding
// - Shows their profile status (e.g., "Looking to Mingle")
// - Sets header title to "<Name>'s Profile"
// - Shows a message button next to the Status when viewing others
// - Shows overflow menu (block / report) in top-right of the card
// -------------------------------------------------------------

import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  Alert,
} from "react-native";
import type { AlertOptions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useAppTheme } from "../../context/ThemeContext";
import { useUser } from "../../context/UserContext";
import { fetchUserById, API_BASE_URL } from "@/utils/api";
import type { CurrentUser } from "../../context/UserContext";
import UserOverflowMenu from "../../components/UserOverflowMenu";

// Reuse the same trust score colors as NearbyScreen
const trustColorForScore = (score: number) => {
  if (score >= 90) return "#28a745";
  if (score >= 70) return "#7ED957";
  if (score >= 51) return "#FFC107";
  return "#DC3545";
};

export default function OtherUserProfileScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const navigation = useNavigation();
  const { colors, isDark } = useAppTheme();
  const { accessToken, currentUser, fetchWithAuth } = useUser();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [menuVisible, setMenuVisible] = useState(false);

  const alertAppearance = useMemo<AlertOptions>(
    () => ({ userInterfaceStyle: isDark ? "dark" : "light" }),
    [isDark]
  );

  // Load the other user's profile
  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const numericId = Number(id);
        const data = await fetchUserById(numericId, accessToken ?? undefined);
        setUser(data);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load user profile.";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [id, accessToken]);

  // Start (or resume) a chat with this user, then navigate to the messages screen
  const startChatWithUser = React.useCallback(
    async (receiverId: number, receiverName: string, receiverProfilePicture: string | null) => {
      if (!currentUser) {
        Alert.alert(
          "Not logged in",
          "Please log in to start a chat.",
          undefined,
          alertAppearance
        );
        return;
      }

      try {
        // Fetch latest receiver info (for name/picture)
        let latestUser: any = null;
        try {
          const userResponse = await fetchWithAuth(`${API_BASE_URL}/users/${receiverId}`);
          if (userResponse.ok) {
            latestUser = await userResponse.json();
          }
        } catch {
          // If this fails, we still proceed with the provided name/picture
        }

        // Create or get chat session
        const response = await fetchWithAuth(`${API_BASE_URL}/api/messages/session`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            participants: [currentUser.id, receiverId],
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to start chat (${response.status})`);
        }

        const data = (await response.json()) as { chatId: number };
        const chatId = String(data.chatId);

        const finalName =
          (latestUser && typeof latestUser.name === "string" && latestUser.name) ||
          receiverName;

        const finalProfilePicture =
          (latestUser &&
            typeof latestUser.profilePicture === "string" &&
            latestUser.profilePicture) ||
          receiverProfilePicture ||
          "";

        // Navigate to the chat screen
        router.push({
          pathname: "/(tabs)/messages/[chatId]",
          params: {
            chatId,
            name: finalName,
            receiverId: String(receiverId),
            profilePicture: finalProfilePicture,
            returnToMessages: "1",
          },
        });
      } catch (err) {
        console.error("Failed to start chat:", err);
        Alert.alert(
          "Error",
          "Failed to start chat. Please try again.",
          undefined,
          alertAppearance
        );
      }
    },
    [alertAppearance, currentUser, fetchWithAuth]
  );

  // Set the header title to "<Name>'s Profile" (or just "Profile" as a fallback)
  useLayoutEffect(() => {
    const displayName =
      user?.name && user.name.trim().length > 0
        ? user.name
        : user?.email ?? "Profile";

    (navigation as any)?.setOptions?.({
      title: user ? `${displayName}'s Profile` : "Profile",
      headerTitleAlign: "left",
    });
  }, [navigation, user]);

  const cardSurface = useMemo(
    () => ({
      backgroundColor: colors.card,
      borderColor: colors.border,
      shadowColor: isDark ? "#000" : "#000",
    }),
    [colors.card, colors.border, isDark]
  );

  const mutedText = { color: colors.muted };
  const primaryText = { color: colors.text };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, primaryText]}>Loading profile…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !user) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.centered}>
          <Text style={[styles.errorText, { color: "#c00" }]}>
            {error ?? "User not found."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const isSelf = currentUser?.id === user.id;

  const displayName =
    user.name && user.name.trim().length > 0 ? user.name : user.email;
  const profileStatus =
    (user as any).profileStatus && (user as any).profileStatus.trim().length > 0
      ? (user as any).profileStatus
      : "Looking to Mingle"; // default for viewed profiles too
  const trustScore = user.trustScore ?? 0;
  const trustColor = trustColorForScore(trustScore);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={[styles.card, cardSurface]}>
          {/* Card header row: overflow menu icon on top-right (for other users) */}
          <View style={styles.cardHeaderRow}>
            <View style={{ flex: 1 }} />
            {!isSelf && (
              <Pressable
                onPress={() => setMenuVisible(true)}
                style={({ pressed }) => [
                  styles.overflowIconButton,
                  {
                    borderColor: colors.border,
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.06)"
                      : "rgba(0,0,0,0.04)",
                  },
                  pressed && styles.overflowIconButtonPressed,
                ]}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityRole="button"
                accessibilityLabel={`More options for ${displayName}`}
              >
                <Ionicons
                  name="ellipsis-vertical"
                  size={18}
                  color={colors.text}
                  style={
                    Platform.OS === "android"
                      ? {
                          includeFontPadding: false,
                          textAlignVertical: "center",
                          lineHeight: 18,
                        }
                      : undefined
                  }
                />
              </Pressable>
            )}
          </View>

          {/* Profile picture */}
          <View style={styles.profilePictureSection}>
            {user.profilePicture ? (
              <Image
                source={{ uri: user.profilePicture }}
                style={[
                  styles.profilePicture,
                  { borderColor: colors.border },
                ]}
              />
            ) : (
              <View
                style={[
                  styles.profilePicture,
                  styles.profilePlaceholder,
                  { borderColor: colors.border, backgroundColor: colors.border },
                ]}
              >
                <Text style={[styles.initialsText, primaryText]}>
                  {(displayName?.[0] ?? "?").toUpperCase()}
                </Text>
              </View>
            )}
            <Text
              style={[styles.displayNameText, primaryText]}
              numberOfLines={1}
            >
              {displayName}
            </Text>
            {/* ❌ Email intentionally NOT shown for other users */}
          </View>

          {/* Status row: big status text + message icon button (for other users) */}
          <Text style={[styles.label, primaryText]}>Status:</Text>
          <View style={styles.statusRow}>
            <Text
              style={[
                styles.statusValueLarge,
                { color: colors.accent },
              ]}
              numberOfLines={2}
            >
              {profileStatus}
            </Text>

            {/* Only show message button when viewing someone else */}
            {!isSelf && (
              <Pressable
                onPress={() =>
                  startChatWithUser(
                    user.id,
                    displayName,
                    user.profilePicture ?? null
                  )
                }
                style={({ pressed }) => [
                  styles.statusMessageButton,
                  { backgroundColor: colors.accent },
                  pressed && styles.statusMessageButtonPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Message ${displayName}`}
              >
                <Ionicons
                  name="chatbubble"
                  size={18}
                  color="#fff"
                  style={
                    Platform.OS === "android"
                      ? {
                          includeFontPadding: false,
                          textAlignVertical: "center",
                          lineHeight: 18,
                        }
                      : undefined
                  }
                />
              </Pressable>
            )}
          </View>

          {/* Trust score (color-coded) */}
          <Text style={[styles.label, primaryText]}>Trust Score:</Text>
          <Text
            style={[
              styles.value,
              styles.trustScoreValue,
              { color: trustColor },
            ]}
          >
            {trustScore}
          </Text>

          {/* ✅ Do NOT show their visibility setting here */}

          {/* Interest tags */}
          <Text style={[styles.label, primaryText]}>Interest Tags:</Text>
          {user.interestTags && user.interestTags.length > 0 ? (
            <View style={styles.tagsRow}>
              {user.interestTags.map((tag) => (
                <View key={tag} style={[styles.tagChip, { borderColor: colors.border }]}>
                  <Text style={[styles.tagText, { color: colors.accent }]}>
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.helperText, mutedText]}>
              This user hasn&apos;t selected any interest tags yet.
            </Text>
          )}
        </View>
      </ScrollView>

      {/* Overflow menu for block / report – only for other users */}
      {!isSelf && (
        <UserOverflowMenu
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          targetUser={
            user
              ? { id: user.id, name: user.name ?? null, email: user.email ?? null }
              : null
          }
          onBlocked={() => {
            setMenuVisible(false);
            router.back();
          }}
          onReported={() => {
            setMenuVisible(false);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    alignItems: "center",
  },
  card: {
    width: "100%",
    maxWidth: 580,
    borderRadius: 12,
    padding: 20,
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginBottom: 4,
  },
  overflowIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  overflowIconButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 16,
  },
  errorText: {
    fontSize: 16,
    textAlign: "center",
  },
  profilePictureSection: {
    alignItems: "center",
    marginBottom: 20,
  },
  profilePicture: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  profilePlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  initialsText: {
    fontSize: 32,
    fontWeight: "700",
  },
  displayNameText: {
    fontSize: 22,
    fontWeight: "700",
    marginTop: 4,
    marginBottom: 2,
    textAlign: "center",
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 10,
  },
  value: {
    fontSize: 16,
    marginTop: 4,
  },
  trustScoreValue: {
    fontWeight: "700",
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
  },
  tagChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginRight: 8,
    marginBottom: 8,
  },
  tagText: {
    fontSize: 13,
    fontWeight: "600",
  },
  helperText: {
    marginTop: 6,
    fontSize: 13,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  statusValueLarge: {
    fontSize: 22,
    fontWeight: "700",
    marginTop: 4,
    flex: 1,
    marginRight: 12,
  },
  statusMessageButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
  },
  statusMessageButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
});
