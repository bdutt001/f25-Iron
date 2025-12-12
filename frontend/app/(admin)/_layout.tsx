import { Redirect, Stack } from "expo-router";
import React from "react";
import { useUser } from "@/context/UserContext";

export default function AdminLayout() {
  const { currentUser } = useUser();

  if (!currentUser?.isAdmin) {
    return <Redirect href="/(tabs)/nearby" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="reports/index" />
      <Stack.Screen name="reports/[reportId]" />
    </Stack>
  );
}
