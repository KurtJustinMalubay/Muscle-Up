import * as SQLite from "expo-sqlite";
import { initializeSchema } from "./schema";
import { nextSessionWeight } from "../engines";

export type ExercisePlan = { name: string; muscle: string; sets: number; reps: number };
export type WorkoutDay = { title: string; exercises: ExercisePlan[] };
export type WorkoutPlan = WorkoutDay & { days?: WorkoutDay[] };
export type WorkoutSetRecord = { muscle: string; workingSets: number; finishedAt: number };
export type FitnessProfile = {
  displayName?: string;
  fitnessLevel: string;
  primaryGoal: string;
  equipment: string[];
  jointConstraints: string[];
  dietaryPreferences?: string[];
  consentedAt?: number | null;
};
export type UserMetrics = {
  age: number;
  gender: string;
  heightCm: number;
  currentWeightKg: number;
  targetWeightKg: number;
  tdee: number;
  weeklyBudget?: number;
  waistCm?: number;
  chestCm?: number;
};
export type DashboardData = {
  weeklySets: number[];
  recovery: WorkoutSetRecord[];
  nextWorkout: string | null;
};
export type NutritionTargets = { calories: number; protein: number; carbs: number; fat: number };
export type NutritionEntry = {
  id: string;
  day_key: string;
  meal_type: string;
  food_name: string;
  serving: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  created_at: number;
};
export type BodyMeasurement = {
  id: string;
  measured_at: number;
  weight_kg: number | null;
  waist_cm: number | null;
  chest_cm: number | null;
  hips_cm: number | null;
  notes: string;
};
export type FitnessGoal = {
  id: string;
  title: string;
  category: string;
  target_value: number;
  current_value: number;
  unit: string;
  target_date: number | null;
  is_active: number;
  created_at: number;
};
export type Habit = {
  id: string;
  title: string;
  category: string;
  target_per_week: number;
  is_active: number;
  created_at: number;
};
export type WorkoutHistoryItem = {
  id: string;
  title: string;
  date_logged: number;
  duration_min: number;
  session_rpe: number;
  set_count: number;
  volume_kg: number;
};
export type WorkoutSetInput = { weightKg: number; reps: number; isWarmup?: boolean };

const PROFILE_ID = "local-profile";
const METRICS_ID = "local-metrics";
const DEFAULT_NUTRITION_TARGETS: NutritionTargets = { calories: 2000, protein: 130, carbs: 220, fat: 65 };

let database: Promise<SQLite.SQLiteDatabase> | undefined;

function getDatabase() {
  if (!database) {
    database = SQLite.openDatabaseAsync("muscle-up.db").then(async (db) => {
      await initializeSchema(db);
      return db;
    });
  }
  return database;
}

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function dayKey(date: Date | number = Date.now()) {
  const value = typeof date === "number" ? new Date(date) : date;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function createWorkout(title: string) {
  const db = await getDatabase();
  const workoutId = id();
  await db.runAsync(
    "INSERT INTO workouts (id, title, date_logged, is_completed) VALUES (?, ?, ?, 0)",
    workoutId,
    title,
    Date.now(),
  );
  return workoutId;
}

export async function addWorkoutSet(
  workoutId: string,
  exercise: ExercisePlan,
  weightKg: number,
  reps: number,
  rpe: number,
  isWarmup = false,
) {
  if (!Number.isFinite(weightKg) || weightKg < 0 || !Number.isInteger(reps) || reps < 1 ||
      !Number.isFinite(rpe) || rpe < 1 || rpe > 10) {
    throw new Error("Check the weight, reps, and effort rating before logging this set.");
  }
  const db = await getDatabase();
  let row = await db.getFirstAsync<{ id: string; count: number }>(
    `SELECT id, (SELECT COUNT(*) FROM workout_sets WHERE exercise_id = exercises.id) AS count
     FROM exercises WHERE workout_id = ? AND exercise_name = ?`,
    workoutId,
    exercise.name,
  );
  if (!row) {
    const exerciseId = id();
    await db.runAsync(
      "INSERT INTO exercises (id, workout_id, exercise_name, target_muscle, prescribed_sets) VALUES (?, ?, ?, ?, ?)",
      exerciseId,
      workoutId,
      exercise.name,
      exercise.muscle,
      exercise.sets,
    );
    row = { id: exerciseId, count: 0 };
  }
  await db.runAsync(
    "INSERT INTO workout_sets (id, exercise_id, set_number, weight_kg, reps_completed, rpe_logged, is_warmup) VALUES (?, ?, ?, ?, ?, ?, ?)",
    id(),
    row.id,
    row.count + 1,
    weightKg,
    reps,
    rpe,
    isWarmup ? 1 : 0,
  );
}

export async function addWorkoutExerciseSets(workoutId: string, exercise: ExercisePlan, sets: WorkoutSetInput[]) {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    for (const set of sets) {
      await addWorkoutSet(workoutId, exercise, set.weightKg, set.reps, 8, set.isWarmup ?? false);
    }
  });
}

