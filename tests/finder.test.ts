import assert from "node:assert/strict";
import { cmPer360, sensFromCm } from "../src/lib/sensitivity.ts";
import {
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
  type RoundSample,
} from "../src/lib/session.ts";

const valorantBand = [35, 75] as const;

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

const faster = nextProbeCm({
  roundIndex: 1,
  totalRounds: 15,
  currentCm: 40,
  window: [20, 70],
  samples: [],
});
assert.ok(faster <= 20, `dramatic faster ${faster}`);

const slower = nextProbeCm({
  roundIndex: 2,
  totalRounds: 15,
  currentCm: 40,
  window: [20, 70],
  samples: [],
});
assert.ok(slower >= 70, `dramatic slower ${slower}`);

const overBest: ProbeScore[] = [
  { cm: 32, score: 0.91, bias: 0.45 },
  { cm: 50, score: 0.4, bias: -0.1 },
];
const afterOver = nextProbeCm({
  roundIndex: 6,
  totalRounds: 15,
  currentCm: 40,
  window: [20, 70],
  samples: overBest,
});
assert.ok(afterOver > 32, `overflick should slow down, got ${afterOver}`);

const underBest: ProbeScore[] = [{ cm: 48, score: 0.88, bias: -0.5 }];
const afterUnder = nextProbeCm({
  roundIndex: 6,
  totalRounds: 15,
  currentCm: 40,
  window: [20, 70],
  samples: underBest,
});
assert.ok(afterUnder < 48, `underflick should speed up, got ${afterUnder}`);

const lateOver = nextProbeCm({
  roundIndex: 13,
  totalRounds: 15,
  currentCm: 40,
  window: [20, 70],
  samples: overBest,
});
const earlyOver = nextProbeCm({
  roundIndex: 6,
  totalRounds: 15,
  currentCm: 40,
  window: [20, 70],
  samples: overBest,
});
assert.ok(
  Math.abs(lateOver - 32) < Math.abs(earlyOver - 32),
  `later steps shrink (${lateOver} vs ${earlyOver})`,
);

const flickOver: RoundSample = {
  task: "speed",
  cm: 28,
  hits: 6,
  misses: 2,
  over: 6,
  under: 0,
  medianMs: 280,
  trackOn: 0,
  trackCrosses: 0,
  trackLag: 0,
  durationMs: 18000,
};
const flickUnder: RoundSample = {
  ...flickOver,
  cm: 55,
  over: 0,
  under: 6,
  medianMs: 420,
};
assert.equal(scoreSample(flickOver).bias > 0, true);
assert.equal(scoreSample(flickUnder).bias < 0, true);

const trackLag: RoundSample = {
  task: "track",
  cm: 60,
  hits: 0,
  misses: 0,
  over: 0,
  under: 0,
  medianMs: null,
  trackOn: 0.35,
  trackCrosses: 0.4,
  trackLag: 1.8,
  durationMs: 18000,
};
assert.ok(scoreSample(trackLag).bias < 0);

const trackCross: RoundSample = {
  ...trackLag,
  cm: 22,
  trackOn: 0.32,
  trackCrosses: 2.1,
  trackLag: 0.1,
};
assert.ok(scoreSample(trackCross).bias > 0);

const rec = recommendCm(
  [
    { cm: 30, score: 0.4, bias: 0.5 },
    { cm: 40, score: 0.92, bias: 0.04 },
    { cm: 55, score: 0.5, bias: -0.2 },
  ],
  [20, 70],
);
assert.ok(Math.abs(rec - 40) < 4, `recommend near best ${rec}`);

const recOver = recommendCm([{ cm: 40, score: 0.8, bias: 1 }], [20, 70]);
assert.ok(recOver > 40, `overflick raises cm ${recOver}`);
assert.equal(recOver, 43.2);

const recUnder = recommendCm([{ cm: 40, score: 0.8, bias: -1 }], [20, 70]);
assert.ok(recUnder < 40, `underflick lowers cm ${recUnder}`);
assert.equal(recUnder, 36.8);

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
