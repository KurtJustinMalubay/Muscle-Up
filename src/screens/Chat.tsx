import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ArrowUp, Bot, Settings2, Sparkles } from "lucide-react-native";
import Card from "../components/Card";
import Pill from "../components/Pill";
import ScreenHeader from "../components/ScreenHeader";
import { requestApi } from "../api";
import { getRecentWorkouts } from "../db";

type Props = { onClose?: () => void; onSettings?: () => void };
type Message = { id: string; from: "you" | "coach"; text: string };
const QUICK_PROMPTS = ["Help me plan my next workout", "How should I recover today?", "Explain progressive overload"];

export default function Chat({ onClose, onSettings }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    { id: "welcome", from: "coach", text: "I'm here to help with training, recovery, and building consistent habits. What are you working on?" },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = async (prompt = input) => {
    const message = prompt.trim();
    if (!message || busy) return;
    if (message.length > 2000) {
      setError("Keep each message under 2,000 characters.");
      return;
    }
    setInput("");
    setError("");
    const userMessage = { id: `${Date.now()}-user`, from: "you" as const, text: message };
    setMessages((items) => [...items, userMessage]);
    setBusy(true);
    try {
      const recentWorkouts = await getRecentWorkouts();
      const history = [...messages.slice(-6), userMessage]
        .map((item) => `${item.from === "you" ? "User" : "Coach"}: ${item.text}`)
        .join("\n");
      const result = await requestApi<{ reply: string }>("chat", { message: history, recent_workouts: recentWorkouts });
      if (!result.reply?.trim()) throw new Error("The coach returned an empty reply. Try asking in another way.");
      setMessages((items) => [...items, { id: `${Date.now()}-coach`, from: "coach", text: result.reply }]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The coach could not respond.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-canvas" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View className="flex-1 px-5 pt-4">
        <ScreenHeader title="Coach" subtitle="Your training companion" onBack={onClose} onSettings={onSettings} />
        <View className="mb-4 flex-row items-start rounded-2xl bg-[#F9EAE3] p-3">
          <Sparkles size={16} color="#C85A32" />
          <Text className="ml-2 flex-1 text-xs leading-5 text-[#6D5145]">
            General fitness guidance only—not medical advice. Avoid sharing sensitive health information.
          </Text>
        </View>
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
          {messages.map((message) => (
            <View key={message.id} className={`mb-3 max-w-[88%] rounded-3xl p-4 ${message.from === "you" ? "self-end rounded-br-md bg-terracotta" : "self-start rounded-bl-md border border-[#EEE8E5] bg-white"}`}>
              {message.from === "coach" ? <Bot size={16} color="#C85A32" style={{ marginBottom: 8 }} /> : null}
              <Text className={`text-sm leading-5 ${message.from === "you" ? "text-white" : "text-ink"}`}>{message.text}</Text>
            </View>
          ))}
          {busy ? <View className="mb-3 flex-row items-center self-start rounded-2xl bg-white p-4"><ActivityIndicator color="#C85A32" /><Text className="ml-2 text-sm text-[#756E69]">Thinking…</Text></View> : null}
          {messages.length === 1 ? (
            <View className="mt-2">
              <Text className="mb-2 text-xs font-bold uppercase tracking-widest text-[#817A75]">TRY ASKING</Text>
              <View className="flex-row flex-wrap">{QUICK_PROMPTS.map((prompt) => <Pill key={prompt} label={prompt} onPress={() => void send(prompt)} />)}</View>
            </View>
          ) : null}
        </ScrollView>
        {error ? (
          <Card className="mb-3 border-[#F0D0C2] p-4">
            <Text accessibilityRole="alert" className="text-sm leading-5 text-terracotta">{error}</Text>
            {onSettings ? <Pressable onPress={onSettings} className="mt-3 flex-row items-center">
              <Settings2 size={15} color="#C85A32" /><Text className="ml-2 text-xs font-bold text-terracotta">Check API settings</Text>
            </Pressable> : null}
          </Card>
        ) : null}
        <View className="mb-4 flex-row items-end rounded-3xl border border-[#E8E2DF] bg-white p-2">
          <TextInput
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => void send()}
            returnKeyType="send"
            placeholder="Ask your coach…"
            placeholderTextColor="#908984"
            multiline
            maxLength={2000}
            className="max-h-28 min-h-11 flex-1 px-3 py-2 text-sm text-ink"
          />
          <Pressable
            accessibilityLabel="Send message"
            disabled={busy || !input.trim()}
            onPress={() => void send()}
            className="h-10 w-10 items-center justify-center rounded-full bg-terracotta disabled:opacity-40"
          >
            <ArrowUp size={19} color="white" />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
