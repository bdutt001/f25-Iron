import { Tabs } from "expo-router";
import React from "react";
import { UserProvider } from "../../context/UserContext";

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
          name="profile"
          options={{
            title: "Profile",
          }}
        />
      </Tabs>
    </UserProvider>
  );
}
