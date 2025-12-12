import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import React from "react";
import { useUser } from "@/context/UserContext";
import { useAppTheme } from "@/context/ThemeContext";
import { useTabHeaderOptions } from "@/hooks/useTabHeaderOptions";

export default function AdminLayout() {
  const { currentUser } = useUser();
  const { colors, isDark } = useAppTheme();
  const headerOptions = useTabHeaderOptions();

  if (!currentUser?.isAdmin) {
    return <Redirect href="/(tabs)/nearby" />;
  }

  return (
    <Tabs
      screenOptions={{
        ...headerOptions,
        headerShown: true,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: "#9ca3af",
        tabBarStyle: {
          backgroundColor: isDark ? "#0f172a" : "#ffffff",
          borderTopColor: isDark ? "#111827" : "#e5e7eb",
        },
      }}
    >
      <Tabs.Screen
        name="dashboard/index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="speedometer-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen name="index" options={{ href: null, title: "Admin Home" }} />
      <Tabs.Screen
        name="reports/index"
        options={{
          title: "Reports",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="alert-circle-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="banned/index"
        options={{
          title: "Banned",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-remove-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings/index"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports/[reportId]"
        options={{ href: null, title: "Report Detail" }}
      />
    </Tabs>
  );
}