export async function completeWorkout(workoutId: string, rpe: number, durationMin: number) {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE workouts SET is_completed = 1, duration_min = ?, session_rpe = ? WHERE id = ?",
    Math.max(0, Math.round(durationMin)),
    Math.max(1, Math.min(10, rpe)),
    workoutId,
  );
}

export async function discardWorkout(workoutId: string) {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM workouts WHERE id = ? AND is_completed = 0", workoutId);
}

export async function suggestedWeight(exerciseName: string, targetReps: number): Promise<number | null> {
  const db = await getDatabase();
  const lastSet = await db.getFirstAsync<{ weight_kg: number; reps_completed: number; rpe_logged: number }>(
    `SELECT ws.weight_kg, ws.reps_completed, ws.rpe_logged
     FROM workout_sets ws JOIN exercises e ON e.id = ws.exercise_id
     JOIN workouts w ON w.id = e.workout_id
     WHERE e.exercise_name = ? AND w.is_completed = 1 AND ws.is_warmup = 0
     ORDER BY w.date_logged DESC, ws.weight_kg DESC, ws.set_number DESC LIMIT 1`,
    exerciseName,
  );
  if (!lastSet) return null;
  return nextSessionWeight({
    weightKg: lastSet.weight_kg,
    targetReps,
    repsHit: lastSet.reps_completed,
    rpe: lastSet.rpe_logged,
  });
}

export async function getDashboardData(now = Date.now()): Promise<DashboardData> {
  const db = await getDatabase();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);
  const rows = await db.getAllAsync<{ date_logged: number; set_count: number }>(
    `SELECT w.date_logged, COUNT(ws.id) AS set_count
     FROM workouts w
     LEFT JOIN exercises e ON e.workout_id = w.id
     LEFT JOIN workout_sets ws ON ws.exercise_id = e.id AND ws.is_warmup = 0
     WHERE w.date_logged >= ? AND w.is_completed = 1 GROUP BY w.id`,
    start.getTime(),
  );
  const weeklySets = Array(7).fill(0) as number[];
  for (const row of rows) {
    const date = new Date(row.date_logged);
    date.setHours(0, 0, 0, 0);
    const index = Math.round((date.getTime() - start.getTime()) / 86400000);
    if (index >= 0 && index < 7) weeklySets[index] += row.set_count;
  }
  const recovery = await db.getAllAsync<WorkoutSetRecord>(
    `SELECT e.target_muscle AS muscle, COUNT(ws.id) AS workingSets, w.date_logged AS finishedAt
     FROM workouts w JOIN exercises e ON e.workout_id = w.id
     JOIN workout_sets ws ON ws.exercise_id = e.id AND ws.is_warmup = 0
     WHERE w.is_completed = 1
     GROUP BY lower(e.target_muscle), w.id ORDER BY w.date_logged DESC`,
  );
  const nextWorkout = await db.getFirstAsync<{ title: string }>(
    "SELECT title FROM plans ORDER BY updated_at DESC LIMIT 1",
  );
  return { weeklySets, recovery, nextWorkout: nextWorkout?.title ?? null };
}

