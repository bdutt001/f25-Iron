// app/(tabs)/AdminReportsScreen.tsx
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { API_BASE_URL } from "@/utils/api";
import { useUser } from "@/context/UserContext";

type Report = {
  id: string;
  reason: string;
  description: string;
  createdAt: string;
  reporter?: { email: string | null };
  reported?: { email: string | null };
  severity ?: string;
};

export default function AdminReportsScreen({ navigation }: any) {
  const { accessToken } = useUser(); // only need this from context

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/reports`, {
        // if your endpoint is protected, uncomment this:
         headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed with ${res.status}`);
      }

      const data: Report[] = await res.json();
      setReports(data);
    } catch (err: any) {
      console.error("Failed to load reports:", err);
      setError(err.message || "Failed to load reports");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchReports();
  };

  if (loading && !refreshing) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
        <Text>Loading reports…</Text>
      </View>
    );
  }

  if (error && reports.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 16,
        }}
      >
        <Text style={{ marginBottom: 8 }}>Error: {error}</Text>
        <TouchableOpacity onPress={fetchReports}>
          <Text style={{ textDecorationLine: "underline" }}>Tap to retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      data={reports}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      renderItem={({ item }) => (
        <View
          style={{
            padding: 16,
            borderBottomWidth: 1,
            borderBottomColor: "#ddd",
          }}
        >
          <Text style={{ fontWeight: "bold" }}>
            Reported: {item.reason} -- Report ID: {item.id}
          </Text>
          {item.reporter && (
            <Text style={{ marginTop: 2 }}>
              Reported by: {item.reporter.email}
            </Text>
          )}
          {item.reported && (
            <Text style={{ marginTop: 2 }}>
              Target: {item.reported.email}
            </Text>
          )}
          <Text numberOfLines={2} style={{ marginTop: 4 }}>
            Report severity: {item.severity}
          </Text>
          <Text style={{ fontSize: 12, marginTop: 4 }}>
            {new Date(item.createdAt).toLocaleString()}
          </Text>
        </View>
      )}
      ListEmptyComponent={
        <View style={{ padding: 24, alignItems: "center" }}>
          <Text>No reports found.</Text>
        </View>
      }
    />
  );
}