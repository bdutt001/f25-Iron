import { Stack } from "expo-router";
import React from "react";
import { useTabHeaderOptions } from "@/hooks/useTabHeaderOptions";

export default function AdminLayout() {
  const headerOptions = useTabHeaderOptions();

  return (
    <Stack
      screenOptions={{
        ...headerOptions,
        headerBackTitleVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: "Reports" }} />
      <Stack.Screen name="[reportId]" options={{ title: "Report Detail" }} />
    </Stack>
  );
}
