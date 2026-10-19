import { type ReactNode } from "react";
import { fovNote } from "./lib/fov.ts";
import { GAMES, type GameId } from "./lib/games.ts";
import { formatEdpi, formatNum, formatSens, formatYaw } from "./lib/format.ts";
import { sensAtDpi, type Health } from "./lib/health.ts";
import { cmPer360, sensFromCm } from "./lib/sensitivity.ts";
import type { Setup } from "./setup.ts";
import { CopyButton, NumberField, PadRuler, SelectField } from "./ui.tsx";

const POLLING = [125, 250, 500, 1000, 2000, 4000, 8000];

type BenchProps = {
  setup: Setup;
  health: Health | null;
  foundCm: number | null;
  onChange: (setup: Setup) => void;
  onApplyFound: () => void;
  onOpenFinder: () => void;
};

export function Bench({ setup, health, foundCm, onChange, onApplyFound, onOpenFinder }: BenchProps) {
  const game = GAMES.find((item) => item.id === setup.gameId) ?? GAMES[0];
  const unit = setup.unit;
  const display = health == null ? null : unit === "cm" ? health.cm360 : health.inches360;
  const sliderCm = health == null ? 40 : Math.min(90, Math.max(10, Math.round(health.cm360 * 10) / 10));
  const offScale = health != null && (health.cm360 < 10 || health.cm360 > 90);
  const systemReady = setup.pointer611 && setup.eppOff && setup.rawInput;

  function patch(partial: Partial<Setup>) {
    onChange({ ...setup, ...partial });
  }

  function pickGame(id: GameId) {
    if (!health) {
      patch({ gameId: id });
      return;
    }
    const next = GAMES.find((item) => item.id === id) ?? game;
    patch({ gameId: id, fov: next.defaultFov, sens: sensFromCm(health.cm360, setup.dpi, next.yaw) });
  }

  function setCm(cm: number) {
    patch({ sens: sensFromCm(cm, setup.dpi, game.yaw) });
  }

  return (
    <div className="bench">
      <header className="view-head">
        <h1>Números</h1>
        <p>Lo que se conserva entre juegos es la distancia del giro, no el eDPI.</p>
      </header>

      {foundCm != null ? (
        <div className="found-bar">
          <p>
            El finder cerró en <strong>{foundCm.toFixed(2)} cm</strong>
          </p>
          <button type="button" className="btn primary" onClick={onApplyFound}>
            Aplicar a {game.name}
          </button>
        </div>
      ) : null}

      <section className="bezel" aria-label="Distancia de giro">
        <div className="bezel-core">
          <div className="bezel-top">
            <div className="eyebrow-row">
              <p className="eyebrow">{unit === "cm" ? "cm / 360" : "in / 360"}</p>
              <div className="unit-switch" role="group" aria-label="Unidad">
                <button type="button" aria-pressed={unit === "cm"} onClick={() => patch({ unit: "cm" })}>
                  cm
                </button>
                <button type="button" aria-pressed={unit === "in"} onClick={() => patch({ unit: "in" })}>
                  in
                </button>
              </div>
            </div>
            <p className="figure">
              {display == null ? "—" : formatNum(display, display >= 100 ? 1 : 2)}
              <small>{unit}</small>
            </p>
            <label className="slider">
              <span className="sr-only">Ajustar centímetros por 360</span>
              <input
                type="range"
                min={10}
                max={90}
                step={0.1}
                value={sliderCm}
                disabled={health == null}
                onChange={(event) => setCm(Number(event.target.value))}
              />
              <span className="slider-scale">
                <span>rápida</span>
                <span>lenta</span>
              </span>
            </label>
            {offScale ? <p className="hint">Este giro queda fuera de la escala de 10 a 90 cm. El número de arriba sigue siendo el real.</p> : null}
            {health ? <PadRuler padCm={setup.padCm} cm360={health.cm360} /> : null}
          </div>
          <dl className="meta">
            <div>
              <dt>eDPI en {game.name}</dt>
              <dd>{health ? formatEdpi(health.edpi) : "—"}</dd>
            </div>
            <div>
              <dt>cm / 180</dt>
              <dd>{health ? formatNum(health.cm180, 1) : "—"}</dd>
            </div>
            <div>
              <dt>{unit === "cm" ? "in / 360" : "cm / 360"}</dt>
              <dd>{health ? formatNum(unit === "cm" ? health.inches360 : health.cm360, 2) : "—"}</dd>
            </div>
            <div>
              <dt>grados / cm</dt>
              <dd>{health ? formatNum(health.degreesPerCm, 2) : "—"}</dd>
            </div>
          </dl>
        </div>
      </section>

      <p className="summary">{health ? health.summary : "Entra un DPI y una sensibilidad mayores que cero."}</p>

      {health ? (
        <div className="health">
          <HealthCell tone="ok" kicker="Estilo" title={health.style.label} detail={health.style.detail} />
          <HealthCell tone={health.pad.tone} kicker="Mousepad" title={health.pad.title} detail={health.pad.detail} />
          <HealthCell tone={health.grain.tone} kicker="Sensor" title={health.grain.title} detail={health.grain.detail}>
            {health.grain.nextDpi ? (
              <button
                type="button"
                className="btn slim"
                onClick={() => {
                  const dpi = health.grain.nextDpi;
                  if (!dpi) return;
                  patch({ dpi, sens: sensAtDpi(health.cm360, dpi, game.yaw) });
                }}
              >
                Pasar a {health.grain.nextDpi} DPI
              </button>
            ) : null}
          </HealthCell>
          <HealthCell tone={health.band.tone} kicker={game.name} title={health.band.title} detail={health.band.detail} />
        </div>
      ) : null}

      <div className="section-head">
        <h2>Mismo giro, otro juego</h2>
        <button type="button" className="btn slim" onClick={onOpenFinder}>
          Volver a jugar
        </button>
      </div>
      <p className="hint">Elegir una fila no cambia la distancia. Cambia el número que tienes que escribir en ese juego.</p>
      <div className="table-wrap">
        <table>
          <caption className="sr-only">Sensibilidad equivalente para el mismo centímetro por 360</caption>
          <thead>
            <tr>
              <th>Juego</th>
              <th>Sensibilidad</th>
              <th>Yaw</th>
              <th>
                <span className="sr-only">Copiar</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {GAMES.map((item) => {
              const sens = health ? sensFromCm(health.cm360, setup.dpi, item.yaw) : Number.NaN;
              const shown = formatSens(sens, item.decimals, item.unit);
              const active = item.id === game.id;
              return (
                <tr
                  key={item.id}
                  data-active={active ? "true" : undefined}
                  tabIndex={0}
                  onClick={() => pickGame(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      pickGame(item.id);
                    }
                  }}
                >
                  <td>
                    <span className="game-name">{item.name}</span>
                    {active ? <span className="origin">Origen</span> : null}
                  </td>
                  <td className="num">{shown}</td>
                  <td className="num faint">{formatYaw(item.yaw)}</td>
                  <td>
                    <CopyButton text={formatSens(sens, 4, "")} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">
        Hipfire solamente. ADS, visores y FOV no viajan con el yaw.
        {game.id === "fortnite" ? " En Fortnite el número es el eje X, el porcentaje del slider." : ""}
        {setup.polling < 1000 ? ` ${setup.polling} Hz no cambia el cm/360: solo reporta el mouse menos veces por segundo.` : ""}
      </p>
      {!systemReady ? (
        <p className="hint warn-text">
          Falta confirmar Windows. Sin raw input y con el puntero en 6/11, el cm/360 del juego no es el que siente la mano.
        </p>
      ) : null}
    </div>
  );
}

export function SetupForm({ setup, onChange }: { setup: Setup; onChange: (setup: Setup) => void }) {
  const game = GAMES.find((item) => item.id === setup.gameId) ?? GAMES[0];

  function patch(partial: Partial<Setup>) {
    onChange({ ...setup, ...partial });
  }

  return (
    <aside className="setup">
      <NumberField
        label="DPI"
        value={setup.dpi}
        digits={0}
        min={100}
        max={36000}
        inputMode="numeric"
        onChange={(dpi) => patch({ dpi })}
      />
      <NumberField
        label="Ancho útil del pad"
        value={setup.padCm}
        digits={1}
        min={15}
        max={140}
        suffix="cm"
        onChange={(padCm) => patch({ padCm })}
      />
      <SelectField label="Juego de origen" value={setup.gameId} onChange={(id) => {
        const next = GAMES.find((item) => item.id === id) ?? game;
        const cm = sensFromCmSafe(setup);
        patch({
          gameId: next.id,
          fov: next.defaultFov,
          sens: cm == null ? setup.sens : sensFromCm(cm, setup.dpi, next.yaw),
        });
      }}>
        {GAMES.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </SelectField>
      <NumberField
        label={game.unit === "%" ? "Sensibilidad X" : "Sensibilidad"}
        value={setup.sens}
        digits={game.decimals}
        min={0.001}
        max={500}
        suffix={game.unit === "%" ? "%" : undefined}
        onChange={(sens) => patch({ sens })}
      />
      <SelectField
        label="Polling"
        value={String(setup.polling)}
        onChange={(value) => patch({ polling: Number(value) })}
      >
        {POLLING.map((hz) => (
          <option key={hz} value={hz}>
            {hz} Hz
          </option>
        ))}
      </SelectField>
      <p className="hint">{fovNote(game.name, game.defaultFov, game.fovBasis)}</p>
      <p className="hint">Cambiar el DPI recalcula el cm/360 y deja quieto el número del juego.</p>
      <fieldset className="checks">
        <legend>Para que el número coincida con la mano</legend>
        <label>
          <input
            type="checkbox"
            checked={setup.pointer611}
            onChange={(event) => patch({ pointer611: event.target.checked })}
          />
          <span>Puntero de Windows en 6/11</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={setup.eppOff}
            onChange={(event) => patch({ eppOff: event.target.checked })}
          />
          <span>Mejorar precisión del puntero, apagado</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={setup.rawInput}
            onChange={(event) => patch({ rawInput: event.target.checked })}
          />
          <span>Raw input encendido en el juego</span>
        </label>
      </fieldset>
    </aside>
  );
}

function sensFromCmSafe(setup: Setup): number | null {
  const game = GAMES.find((item) => item.id === setup.gameId) ?? GAMES[0];
  if (setup.dpi <= 0 || setup.sens <= 0) return null;
  return cmPer360(setup.dpi, setup.sens, game.yaw);
}

function HealthCell({
  tone,
  kicker,
  title,
  detail,
  children,
}: {
  tone: Health["pad"]["tone"];
  kicker: string;
  title: string;
  detail: string;
  children?: ReactNode;
}) {
  return (
    <article data-tone={tone}>
      <p className="kicker">{kicker}</p>
      <h3>{title}</h3>
      <p>{detail}</p>
      {children}
    </article>
  );
}
