import { useRouter } from "expo-router";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const conversations = [
  { id: "1", name: "Alice", lastMessage: "Hey, how’s it going?" },
  { id: "2", name: "Bob", lastMessage: "Let’s catch up later" },
];

export default function MessagesOverviewScreen() {
  const router = useRouter();

  return (
    <FlatList
      data={conversations}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.row}
          onPress={() => router.push(`/messages/${item.id}?name=${item.name}`)}
        >
          <View style={styles.avatar} />
          <View>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.lastMessage}>{item.lastMessage}</Text>
          </View>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    alignItems: "center",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ccc",
    marginRight: 12,
  },
  name: { fontSize: 16, fontWeight: "bold" },
  lastMessage: { fontSize: 14, color: "gray" },
});
