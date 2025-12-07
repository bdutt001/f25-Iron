import React, { useEffect, useMemo, useState } from "react";
import OverflowMenu, { type OverflowAction } from "./ui/OverflowMenu";
import { Alert, Modal, View, FlatList, Pressable, StyleSheet, Text } from "react-native";
import type { AlertOptions } from "react-native";
import { useUser } from "../context/UserContext";
import { API_BASE_URL } from "@/utils/api";
import { useAppTheme } from "../context/ThemeContext";

type Props = {
  visible: boolean;
  onClose: () => void;
  targetUser: { id: number; name?: string | null; email?: string | null } | null;
  onBlocked?: (userId: number) => void;
  onReported?: (userId: number) => void;
  // ✅ Optional handler for "View Profile" (e.g., from map tab)
  onViewProfile?: (userId: number) => void;
};

export default function UserOverflowMenu({ visible, onClose, targetUser, onBlocked, onReported, onViewProfile }: Props) {
  const { currentUser, fetchWithAuth } = useUser();
  const [persisted, setPersisted] = useState<{ id: number; name: string } | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const { isDark } = useAppTheme();
  const alertAppearance = useMemo<AlertOptions>(
    () => ({ userInterfaceStyle: isDark ? "dark" : "light" }),
    [isDark]
  );

  // Persist user details while the menu is visible to avoid flicker to generic labels
  useEffect(() => {
    if (visible && targetUser) {
      setPersisted({ id: targetUser.id, name: targetUser.name || targetUser.email || "User" });
    }
    // Do not clear on close immediately; keeping snapshot eliminates closing flicker
  }, [visible, targetUser]);

  const doReport = async () => {
    const effective = persisted ?? (targetUser ? { id: targetUser.id, name: targetUser.name || targetUser.email || "User" } : null);
    if (!effective) return;
    if (!targetUser || !currentUser) {
      Alert.alert("Error", "You must be logged in to report.", undefined, alertAppearance);
      return;
    }
    if (currentUser.id === effective.id) {
      Alert.alert("Error", "You cannot report yourself.", undefined, alertAppearance);
      return;
    }
    setShowReportModal(true);
  };

  const reportReasons = [
    "Inappropriate Behavior",
    "Spam/Fake Profile",
    "Harassment",
    "Offensive Content", 
    "Other"
  ];

  const submitReport = async (reason: string) => {
    setShowReportModal(false);
    const effective = persisted ?? (targetUser ? { id: targetUser.id, name: targetUser.name || targetUser.email || "User" } : null);
    if (!effective) return;
    try {
      const resp = await fetchWithAuth(`${API_BASE_URL}/api/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportedId: effective.id, reason, severity: 1 }),
      });
      const payload = (await resp.json()) as { error?: string };
      if (!resp.ok) throw new Error(payload?.error || "Failed to submit report");
      Alert.alert("Report Submitted", "Thank you for your report.", undefined, alertAppearance);
      onReported?.(effective.id);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to submit report", undefined, alertAppearance);
    }
  };

  const doBlock = async () => {
    const effective = persisted ?? (targetUser ? { id: targetUser.id, name: targetUser.name || targetUser.email || "User" } : null);
    if (!effective) {
      Alert.alert("Error", "You must be logged in to block.", undefined, alertAppearance);
      return;
    }
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/users/${effective.id}/block`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`Failed to block (${res.status})`);
      onBlocked?.(effective.id);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not block user.", undefined, alertAppearance);
    }
  };

  const name = (persisted?.name ?? targetUser?.name ?? targetUser?.email) || "User";
  const effectiveId = persisted?.id ?? targetUser?.id;

  // Only show "View Profile" when:
  // - we have an id
  // - a handler was provided
  // - and it's not the current user
  const canViewProfile =
    !!onViewProfile &&
    typeof effectiveId === "number" &&
    (!currentUser || currentUser.id !== effectiveId);

  const actions: OverflowAction[] = [];

  if (canViewProfile) {
    actions.push({
      key: "view-profile",
      label: `View ${name}'s Profile`,
      icon: "person-circle-outline",
      onPress: () => {
        if (!effectiveId) return;
        onViewProfile?.(effectiveId);
      },
    });
  }

  actions.push(
    { key: "report", label: `Report ${name}`, destructive: true, onPress: doReport, icon: "flag-outline" },
    { key: "block", label: `Block ${name}`, destructive: true, onPress: doBlock, icon: "hand-left-outline" },
  );

  return (
    <>
      <OverflowMenu visible={visible} onClose={onClose} title={name} actions={actions} />
      
      {/* Custom Report Modal */}
      <Modal
        visible={showReportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReportModal(false)}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.container}>
            <Text style={modalStyles.title}>
              Report {persisted?.name || "User"}
            </Text>
            <Text style={modalStyles.subtitle}>
              Why are you reporting this user?
            </Text>
            
            <FlatList
              data={reportReasons}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <Pressable
                  style={modalStyles.reasonButton}
                  onPress={() => submitReport(item)}
                >
                  <Text style={modalStyles.reasonText}>{item}</Text>
                </Pressable>
              )}
            />
            
            <Pressable
              style={modalStyles.cancelButton}
              onPress={() => setShowReportModal(false)}
            >
              <Text style={modalStyles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    backgroundColor: "white",
    margin: 20,
    borderRadius: 10,
    padding: 20,
    maxWidth: 300,
    width: "80%",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
    color: "#666",
  },
  reasonButton: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  reasonText: {
    fontSize: 16,
    textAlign: "center",
  },
  cancelButton: {
    padding: 15,
    backgroundColor: "#f0f0f0",
    borderRadius: 5,
    marginTop: 10,
  },
  cancelText: {
    fontSize: 16,
    textAlign: "center",
    fontWeight: "500",
  },
});
