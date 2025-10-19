import React, { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useUser } from "../../../context/UserContext";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

type Conversation = {
  id: string;
  name: string;
  lastMessage?: string;
  lastTimestamp?: string;
};

export default function MessagesScreen() {
  const { currentUser, accessToken } = useUser();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    if (!currentUser || !accessToken) return;

    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/messages/conversations/${currentUser.id}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`, // ✅ send token
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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007BFF" />
        <Text>Loading your chats...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
        <Pressable onPress={loadConversations} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (conversations.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.note}>You have no active chats yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            style={styles.chatItem}
            onPress={() =>
              router.push({
                pathname: "/(tabs)/messages/[chatId]",
                params: { chatId: item.id, name: item.name },
              })
            }
          >
            <View style={styles.chatRow}>
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
              {item.lastMessage ? item.lastMessage : "Tap to chat"}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  chatItem: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#ccc" },
  chatRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontWeight: "bold", fontSize: 16 },
  preview: { color: "gray", marginTop: 4 },
  time: { color: "#888", fontSize: 12 },
  note: { color: "#777" },
  error: { color: "#c00", marginBottom: 12 },
  retryButton: { backgroundColor: "#007BFF", padding: 10, borderRadius: 8 },
  retryText: { color: "white", fontWeight: "bold" },
});
