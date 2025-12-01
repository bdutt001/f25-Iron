import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { useAppTheme } from "../../context/ThemeContext";

export default function TabLayout() {
  const { isDark, colors } = useAppTheme();
  return (
      <Tabs
        screenOptions={{
          headerShown: true,
          headerStyle: { backgroundColor: isDark ? "#0f172a" : "#f7f8fb" },
          headerTitleStyle: { color: isDark ? "#ffffff" : "#0f172a", fontWeight: "700", fontSize: 17 },
          headerTintColor: isDark ? "#ffffff" : "#0f172a",
          headerShadowVisible: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: "#9ca3af",
          tabBarStyle: { backgroundColor: isDark ? "#0f172a" : "#ffffff", borderTopColor: isDark ? "#111827" : "#e5e7eb" },
        }}
      >
        <Tabs.Screen
          name="nearby"
          options={{
            title: "Nearby",
            tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="map"
          options={{
            title: "Map",
            tabBarIcon: ({ color, size }) => (
            <Ionicons name="map-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="messages"
          options={{
            title: "Messages",
            headerShown: false,
            tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbox-ellipses-outline" color={color} size={size} />
          ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" color={color} size={size} />
            ),
          }}
        />
      </Tabs>
  );
}
