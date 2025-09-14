import { router } from "expo-router";
import { Button, StyleSheet, Text, TextInput, View } from "react-native";

export default function LoginScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Login</Text>
      <TextInput style={styles.input} placeholder="Email" />
      <TextInput style={styles.input} placeholder="Password" secureTextEntry />

      {/* After login, go straight to the Profile tab */}
      <Button title="Login" onPress={() => router.replace("/profile")} />

      {/* Allow user to navigate to Signup screen */}
      <Button title="Go to Signup" onPress={() => router.push("/signup")} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 20 },
  title: { fontSize: 24, marginBottom: 20, textAlign: "center" },
  input: { borderWidth: 1, marginBottom: 12, padding: 8, borderRadius: 6 },
});
