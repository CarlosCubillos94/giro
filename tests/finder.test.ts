import assert from "node:assert/strict";
import { cmPer360, sensFromCm } from "../src/lib/sensitivity.ts";
import {
  BIAS_FLOOR,
  emptyRound,
  explainRecommendation,
  finderQuery,
  finderTiming,
  nextProbeCm,
  playstyleRange,
  progressPct,
  recommendCm,
  scoreSample,
  searchWindow,
  taskForRound,
  type ProbeScore,
  type ProbeTask,
  type RoundSample,
} from "../src/lib/session.ts";

const valorantBand = [35, 75] as const;
const midBand = (valorantBand[0] + valorantBand[1]) / 2;

assert.deepEqual(playstyleRange(valorantBand, "mixed"), [35, 75]);
assert.deepEqual(playstyleRange(valorantBand, "click"), [55, 75]);
assert.deepEqual(playstyleRange(valorantBand, "track"), [35, 55]);
assert.deepEqual(playstyleRange([20, 50], "click"), [35, 50]);
assert.deepEqual(playstyleRange([20, 60], "track"), [20, 40]);

const windowMixed = searchWindow(valorantBand, "mixed", 40.82);
assert.equal(windowMixed[0], 35);
assert.equal(windowMixed[1], 75);

const windowOutside = searchWindow(valorantBand, "mixed", 20);
assert.ok(windowOutside[0] <= 20 * 0.85 + 0.1);
assert.ok(windowOutside[1] >= 75);

assert.equal(taskForRound(0), "track");
assert.equal(taskForRound(1), "speed");
assert.equal(taskForRound(2), "precision");
assert.equal(taskForRound(3), "track");

const start = nextProbeCm({
  roundIndex: 0,
  totalRounds: 15,
  currentCm: 40.82142857,
  window: valorantBand,
  samples: [],
});
assert.equal(start, 40.82142857);

const firstOutside = nextProbeCm({
  roundIndex: 0,
  totalRounds: 15,
  currentCm: 20,
  window: valorantBand,
  samples: [],
});
assert.equal(firstOutside, 20, "baseline stays at the player's cm/360");

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function flickRound(
  task: ProbeTask,
  cm: number,
  opts: { over: number; under: number; hits?: number; error?: number; abs?: number; corrections?: number; ms?: number },
): RoundSample {
  const shots = 10;
  const hits = opts.hits ?? shots - Math.max(0, shots - opts.over - opts.under - 2);
  return {
    ...emptyRound(task, cm),
    hits,
    misses: shots - hits,
    over: opts.over,
    under: opts.under,
    medianMs: opts.ms ?? 320,
    durationMs: 18000,
    meanErrorDeg: opts.error ?? (opts.over - opts.under) * 0.28,
    meanAbsErrorDeg: opts.abs ?? (opts.over + opts.under) * 0.28,
    correctionsPerShot: opts.corrections ?? 0.4,
  };
}

const emptyAfterStart = nextProbeCm({
  roundIndex: 1,
  totalRounds: 15,
  currentCm: 40,
  window: [20, 70],
  samples: [],
});
assert.equal(emptyAfterStart, 40, "no evidence: stay at start, do not jump the band");

const overFlick = scoreSample(
  flickRound("speed", 40, { over: 8, under: 0, hits: 8, error: 2.6, abs: 2.6, corrections: 1.8, ms: 240 }),
);
assert.ok(overFlick.bias > BIAS_FLOOR, `overflick bias ${overFlick.bias}`);

const underFlick = scoreSample(
  flickRound("precision", 40, { over: 0, under: 8, hits: 6, error: -2.4, abs: 2.4, corrections: 1.6, ms: 410 }),
);
assert.ok(underFlick.bias < -BIAS_FLOOR, `underflick bias ${underFlick.bias}`);

const afterOver = nextProbeCm({
  roundIndex: 2,
  totalRounds: 15,
  currentCm: 40,
  window: [20, 70],
  samples: [overFlick],
});
assert.ok(afterOver > 40, `overflick should slow down (raise cm), got ${afterOver}`);

