import type { ShotKind } from "./finder.ts";

export type Playstyle = "mixed" | "click" | "track";
export type ProbeTask = "track" | "speed" | "precision";

export const FINDER_ROUNDS = 15;
export const ROUND_MS = 18_000;
export const COUNTDOWN_S = 4;
export const SEARCH_FLOOR = 12;
export const SEARCH_CEIL = 90;

export type RoundSample = {
  task: ProbeTask;
  cm: number;
  hits: number;
  misses: number;
  over: number;
  under: number;
  medianMs: number | null;
  trackOn: number;
  trackCrosses: number;
  trackLag: number;
  durationMs: number;
};

export type ProbeScore = {
  cm: number;
  score: number;
  bias: number;
};

export type FinderTiming = {
  rounds: number;
  roundMs: number;
  countdownS: number;
};

export function finderQuery(search = ""): string | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(raw).get("giro");
}

export function finderTiming(search = ""): FinderTiming {
  if (finderQuery(search) === "short") {
    return { rounds: 3, roundMs: 6_000, countdownS: 2 };
  }
  return { rounds: FINDER_ROUNDS, roundMs: ROUND_MS, countdownS: COUNTDOWN_S };
}

/** Click / long range uses the slower half (more cm). Tracking / close uses the faster half. */
export function playstyleRange(
  band: readonly [number, number],
  playstyle: Playstyle,
): [number, number] {
  const lo = band[0];
  const hi = band[1];
  const mid = round1((lo + hi) / 2);
  if (playstyle === "click") return [mid, hi];
  if (playstyle === "track") return [lo, mid];
  return [lo, hi];
}

export function searchWindow(
  band: readonly [number, number],
  playstyle: Playstyle,
  currentCm: number,
): [number, number] {
  const [lo, hi] = playstyleRange(band, playstyle);
  if (!Number.isFinite(currentCm) || currentCm <= 0) return [lo, hi];
  if (currentCm >= lo && currentCm <= hi) return [lo, hi];
  const expandedLo = Math.min(lo, Math.max(SEARCH_FLOOR, currentCm * 0.85));
  const expandedHi = Math.max(hi, Math.min(SEARCH_CEIL, currentCm * 1.15));
  return [round1(expandedLo), round1(expandedHi)];
}

export function taskForRound(roundIndex: number): ProbeTask {
  const cycle: ProbeTask[] = ["track", "speed", "precision"];
  return cycle[roundIndex % 3] ?? "track";
}

export function taskLabel(task: ProbeTask): string {
  if (task === "track") return "SEGUIMIENTO";
  if (task === "speed") return "FLICKS RÁPIDOS";
  return "FLICKS PRECISOS";
}

export function taskHint(task: ProbeTask): string {
  if (task === "track") return "Mantén la mira sobre la esfera. No hace falta hacer clic.";
  if (task === "speed") return "Haz clic en cada esfera grande en cuanto aparezca.";
  return "Haz clic en la esfera chica, del tamaño de una cabeza.";
}

/**
 * Early rounds jump 2–3× faster or much slower. Later rounds shrink toward the
 * best score so far, biased by over/under-flick.
 */
export function nextProbeCm(opts: {
  roundIndex: number;
  totalRounds: number;
  currentCm: number;
  window: readonly [number, number];
  samples: readonly ProbeScore[];
}): number {
  const { roundIndex, totalRounds, currentCm, window, samples } = opts;
  const lo = window[0];
  const hi = window[1];
  const start = Number.isFinite(currentCm) && currentCm > 0 ? currentCm : (lo + hi) / 2;

  if (roundIndex === 0) return start;

  const early = [start * 0.42, start * 2.3, start * 0.68, start * 1.55];
  if (roundIndex <= early.length) {
    return uniqueCm(clamp(early[roundIndex - 1] ?? start, lo, hi), samples, lo, hi);
  }

  const best = bestScore(samples) ?? { cm: start, score: 0, bias: 0 };
  const remaining = Math.max(0.12, 1 - roundIndex / Math.max(totalRounds, 1));
  const span = (hi - lo) * remaining * 0.28;
  let next = best.cm;
  if (best.bias > 0.12) next = best.cm * (1 + 0.18 * remaining);
  else if (best.bias < -0.12) next = best.cm * (1 - 0.18 * remaining);
  else next = best.cm + (roundIndex % 2 === 0 ? 1 : -1) * span * 0.35;

  return uniqueCm(clamp(next, lo, hi), samples, lo, hi);
}

