import { Pressable, Text, View } from "react-native";

type Props = { title: string; action?: string; onAction?: () => void };

export default function SectionTitle({ title, action, onAction }: Props) {
  return (
    <View className="mb-3 mt-7 flex-row items-center justify-between">
      <Text className="text-lg font-bold text-ink">{title}</Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          disabled={!onAction}
          onPress={onAction}
          className="min-h-11 justify-center pl-3"
        >
          <Text className="font-semibold text-terracotta">{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
