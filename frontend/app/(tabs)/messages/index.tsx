// import { useRouter } from "expo-router";
// import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";

// const conversations = [
//   { id: "1", name: "Alice", lastMessage: "Hey, how’s it going?" },
//   { id: "2", name: "Bob", lastMessage: "Let’s catch up later" },
// ];

// export default function MessagesOverviewScreen() {
//   const router = useRouter();

//   return (
//     <FlatList
//       data={conversations}
//       keyExtractor={(item) => item.id}
//       renderItem={({ item }) => (
//         <TouchableOpacity
//           style={styles.row}
//           onPress={() =>
//             router.push({
//               pathname: "/messages/[chatId]", // <-- use the dynamic route name
//               params: { chatId: item.id, name: item.name }, // pass your params here
//             })
//           }
//         >
//           <View style={styles.avatar} />
//           <View>
//             <Text style={styles.name}>{item.name}</Text>
//             <Text style={styles.lastMessage}>{item.lastMessage}</Text>
//           </View>
//         </TouchableOpacity>
//       )}
//     />
//   );
// }

// const styles = StyleSheet.create({
//   row: {
//     flexDirection: "row",
//     padding: 16,
//     borderBottomWidth: 1,
//     borderBottomColor: "#eee",
//     alignItems: "center",
//   },
//   avatar: {
//     width: 40,
//     height: 40,
//     borderRadius: 20,
//     backgroundColor: "#ccc",
//     marginRight: 12,
//   },
//   name: { fontSize: 16, fontWeight: "bold" },
//   lastMessage: { fontSize: 14, color: "gray" },
// });
import { View, Text, FlatList, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";

const conversations = [
  //backend connection here
  { id: "1", name: "Alice" },
  { id: "2", name: "Bob" },
  { id: "3", name: "Charlie" },
];

export default function MessagesScreen() {
  return (
    <View style={styles.container}>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            style={styles.chatItem}
            onPress={() =>
              router.push({
                pathname: "/(tabs)/messages/[chatId]",
                params: { chatId: item.id, name: item.name },
              })
            }
          >
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.preview}>Tap to chat</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  chatItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
  },
  name: { fontWeight: "bold", fontSize: 16 },
  preview: { color: "gray" },
});
