import React, { ReactNode, useCallback, useEffect, useState } from "react";
import { LayoutChangeEvent, StyleProp, View, ViewStyle } from "react-native";
import { Edge, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useKeyboardHandler } from "react-native-keyboard-controller";

import { useAppTheme } from "@/context/ThemeContext";

type ChatScreenShellProps = {
  children: (contentPaddingBottom: number) => ReactNode;
  renderInputBar: (bottomPadding: number) => ReactNode;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  keyboardEnabled?: boolean;
};

const DEFAULT_EDGES: Edge[] = ["top", "bottom", "left", "right"];

export function ChatScreenShell({
  children,
  renderInputBar,
  edges = DEFAULT_EDGES,
  style,
  keyboardEnabled = true,
}: ChatScreenShellProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useSharedValue(0);
  const [keyboardSpace, setKeyboardSpace] = useState(0);
  const [composerHeight, setComposerHeight] = useState(0);

  const updateKeyboardSpace = useCallback((next: number) => {
    setKeyboardSpace(next);
  }, []);

  useKeyboardHandler(
    {
      onMove: (event) => {
        "worklet";
        if (!keyboardEnabled) return;
        const next = Math.max(0, event.height - insets.bottom);
        keyboardHeight.value = next;
        runOnJS(updateKeyboardSpace)(next);
      },
      onEnd: (event) => {
        "worklet";
        if (!keyboardEnabled) return;
        const next = Math.max(0, event.height - insets.bottom);
        keyboardHeight.value = next;
        runOnJS(updateKeyboardSpace)(next);
      },
    },
    [insets.bottom, keyboardEnabled, updateKeyboardSpace]
  );

  useEffect(() => {
    if (!keyboardEnabled) {
      keyboardHeight.value = 0;
      setKeyboardSpace(0);
    }
  }, [keyboardEnabled, keyboardHeight]);

  const composerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -keyboardHeight.value }],
  }));

  const spacerStyle = useAnimatedStyle(() => ({
    height: keyboardHeight.value,
  }));

  const handleComposerLayout = useCallback((event: LayoutChangeEvent) => {
    setComposerHeight(Math.round(event.nativeEvent.layout.height));
  }, []);

  const inputPadding = Math.max(insets.bottom, 10);
  const contentPaddingBottom = composerHeight + keyboardSpace + inputPadding;

  return (
    <SafeAreaView
      style={[{ flex: 1, backgroundColor: colors.background }, style]}
      edges={edges}
    >
      <View style={{ flex: 1 }}>
        {children(contentPaddingBottom)}
      </View>

      <Animated.View style={composerAnimatedStyle} onLayout={handleComposerLayout}>
        {renderInputBar(inputPadding)}
      </Animated.View>

      <Animated.View pointerEvents="none" style={spacerStyle} />
    </SafeAreaView>
  );
}
