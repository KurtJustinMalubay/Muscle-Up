import { Pressable, Text, View } from "react-native";

type Props<T extends string> = {
  value: T;
  options: { label: string; value: T }[];
  onChange: (value: T) => void;
};

export default function SegmentedControl<T extends string>({ value, options, onChange }: Props<T>) {
  return (
    <View className="mb-5 flex-row rounded-2xl bg-[#EEE8E5] p-1">
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            className={`min-h-11 flex-1 items-center justify-center rounded-xl px-2 ${selected ? "bg-white" : ""}`}
          >
            <Text className={`text-sm font-semibold ${selected ? "text-ink" : "text-[#756E69]"}`}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
