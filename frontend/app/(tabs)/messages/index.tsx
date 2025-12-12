import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { AppState, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useUser } from "../../../context/UserContext";
import { useAppTheme } from "../../../context/ThemeContext";
import { getChatLastReadMap, saveChatLastRead } from "@/utils/chatReadStorage";
import { API_BASE_URL } from "@/utils/api";
import { AppScreen } from "@/components/layout/AppScreen";

type Conversation = {
  id: string;
  name: string;
  receiverId: number;
  receiverProfilePicture?: string | null;
  lastMessage?: string;
  lastTimestamp?: string;
  lastSenderId?: number | null;
  lastIncomingTimestamp?: string | null;
};

type User = {
  id: number;
  profilePicture?: string | null;
  visibility?: boolean;
};

export default function MessagesScreen() {
  const { currentUser, fetchWithAuth, accessToken } = useUser();
  const topPadding = 8;
  const [users, setUsers] = useState<User[]>([]);
  const [conversationsRaw, setConversationsRaw] = useState<Conversation[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRead, setLastRead] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  const { isDark, colors } = useAppTheme();
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLoadingConversationsRef = useRef(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          paddingHorizontal: 16,
          paddingTop: topPadding,
          backgroundColor: colors.background,
        },
        centered: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 16 },
        listContent: { paddingBottom: 28 },
        chatItem: {
          padding: 14,
          borderRadius: 18,
          backgroundColor: colors.card,
          marginBottom: 12,
          shadowColor: "#000",
          shadowOpacity: isDark ? 0.3 : 0.08,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 5 },
          elevation: 3,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        chatRow: { flexDirection: "row", alignItems: "center" },
        chatHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
        name: { fontWeight: "700", fontSize: 16, color: colors.text },
        nameUnread: { fontWeight: "800" },
        preview: { color: colors.muted, marginTop: 4, fontSize: 14 },
        previewUnread: { color: colors.text, fontWeight: "600" },
        timeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
        unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
        time: { color: isDark ? "#a5acc7" : "#6b7280", fontSize: 12 },
        avatar: { width: 52, height: 52, borderRadius: 26, marginRight: 12 },
        avatarPlaceholder: {
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: isDark ? "#2b3147" : "#e5e7eb",
          justifyContent: "center",
          alignItems: "center",
          marginRight: 12,
        },
        avatarInitial: { fontSize: 18, fontWeight: "700", color: isDark ? "#f0f4ff" : "#374151" },
        note: { color: isDark ? "#cfd3e5" : "#777", textAlign: "center" },
        error: { color: "#c00", marginBottom: 12, textAlign: "center" },
        retryButton: { backgroundColor: colors.accent, padding: 10, borderRadius: 12, marginTop: 8 },
        retryText: { color: "#fff", fontWeight: "bold" },
        loadingText: { color: colors.text },
      }),
    [isDark, colors, topPadding]
  );

  // Load all users
  const loadUsers = useCallback(async () => {
    if (!accessToken) return [];
    try {
      const response = await fetch(`${API_BASE_URL}/api/users`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error("Failed to load users");
      const data = (await response.json()) as User[];
      setUsers(data);
      return data;
    } catch (err) {
      console.error("Error loading users:", err);
      return [];
    }
  }, [accessToken]);

  // Load conversations
  const loadConversations = useCallback(
    async (options?: { silent?: boolean; fromPull?: boolean; skipIfBusy?: boolean }) => {
      if (!currentUser) return;
      if (options?.skipIfBusy && isLoadingConversationsRef.current) return;

      const showLoading = !options?.silent;
      const fromPull = options?.fromPull === true;
      const showErrors = showLoading || fromPull;
      if (showLoading) setLoading(true);
      if (fromPull) setRefreshing(true);
      isLoadingConversationsRef.current = true;

      try {
        const response = await fetchWithAuth(
          `${API_BASE_URL}/api/messages/conversations/${currentUser.id}`,
          { headers: { "Content-Type": "application/json" } }
        );

        if (!response.ok) throw new Error(`Failed to load conversations (${response.status})`);

        const data = (await response.json()) as Conversation[];
        const sorted = [...data].sort((a, b) => {
          const aTime = a.lastTimestamp ? new Date(a.lastTimestamp).getTime() : 0;
          const bTime = b.lastTimestamp ? new Date(b.lastTimestamp).getTime() : 0;
          return bTime - aTime;
        });

        // Store raw conversations first (unfiltered)
        setConversationsRaw(sorted);

        const readMap = await getChatLastReadMap(sorted.map((c) => c.id));
        setLastRead(readMap);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (showErrors) setError(message);
        else console.warn("Background conversation refresh failed:", message);
      } finally {
        isLoadingConversationsRef.current = false;
        if (showLoading) setLoading(false);
        if (fromPull) setRefreshing(false);
      }
    },
    [currentUser, fetchWithAuth]
  );

  // Apply filtering AFTER both users and conversationsRaw have loaded
  useEffect(() => {
    const usersMap = new Map(users.map(u => [u.id, u]));

    // Prevent flicker: do not filter until users have loaded
    if (users.length === 0) {
      setConversations(conversationsRaw);
      return;
    }

    const filtered = conversationsRaw.filter(conv => {
      const otherUser = usersMap.get(conv.receiverId);
      return otherUser && otherUser.visibility !== false;
    });

    setConversations(filtered);
  }, [users, conversationsRaw]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        loadConversations({ silent: true });
      }
    });
    return () => subscription.remove();
  }, [loadConversations]);

  const handleRefresh = useCallback(() => {
    void loadConversations({ silent: true, fromPull: true });
  }, [loadConversations]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // Load everything when screen focuses
  useFocusEffect(
    useCallback(() => {
      const fetchAll = async () => {
        await loadUsers();
        await loadConversations();
      };
      void fetchAll();

      const tick = () => {
        void loadConversations({ silent: true, skipIfBusy: true });
      };

      stopPolling();
      pollTimerRef.current = setInterval(tick, 5000);

      return () => {
        stopPolling();
      };
    }, [loadUsers, loadConversations, stopPolling])
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

  const markConversationRead = useCallback(async (chatId: string, timestamp?: string) => {
    if (!chatId) return;
    const iso = timestamp && !Number.isNaN(Date.parse(timestamp))
      ? timestamp
      : new Date().toISOString();
    setLastRead(prev => ({ ...prev, [chatId]: iso }));
    await saveChatLastRead(chatId, iso);
  }, []);

  return (
    <AppScreen edges={["left", "right"]}>
      <View style={styles.container}>
        {error ? (
          <View style={styles.centered}>
            <Text style={styles.error}>{error}</Text>
            <Pressable onPress={() => loadConversations()} style={styles.retryButton}>
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
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.accent}
                colors={[colors.accent]}
              />
            }
            renderItem={({ item }) => {
              const imageUri = item.receiverProfilePicture
                ? item.receiverProfilePicture.startsWith("http")
                  ? item.receiverProfilePicture
                  : `${API_BASE_URL}${item.receiverProfilePicture}`
                : null;

              const timestampLabel = formatTimestamp(item.lastTimestamp);
              const lastReadTimestamp = lastRead[item.id];
              const lastMsgTime = item.lastTimestamp ? Date.parse(item.lastTimestamp) : NaN;
              const lastReadTime = lastReadTimestamp ? Date.parse(lastReadTimestamp) : NaN;
              const lastIncomingTime = item.lastIncomingTimestamp
                ? Date.parse(item.lastIncomingTimestamp)
                : NaN;

              const latestIncomingTimestamp =
                Number.isFinite(lastIncomingTime)
                  ? lastIncomingTime
                  : item.lastSenderId !== currentUser?.id && Number.isFinite(lastMsgTime)
                  ? lastMsgTime
                  : NaN;

              const hasUnreadFromOthers =
                Number.isFinite(latestIncomingTimestamp) &&
                (!Number.isFinite(lastReadTime) || latestIncomingTimestamp > lastReadTime);

              const isUnread = hasUnreadFromOthers;

              const handleOpenChat = () => {
                void markConversationRead(item.id, item.lastTimestamp || undefined);

                router.push({
                  pathname: "/(tabs)/messages/[chatId]",
                  params: {
                    chatId: item.id,
                    name: item.name,
                    receiverId: item.receiverId.toString(),
                    profilePicture: item.receiverProfilePicture || "",
                  },
                });
              };

              return (
                <Pressable
                  style={({ pressed }) => [
                    styles.chatItem,
                    pressed ? { transform: [{ translateY: 1 }], opacity: 0.96 } : null,
                  ]}
                  onPress={handleOpenChat}
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
                        <Text
                          style={[styles.name, isUnread ? styles.nameUnread : null]}
                          numberOfLines={1}
                        >
                          {item.name}
                        </Text>

                        {(timestampLabel || isUnread) && (
                          <View style={styles.timeRow}>
                            {isUnread ? <View style={styles.unreadDot} /> : null}
                            {timestampLabel ? (
                              <Text style={styles.time}>{timestampLabel}</Text>
                            ) : null}
                          </View>
                        )}
                      </View>

                      <Text
                        style={[styles.preview, isUnread ? styles.previewUnread : null]}
                        numberOfLines={1}
                      >
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
    </AppScreen>
  );
}
