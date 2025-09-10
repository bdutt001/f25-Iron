import { useRouter } from "expo-router";
import { Button, StyleSheet, Text, View } from "react-native";
import { useUser } from "../context/UserContext";

export default function ProfileScreen() {
  const router = useRouter();
  const { status } = useUser(); // ✅ shared state

  const handleLogout = () => {
    // Later → clear user session here
    router.replace("/login");
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>User Profile</Text>
        <Text style={styles.label}>Name:</Text>
        <Text style={styles.value}>Ahmer Shafiq</Text>
        <Text style={styles.label}>Email:</Text>
        <Text style={styles.value}>ashaf007@odu.edu</Text>
        <Text style={styles.label}>Status:</Text>
        <Text style={styles.value}>{status}</Text>
      </View>

      <View style={styles.logout}>
        <Button title="Logout" onPress={handleLogout} color="#d9534f" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f2f2f2",
    padding: 20,
  },
  card: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 10,
    width: "90%",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 15,
    textAlign: "center",
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 10,
  },
  value: {
    fontSize: 16,
    color: "#333",
  },
  logout: {
    width: "90%",
  },
});
