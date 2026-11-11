import { Pressable, Text } from "react-native";

type Props = { label: string; selected?: boolean; onPress?: () => void };

export default function Pill({ label, selected = false, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`mb-2 mr-2 rounded-full border px-4 py-2.5 ${selected ? "border-terracotta bg-terracotta" : "border-[#E8E2DF] bg-white"}`}
    >
      <Text className={`text-sm font-semibold ${selected ? "text-white" : "text-ink"}`}>{label}</Text>
    </Pressable>
  );
}
