import React, { useCallback, useEffect, useState } from "react";
import OverflowMenu, { type OverflowAction } from "./ui/OverflowMenu";
import { useUser } from "../context/UserContext";
import { API_BASE_URL } from "@/utils/api";
import { useThemedAlert } from "../hooks/useThemedAlert";
import { AppNotice } from "./ui/AppNotice";

type Props = {
  visible: boolean;
  onClose: () => void;
  targetUser: { id: number; name?: string | null; email?: string | null } | null;
  onBlocked?: (userId: number) => void;
  onReported?: (userId: number) => void;
};

export const REPORT_REASONS = [
  "Inappropriate Behavior",
  "Spam/Fake Profile",
  "Harassment",
  "Offensive Content",
  "Other",
] as const;

type ReportReasonMenuProps = {
  visible: boolean;
  onClose: () => void;
  onSelectReason: (reason: string) => void;
  subjectLabel: string;
};

export function ReportReasonMenu({ visible, onClose, onSelectReason, subjectLabel }: ReportReasonMenuProps) {
  const actions: OverflowAction[] = REPORT_REASONS.map((reason) => ({
    key: `report-${reason.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    label: reason,
    destructive: true,
    icon: "alert-circle-outline",
    onPress: () => onSelectReason(reason),
  }));

  return (
    <OverflowMenu
      visible={visible}
      onClose={onClose}
      title={`Report ${subjectLabel}`}
      message="Tell us what's wrong so we can review quickly."
      actions={actions}
    />
  );
}

export const REPORT_SUCCESS_NOTICE = {
  title: "Report Submitted",
  message: "Thank you for your report. We will review it promptly.",
} as const;

export default function UserOverflowMenu({ visible, onClose, targetUser, onBlocked, onReported }: Props) {
  const { currentUser, fetchWithAuth } = useUser();
  const [persisted, setPersisted] = useState<{ id: number; name: string } | null>(null);
  const [showReportMenu, setShowReportMenu] = useState(false);
  const [notice, setNotice] = useState<typeof REPORT_SUCCESS_NOTICE | null>(null);
  const { showError } = useThemedAlert();

  const resolveTarget = useCallback(() => {
    if (persisted) return persisted;
    if (!targetUser) return null;
    return { id: targetUser.id, name: targetUser.name || targetUser.email || "User" };
  }, [persisted, targetUser]);

  // Persist user details while the menu is visible to avoid flicker to generic labels
  useEffect(() => {
    if (visible && targetUser) {
      setPersisted({ id: targetUser.id, name: targetUser.name || targetUser.email || "User" });
    }
    // Do not clear on close immediately; keeping snapshot eliminates closing flicker
  }, [visible, targetUser]);

  const doReport = async () => {
    const effective = resolveTarget();
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
    const effective = resolveTarget();
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
      setNotice(REPORT_SUCCESS_NOTICE);
      onReported?.(effective.id);
    } catch (e: any) {
      showError(e?.message || "Failed to submit report");
    }
  };

  const doBlock = async () => {
    const effective = resolveTarget();
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

  const name = resolveTarget()?.name ?? targetUser?.name ?? targetUser?.email ?? "User";

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
