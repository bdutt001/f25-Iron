import { Redirect } from "expo-router";
import React from "react";
import { useUser } from "@/context/UserContext";

export default function AdminReportsRoute() {
  const { currentUser } = useUser();

  if (!currentUser?.isAdmin) {
    return <Redirect href="/(tabs)/nearby" />;
  }

  return <Redirect href="/(tabs)/admin" />;
}
