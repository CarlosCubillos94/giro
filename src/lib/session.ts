import type { ShotKind } from "./finder.ts";

export type Playstyle = "mixed" | "click" | "track";
export type ProbeTask = "track" | "speed" | "precision";

export const FINDER_ROUNDS = 15;
export const ROUND_MS = 18_000;
export const COUNTDOWN_S = 4;
export const SEARCH_FLOOR = 12;
export const SEARCH_CEIL = 90;
/** |bias| below this is noise: do not move cm/360. */
export const BIAS_FLOOR = 0.2;

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
  /** Signed peak error in degrees: + overshoot, − undershoot. */
  meanErrorDeg: number;
  meanAbsErrorDeg: number;
  /** Direction reversals per flick (path wobble / micro-corrections). */
  correctionsPerShot: number;
};

export type ProbeScore = {
  cm: number;
  score: number;
  bias: number;
  task: ProbeTask;
  shots: number;
  overRate: number;
  underRate: number;
  trackOn: number;
  trackCrosses: number;
};

export type Recommendation = {
  cm: number;
  why: string;
};

export type FinderTiming = {
  rounds: number;
  roundMs: number;
  countdownS: number;
};

type SearchState = {
  cm: number;
  step: number;
  lastSign: -1 | 0 | 1;
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

export function taskTitle(task: ProbeTask): string {
  if (task === "track") return "Seguimiento";
  if (task === "speed") return "Flicks rápidos";
  return "Flicks precisos";
}

export function taskKind(task: ProbeTask): string {
  if (task === "track") return "Seguimiento";
  return "Flick";
}

/** Recap shown between tasks. Never includes probe cm/360 or in-game sens. */
export type RoundRecap = {
  task: ProbeTask;
  points: number;
  hits: number;
  misses: number;
  accuracy: number;
  medianMs: number | null;
  overPct: number;
  underPct: number;
  trackOn: number | null;
};

export function recapFromRound(sample: RoundSample, points: number): RoundRecap {
  const shots = sample.hits + sample.misses;
  return {
    task: sample.task,
    points,
    hits: sample.hits,
    misses: sample.misses,
    accuracy: sample.task === "track" ? clamp01(sample.trackOn) : shots === 0 ? 0 : sample.hits / shots,
    medianMs: sample.medianMs,
    overPct: shots === 0 ? 0 : Math.round((sample.over / shots) * 100),
    underPct: shots === 0 ? 0 : Math.round((sample.under / shots) * 100),
    trackOn: sample.task === "track" ? clamp01(sample.trackOn) : null,
  };
}

export function commitPending(
  samples: readonly ProbeScore[],
  pending: ProbeScore | null,
): ProbeScore[] {
  if (pending == null) return [...samples];
  return [...samples, pending];
}

/**
 * Precision-first score. Hits-on-a-large-target and raw speed are secondary:
 * overshoot magnitude, direction bias, and path wobble dominate.
 * bias &gt; 0 → too fast (overflick); bias &lt; 0 → too slow (underflick).
 */
export function scoreSample(sample: RoundSample): ProbeScore {
  if (sample.task === "track") {
    const on = clamp01(sample.trackOn);
    const smooth = 1 / (1 + sample.trackCrosses);
    const lagPenalty = 1 / (1 + Math.max(0, sample.trackLag));
    const score = on * 0.62 + smooth * 0.28 + lagPenalty * 0.1;
    const tooFast = clamp01((sample.trackCrosses - 0.7) / 2) + (on < 0.45 && sample.trackCrosses >= 1.4 ? 0.2 : 0);
    const tooSlow =
      clamp01((sample.trackLag - 0.45) / 2.2) + (on < 0.5 && sample.trackCrosses < 0.85 ? 0.22 : 0);
    return {
      cm: sample.cm,
      score: clamp01(score),
      bias: clamp(tooFast - tooSlow, -1, 1),
      task: sample.task,
      shots: 0,
      overRate: 0,
      underRate: 0,
      trackOn: on,
      trackCrosses: sample.trackCrosses,
    };
  }

  const shots = sample.hits + sample.misses;
  const accuracy = shots === 0 ? 0 : sample.hits / shots;
  const overRate = shots === 0 ? 0 : sample.over / shots;
  const underRate = shots === 0 ? 0 : sample.under / shots;
  const meanAbs =
    Number.isFinite(sample.meanAbsErrorDeg) && sample.meanAbsErrorDeg > 0
      ? sample.meanAbsErrorDeg
      : overRate * 2.2 + underRate * 1.8;
  const meanSigned = Number.isFinite(sample.meanErrorDeg)
    ? sample.meanErrorDeg
    : (overRate - underRate) * 2.2;
  const corrections = Number.isFinite(sample.correctionsPerShot) ? Math.max(0, sample.correctionsPerShot) : 0;
  const precision = 1 / (1 + meanAbs);
  const smooth = 1 / (1 + corrections);
  const speed = 1 / (1 + (sample.medianMs ?? 520) / 720);
  const score = precision * 0.5 + accuracy * 0.22 + smooth * 0.2 + speed * 0.08;
  const rateBias = overRate - underRate;
  const magBias = clamp(meanSigned / 3, -1, 1);
  return {
    cm: sample.cm,
    score: clamp01(score),
    bias: clamp(0.6 * rateBias + 0.4 * magBias, -1, 1),
    task: sample.task,
    shots,
    overRate,
    underRate,
    trackOn: 0,
    trackCrosses: 0,
  };
}

/**
 * Walk cm/360 from the player's start using signed error, not a score average.
 * Overflick (bias +) raises cm; underflick lowers it. Weak bias does not
 * regress toward the band midpoint or the start beyond staying put.
 */
export function nextProbeCm(opts: {
  roundIndex: number;
  totalRounds: number;
  currentCm: number;
  window: readonly [number, number];
  samples: readonly ProbeScore[];
}): number {
  const start = Number.isFinite(opts.currentCm) && opts.currentCm > 0 ? opts.currentCm : (opts.window[0] + opts.window[1]) / 2;
  if (opts.roundIndex === 0) return start;
  const state = replaySearch(start, opts.samples);
  return round2(state.cm);
}

export function recommendCm(
  samples: readonly ProbeScore[],
  window: readonly [number, number],
  startCm?: number,
): Recommendation {
  const start =
    Number.isFinite(startCm) && (startCm ?? 0) > 0
      ? (startCm as number)
      : samples[0]?.cm ?? (window[0] + window[1]) / 2;
  if (samples.length === 0) {
    return {
      cm: round2(start),
      why: "No hubo rondas con evidencia. Dejamos tu distancia de partida.",
    };
  }
  const strong = samples.filter((item) => Math.abs(item.bias) >= BIAS_FLOOR).length;
  const state = replaySearch(start, samples);
  if (strong < 2) {
    const best = samples.reduce((lead, item) => (item.score > lead.score ? item : lead));
    const cm = best.score >= 0.55 ? round2(best.cm) : round2(start);
    return { cm, why: explainRecommendation(samples, start, cm) };
  }
  return { cm: round2(state.cm), why: explainRecommendation(samples, start, state.cm) };
}

export function explainRecommendation(samples: readonly ProbeScore[], startCm: number, recCm: number): string {
  const flicks = samples.filter((item) => item.task !== "track");
  const tracks = samples.filter((item) => item.task === "track");
  const shotTotal = flicks.reduce((sum, item) => sum + item.shots, 0);
  const overTotal = flicks.reduce((sum, item) => sum + item.overRate * item.shots, 0);
  const underTotal = flicks.reduce((sum, item) => sum + item.underRate * item.shots, 0);
  const overPct = shotTotal > 0 ? Math.round((overTotal / shotTotal) * 100) : 0;
  const underPct = shotTotal > 0 ? Math.round((underTotal / shotTotal) * 100) : 0;
  const meanOn = tracks.length === 0 ? 0 : tracks.reduce((sum, item) => sum + item.trackOn, 0) / tracks.length;
  const meanCross =
    tracks.length === 0 ? 0 : tracks.reduce((sum, item) => sum + item.trackCrosses, 0) / tracks.length;

  const parts: string[] = [];
  if (shotTotal > 0 && overPct >= 20 && overPct >= underPct) {
    parts.push(`Te pasaste en el ${overPct}% de los flicks.`);
  } else if (shotTotal > 0 && underPct >= 20 && underPct > overPct) {
    parts.push(`Te quedaste corto en el ${underPct}% de los flicks.`);
  }
  if (tracks.length > 0 && meanOn < 0.55) {
    if (meanCross >= 1.2) parts.push("En el tracking la mira cruzaba el blanco (sensibilidad alta).");
    else parts.push("En el tracking la mira se quedaba atrás (sensibilidad baja).");
  }
  const delta = recCm - startCm;
  if (Math.abs(delta) < 1.2) {
    parts.push("El sesgo no fue constante, así que nos quedamos cerca de tu partida.");
  } else if (delta > 0) {
    parts.push("Por eso sube el cm/360: más centímetros, más lenta.");
  } else {
    parts.push("Por eso baja el cm/360: menos centímetros, más rápida.");
  }
  return parts.join(" ");
}

export function progressPct(completedRounds: number, total: number): number {
  if (total <= 0) return 100;
  return Math.round((clamp(completedRounds, 0, total) / total) * 100);
}

export function rateOf(shots: readonly { kind: ShotKind }[], kind: ShotKind): number {
  if (shots.length === 0) return 0;
  return shots.filter((shot) => shot.kind === kind).length / shots.length;
}

export function emptyRound(task: ProbeTask, cm: number): RoundSample {
  return {
    task,
    cm,
    hits: 0,
    misses: 0,
    over: 0,
    under: 0,
    medianMs: null,
    trackOn: 0,
    trackCrosses: 0,
    trackLag: 0,
    durationMs: 0,
    meanErrorDeg: 0,
    meanAbsErrorDeg: 0,
    correctionsPerShot: 0,
  };
}

function replaySearch(startCm: number, samples: readonly ProbeScore[]): SearchState {
  let state: SearchState = {
    cm: startCm,
    step: Math.max(2.2, Math.abs(startCm) * 0.15),
    lastSign: 0,
  };
  for (const sample of samples) {
    state = stepSearch(state, sample);
  }
  return state;
}

function stepSearch(state: SearchState, sample: ProbeScore): SearchState {
  const sign: -1 | 0 | 1 = sample.bias > BIAS_FLOOR ? 1 : sample.bias < -BIAS_FLOOR ? -1 : 0;
  if (sign === 0) {
    return { cm: state.cm, step: Math.max(0.5, state.step * 0.7), lastSign: 0 };
  }
  let step = state.step;
  if (state.lastSign !== 0 && sign !== state.lastSign) {
    step = Math.max(0.55, step * 0.42);
  } else {
    step = Math.max(0.55, step * 0.9);
  }
  const scale = 0.5 + 0.5 * Math.min(1, Math.abs(sample.bias));
  return {
    cm: clamp(state.cm + sign * step * scale, SEARCH_FLOOR, SEARCH_CEIL),
    step,
    lastSign: sign,
  };
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
