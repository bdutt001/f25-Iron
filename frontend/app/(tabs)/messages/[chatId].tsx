import React, { useState, useLayoutEffect, useEffect, useCallback, useRef } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  View,
  FlatList,
  Text,
  TextInput,
  Button,
  StyleSheet,
  ActivityIndicator,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context"; // ✅ modern SafeAreaView
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useUser } from "../../../context/UserContext";
import ReportButton from "../../../components/ReportButton";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

type Message = {
  id: number;
  content: string;
  senderId: number;
  chatSessionId: number;
  createdAt: string;
};

export default function ChatScreen() {
  const { chatId, name, receiverId, profilePicture } = useLocalSearchParams<{
    chatId: string;
    name?: string;
    receiverId?: string;
    profilePicture?: string;
  }>();
  const navigation = useNavigation();
  const { currentUser, accessToken } = useUser();

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);

  // ✅ Add FlatList ref for auto-scroll
  const flatListRef = useRef<FlatList<Message>>(null);

  // ✅ Simplify header — just show title + Report button
  useLayoutEffect(() => {
    if (name) {
      navigation.setOptions({
        title: name,
        headerRight: () => (
          <ReportButton
            reportedUserId={Number(receiverId)} // Using receiverId instead of chatId — chatId represents the conversation, not the actual user being reported
            reportedUserName={name ?? "Unknown"}
            size="small"
            onReportSuccess={() => console.log(`Reported user ${name}`)}
          />
        ),
      });
    }
  }, [navigation, name, chatId, receiverId]);

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

  // Send a message
  const handleSend = async () => {
    if (!newMessage.trim() || !currentUser) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          content: newMessage,
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
        <ActivityIndicator size="large" color="#007BFF" />
        <Text>Loading chat...</Text>
      </View>
    );
  }

  // ✅ Fixed layout so input bar moves above keyboard (especially on iPhone 14 Pro / iOS 18)
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["bottom", "left", "right"]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 150 : 0} // ✅ calibrated offset for iPhone 14 Pro
      >
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
                      isMine ? { color: "white" } : { color: "black" },
                    ]}
                  >
                    {item.content}
                  </Text>
                </View>
              </View>
            );
          }}
          contentContainerStyle={[styles.messagesContainer, { paddingBottom: 80 }]} // ✅ space for input
          keyboardShouldPersistTaps="handled" // ✅ keeps taps working while keyboard is open
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })} // ✅ auto-scroll when new content added
        />

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            value={newMessage}
            onChangeText={setNewMessage}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            blurOnSubmit={false}
          />
          <Button title="Send" onPress={handleSend} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  messagesContainer: { padding: 10, flexGrow: 1 },
  messageRow: { flexDirection: "row", alignItems: "flex-end", marginVertical: 4 },
  messageBubble: { padding: 10, borderRadius: 12, maxWidth: "75%" },
  myMessage: { alignSelf: "flex-end", backgroundColor: "#007AFF" },
  theirMessage: { alignSelf: "flex-start", backgroundColor: "#E5E5EA" },
  messageText: { fontSize: 16 },

  // ✅ Reuse placeholder for both avatar and image case
  messageAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#ddd",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  messageAvatarInitial: { fontSize: 16, fontWeight: "bold", color: "#555" },

  inputContainer: {
    flexDirection: "row",
    padding: 10,
    borderTopWidth: 1,
    borderColor: "#ccc",
    backgroundColor: "#fff", // ✅ keeps visible above keyboard
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 20,
    paddingHorizontal: 12,
    marginRight: 8,
  },

  /* ✅ New profile section inside chat */
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
    backgroundColor: "#ddd",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 5,
  },
  chatHeaderAvatarInitial: { fontSize: 20, fontWeight: "bold", color: "#555" },

  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  note: { color: "#555", fontSize: 16 },
});
