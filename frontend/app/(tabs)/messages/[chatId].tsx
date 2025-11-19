import React, { useState, useLayoutEffect, useEffect, useCallback, useRef, useMemo } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  View,
  FlatList,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Image,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context"; // ✅ modern SafeAreaView
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useHeaderHeight } from "@react-navigation/elements";
import { useUser } from "../../../context/UserContext";
import { Ionicons } from "@expo/vector-icons";
import UserOverflowMenu from "../../../components/UserOverflowMenu";
import { useAppTheme } from "../../../context/ThemeContext";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

type Message = {
  id: number;
  content: string;
  senderId: number;
  chatSessionId: number;
  createdAt: string;
};

export default function ChatScreen() {
  const { chatId, name, receiverId, profilePicture, returnToMessages } = useLocalSearchParams<{
    chatId: string;
    name?: string;
    receiverId?: string;
    profilePicture?: string;
    returnToMessages?: string;
  }>();
  const navigation = useNavigation();
  const { currentUser, accessToken } = useUser();
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  // ✅ Add FlatList ref for auto-scroll
  const flatListRef = useRef<FlatList<Message>>(null);
  const trimmedMessage = newMessage.trim();
  const canSend = trimmedMessage.length > 0;
  const keyboardVerticalOffset = Platform.OS === "ios" ? headerHeight : 0;
  const shouldReturnToMessages = returnToMessages === "1" || returnToMessages === "true";
  const goToMessagesList = useCallback(() => {
    router.replace("/(tabs)/messages");
  }, []);

  // ✅ Simplify header — just show title + Report button
  useLayoutEffect(() => {
    if (name) {
      navigation.setOptions({
        title: name,
        headerLeft: shouldReturnToMessages
          ? () => (
              <TouchableOpacity
                onPress={goToMessagesList}
                style={{ paddingHorizontal: 8, paddingVertical: 6, flexDirection: "row", alignItems: "center" }}
              >
                <Ionicons name="chevron-back" size={20} color={colors.text} />
                <Text style={{ color: colors.text, fontWeight: "600", marginLeft: 4 }}>Chats</Text>
              </TouchableOpacity>
            )
          : undefined,
        headerRight: () => (
          <TouchableOpacity onPress={() => setMenuOpen(true)} style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
            <Ionicons name="ellipsis-vertical" size={20} color={colors.text} />
          </TouchableOpacity>
        ),
      });
    }
  }, [navigation, name, chatId, receiverId, colors.text, shouldReturnToMessages, goToMessagesList]);

  useEffect(() => {
    if (!shouldReturnToMessages) return;
    const unsubscribe = navigation.addListener("beforeRemove", (event) => {
      event.preventDefault();
      goToMessagesList();
    });
    return unsubscribe;
  }, [navigation, shouldReturnToMessages, goToMessagesList]);

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    if (!accessToken) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/messages/${chatId}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!response.ok) throw new Error(`Failed to load messages (${response.status})`);
      const data = (await response.json()) as Message[];
      setMessages(data);

      // ✅ Scroll to bottom after fetching messages
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
    } catch (err) {
      console.error("Fetch messages error:", err);
    } finally {
      setLoading(false);
    }
  }, [chatId, accessToken]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        avoidingContent: { flexGrow: 1 },
        chatBody: { flex: 1 },
        messagesList: { flex: 1 },
        messagesContainer: { padding: 10, flexGrow: 1 },
        messageRow: { flexDirection: "row", alignItems: "flex-end", marginVertical: 4 },
        messageBubble: { padding: 10, borderRadius: 12, maxWidth: "75%" },
        myMessage: { alignSelf: "flex-end", backgroundColor: colors.accent },
        theirMessage: {
          alignSelf: "flex-start",
          backgroundColor: colors.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        messageText: { fontSize: 16, color: colors.text },
        // ? Reuse placeholder for both avatar and image case
        messageAvatarPlaceholder: {
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: colors.border,
          justifyContent: "center",
          alignItems: "center",
          marginRight: 8,
        },
        messageAvatarInitial: { fontSize: 16, fontWeight: "bold", color: colors.text },
        inputContainer: {
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 10,
          paddingTop: 10,
          paddingBottom: 10,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.card, // keeps visible above keyboard
        },
        input: {
          flex: 1,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 20,
          paddingHorizontal: 12,
          paddingVertical: 10,
          marginRight: 8,
          backgroundColor: colors.background,
          color: colors.text,
        },
        sendButton: {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: colors.accent,
          alignItems: "center",
          justifyContent: "center",
        },
        sendButtonDisabled: { opacity: 0.4 },
        /* ? New profile section inside chat */
        chatHeader: { alignItems: "center", marginVertical: 12 },
        chatHeaderAvatar: {
          width: 72,
          height: 72,
          borderRadius: 36,
          marginBottom: 6,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 3,
          elevation: 5,
        },
        chatHeaderAvatarPlaceholder: {
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: colors.border,
          justifyContent: "center",
          alignItems: "center",
          marginBottom: 6,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 3,
          elevation: 5,
        },
        chatHeaderAvatarInitial: { fontSize: 20, fontWeight: "bold", color: colors.text },
        centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
        note: { color: colors.muted, fontSize: 16 },
      }),
    [colors, isDark]
  );

  // Send a message
  const handleSend = async () => {
    if (!trimmedMessage || !currentUser) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          content: trimmedMessage,
          chatSessionId: Number(chatId),
        }),
      });
      if (!response.ok) throw new Error(`Failed to send message (${response.status})`);
      setNewMessage("");
      await fetchMessages();

      // ✅ Scroll to bottom after sending
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err) {
      console.error("Send message error:", err);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={{ color: colors.text }}>Loading chat...</Text>
      </View>
    );
  }

  // ✅ Fixed layout so input bar moves above keyboard (especially on iPhone 14 Pro / iOS 18)
  return (
    <>
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["bottom", "left", "right", "top"]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        contentContainerStyle={styles.avoidingContent}
        keyboardVerticalOffset={keyboardVerticalOffset} // ✅ calibrated offset for stack header
      >
        <View style={styles.chatBody}>
          {/* ✅ Profile section at top of chat */}
          <View style={styles.chatHeader}>
            {profilePicture ? (
              <Image
                source={{
                  uri: profilePicture.startsWith("http")
                    ? profilePicture
                    : `${API_BASE_URL}${profilePicture}`,
                }}
                style={styles.chatHeaderAvatar}
              />
            ) : (
              <View style={styles.chatHeaderAvatarPlaceholder}>
                <Text style={styles.chatHeaderAvatarInitial}>
                  {name?.[0]?.toUpperCase() || "?"}
                </Text>
              </View>
            )}
          </View>

          {messages.length === 0 && (
            <View style={styles.centered}>
              <Text style={styles.note}>No prior messages.</Text>
            </View>
          )}

          <FlatList
            ref={flatListRef} // ✅ attach ref
            data={messages}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => {
              const isMine = item.senderId === currentUser?.id;
              return (
                <View style={[styles.messageRow, isMine ? { justifyContent: "flex-end" } : {}]}>
                  {!isMine && (
                    <>
                      {profilePicture ? (
                        <Image
                          source={{
                            uri: profilePicture.startsWith("http")
                              ? profilePicture
                              : `${API_BASE_URL}${profilePicture}`,
                          }}
                          style={styles.messageAvatarPlaceholder} // ✅ use placeholder style
                        />
                      ) : (
                        <View style={styles.messageAvatarPlaceholder}>
                          <Text style={styles.messageAvatarInitial}>
                            {name?.[0]?.toUpperCase() || "?"}
                          </Text>
                        </View>
                      )}
                    </>
                  )}
                  <View
                    style={[
                      styles.messageBubble,
                      isMine ? styles.myMessage : styles.theirMessage,
                    ]}
                  >
                    <Text
                      style={[
                        styles.messageText,
                        isMine ? { color: "#fff" } : { color: colors.text },
                      ]}
                    >
                      {item.content}
                    </Text>
                  </View>
                </View>
              );
            }}
            style={styles.messagesList}
            contentContainerStyle={[styles.messagesContainer, { paddingBottom: 16 }]} // ✅ breathing room
            keyboardShouldPersistTaps="handled" // ✅ keeps taps working while keyboard is open
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })} // ✅ auto-scroll when new content added
          />
        </View>

        <View style={[styles.inputContainer, { paddingBottom: 10 + insets.bottom }]}>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            placeholderTextColor={colors.muted}
            value={newMessage}
            onChangeText={setNewMessage}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            blurOnSubmit={false}
          />
          <TouchableOpacity
            onPress={handleSend}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            disabled={!canSend}
            style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
          >
            <Ionicons name="send" size={20} color={canSend ? "#fff" : colors.muted} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
    <UserOverflowMenu
      visible={menuOpen}
      onClose={() => setMenuOpen(false)}
      targetUser={{ id: Number(receiverId), name: name ?? "" }}
      onBlocked={() => {
        try { (navigation as any).goBack?.(); } catch {}
      }}
    />
    </>
  );
}
