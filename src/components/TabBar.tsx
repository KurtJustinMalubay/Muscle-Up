import { Dumbbell, House, MessageCircle, TrendingUp, Utensils } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

export type AppTab = "Today" | "Train" | "Eat" | "Progress" | "Coach";

const TABS: { name: AppTab; icon: typeof House }[] = [
  { name: "Today", icon: House },
  { name: "Train", icon: Dumbbell },
  { name: "Eat", icon: Utensils },
  { name: "Progress", icon: TrendingUp },
  { name: "Coach", icon: MessageCircle },
];

export default function TabBar({ active, onChange }: { active: AppTab; onChange: (tab: AppTab) => void }) {
  return (
    <View className="flex-row border-t border-[#EEE8E5] bg-white px-1 pb-1 pt-2">
      {TABS.map(({ name, icon: Icon }) => {
        const selected = name === active;
        return (
          <Pressable
            key={name}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(name)}
            className="flex-1 items-center py-1"
          >
            <Icon size={21} color={selected ? "#C85A32" : "#817A75"} strokeWidth={selected ? 2.5 : 2} />
            <Text className={`mt-1 text-[10px] font-semibold ${selected ? "text-terracotta" : "text-[#817A75]"}`}>{name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
