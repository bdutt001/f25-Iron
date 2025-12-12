import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import React from "react";
import { useTabHeaderOptions } from "../../hooks/useTabHeaderOptions";
import { useAppTheme } from "../../context/ThemeContext";
import { useUser } from "../../context/UserContext";

export default function TabLayout() {
  const { isDark, colors } = useAppTheme();
  const headerOptions = useTabHeaderOptions();
  const { currentUser } = useUser();
  const isAdmin = !!currentUser?.isAdmin;

  if (isAdmin) {
    return <Redirect href="/(admin)" />;
  }

  return (
    <Tabs
      screenOptions={{
        ...headerOptions,
        headerShown: true,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: "#9ca3af",
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: isDark ? "#0f172a" : "#ffffff",
          borderTopColor: isDark ? "#111827" : "#e5e7eb",
        },
      }}
    >
      <Tabs.Screen
        name="nearby"
        options={{
          title: "Nearby",
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: "Map",
          tabBarIcon: ({ color, size }) => <Ionicons name="map-outline" color={color} size={size} />,
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
