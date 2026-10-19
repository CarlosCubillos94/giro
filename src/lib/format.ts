export function formatNum(value: number, digits: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

export function formatYaw(yaw: number): string {
  return yaw.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

export function formatEdpi(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Math.abs(value) >= 100 ? String(Math.round(value)) : value.toFixed(1);
}

export function formatSens(value: number, decimals: number, unit: "" | "%"): string {
  if (!Number.isFinite(value)) return "—";
  const text = value.toFixed(decimals);
  return unit === "%" ? `${text}%` : text;
}

export function formatPct(part: number, total: number): string {
  if (total <= 0) return "—";
  return `${Math.round((part / total) * 100)}%`;
}

export function formatPct01(rate: number): string {
  if (!Number.isFinite(rate)) return "—";
  return `${Math.round(clamp01(rate) * 100)}%`;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
