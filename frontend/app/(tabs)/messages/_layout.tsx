import { Stack } from "expo-router";
import { useAppTheme } from "../../../context/ThemeContext";

export default function MessagesLayout() {
  const { isDark } = useAppTheme();
  const headerBaseStyle = { backgroundColor: isDark ? "#0f172a" : "#f7f8fb" };
  const headerTitleStyle = { color: isDark ? "#ffffff" : "#0f172a", fontWeight: "700", fontSize: 17 };
  const headerTintColor = isDark ? "#ffffff" : "#0f172a";

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: "Messages",
          headerShown: true,
          headerShadowVisible: false,
          headerStyle: headerBaseStyle,
          headerTitleStyle,
          headerTintColor,
          headerTitleAlign: "left",
          headerBackTitleVisible: false,
        }}
      />
      <Stack.Screen
        name="[chatId]"
        options={{
          title: "Chat",
          headerShown: true,
          headerShadowVisible: false,
          headerStyle: headerBaseStyle,
          headerTitleStyle,
          headerTintColor,
          headerTitleAlign: "left",
          headerBackTitleVisible: false,
        }}
      />
    </Stack>
  );
}
