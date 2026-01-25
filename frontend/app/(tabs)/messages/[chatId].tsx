import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { ListRenderItem } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAppTheme } from "../../../context/ThemeContext";
import { useUser } from "../../../context/UserContext";
import UserOverflowMenu from "../../../components/UserOverflowMenu";
import { useTabHeaderOptions } from "../../../hooks/useTabHeaderOptions";
import { saveChatLastRead } from "@/utils/chatReadStorage";
import { API_BASE_URL, WS_BASE_URL } from "@/utils/api";
import { ChatScreenShell } from "@/components/layout/ChatScreenShell";

type Message = {
  id: number;
  content: string;
  senderId: number;
  chatSessionId: number;
  createdAt: string;
};

type StreamEnvelope =
  | { type: "message"; data: Message }
  | { type: "connected" }
  | Record<string, unknown>;

type DisplayItem =
  | { kind: "separator"; id: string; label: string }
  | { kind: "message"; item: Message };

type AppWebSocket = Omit<WebSocket, "ping"> & { ping?: () => void };

const sortMessages = (items: Message[]) =>
  [...items].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

export default function ChatScreen() {
  const { chatId, name, receiverId, profilePicture } = useLocalSearchParams<{
    chatId: string;
    name?: string;
    receiverId?: string;
    profilePicture?: string;
  }>();

  const navigation = useNavigation();
  const { currentUser, fetchWithAuth, setStatus, accessToken } = useUser();
  const { colors, isDark } = useAppTheme();
  const tabHeaderOptions = useTabHeaderOptions();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [overflowVisible, setOverflowVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invisibilityWarningDismissed, setInvisibilityWarningDismissed] = useState(false); // state for warning banner
  const [visibilityConfirmed, setVisibilityConfirmed] = useState(false); // ✅ state for confirmation banner

  const flatListRef = useRef<FlatList<DisplayItem>>(null);
  const socketRef = useRef<AppWebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shouldReconnectRef = useRef(false);
  const hasNavigatedAwayRef = useRef(false);

  const trimmedMessage = newMessage.trim();
  const canSend = trimmedMessage.length > 0;
  const keyboardEnabled = !overflowVisible;

  const resolvedProfileImage = useMemo(() => {
    if (!profilePicture) return null;
    return profilePicture.startsWith("http") ? profilePicture : `${API_BASE_URL}${profilePicture}`;
  }, [profilePicture]);

  const receiverInitial = useMemo(() => name?.[0]?.toUpperCase() || "?", [name]);

  // ✅ Normalized numeric receiver id for navigation
  const numericReceiverId = useMemo(
    () => (receiverId ? Number(receiverId) : null),
    [receiverId]
  );

  // ✅ Shared handler to open the other user's profile
  const handleViewProfilePress = useCallback(() => {
    if (!numericReceiverId) return;
    router.push({
      pathname: "/user/[id]",
      params: { id: String(numericReceiverId), from: "messages" },
    });
  }, [numericReceiverId]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1 },
        headerTitleRow: { flexDirection: "row", alignItems: "center" },
        headerAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
        headerAvatarFallback: {
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: colors.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
          marginRight: 12,
        },
        headerInitial: { fontWeight: "700", color: colors.text, fontSize: 17 },
        headerTextWrap: { flexDirection: "column", flex: 1 },
        headerName: { fontSize: 18, fontWeight: "800", color: colors.text },
        headerSubText: { color: colors.muted, fontSize: 12, marginTop: 2 },
        headerIconButton: {
          paddingHorizontal: 10,
          height: 40,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 12,
        },
        chatBody: { flex: 1 },
        messagesContainer: {
          paddingHorizontal: 16,
          paddingTop: 6,
          paddingBottom: 12,
          flexGrow: 1,
          justifyContent: messages.length ? "flex-end" : "center",
        },
        messageRow: { marginBottom: 12, flexDirection: "row", alignItems: "flex-end", gap: 10 },
        bubbleBase: {
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderRadius: 18,
          maxWidth: "80%",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        bubbleMine: {
          alignSelf: "flex-end",
          backgroundColor: colors.accent,
          borderTopRightRadius: 6,
          borderColor: colors.accent,
        },
        bubbleTheirs: {
          alignSelf: "flex-start",
          backgroundColor: colors.card,
          borderTopLeftRadius: 6,
        },
        bubbleText: { fontSize: 16, lineHeight: 22 },
        bubbleMeta: {
          marginTop: 4,
          fontSize: 12,
          color: isDark ? "#cdd2eb" : "#6b7280",
        },
        separatorWrap: { alignItems: "center", marginVertical: 10 },
        separatorText: { fontSize: 12, color: colors.muted },
        avatarSmall: {
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: colors.border,
          justifyContent: "center",
          alignItems: "center",
        },
        composerWrapper: {
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 0,
          backgroundColor: colors.background,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        composerSurface: {
          flexDirection: "row",
          alignItems: "flex-end",
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: 26,
          backgroundColor: isDark ? "#1f2537" : "#ffffff",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          shadowColor: "#000",
          shadowOpacity: isDark ? 0.25 : 0.08,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 3,
        },
        input: {
          flex: 1,
          fontSize: 16,
          color: colors.text,
          maxHeight: 140,
          paddingRight: 12,
          paddingVertical: Platform.OS === "ios" ? 12 : 8,
          textAlignVertical: "center",
          lineHeight: 20,
        },
        sendButton: {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: canSend ? colors.accent : colors.border,
          alignItems: "center",
          justifyContent: "center",
        },
        errorBanner: {
          marginHorizontal: 16,
          marginBottom: 8,
          padding: 12,
          borderRadius: 12,
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
        warningBanner: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginHorizontal: 16,
          marginBottom: 8,
          padding: 12,
          borderRadius: 12,
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
        warningText: {
          flex: 1,
          color: colors.text,
          marginRight: 12,
          fontWeight: "600",
          textAlign: "center",
        },
        confirmationBanner: {
          backgroundColor: colors.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          padding: 8,
          borderRadius: 8,
          marginHorizontal: 12,
          marginBottom: 8,
        },
        confirmationText: {
          color: colors.text,
          fontWeight: "600",
          textAlign: "center",
        },
        errorText: { color: isDark ? "#ffd7d5" : "#8b0000" },
        placeholderText: { color: colors.muted, textAlign: "center", marginTop: 12 },
      }),
    [canSend, colors, isDark, messages.length]
  );

  const scrollToBottom = useCallback(
    (animated = true) => flatListRef.current?.scrollToEnd({ animated }),
    []
  );

  const mergeMessages = useCallback((incoming: Message | Message[]) => {
    const items = Array.isArray(incoming) ? incoming : [incoming];
    setMessages((prev) => {
      const map = new Map<number, Message>();
      for (const message of prev) {
        map.set(message.id, message);
      }
      for (const message of items) {
        map.set(message.id, message);
      }
      return sortMessages(Array.from(map.values()));
    });
  }, []);

  const fetchMessages = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!currentUser || !chatId) return;
      const showLoading = !options?.silent;
      if (showLoading) setLoading(true);

      try {
        const response = await fetchWithAuth(`${API_BASE_URL}/api/messages/${chatId}`, {
          headers: { "Content-Type": "application/json" },
        });

        // 🔒 Special handling: if this chat is no longer allowed (e.g., blocked → 403),
        // quietly send the user back to the Messages index instead of showing an error.
        if (response.status === 403) {
          if (!options?.silent) {
            setError(null); // don't show "Failed to load messages (403)"

            if (!hasNavigatedAwayRef.current) {
              hasNavigatedAwayRef.current = true;
              router.replace("/(tabs)/messages");
            }
          }
          return;
        }

        if (!response.ok) {
          throw new Error(`Failed to load messages (${response.status})`);
        }

        const data = (await response.json()) as Message[];
        mergeMessages(data);
        if (showLoading) {
          scrollToBottom(false);
        }
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to load messages";
        if (!options?.silent) setError(message);
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [chatId, currentUser, fetchWithAuth, mergeMessages, scrollToBottom]
  );

  const handleSend = useCallback(async () => {
    if (!trimmedMessage || !currentUser) return;
    setError(null);
    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/api/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: trimmedMessage,
          chatSessionId: Number(chatId),
        }),
      });
      if (!response.ok) throw new Error(`Failed to send message (${response.status})`);
      const saved = (await response.json()) as Message;
      mergeMessages(saved);
      setNewMessage("");
      setTimeout(() => scrollToBottom(true), 50);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send message";
      setError(message);
    }
  }, [chatId, currentUser, fetchWithAuth, mergeMessages, scrollToBottom, trimmedMessage]);

  // ✅ ALWAYS send back to messages index when leaving this screen
  const goToMessagesList = useCallback(() => {
    if (hasNavigatedAwayRef.current) return;
    hasNavigatedAwayRef.current = true;
    router.replace("/(tabs)/messages");
  }, []);

  // Intercept back (hardware, header, gestures) and redirect to Messages index
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event) => {
      if (hasNavigatedAwayRef.current) return;
      event.preventDefault();
      goToMessagesList();
    });
    return unsubscribe;
  }, [navigation, goToMessagesList]);

  useLayoutEffect(() => {
    if (!name) return;
    navigation.setOptions({
      ...tabHeaderOptions,
      headerTitleAlign: "left",
      headerBackTitleVisible: false,
      headerTitleContainerStyle: { marginLeft: Platform.OS === "android" ? -4 : 0 },
      headerRightContainerStyle: { paddingRight: 6 },
      headerLeft: () => (
        <TouchableOpacity
          onPress={goToMessagesList}
          style={styles.headerIconButton}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={tabHeaderOptions.headerTintColor} />
        </TouchableOpacity>
      ),
      // ✅ Make the header avatar/name row tappable to view profile
      headerTitle: () => (
        <TouchableOpacity
          onPress={handleViewProfilePress}
          activeOpacity={0.7}
          style={styles.headerTitleRow}
          accessibilityRole="button"
          accessibilityLabel={`View ${name}'s profile`}
        >
          {resolvedProfileImage ? (
            <Image source={{ uri: resolvedProfileImage }} style={styles.headerAvatar} />
          ) : (
            <View style={styles.headerAvatarFallback}>
              <Text style={styles.headerInitial}>{receiverInitial}</Text>
            </View>
          )}
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerName} numberOfLines={1}>
              {name}
            </Text>
          </View>
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setMenuOpen(true)}
          style={styles.headerIconButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Chat actions"
        >
          <Ionicons name="ellipsis-vertical" size={20} color={tabHeaderOptions.headerTintColor} />
        </TouchableOpacity>
      ),
    });
  }, [
    name,
    navigation,
    receiverInitial,
    resolvedProfileImage,
    styles,
    tabHeaderOptions,
    goToMessagesList,
    handleViewProfilePress,
  ]);

  useEffect(() => {
    if (!chatId || messages.length === 0) return;
    const latest = messages[messages.length - 1];
    if (!latest?.createdAt) return;
    void saveChatLastRead(String(chatId), latest.createdAt);
  }, [chatId, messages]);

  const connectStream = useCallback(() => {
    if (!chatId || !accessToken || !WS_BASE_URL) return;

    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    const url = `${WS_BASE_URL}/api/messages/live?chatId=${chatId}&token=${encodeURIComponent(
      accessToken
    )}`;
    const socket: AppWebSocket = new WebSocket(url) as AppWebSocket;
    socketRef.current = socket;

    socket.onopen = () => {
      // connected
    };
    socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as StreamEnvelope;
        if (parsed.type === "message" && parsed.data) {
          mergeMessages(parsed.data as Message);
          scrollToBottom(true);
        }
      } catch {
        // ignore malformed payloads
      }
    };
    socket.onerror = () => {
      // handled in close
    };
    socket.onclose = () => {
      socketRef.current = null;
      if (!shouldReconnectRef.current) return;
      if (reconnectTimeoutRef.current) return;
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectTimeoutRef.current = null;
        connectStream();
      }, 1500);
    };
  }, [accessToken, chatId, mergeMessages, scrollToBottom]);

  useFocusEffect(
    useCallback(() => {
      shouldReconnectRef.current = true;
      fetchMessages();
      connectStream();
      pollIntervalRef.current = setInterval(() => {
        fetchMessages({ silent: true });
      }, 12000);

      return () => {
        shouldReconnectRef.current = false;
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
        if (socketRef.current) {
          socketRef.current.close();
          socketRef.current = null;
        }
      };
    }, [connectStream, fetchMessages])
  );

  const renderMessage: ListRenderItem<Message> = useCallback(
    ({ item }) => {
      const isMine = item.senderId === currentUser?.id;
      const created = new Date(item.createdAt);
      const timeLabel = Number.isNaN(created.getTime())
        ? ""
        : created.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      const metaColor = isMine ? "#e7ecff" : isDark ? "#cdd2eb" : "#6b7280";

      return (
        <View style={[styles.messageRow, { justifyContent: isMine ? "flex-end" : "flex-start" }]}>
          {!isMine && (
            <TouchableOpacity
              onPress={handleViewProfilePress}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`View ${name || "this user"}'s profile`}
            >
              {resolvedProfileImage ? (
                <Image source={{ uri: resolvedProfileImage }} style={styles.avatarSmall} />
              ) : (
                <View style={styles.avatarSmall}>
                  <Text style={{ color: colors.text, fontWeight: "700" }}>{receiverInitial}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
          <View
            style={[
              styles.bubbleBase,
              isMine ? styles.bubbleMine : styles.bubbleTheirs,
            ]}
          >
            <Text style={[styles.bubbleText, { color: isMine ? "#fff" : colors.text }]}>
              {item.content}
            </Text>
            {timeLabel ? (
              <Text style={[styles.bubbleMeta, { color: metaColor }]}>
                {timeLabel}
              </Text>
            ) : null}
          </View>
        </View>
      );
    },
    [
      colors.text,
      currentUser?.id,
      isDark,
      receiverInitial,
      resolvedProfileImage,
      styles,
      handleViewProfilePress,
      name,
    ]
  );

  const formatSeparatorLabel = useCallback((date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    if (diffDays === 0) return `Today ${formatTime(date)}`;
    if (diffDays === 1) return `Yesterday ${formatTime(date)}`;
    if (diffDays < 7) return `${date.toLocaleDateString([], { weekday: "long" })} ${formatTime(date)}`;

    return `${date.toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
    })} at ${formatTime(date)}`;
  }, []);

  const displayItems = useMemo<DisplayItem[]>(() => {
    if (!messages.length) return [];
    const items: DisplayItem[] = [];
    const ordered = sortMessages(messages);
    for (let i = 0; i < ordered.length; i += 1) {
      const current = ordered[i];
      const currentDate = new Date(current.createdAt);
      const previous = ordered[i - 1];
      const needsSeparator =
        i === 0 ||
        !previous ||
        currentDate.getTime() - new Date(previous.createdAt).getTime() > 1000 * 60 * 60;

      if (needsSeparator) {
        items.push({
          kind: "separator",
          id: `sep-${current.id}`,
          label: formatSeparatorLabel(currentDate),
        });
      }
      items.push({ kind: "message", item: current });
    }
    return items;
  }, [formatSeparatorLabel, messages]);

  useEffect(() => {
    if (loading) return;
    if (!displayItems.length) return;
    // ensure we land on the newest message when opening
    requestAnimationFrame(() => scrollToBottom(false));
  }, [displayItems, loading, scrollToBottom]);

  const renderComposer = useCallback(
    (inputPadding: number) => (
      <View style={[styles.composerWrapper, { paddingBottom: inputPadding }]}>
        <View style={styles.composerSurface}>
          <TextInput
            style={styles.input}
            placeholder="Message"
            placeholderTextColor={colors.muted}
            value={newMessage}
            onChangeText={setNewMessage}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            blurOnSubmit={false}
            multiline
            autoCorrect
          />
          <TouchableOpacity
            onPress={handleSend}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            disabled={!canSend}
            style={styles.sendButton}
          >
            <Ionicons name="send" size={18} color={canSend ? "#fff" : colors.muted} />
          </TouchableOpacity>
        </View>
      </View>
    ),
    [canSend, colors.muted, handleSend, newMessage, setNewMessage, styles]
  );

  const renderBody = useCallback(
    (contentPaddingBottom: number) => (
      <View style={styles.chatBody}>
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        {!currentUser?.visibility && !invisibilityWarningDismissed && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>
              You are invisible.{" "}
              <Text
                style={{ fontWeight: "600", color: colors.accent }}
                onPress={() => {
                  setStatus("Visible"); // toggle visibility
                  setInvisibilityWarningDismissed(true); // hide warning
                  setVisibilityConfirmed(true); // show confirmation
                  setTimeout(() => setVisibilityConfirmed(false), 3000); // hide after 3s
                }}
              >
                Turn on visibility
              </Text>{" "}
              to allow other users to see your messages!
            </Text>

            <TouchableOpacity onPress={() => setInvisibilityWarningDismissed(true)}>
              <Ionicons name="close" size={20} color={colors.icon} />
            </TouchableOpacity>
          </View>
        )}

        {visibilityConfirmed && (
          <View style={styles.confirmationBanner}>
            <Text style={styles.confirmationText}>
              You are now visible to other users!
            </Text>
          </View>
        )}

        <FlatList
          ref={flatListRef}
          data={displayItems}
          keyExtractor={(item) => (item.kind === "separator" ? item.id : item.item.id.toString())}
          renderItem={({ item, index, separators }) =>
            item.kind === "separator" ? (
              <View style={styles.separatorWrap}>
                <Text style={styles.separatorText}>{item.label}</Text>
              </View>
            ) : (
              renderMessage({ item: item.item, index, separators })
            )
          }
          contentContainerStyle={[
            styles.messagesContainer,
            { paddingBottom: contentPaddingBottom },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          onContentSizeChange={() => scrollToBottom(true)}
          ListEmptyComponent={
            <Text style={styles.placeholderText}>
              Start the conversation with {name || "this user"}.
            </Text>
          }
        />
      </View>
    ),
    [
      colors.accent,
      colors.icon,
      currentUser?.visibility,
      displayItems,
      error,
      invisibilityWarningDismissed,
      name,
      renderMessage,
      scrollToBottom,
      setStatus,
      styles,
      visibilityConfirmed,
    ]
  );

  if (loading) {
    return (
      <ChatScreenShell
        edges={["left", "right"]}
        renderInputBar={(inputPadding) => renderComposer(inputPadding)}
        keyboardEnabled={keyboardEnabled}
      >
        {(contentPaddingBottom) => (
          <View
            style={[
              styles.chatBody,
              {
                justifyContent: "center",
                alignItems: "center",
                paddingBottom: contentPaddingBottom,
              },
            ]}
          >
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={{ marginTop: 12, color: colors.text }}>Loading chat...</Text>
          </View>
        )}
      </ChatScreenShell>
    );
  }

  return (
    <>
      <ChatScreenShell
        edges={["left", "right"]}
        renderInputBar={(inputPadding) => renderComposer(inputPadding)}
        keyboardEnabled={keyboardEnabled}
      >
        {(contentPaddingBottom) => renderBody(contentPaddingBottom)}
      </ChatScreenShell>

      <UserOverflowMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        targetUser={{ id: numericReceiverId ?? 0, name: name ?? "" }}
        onBlocked={() => {
          setMenuOpen(false);
          try {
            (navigation as any).goBack?.();
          } catch {
            //
          }
        }}
        onReported={() => {
          // optional: you can show a toast, etc.
          setMenuOpen(false);
        }}
        onViewProfile={(userId) => {
          // close the menu
          setMenuOpen(false);
          // navigate to the read-only profile screen
          router.push({
            pathname: "/user/[id]",
            params: { id: String(userId), from: "messages" }, // coming from Messages
          });
        }}
        onOverlayVisibilityChange={setOverflowVisible}
      />
    </>
  );
}
