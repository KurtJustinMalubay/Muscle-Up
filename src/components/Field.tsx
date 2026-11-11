import { Text, TextInput, View, type TextInputProps } from "react-native";

type Props = TextInputProps & { label?: string; suffix?: string };

export default function Field({ label, suffix, ...props }: Props) {
  return (
    <View className="mb-4">
      {label ? <Text className="mb-2 text-sm font-semibold text-ink">{label}</Text> : null}
      <View className="min-h-12 flex-row items-center rounded-2xl border border-[#E8E2DF] bg-white px-4">
        <TextInput
          placeholderTextColor="#908984"
          className="min-h-12 flex-1 py-3 text-base text-ink"
          {...props}
        />
        {suffix ? <Text className="ml-2 text-sm text-[#766F6B]">{suffix}</Text> : null}
      </View>
    </View>
  );
}
