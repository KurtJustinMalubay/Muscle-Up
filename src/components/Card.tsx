import { View, type ViewProps } from "react-native";

export default function Card({ className = "", ...props }: ViewProps) {
  const hasBackground = /(?:^|\s)bg-[^\s]+/.test(className);
  const hasPadding = /(?:^|\s)p[trblxy]?-[^\s]+/.test(className);
  const hasBorderWidth = /(?:^|\s)border-(?:0|2|4|8)(?:\s|$)/.test(className);
  const hasBorderColor = /(?:^|\s)border-(?:\[|[a-z])/.test(className);
  const border = hasBorderWidth ? "" : `border ${hasBorderColor ? "" : "border-[#EEE8E5]"}`;

  return (
    <View
      className={`rounded-3xl ${border} ${hasBackground ? "" : "bg-white"} ${hasPadding ? "" : "p-5"} ${className}`}
      {...props}
    />
  );
}
