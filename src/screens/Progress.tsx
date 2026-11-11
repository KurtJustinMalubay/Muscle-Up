import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Check, CirclePlus, Footprints, Scale, Target, TrendingUp } from "lucide-react-native";
import Button from "../components/Button";
import Card from "../components/Card";
import Field from "../components/Field";
import ProgressBar from "../components/ProgressBar";
import ScreenHeader from "../components/ScreenHeader";
import SectionTitle from "../components/SectionTitle";
import SegmentedControl from "../components/SegmentedControl";
import {
  addBodyMeasurement,
  createGoal,
  createHabit,
  deleteGoal,
  getBodyMeasurements,
  getGoals,
  getHabitWeek,
  getHabits,
  getWorkoutHistory,
  seedStarterHabits,
  toggleHabit,
  updateGoalProgress,
  type BodyMeasurement,
  type FitnessGoal,
  type Habit,
  type WorkoutHistoryItem,
} from "../db";

type ViewMode = "Body" | "Workouts" | "Habits";
type HabitLog = { habit_id: string; day_key: string; completed: number };
const VIEWS: ViewMode[] = ["Body", "Workouts", "Habits"];

function dayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function Progress({ refreshKey, onSettings }: { refreshKey?: string; onSettings?: () => void }) {
  const [view, setView] = useState<ViewMode>("Body");
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutHistoryItem[]>([]);
  const [goals, setGoals] = useState<FitnessGoal[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [measurementInputs, setMeasurementInputs] = useState({ weight: "", waist: "", chest: "", hips: "" });
  const [goalInputs, setGoalInputs] = useState({ title: "", target: "", unit: "kg", category: "body" });
  const [habitTitle, setHabitTitle] = useState("");
  const [showMeasurementForm, setShowMeasurementForm] = useState(false);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      await seedStarterHabits();
      const [bodyData, workoutData, goalData, habitData, logs] = await Promise.all([
        getBodyMeasurements(), getWorkoutHistory(30), getGoals(), getHabits(), getHabitWeek(),
      ]);
      setMeasurements(bodyData);
      setWorkouts(workoutData);
      setGoals(goalData);
      setHabits(habitData);
      setHabitLogs(logs);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load your progress.");
    }
  }, []);
  useEffect(() => { void load(); }, [load, refreshKey]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - 6 + index);
    return date;
  }), []);

  const saveMeasurement = async () => {
    const parsed = {
      weight_kg: measurementInputs.weight ? Number(measurementInputs.weight) : null,
      waist_cm: measurementInputs.waist ? Number(measurementInputs.waist) : null,
      chest_cm: measurementInputs.chest ? Number(measurementInputs.chest) : null,
      hips_cm: measurementInputs.hips ? Number(measurementInputs.hips) : null,
    };
    setBusy(true);
    setError("");
    try {
      await addBodyMeasurement({ ...parsed, notes: "" });
      setMeasurementInputs({ weight: "", waist: "", chest: "", hips: "" });
      setShowMeasurementForm(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your measurement.");
    } finally {
      setBusy(false);
    }
  };

  const addNewGoal = async () => {
    const target = Number(goalInputs.target);
    if (!goalInputs.title.trim() || !Number.isFinite(target) || target <= 0) {
      setError("Enter a goal name and a target greater than zero.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await createGoal({
        title: goalInputs.title,
        category: goalInputs.category,
        target_value: target,
        current_value: 0,
        unit: goalInputs.unit.trim() || "reps",
        target_date: null,
      });
      setGoalInputs({ title: "", target: "", unit: "kg", category: "body" });
      setShowGoalForm(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create your goal.");
    } finally {
      setBusy(false);
    }
  };

  const addNewHabit = async () => {
    setBusy(true);
    setError("");
    try {
      await createHabit(habitTitle);
      setHabitTitle("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create your habit.");
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = async (habit: Habit, date: Date) => {
    try {
      await toggleHabit(habit.id, date);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update your habit.");
    }
  };

  const renderBody = () => (
    <>
      <Card className="border-0 bg-ink">
        <View className="flex-row items-center">
          <View className="h-11 w-11 items-center justify-center rounded-full bg-white/10"><Scale size={21} color="#F6A27D" /></View>
          <View className="ml-3 flex-1">
            <Text className="text-xs font-semibold uppercase tracking-widest text-white/60">LATEST WEIGHT</Text>
            <Text className="mt-1 text-2xl font-extrabold text-white">
              {measurements.find((item) => item.weight_kg !== null)?.weight_kg ?? "—"}
              <Text className="text-sm font-medium text-white/65">{measurements.some((item) => item.weight_kg !== null) ? " kg" : " · add a measurement"}</Text>
            </Text>
          </View>
          <TrendingUp size={21} color="#F6A27D" />
        </View>
      </Card>
      <SectionTitle title="Body measurements" action={showMeasurementForm ? "Cancel" : "Add entry"} onAction={() => setShowMeasurementForm((value) => !value)} />
      {showMeasurementForm ? (
        <Card className="mb-3">
          <Text className="mb-3 text-sm text-[#756E69]">All fields are optional; add any measurements you want to track.</Text>
          <View className="flex-row">
            <View className="mr-2 flex-1"><Field label="Weight" value={measurementInputs.weight} onChangeText={(value) => setMeasurementInputs((current) => ({ ...current, weight: value }))} keyboardType="decimal-pad" placeholder="Optional" suffix="kg" /></View>
            <View className="flex-1"><Field label="Waist" value={measurementInputs.waist} onChangeText={(value) => setMeasurementInputs((current) => ({ ...current, waist: value }))} keyboardType="decimal-pad" placeholder="Optional" suffix="cm" /></View>
          </View>
          <View className="flex-row">
            <View className="mr-2 flex-1"><Field label="Chest" value={measurementInputs.chest} onChangeText={(value) => setMeasurementInputs((current) => ({ ...current, chest: value }))} keyboardType="decimal-pad" placeholder="Optional" suffix="cm" /></View>
            <View className="flex-1"><Field label="Hips" value={measurementInputs.hips} onChangeText={(value) => setMeasurementInputs((current) => ({ ...current, hips: value }))} keyboardType="decimal-pad" placeholder="Optional" suffix="cm" /></View>
          </View>
          <Button label="Save measurements" loading={busy} onPress={() => void saveMeasurement()} />
        </Card>
      ) : null}
      {measurements.length ? measurements.slice(0, 10).map((item) => (
        <Card key={item.id} className="mb-2 py-4">
          <Text className="mb-2 text-xs font-semibold text-[#756E69]">{new Date(item.measured_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</Text>
          <View className="flex-row flex-wrap">
            {[
              ["Weight", item.weight_kg, "kg"], ["Waist", item.waist_cm, "cm"],
              ["Chest", item.chest_cm, "cm"], ["Hips", item.hips_cm, "cm"],
            ].filter(([, value]) => value !== null).map(([label, value, unit]) => (
              <Text key={String(label)} className="mr-4 text-sm text-ink">{label}: <Text className="font-bold">{value} {unit}</Text></Text>
            ))}
          </View>
        </Card>
      )) : (
        <Card className="items-center py-7">
          <Scale size={22} color="#C85A32" />
          <Text className="mt-3 font-bold text-ink">No measurements yet</Text>
          <Text className="mt-1 text-center text-sm text-[#756E69]">Check in when it feels useful. Trends matter more than any single number.</Text>
        </Card>
      )}
      <SectionTitle title="Goals" action={showGoalForm ? "Cancel" : "Add goal"} onAction={() => setShowGoalForm((value) => !value)} />
      {showGoalForm ? (
        <Card className="mb-3">
          <Field label="Goal" value={goalInputs.title} onChangeText={(value) => setGoalInputs((current) => ({ ...current, title: value }))} placeholder="e.g. Run 5 km" maxLength={70} />
          <View className="flex-row">
            <View className="mr-2 flex-1"><Field label="Target" value={goalInputs.target} onChangeText={(value) => setGoalInputs((current) => ({ ...current, target: value }))} keyboardType="decimal-pad" placeholder="5" /></View>
            <View className="flex-1"><Field label="Unit" value={goalInputs.unit} onChangeText={(value) => setGoalInputs((current) => ({ ...current, unit: value }))} placeholder="km" maxLength={12} /></View>
          </View>
          <Text className="mb-2 text-xs text-[#756E69]">Use “+1” on a goal card to update its progress.</Text>
          <Button label="Save goal" loading={busy} onPress={() => void addNewGoal()} />
        </Card>
      ) : null}
      {goals.map((goal) => (
        <Card key={goal.id} className="mb-2">
          <View className="flex-row items-center">
            <View className="flex-1">
              <Text className="font-bold text-ink">{goal.title}</Text>
              <Text className="mt-1 text-xs text-[#756E69]">{goal.current_value} / {goal.target_value} {goal.unit}</Text>
            </View>
            <Pressable accessibilityLabel={`Increase progress on ${goal.title}`} onPress={() => {
              const nextValue = Math.min(goal.target_value, goal.current_value + 1);
              void updateGoalProgress(goal.id, nextValue).then(load).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not update your goal."));
            }} className="mr-2 rounded-full bg-[#F9EAE3] px-4 py-2"><Text className="font-bold text-terracotta">+1</Text></Pressable>
            <Pressable accessibilityLabel={`Delete ${goal.title}`} onPress={() => {
              void deleteGoal(goal.id).then(load).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not delete your goal."));
            }} className="p-2"><Text className="text-xs font-semibold text-[#817A75]">Remove</Text></Pressable>
          </View>
          <View className="mt-3"><ProgressBar value={100 * goal.current_value / goal.target_value} /></View>
        </Card>
      ))}
    </>
  );

  const renderWorkouts = () => (
    <>
      <Card className="border-0 bg-ink">
        <View className="flex-row items-center">
          <Footprints size={22} color="#F6A27D" />
          <View className="ml-3">
            <Text className="text-2xl font-extrabold text-white">{workouts.length}</Text>
            <Text className="text-xs text-white/70">completed sessions · recent history</Text>
          </View>
        </View>
      </Card>
      <SectionTitle title="Workout history" />
      {workouts.map((workout) => (
        <Card key={workout.id} className="mb-2 py-4">
          <View className="flex-row items-center">
            <View className="flex-1">
              <Text className="font-bold text-ink">{workout.title}</Text>
              <Text className="mt-1 text-xs text-[#756E69]">{new Date(workout.date_logged).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {workout.duration_min} min · {workout.set_count} sets</Text>
            </View>
            <View className="items-end">
              <Text className="font-bold text-terracotta">{Math.round(workout.volume_kg).toLocaleString()} kg</Text>
              <Text className="mt-1 text-[10px] text-[#756E69]">total volume</Text>
            </View>
          </View>
        </Card>
      ))}
      {!workouts.length ? <Card className="items-center py-8"><Text className="font-bold text-ink">Your first session is waiting</Text><Text className="mt-2 text-center text-sm text-[#756E69]">Completed workouts will show up here.</Text></Card> : null}
    </>
  );

  const renderHabits = () => (
    <>
      <Card className="border-0 bg-ink">
        <Text className="text-xs font-bold uppercase tracking-widest text-[#F6A27D]">SMALL THINGS ADD UP</Text>
        <Text className="mt-2 text-xl font-extrabold text-white">Build consistency, one day at a time.</Text>
        <Text className="mt-2 text-sm text-white/70">Tap a day to mark a habit complete.</Text>
      </Card>
      <SectionTitle title="Your habits" />
      {habits.map((habit) => (
        <Card key={habit.id} className="mb-3">
          <View className="mb-3 flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="font-bold text-ink">{habit.title}</Text>
              <Text className="mt-1 text-xs capitalize text-[#756E69]">{habit.category} · goal {habit.target_per_week} days/week</Text>
            </View>
            <Check size={18} color="#C85A32" />
          </View>
          <View className="flex-row justify-between">
            {weekDays.map((date) => {
              const key = dayKey(date);
              const completed = habitLogs.some((log) => log.habit_id === habit.id && log.day_key === key && log.completed === 1);
              return (
                <Pressable
                  accessibilityLabel={`${habit.title}, ${date.toLocaleDateString(undefined, { weekday: "long" })}, ${completed ? "completed" : "not completed"}`}
                  accessibilityRole="button"
                  key={key}
                  onPress={() => void handleToggle(habit, date)}
                  className={`h-9 w-9 items-center justify-center rounded-full ${completed ? "bg-terracotta" : "bg-[#F3EFEC]"}`}
                >
                  {completed ? <Check size={15} color="white" /> : <Text className="text-[10px] text-[#817A75]">{date.toLocaleDateString(undefined, { weekday: "narrow" })}</Text>}
                </Pressable>
              );
            })}
          </View>
        </Card>
      ))}
      <Card>
        <Text className="mb-3 font-bold text-ink">Add a habit</Text>
        <Field label="Habit name" value={habitTitle} onChangeText={setHabitTitle} placeholder="e.g. Take a daily walk" maxLength={60} />
        <Button label="Add habit" loading={busy} onPress={() => void addNewHabit()} />
      </Card>
    </>
  );

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ padding: 20, paddingTop: 16, paddingBottom: 32 }}>
      <ScreenHeader title="Progress" subtitle="Your effort, over time" onSettings={onSettings} />
      <SegmentedControl
        value={view}
        options={VIEWS.map((item) => ({ label: item, value: item }))}
        onChange={setView}
      />
      {error ? <Text accessibilityRole="alert" className="mb-3 text-sm text-terracotta">{error}</Text> : null}
      {!habits.length && !workouts.length && !measurements.length && !error ? <ActivityIndicator color="#C85A32" /> : null}
      {view === "Body" ? renderBody() : null}
      {view === "Workouts" ? renderWorkouts() : null}
      {view === "Habits" ? renderHabits() : null}
      <View className="mt-5 flex-row items-center rounded-2xl bg-[#F2ECE8] p-4">
        <CirclePlus size={16} color="#756E69" />
        <Text className="ml-2 flex-1 text-xs leading-5 text-[#756E69]">Progress tracking is private and stored on your device. Check in at a pace that feels right for you.</Text>
      </View>
    </ScrollView>
  );
}
