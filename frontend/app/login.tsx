import React, { useState } from "react";
import { router } from "expo-router";
import { Alert, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useUser, type CurrentUser } from "../context/UserContext";
import { API_BASE_URL, fetchProfile, toCurrentUser } from "@/utils/api";
import type { ApiUser } from "@/utils/geo";

type AuthSuccess = {
  tokenType?: string;
  accessToken: string;
  refreshToken?: string | null;
  user: Record<string, unknown>;
};

type ErrorResponse = { error: string };

type HealthResponse = {
  status?: string;
};

const isErrorResponse = (v: unknown): v is ErrorResponse =>
  !!v && typeof (v as any).error === "string";

const isAuthSuccess = (v: unknown): v is AuthSuccess =>
  !!v && typeof (v as any).accessToken === "string" && typeof (v as any).user === "object";

const toUserOrFallback = (value: unknown): CurrentUser => {
  try {
    return toCurrentUser((value ?? {}) as Record<string, unknown>);
  } catch (error) {
    return {
      id: 0,
      email: "",
      interestTags: [],
    };
  }
};

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { setCurrentUser, setTokens, setPrefetchedUsers } = useUser();

  const preloadVisibleUsers = async (accessToken: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/users`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new Error(`Failed to preload users (${response.status})`);
      }

      const data = (await response.json()) as ApiUser[];
      setPrefetchedUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.warn("Failed to preload nearby users", error);
      setPrefetchedUsers(null);
    }
  };

  const loadProfile = async (accessToken: string, fallback: Record<string, unknown>) => {
    try {
      const profile = await fetchProfile(accessToken);
      setCurrentUser(profile);
      await preloadVisibleUsers(accessToken);
    } catch (error) {
      console.warn("Failed to load profile after login", error);
      setCurrentUser(toCurrentUser(fallback));
      await preloadVisibleUsers(accessToken);
    }
  };

  const handleTestConnection = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api`);
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
        const maybe = (await res.json().catch(() => null)) as unknown;
        if (isErrorResponse(maybe)) throw new Error(maybe.error);
        throw new Error(`Login failed (${res.status})`);
      }
      const json = (await res.json()) as unknown;
      if (isAuthSuccess(json)) {
        setTokens({ accessToken: json.accessToken, refreshToken: json.refreshToken ?? null });
        await loadProfile(json.accessToken, json.user);
      } else {
        setCurrentUser(toUserOrFallback(json));
      }
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
      // Backend expects username, email, password at /auth/register
      // Derive a simple username from email local-part if none provided.
      const localPart = emailTrimmed.split("@")[0] || "user";
      const username = `${localPart}`;
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email: emailTrimmed, password }),
      });
      if (!res.ok) {
        const maybe = (await res.json().catch(() => null)) as unknown;
        if (isErrorResponse(maybe)) throw new Error(maybe.error);
        throw new Error(`Signup failed (${res.status})`);
      }
      const json = (await res.json()) as unknown;
      if (isAuthSuccess(json)) {
        setTokens({ accessToken: json.accessToken, refreshToken: json.refreshToken ?? null });
        await loadProfile(json.accessToken, json.user);
      } else {
        setCurrentUser(toUserOrFallback(json));
      }
      Alert.alert("Account created", "You are now logged in.");
      router.replace("/onboarding");
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
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        placeholderTextColor="#888"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        placeholderTextColor="#888"
        secureTextEntry
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
    backgroundColor: "#121212",
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
    color: "#000",
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

