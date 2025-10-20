import React, { useState, useLayoutEffect, useEffect, useCallback } from "react";
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
} from "react-native";
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
  const { chatId, name, receiverId } = useLocalSearchParams<{ 
    chatId: string;
    name?: string;
    receiverId?: string;
  }>();
  const navigation = useNavigation();
  const { currentUser, accessToken } = useUser();

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useLayoutEffect(() => {
    if (name) {
      navigation.setOptions({
        title: name,
        headerRight: () => (
          <ReportButton
            reportedUserId={Number(chatId)}
            reportedUserName={name ?? "Unknown"}
            size="small"
            onReportSuccess={() => console.log(`Reported user ${name}`)}
          />
        ),
      });
    }
  }, [navigation, name, chatId, currentUser]);

  // Fetch messages from backend
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

      setMessages(data); // Will be empty array if no messages
    } catch (err) {
      console.error("Fetch messages error:", err);
      //setMessages([]); // Just show empty messages, don't block typing
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

      if (!response.ok) {
        throw new Error(`Failed to send message (${response.status})`);
      }

      setNewMessage("");
      await fetchMessages(); // Refresh messages from backend
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {messages.length === 0 && (
        <View style={styles.centered}>
          <Text style={styles.note}>No prior messages.</Text>
        </View>
      )}

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View
            style={[
              styles.messageBubble,
              item.senderId === currentUser?.id ? styles.myMessage : styles.theirMessage,
            ]}
          >
            <Text
              style={[
                styles.messageText,
                item.senderId === currentUser?.id ? { color: "white" } : { color: "black" },
              ]}
            >
              {item.content}
            </Text>
          </View>
        )}
        contentContainerStyle={styles.messagesContainer}
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          value={newMessage}
          onChangeText={setNewMessage}
          onSubmitEditing={handleSend}
        />
        <Button title="Send" onPress={handleSend} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  messagesContainer: { padding: 10, flexGrow: 1 },
  messageBubble: {
    padding: 10,
    borderRadius: 12,
    marginVertical: 5,
    maxWidth: "80%",
  },
  myMessage: {
    alignSelf: "flex-end",
    backgroundColor: "#007AFF",
  },
  theirMessage: {
    alignSelf: "flex-start",
    backgroundColor: "#E5E5EA",
  },
  messageText: { fontSize: 16 },
  inputContainer: {
    flexDirection: "row",
    padding: 10,
    borderTopWidth: 1,
    borderColor: "#ccc",
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 20,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  reportContainer: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  note: {
    color: "#555",
    fontSize: 16,
  },
});
