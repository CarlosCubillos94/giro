import { cmPer360, countsPerDegree, degreesPerCm, edpi, inchesPer360, sensFromCm } from "./sensitivity.ts";

export type Tone = "ok" | "warn" | "bad";

export type Health = {
  cm360: number;
  cm180: number;
  inches360: number;
  edpi: number;
  countsPerDegree: number;
  degreesPerCm: number;
  style: { label: string; detail: string };
  pad: { tone: Tone; title: string; detail: string };
  grain: { tone: Tone; title: string; detail: string; nextDpi: number | null };
  band: { tone: Tone; title: string; detail: string };
  summary: string;
};

const WRIST_MAX = 25;
const HYBRID_MAX = 45;

export function assess(input: {
  dpi: number;
  sens: number;
  yaw: number;
  padCm: number;
  band: readonly [number, number];
  gameName: string;
}): Health | null {
  const { dpi, sens, yaw, padCm, band, gameName } = input;
  if (dpi <= 0 || sens <= 0 || yaw <= 0 || padCm <= 0) return null;

  const cm360 = cmPer360(dpi, sens, yaw);
  const cm180 = cm360 / 2;
  const ratio = cm180 / padCm;
  const cpd = countsPerDegree(sens, yaw);
  const style = styleFor(cm360);
  const pad = padFor(cm180, padCm, ratio);
  const grain = grainFor(cpd, dpi, cm360);
  const bandFit = bandFor(cm360, band, gameName);

  return {
    cm360,
    cm180,
    inches360: inchesPer360(cm360),
    edpi: edpi(dpi, sens),
    countsPerDegree: cpd,
    degreesPerCm: degreesPerCm(cm360),
    style,
    pad,
    grain,
    band: bandFit,
    summary: summarize(cm360, style.label, pad, grain, bandFit, gameName),
  };
}

export function sensAtDpi(cm360: number, dpi: number, yaw: number): number {
  return sensFromCm(cm360, dpi, yaw);
}

function styleFor(cm: number): { label: string; detail: string } {
  if (cm < WRIST_MAX) {
    return {
      label: "Muñeca",
      detail: "Menos de 25 cm. El giro sale de dedos y muñeca, y el temblor se nota más.",
    };
  }
  if (cm < HYBRID_MAX) {
    return {
      label: "Híbrida",
      detail: "Entre 25 y 45 cm. Mezcla muñeca y antebrazo. Ahí cae gran parte del tac FPS.",
    };
  }
  return {
    label: "Brazo",
    detail: "Más de 45 cm. El giro sale del brazo. Pide pad ancho y un swipe largo.",
  };
}

function padFor(cm180: number, padCm: number, ratio: number): Health["pad"] {
  const used = `${cm180.toFixed(1)} cm, el ${Math.round(ratio * 100)}% del pad`;
  if (ratio > 1) {
    return {
      tone: "bad",
      title: "No entra",
      detail: `Un 180 pide ${cm180.toFixed(1)} cm y el pad mide ${padCm.toFixed(0)}. No alcanzas a darte la vuelta de un swipe.`,
    };
  }
  if (ratio > 0.78) {
    return {
      tone: "warn",
      title: "Justa",
      detail: `Un 180 ocupa ${used}. Entra, y deja poco sitio para reposar el mouse.`,
    };
  }
  if (ratio < 0.2) {
    return {
      tone: "warn",
      title: "Muy corta",
      detail: `Un 180 ocupa ${used}. Cabe, pero cada temblor mueve varios grados.`,
    };
  }
  return {
    tone: "ok",
    title: "Cabe",
    detail: `Un 180 ocupa ${used}. Entra y deja sitio para reposar el mouse.`,
  };
}

function grainFor(cpd: number, dpi: number, cm360: number): Health["grain"] {
  const nextDpi = nextDpiFor(cpd, dpi, cm360);
  const reading = `${cpd.toFixed(1)} cuentas por grado`;
  if (cpd < 8) {
    return {
      tone: "bad",
      title: "Gruesa",
      detail: `${reading}. El aim va a saltos. Sube el DPI y baja la sensibilidad del juego para conservar este cm/360.`,
      nextDpi,
    };
  }
  if (cpd < 15 || (dpi < 800 && cpd < 25)) {
    return {
      tone: "warn",
      title: "Justa",
      detail: `${reading}. Se puede jugar. Con más DPI y menos sensibilidad del juego el mismo giro queda más fino.`,
      nextDpi,
    };
  }
  return {
    tone: "ok",
    title: "Fina",
    detail: `${reading} a ${dpi} DPI. Hay margen para microajustar sin cambiar el giro.`,
    nextDpi: null,
  };
}

function nextDpiFor(cpd: number, dpi: number, cm360: number): number | null {
  if (cpd >= 20 && dpi >= 800) return null;
  for (const candidate of [800, 1600, 3200]) {
    if (candidate <= dpi) continue;
    const counts = (candidate * cm360) / 2.54 / 360;
    if (counts >= 20) return candidate;
  }
  return null;
}

function bandFor(cm: number, band: readonly [number, number], gameName: string): Health["band"] {
  const [low, high] = band;
  const range = `${low}–${high} cm`;
  if (cm < low - 1) {
    return {
      tone: "warn",
      title: "Más rápida",
      detail: `Por debajo de la banda habitual de ${gameName} (${range}). No es un error: es más rápida de lo que usa la mayoría en ese juego.`,
    };
  }
  if (cm > high + 1) {
    return {
      tone: "warn",
      title: "Más lenta",
      detail: `Por encima de la banda habitual de ${gameName} (${range}). El 180 pide más pad y un swipe más largo.`,
    };
  }
  return {
    tone: "ok",
    title: "En banda",
    detail: `Dentro de lo habitual en ${gameName}: ${range}. Es una referencia, no una regla.`,
  };
}

function summarize(
  cm: number,
  style: string,
  pad: Health["pad"],
  grain: Health["grain"],
  band: Health["band"],
  gameName: string,
): string {
  if (pad.tone === "bad") return pad.detail;
  if (grain.tone === "bad") return grain.detail;
  if (pad.tone === "warn") return pad.detail;
  if (grain.tone === "warn") return grain.detail;
  if (band.tone === "warn") return band.detail;
  return `${cm.toFixed(1)} cm, ${style.toLowerCase()}. El 180 entra en el pad y caes en la banda de ${gameName}.`;
}