export async function getWorkoutHistory(limit = 30): Promise<WorkoutHistoryItem[]> {
  const db = await getDatabase();
  return db.getAllAsync<WorkoutHistoryItem>(
    `SELECT w.id, w.title, w.date_logged, w.duration_min, w.session_rpe,
      COUNT(CASE WHEN ws.is_warmup = 0 THEN ws.id END) AS set_count,
      COALESCE(SUM(CASE WHEN ws.is_warmup = 0 THEN ws.weight_kg * ws.reps_completed ELSE 0 END), 0) AS volume_kg
     FROM workouts w
     LEFT JOIN exercises e ON e.workout_id = w.id
     LEFT JOIN workout_sets ws ON ws.exercise_id = e.id
     WHERE w.is_completed = 1
     GROUP BY w.id ORDER BY w.date_logged DESC LIMIT ?`,
    Math.max(1, Math.min(100, Math.trunc(limit))),
  );
}

export async function getWorkoutWeekCount(now = Date.now()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM workouts WHERE is_completed = 1 AND date_logged >= ?",
    start.getTime(),
  );
  return result?.count ?? 0;
}

export async function savePlan(title: string, plan: WorkoutPlan) {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<{ id: string }>("SELECT id FROM plans WHERE title = ?", title);
  if (existing) {
    await db.runAsync(
      "UPDATE plans SET plan_json = ?, updated_at = ? WHERE id = ?",
      JSON.stringify(plan),
      Date.now(),
      existing.id,
    );
    return existing.id;
  }
  const planId = id();
  await db.runAsync(
    "INSERT INTO plans (id, title, plan_json, updated_at) VALUES (?, ?, ?, ?)",
    planId,
    title,
    JSON.stringify(plan),
    Date.now(),
  );
  return planId;
}

export async function listPlans() {
  const db = await getDatabase();
  return db.getAllAsync<{ id: string; title: string; plan_json: string; updated_at: number }>(
    "SELECT id, title, plan_json, updated_at FROM plans ORDER BY updated_at DESC",
  );
}

export async function getFitnessProfile(): Promise<FitnessProfile> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{
    display_name: string;
    fitness_level: string;
    primary_goal: string;
    equipment_json: string;
    joint_constraints_json: string;
    dietary_preferences_json: string;
    consented_at: number | null;
  }>(`SELECT display_name, fitness_level, primary_goal, equipment_json, joint_constraints_json,
      dietary_preferences_json, consented_at FROM user_profiles LIMIT 1`);
  if (!row) {
    return {
      displayName: "",
      fitnessLevel: "beginner",
      primaryGoal: "strength",
      equipment: ["bodyweight"],
      jointConstraints: [],
      dietaryPreferences: [],
      consentedAt: null,
    };
  }
  return {
    displayName: row.display_name,
    fitnessLevel: row.fitness_level,
    primaryGoal: row.primary_goal,
    equipment: JSON.parse(row.equipment_json) as string[],
    jointConstraints: JSON.parse(row.joint_constraints_json) as string[],
    dietaryPreferences: JSON.parse(row.dietary_preferences_json) as string[],
    consentedAt: row.consented_at,
  };
}

export async function hasCompletedAssessment() {
  const profile = await getFitnessProfile();
  return Boolean(profile.displayName?.trim() && profile.consentedAt);
}

