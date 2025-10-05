// import { useLocalSearchParams, useNavigation } from "expo-router";
// import React, { useLayoutEffect, useState } from "react";
// import {
//   Button,
//   FlatList,
//   KeyboardAvoidingView,
//   Platform,
//   StyleSheet,
//   Text,
//   TextInput,
//   View,
// } from "react-native";

// export default function DirectMessagingScreen() {
//   const { chatId, name } = useLocalSearchParams<{ chatId: string; name: string }>();
//   const navigation = useNavigation();
  
//   // Dynamically set header title
//   useLayoutEffect(() => {
//     if (name) {
//       navigation.setOptions({ title: name });
//     }
//   }, [navigation, name]);

//   const [messages, setMessages] = useState([
//     { id: "1", sender: name || "Unknown", text: "Hey, how’s it going?" },
//     { id: "2", sender: "You", text: "Pretty good, working on a project." },
//   ]);
//   const [newMessage, setNewMessage] = useState("");

//   const handleSend = () => {
//     if (!newMessage.trim()) return;
//     setMessages([
//       ...messages,
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
//   container: { flex: 1, backgroundColor: "#f5f5f5" },
//   messagesContainer: { padding: 10 },
//   messageBubble: {
//     padding: 10,
//     marginVertical: 4,
//     borderRadius: 12,
//     maxWidth: "70%",
//   },
//   myMessage: {
//     backgroundColor: "#007aff",
//     alignSelf: "flex-end",
//   },
//   theirMessage: {
//     backgroundColor: "#e5e5ea",
//     alignSelf: "flex-start",
//   },
//   messageText: { fontSize: 16 },
//   inputContainer: {
//     flexDirection: "row",
//     padding: 10,
//     borderTopWidth: 1,
//     borderTopColor: "#ddd",
//     backgroundColor: "white",
//     alignItems: "center",
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
import React, { useState, useLayoutEffect } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  View,
  FlatList,
  Text,
  TextInput,
  Button,
  StyleSheet,
} from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";

export default function ChatScreen() {
  const { chatId, name } = useLocalSearchParams<{ chatId: string; name: string }>();
  const navigation = useNavigation();

  useLayoutEffect(() => {
    if (name) navigation.setOptions({ title: name });
  }, [name]);

  const [messages, setMessages] = useState([
    { id: "1", sender: "You", text: "Hey!" },
    { id: "2", sender: name || "User", text: "Hi there!" },
  ]);

  const [newMessage, setNewMessage] = useState("");

  const handleSend = () => {
    if (!newMessage.trim()) return;
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), sender: "You", text: newMessage },
    ]);
    setNewMessage("");
  };

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
              item.sender === "You" ? styles.myMessage : styles.theirMessage,
            ]}
          >
            <Text
              style={[
                styles.messageText,
                item.sender === "You" ? { color: "white" } : { color: "black" },
              ]}
            >
              {item.text}
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
});
