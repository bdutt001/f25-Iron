import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { useTabHeaderOptions } from "../../hooks/useTabHeaderOptions";
import { useAppTheme } from "../../context/ThemeContext";

export default function TabLayout() {
  const { isDark, colors } = useAppTheme();
  const headerOptions = useTabHeaderOptions();
  return (
    
      <Tabs
        screenOptions={{
          ...headerOptions,
          headerShown: true,
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
          // example in a tabs layout
          
          <Tabs.Screen
            name="AdminReportsScreen"
            options={{
              title: "Admin",
              
              /* Will deal with isAdmin parameter later */
              //href: user?.isAdmin ? "/(tabs)/AdminReportsScreen" : null, // hides tab if not admin
            }}
          />
      </Tabs>
  );
}