export async function saveFitnessProfile(profile: FitnessProfile, metrics?: UserMetrics) {
  const db = await getDatabase();
  const now = Date.now();
  const equipment = [...new Set(profile.equipment.map((item) => item.trim()).filter(Boolean))];
  const constraints = [...new Set(profile.jointConstraints.map((item) => item.trim()).filter(Boolean))];
  const dietary = [...new Set((profile.dietaryPreferences ?? []).map((item) => item.trim()).filter(Boolean))];
  const bmi = metrics && metrics.heightCm > 0
    ? metrics.currentWeightKg / (metrics.heightCm / 100) ** 2
    : 0;
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO user_profiles
        (id, display_name, fitness_level, primary_goal, equipment_json, joint_constraints_json,
         dietary_preferences_json, created_at, consented_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, fitness_level = excluded.fitness_level,
         primary_goal = excluded.primary_goal, equipment_json = excluded.equipment_json,
         joint_constraints_json = excluded.joint_constraints_json,
         dietary_preferences_json = excluded.dietary_preferences_json, consented_at = excluded.consented_at`,
      PROFILE_ID,
      profile.displayName?.trim() ?? "",
      profile.fitnessLevel,
      profile.primaryGoal,
      JSON.stringify(equipment),
      JSON.stringify(constraints),
      JSON.stringify(dietary),
      now,
      profile.consentedAt ?? null,
    );
    if (metrics) {
      await db.runAsync(
        `INSERT INTO user_metrics
          (id, profile_id, age, gender, height_cm, current_weight_kg, target_weight_kg, calculated_tdee,
           calculated_bmi, updated_at, weekly_budget, waist_cm, chest_cm)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET age = excluded.age, gender = excluded.gender,
           height_cm = excluded.height_cm, current_weight_kg = excluded.current_weight_kg,
           target_weight_kg = excluded.target_weight_kg, calculated_tdee = excluded.calculated_tdee,
           calculated_bmi = excluded.calculated_bmi, updated_at = excluded.updated_at,
           weekly_budget = excluded.weekly_budget, waist_cm = excluded.waist_cm, chest_cm = excluded.chest_cm`,
        METRICS_ID,
        PROFILE_ID,
        metrics.age,
        metrics.gender,
        metrics.heightCm,
        metrics.currentWeightKg,
        metrics.targetWeightKg,
        metrics.tdee,
        bmi,
        now,
        metrics.weeklyBudget ?? 0,
        metrics.waistCm ?? 0,
        metrics.chestCm ?? 0,
      );
    }
  });
}

export async function getUserMetrics(): Promise<UserMetrics | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{
    age: number;
    gender: string;
    height_cm: number;
    current_weight_kg: number;
    target_weight_kg: number;
    calculated_tdee: number;
    weekly_budget: number;
    waist_cm: number;
    chest_cm: number;
  }>(`SELECT age, gender, height_cm, current_weight_kg, target_weight_kg, calculated_tdee,
      weekly_budget, waist_cm, chest_cm FROM user_metrics LIMIT 1`);
  if (!row) return null;
  return {
    age: row.age,
    gender: row.gender,
    heightCm: row.height_cm,
    currentWeightKg: row.current_weight_kg,
    targetWeightKg: row.target_weight_kg,
    tdee: row.calculated_tdee,
    weeklyBudget: row.weekly_budget,
    waistCm: row.waist_cm,
    chestCm: row.chest_cm,
  };
}

export async function saveNutritionTargets(targets: NutritionTargets) {
  for (const [label, value] of Object.entries(targets)) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Enter a valid daily ${label} target.`);
  }
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    for (const [key, value] of Object.entries(targets)) {
      await db.runAsync(
        "INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value",
        `nutrition_${key}`,
        String(value),
      );
    }
  });
}

export async function getAppSetting(key: string) {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ setting_value: string }>(
    "SELECT setting_value FROM app_settings WHERE setting_key = ?",
    key,
  );
  return row?.setting_value ?? null;
}

