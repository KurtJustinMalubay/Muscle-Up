import { ActivityIndicator, Pressable, Text, type PressableProps } from "react-native";

type Props = PressableProps & {
  label: string;
  variant?: "primary" | "secondary" | "quiet";
  loading?: boolean;
};

export default function Button({ label, variant = "primary", loading, disabled, ...props }: Props) {
  const container = variant === "primary"
    ? "bg-terracotta"
    : variant === "secondary" ? "bg-clay" : "bg-transparent";
  const text = variant === "primary" ? "text-white" : "text-ink";
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      className={`min-h-12 items-center justify-center rounded-2xl px-5 py-3 ${container} ${disabled || loading ? "opacity-50" : "active:opacity-80"}`}
      {...props}
    >
      {loading ? <ActivityIndicator color={variant === "primary" ? "white" : "#2C2C2C"} /> : (
        <Text className={`text-sm font-bold ${text}`}>{label}</Text>
      )}
    </Pressable>
  );
}
