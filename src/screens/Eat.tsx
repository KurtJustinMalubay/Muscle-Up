import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { Apple, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react-native";
import Button from "../components/Button";
import Card from "../components/Card";
import Field from "../components/Field";
import Pill from "../components/Pill";
import ProgressBar from "../components/ProgressBar";
import ScreenHeader from "../components/ScreenHeader";
import SectionTitle from "../components/SectionTitle";
import {
  addNutritionEntry,
  dayKey,
  deleteNutritionEntry,
  getNutritionEntries,
  getNutritionTargets,
  type NutritionEntry,
  type NutritionTargets,
} from "../db";

const MEALS = ["Breakfast", "Lunch", "Dinner", "Snack"];
function mealForTime(date = new Date()) {
  const hour = date.getHours();
  return hour < 11 ? "Breakfast" : hour < 15 ? "Lunch" : hour < 18 ? "Snack" : "Dinner";
}

const NUMBER_FIELDS = [
  { key: "calories", label: "Calories", suffix: "kcal" },
  { key: "protein_g", label: "Protein", suffix: "g" },
  { key: "carbs_g", label: "Carbs", suffix: "g" },
  { key: "fat_g", label: "Fat", suffix: "g" },
] as const;
type NutritionField = (typeof NUMBER_FIELDS)[number]["key"];
type Totals = { calories: number; protein_g: number; carbs_g: number; fat_g: number };

export default function Eat({ refreshKey, onSettings }: { refreshKey?: string; onSettings?: () => void }) {
  const [entries, setEntries] = useState<NutritionEntry[]>([]);
  const [targets, setTargets] = useState<NutritionTargets | null>(null);
  const [meal, setMeal] = useState(mealForTime());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [foodName, setFoodName] = useState("");
  const [amounts, setAmounts] = useState<Record<NutritionField, string>>({
    calories: "", protein_g: "", carbs_g: "", fat_g: "",
  });
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const todayKey = dayKey();
  const selectedDayKey = dayKey(selectedDate);
  const isToday = selectedDayKey === todayKey;
  const dateLabel = selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const load = useCallback(async () => {
    try {
      const [dayEntries, nutritionTargets] = await Promise.all([getNutritionEntries(selectedDate), getNutritionTargets()]);
      setEntries(dayEntries);
      setTargets(nutritionTargets);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load today's food log.");
    }
  }, [selectedDate]);
  useEffect(() => { void load(); }, [load, refreshKey]);

  const totals = useMemo<Totals>(() => entries.reduce((sum, item) => ({
    calories: sum.calories + item.calories,
    protein_g: sum.protein_g + item.protein_g,
    carbs_g: sum.carbs_g + item.carbs_g,
    fat_g: sum.fat_g + item.fat_g,
  }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }), [entries]);

  const save = async () => {
    const parsed = Object.fromEntries(Object.entries(amounts).map(([key, value]) => [key, Number(value)])) as Record<NutritionField, number>;
    if (!foodName.trim() || Object.values(parsed).some((value) => !Number.isFinite(value) || value < 0)) {
      setError("Enter a food name and valid nutrition values. Use 0 for any amount you don't know.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await addNutritionEntry({
        meal_type: meal,
        food_name: foodName,
        serving: 1,
        date: selectedDate,
        ...parsed,
      });
      setFoodName("");
      setAmounts({ calories: "", protein_g: "", carbs_g: "", fat_g: "" });
      setShowForm(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save this food.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item: NutritionEntry) => {
    try {
      await deleteNutritionEntry(item.id);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete this food entry.");
    }
  };

  const confirmRemove = (item: NutritionEntry) => {
    Alert.alert("Remove food entry?", `Remove ${item.food_name} from this day’s log?`, [
      { text: "Keep it", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => void remove(item) },
    ]);
  };

  const changeDate = (offset: number) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + offset);
    if (dayKey(next) <= todayKey) setSelectedDate(next);
  };

  const openMeal = (mealName: string) => {
    setMeal(mealName);
    setShowForm(true);
    setError("");
  };

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ padding: 20, paddingTop: 16, paddingBottom: 32 }}>
      <ScreenHeader title="Eat" subtitle="Fuel your day, one meal at a time" onSettings={onSettings} />
      <View className="mb-4 flex-row items-center justify-between rounded-2xl bg-white px-3 py-2">
        <Pressable accessibilityRole="button" accessibilityLabel="Previous day" onPress={() => changeDate(-1)} className="h-11 w-11 items-center justify-center rounded-full bg-[#F3EFEC]">
          <ChevronLeft size={20} color="#2C2C2C" />
        </Pressable>
        <View className="items-center">
          <Text className="text-sm font-bold text-ink">{isToday ? "Today" : dateLabel}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next day"
          disabled={isToday}
          onPress={() => changeDate(1)}
          className={`h-11 w-11 items-center justify-center rounded-full ${isToday ? "opacity-30" : "bg-[#F3EFEC]"}`}
        >
          <ChevronRight size={20} color="#2C2C2C" />
        </Pressable>
      </View>
      {error ? <Text accessibilityRole="alert" className="mb-3 text-sm text-terracotta">{error}</Text> : null}
      {!targets && !error ? <ActivityIndicator color="#C85A32" /> : null}
      <Card className="border-0 bg-ink">
        <Text className="text-xs font-bold uppercase tracking-widest text-[#F6A27D]">DAILY ENERGY</Text>
        <View className="mb-4 mt-2 flex-row items-end">
          <Text className="text-4xl font-extrabold text-white">{Math.round(totals.calories)}</Text>
          <Text className="mb-1 ml-2 text-sm text-white/70">/ {targets?.calories ?? 2000} kcal</Text>
        </View>
        <ProgressBar value={100 * totals.calories / (targets?.calories ?? 2000)} color="#F6A27D" trackColor="#514742" height={10} />
        <Text className="mt-3 text-xs text-white/65">Targets are guides, not a measure of success. Adjust them in Settings.</Text>
      </Card>

      <SectionTitle title="Daily macros" />
      <View className="flex-row">
        {[
          ["Protein", totals.protein_g, targets?.protein ?? 130, "#C85A32"],
          ["Carbs", totals.carbs_g, targets?.carbs ?? 220, "#578F83"],
          ["Fat", totals.fat_g, targets?.fat ?? 65, "#CF9C48"],
        ].map(([label, amount, target, color]) => (
          <Card key={String(label)} className="mr-2 flex-1 p-3">
            <Text className="text-xs text-[#756E69]">{label}</Text>
            <Text className="mt-2 text-lg font-extrabold text-ink">{Math.round(Number(amount))}<Text className="text-xs font-medium text-[#756E69]"> g</Text></Text>
            <ProgressBar value={100 * Number(amount) / Number(target)} color={String(color)} height={5} />
            <Text className="mt-2 text-[10px] text-[#756E69]">of {target}g</Text>
          </Card>
        ))}
      </View>

      {!entries.length ? (
        <Card className="mt-5 items-center py-6">
          <Apple size={22} color="#C85A32" />
          <Text className="mt-3 font-bold text-ink">Nothing logged for this day</Text>
          <Text className="mt-1 text-center text-sm text-[#756E69]">Add a meal or snack to see your daily totals.</Text>
          {!showForm ? <View className="mt-4"><Button label="Log your first food" onPress={() => setShowForm(true)} /></View> : null}
        </Card>
      ) : null}
      <SectionTitle title="Meals" action={showForm ? "Cancel" : "Log food"} onAction={() => { setShowForm((value) => !value); setError(""); }} />
      {showForm ? (
        <Card className="mb-3">
          <Text className="mb-1 text-base font-bold text-ink">Add to {meal.toLowerCase()}</Text>
          <Text className="mb-3 text-xs leading-5 text-[#756E69]">Enter what you know; nutrition amounts can be estimates.</Text>
          <View className="mb-2 flex-row flex-wrap">{MEALS.map((item) => <Pill key={item} label={item} selected={meal === item} onPress={() => setMeal(item)} />)}</View>
          <Field label="Food or drink" value={foodName} onChangeText={setFoodName} placeholder="e.g. Greek yogurt" maxLength={100} />
          {NUMBER_FIELDS.map(({ key, label, suffix }) => (
            <Field
              key={key}
              label={label}
              value={amounts[key]}
              onChangeText={(value) => setAmounts((current) => ({ ...current, [key]: value }))}
              keyboardType="decimal-pad"
              placeholder="0"
              suffix={suffix}
            />
          ))}
          <Button label="Save food" loading={busy} onPress={() => void save()} />
        </Card>
      ) : null}
      {MEALS.map((mealName) => {
        const group = entries.filter((entry) => entry.meal_type === mealName);
        return (
          <View key={mealName}>
            <SectionTitle title={mealName} action="Add food" onAction={() => openMeal(mealName)} />
            {group.map((entry) => (
              <Card key={entry.id} className="mb-2 flex-row items-center py-4">
                <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-[#F9EAE3]">
                  <Apple size={19} color="#C85A32" />
                </View>
                <View className="flex-1">
                  <Text className="font-bold text-ink">{entry.food_name}</Text>
                  <Text className="mt-1 text-xs text-[#756E69]">
                    {Math.round(entry.calories)} kcal · P {Math.round(entry.protein_g)}g · C {Math.round(entry.carbs_g)}g · F {Math.round(entry.fat_g)}g
                  </Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${entry.food_name}`} onPress={() => confirmRemove(entry)} className="h-11 w-11 items-center justify-center">
                  <Trash2 size={17} color="#817A75" />
                </Pressable>
              </Card>
            ))}
          </View>
        );
      })}
      <View className="mt-3 flex-row items-center rounded-2xl bg-[#F2ECE8] p-4">
        <Plus size={16} color="#756E69" />
        <Text className="ml-2 flex-1 text-xs leading-5 text-[#756E69]">Nutrition estimates are entered by you. Check food labels when precision matters.</Text>
      </View>
    </ScrollView>
  );
}
