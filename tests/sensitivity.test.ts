import assert from "node:assert/strict";
import { advanceSearch, classifyShot, suggestJudgment, summarize, type Shot } from "../src/lib/finder.ts";
import { assess } from "../src/lib/health.ts";
import { cmPer360, countsPerDegree, countsToDegrees, sensFromCm } from "../src/lib/sensitivity.ts";

/** Brief: cm/360 = (360 / (sens × yaw × DPI)) × 2.54 */
function briefCm(dpi: number, sens: number, yaw: number): number {
  return (360 / (sens * yaw * dpi)) * 2.54;
}

const cm = cmPer360(800, 0.4, 0.07);
assert.ok(Math.abs(cm - 40.82142857) < 1e-6, `valorant cm ${cm}`);
assert.ok(Math.abs(cm - briefCm(800, 0.4, 0.07)) < 1e-12);

const cs = sensFromCm(cm, 800, 0.022);
assert.ok(Math.abs(cs - 1.272727) < 1e-5, `cs2 sens ${cs}`);

const fortnite = sensFromCm(cm, 800, 0.005555);
assert.ok(Math.abs(fortnite - 5.0405) < 0.01, `fortnite ${fortnite}`);

const ow = sensFromCm(cm, 800, 0.0066);
assert.ok(Math.abs(ow - 4.2424) < 0.01, `ow2 ${ow}`);

const finals = cmPer360(800, 40, 0.001);
assert.ok(Math.abs(finals - 28.575) < 0.01, `finals ${finals}`);

assert.ok(Math.abs(sensFromCm(cmPer360(800, 1.5, 0.022), 800, 0.022) - 1.5) < 1e-9);

const fromCm = 36.85;
const valorantFromFind = sensFromCm(fromCm, 800, 0.07);
assert.ok(Math.abs(valorantFromFind - 0.443) < 0.001, `brief apply example ${valorantFromFind}`);
assert.ok(Math.abs(cmPer360(800, valorantFromFind, 0.07) - fromCm) < 1e-9);

const r6 = sensFromCm(fromCm, 800, 0.00572958);
assert.ok(Number.isFinite(r6) && r6 > 0);
assert.ok(Math.abs(cmPer360(800, r6, 0.00572958) - fromCm) < 1e-6);

const cpd = countsPerDegree(0.4, 0.07);
assert.ok(Math.abs(cpd - 35.7142857) < 1e-5, `cpd ${cpd}`);

const degrees = countsToDegrees(800, 800, cm);
assert.ok(Math.abs(degrees - (2.54 * 360) / cm) < 1e-9);

const healthy = assess({
  dpi: 800,
  sens: 0.4,
  yaw: 0.07,
  padCm: 45,
  band: [35, 75],
  gameName: "Valorant",
});
assert.equal(healthy?.pad.tone, "ok");
assert.equal(healthy?.grain.tone, "ok");
assert.equal(healthy?.band.tone, "ok");
assert.equal(healthy?.style.label, "Híbrida");

const noRoom = assess({
  dpi: 800,
  sens: 0.4,
  yaw: 0.07,
  padCm: 18,
  band: [35, 75],
  gameName: "Valorant",
});
assert.equal(noRoom?.pad.tone, "bad");

assert.equal(classifyShot(true, 0.2), "clean");
assert.equal(classifyShot(true, 2), "over");
assert.equal(classifyShot(false, -2), "under");
assert.equal(classifyShot(false, 0), "wide");

const overShots: Shot[] = [
  { kind: "over", hit: true, ms: 300 },
  { kind: "over", hit: true, ms: 280 },
  { kind: "over", hit: false, ms: 400 },
  { kind: "clean", hit: true, ms: 320 },
];
assert.equal(suggestJudgment(overShots), "fast");
assert.equal(summarize(overShots).medianMs, 300);

const step = advanceSearch(16, 72, "fast", 1);
assert.equal(step.done, false);
assert.equal(step.lb, 44);
assert.equal(step.ub, 72);

const closed = advanceSearch(40, 42, "slow", 3);
assert.equal(closed.done, true);

console.log("sensitivity tests ok");
