import React, { useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, Modal, View, FlatList, Pressable } from "react-native";
import { useUser } from "../context/UserContext";
import { API_BASE_URL } from "@/utils/api";

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
  const [showReasonModal, setShowReasonModal] = useState(false);
  const { currentUser, isLoggedIn, accessToken } = useUser();

  const handleReport = async () => {
    // ✅ Check if user is logged in
    if (!isLoggedIn || !currentUser || !accessToken) {
      Alert.alert("Error", "You must be logged in to report users.");
      return;
    }

    const reporterId = currentUser.id;

    // ✅ Prevent self-reporting
    if (reporterId === reportedUserId) {
      Alert.alert("Error", "You cannot report yourself.");
      return;
    }

    // ✅ Confirm before reporting
    Alert.alert(
      "Report User",
      `Are you sure you want to report ${reportedUserName}?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Report", style: "destructive", onPress: () => setShowReasonModal(true) },
      ]
    );
  };

  const showReasonDialog = () => {
    // ✅ Display predefined report reasons
    Alert.alert("Reason for Report", "Why are you reporting this user?", [
      { text: "Cancel", style: "cancel" },
      { text: "Inappropriate Behavior", onPress: () => submitReport("Inappropriate Behavior") },
      { text: "Spam/Fake Profile", onPress: () => submitReport("Spam/Fake Profile") },
      { text: "Harassment", onPress: () => submitReport("Harassment") },
      { text: "Other", onPress: () => submitReport("Other") },
    ]);
  };

  const submitReport = async (reason: string, severityOverride?: number) => {
    if (!currentUser || !accessToken) return;

    setIsReporting(true);

    try {
      const severity =
        typeof severityOverride === "number" && Number.isFinite(severityOverride)
          ? severityOverride
          : defaultSeverity;

      // ✅ Send the report to the backend
      const response = await fetch(`${API_BASE_URL}/api/report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          reportedId: reportedUserId,
          reason,
          severity,
        }),
      });

      const payload = (await response.json()) as { trustScore?: number; error?: string };

      if (!response.ok || typeof payload.trustScore !== "number") {
        const message = payload?.error ?? "Failed to submit report";
        throw new Error(message);
      }

      let latestTrustScore = payload.trustScore;

      // ✅ Refresh trust score from backend after report
      try {
        const trustResponse = await fetch(`${API_BASE_URL}/api/users/${reportedUserId}/trust`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (trustResponse.ok) {
          const trustData = (await trustResponse.json()) as { trustScore?: number };
          if (typeof trustData.trustScore === "number") {
            latestTrustScore = trustData.trustScore;
          }
        }
      } catch (error) {
        console.warn("Unable to refresh trust score after report:", error);
      }

      Alert.alert("Report Submitted", "Thank you for your report. We will review it promptly.");
      onReportSuccess?.(latestTrustScore);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to submit report";
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

  const reasons = [
    "Inappropriate Behavior",
    "Spam/Fake Profile", 
    "Harassment",
    "Offensive Content",
    "Other"
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

      {/* Custom Modal for Reason Selection */}
      <Modal
        visible={showReasonModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReasonModal(false)}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.container}>
            <Text style={modalStyles.title}>Reason for Report</Text>
            <Text style={modalStyles.subtitle}>Why are you reporting this user?</Text>
            
            <FlatList
              data={reasons}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <Pressable
                  style={modalStyles.reasonButton}
                  onPress={() => {
                    setShowReasonModal(false);
                    submitReport(item);
                  }}
                >
                  <Text style={modalStyles.reasonText}>{item}</Text>
                </Pressable>
              )}
            />
            
            <Pressable
              style={modalStyles.cancelButton}
              onPress={() => setShowReasonModal(false)}
            >
              <Text style={modalStyles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
