import { Tabs } from "expo-router";
import React from "react";

export default function TabLayout() {
  return (
    <UserProvider>
      <Tabs
        screenOptions={{
          headerShown: true,
        }}
      >
        <Tabs.Screen
          name="nearby"
          options={{
            title: "Nearby",
          }}
        />
        <Tabs.Screen
          name="map"
          options={{
            title: "Map",
          }}
        />
        <Tabs.Screen
          name="messages"
          options={{
            title: "Messages",
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
          }}
        />
      </Tabs>
    </UserProvider>
  );
}
