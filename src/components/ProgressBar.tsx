import { View } from "react-native";

type Props = { value: number; color?: string; trackColor?: string; height?: number };

export default function ProgressBar({ value, color = "#C85A32", trackColor = "#F0E9E5", height = 8 }: Props) {
  const percent = Math.max(0, Math.min(100, value));
  return (
    <View style={{ height, backgroundColor: trackColor }} className="overflow-hidden rounded-full">
      <View style={{ width: `${percent}%`, height, backgroundColor: color }} className="rounded-full" />
    </View>
  );
}
