import React, { useState, useCallback, useMemo } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator, StyleSheet, Image, useColorScheme } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useUser } from "../../../context/UserContext";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

type Conversation = {
  id: string;
  name: string;
  receiverId: number;
  receiverProfilePicture?: string | null; // ✅ new
  lastMessage?: string;
  lastTimestamp?: string;
};

export default function MessagesScreen() {
  const { currentUser, accessToken } = useUser();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ✅ Respect system Light/Dark mode
  const scheme = useColorScheme();
  const isDark = scheme === "dark";

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, padding: 16, backgroundColor: isDark ? "#121212" : "#FFFFFF" },
        centered: { flex: 1, justifyContent: "center", alignItems: "center" },
        chatItem: {
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: isDark ? "#2A2A2A" : "#CCCCCC",
        },
        chatRow: { flexDirection: "row", alignItems: "center" },
        chatHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
        name: { fontWeight: "bold", fontSize: 16, color: isDark ? "#FFFFFF" : "#111111" },
        preview: { color: isDark ? "#B5B5B5" : "gray", marginTop: 2 },
        time: { color: isDark ? "#A0A0A0" : "#888", fontSize: 12 },
        avatar: { width: 48, height: 48, borderRadius: 24, marginRight: 12 },
        avatarPlaceholder: {
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: isDark ? "#2F2F2F" : "#DDDDDD",
          justifyContent: "center",
          alignItems: "center",
          marginRight: 12,
        },
        avatarInitial: { fontSize: 18, fontWeight: "bold", color: isDark ? "#E0E0E0" : "#555" },
        note: { color: isDark ? "#BBBBBB" : "#777" },
        error: { color: "#c00", marginBottom: 12 },
        retryButton: { backgroundColor: "#007BFF", padding: 10, borderRadius: 8 },
        retryText: { color: "white", fontWeight: "bold" },
        loadingText: { color: isDark ? "#FFFFFF" : "#111111" },
      }),
    [isDark]
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
      setConversations(data);
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

return (
  <View style={styles.container}>
    {loading && (
      <View style={{ position: "absolute", top: 10, right: 10 }}>
        <ActivityIndicator size="small" color="#007BFF" />
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
        renderItem={({ item }) => {
          const imageUri = item.receiverProfilePicture
            ? item.receiverProfilePicture.startsWith("http")
              ? item.receiverProfilePicture
              : `${API_BASE_URL}${item.receiverProfilePicture}`
            : null;

          return (
            <Pressable
              style={styles.chatItem}
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
                    <Text style={styles.avatarInitial}>
                      {item.name[0]?.toUpperCase() || "?"}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={styles.chatHeaderRow}>
                    <Text style={styles.name}>{item.name}</Text>
                    {item.lastTimestamp && (
                      <Text style={styles.time}>
                        {new Date(item.lastTimestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.preview}>
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
