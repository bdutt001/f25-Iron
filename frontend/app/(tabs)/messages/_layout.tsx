import { Stack } from "expo-router";
import { useTabHeaderOptions } from "../../../hooks/useTabHeaderOptions";

export default function MessagesLayout() {
  const headerOptions = useTabHeaderOptions();

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: "Messages",
          headerShown: true,
          ...headerOptions,
          headerTitleAlign: "left",
          headerBackVisible: false,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="[chatId]"
        options={{
          title: "Chat",
          headerShown: true,
          ...headerOptions,
          headerTitleAlign: "left",
        }}
      />
    </Stack>
  );
}
