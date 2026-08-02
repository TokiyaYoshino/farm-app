import type { ReactNode } from "react";
import { Pressable, Text, type ViewStyle } from "react-native";
import { btnBox, btnLabel, type BtnVariant, type BtnSize } from "./styles";
import { C } from "./tokens";

interface Props {
  variant?: BtnVariant;
  size?: BtnSize;
  onPress?: () => void;
  style?: ViewStyle;
  icon?: ReactNode;
  children: string;
}

// Web版 btn() の transition(background 0.15s) 相当は Pressable の pressed 状態で表現
export default function Btn({ variant = "primary", size = "lg", onPress, style, icon, children }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        btnBox(variant, size),
        pressed && variant === "primary" && { backgroundColor: C.inkPress },
        pressed && variant !== "primary" && { opacity: 0.7 },
        style,
      ]}
    >
      {icon}
      <Text style={btnLabel(variant, size)}>{children}</Text>
    </Pressable>
  );
}
