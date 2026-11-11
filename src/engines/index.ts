// Deterministic engines: no AI, no network. Pure functions, fully offline.

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

export interface SetResult { weightKg: number; targetReps: number; repsHit: number; rpe: number }

/** Auto-regulation + double progression (Blueprint VI). */
export function nextSessionWeight(r: SetResult, incrementKg = 2.5): number {
  if (r.rpe >= 9 && r.repsHit < r.targetReps) return roundTo(r.weightKg * 0.95, 1.25); // -5%
  if (r.rpe <= 7 && r.repsHit > r.targetReps) return roundTo(r.weightKg + incrementKg, 1.25); // +2.5kg
  return r.weightKg;
}

/** Barbell plate breakdown, per side. Greedy works for standard plate sets. */
export function plateBreakdown(
  targetKg: number, barKg = 20, plates = [25, 20, 15, 10, 5, 2.5, 1.25],
): { perSide: { plate: number; count: number }[]; loadedKg: number } {
  let rest = Math.max(0, (targetKg - barKg) / 2);
  const perSide: { plate: number; count: number }[] = [];
  for (const plate of plates) {
    const count = Math.floor(rest / plate + 1e-9);
    if (count > 0) { perSide.push({ plate, count }); rest -= count * plate; }
  }
  const side = perSide.reduce((s, p) => s + p.plate * p.count, 0);
  return { perSide, loadedKg: barKg + side * 2 };
}

/** Pyramid warm-ups at 50/70/85% of working weight. */
export function warmupSets(workingKg: number, barKg = 20) {
  return [[0.5, 8], [0.7, 5], [0.85, 3]]
    .map(([pct, reps]) => ({ weightKg: Math.max(barKg, roundTo(workingKg * pct, 2.5)), reps, isWarmup: true }))
    .filter((s, i, a) => s.weightKg < workingKg && (i === 0 || s.weightKg !== a[i - 1].weightKg));
}

export interface SessionLog { muscle: string; workingSets: number; finishedAt: number }

/** Recovery index per muscle: 0 = fresh fatigue, 1 = fully recovered. */
export function fatigueIndex(logs: SessionLog[], now = Date.now()): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of logs) {
    const recoveryH = 36 + Math.min(l.workingSets, 12) * 4; // 40h for 1 set .. 84h for 12+
    const elapsedH = (now - l.finishedAt) / 36e5;
    const idx = Math.min(1, Math.max(0, elapsedH / recoveryH));
    out[l.muscle] = Math.min(out[l.muscle] ?? 1, idx); // most recent hard session wins
  }
  return out;
}