export function scoreSample(sample: RoundSample): ProbeScore {
  if (sample.task === "track") {
    const on = clamp01(sample.trackOn);
    let bias = 0;
    if (sample.trackCrosses >= 1.6) bias += 0.35;
    if (sample.trackLag > 1.2 && sample.trackCrosses < 0.9) bias -= 0.4;
    if (on < 0.45 && sample.trackCrosses >= 1.7) bias += 0.2;
    const score = on * 0.85 + (1 - Math.min(1, Math.abs(bias))) * 0.15;
    return { cm: sample.cm, score: clamp01(score), bias: clamp(bias, -1, 1) };
  }

  const shots = sample.hits + sample.misses;
  const hitRate = shots === 0 ? 0 : sample.hits / shots;
  const time = sample.medianMs ?? 650;
  const timeScore = 1 / (1 + time / 420);
  const over = shots === 0 ? 0 : sample.over / shots;
  const under = shots === 0 ? 0 : sample.under / shots;
  let bias = over - under;
  if (over >= 0.34 && over > under + 0.12) bias = Math.max(bias, 0.4);
  if (under >= 0.34 && under > over + 0.12) bias = Math.min(bias, -0.4);
  const score = hitRate * 0.72 + timeScore * 0.18 + (1 - Math.min(1, Math.abs(bias))) * 0.1;
  return { cm: sample.cm, score: clamp01(score), bias: clamp(bias, -1, 1) };
}

export function recommendCm(samples: readonly ProbeScore[], window: readonly [number, number]): number {
  if (samples.length === 0) return round2((window[0] + window[1]) / 2);
  const ranked = [...samples].sort((a, b) => b.score - a.score);
  const top = ranked.slice(0, Math.min(4, ranked.length));
  const weights = top.map((item) => Math.max(0.05, item.score) ** 2);
  const wsum = weights.reduce((sum, weight) => sum + weight, 0);
  let cm = top.reduce((sum, item, index) => sum + item.cm * (weights[index] ?? 0), 0) / wsum;
  const meanBias = top.reduce((sum, item, index) => sum + item.bias * (weights[index] ?? 0), 0) / wsum;
  cm *= 1 + meanBias * 0.08;
  return round2(clamp(cm, window[0], window[1]));
}

export function progressPct(completedRounds: number, total: number): number {
  if (total <= 0) return 100;
  return Math.round((clamp(completedRounds, 0, total) / total) * 100);
}

export function rateOf(shots: readonly { kind: ShotKind }[], kind: ShotKind): number {
  if (shots.length === 0) return 0;
  return shots.filter((shot) => shot.kind === kind).length / shots.length;
}

function bestScore(samples: readonly ProbeScore[]): ProbeScore | null {
  if (samples.length === 0) return null;
  return samples.reduce((best, item) => (item.score > best.score ? item : best));
}

function uniqueCm(cm: number, samples: readonly ProbeScore[], lo: number, hi: number): number {
  if (samples.length === 0) return round2(cm);
  let value = round2(cm);
  for (let step = 0; step < 8; step += 1) {
    if (samples.every((item) => Math.abs(item.cm - value) >= 1.2)) return clamp(value, lo, hi);
    const nudge = (step % 2 === 0 ? 1 : -1) * (1.6 + step);
    value = round2(clamp(cm + nudge, lo, hi));
  }
  return round2(clamp(value, lo, hi));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}