const afterUnder = nextProbeCm({
  roundIndex: 2,
  totalRounds: 15,
  currentCm: 40,
  window: [20, 70],
  samples: [underFlick],
});
assert.ok(afterUnder < 40, `underflick should speed up (lower cm), got ${afterUnder}`);

const once = nextProbeCm({
  roundIndex: 4,
  totalRounds: 15,
  currentCm: 40,
  window: [20, 70],
  samples: [overFlick],
});
const twice = nextProbeCm({
  roundIndex: 5,
  totalRounds: 15,
  currentCm: 40,
  window: [20, 70],
  samples: [overFlick, overFlick],
});
const thrice = nextProbeCm({
  roundIndex: 6,
  totalRounds: 15,
  currentCm: 40,
  window: [20, 70],
  samples: [overFlick, overFlick, overFlick],
});
assert.ok(twice > once, `second overflick still raises cm (${once} → ${twice})`);
assert.ok(
  twice - once > thrice - twice + 1e-9,
  `steps shrink (${once} → ${twice} → ${thrice})`,
);

const sloppyFast: RoundSample = flickRound("speed", 28, {
  over: 9,
  under: 0,
  hits: 10,
  error: 3.2,
  abs: 3.2,
  corrections: 2.4,
  ms: 180,
});
const preciseSlow: RoundSample = flickRound("precision", 42, {
  over: 1,
  under: 1,
  hits: 7,
  error: 0.15,
  abs: 0.45,
  corrections: 0.25,
  ms: 520,
});
assert.ok(
  scoreSample(preciseSlow).score > scoreSample(sloppyFast).score,
  `precision outranks hits/speed (${scoreSample(preciseSlow).score} vs ${scoreSample(sloppyFast).score})`,
);

const trackLag: RoundSample = {
  ...emptyRound("track", 60),
  trackOn: 0.35,
  trackCrosses: 0.4,
  trackLag: 1.8,
  durationMs: 18000,
};
assert.ok(scoreSample(trackLag).bias < 0);

const trackCross: RoundSample = {
  ...emptyRound("track", 22),
  trackOn: 0.32,
  trackCrosses: 2.1,
  trackLag: 0.1,
  durationMs: 18000,
};
assert.ok(scoreSample(trackCross).bias > 0);

const noisy: ProbeScore[] = [
  scoreSample(flickRound("speed", 40, { over: 2, under: 2, hits: 8, error: 0.1, abs: 0.5, corrections: 0.4 })),
  scoreSample({
    ...emptyRound("track", 40),
    trackOn: 0.72,
    trackCrosses: 0.6,
    trackLag: 0.2,
    durationMs: 18000,
  }),
];
const weak = recommendCm(noisy, [20, 70], 40);
assert.ok(Math.abs(weak.cm - 40) < 1.2, `weak evidence stays near start, not mid-band: ${weak.cm}`);
assert.ok(Math.abs(weak.cm - midBand) > 8, `must not regress to band midpoint ${midBand}`);

const oneOver = recommendCm([overFlick], [20, 70], 40);
assert.ok(Math.abs(oneOver.cm - 40) < 2, `one round is not enough to converge: ${oneOver.cm}`);

function roundFromTrue(task: ProbeTask, probeCm: number, trueCm: number): RoundSample {
  const err = (trueCm - probeCm) / Math.max(10, Math.abs(trueCm));
  const bias = clamp(err * 2.4, -1, 1);
  if (task === "track") {
    const on = clamp01(0.92 - Math.abs(bias) * 0.65);
    const crosses = bias > 0 ? 0.55 + bias * 2.1 : 0.45;
    const lag = bias < 0 ? 0.35 + Math.abs(bias) * 2.1 : 0.12;
    return {
      ...emptyRound(task, probeCm),
      trackOn: on,
      trackCrosses: crosses,
      trackLag: lag,
      durationMs: 18000,
    };
  }
  const shots = 10;
  const over = bias > 0.1 ? Math.round(shots * Math.min(0.95, 0.38 + bias * 0.55)) : bias > 0.03 ? 2 : 0;
  const under = bias < -0.1 ? Math.round(shots * Math.min(0.95, 0.38 + Math.abs(bias) * 0.55)) : bias < -0.03 ? 2 : 0;
  const hits = Math.round(shots * clamp01(0.94 - Math.abs(bias) * 0.48));
  return {
    ...emptyRound(task, probeCm),
    hits,
    misses: shots - hits,
    over,
    under,
    medianMs: 290 + Math.abs(bias) * 90,
    durationMs: 18000,
    meanErrorDeg: bias * 3.1,
    meanAbsErrorDeg: 0.28 + Math.abs(bias) * 2.7,
    correctionsPerShot: 0.18 + Math.abs(bias) * 1.9,
  };
}

