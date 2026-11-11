import type { SQLiteDatabase } from "expo-sqlite";

async function ensureColumn(db: SQLiteDatabase, table: string, name: string, definition: string) {
  const found = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!found.some((column) => column.name === name)) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

export async function initializeSchema(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS user_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      fitness_level TEXT NOT NULL DEFAULT 'beginner',
      primary_goal TEXT NOT NULL DEFAULT 'strength',
      equipment_json TEXT NOT NULL DEFAULT '[]',
      joint_constraints_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_metrics (
      id TEXT PRIMARY KEY NOT NULL,
      profile_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
      age INTEGER NOT NULL DEFAULT 0,
      gender TEXT NOT NULL DEFAULT '',
      height_cm REAL NOT NULL DEFAULT 0,
      current_weight_kg REAL NOT NULL DEFAULT 0,
      target_weight_kg REAL NOT NULL DEFAULT 0,
      calculated_tdee REAL NOT NULL DEFAULT 0,
      calculated_bmi REAL NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workouts (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      date_logged INTEGER NOT NULL,
      is_completed INTEGER NOT NULL DEFAULT 0,
      duration_min INTEGER NOT NULL DEFAULT 0,
      session_rpe REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY NOT NULL,
      workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
      exercise_name TEXT NOT NULL,
      target_muscle TEXT NOT NULL,
      prescribed_sets INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS workout_sets (
      id TEXT PRIMARY KEY NOT NULL,
      exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
      set_number INTEGER NOT NULL,
      weight_kg REAL NOT NULL,
      reps_completed INTEGER NOT NULL,
      rpe_logged REAL NOT NULL,
      is_warmup INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      plan_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS progress_photos (
      id TEXT PRIMARY KEY NOT NULL,
      local_uri TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS nutrition_entries (
      id TEXT PRIMARY KEY NOT NULL,
      day_key TEXT NOT NULL,
      meal_type TEXT NOT NULL,
      food_name TEXT NOT NULL,
      serving REAL NOT NULL DEFAULT 1,
      calories REAL NOT NULL DEFAULT 0,
      protein_g REAL NOT NULL DEFAULT 0,
      carbs_g REAL NOT NULL DEFAULT 0,
      fat_g REAL NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS body_measurements (
      id TEXT PRIMARY KEY NOT NULL,
      measured_at INTEGER NOT NULL,
      weight_kg REAL,
      waist_cm REAL,
      chest_cm REAL,
      hips_cm REAL,
      notes TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      target_value REAL NOT NULL,
      current_value REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL,
      target_date INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS habits (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      target_per_week INTEGER NOT NULL DEFAULT 7,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS habit_logs (
      id TEXT PRIMARY KEY NOT NULL,
      habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
      day_key TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      UNIQUE(habit_id, day_key)
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key TEXT PRIMARY KEY NOT NULL,
      setting_value TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS exercises_workout_id ON exercises(workout_id);
    CREATE INDEX IF NOT EXISTS workout_sets_exercise_id ON workout_sets(exercise_id);
    CREATE INDEX IF NOT EXISTS workouts_date_logged ON workouts(date_logged);
    CREATE INDEX IF NOT EXISTS nutrition_entries_day_key ON nutrition_entries(day_key);
    CREATE INDEX IF NOT EXISTS body_measurements_measured_at ON body_measurements(measured_at);
    CREATE INDEX IF NOT EXISTS habit_logs_day_key ON habit_logs(day_key);
  `);

  await ensureColumn(db, "user_profiles", "display_name", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn(db, "user_profiles", "dietary_preferences_json", "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn(db, "user_profiles", "consented_at", "INTEGER");
  await ensureColumn(db, "user_metrics", "weekly_budget", "REAL NOT NULL DEFAULT 0");
  await ensureColumn(db, "user_metrics", "waist_cm", "REAL NOT NULL DEFAULT 0");
  await ensureColumn(db, "user_metrics", "chest_cm", "REAL NOT NULL DEFAULT 0");
}
