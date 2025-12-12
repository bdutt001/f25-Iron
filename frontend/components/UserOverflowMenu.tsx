import React, { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import OverflowMenu, { type OverflowAction } from "./ui/OverflowMenu";
import { useUser } from "../context/UserContext";
import { API_BASE_URL } from "@/utils/api";
import { useThemedAlert } from "../hooks/useThemedAlert";
import { AppNotice } from "./ui/AppNotice";
import { useAppTheme } from "@/context/ThemeContext";

type Props = {
  visible: boolean;
  onClose: () => void;
  targetUser: { id: number; name?: string | null; email?: string | null } | null;
  onBlocked?: (userId: number) => void;
  onReported?: (userId: number) => void;
  // ✅ Optional handler for "View Profile" (e.g., from map or messages tab)
  onViewProfile?: (userId: number) => void;
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
  onSubmit: (reason: string, contextNote: string) => void;
  subjectLabel: string;
};

export function ReportReasonMenu({
  visible,
  onClose,
  onSubmit,
  subjectLabel,
}: ReportReasonMenuProps) {
  const { colors, isDark } = useAppTheme();
  const [selectedReason, setSelectedReason] = useState<string>(REPORT_REASONS[0]);
  const [note, setNote] = useState<string>("");

  useEffect(() => {
    if (visible) {
      setSelectedReason(REPORT_REASONS[0]);
      setNote("");
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={[reportStyles.backdrop, { backgroundColor: isDark ? "rgba(2,6,23,0.75)" : "rgba(15,23,42,0.45)" }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            reportStyles.sheet,
            {
              backgroundColor: isDark ? "#0f172a" : "#ffffff",
              borderColor: colors.border,
              shadowColor: isDark ? "#000" : "#0f172a",
            },
          ]}
        >
          <Text style={[reportStyles.title, { color: colors.text }]}>
            Report {subjectLabel}
          </Text>
          <Text style={[reportStyles.subtitle, { color: colors.muted }]}>
            Choose a reason and add context so moderators can review quickly.
          </Text>

          <View style={reportStyles.chipRow}>
            {REPORT_REASONS.map((reason) => {
              const active = reason === selectedReason;
              return (
                <TouchableOpacity
                  key={reason}
                  onPress={() => setSelectedReason(reason)}
                  style={[
                    reportStyles.chip,
                    {
                      borderColor: active ? colors.accent : colors.border,
                      backgroundColor: active ? `${colors.accent}12` : isDark ? "rgba(255,255,255,0.04)" : "#f8fafc",
                    },
                  ]}
                >
                  <Text
                    style={[
                      reportStyles.chipText,
                      { color: active ? colors.accent : colors.text },
                    ]}
                  >
                    {reason}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TextInput
            style={[
              reportStyles.input,
              {
                borderColor: colors.border,
                color: colors.text,
                backgroundColor: isDark ? "#0b1224" : "#f8fafc",
              },
            ]}
            placeholder="Add an optional note (what happened, links, details)"
            placeholderTextColor={colors.muted}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={1000}
          />
          <Text style={[reportStyles.counter, { color: colors.muted }]}>
            {note.length}/1000
          </Text>

          <View style={reportStyles.actionsRow}>
            <TouchableOpacity
              style={[reportStyles.secondaryButton, { borderColor: colors.border }]}
              onPress={onClose}
            >
              <Text style={[reportStyles.secondaryText, { color: colors.text }]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                reportStyles.primaryButton,
                { backgroundColor: colors.accent },
              ]}
              onPress={() => onSubmit(selectedReason, note.trim())}
            >
              <Text style={reportStyles.primaryText}>Submit</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const reportStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  sheet: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 18,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  title: { fontSize: 18, fontWeight: "800", marginBottom: 6 },
  subtitle: { fontSize: 14, marginBottom: 12, lineHeight: 20 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontWeight: "700" },
  input: {
    minHeight: 90,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    textAlignVertical: "top",
    fontSize: 14,
  },
  counter: { alignSelf: "flex-end", fontSize: 12, marginTop: 4 },
  actionsRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  secondaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { fontWeight: "700" },
  primaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { fontWeight: "800", color: "#fff" },
});

export const REPORT_SUCCESS_NOTICE = {
  title: "Report Submitted",
  message: "Thank you for your report. We will review it promptly.",
} as const;

export default function UserOverflowMenu({
  visible,
  onClose,
  targetUser,
  onBlocked,
  onReported,
  onViewProfile,
}: Props) {
  const { currentUser, fetchWithAuth } = useUser();
  const [persisted, setPersisted] = useState<{ id: number; name: string } | null>(
    null
  );
  const [showReportMenu, setShowReportMenu] = useState(false);
  const [notice, setNotice] = useState<typeof REPORT_SUCCESS_NOTICE | null>(null);
  const { showError } = useThemedAlert();

  const resolveTarget = useCallback(() => {
    if (persisted) return persisted;
    if (!targetUser) return null;
    return {
      id: targetUser.id,
      name: targetUser.name || targetUser.email || "User",
    };
  }, [persisted, targetUser]);

  // Persist user details while the menu is visible to avoid flicker
  useEffect(() => {
    if (visible && targetUser) {
      setPersisted({
        id: targetUser.id,
        name: targetUser.name || targetUser.email || "User",
      });
    }
    // We intentionally *don’t* clear on close to avoid title flicker
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

  const submitReport = async (reason: string, contextNote?: string) => {
    const effective = resolveTarget();
    if (!effective) return;
    setShowReportMenu(false);
    try {
      const resp = await fetchWithAuth(`${API_BASE_URL}/api/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportedId: effective.id,
          reason,
          severity: 1,
          contextNote: contextNote?.trim() || undefined,
        }),
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
      const res = await fetchWithAuth(
        `${API_BASE_URL}/api/users/${effective.id}/block`,
        {
          method: "POST",
        }
      );
      if (!res.ok) throw new Error(`Failed to block (${res.status})`);
      onBlocked?.(effective.id);
    } catch (e: any) {
      showError(e?.message || "Could not block user.");
    }
  };

  const resolved = resolveTarget();
  const name =
    resolved?.name ?? targetUser?.name ?? targetUser?.email ?? "User";
  const effectiveId = resolved?.id ?? targetUser?.id;

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
    {
      key: "report",
      label: `Report ${name}`,
      destructive: true,
      onPress: doReport,
      icon: "flag-outline",
    },
    {
      key: "block",
      label: `Block ${name}`,
      destructive: true,
      onPress: doBlock,
      icon: "hand-left-outline",
    }
  );

  return (
    <>
      <OverflowMenu visible={visible} onClose={onClose} title={name} actions={actions} />

      <ReportReasonMenu
        visible={showReportMenu}
        onClose={() => setShowReportMenu(false)}
        subjectLabel={persisted?.name || "User"}
        onSubmit={submitReport}
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
