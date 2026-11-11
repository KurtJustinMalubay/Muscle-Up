import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import * as Speech from "expo-speech";
import { addWorkoutSet, completeWorkout, createWorkout, getFitnessProfile, getWorkoutHistory, listPlans, savePlan, suggestedWeight, type ExercisePlan, type WorkoutHistoryItem, type WorkoutPlan } from "../db";
import { EXERCISES } from "../data/exercises";
import { nextSessionWeight, plateBreakdown, warmupSets } from "../engines";
import { nextRoutineSession } from "../workouts/routineQueue";
import { requestApi } from "../api";
import ScreenHeader from "../components/ScreenHeader";
import Card from "../components/Card";
import SectionTitle from "../components/SectionTitle";
import SegmentedControl from "../components/SegmentedControl";

type StoredPlan = { id: string; title: string; plan_json: string };
type Mode = "session" | "history" | "creator";
const BODYWEIGHT_EXERCISES = new Set(["Push-Up", "Split Squat", "Hip Thrust", "Plank", "Dead Bug"]);
const BARBELL_EXERCISES = new Set(["Barbell Bench Press", "Barbell Row", "Back Squat", "Romanian Deadlift", "Overhead Press"]);
const MODE_OPTIONS = [
  { label: "Workout", value: "session" },
  { label: "History", value: "history" },
  { label: "Build plan", value: "creator" },
] as const;

function startingWeight(exerciseName: string) {
  if (BODYWEIGHT_EXERCISES.has(exerciseName)) return 0;
  return BARBELL_EXERCISES.has(exerciseName) ? 20 : 10;
}

