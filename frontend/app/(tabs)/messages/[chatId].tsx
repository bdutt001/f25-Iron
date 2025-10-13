// import React, { useState, useLayoutEffect } from "react";
// import {
//   KeyboardAvoidingView,
//   Platform,
//   View,
//   FlatList,
//   Text,
//   TextInput,
//   Button,
//   StyleSheet,
// } from "react-native";
// import { useLocalSearchParams, useNavigation } from "expo-router";

// export default function ChatScreen() {
//   const { chatId, name } = useLocalSearchParams<{ chatId: string; name: string }>();
//   const navigation = useNavigation();

//   useLayoutEffect(() => {
//     if (name) navigation.setOptions({ title: name });
//   }, [name]);

//   const [messages, setMessages] = useState([
//     { id: "1", sender: "You", text: "Hey!" },
//     { id: "2", sender: name || "User", text: "Hi there!" },
//   ]);

//   const [newMessage, setNewMessage] = useState("");

//   const handleSend = () => {
//     if (!newMessage.trim()) return;
//     setMessages((prev) => [
//       ...prev,
//       { id: Date.now().toString(), sender: "You", text: newMessage },
//     ]);
//     setNewMessage("");
//   };

//   return (
//     <KeyboardAvoidingView
//       style={styles.container}
//       behavior={Platform.OS === "ios" ? "padding" : undefined}
//     >
//       <FlatList
//         data={messages}
//         keyExtractor={(item) => item.id}
//         renderItem={({ item }) => (
//           <View
//             style={[
//               styles.messageBubble,
//               item.sender === "You" ? styles.myMessage : styles.theirMessage,
//             ]}
//           >
//             <Text
//               style={[
//                 styles.messageText,
//                 item.sender === "You" ? { color: "white" } : { color: "black" },
//               ]}
//             >
//               {item.text}
//             </Text>
//           </View>
//         )}
//         contentContainerStyle={styles.messagesContainer}
//       />

//       <View style={styles.inputContainer}>
//         <TextInput
//           style={styles.input}
//           placeholder="Type a message..."
//           value={newMessage}
//           onChangeText={setNewMessage}
//           onSubmitEditing={handleSend}
//         />
//         <Button title="Send" onPress={handleSend} />
//       </View>
//     </KeyboardAvoidingView>
//   );
// }

// const styles = StyleSheet.create({
//   container: { flex: 1 },
//   messagesContainer: { padding: 10 },
//   messageBubble: {
//     padding: 10,
//     borderRadius: 12,
//     marginVertical: 5,
//     maxWidth: "80%",
//   },
//   myMessage: {
//     alignSelf: "flex-end",
//     backgroundColor: "#007AFF",
//   },
//   theirMessage: {
//     alignSelf: "flex-start",
//     backgroundColor: "#E5E5EA",
//   },
//   messageText: { fontSize: 16 },
//   inputContainer: {
//     flexDirection: "row",
//     padding: 10,
//     borderTopWidth: 1,
//     borderColor: "#ccc",
//   },
//   input: {
//     flex: 1,
//     borderWidth: 1,
//     borderColor: "#ccc",
//     borderRadius: 20,
//     paddingHorizontal: 12,
//     marginRight: 8,
//   },
// });
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

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

type Message = {
  id: string;
  content: string;
  sendentId: string;
  recventId: string;
  createdAt: string;
};

export default function ChatScreen() {
  const { chatId, name } = useLocalSearchParams<{ chatId: string; name: string }>();
  const navigation = useNavigation();
  const { user } = useUser(); // assuming context provides current logged-in user

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (name) navigation.setOptions({ title: name });
  }, [name]);

  // ✅ Fetch messages from your backend
  const fetchMessages = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/messages/${chatId}`);
      if (!response.ok) throw new Error(`Failed to load messages (${response.status})`);
      const data = (await response.json()) as Message[];
      setMessages(data);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // ✅ Send message to database
  const handleSend = async () => {
    if (!newMessage.trim() || !user) return;

    const tempMessage: Message = {
      id: Date.now().toString(),
      content: newMessage,
      sendentId: user.id,
      recventId: chatId,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempMessage]);
    setNewMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newMessage,
          sendentId: user.id,
          recventId: chatId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send message (${response.status})`);
      }

      // Optionally refresh from DB for consistent IDs/timestamps
      await fetchMessages();
    } catch (err) {
      console.error(err);
      setError("Failed to send message");
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

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
        <Button title="Retry" onPress={fetchMessages} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View
            style={[
              styles.messageBubble,
              item.sendentId === user?.id ? styles.myMessage : styles.theirMessage,
            ]}
          >
            <Text
              style={[
                styles.messageText,
                item.sendentId === user?.id ? { color: "white" } : { color: "black" },
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
  messagesContainer: { padding: 10 },
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
  error: {
    color: "#c00",
    marginBottom: 12,
  },
});

