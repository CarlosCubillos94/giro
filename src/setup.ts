import { gameById, type GameId } from "./lib/games.ts";
import type { Playstyle } from "./lib/session.ts";

export type Setup = {
  dpi: number;
  padCm: number;
  gameId: GameId;
  sens: number;
  fov: number;
  playstyle: Playstyle;
  polling: number;
  pointer611: boolean;
  eppOff: boolean;
  rawInput: boolean;
  unit: "cm" | "in";
  foundCm: number | null;
};

export const DEFAULT_SETUP: Setup = {
  dpi: 800,
  padCm: 45,
  gameId: "valorant",
  sens: 0.4,
  fov: 103,
  playstyle: "mixed",
  polling: 1000,
  pointer611: false,
  eppOff: false,
  rawInput: false,
  unit: "cm",
  foundCm: null,
};

const KEY = "giro-setup-v1";

export function loadSetup(): Setup {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETUP;
    const parsed = JSON.parse(raw) as Partial<Setup>;
    return sanitize(parsed);
  } catch {
    return DEFAULT_SETUP;
  }
}

export function saveSetup(setup: Setup) {
  localStorage.setItem(KEY, JSON.stringify(setup));
}

function sanitize(raw: Partial<Setup>): Setup {
  const game = typeof raw.gameId === "string" ? gameById(raw.gameId) : gameById(DEFAULT_SETUP.gameId);
  const playstyle: Playstyle =
    raw.playstyle === "click" || raw.playstyle === "track" || raw.playstyle === "mixed"
      ? raw.playstyle
      : DEFAULT_SETUP.playstyle;
  return {
    dpi: clamp(raw.dpi, 100, 36000, DEFAULT_SETUP.dpi),
    padCm: clamp(raw.padCm, 15, 140, DEFAULT_SETUP.padCm),
    gameId: game.id,
    sens: clamp(raw.sens, 0.001, 500, DEFAULT_SETUP.sens),
    fov: game.defaultFov,
    playstyle,
    polling: POLLING.has(raw.polling ?? 0) ? (raw.polling as number) : DEFAULT_SETUP.polling,
    pointer611: raw.pointer611 === true,
    eppOff: raw.eppOff === true,
    rawInput: raw.rawInput === true,
    unit: raw.unit === "in" ? "in" : "cm",
    foundCm: typeof raw.foundCm === "number" && raw.foundCm > 0 ? raw.foundCm : null,
  };
}

const POLLING = new Set([125, 250, 500, 1000, 2000, 4000, 8000]);

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}
