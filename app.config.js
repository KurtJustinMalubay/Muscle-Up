const config = require("./app.json").expo;

module.exports = {
  ...config,
  icon: "./assets/icon.png",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#F8F9FA",
  },
  android: {
    ...config.android,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#C85A32",
    },
  },
  plugins: [
    ...(config.plugins ?? []),
    ...(process.env.GOOGLE_IOS_URL_SCHEME
      ? [["@react-native-google-signin/google-signin", { iosUrlScheme: process.env.GOOGLE_IOS_URL_SCHEME }]]
      : []),
  ],
};
