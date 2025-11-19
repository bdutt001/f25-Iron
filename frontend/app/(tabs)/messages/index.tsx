import React, { useState, useCallback, useMemo } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator, StyleSheet, Image } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useUser } from "../../../context/UserContext";
import { useAppTheme } from "../../../context/ThemeContext";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

type Conversation = {
  id: string;
  name: string;
  receiverId: number;
  receiverProfilePicture?: string | null;
  lastMessage?: string;
  lastTimestamp?: string;
};

export default function MessagesScreen() {
  const { currentUser, accessToken } = useUser();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isDark, colors } = useAppTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          paddingHorizontal: 14,
          paddingTop: 8,
          backgroundColor: colors.background,
        },
        centered: { flex: 1, justifyContent: "center", alignItems: "center" },
        listContent: { paddingBottom: 24 },
        chatItem: {
          padding: 14,
          borderRadius: 16,
          backgroundColor: colors.card,
          marginBottom: 12,
          shadowColor: "#000",
          shadowOpacity: isDark ? 0.35 : 0.08,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 3,
        },
        chatRow: { flexDirection: "row", alignItems: "center" },
        chatHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
        name: { fontWeight: "700", fontSize: 16, color: colors.text },
        preview: { color: colors.muted, marginTop: 4 },
        time: { color: isDark ? "#8b8ca0" : "#6b7280", fontSize: 12 },
        avatar: { width: 52, height: 52, borderRadius: 26, marginRight: 12 },
        avatarPlaceholder: {
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: isDark ? "#252634" : "#e5e7eb",
          justifyContent: "center",
          alignItems: "center",
          marginRight: 12,
        },
        avatarInitial: { fontSize: 18, fontWeight: "700", color: isDark ? "#e5e7eb" : "#374151" },
        note: { color: isDark ? "#BBBBBB" : "#777" },
        error: { color: "#c00", marginBottom: 12 },
        retryButton: { backgroundColor: colors.accent, padding: 10, borderRadius: 8 },
        retryText: { color: "#fff", fontWeight: "bold" },
        loadingText: { color: isDark ? "#FFFFFF" : "#111111" },
      }),
    [isDark, colors]
  );

  const loadConversations = useCallback(async () => {
    if (!currentUser || !accessToken) return;

    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/messages/conversations/${currentUser.id}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) throw new Error(`Failed to load conversations (${response.status})`);

      const data = (await response.json()) as Conversation[];
      const sorted = [...data].sort((a, b) => {
        const aTime = a.lastTimestamp ? new Date(a.lastTimestamp).getTime() : 0;
        const bTime = b.lastTimestamp ? new Date(b.lastTimestamp).getTime() : 0;
        return bTime - aTime;
      });
      setConversations(sorted);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [currentUser, accessToken]);

  useFocusEffect(
    useCallback(() => {
      loadConversations();
    }, [loadConversations])
  );

  const formatTimestamp = useCallback((timestamp?: string | null) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "";

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    if (diffDays === 1) {
      return "Yesterday";
    }
    if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: "long" });
    }
    return date.toLocaleDateString([], { month: "numeric", day: "numeric", year: "2-digit" });
  }, []);

  return (
    <View style={styles.container}>
      {loading && (
        <View style={{ position: "absolute", top: 10, right: 14 }}>
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      )}

      {error ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
          <Pressable onPress={loadConversations} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : conversations.length === 0 && !loading ? (
        <View style={styles.centered}>
          <Text style={styles.note}>You have no active chats yet.</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const imageUri = item.receiverProfilePicture
              ? item.receiverProfilePicture.startsWith("http")
                ? item.receiverProfilePicture
                : `${API_BASE_URL}${item.receiverProfilePicture}`
              : null;
            const timestampLabel = formatTimestamp(item.lastTimestamp);

            return (
              <Pressable
                style={({ pressed }) => [
                  styles.chatItem,
                  pressed ? { transform: [{ translateY: 1 }], opacity: 0.96 } : null,
                ]}
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/messages/[chatId]",
                    params: {
                      chatId: item.id,
                      name: item.name,
                      receiverId: item.receiverId.toString(),
                      profilePicture: item.receiverProfilePicture || "",
                    },
                  })
                }
              >
                <View style={styles.chatRow}>
                  {imageUri ? (
                    <Image source={{ uri: imageUri }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarInitial}>{item.name[0]?.toUpperCase() || "?"}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={styles.chatHeaderRow}>
                      <Text style={styles.name} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {timestampLabel ? <Text style={styles.time}>{timestampLabel}</Text> : null}
                    </View>
                    <Text style={styles.preview} numberOfLines={1}>
                      {item.lastMessage || "Tap to chat"}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