export default function Logger({ onRequestAI, onSettings }: { onRequestAI: () => Promise<boolean>; onSettings?: () => void }) {
  const [mode, setMode] = useState<Mode>("session");
  const [weight, setWeight] = useState(20);
  const [rpe, setRpe] = useState(8);
  const [reps, setReps] = useState(8);
  const [rest, setRest] = useState<number | null>(null);
  const [exercise, setExercise] = useState<ExercisePlan>(EXERCISES[0]);
  const [activePlan, setActivePlan] = useState<WorkoutPlan | null>(null);
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null);
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [workoutId, setWorkoutId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [setCount, setSetCount] = useState(0);
  const [exerciseSetCounts, setExerciseSetCounts] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState("");
  const [planTitle, setPlanTitle] = useState("");
  const [selected, setSelected] = useState<string[]>([EXERCISES[0].name, EXERCISES[3].name, EXERCISES[7].name]);
  const [plans, setPlans] = useState<StoredPlan[]>([]);
  const [history, setHistory] = useState<WorkoutHistoryItem[]>([]);
  const [exerciseQuery, setExerciseQuery] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const plates = plateBreakdown(weight);

  const selectExercise = (selectedExercise: ExercisePlan) => {
    setExercise(selectedExercise);
    setReps(selectedExercise.reps);
  };

  const refreshPlans = async () => {
    try {
      const savedPlans = await listPlans();
      setPlans(savedPlans);
      return savedPlans;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load saved plans.");
      return [];
    }
  };
  const refreshHistory = async () => {
    try {
      const completed = await getWorkoutHistory();
      setHistory(completed);
      return completed;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load workout history.");
      return history;
    }
  };

  useEffect(() => {
    let active = true;
    void Promise.all([listPlans(), getWorkoutHistory()]).then(([savedPlans, completed]) => {
      if (!active) return;
      setPlans(savedPlans);
      setHistory(completed);
      if (savedPlans.length) choosePlan(savedPlans[0], completed.map((item) => item.title));
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Could not load your training plans.");
    });
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);

  useEffect(() => {
    if (workoutId) return;
    let active = true;
    suggestedWeight(exercise.name, exercise.reps).then((value) => {
      if (active) setWeight(value ?? startingWeight(exercise.name));
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Could not load your suggested weight.");
    });
    return () => { active = false; };
  }, [exercise.name, exercise.reps, workoutId]);

  const startRest = (seconds = 90) => {
    if (timer.current) clearInterval(timer.current);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRest(seconds);
    timer.current = setInterval(() => {
      setRest((remaining) => {
        if (remaining === null || remaining <= 1) {
          if (timer.current) clearInterval(timer.current);
          timer.current = null;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          Speech.speak("Rest complete");
          return null;
        }
        return remaining - 1;
      });
    }, 1000);
  };

  const beginWorkout = async () => {
    if (workoutId) return workoutId;
    const newId = await createWorkout(activePlan?.title ?? exercise.name);
    setWorkoutId(newId);
    setStartedAt(Date.now());
    Speech.speak(`${exercise.name}. Begin your workout.`);
    return newId;
  };

  const logSet = async (setWeight = weight, isWarmup = false, setReps = reps) => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const currentWorkoutId = await beginWorkout();
      await addWorkoutSet(currentWorkoutId, exercise, setWeight, setReps, rpe, isWarmup);
      setSetCount((count) => count + 1);
      if (!isWarmup && activePlan) {
        setExerciseSetCounts((counts) => {
          const next = [...counts];
          next[exerciseIndex] = (next[exerciseIndex] ?? 0) + 1;
          return next;
        });
      }
      Speech.speak(isWarmup ? "Warm-up set logged" : "Set logged");
      startRest(isWarmup ? 60 : 90);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your set.");
    } finally {
      setSaving(false);
    }
  };

  const saveCustomPlan = async () => {
    const title = planTitle.trim();
    const selectedExercises = EXERCISES.filter((item) => selected.includes(item.name));
    if (!title || selectedExercises.length === 0) {
      setError("Enter a plan name and choose at least one exercise.");
      return;
    }
    try {
      await savePlan(title, { title, exercises: selectedExercises });
      setPlanTitle("");
      setError("");
      const savedPlans = await refreshPlans();
      const savedPlan = savedPlans.find((plan) => plan.title === title);
      if (savedPlan) choosePlan(savedPlan);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your plan.");
    }
  };

  const generateAIPlan = async () => {
    if (!(await onRequestAI())) return;
    setAiBusy(true);
    setError("");
    try {
      const profile = await getFitnessProfile();
      const result = await requestApi<{ days?: { title?: string; exercises?: { name?: string; muscle?: string; sets?: number; rep_range?: string }[] }[] }>("generate-plan", {
        fitness_level: profile.fitnessLevel,
        primary_goal: profile.primaryGoal,
        equipment: profile.equipment,
        joint_constraints: profile.jointConstraints,
        days_per_week: 3,
      });
      if (!Array.isArray(result.days) || result.days.length === 0) throw new Error("The AI returned an empty workout plan.");
      const days = result.days.map((day) => {
        if (!day.title || !Array.isArray(day.exercises) || day.exercises.length === 0) {
          throw new Error("The AI returned a workout day without any exercises.");
        }
        return {
          title: day.title,
          exercises: day.exercises.map((item) => {
            const repsTarget = item.rep_range?.match(/\d+/)?.[0];
            const exerciseInfo = EXERCISES.find((entry) => entry.name === item.name);
            if (!exerciseInfo || typeof item.sets !== "number" || !Number.isInteger(item.sets) || item.sets < 1 || !repsTarget) {
              throw new Error(`The AI returned invalid prescription details for ${item.name ?? "an exercise"}.`);
            }
            return { ...exerciseInfo, sets: item.sets, reps: Number(repsTarget) };
          }),
        };
      });
      const plan: WorkoutPlan = { title: `AI workout program ${new Date().toLocaleString()}`, exercises: days[0].exercises, days };
      await savePlan(plan.title, plan);
      const savedPlans = await refreshPlans();
      const savedPlan = savedPlans.find((item) => item.title === plan.title);
      if (savedPlan) choosePlan(savedPlan);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not generate an AI workout.");
    } finally {
      setAiBusy(false);
    }
  };

  const exportPlan = async (plan: StoredPlan) => {
    try {
      const content = JSON.stringify({ format: "muscle-up-program", version: 1, ...JSON.parse(plan.plan_json) }, null, 2);
      const uri = `${FileSystem.cacheDirectory}${plan.title.replace(/[^a-z0-9-_]/gi, "_")}.muscleup.json`;
      await FileSystem.writeAsStringAsync(uri, content);
      if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is not available on this device.");
      await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "Share workout program" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not export this plan.");
    }
  };

  const importPlan = async () => {
    try {
      const selection = await DocumentPicker.getDocumentAsync({ type: "application/json", copyToCacheDirectory: true });
      if (selection.canceled) return;
      const raw = await FileSystem.readAsStringAsync(selection.assets[0].uri);
      const value = JSON.parse(raw) as { format?: string; title?: string; exercises?: ExercisePlan[]; days?: WorkoutPlan["days"] };
      if (value.format !== "muscle-up-program" || typeof value.title !== "string" || !Array.isArray(value.exercises) || value.exercises.length === 0) {
        throw new Error("This file is not a valid Muscle Up program.");
      }
      const validExercises = (items: ExercisePlan[]) => items.every((item) =>
        item && typeof item.name === "string" && typeof item.muscle === "string" &&
        Number.isInteger(item.sets) && item.sets > 0 && Number.isInteger(item.reps) && item.reps > 0,
      );
      if (!validExercises(value.exercises) || (value.days && (!Array.isArray(value.days) || value.days.some((day) =>
        !day || typeof day.title !== "string" || !Array.isArray(day.exercises) || !validExercises(day.exercises),
      )))) throw new Error("The program contains an invalid exercise.");
      const plan: WorkoutPlan = { title: value.title, exercises: value.exercises, days: value.days };
      await savePlan(plan.title, plan);
      const savedPlans = await refreshPlans();
      const savedPlan = savedPlans.find((item) => item.title === plan.title);
      if (savedPlan) choosePlan(savedPlan);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not import this program.");
    }
  };

  const choosePlan = (plan: StoredPlan, completedTitles = history.map((item) => item.title), clearError = true) => {
    try {
      const session = nextRoutineSession(plan.title, plan.plan_json, completedTitles);
      const first = session.exercises[0];
      setActivePlan(session);
      setSelectedRoutineId(plan.id);
      setExerciseIndex(0);
      setExerciseSetCounts(Array(session.exercises.length).fill(0));
      selectExercise(first);
      setReps(first.reps);
      setSetCount(0);
      if (clearError) setError("");
      setMode("session");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open this plan.");
    }
  };

  const startWorkout = async () => {
    if (!activePlan || workoutId) return;
    setSaving(true);
    setError("");
    try {
      const id = await createWorkout(activePlan.title);
      setWorkoutId(id);
      setStartedAt(Date.now());
      const first = activePlan.exercises[0];
      selectExercise(first);
      try {
        const suggestion = await suggestedWeight(first.name, first.reps);
        setWeight(suggestion ?? startingWeight(first.name));
      } catch (reason) {
        setError(reason instanceof Error ? `Workout started, but ${reason.message}` : "Workout started, but could not load a suggested weight.");
      }
      Speech.speak(`${first.name}. Begin your workout.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start this workout.");
    } finally {
      setSaving(false);
    }
  };

  const advanceExercise = async () => {
    if (!activePlan || exerciseIndex + 1 >= activePlan.exercises.length) return;
    setSaving(true);
    const nextIndex = exerciseIndex + 1;
    const next = activePlan.exercises[nextIndex];
    setExerciseIndex(nextIndex);
    selectExercise(next);
    setReps(next.reps);
    try {
      const suggestion = await suggestedWeight(next.name, next.reps);
      setWeight(suggestion ?? startingWeight(next.name));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load your suggested weight.");
    } finally {
      setSaving(false);
    }
    Speech.speak(next.name);
  };

  const finishWorkout = async () => {
    if (!workoutId) return;
    setSaving(true);
    setError("");
    try {
      await completeWorkout(workoutId, rpe, Math.max(1, Math.round((Date.now() - (startedAt ?? Date.now())) / 60000)));
      let completed = history;
      let historyRefreshFailed = false;
      try {
        completed = await getWorkoutHistory();
        setHistory(completed);
      } catch (reason) {
        historyRefreshFailed = true;
        setError(reason instanceof Error ? `Workout saved, but ${reason.message}` : "Workout saved, but history could not be refreshed.");
      }
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      setRest(null);
      setWorkoutId(null);
      setStartedAt(null);
      setSetCount(0);
      setExerciseSetCounts([]);
      setExerciseIndex(0);
      const selectedRoutine = plans.find((plan) => plan.id === selectedRoutineId);
      if (selectedRoutine) {
        const completedTitles = completed.map((item) => item.title);
        if (activePlan && !completedTitles.includes(activePlan.title)) completedTitles.push(activePlan.title);
        choosePlan(selectedRoutine, completedTitles, !historyRefreshFailed);
      }
      else setActivePlan(null);
      setMode("session");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not finish the workout.");
    } finally {
      setSaving(false);
    }
  };

  const Btn = ({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) => (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} className={`mr-2 min-h-11 justify-center rounded-xl bg-clay px-4 py-2.5 ${disabled ? "opacity-50" : "active:opacity-70"}`}>
      <Text className="font-semibold text-ink">{label}</Text>
    </Pressable>
  );

  return (
    <>
      <ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ padding: 20, paddingTop: 16, paddingBottom: 32 }}>
        <ScreenHeader
          title={workoutId ? "Workout" : "Train"}
          subtitle={workoutId ? activePlan?.title : "Your plan, ready when you are"}
          onSettings={workoutId ? undefined : onSettings}
        />
        {!workoutId ? (
          <SegmentedControl
            value={mode}
            options={MODE_OPTIONS.map(({ label, value }) => ({ label, value }))}
            onChange={(nextMode) => {
              setMode(nextMode);
              if (nextMode === "history") void refreshHistory();
            }}
          />
        ) : null}
        {mode === "session" ? (
          <View>
          {!workoutId ? (
            <>
              {activePlan ? (
                <Card className="mb-4 border-0 bg-ink">
                  <Text className="text-xs font-bold uppercase tracking-widest text-[#F6A27D]">UP NEXT</Text>
                  <Text className="mt-2 text-2xl font-extrabold text-white">{activePlan.title}</Text>
                  <Text className="mt-2 text-sm text-white/75">
                    {activePlan.exercises.length} exercises · about {activePlan.exercises.length * 8} minutes
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={saving}
                    onPress={() => void startWorkout()}
                    className="mt-5 min-h-14 items-center justify-center rounded-2xl bg-terracotta px-5"
                  >
                    {saving ? <ActivityIndicator color="white" /> : <Text className="text-base font-bold text-white">Start this workout</Text>}
                  </Pressable>
                </Card>
              ) : (
                <Card className="mb-4 border-0 bg-ink">
                  <Text className="text-xs font-bold uppercase tracking-widest text-[#F6A27D]">YOUR TRAINING PLAN</Text>
                  <Text className="mt-2 text-2xl font-extrabold text-white">Choose a routine. We’ll guide the session.</Text>
                  <Text className="mt-2 text-sm leading-5 text-white/75">Start from your saved plan, generate a program, or build a routine once and reuse it.</Text>
                  {!plans.length ? (
                    <View className="mt-4">
                      <Pressable accessibilityRole="button" onPress={() => setMode("creator")} className="mb-2 min-h-12 items-center justify-center rounded-xl bg-terracotta px-4">
                        <Text className="font-bold text-white">Build your first routine</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" disabled={aiBusy} onPress={() => void generateAIPlan()} className="min-h-12 items-center justify-center rounded-xl bg-white/10 px-4">
                        {aiBusy ? <ActivityIndicator color="white" /> : <Text className="font-semibold text-white">Generate a personalized program</Text>}
                      </Pressable>
                    </View>
                  ) : null}
                </Card>
              )}
              {plans.length ? (
                <>
                  <SectionTitle title="Your routines" action="Build a plan" onAction={() => setMode("creator")} />
                  {plans.map((plan) => {
                    let summary = "Saved routine";
                    try {
                      const parsed = JSON.parse(plan.plan_json) as WorkoutPlan;
                      const dayCount = parsed.days?.length ?? 1;
                      const exerciseCount = parsed.days?.[0]?.exercises.length ?? parsed.exercises.length;
                      summary = `${dayCount} ${dayCount === 1 ? "workout" : "workouts"} · ${exerciseCount} exercises`;
                    } catch (reason) {
                      console.warn("Could not read routine summary.", reason);
                    }
                    return (
                      <Pressable
                        key={plan.id}
                        accessibilityRole="button"
                        onPress={() => choosePlan(plan)}
                        className={`mb-3 flex-row items-center rounded-2xl border px-4 py-4 ${activePlan?.title.startsWith(plan.title) ? "border-terracotta bg-[#F9EAE3]" : "border-[#EEE8E5] bg-white"}`}
                      >
                        <View className="mr-3 h-11 w-11 items-center justify-center rounded-full bg-[#F8F3F0]">
                          <Text className="text-lg font-extrabold text-terracotta">{plan.title.slice(0, 1).toUpperCase()}</Text>
                        </View>
                        <View className="flex-1">
                          <Text numberOfLines={1} className="font-bold text-ink">{plan.title}</Text>
                          <Text className="mt-1 text-xs text-[#756E69]">{summary} · next session ready</Text>
                        </View>
                        <Text className="ml-2 text-sm font-bold text-terracotta">{activePlan?.title.startsWith(plan.title) ? "Selected" : "Select"}</Text>
                      </Pressable>
                    );
                  })}
                </>
              ) : null}
              {activePlan ? (
                <>
                  <SectionTitle title="Workout queue" action="Change routine" onAction={() => setActivePlan(null)} />
                  <Text className="mb-3 text-sm text-[#756E69]">Exercises and target sets are loaded from your routine. You can adjust working weight during the workout.</Text>
                  {activePlan.exercises.map((item, index) => (
                    <Card key={`${item.name}-${index}`} className="mb-2 flex-row items-center py-4">
                      <View className="mr-3 h-8 w-8 items-center justify-center rounded-full bg-[#F9EAE3]">
                        <Text className="text-xs font-bold text-terracotta">{index + 1}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="font-bold text-ink">{item.name}</Text>
                        <Text className="mt-1 text-xs capitalize text-[#756E69]">{item.muscle} · {item.sets} sets × {item.reps} reps</Text>
                      </View>
                    </Card>
                  ))}
                </>
              ) : null}
            </>
          ) : activePlan ? (
            <>
              <Card className="mb-4 border-0 bg-ink">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-bold uppercase tracking-widest text-[#F6A27D]">EXERCISE {exerciseIndex + 1} OF {activePlan.exercises.length}</Text>
                  <Text className="text-xs font-semibold text-white/70">{exerciseSetCounts.reduce((sum, count) => sum + count, 0)} / {activePlan.exercises.reduce((sum, item) => sum + item.sets, 0)} sets</Text>
                </View>
                <Text className="mt-2 text-2xl font-extrabold text-white">{exercise.name}</Text>
                <Text className="mt-1 text-sm capitalize text-white/70">{exercise.muscle} · target {exercise.sets} sets × {exercise.reps} reps</Text>
                <View className="mt-4 flex-row">
                  {activePlan.exercises.map((item, index) => (
                    <View key={`${item.name}-${index}`} className={`mr-1 h-1.5 flex-1 rounded-full ${index <= exerciseIndex ? "bg-[#F6A27D]" : "bg-white/20"}`} />
                  ))}
                </View>
              </Card>
              <Card className="mb-4">
                <View className="mb-4 flex-row items-center justify-between">
                  <View>
                    <Text className="text-xs font-semibold uppercase tracking-widest text-[#756E69]">SUGGESTED WORKING WEIGHT</Text>
                    <Text className="mt-1 text-4xl font-extrabold text-ink">{weight}<Text className="text-lg font-semibold"> kg</Text></Text>
                  </View>
                  <View className="flex-row">
                    <Pressable accessibilityRole="button" accessibilityLabel="Decrease weight by 2.5 kilograms" onPress={() => setWeight((value) => Math.max(0, value - 2.5))} className="mr-2 h-12 w-12 items-center justify-center rounded-full bg-[#F3EFEC]"><Text className="text-xl font-bold text-ink">−</Text></Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel="Increase weight by 2.5 kilograms" onPress={() => setWeight((value) => value + 2.5)} className="h-12 w-12 items-center justify-center rounded-full bg-[#F3EFEC]"><Text className="text-xl font-bold text-ink">+</Text></Pressable>
                  </View>
                </View>
                {BARBELL_EXERCISES.has(exercise.name) ? (
                  <Text className="mb-3 text-xs text-[#756E69]">Per side: {plates.perSide.map((plate) => `${plate.count} × ${plate.plate}`).join(", ") || "bar only"}{plates.loadedKg < weight ? ` · loads ${plates.loadedKg} kg` : ""}</Text>
                ) : (
                  <Text className="mb-3 text-xs text-[#756E69]">{BODYWEIGHT_EXERCISES.has(exercise.name) ? "Bodyweight exercise" : "External load"}{weight > 0 ? ` · ${weight} kg` : ""}</Text>
                )}
                <View className="mb-4 flex-row items-center justify-between rounded-2xl bg-[#F8F6F4] px-4 py-3">
                  <Text className="text-sm font-semibold text-ink">Reps this set</Text>
                  <View className="flex-row items-center">
                    <Pressable accessibilityRole="button" accessibilityLabel="Remove one rep" onPress={() => setReps((value) => Math.max(1, value - 1))} className="h-10 w-10 items-center justify-center rounded-full bg-white"><Text className="text-lg font-bold text-ink">−</Text></Pressable>
                    <Text className="w-12 text-center text-lg font-bold text-ink">{reps}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="Add one rep" onPress={() => setReps((value) => value + 1)} className="h-10 w-10 items-center justify-center rounded-full bg-white"><Text className="text-lg font-bold text-ink">+</Text></Pressable>
                  </View>
                </View>
                <View className="mb-4 flex-row flex-wrap">
                  {Array.from({ length: exercise.sets }, (_, index) => {
                    const complete = index < (exerciseSetCounts[exerciseIndex] ?? 0);
                    return (
                      <View key={index} className={`mb-2 mr-2 rounded-full px-3 py-1.5 ${complete ? "bg-[#E8F2EC]" : "bg-[#F3EFEC]"}`}>
                        <Text className={`text-xs font-semibold ${complete ? "text-[#517D61]" : "text-[#756E69]"}`}>Set {index + 1}{complete ? " · done" : ""}</Text>
                      </View>
                    );
                  })}
                </View>
                {warmupSets(weight).length ? (
                  <View className="mb-4">
                    <Text className="mb-2 text-sm font-semibold text-ink">Warm-up</Text>
                    <View className="flex-row flex-wrap">
                      {warmupSets(weight).map((set) => <Btn key={set.weightKg} label={`${set.weightKg} kg × ${set.reps}`} onPress={() => logSet(set.weightKg, true, set.reps)} disabled={saving} />)}
                    </View>
                  </View>
                ) : null}
                <View className="mb-4 flex-row items-center justify-between rounded-2xl bg-[#F8F6F4] px-4 py-3">
                  <Text className="text-sm text-[#756E69]">Effort after the set</Text>
                  <View className="flex-row items-center">
                    <Pressable accessibilityRole="button" accessibilityLabel="Decrease effort rating" onPress={() => setRpe((value) => Math.max(1, value - 1))} className="h-10 w-10 items-center justify-center rounded-full bg-white"><Text className="text-lg font-bold text-ink">−</Text></Pressable>
                    <Text className="w-14 text-center text-base font-bold text-ink">{rpe}<Text className="font-normal text-[#756E69]"> / 10</Text></Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="Increase effort rating" onPress={() => setRpe((value) => Math.min(10, value + 1))} className="h-10 w-10 items-center justify-center rounded-full bg-white"><Text className="text-lg font-bold text-ink">+</Text></Pressable>
                  </View>
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={saving || (exerciseSetCounts[exerciseIndex] ?? 0) >= exercise.sets}
                  className="min-h-14 items-center justify-center rounded-2xl bg-terracotta px-5 disabled:opacity-50"
                  onPress={() => void logSet()}
                >
                  {saving ? <ActivityIndicator color="white" /> : (
                    <Text className="text-base font-bold text-white">
                      {(exerciseSetCounts[exerciseIndex] ?? 0) >= exercise.sets ? "Exercise complete" : rest ? `Log set · ${rest}s rest` : `Log set ${Math.min((exerciseSetCounts[exerciseIndex] ?? 0) + 1, exercise.sets)} of ${exercise.sets}`}
                    </Text>
                  )}
                </Pressable>
                {rest !== null ? (
                  <View className="mt-3 flex-row items-center justify-between rounded-xl bg-[#F8F3F0] px-4 py-3">
                    <Text className="font-semibold text-ink">{rest}s rest remaining</Text>
                    <Pressable accessibilityRole="button" onPress={() => { if (timer.current) clearInterval(timer.current); timer.current = null; setRest(null); }} className="min-h-10 justify-center">
                      <Text className="font-semibold text-terracotta">Skip rest</Text>
                    </Pressable>
                  </View>
                ) : null}
                {(exerciseSetCounts[exerciseIndex] ?? 0) >= exercise.sets ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={saving || rest !== null}
                    onPress={() => exerciseIndex + 1 < activePlan.exercises.length
                      ? void advanceExercise()
                      : Alert.alert("Finish workout?", "You’ve completed every exercise in your routine.", [
                        { text: "Keep reviewing", style: "cancel" },
                        { text: "Finish workout", onPress: () => void finishWorkout() },
                      ])}
                    className="mt-3 min-h-14 items-center justify-center rounded-2xl bg-ink px-5"
                  >
                    <Text className="text-base font-bold text-white">
                      {exerciseIndex + 1 < activePlan.exercises.length
                        ? `Next exercise · ${activePlan.exercises[exerciseIndex + 1].name}`
                        : "Finish workout"}
                    </Text>
                  </Pressable>
                ) : null}
                <Text className="mt-4 text-center text-xs text-[#756E69]">Next time: {nextSessionWeight({ weightKg: weight, targetReps: exercise.reps, repsHit: reps, rpe })} kg · saved automatically</Text>
              </Card>
              <Pressable
                accessibilityRole="button"
                disabled={saving}
                onPress={() => Alert.alert("End workout early?", "Your logged sets will be saved in workout history.", [
                  { text: "Keep training", style: "cancel" },
                  { text: "End workout", style: "destructive", onPress: () => void finishWorkout() },
                ])}
                className={`mb-3 min-h-11 items-center justify-center ${saving ? "opacity-50" : ""}`}
              >
                <Text className="font-semibold text-[#756E69]">End workout early</Text>
              </Pressable>
            </>
          ) : null}
          </View>
        ) : mode === "history" ? (
        <View>
          <Card className="mb-4 border-0 bg-ink">
            <Text className="text-xs font-bold uppercase tracking-widest text-[#F6A27D]">YOUR WORK</Text>
            <Text className="mt-2 text-2xl font-extrabold text-white">{history.length} recent sessions</Text>
            <Text className="mt-2 text-sm text-white/70">Your completed sessions, sets, and training volume.</Text>
          </Card>
          {history.map((item) => (
            <Card key={item.id} className="mb-3">
              <Text className="text-base font-bold text-ink">{item.title}</Text>
              <Text className="mt-1 text-xs text-[#756E69]">{new Date(item.date_logged).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · {item.duration_min} minutes</Text>
              <View className="mt-4 flex-row justify-between border-t border-[#EEE8E5] pt-3">
                <Text className="text-xs text-[#756E69]">{item.set_count} working sets</Text>
                <Text className="text-xs font-semibold text-terracotta">{Math.round(item.volume_kg).toLocaleString()} kg volume</Text>
              </View>
            </Card>
          ))}
          {!history.length ? <Card className="items-center py-8"><Text className="font-bold text-ink">No sessions completed yet</Text><Text className="mt-2 text-sm text-[#756E69]">Finish a workout and it will appear here.</Text></Card> : null}
        </View>
      ) : (
        <View>
          <Card className="mb-4 border-0 bg-ink">
            <Text className="text-xs font-bold uppercase tracking-widest text-[#F6A27D]">MAKE IT YOURS</Text>
            <Text className="mt-2 text-2xl font-extrabold text-white">Create a routine.</Text>
            <Text className="mt-2 text-sm leading-5 text-white/70">Save programs locally, or share and import them as JSON.</Text>
          </Card>
          <Text className="mb-3 mt-2 text-sm leading-5 text-[#756E69]">Set up your routine once. Your exercise order, target sets, and reps will be ready each time you start it.</Text>
          <TextInput value={planTitle} onChangeText={setPlanTitle} placeholder="Plan name" className="mb-4 rounded-xl border border-clay bg-white p-3 text-ink" />
          <TextInput
            value={exerciseQuery}
            onChangeText={setExerciseQuery}
            placeholder="Search exercises"
            placeholderTextColor="#908984"
            className="mb-3 min-h-12 rounded-2xl border border-[#E8E2DF] bg-white px-4 text-base text-ink"
          />
          <Text className="mb-3 text-xs font-semibold text-[#756E69]">{selected.length} exercises selected · tap to add or remove</Text>
          <View className="flex-row flex-wrap">
            {EXERCISES.filter((item) => `${item.name} ${item.muscle}`.toLowerCase().includes(exerciseQuery.trim().toLowerCase())).map((item) => {
              const isSelected = selected.includes(item.name);
              return <Pressable key={item.name} onPress={() => setSelected((value) => isSelected ? value.filter((name) => name !== item.name) : [...value, item.name])} className={`mb-2 mr-2 rounded-xl px-3 py-2 ${isSelected ? "bg-terracotta" : "bg-clay"}`}>
                <Text className={isSelected ? "text-white" : "text-ink"}>{isSelected ? "✓ " : ""}{item.name}</Text>
              </Pressable>;
            })}
          </View>
          <Pressable onPress={saveCustomPlan} className="mt-3 items-center rounded-xl bg-terracotta p-4"><Text className="font-semibold text-white">Save plan</Text></Pressable>
          <Pressable disabled={aiBusy} onPress={generateAIPlan} className="mt-3 items-center rounded-xl bg-ink p-4 disabled:opacity-50">
            {aiBusy ? <ActivityIndicator color="white" /> : <Text className="font-semibold text-white">Generate AI plan</Text>}
          </Pressable>
          <Pressable onPress={importPlan} className="mt-3 items-center rounded-xl bg-clay p-4"><Text className="font-semibold text-ink">Import JSON program</Text></Pressable>
          <Text className="mt-4 font-semibold text-ink">Saved plans</Text>
          {plans.map((plan) => <View key={plan.id} className="mt-2 flex-row items-center justify-between rounded-xl bg-white p-3">
            <Pressable className="flex-1" onPress={() => choosePlan(plan)}><Text className="font-semibold text-ink">{plan.title}</Text></Pressable>
            <Btn label="Export" onPress={() => exportPlan(plan)} />
          </View>)}
        </View>
      )}
      {error ? <Text accessibilityRole="alert" className="mt-3 text-terracotta">{error}</Text> : null}
      </ScrollView>
    </>
  );
}
