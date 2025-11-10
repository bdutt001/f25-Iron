import React, { useEffect, useState } from "react";
import OverflowMenu, { type OverflowAction } from "./ui/OverflowMenu";
import { Alert } from "react-native";
import { useUser } from "../context/UserContext";
import { API_BASE_URL } from "@/utils/api";

type Props = {
  visible: boolean;
  onClose: () => void;
  targetUser: { id: number; name?: string | null; email?: string | null } | null;
  onBlocked?: (userId: number) => void;
  onReported?: (userId: number) => void;
};

export default function UserOverflowMenu({ visible, onClose, targetUser, onBlocked, onReported }: Props) {
  const { currentUser, accessToken } = useUser();
  const [persisted, setPersisted] = useState<{ id: number; name: string } | null>(null);

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
    if (!targetUser || !accessToken || !currentUser) {
      Alert.alert("Error", "You must be logged in to report.");
      return;
    }
    if (currentUser.id === effective.id) {
      Alert.alert("Error", "You cannot report yourself.");
      return;
    }
    const pickReason = (reason: string) => submitReport(reason);
    Alert.alert(
      "Report User",
      `Why are you reporting ${effective.name}?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Inappropriate", onPress: () => pickReason("Inappropriate Behavior") },
        { text: "Spam/Fake", onPress: () => pickReason("Spam/Fake Profile") },
        { text: "Harassment", onPress: () => pickReason("Harassment") },
        { text: "Other", onPress: () => pickReason("Other") },
      ]
    );
  };

  const submitReport = async (reason: string) => {
    const effective = persisted ?? (targetUser ? { id: targetUser.id, name: targetUser.name || targetUser.email || "User" } : null);
    if (!effective || !accessToken) return;
    try {
      const resp = await fetch(`${API_BASE_URL}/api/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ reportedId: effective.id, reason, severity: 1 }),
      });
      const payload = (await resp.json()) as { error?: string };
      if (!resp.ok) throw new Error(payload?.error || "Failed to submit report");
      Alert.alert("Report Submitted", "Thank you for your report.");
      onReported?.(effective.id);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to submit report");
    }
  };

  const doBlock = async () => {
    const effective = persisted ?? (targetUser ? { id: targetUser.id, name: targetUser.name || targetUser.email || "User" } : null);
    if (!effective || !accessToken) {
      Alert.alert("Error", "You must be logged in to block.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/${effective.id}/block`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Failed to block (${res.status})`);
      onBlocked?.(effective.id);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not block user.");
    }
  };

  const name = (persisted?.name ?? targetUser?.name ?? targetUser?.email) || "User";

  const actions: OverflowAction[] = [
    { key: "report", label: `Report ${name}`, destructive: true, onPress: doReport },
    { key: "block", label: `Block ${name}`, destructive: true, onPress: doBlock },
  ];

  return <OverflowMenu visible={visible} onClose={onClose} title={name} actions={actions} />;
}
