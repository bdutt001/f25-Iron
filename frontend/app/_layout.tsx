import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { UserProvider } from "../context/UserContext";
import { ThemeProvider as AppThemeProvider, useAppTheme } from "../context/ThemeContext";
import { ThemeProvider } from "@react-navigation/native";

function RootStack() {
  const { navigationTheme, statusBarStyle } = useAppTheme();

  return (
    <ThemeProvider value={navigationTheme}>
      <UserProvider>
        <Stack>
          {/* Index now redirects to login */}
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen
            name="login"
            options={{
              title: "Login",
              headerBackVisible: false, // 🚫 hide back arrow
              gestureEnabled: false,    // 🚫 disable swipe-back on iOS
            }}
          />
          <Stack.Screen name="signup" options={{ title: "Signup" }} />
          <Stack.Screen name="onboarding" options={{ title: "Set up your profile" }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" />
        </Stack>
      </UserProvider>
      <StatusBar style={statusBarStyle} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  if (!loaded) {
    return null; // wait until font is loaded
  }

  return (
    <AppThemeProvider>
      <RootStack />
    </AppThemeProvider>
  );
}
