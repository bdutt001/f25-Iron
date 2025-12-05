import React from "react";
import OverflowMenu, { type OverflowAction } from "../ui/OverflowMenu";

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