export async function saveAppSetting(key: string, value: string) {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
     ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value`,
    key,
    value,
  );
}

export async function getNutritionTargets(): Promise<NutritionTargets> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ setting_key: string; setting_value: string }>(
    "SELECT setting_key, setting_value FROM app_settings WHERE setting_key LIKE 'nutrition_%'",
  );
  const values = new Map(rows.map((row) => [row.setting_key, Number(row.setting_value)]));
  const get = (key: keyof NutritionTargets) => {
    const value = values.get(`nutrition_${key}`);
    return value && Number.isFinite(value) && value > 0 ? value : DEFAULT_NUTRITION_TARGETS[key];
  };
  return { calories: get("calories"), protein: get("protein"), carbs: get("carbs"), fat: get("fat") };
}

export async function getNutritionEntries(date: Date | number = Date.now()): Promise<NutritionEntry[]> {
  const db = await getDatabase();
  return db.getAllAsync<NutritionEntry>(
    "SELECT * FROM nutrition_entries WHERE day_key = ? ORDER BY created_at ASC",
    dayKey(date),
  );
}

export async function addNutritionEntry(entry: Omit<NutritionEntry, "id" | "day_key" | "created_at"> & { date?: Date | number }) {
  if (!entry.food_name.trim()) throw new Error("Add a name for this food.");
  const numbers = [entry.serving, entry.calories, entry.protein_g, entry.carbs_g, entry.fat_g];
  if (numbers.some((value) => !Number.isFinite(value) || value < 0) || entry.serving <= 0) {
    throw new Error("Check the serving size and nutrition amounts.");
  }
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO nutrition_entries
      (id, day_key, meal_type, food_name, serving, calories, protein_g, carbs_g, fat_g, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id(),
    dayKey(entry.date ?? Date.now()),
    entry.meal_type,
    entry.food_name.trim(),
    entry.serving,
    entry.calories,
    entry.protein_g,
    entry.carbs_g,
    entry.fat_g,
    Date.now(),
  );
}

export async function deleteNutritionEntry(entryId: string) {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM nutrition_entries WHERE id = ?", entryId);
}

export async function getNutritionWeek(date: Date | number = Date.now()) {
  const selected = typeof date === "number" ? new Date(date) : new Date(date);
  selected.setHours(0, 0, 0, 0);
  selected.setDate(selected.getDate() - 6);
  const startKey = dayKey(selected);
  const db = await getDatabase();
  return db.getAllAsync<{ day_key: string; calories: number; protein: number }>(
    `SELECT day_key, SUM(calories) AS calories, SUM(protein_g) AS protein
     FROM nutrition_entries WHERE day_key >= ? GROUP BY day_key`,
    startKey,
  );
}

export async function addBodyMeasurement(measurement: Omit<BodyMeasurement, "id" | "measured_at"> & { measuredAt?: number }) {
  const values = [measurement.weight_kg, measurement.waist_cm, measurement.chest_cm, measurement.hips_cm];
  if (values.every((value) => value === null) ||
      values.some((value) => value !== null && (!Number.isFinite(value) || value <= 0))) {
    throw new Error("Enter at least one valid measurement.");
  }
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO body_measurements
      (id, measured_at, weight_kg, waist_cm, chest_cm, hips_cm, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id(),
    measurement.measuredAt ?? Date.now(),
    measurement.weight_kg,
    measurement.waist_cm,
    measurement.chest_cm,
    measurement.hips_cm,
    measurement.notes.trim(),
  );
  if (measurement.weight_kg !== null) {
    await db.runAsync(
      "UPDATE user_metrics SET current_weight_kg = ?, updated_at = ? WHERE id = ?",
      measurement.weight_kg,
      Date.now(),
      METRICS_ID,
    );
  }
}

export async function getBodyMeasurements(limit = 30) {
  const db = await getDatabase();
  return db.getAllAsync<BodyMeasurement>(
    "SELECT * FROM body_measurements ORDER BY measured_at DESC LIMIT ?",
    Math.max(1, Math.min(365, Math.trunc(limit))),
  );
}

export async function createGoal(goal: Pick<FitnessGoal, "title" | "category" | "target_value" | "current_value" | "unit" | "target_date">) {
  if (!goal.title.trim() || !Number.isFinite(goal.target_value) || goal.target_value <= 0 ||
      !Number.isFinite(goal.current_value) || goal.current_value < 0) throw new Error("Enter a name and a valid target for your goal.");
  const db = await getDatabase();
  const goalId = id();
  await db.runAsync(
    "INSERT INTO goals (id, title, category, target_value, current_value, unit, target_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    goalId,
    goal.title.trim(),
    goal.category,
    goal.target_value,
    goal.current_value,
    goal.unit,
    goal.target_date,
    Date.now(),
  );
  return goalId;
}

export async function updateGoalProgress(goalId: string, currentValue: number) {
  if (!Number.isFinite(currentValue) || currentValue < 0) throw new Error("Enter a valid progress amount.");
  const db = await getDatabase();
  await db.runAsync("UPDATE goals SET current_value = ? WHERE id = ?", currentValue, goalId);
}

export async function deleteGoal(goalId: string) {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM goals WHERE id = ?", goalId);
}

export async function getGoals() {
  const db = await getDatabase();
  return db.getAllAsync<FitnessGoal>("SELECT * FROM goals WHERE is_active = 1 ORDER BY created_at DESC");
}

export async function createHabit(title: string, category = "wellness", targetPerWeek = 7) {
  if (!title.trim() || !Number.isInteger(targetPerWeek) || targetPerWeek < 1 || targetPerWeek > 7) {
    throw new Error("Enter a habit name and a weekly target from 1 to 7.");
  }
  const db = await getDatabase();
  await db.runAsync(
    "INSERT INTO habits (id, title, category, target_per_week, created_at) VALUES (?, ?, ?, ?, ?)",
    id(),
    title.trim(),
    category,
    targetPerWeek,
    Date.now(),
  );
}

export async function seedStarterHabits() {
  const db = await getDatabase();
  const count = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM habits");
  if (count?.count) return;
  await db.withTransactionAsync(async () => {
    for (const [title, category, target] of [
      ["Move your body", "movement", 4],
      ["Drink enough water", "nutrition", 7],
      ["Get 7+ hours of sleep", "recovery", 5],
    ] as const) {
      await db.runAsync(
        "INSERT INTO habits (id, title, category, target_per_week, created_at) VALUES (?, ?, ?, ?, ?)",
        id(),
        title,
        category,
        target,
        Date.now(),
      );
    }
  });
}

export async function getHabits() {
  const db = await getDatabase();
  return db.getAllAsync<Habit>("SELECT * FROM habits WHERE is_active = 1 ORDER BY created_at");
}

export async function toggleHabit(habitId: string, date: Date | number = Date.now()) {
  const db = await getDatabase();
  const key = dayKey(date);
  const existing = await db.getFirstAsync<{ completed: number }>(
    "SELECT completed FROM habit_logs WHERE habit_id = ? AND day_key = ?",
    habitId,
    key,
  );
  await db.runAsync(
    `INSERT INTO habit_logs (id, habit_id, day_key, completed) VALUES (?, ?, ?, ?)
     ON CONFLICT(habit_id, day_key) DO UPDATE SET completed = excluded.completed`,
    id(),
    habitId,
    key,
    existing?.completed ? 0 : 1,
  );
}

export async function getHabitWeek(date: Date | number = Date.now()) {
  const selected = typeof date === "number" ? new Date(date) : new Date(date);
  selected.setHours(0, 0, 0, 0);
  selected.setDate(selected.getDate() - 6);
  const db = await getDatabase();
  return db.getAllAsync<{ habit_id: string; day_key: string; completed: number }>(
    "SELECT habit_id, day_key, completed FROM habit_logs WHERE day_key >= ?",
    dayKey(selected),
  );
}

export async function exportData() {
  const db = await getDatabase();
  const names = [
    "user_profiles", "user_metrics", "workouts", "exercises", "workout_sets", "plans",
    "nutrition_entries", "body_measurements", "goals", "habits", "habit_logs", "app_settings",
  ];
  const tables: Record<string, unknown[]> = {};
  for (const name of names) tables[name] = await db.getAllAsync(`SELECT * FROM ${name}`);
  return { format: "muscle-up-backup", version: 2, exportedAt: Date.now(), tables };
}

export async function importData(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== "object") throw new Error("The selected file is not a valid Muscle Up backup.");
  const parsed = snapshot as { format?: unknown; version?: unknown; tables?: unknown };
  if (parsed.format !== "muscle-up-backup" || ![1, 2].includes(Number(parsed.version)) ||
      !parsed.tables || typeof parsed.tables !== "object") {
    throw new Error("The selected file is not a supported Muscle Up backup.");
  }
  const tables = parsed.tables as Record<string, unknown>;
  const columnsByTable: Record<string, string[]> = {
    user_profiles: ["id", "fitness_level", "primary_goal", "equipment_json", "joint_constraints_json", "created_at", "display_name", "dietary_preferences_json", "consented_at"],
    user_metrics: ["id", "profile_id", "age", "gender", "height_cm", "current_weight_kg", "target_weight_kg", "calculated_tdee", "calculated_bmi", "updated_at", "weekly_budget", "waist_cm", "chest_cm"],
    workouts: ["id", "title", "date_logged", "is_completed", "duration_min", "session_rpe"],
    exercises: ["id", "workout_id", "exercise_name", "target_muscle", "prescribed_sets"],
    workout_sets: ["id", "exercise_id", "set_number", "weight_kg", "reps_completed", "rpe_logged", "is_warmup"],
    plans: ["id", "title", "plan_json", "updated_at"],
    nutrition_entries: ["id", "day_key", "meal_type", "food_name", "serving", "calories", "protein_g", "carbs_g", "fat_g", "created_at"],
    body_measurements: ["id", "measured_at", "weight_kg", "waist_cm", "chest_cm", "hips_cm", "notes"],
    goals: ["id", "title", "category", "target_value", "current_value", "unit", "target_date", "is_active", "created_at"],
    habits: ["id", "title", "category", "target_per_week", "is_active", "created_at"],
    habit_logs: ["id", "habit_id", "day_key", "completed"],
    app_settings: ["setting_key", "setting_value"],
  };
  for (const table of ["user_profiles", "user_metrics", "workouts", "exercises", "workout_sets", "plans"]) {
    if (!Array.isArray(tables[table])) throw new Error(`The backup is missing the ${table} table.`);
  }
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    const importOrder = [
      "habit_logs", "nutrition_entries", "body_measurements", "goals", "habits",
      "workout_sets", "exercises", "workouts", "user_metrics", "user_profiles", "plans", "app_settings",
    ];
    for (const table of importOrder) {
      if (Array.isArray(tables[table])) await db.runAsync(`DELETE FROM ${table}`);
    }
    for (const table of [
      "user_profiles", "user_metrics", "workouts", "exercises", "workout_sets", "plans",
      "nutrition_entries", "body_measurements", "goals", "habits", "habit_logs", "app_settings",
    ]) {
      const records = tables[table];
      if (!Array.isArray(records)) continue;
      for (const record of records) {
        if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error(`Invalid record in ${table}.`);
        const values = record as Record<string, unknown>;
        const columns = Object.keys(values);
        const primaryKey = table === "app_settings" ? "setting_key" : "id";
        if (!columns.includes(primaryKey) || columns.some((column) => !columnsByTable[table].includes(column)) ||
            columns.some((column) => values[column] !== null && !["string", "number"].includes(typeof values[column]))) {
          throw new Error(`Invalid record in ${table}.`);
        }
        await db.runAsync(
          `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
          ...columns.map((column) => values[column] as string | number | null),
        );
      }
    }
  });
}

export async function savePhoto(uri: string) {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT INTO progress_photos (id, local_uri, created_at) VALUES (?, ?, ?)",
    id(),
    uri,
    Date.now(),
  );
}

export async function deletePhoto(photoId: string) {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM progress_photos WHERE id = ?", photoId);
}

export async function listPhotos() {
  const db = await getDatabase();
  return db.getAllAsync<{ id: string; local_uri: string; created_at: number }>(
    "SELECT id, local_uri, created_at FROM progress_photos ORDER BY created_at DESC",
  );
}

export async function getRecentWorkouts() {
  const db = await getDatabase();
  return db.getAllAsync<{ title: string; date_logged: number; duration_min: number; session_rpe: number }>(
    "SELECT title, date_logged, duration_min, session_rpe FROM workouts WHERE is_completed = 1 ORDER BY date_logged DESC LIMIT 5",
  );
}

export async function initializeDatabase() {
  await getDatabase();
}
