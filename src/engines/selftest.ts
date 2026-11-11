import { nextSessionWeight, plateBreakdown, warmupSets, fatigueIndex } from "./index.ts";
import { nextRoutineSession } from "../workouts/routineQueue.ts";
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
eq(nextSessionWeight({ weightKg: 100, targetReps: 8, repsHit: 6, rpe: 9.5 }), 95, "deload");
eq(nextSessionWeight({ weightKg: 100, targetReps: 8, repsHit: 10, rpe: 7 }), 102.5, "progress");
eq(nextSessionWeight({ weightKg: 100, targetReps: 8, repsHit: 8, rpe: 8 }), 100, "hold");
eq(plateBreakdown(100).loadedKg, 100, "plates");
eq(warmupSets(100).map(s => s.weightKg), [50, 70, 85], "warmups");
const routineJson = JSON.stringify({
  title: "Strength cycle",
  exercises: [{ name: "Bench Press", muscle: "chest", sets: 3, reps: 8 }],
  days: [
    { title: "Push", exercises: [{ name: "Bench Press", muscle: "chest", sets: 3, reps: 8 }] },
    { title: "Pull", exercises: [{ name: "Barbell Row", muscle: "back", sets: 4, reps: 10 }] },
  ],
});
eq(nextRoutineSession("Strength cycle", routineJson, []).title, "Strength cycle · Push", "first routine session");
eq(nextRoutineSession("Strength cycle", routineJson, ["Strength cycle · Push"]).title, "Strength cycle · Pull", "next routine session");
eq(nextRoutineSession("Strength cycle", routineJson, ["Strength cycle · Push", "Strength cycle · Pull"]).title, "Strength cycle · Push", "routine cycle");
eq(nextRoutineSession("Strength cycle", routineJson, ["Strength cycle - Push"]).title, "Strength cycle · Pull", "legacy routine history");
eq(nextRoutineSession("Strength cycle", routineJson, []).exercises[0].sets, 3, "queued exercise prescription");
let invalidRoutineRejected = false;
try {
  nextRoutineSession("Broken", JSON.stringify({ exercises: [] }), []);
} catch {
  invalidRoutineRejected = true;
}
eq(invalidRoutineRejected, true, "invalid routine validation");
console.log("engine tests passed", fatigueIndex([{ muscle: "chest", workingSets: 4, finishedAt: Date.now() - 36e5 * 26 }]));
