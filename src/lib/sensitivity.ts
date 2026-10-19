/** 360° × 2.54 cm/in. Centimetres of mouse travel per full turn. */
export const TURN_CM = 360 * 2.54;

export function cmPer360(dpi: number, sens: number, yaw: number): number {
  return TURN_CM / (dpi * sens * yaw);
}

export function sensFromCm(cm: number, dpi: number, yaw: number): number {
  return TURN_CM / (cm * dpi * yaw);
}

export function inchesPer360(cm: number): number {
  return cm / 2.54;
}

export function edpi(dpi: number, sens: number): number {
  return dpi * sens;
}

/** Mouse counts needed for one degree. Independent of naming, fully determined by sens × yaw. */
export function countsPerDegree(sens: number, yaw: number): number {
  return 1 / (sens * yaw);
}

export function countsPer360(sens: number, yaw: number): number {
  return 360 / (sens * yaw);
}

export function degreesPerCm(cm: number): number {
  return 360 / cm;
}

/** Pointer-lock counts → degrees, for a physical cm/360 at a given DPI. */
export function countsToDegrees(counts: number, dpi: number, cm360: number): number {
  return ((counts / dpi) * 2.54 * 360) / cm360;
}

/** Degrees the game turns per mouse count: sens × yaw. Independent of DPI. */
export function degreesPerCount(sens: number, yaw: number): number {
  return sens * yaw;
}

/**
 * Chrome `unadjustedMovement` reports hardware counts (same as in-game raw input).
 * The CSS-pixel fallback only applies when that option is rejected: then movementX
 * is in CSS pixels and devicePixelRatio recovers counts at 100% / 6/11.
 */
export function pointerCounts(movement: number, devicePixelRatio: number, rawMovement: boolean): number {
  if (rawMovement) return movement;
  return movement * (devicePixelRatio || 1);
}

export function rotationFromPointer(opts: {
  movementX: number;
  dpi: number;
  cm360: number;
  devicePixelRatio: number;
  rawMovement: boolean;
}): number {
  const counts = pointerCounts(opts.movementX, opts.devicePixelRatio, opts.rawMovement);
  return countsToDegrees(counts, opts.dpi, opts.cm360);
}
