import { Pressable, Text, View } from "react-native";
import { ArrowLeft, Settings } from "lucide-react-native";

type Props = { title: string; subtitle?: string; onBack?: () => void; onSettings?: () => void };

export default function ScreenHeader({ title, subtitle, onBack, onSettings }: Props) {
  return (
    <View className="mb-5 flex-row items-center">
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8} onPress={onBack} className="mr-3 h-11 w-11 items-center justify-center rounded-full bg-white">
          <ArrowLeft size={20} color="#2C2C2C" />
        </Pressable>
      ) : null}
      <View className="flex-1">
        <Text className="text-2xl font-extrabold tracking-tight text-ink">{title}</Text>
        {subtitle ? <Text className="mt-1 text-sm text-[#756E69]">{subtitle}</Text> : null}
      </View>
      {onSettings ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Settings" hitSlop={8} onPress={onSettings} className="ml-3 h-11 w-11 items-center justify-center rounded-full bg-white">
          <Settings size={20} color="#2C2C2C" />
        </Pressable>
      ) : null}
    </View>
  );
}
