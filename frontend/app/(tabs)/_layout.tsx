import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { useUser } from "../../context/UserContext";

export default function TabLayout() {
  const { user } = useUser();
  return (
    
      <Tabs
        screenOptions={{
          headerShown: true,
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
