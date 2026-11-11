module.exports = {
  content: ["./App.tsx", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: { extend: { colors: { canvas: "#F8F9FA", ink: "#2C2C2C", terracotta: "#C85A32", clay: "#EFD9CF" } } },
};
