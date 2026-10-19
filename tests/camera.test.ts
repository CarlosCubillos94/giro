import assert from "node:assert/strict";
import { gameHorizontalFovAt, gameVerticalFov } from "../src/lib/fov.ts";
import { GAMES } from "../src/lib/games.ts";
import {
  cmPer360,
  countsToDegrees,
  degreesPerCount,
  rotationFromPointer,
  sensFromCm,
} from "../src/lib/sensitivity.ts";

/** Yaw constants used by public converters (Aimlabs / mouse-sensitivity style). */
const YAW = {
  valorant: 0.07,
  cs2: 0.022,
  apex: 0.022,
  ow2: 0.0066,
  fortnite: 0.005555,
  cod: 0.0066,
  r6: 0.00572958,
  aimlabs: 0.05,
} as const;

for (const [id, yaw] of Object.entries(YAW)) {
  const game = GAMES.find((item) => item.id === id);
  assert.ok(game, id);
  assert.equal(game.yaw, yaw, `${id} yaw`);
}

const dpi = 800;
const valorantSens = 0.4;
const valorantYaw = 0.07;
const perCount = degreesPerCount(valorantSens, valorantYaw);
assert.ok(Math.abs(perCount - 0.028) < 1e-12);

const cm = cmPer360(dpi, valorantSens, valorantYaw);
assert.ok(Math.abs(countsToDegrees(1, dpi, cm) - perCount) < 1e-12);
assert.ok(Math.abs(countsToDegrees(10, dpi, cm) - 10 * perCount) < 1e-12);

for (const game of GAMES) {
  const sens = game.id === "fortnite" ? 8 : game.id === "finals" ? 40 : game.id === "cod" ? 6 : 1;
  const gameCm = cmPer360(dpi, sens, game.yaw);
  const expected = degreesPerCount(sens, game.yaw);
  const fromCm = countsToDegrees(1, dpi, gameCm);
  assert.ok(Math.abs(fromCm - expected) < 1e-10, `${game.id} deg/count ${fromCm} vs ${expected}`);
  assert.ok(Math.abs(sensFromCm(gameCm, dpi, game.yaw) - sens) < 1e-9, `${game.id} roundtrip`);
}

const raw = rotationFromPointer({
  movementX: 10,
  dpi,
  cm360: cm,
  devicePixelRatio: 2,
  rawMovement: true,
});
assert.ok(Math.abs(raw - 10 * perCount) < 1e-12, `raw ignores dpr, got ${raw}`);

const css = rotationFromPointer({
  movementX: 10,
  dpi,
  cm360: cm,
  devicePixelRatio: 2,
  rawMovement: false,
});
assert.ok(Math.abs(css - 20 * perCount) < 1e-12, `css fallback uses dpr, got ${css}`);

const valorantV = gameVerticalFov(103, "16:9");
assert.ok(Math.abs(valorantV - 70.53) < 0.02, `valorant vFOV ${valorantV}`);
assert.ok(Math.abs(gameHorizontalFovAt(103, "16:9", 16 / 9) - 103) < 1e-9);

const csWide = gameHorizontalFovAt(90, "4:3", 16 / 9);
assert.ok(Math.abs(csWide - 106.26) < 0.01, `cs2 16:9 ${csWide}`);

const apex = GAMES.find((item) => item.id === "apex");
assert.equal(apex?.defaultFov, 90);
assert.equal(apex?.fovBasis, "4:3");

console.log("camera tests ok");
