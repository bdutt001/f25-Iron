import React, { useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity } from "react-native";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

type ReportButtonProps = {
  reportedUserId: number;
  reportedUserName: string;
  reporterId: number; // For now, we'll pass this as a prop. Later, get from auth context
  onReportSuccess?: () => void;
  size?: "small" | "medium" | "large";
  style?: any;
};

export default function ReportButton({
  reportedUserId,
  reportedUserName,
  reporterId,
  onReportSuccess,
  size = "small",
  style,
}: ReportButtonProps) {
  const [isReporting, setIsReporting] = useState(false);

  const handleReport = async () => {
    // Prevent self-reporting
    if (reporterId === reportedUserId) {
      Alert.alert("Error", "You cannot report yourself.");
      return;
    }

    // Show confirmation dialog
    Alert.alert(
      "Report User",
      `Are you sure you want to report ${reportedUserName}?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Report",
          style: "destructive",
          onPress: () => showReasonDialog(),
        },
      ]
    );
  };

  const showReasonDialog = () => {
    // For now, show predefined reasons. Later, this could be a modal with text input
    Alert.alert(
      "Reason for Report",
      "Why are you reporting this user?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Inappropriate Behavior",
          onPress: () => submitReport("Inappropriate Behavior"),
        },
        {
          text: "Spam/Fake Profile",
          onPress: () => submitReport("Spam/Fake Profile"),
        },
        {
          text: "Harassment",
          onPress: () => submitReport("Harassment"),
        },
        {
          text: "Other",
          onPress: () => submitReport("Other"),
        },
      ]
    );
  };

  const submitReport = async (reason: string) => {
    setIsReporting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/reports`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason,
          reporterId,
          reportedId: reportedUserId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to submit report");
      }

      Alert.alert("Report Submitted", "Thank you for your report. We will review it promptly.");
      onReportSuccess?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to submit report";
      Alert.alert("Error", message);
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
    <TouchableOpacity
      style={buttonStyles}
      onPress={handleReport}
      disabled={isReporting}
      activeOpacity={0.7}
    >
      <Text style={textStyles}>
        {isReporting ? "..." : "Report"}
      </Text>
    </TouchableOpacity>
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
  
  // Size variants
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
  
  // Disabled state
  disabled: {
    backgroundColor: "#6c757d",
    opacity: 0.6,
  },
  disabledText: {
    color: "#adb5bd",
  },
});