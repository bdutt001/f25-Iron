import React, { useState, useCallback } from "react";
import { router } from "expo-router";
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useUser, type CurrentUser } from "../context/UserContext";
import { API_BASE_URL, fetchProfile, toCurrentUser } from "@/utils/api";
import type { ApiUser } from "@/utils/geo";
import { useAppTheme } from "../context/ThemeContext";
import { AppNotice } from "../components/ui/AppNotice";
import { AppScreen } from "@/components/layout/AppScreen";

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
  } catch {
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
  const [signupSuccessVisible, setSignupSuccessVisible] = useState(false);
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [authModalTitle, setAuthModalTitle] = useState("");
  const [authModalMessage, setAuthModalMessage] = useState("");
  const { colors, isDark } = useAppTheme();

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
      setAuthModalTitle("Backend online");
      setAuthModalMessage(data.status ?? "ok");
      setAuthModalVisible(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAuthModalTitle("Backend test failed");
      setAuthModalMessage(message);
      setAuthModalVisible(true);
    }
  };

  const handleLogin = async () => {
    const emailTrimmed = email.trim().toLowerCase();
    if (!emailTrimmed || !password) {
      setAuthModalTitle("Login");
      setAuthModalMessage("Please enter email and password.");
      setAuthModalVisible(true);
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
      setAuthModalTitle("Login failed");
      setAuthModalMessage(message);
      setAuthModalVisible(true);
    }
  };

  const handleSignup = async () => {
    const emailTrimmed = email.trim().toLowerCase();
    if (!emailTrimmed || !password) {
      setAuthModalTitle("Create Account");
      setAuthModalMessage("Please enter email and password.");
      setAuthModalVisible(true);
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
      setSignupSuccessVisible(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAuthModalTitle("Signup failed");
      setAuthModalMessage(message);
      setAuthModalVisible(true);
    }
  };

  const goToOnboarding = useCallback(() => {
    setSignupSuccessVisible(false);
    router.replace("/onboarding");
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModalVisible(false);
  }, []);

  return (
    <AppScreen scroll contentContainerStyle={styles.container}>
      <View style={styles.logoRow}>
        <Image
          source={require("../assets/images/MingleMap-title.png")}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      <View style={styles.cardContainer}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              shadowColor: isDark ? "#000" : "#0f172a",
            },
          ]}
        >
          <Text style={[styles.label, { color: colors.muted }]}>Email</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark ? "#0f172a" : "#f8fafc",
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholderTextColor={colors.muted}
          />

          <Text style={[styles.label, { color: colors.muted }]}>Password</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark ? "#0f172a" : "#f8fafc",
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            placeholder="Enter your password"
            value={password}
            onChangeText={setPassword}
            placeholderTextColor={colors.muted}
            secureTextEntry
            textContentType="password"
            autoComplete="password"
          />

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.accent }]}
            onPress={handleLogin}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>Login</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.border }]}
            onPress={handleSignup}
            accessibilityRole="button"
          >
            <Text style={[styles.secondaryText, { color: colors.text }]}>Create Account</Text>
          </TouchableOpacity>

          {__DEV__ && (
            <TouchableOpacity
              style={styles.linkBtn}
              onPress={handleTestConnection}
              accessibilityRole="button"
            >
              <Text style={[styles.linkText, { color: colors.accent }]}>Test Backend Connection</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <AppNotice
        visible={signupSuccessVisible}
        onClose={goToOnboarding}
        title="Account created"
        message="You are now logged in."
        actionLabel="Continue to onboarding"
      />
      <AppNotice
        visible={authModalVisible}
        onClose={closeAuthModal}
        title={authModalTitle || "Notice"}
        message={authModalMessage}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  logoRow: {
    alignItems: "center",
    marginBottom: 12,
  },
  logo: {
    width: 280,
    height: 100,
  },
  cardContainer: {
    width: "100%",
    alignItems: "center",
    marginTop: 8,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    padding: 18,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 6,
  },
  label: { fontSize: 13, fontWeight: "600", marginTop: 6, marginBottom: 6 },
  input: {
    borderWidth: 1,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    width: "100%",
    fontSize: 15,
  },
  primaryBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
    width: "100%",
    alignItems: "center",
  },
  primaryText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  secondaryBtn: {
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 12,
    width: "100%",
    alignItems: "center",
  },
  secondaryText: {
    fontWeight: "700",
    fontSize: 15,
  },
  linkBtn: { alignItems: "center", paddingVertical: 12 },
  linkText: { fontWeight: "700", fontSize: 14 },
});
