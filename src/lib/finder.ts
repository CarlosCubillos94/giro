export type Judgment = "fast" | "slow" | "good";
export type ShotKind = "clean" | "over" | "under" | "wide";

export type Shot = {
  kind: ShotKind;
  ms: number;
  hit: boolean;
};

export type RoundSummary = {
  shots: number;
  hits: number;
  over: number;
  under: number;
  wide: number;
  medianMs: number | null;
  suggestion: Judgment | null;
};

export type SearchStep = {
  lb: number;
  ub: number;
  done: boolean;
  cm: number;
};

export const SEARCH_MIN = 16;
export const SEARCH_MAX = 72;
export const HIT_RADIUS_DEG = 1.25;
export const HFOV = 103;

/** Past the target center by this many degrees counts as an overflick. */
const OVERSHOOT_DEG = 1.1;
const UNDERSHOOT_DEG = 0.8;

export function classifyShot(
  hit: boolean,
  maxPast: number,
  overshootDeg = OVERSHOOT_DEG,
  undershootDeg = UNDERSHOOT_DEG,
): ShotKind {
  if (maxPast > overshootDeg) return "over";
  if (hit) return "clean";
  if (maxPast < -undershootDeg) return "under";
  return "wide";
}

export function suggestJudgment(shots: Shot[]): Judgment | null {
  if (shots.length < 4) return null;
  const over = shots.filter((shot) => shot.kind === "over").length / shots.length;
  const under = shots.filter((shot) => shot.kind === "under").length / shots.length;
  if (over >= 0.34 && over > under + 0.12) return "fast";
  if (under >= 0.34 && under > over + 0.12) return "slow";
  return "good";
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function summarize(shots: Shot[]): RoundSummary {
  const hits = shots.filter((shot) => shot.hit);
  return {
    shots: shots.length,
    hits: hits.length,
    over: shots.filter((shot) => shot.kind === "over").length,
    under: shots.filter((shot) => shot.kind === "under").length,
    wide: shots.filter((shot) => shot.kind === "wide").length,
    medianMs: median(hits.map((shot) => shot.ms)),
    suggestion: suggestJudgment(shots),
  };
}

export function advanceSearch(lb: number, ub: number, judgment: Judgment, round: number): SearchStep {
  const mid = (lb + ub) / 2;
  if (judgment === "good") {
    return { lb: mid, ub: mid, done: true, cm: roundCm(mid) };
  }
  const nextLb = judgment === "fast" ? mid : lb;
  const nextUb = judgment === "slow" ? mid : ub;
  const done = nextUb - nextLb <= 2.5 || round >= 7;
  return {
    lb: nextLb,
    ub: nextUb,
    done,
    cm: roundCm((nextLb + nextUb) / 2),
  };
}

function roundCm(value: number): number {
  return Math.round(value * 10) / 10;
}

export function judgmentLabel(judgment: Judgment): string {
  if (judgment === "fast") return "Se pasa";
  if (judgment === "slow") return "Se queda corta";
  return "Está bien";
}
