import { router } from "expo-router";
import { Alert, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useUser } from "../context/UserContext";

// Ensure fallback includes /api
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000/api";

type HealthResponse = {
  status?: string;
};

export default function LoginScreen() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const { setCurrentUser } = useUser();

  const handleTestConnection = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}`);
      if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
      }

      const data = (await response.json()) as HealthResponse;
      Alert.alert("Backend online", data.status ?? "ok");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      Alert.alert("Backend test failed", message);
    }
  };

  const handleLogin = async () => {
    const emailTrimmed = email.trim().toLowerCase();
    if (!emailTrimmed || !password) {
      Alert.alert("Login", "Please enter email and password");
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailTrimmed, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Login failed (${res.status})`);
      }
      const user = await res.json();
      setCurrentUser(user);
      router.replace("/(tabs)/profile");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      Alert.alert("Login failed", message);
    }
  };

  const handleSignup = async () => {
    const emailTrimmed = email.trim().toLowerCase();
    if (!emailTrimmed || !password) {
      Alert.alert("Create Account", "Please enter email and password");
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailTrimmed, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Signup failed (${res.status})`);
      }
      const user = await res.json();
      setCurrentUser(user);
      Alert.alert("Account created", "You are now logged in.");
      router.replace("/(tabs)/profile");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      Alert.alert("Signup failed", message);
    }
  };

  return (
    <View style={styles.container}>
      {/* Logo */}
      <Image 
        source={require("../assets/images/MingleMap-title.png")}
        style={styles.logo}
        resizeMode="contain"
      />

      {/* Input fields */}
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#888"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        placeholderTextColor="#888"
        value={password}
        onChangeText={setPassword}
        textContentType="password"
        autoComplete="password"
      />

      {/* Primary button (Login) */}
      <TouchableOpacity style={styles.primaryBtn} onPress={handleLogin}>
        <Text style={styles.primaryText}>Login</Text>
      </TouchableOpacity>

      {/* Secondary button (Go to Signup) */}
      <TouchableOpacity style={styles.secondaryBtn} onPress={handleSignup}>
        <Text style={styles.secondaryText}>Create Account</Text>
      </TouchableOpacity>

      {__DEV__ && (
        <TouchableOpacity style={styles.secondaryBtn} onPress={handleTestConnection}>
          <Text style={styles.secondaryText}>Test Backend Connection</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    justifyContent: "center", 
    alignItems: "center", 
    padding: 20, 
    backgroundColor: "#121212" 
  },
  logo: {
    width: 280,
    height: 100,
    marginBottom: 30,
  },
  input: { 
    borderWidth: 1, 
    borderColor: "#ccc", 
    marginBottom: 12, 
    padding: 10, 
    borderRadius: 6, 
    backgroundColor: "#fff", 
    width: "100%", 
    color: "#000"
  },
  primaryBtn: {
    backgroundColor: "#007BFF", // blue
    paddingVertical: 12,
    borderRadius: 6,
    marginTop: 10,
    width: "100%",
    alignItems: "center",
  },
  primaryText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  secondaryBtn: {
    borderColor: "#ccc",
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 6,
    marginTop: 10,
    width: "100%",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
  },
  secondaryText: {
    color: "#333",
    fontSize: 16,
  },
});
