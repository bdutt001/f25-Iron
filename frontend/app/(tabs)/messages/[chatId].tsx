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
  Keyboard,
} from "react-native";
import type { ImageStyle, TextStyle, ViewStyle } from "react-native";
import { SafeAreaView, useSafeAreaInsets, Edge } from "react-native-safe-area-context"; // ✅ modern SafeAreaView
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useHeaderHeight } from "@react-navigation/elements";
import { useFocusEffect } from "@react-navigation/native";
import { useUser } from "../../../context/UserContext";
import { Ionicons } from "@expo/vector-icons";
import UserOverflowMenu from "../../../components/UserOverflowMenu";
import { useAppTheme } from "../../../context/ThemeContext";
import { saveChatLastRead } from "@/utils/chatReadStorage";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

type Message = {
  id: number;
  content: string;
  senderId: number;
  chatSessionId: number;
  createdAt: string;
};

type HeaderTitleStyles = {
  container: ViewStyle;
  avatar: ImageStyle;
  avatarPlaceholder: ViewStyle;
  initial: TextStyle;
  name: TextStyle;
  menuButton: ViewStyle;
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
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // ✅ Add FlatList ref for auto-scroll
  const flatListRef = useRef<FlatList<Message>>(null);
  const hasNavigatedAwayRef = useRef(false);
  const trimmedMessage = newMessage.trim();
  const canSend = trimmedMessage.length > 0;
  const keyboardVerticalOffset = Platform.OS === "ios" ? headerHeight + insets.top : 0;
  const safeAreaEdges: Edge[] =
    Platform.OS === "ios" ? ["bottom", "left", "right", "top"] : ["bottom", "left", "right"];
  const shouldReturnToMessages = returnToMessages === "1" || returnToMessages === "true";
  const goToMessagesList = useCallback(() => {
    if (hasNavigatedAwayRef.current) return;
    hasNavigatedAwayRef.current = true;
    router.replace("/(tabs)/messages");
  }, []);
  const resolvedProfileImage = useMemo(() => {
    if (!profilePicture) return null;
    return profilePicture.startsWith("http") ? profilePicture : `${API_BASE_URL}${profilePicture}`;
  }, [profilePicture]);
  const receiverInitial = useMemo(() => name?.[0]?.toUpperCase() || "?", [name]);
  const headerTitleStyles = useMemo<HeaderTitleStyles>(
    () => ({
      container: { flexDirection: "row", alignItems: "center" },
      avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
      avatarPlaceholder: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: colors.card,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 10,
      },
      initial: { fontWeight: "700", color: colors.text, fontSize: 16 },
      name: { fontSize: 17, fontWeight: "600", color: colors.text },
      menuButton: { paddingHorizontal: 8, minHeight: 40, justifyContent: "center", alignItems: "center" },
    }),
    [colors]
  );

  // ✅ Simplify header — just show title + Report button
  useLayoutEffect(() => {
    if (!name) return;
    navigation.setOptions({
      headerStyle: { backgroundColor: colors.background },
      headerTitleAlign: "center",
      headerBackTitleVisible: false,
      headerStatusBarHeight: Platform.OS === "android" ? 0 : undefined,
      headerTitleContainerStyle:
        Platform.OS === "android" ? { alignItems: "center", paddingTop: 0 } : undefined,
      headerRightContainerStyle: Platform.OS === "android" ? { paddingTop: 0 } : undefined,
      headerLeftContainerStyle: Platform.OS === "android" ? { paddingTop: 0 } : undefined,
      headerTitle: () => (
        <View style={headerTitleStyles.container}>
          {resolvedProfileImage ? (
            <Image source={{ uri: resolvedProfileImage }} style={headerTitleStyles.avatar} />
          ) : (
            <View style={headerTitleStyles.avatarPlaceholder}>
              <Text style={headerTitleStyles.initial}>{receiverInitial}</Text>
            </View>
          )}
          <Text style={headerTitleStyles.name} numberOfLines={1}>
            {name}
          </Text>
        </View>
      ),
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setMenuOpen(true)}
          style={headerTitleStyles.menuButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="ellipsis-vertical" size={20} color={colors.icon} />
        </TouchableOpacity>
      ),
    });
  }, [
    navigation,
    name,
    colors.background,
    colors.icon,
    headerTitleStyles,
    resolvedProfileImage,
    receiverInitial,
  ]);

  useEffect(() => {
    if (!shouldReturnToMessages) return;
    const unsubscribe = navigation.addListener("beforeRemove", (event) => {
      if (hasNavigatedAwayRef.current) return;
      event.preventDefault();
      goToMessagesList();
    });
    return unsubscribe;
  }, [navigation, shouldReturnToMessages, goToMessagesList]);

  // Fetch messages
  const fetchMessages = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!accessToken) return;
      const showLoading = !options?.silent;
      if (showLoading) setLoading(true);
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
        if (showLoading) setLoading(false);
      }
    },
    [chatId, accessToken]
  );

  useFocusEffect(
    useCallback(() => {
      fetchMessages();
      const interval = setInterval(() => {
        fetchMessages({ silent: true });
      }, 4000);
      return () => clearInterval(interval);
    }, [fetchMessages])
  );

  useEffect(() => {
    if (!chatId || messages.length === 0) return;
    const latest = messages[messages.length - 1];
    if (!latest?.createdAt) return;
    void saveChatLastRead(String(chatId), latest.createdAt);
  }, [chatId, messages]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
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
        composerWrapper: {
          paddingHorizontal: 16,
        },
        composerSurface: {
          flexDirection: "row",
          alignItems: "flex-end",
          borderRadius: 28,
          paddingHorizontal: 16,
          paddingVertical: 10,
          backgroundColor: isDark ? colors.card : "#f4f5f7",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          shadowColor: "#000",
          shadowOpacity: isDark ? 0.25 : 0.08,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 3,
          minHeight: 52,
        },
        input: {
          flex: 1,
          fontSize: 16,
          color: colors.text,
          maxHeight: 120,
          paddingRight: 12,
          paddingVertical: Platform.OS === "ios" ? 12 : 8,
          textAlignVertical: "center",
          lineHeight: 20,
        },
        sendButton: {
          width: 42,
          height: 42,
          borderRadius: 21,
          backgroundColor: colors.accent,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOpacity: 0.2,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 },
          elevation: 4,
        },
        sendButtonDisabled: { opacity: 0.4 },
        centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
        note: { color: colors.muted, fontSize: 16 },
      }),
    [colors, isDark]
  );

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const showSubscription = Keyboard.addListener("keyboardDidShow", (event) => {
      setKeyboardHeight(Math.max(event.endCoordinates.height - insets.bottom, 0));
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [insets.bottom]);

  const keyboardBehavior = Platform.OS === "ios" ? "padding" : undefined;
  const keyboardInset = Platform.OS === "android" ? keyboardHeight : 0;
  const composerBottomInset = Math.max(insets.bottom, 8) + 8 + keyboardInset;
  const listBottomPadding = 16 + keyboardInset;

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

  // ✅ Fixed layout so input bar moves above the keyboard on all devices
  return (
    <>
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={safeAreaEdges}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={keyboardBehavior}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        <View style={styles.chatBody}>
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
                      {resolvedProfileImage ? (
                        <Image source={{ uri: resolvedProfileImage }} style={styles.messageAvatarPlaceholder} />
                      ) : (
                        <View style={styles.messageAvatarPlaceholder}>
                          <Text style={styles.messageAvatarInitial}>{receiverInitial}</Text>
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
            contentContainerStyle={[styles.messagesContainer, { paddingBottom: listBottomPadding }]} // ✅ breathing room
            keyboardShouldPersistTaps="handled" // ✅ keeps taps working while keyboard is open
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })} // ✅ auto-scroll when new content added
          />
        </View>

        <View style={[styles.composerWrapper, { paddingBottom: composerBottomInset }]}>
          <View style={styles.composerSurface}>
            <TextInput
              style={styles.input}
              placeholder="Type a message..."
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
              style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
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