function runPlayer(startCm: number, trueCm: number, rounds = 15, window: readonly [number, number] = valorantBand) {
  const samples: ProbeScore[] = [];
  let probe = startCm;
  for (let i = 0; i < rounds; i++) {
    samples.push(scoreSample(roundFromTrue(taskForRound(i), probe, trueCm)));
    probe = nextProbeCm({
      roundIndex: i + 1,
      totalRounds: rounds,
      currentCm: startCm,
      window,
      samples,
    });
  }
  return { rec: recommendCm(samples, window, startCm), samples, lastProbe: probe };
}

const overshooter = runPlayer(40, 62);
assert.ok(overshooter.rec.cm > 40, `consistent overshooter must raise cm (${overshooter.rec.cm})`);
assert.ok(overshooter.rec.cm > 46, `overshooter should leave the start, got ${overshooter.rec.cm}`);
assert.match(overshooter.rec.why, /pasaste|sube/i);

const undershooter = runPlayer(40, 22);
assert.ok(undershooter.rec.cm < 40, `consistent undershooter must lower cm (${undershooter.rec.cm})`);
assert.ok(undershooter.rec.cm < 34, `undershooter should leave the start, got ${undershooter.rec.cm}`);
assert.match(undershooter.rec.why, /corto|baja/i);

const precise = runPlayer(40, 40);
assert.ok(Math.abs(precise.rec.cm - 40) < 2, `precise player stays near start ${precise.rec.cm}`);
assert.ok(
  Math.abs(precise.rec.cm - 40) < Math.abs(precise.rec.cm - midBand),
  `precise must not drift to band midpoint ${midBand} (got ${precise.rec.cm})`,
);

const fromLow = runPlayer(32, 50);
assert.ok(fromLow.rec.cm > 32, `true 50 from 32 must raise cm (${fromLow.rec.cm})`);
assert.ok(
  Math.abs(fromLow.rec.cm - 50) < Math.abs(fromLow.rec.cm - midBand),
  `must move toward 50, not band midpoint ${midBand} (got ${fromLow.rec.cm})`,
);
assert.ok(fromLow.rec.cm < 58, `must not overshoot past the true value toward 75 (got ${fromLow.rec.cm})`);

const whyOver = explainRecommendation(
  [
    scoreSample(flickRound("speed", 32, { over: 8, under: 1, hits: 8 })),
    scoreSample(flickRound("precision", 34, { over: 7, under: 1, hits: 7 })),
  ],
  32,
  44,
);
assert.match(whyOver, /pasaste/);
assert.match(whyOver, /%/);
assert.match(whyOver, /sube/);

assert.equal(progressPct(0, 15), 0);
assert.equal(progressPct(3, 12), 25);
assert.equal(progressPct(15, 15), 100);

const short = finderTiming("giro=short");
assert.equal(short.rounds, 3);
const full = finderTiming("");
assert.equal(full.rounds, 15);
assert.equal(finderQuery("giro=results"), "results");
assert.equal(finderQuery("?giro=applied"), "applied");

const recommended = 36.85;
const valorantSens = sensFromCm(recommended, 800, 0.07);
assert.ok(Math.abs(valorantSens - 0.443) < 0.001, `valorant from 36.85: ${valorantSens}`);
assert.ok(Math.abs(cmPer360(800, valorantSens, 0.07) - recommended) < 1e-9);

console.log("finder tests ok");
