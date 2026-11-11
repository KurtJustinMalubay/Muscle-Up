import type { ExercisePlan, WorkoutDay, WorkoutPlan } from "../db";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readDay(value: unknown, fallbackTitle: string): WorkoutDay {
  if (!isRecord(value) || !Array.isArray(value.exercises)) {
    throw new Error("This routine contains an invalid workout day.");
  }
  const exercises = value.exercises.map((item): ExercisePlan => {
    if (!isRecord(item) || typeof item.name !== "string" || typeof item.muscle !== "string" ||
        !Number.isInteger(item.sets) || Number(item.sets) < 1 ||
        !Number.isInteger(item.reps) || Number(item.reps) < 1) {
      throw new Error("This routine contains an invalid exercise prescription.");
    }
    return {
      name: item.name,
      muscle: item.muscle,
      sets: Number(item.sets),
      reps: Number(item.reps),
    };
  });
  if (!exercises.length) throw new Error("This routine has no exercises in its next workout.");
  return {
    title: typeof value.title === "string" && value.title.trim() ? value.title : fallbackTitle,
    exercises,
  };
}

export function nextRoutineSession(
  title: string,
  planJson: string,
  completedWorkoutTitles: string[],
): WorkoutPlan {
  let value: unknown;
  try {
    value = JSON.parse(planJson);
  } catch {
    throw new Error("This saved routine could not be read. Rebuild or re-import it.");
  }
  if (!isRecord(value)) throw new Error("This saved routine is invalid.");

  const days = Array.isArray(value.days) && value.days.length
    ? value.days.map((day) => readDay(day, title))
    : [readDay({ title, exercises: value.exercises }, title)];
  const completedForRoutine = completedWorkoutTitles.filter((workoutTitle) =>
    workoutTitle === title ||
    workoutTitle.startsWith(`${title} · `) ||
    workoutTitle.startsWith(`${title} - `),
  ).length;
  const next = days[completedForRoutine % days.length];
  return { title: `${title} · ${next.title}`, exercises: next.exercises };
}
