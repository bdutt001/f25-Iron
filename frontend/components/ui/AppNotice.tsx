import React from "react";
import OverflowMenu, { type OverflowAction } from "./OverflowMenu";

type AppNoticeProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  actionLabel?: string;
  icon?: OverflowAction["icon"];
};

/**
 * Reusable wrapper around OverflowMenu for one-click notices (success/error/info).
 */
export function AppNotice({
  visible,
  onClose,
  title,
  message,
  actionLabel = "Okay",
  icon = "checkmark-circle-outline",
}: AppNoticeProps) {
  return (
    <OverflowMenu
      visible={visible}
      onClose={onClose}
      title={title}
      message={message}
      showCancel={false}
      actions={[
        {
          key: "close",
          label: actionLabel,
          icon,
          onPress: onClose,
        },
      ]}
    />
  );
}
