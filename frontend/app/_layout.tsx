import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import React from "react";
import { ThemeProvider } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { UserProvider, useUser } from "../context/UserContext";
import { ThemeProvider as AppThemeProvider, useAppTheme } from "../context/ThemeContext";

function RootNavigator() {
  const { navigationTheme, statusBarStyle } = useAppTheme();
  const { currentUser, authStatus, isInitialized } = useUser();

  const isAdmin = !!currentUser?.isAdmin;
  const isChecking = authStatus === "checking" || !isInitialized;

  if (isChecking) return null;

  return (
    <ThemeProvider value={navigationTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen
          name="login"
          options={{
            title: "Login",
            headerBackVisible: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen name="signup" options={{ title: "Signup" }} />
        <Stack.Screen name="onboarding" options={{ title: "Set up your profile" }} />
        {isAdmin ? (
          <Stack.Screen name="(admin)" options={{ headerShown: false }} />
        ) : (
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        )}
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style={statusBarStyle} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  if (!loaded) return null;

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <AppThemeProvider>
          <UserProvider>
            <RootNavigator />
          </UserProvider>
        </AppThemeProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
