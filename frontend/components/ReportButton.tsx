import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { useUser } from "../context/UserContext";
import { API_BASE_URL } from "@/utils/api";
import { useThemedAlert } from "../hooks/useThemedAlert";
import { ReportReasonMenu, REPORT_SUCCESS_NOTICE } from "./UserOverflowMenu";
import { AppNotice } from "./ui/AppNotice";

type ReportButtonProps = {
  reportedUserId: number;
  reportedUserName: string;
  onReportSuccess?: (updatedTrustScore: number) => void;
  size?: "small" | "medium" | "large";
  style?: any;
  defaultSeverity?: number;
};

export default function ReportButton({
  reportedUserId,
  reportedUserName,
  onReportSuccess,
  size = "small",
  style,
  defaultSeverity = 1,
}: ReportButtonProps) {
  const [isReporting, setIsReporting] = useState(false);
  const [showReasonMenu, setShowReasonMenu] = useState(false);
  const [notice, setNotice] =
    useState<typeof REPORT_SUCCESS_NOTICE | null>(null);
  const { currentUser, isLoggedIn, fetchWithAuth } = useUser();
  const { showError } = useThemedAlert();

  const handleReport = async () => {
    if (!isLoggedIn || !currentUser) {
      showError("You must be logged in to report users.");
      return;
    }

    const reporterId = currentUser.id;

    if (reporterId === reportedUserId) {
      showError("You cannot report yourself.");
      return;
    }

    setShowReasonMenu(true);
  };

  const submitReport = async (reason: string, contextNote?: string, severityOverride?: number) => {
    if (!currentUser) return;

    setShowReasonMenu(false);
    setIsReporting(true);

    try {
      const severity =
        typeof severityOverride === "number" &&
        Number.isFinite(severityOverride)
          ? severityOverride
          : defaultSeverity;

      const response = await fetchWithAuth(`${API_BASE_URL}/api/report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reportedId: reportedUserId,
          reason,
          contextNote: contextNote?.trim() || undefined,
          severity,
        }),
      });

      const payload = (await response.json()) as {
        trustScore?: number;
        error?: string;
      };

      if (!response.ok || typeof payload.trustScore !== "number") {
        const message = payload?.error ?? "Failed to submit report";
        throw new Error(message);
      }

      let latestTrustScore = payload.trustScore;

      try {
        const trustResponse = await fetchWithAuth(
          `${API_BASE_URL}/api/users/${reportedUserId}/trust`
        );
        if (trustResponse.ok) {
          const trustData = (await trustResponse.json()) as {
            trustScore?: number;
          };
          if (typeof trustData.trustScore === "number") {
            latestTrustScore = trustData.trustScore;
          }
        }
      } catch (error) {
        console.warn("Unable to refresh trust score after report:", error);
      }

      setNotice(REPORT_SUCCESS_NOTICE);
      onReportSuccess?.(latestTrustScore);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to submit report";
      showError(message);
    } finally {
      setIsReporting(false);
    }
  };

  const buttonStyles = [
    styles.button,
    styles[size],
    isReporting && styles.disabled,
    style,
  ];

  const textStyles = [
    styles.text,
    styles[`${size}Text`],
    isReporting && styles.disabledText,
  ];

  return (
    <>
      <TouchableOpacity
        style={buttonStyles}
        onPress={handleReport}
        disabled={isReporting}
        activeOpacity={0.7}
      >
        <Text style={textStyles}>{isReporting ? "..." : "Report"}</Text>
      </TouchableOpacity>

      <ReportReasonMenu
        visible={showReasonMenu}
        onClose={() => setShowReasonMenu(false)}
        subjectLabel={reportedUserName}
        onSubmit={(reason, note) => submitReport(reason, note)}
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

const styles = StyleSheet.create({
  button: {
    backgroundColor: "#dc3545",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: "#fff",
    fontWeight: "500",
  },
  small: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    minWidth: 50,
  },
  smallText: {
    fontSize: 12,
  },
  medium: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 70,
  },
  mediumText: {
    fontSize: 14,
  },
  large: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 80,
  },
  largeText: {
    fontSize: 16,
  },
  disabled: {
    backgroundColor: "#6c757d",
    opacity: 0.6,
  },
  disabledText: {
    color: "#adb5bd",
  },
});
