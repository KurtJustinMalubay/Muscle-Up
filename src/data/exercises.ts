import type { ExercisePlan } from "../db";

export const EXERCISES: ExercisePlan[] = [
  { name: "Barbell Bench Press", muscle: "chest", sets: 3, reps: 8 },
  { name: "Push-Up", muscle: "chest", sets: 3, reps: 12 },
  { name: "Dumbbell Floor Press", muscle: "chest", sets: 3, reps: 10 },
  { name: "Dumbbell Row", muscle: "back", sets: 3, reps: 10 },
  { name: "Pull-Up", muscle: "back", sets: 3, reps: 8 },
  { name: "Barbell Row", muscle: "back", sets: 3, reps: 8 },
  { name: "Lat Pulldown", muscle: "back", sets: 3, reps: 10 },
  { name: "Back Squat", muscle: "quads", sets: 3, reps: 8 },
  { name: "Goblet Squat", muscle: "quads", sets: 3, reps: 10 },
  { name: "Split Squat", muscle: "quads", sets: 3, reps: 10 },
  { name: "Romanian Deadlift", muscle: "hamstrings", sets: 3, reps: 8 },
  { name: "Hip Thrust", muscle: "glutes", sets: 3, reps: 10 },
  { name: "Overhead Press", muscle: "shoulders", sets: 3, reps: 8 },
  { name: "Lateral Raise", muscle: "shoulders", sets: 3, reps: 12 },
  { name: "Biceps Curl", muscle: "arms", sets: 3, reps: 12 },
  { name: "Triceps Extension", muscle: "arms", sets: 3, reps: 12 },
  { name: "Plank", muscle: "core", sets: 3, reps: 1 },
  { name: "Dead Bug", muscle: "core", sets: 3, reps: 10 },
];
