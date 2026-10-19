export type FovBasis = "16:9" | "4:3";

const ASPECT_16_9 = 16 / 9;
const ASPECT_4_3 = 4 / 3;

export function aspectForBasis(basis: FovBasis): number {
  return basis === "4:3" ? ASPECT_4_3 : ASPECT_16_9;
}

/** Three.js vertical FOV that reproduces a game's stated horizontal FOV on its native aspect. */
export function verticalFovFromHorizontal(hFovDeg: number, aspect: number): number {
  return radToDeg(2 * Math.atan(Math.tan(degToRad(hFovDeg) / 2) / aspect));
}

export function horizontalFovFromVertical(vFovDeg: number, aspect: number): number {
  return radToDeg(2 * Math.atan(Math.tan(degToRad(vFovDeg) / 2) * aspect));
}

export function gameVerticalFov(hFovDeg: number, basis: FovBasis): number {
  return verticalFovFromHorizontal(hFovDeg, aspectForBasis(basis));
}

/** Horizontal FOV the player sees at `aspect` if the game FOV is applied as hor+. */
export function gameHorizontalFovAt(hFovDeg: number, basis: FovBasis, aspect: number): number {
  return horizontalFovFromVertical(gameVerticalFov(hFovDeg, basis), aspect);
}

export function fovNote(gameName: string, hFovDeg: number, basis: FovBasis): string {
  if (basis === "4:3") {
    const wide = gameHorizontalFovAt(hFovDeg, basis, ASPECT_16_9);
    return `El FOV es cuánto ve la cámara. ${gameName} usa ${formatFov(hFovDeg)}° en 4:3, unos ${formatFov(wide)}° en 16:9. Giro pone esa cámara sola: no hay que escribirla.`;
  }
  return `El FOV es cuánto ve la cámara. ${gameName} usa ${formatFov(hFovDeg)}° horizontal en 16:9. Giro usa ese valor automáticamente para que el swipe se vea como en el juego.`;
}

function formatFov(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}
