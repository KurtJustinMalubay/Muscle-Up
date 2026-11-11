import "./global.css";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StatusBar, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Dumbbell } from "lucide-react-native";
import Assessment from "./src/screens/Assessment";
import Chat from "./src/screens/Chat";
import Dashboard from "./src/screens/Dashboard";
import Eat from "./src/screens/Eat";
import Logger from "./src/screens/Logger";
import Progress from "./src/screens/Progress";
import Settings from "./src/screens/Settings";
import TabBar, { type AppTab } from "./src/components/TabBar";
import { hasCompletedAssessment, initializeDatabase } from "./src/db";

type AppState = "loading" | "assessment" | "ready" | "error";

export default function App() {
  const [tab, setTab] = useState<AppTab>("Today");
  const [showSettings, setShowSettings] = useState(false);
  const [appState, setAppState] = useState<AppState>("loading");
  const [error, setError] = useState("");

  const initialize = async () => {
    setAppState("loading");
    setError("");
    try {
      await initializeDatabase();
      setAppState(await hasCompletedAssessment() ? "ready" : "assessment");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open your local Muscle Up data.");
      setAppState("error");
    }
  };
  useEffect(() => { void initialize(); }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView className="flex-1 bg-canvas" edges={["top", "bottom"]}>
        {appState === "loading" ? (
          <View className="flex-1 items-center justify-center">
            <View className="mb-4 h-14 w-14 items-center justify-center rounded-2xl bg-terracotta"><Dumbbell size={27} color="white" /></View>
            <ActivityIndicator color="#C85A32" />
            <Text className="mt-3 text-sm text-[#756E69]">Getting your training space ready…</Text>
          </View>
        ) : null}

        {appState === "error" ? (
          <View className="flex-1 justify-center px-6">
            <Text className="text-2xl font-extrabold text-ink">We couldn't open Muscle Up</Text>
            <Text accessibilityRole="alert" className="mt-3 text-sm leading-5 text-terracotta">{error}</Text>
            <Pressable onPress={() => void initialize()} className="mt-5 items-center rounded-2xl bg-terracotta p-4">
              <Text className="font-bold text-white">Try again</Text>
            </Pressable>
          </View>
        ) : null}

        {appState === "assessment" ? <Assessment onComplete={() => setAppState("ready")} /> : null}

        {appState === "ready" ? (
          <>
            <View className="flex-1">
              <View className="flex-1" style={{ display: !showSettings && tab === "Today" ? "flex" : "none" }}>
                <Dashboard refreshKey={`${tab}-${showSettings}`} onSettings={() => setShowSettings(true)} onTrain={() => setTab("Train")} onEat={() => setTab("Eat")} onProgress={() => setTab("Progress")} />
              </View>
              <View className="flex-1" style={{ display: !showSettings && tab === "Train" ? "flex" : "none" }}>
                <Logger onRequestAI={async () => true} onSettings={() => setShowSettings(true)} />
              </View>
              <View className="flex-1" style={{ display: !showSettings && tab === "Eat" ? "flex" : "none" }}>
                <Eat refreshKey={tab} onSettings={() => setShowSettings(true)} />
              </View>
              <View className="flex-1" style={{ display: !showSettings && tab === "Progress" ? "flex" : "none" }}>
                <Progress refreshKey={tab} onSettings={() => setShowSettings(true)} />
              </View>
              <View className="flex-1" style={{ display: !showSettings && tab === "Coach" ? "flex" : "none" }}>
                <Chat onSettings={() => setShowSettings(true)} />
              </View>
              {showSettings ? (
                <Settings
                  onClose={() => setShowSettings(false)}
                  onReplayTutorial={() => { setShowSettings(false); setAppState("assessment"); }}
                />
              ) : null}
            </View>
            {!showSettings ? <TabBar active={tab} onChange={(next) => setTab(next)} /> : null}
          </>
        ) : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
