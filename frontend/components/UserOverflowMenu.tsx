import React, { useEffect, useState } from "react";
import OverflowMenu, { type OverflowAction } from "./ui/OverflowMenu";
import { useUser } from "../context/UserContext";
import { API_BASE_URL } from "@/utils/api";
import { useAppTheme } from "../context/ThemeContext";
import { useThemedAlert } from "../hooks/useThemedAlert";
import { ReportReasonMenu } from "./reporting/ReportReasonMenu";
import { AppNotice } from "./ui/AppNotice";

type Props = {
  visible: boolean;
  onClose: () => void;
  targetUser: { id: number; name?: string | null; email?: string | null } | null;
  onBlocked?: (userId: number) => void;
  onReported?: (userId: number) => void;
};

export default function UserOverflowMenu({ visible, onClose, targetUser, onBlocked, onReported }: Props) {
  const { currentUser, fetchWithAuth } = useUser();
  const [persisted, setPersisted] = useState<{ id: number; name: string } | null>(null);
  const [showReportMenu, setShowReportMenu] = useState(false);
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  const { isDark } = useAppTheme();
  const { showError } = useThemedAlert();

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
      showError("You must be logged in to report.");
      return;
    }
    if (currentUser.id === effective.id) {
      showError("You cannot report yourself.");
      return;
    }
    setShowReportMenu(true);
  };

  const submitReport = async (reason: string) => {
    const effective = persisted ?? (targetUser ? { id: targetUser.id, name: targetUser.name || targetUser.email || "User" } : null);
    if (!effective) return;
    setShowReportMenu(false);
    try {
      const resp = await fetchWithAuth(`${API_BASE_URL}/api/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportedId: effective.id, reason, severity: 1 }),
      });
      const payload = (await resp.json()) as { error?: string };
      if (!resp.ok) throw new Error(payload?.error || "Failed to submit report");
      setNotice({
        title: "Report Submitted",
        message: "Thank you for your report. We will review it promptly.",
      });
      onReported?.(effective.id);
    } catch (e: any) {
      showError(e?.message || "Failed to submit report");
    }
  };

  const doBlock = async () => {
    const effective = persisted ?? (targetUser ? { id: targetUser.id, name: targetUser.name || targetUser.email || "User" } : null);
    if (!effective) {
      showError("You must be logged in to block.");
      return;
    }
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/users/${effective.id}/block`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`Failed to block (${res.status})`);
      onBlocked?.(effective.id);
    } catch (e: any) {
      showError(e?.message || "Could not block user.");
    }
  };

  const name = (persisted?.name ?? targetUser?.name ?? targetUser?.email) || "User";

  const actions: OverflowAction[] = [
    { key: "report", label: `Report ${name}`, destructive: true, onPress: doReport, icon: "flag-outline" },
    { key: "block", label: `Block ${name}`, destructive: true, onPress: doBlock, icon: "hand-left-outline" },
  ];

  return (
    <>
      <OverflowMenu visible={visible} onClose={onClose} title={name} actions={actions} />

      <ReportReasonMenu
        visible={showReportMenu}
        onClose={() => setShowReportMenu(false)}
        subjectLabel={persisted?.name || "User"}
        onSelectReason={submitReport}
      />
      <AppNotice
        visible={!!notice}
        onClose={() => setNotice(null)}
        title={notice?.title ?? ""}
        message={notice?.message}
      />
    </>
  );
}
