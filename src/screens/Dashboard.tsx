import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { ArrowRight, Flame, Footprints, Settings2, Sparkles } from "lucide-react-native";
import Card from "../components/Card";
import ProgressBar from "../components/ProgressBar";
import ScreenHeader from "../components/ScreenHeader";
import SectionTitle from "../components/SectionTitle";
import Button from "../components/Button";
import {
  getDashboardData,
  getFitnessProfile,
  getNutritionEntries,
  getNutritionTargets,
  getWorkoutWeekCount,
  type DashboardData,
  type FitnessProfile,
  type NutritionTargets,
} from "../db";
import { fatigueIndex } from "../engines";

type Props = { refreshKey?: string; onSettings?: () => void; onTrain?: () => void; onEat?: () => void; onProgress?: () => void };
type MacroSummary = { calories: number; protein: number; carbs: number; fat: number };

export default function Dashboard({ refreshKey, onSettings, onTrain, onEat, onProgress }: Props) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [targets, setTargets] = useState<NutritionTargets | null>(null);
  const [profile, setProfile] = useState<FitnessProfile | null>(null);
  const [meals, setMeals] = useState<MacroSummary | null>(null);
  const [workouts, setWorkouts] = useState(0);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [dashboard, nutritionTargets, entries, fitnessProfile, workoutCount] = await Promise.all([
        getDashboardData(), getNutritionTargets(), getNutritionEntries(), getFitnessProfile(), getWorkoutWeekCount(),
      ]);
      setData(dashboard);
      setTargets(nutritionTargets);
      setProfile(fitnessProfile);
      setWorkouts(workoutCount);
      setMeals(entries.reduce((sum, entry) => ({
        calories: sum.calories + entry.calories,
        protein: sum.protein + entry.protein_g,
        carbs: sum.carbs + entry.carbs_g,
        fat: sum.fat + entry.fat_g,
      }), { calories: 0, protein: 0, carbs: 0, fat: 0 }));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load your today view.");
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);
  const fatigue = fatigueIndex(data?.recovery ?? []);
  const today = new Date();
  const firstDay = new Date(today);
  firstDay.setHours(0, 0, 0, 0);
  firstDay.setDate(firstDay.getDate() - 6);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(firstDay);
    date.setDate(firstDay.getDate() + index);
    return date.toLocaleDateString(undefined, { weekday: "narrow" });
  });
  const values = meals ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ padding: 20, paddingTop: 16, paddingBottom: 28 }}>
      <ScreenHeader
        title="Today"
        subtitle={today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        onSettings={onSettings}
      />
      {error ? <Text accessibilityRole="alert" className="mb-3 text-sm text-terracotta">{error}</Text> : null}
      {!data && !error ? <ActivityIndicator color="#C85A32" /> : null}

      <Card className="overflow-hidden border-0 bg-ink p-0">
        <View className="p-5">
          <View className="mb-4 flex-row items-center">
            <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-white/10">
              <Sparkles size={19} color="#F6A27D" />
            </View>
            <Text className="text-xs font-bold uppercase tracking-widest text-[#F6A27D]">YOUR NEXT SESSION</Text>
          </View>
          <Text className="text-2xl font-extrabold text-white">
            {profile?.displayName ? `Keep going, ${profile.displayName}` : "Ready when you are"}
          </Text>
          <Text className="mt-2 text-sm leading-5 text-white/75">
            {data?.nextWorkout ? `${data.nextWorkout} is ready to go.` : "Build a routine that fits your goals, or start a free training session."}
          </Text>
          <View className="mt-5 flex-row">
            <View className="flex-1"><Button label="Start workout" onPress={onTrain} /></View>
            {data?.nextWorkout ? <ArrowRight size={19} color="white" style={{ marginLeft: 12, marginTop: 14 }} /> : null}
          </View>
        </View>
      </Card>

      <SectionTitle title="Your week" action="View progress" onAction={onProgress} />
      <Card>
        <View className="mb-4 flex-row items-center justify-between">
          <View>
            <Text className="text-3xl font-extrabold text-ink">{workouts}</Text>
            <Text className="mt-1 text-xs text-[#756E69]">workouts in the last 7 days</Text>
          </View>
          <View className="h-11 w-11 items-center justify-center rounded-full bg-[#F9EAE3]">
            <Footprints size={21} color="#C85A32" />
          </View>
        </View>
        <View className="h-20 flex-row items-end justify-between">
          {(data?.weeklySets ?? Array(7).fill(0)).map((count, index) => (
            <View key={index} className="items-center">
              <View style={{ height: Math.max(4, Math.min(64, count * 5)) }} className={`w-6 rounded-lg ${count ? "bg-terracotta" : "bg-[#F0E9E5]"}`} />
              <Text className="mt-2 text-[10px] font-medium text-[#817A75]">{days[index]}</Text>
            </View>
          ))}
        </View>
        <Text className="mt-2 text-xs text-[#756E69]">Working sets logged per day</Text>
      </Card>

      <SectionTitle title="Nutrition" action="Log food" onAction={onEat} />
      <Card>
        <View className="mb-4 flex-row items-end justify-between">
          <View>
            <Text className="text-3xl font-extrabold text-ink">{Math.round(values.calories)}</Text>
            <Text className="mt-1 text-xs text-[#756E69]">of {targets?.calories ?? 2000} kcal</Text>
          </View>
          <Flame size={22} color="#C85A32" />
        </View>
        <ProgressBar value={100 * values.calories / (targets?.calories ?? 2000)} height={9} />
        <View className="mt-4 flex-row justify-between">
          {[
            ["Protein", values.protein, targets?.protein ?? 130],
            ["Carbs", values.carbs, targets?.carbs ?? 220],
            ["Fat", values.fat, targets?.fat ?? 65],
          ].map(([label, consumed, target]) => (
            <View key={String(label)}>
              <Text className="text-xs text-[#756E69]">{label}</Text>
              <Text className="mt-1 text-sm font-bold text-ink">{Math.round(Number(consumed))} / {target}g</Text>
            </View>
          ))}
        </View>
      </Card>

      <SectionTitle title="Muscle recovery" />
      <Card>
        <Text className="mb-4 text-xs leading-5 text-[#756E69]">An estimate from your recent logged sets, not a medical assessment.</Text>
        {Object.keys(fatigue).length === 0 ? (
          <Text className="text-sm text-[#756E69]">Log a workout to see your recovery estimates.</Text>
        ) : Object.entries(fatigue).map(([muscle, recovery]) => (
          <View key={muscle} className="mb-3">
            <View className="mb-2 flex-row justify-between">
              <Text className="text-sm capitalize text-ink">{muscle}</Text>
              <Text className="text-xs font-semibold text-[#756E69]">{Math.round(recovery * 100)}%</Text>
            </View>
            <ProgressBar value={recovery * 100} color={recovery < 0.4 ? "#D68135" : "#6F9B75"} />
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}
