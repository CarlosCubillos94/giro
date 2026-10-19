import { CaretDown, Check, Copy } from "@phosphor-icons/react";
import { useEffect, useId, useState, type ReactNode } from "react";

type NumberFieldProps = {
  label: string;
  value: number;
  digits?: number;
  min: number;
  max: number;
  suffix?: string;
  inputMode?: "decimal" | "numeric";
  onChange: (value: number) => void;
};

export function NumberField({
  label,
  value,
  digits = 0,
  min,
  max,
  suffix,
  inputMode = "decimal",
  onChange,
}: NumberFieldProps) {
  const [text, setText] = useState(() => value.toFixed(digits));
  const [focused, setFocused] = useState(false);
  const id = useId();

  useEffect(() => {
    if (!focused) setText(value.toFixed(digits));
  }, [value, digits, focused]);

  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <span className="field-control">
        <input
          id={id}
          value={text}
          inputMode={inputMode}
          autoComplete="off"
          onFocus={() => setFocused(true)}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            const parsed = parseLoose(next);
            if (parsed != null && parsed >= min && parsed <= max) onChange(parsed);
          }}
          onBlur={() => {
            setFocused(false);
            const parsed = parseLoose(text);
            if (parsed == null || parsed < min || parsed > max) {
              setText(value.toFixed(digits));
              return;
            }
            if (parsed.toFixed(digits) === value.toFixed(digits)) {
              setText(value.toFixed(digits));
              return;
            }
            onChange(parsed);
            setText(parsed.toFixed(digits));
          }}
        />
        {suffix ? <em>{suffix}</em> : null}
      </span>
    </label>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <span className="select-wrap">
        <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
          {children}
        </select>
        <CaretDown size={16} weight="light" aria-hidden="true" />
      </span>
    </label>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={copied ? "Copiado" : "Copiar sensibilidad"}
      onClick={(event) => {
        event.stopPropagation();
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      {copied ? <Check size={15} weight="light" /> : <Copy size={15} weight="light" />}
    </button>
  );
}

export function PadRuler({ padCm, cm360 }: { padCm: number; cm360: number }) {
  const cm180 = cm360 / 2;
  const span = Math.max(padCm, cm180, 1) * 1.08;
  const x = (cm: number) => 16 + (cm / span) * 568;
  const overflows = cm180 > padCm;
  const markEnd = x(Math.min(cm180, span));
  const label = overflows
    ? `Un giro de 180 grados pide ${cm180.toFixed(1)} centímetros y el mousepad mide ${padCm.toFixed(0)}.`
    : `Un giro de 180 grados ocupa ${cm180.toFixed(1)} centímetros de un mousepad de ${padCm.toFixed(0)}.`;

  return (
    <svg className="ruler" viewBox="0 0 600 78" role="img" aria-label={label}>
      <rect className="ruler-pad" x={x(0)} y="26" width={Math.max(x(padCm) - x(0), 0)} height="26" rx="4" />
      <line className={overflows ? "ruler-aim is-over" : "ruler-aim"} x1={x(0)} x2={markEnd} y1="39" y2="39" />
      <line className="ruler-tick" x1={markEnd} x2={markEnd} y1="22" y2="56" />
      <text className="ruler-label" x={x(0)} y="16">
        0
      </text>
      <text className="ruler-label" x={x(padCm)} y="16" textAnchor="end">
        {`pad ${padCm.toFixed(0)} cm`}
      </text>
      <text className={overflows ? "ruler-label is-over" : "ruler-label"} x={markEnd} y="72" textAnchor="middle">
        {overflows ? "180° no entra" : `180° · ${cm180.toFixed(1)} cm`}
      </text>
    </svg>
  );
}

function parseLoose(raw: string): number | null {
  const text = raw.trim().replace(",", ".");
  if (!text || text === "." || text === "-" || text.endsWith(".")) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}
