import { Tabs } from "expo-router";
import React, { useState } from "react";
import { Button, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { UserProvider, useUser } from "../context/UserContext";

export default function DirectMessagingScreen() {
  const [messages, setMessages] = useState([
    { id: "1", sender: "Alice", text: "Hey, how’s it going?" },
    { id: "2", sender: "You", text: "Pretty good, working on a project." },
  ]);
  const [newMessage, setNewMessage] = useState("");

  // Example of using shared context (like your MapScreen did)
  const { status } = useUser();

  const handleSend = () => {
    if (!newMessage.trim()) return;
    setMessages([
      ...messages,
      { id: Date.now().toString(), sender: "You", text: newMessage },
    ]);
    setNewMessage("");
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerText}>Chat with Alice</Text>
        <Text style={styles.subHeader}>Status: {status}</Text>
      </View>

      {/* Messages */}
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
            <Text style={styles.messageText}>{item.text}</Text>
          </View>
        )}
        contentContainerStyle={styles.messagesContainer}
      />

      {/* Input */}
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
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    backgroundColor: "white",
  },
  headerText: { fontSize: 18, fontWeight: "bold" },
  subHeader: { fontSize: 14, color: "gray" },

  messagesContainer: { padding: 10 },
  messageBubble: {
    padding: 10,
    marginVertical: 4,
    borderRadius: 12,
    maxWidth: "70%",
  },
  myMessage: {
    backgroundColor: "#007aff",
    alignSelf: "flex-end",
  },
  theirMessage: {
    backgroundColor: "#424244ff",
    alignSelf: "flex-start",
  },
  messageText: {
    color: "white",
  },

  inputContainer: {
    flexDirection: "row",
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: "#ddd",
    backgroundColor: "white",
    alignItems: "center",
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