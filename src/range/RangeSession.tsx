import { useCallback, useEffect, useRef, useState } from "react";
import { classifyShot, median, type Shot } from "../lib/finder.ts";
import { formatPct01, formatSens } from "../lib/format.ts";
import { GAMES } from "../lib/games.ts";
import { cmPer360, sensFromCm } from "../lib/sensitivity.ts";
import {
  finderQuery,
  finderTiming,
  nextProbeCm,
  progressPct,
  recommendCm,
  scoreSample,
  searchWindow,
  taskForRound,
  taskHint,
  taskLabel,
  type FinderTiming,
  type Playstyle,
  type ProbeScore,
  type ProbeTask,
  type RoundSample,
} from "../lib/session.ts";
import type { Setup } from "../setup.ts";
import { NumberField, SelectField } from "../ui.tsx";
import { RangeAudio } from "./audio.ts";
import { RangeEngine } from "./engine.ts";

type Phase = "intro" | "profile" | "dpi" | "countdown" | "live" | "paused" | "results" | "applied";
type LeaveView = "numeros" | "metodo";

type RangeSessionProps = {
  setup: Setup;
  currentCm: number | null;
  onChange: (setup: Setup) => void;
  onApply: (cm: number) => void;
  onLeave: (view: LeaveView) => void;
};

const PLAYSTYLES: { id: Playstyle; title: string; detail: string }[] = [
  { id: "click", title: "Clic / lejos", detail: "Armas de clic y duelos a distancia. Más cm, más lenta." },
  { id: "mixed", title: "Mixto", detail: "El rango completo del juego." },
  { id: "track", title: "Tracking / cerca", detail: "Corta distancia o seguimiento. Menos cm, más rápida." },
];

export function RangeSession({ setup, currentCm, onChange, onApply, onLeave }: RangeSessionProps) {
  const game = GAMES.find((item) => item.id === setup.gameId) ?? GAMES[0];
  const [phase, setPhase] = useState<Phase>("intro");
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState("");
  const [roundIndex, setRoundIndex] = useState(0);
  const [remain, setRemain] = useState(4);
  const [result, setResult] = useState<number | null>(null);
  const [appliedSens, setAppliedSens] = useState<number | null>(null);
  const [task, setTask] = useState<ProbeTask>("track");
  const [timing, setTiming] = useState<FinderTiming>(() => finderTiming());

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<RangeEngine | null>(null);
  const audioRef = useRef<RangeAudio | null>(null);
  const ptsRef = useRef<HTMLSpanElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const accRef = useRef<HTMLSpanElement>(null);
  const phaseRef = useRef<Phase>("intro");
  const endingRef = useRef(false);
  const lockAttempt = useRef(0);
  const dpiRef = useRef(setup.dpi);
  const fovRef = useRef(setup.fov);
  const cmRef = useRef(40);
  const roundRef = useRef(0);
  const samplesRef = useRef<ProbeScore[]>([]);
  const windowRef = useRef<[number, number]>([35, 75]);
  const timingRef = useRef(timing);
  const currentCmRef = useRef(currentCm);

  useEffect(() => {
    dpiRef.current = setup.dpi;
    fovRef.current = setup.fov;
    currentCmRef.current = currentCm;
  }, [currentCm, setup.dpi, setup.fov]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    timingRef.current = timing;
  }, [timing]);

  useEffect(() => {
    const mode = finderQuery(window.location.search);
    if (mode !== "results" && mode !== "applied") return;
    const cm = Math.round((currentCmRef.current ?? 36.85) * 100) / 100;
    setResult(cm);
    setTiming(finderTiming(""));
    if (mode === "applied") {
      setAppliedSens(sensFromCm(cm, dpiRef.current, game.yaw));
      setPhase("applied");
      return;
    }
    setPhase("results");
    // Preview query is read once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new RangeEngine(canvas);
    const audio = new RangeAudio();
    engineRef.current = engine;
    audioRef.current = audio;
    if (engine.failed) setFailed(true);
    return () => {
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      engine.dispose();
      audio.dispose();
      engineRef.current = null;
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onChangeLock = () => {
      const canvas = canvasRef.current;
      const locked = document.pointerLockElement === canvas;
      if (locked) {
        phaseRef.current = "live";
        setPhase("live");
        return;
      }
      if (phaseRef.current === "live" && !endingRef.current) {
        audioRef.current?.setTracking(false);
        phaseRef.current = "paused";
        setPhase("paused");
        setNote("Soltaste el mouse. Esta ronda no cuenta.");
      }
      endingRef.current = false;
    };
    document.addEventListener("pointerlockchange", onChangeLock);
    return () => document.removeEventListener("pointerlockchange", onChangeLock);
  }, []);

  const lock = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || setup.dpi <= 0 || failed) return;
    setNote("");
    endingRef.current = false;
    const requestLock = canvas.requestPointerLock.bind(canvas) as (options?: {
      unadjustedMovement?: boolean;
    }) => void | Promise<void>;
    const attempt = lockAttempt.current + 1;
    lockAttempt.current = attempt;
    const fail = () => {
      if (lockAttempt.current !== attempt) return;
      if (document.pointerLockElement === canvas || phaseRef.current === "live") return;
      setNote("El navegador no capturó el mouse. Vuelve a pulsar el botón. Hace falta un mouse, no un trackpad.");
    };
    void Promise.resolve()
      .then(() => requestLock({ unadjustedMovement: true }))
      .catch(() => requestLock())
      .then(() => {
        window.setTimeout(fail, 400);
      })
      .catch(fail);
  }, [failed, setup.dpi]);

  useEffect(() => {
    if (phase !== "countdown") return;
    const seconds = timingRef.current.countdownS;
    let left = seconds;
    setRemain(left);
    const id = window.setInterval(() => {
      left -= 1;
      setRemain(left);
      if (left <= 0) {
        window.clearInterval(id);
        lock();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [lock, phase, roundIndex]);

  useEffect(() => {
    const current = engineRef.current;
    if (!current || current.failed) return;
    const engine = current;
    if (phase !== "live") {
      engine.onShoot = null;
      engine.onFrame = null;
      engine.showIdle();
      engine.resetView();
      audioRef.current?.setTracking(false);
      writeHud(ptsRef, timeRef, accRef, 0, clockMs(0), 0);
      return;
    }

    const dpiRound = dpiRef.current;
    const cmRound = cmRef.current;
    const timing = timingRef.current;
    const roundTask = taskForRound(roundRef.current);
    engine.setSensitivity(dpiRound, cmRound);
    engine.setHfov(fovRef.current);
    engine.resetView();
    let points = 0;
    let hits = 0;
    let misses = 0;
    const shots: Shot[] = [];
    let aim = { yaw: 0, pitch: 0 };
    let origin = { yaw: 0, pitch: 0 };
    let maxPast = -999;
    let started = 0;
    let accepting = false;
    let tracking = roundTask === "track";
    let trackOn = 0;
    let trackSamples = 0;
    let trackCrosses = 0;
    let trackLag = 0;
    let trackLagSamples = 0;
    let lastSide = 0;
    let lastOn = false;
    const begun = performance.now();
    const phase1 = 0.8 + Math.random() * Math.PI * 2;
    const phase2 = Math.random() * Math.PI * 2;
    const amp1 = 11 + Math.random() * 6;
    const amp2 = 4.5 + Math.random() * 3.5;
    const w1 = 1.05 + Math.random() * 0.45;
    const w2 = 1.9 + Math.random() * 0.7;

    function accuracy(): number {
      if (tracking) return trackSamples === 0 ? 0 : trackOn / trackSamples;
      const total = hits + misses;
      return total === 0 ? 0 : hits / total;
    }

    function paintHud(now = performance.now()) {
      const left = Math.max(0, timing.roundMs - (now - begun));
      writeHud(ptsRef, timeRef, accRef, points, clockMs(left), accuracy());
    }

    function place() {
      engine.showTarget(aim.yaw, aim.pitch, roundTask);
    }

    function spawn() {
      const spreadYaw = roundTask === "precision" ? 16 : 24;
      const spreadPitch = roundTask === "precision" ? 5 : 8;
      aim = {
        yaw: (Math.random() * 2 - 1) * spreadYaw,
        pitch: clamp((Math.random() * 2 - 1) * spreadPitch, -8, 10),
      };
      origin = engine.getView();
      maxPast = -999;
      started = performance.now();
      accepting = true;
      place();
      paintHud();
    }

    function trackPast() {
      const view = engine.getView();
      const vx = aim.yaw - origin.yaw;
      const vy = aim.pitch - origin.pitch;
      const len = Math.hypot(vx, vy) || 1;
      const along = ((view.yaw - origin.yaw) * vx + (view.pitch - origin.pitch) * vy) / len;
      maxPast = Math.max(maxPast, along - len);
    }

    function sampleTrack(now: number) {
      const t = (now - begun) / 1000;
      const vyaw = amp1 * w1 * Math.cos(t * w1 + phase1) + amp2 * w2 * Math.cos(t * w2 + phase2);
      aim = {
        yaw: amp1 * Math.sin(t * w1 + phase1) + amp2 * Math.sin(t * w2 + phase2),
        pitch: 3.2 * Math.sin(t * 0.85 + phase2),
      };
      engine.showTarget(aim.yaw, aim.pitch, "track");
      const view = engine.getView();
      const ex = aim.yaw - view.yaw;
      const ey = aim.pitch - view.pitch;
      const dist = Math.hypot(ex, ey);
      const on = dist <= 1.85;
      trackSamples += 1;
      if (on) {
        trackOn += 1;
        if (trackSamples % 28 === 0) points += 1;
      }
      engine.setOnTarget(on);
      if (on !== lastOn) {
        audioRef.current?.setTracking(on);
        lastOn = on;
      }
      if (Math.abs(ex) > 0.45) {
        const side = Math.sign(ex);
        if (lastSide !== 0 && side !== lastSide) trackCrosses += 1;
        lastSide = side;
      }
      if (Math.abs(vyaw) > 4) {
        trackLag += ex * Math.sign(vyaw);
        trackLagSamples += 1;
      }
    }

    function finishRound() {
      endingRef.current = true;
      accepting = false;
      tracking = false;
      audioRef.current?.setTracking(false);
      const sample: RoundSample = {
        task: roundTask,
        cm: cmRound,
        hits,
        misses,
        over: shots.filter((shot) => shot.kind === "over").length,
        under: shots.filter((shot) => shot.kind === "under").length,
        medianMs: median(shots.filter((shot) => shot.hit).map((shot) => shot.ms)),
        trackOn: trackSamples === 0 ? 0 : trackOn / trackSamples,
        trackCrosses: trackCrosses / Math.max(timing.roundMs / 1000, 1),
        trackLag: trackLagSamples === 0 ? 0 : trackLag / trackLagSamples,
        durationMs: timing.roundMs,
      };
      const scored = scoreSample(sample);
      samplesRef.current = [...samplesRef.current, scored];
      const nextIndex = roundRef.current + 1;
      const canvas = canvasRef.current;
      if (canvas && document.pointerLockElement === canvas) document.exitPointerLock();
      if (nextIndex >= timing.rounds) {
        const rec = recommendCm(samplesRef.current, windowRef.current);
        setResult(rec);
        phaseRef.current = "results";
        setPhase("results");
        return;
      }
      roundRef.current = nextIndex;
      setRoundIndex(nextIndex);
      const nextTask = taskForRound(nextIndex);
      setTask(nextTask);
      cmRef.current = nextProbeCm({
        roundIndex: nextIndex,
        totalRounds: timing.rounds,
        currentCm: currentCmRef.current ?? cmRound,
        window: windowRef.current,
        samples: samplesRef.current,
      });
      phaseRef.current = "countdown";
      setPhase("countdown");
    }

    function onShot() {
      trackPast();
      const radius = roundTask === "precision" ? 0.9 : 1.45;
      const overshoot = roundTask === "precision" ? 0.5 : 1.1;
      const view = engine.getView();
      const dist = Math.hypot(aim.yaw - view.yaw, aim.pitch - view.pitch);
      const hit = engine.shootHit() || dist <= radius;
      const kind = classifyShot(hit, maxPast, overshoot, roundTask === "precision" ? 0.4 : 0.8);
      shots.push({ kind, hit, ms: performance.now() - started });
      if (hit) {
        hits += 1;
        points += 1;
        engine.burst();
        audioRef.current?.pop();
      } else {
        misses += 1;
      }
      spawn();
    }

    engine.onFrame = () => {
      const now = performance.now();
      paintHud(now);
      if (now - begun >= timing.roundMs) {
        engine.onFrame = null;
        engine.onShoot = null;
        finishRound();
        return;
      }
      if (tracking) {
        sampleTrack(now);
        return;
      }
      if (accepting) trackPast();
    };

    engine.onShoot = () => {
      if (!accepting || tracking) return;
      onShot();
    };

    paintHud();
    if (tracking) {
      accepting = true;
      sampleTrack(performance.now());
    } else {
      window.setTimeout(() => spawn(), 180);
    }

    return () => {
      engine.onShoot = null;
      engine.onFrame = null;
      engine.hideTarget();
      audioRef.current?.setTracking(false);
    };
  }, [phase]);

  function beginRun() {
    const timing = finderTiming(window.location.search);
    setTiming(timing);
    timingRef.current = timing;
    const startCm = currentCm ?? cmPer360(setup.dpi, setup.sens, game.yaw);
    const range = searchWindow(game.band, setup.playstyle, startCm);
    windowRef.current = range;
    samplesRef.current = [];
    roundRef.current = 0;
    setRoundIndex(0);
    setResult(null);
    setAppliedSens(null);
    setTask(taskForRound(0));
    cmRef.current = nextProbeCm({
      roundIndex: 0,
      totalRounds: timing.rounds,
      currentCm: startCm,
      window: range,
      samples: [],
    });
    audioRef.current?.resume();
    setRemain(timing.countdownS);
    setPhase("countdown");
  }

  function retry() {
    setPhase("intro");
    setNote("");
    setResult(null);
    setAppliedSens(null);
  }

  function leave(view: LeaveView) {
    if (document.pointerLockElement) document.exitPointerLock();
    onLeave(view);
  }

  function applyResult() {
    if (result == null) return;
    onApply(result);
    setAppliedSens(sensFromCm(result, setup.dpi, game.yaw));
    setPhase("applied");
  }

  const completed = phase === "results" || phase === "applied" ? timing.rounds : roundIndex;
  const percent = progressPct(completed, timing.rounds);

  return (
    <section className="range">
      <canvas ref={canvasRef} />
      <div className="range-brand">
        <strong>GIRO</strong>
      </div>
      <nav className="range-links" aria-label="Otras secciones">
        <button type="button" onClick={() => leave("numeros")}>
          Números
        </button>
        <button type="button" onClick={() => leave("metodo")}>
          Método
        </button>
      </nav>
      <div className="aim-bar" aria-hidden="true">
        <span className="aim-pill" ref={ptsRef}>
          PTS 0
        </span>
        <span className="aim-pill" ref={timeRef}>
          0:00
        </span>
        <span className="aim-pill" ref={accRef}>
          0%
        </span>
      </div>
      {phase === "live" ? <div className="aim-dot" /> : null}

      {failed ? (
        <div className="range-veil">
          <div className="range-card">
            <h1>Este navegador no abrió el rango 3D.</h1>
            <p>Hace falta WebGL. Prueba con Chrome o Edge en una computadora.</p>
          </div>
        </div>
      ) : null}

      {phase === "intro" && !failed ? (
        <div className="range-veil">
          <div className="range-card range-card-mid">
            <p className="eyebrow">Buscador</p>
            <h1>Encuentra tu sensibilidad</h1>
            <p>La prueba dura unos 10 minutos.</p>
            <p>
              Rondas cortas de seguimiento y flicks. Giro cambia la distancia entre rondas, mide si te
              pasas o te quedas corto, y al final te da un cm/360.
            </p>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                audioRef.current?.resume();
                setPhase("profile");
              }}
            >
              EMPEZAR
            </button>
            <p className="hint">Mouse, no trackpad. Escape suelta el mouse.</p>
          </div>
        </div>
      ) : null}

      {phase === "profile" ? (
        <div className="range-veil">
          <div className="range-card range-card-mid">
            <p className="eyebrow">Tu juego</p>
            <h1>Datos de partida</h1>
            <div className="range-form stacked">
              <SelectField
                label="Juego"
                value={setup.gameId}
                onChange={(id) => {
                  const next = GAMES.find((item) => item.id === id) ?? game;
                  const cm = currentCm;
                  onChange({
                    ...setup,
                    gameId: next.id,
                    fov: next.defaultFov,
                    sens: cm == null ? setup.sens : sensFromCm(cm, setup.dpi, next.yaw),
                  });
                }}
              >
                {GAMES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </SelectField>
              <NumberField
                label={game.unit === "%" ? "Sensibilidad X" : "Sensibilidad actual"}
                value={setup.sens}
                digits={game.decimals}
                min={0.001}
                max={500}
                suffix={game.unit === "%" ? "%" : undefined}
                onChange={(sens) => onChange({ ...setup, sens })}
              />
              <NumberField
                label="FOV"
                value={setup.fov}
                digits={0}
                min={60}
                max={120}
                inputMode="numeric"
                onChange={(fov) => onChange({ ...setup, fov })}
              />
            </div>
            <p className="kicker playstyle-label">Cómo juegas</p>
            <div className="playstyle">
              {PLAYSTYLES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={setup.playstyle === item.id}
                  onClick={() => onChange({ ...setup, playstyle: item.id })}
                >
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </button>
              ))}
            </div>
            <button type="button" className="btn primary" onClick={() => setPhase("dpi")}>
              CONTINUAR
            </button>
          </div>
        </div>
      ) : null}

      {phase === "dpi" ? (
        <div className="range-veil">
          <div className="range-card">
            <p className="eyebrow">Mouse</p>
            <h1>Ingresa tu DPI</h1>
            <p>El cm/360 sale de DPI × sensibilidad × yaw del juego.</p>
            <div className="range-form stacked">
              <NumberField
                label="DPI"
                value={setup.dpi}
                min={100}
                max={36000}
                inputMode="numeric"
                onChange={(dpi) => onChange({ ...setup, dpi })}
              />
            </div>
            <button type="button" className="btn primary" onClick={beginRun}>
              CONTINUAR
            </button>
          </div>
        </div>
      ) : null}

      {phase === "countdown" ? (
        <div className="range-veil">
          <div className="range-card">
            <p className="eyebrow">
              Ronda {roundIndex + 1} / {timing.rounds} · {percent}% completado
            </p>
            <p className="figure countdown">{remain}</p>
            <h1>{taskLabel(task)}</h1>
            <p>{taskHint(task)}</p>
            <button type="button" className="btn primary" onClick={lock}>
              Saltar cuenta regresiva
            </button>
            {note ? <p className="hint warn-text">{note}</p> : null}
          </div>
        </div>
      ) : null}

      {phase === "paused" ? (
        <div className="range-veil">
          <div className="range-card">
            <p className="eyebrow">
              Ronda {roundIndex + 1} / {timing.rounds}
            </p>
            <h1>Ronda interrumpida</h1>
            <p>{note}</p>
            <button type="button" className="btn primary" onClick={lock}>
              Reanudar
            </button>
          </div>
        </div>
      ) : null}

      {phase === "results" && result != null ? (
        <div className="range-veil">
          <div className="range-card range-card-mid">
            <p className="eyebrow">Resultado</p>
            <h1>Tu distancia de giro</h1>
            <p>
              El cm/360 es cuántos centímetros recorre el mouse para dar una vuelta completa. Más
              centímetros, más lenta la sensibilidad. Es la unidad que se copia entre juegos.
            </p>
            <p className="figure">
              {result.toFixed(2)}
              <small>cm/360</small>
            </p>
            <div className="actions">
              <button type="button" className="btn" onClick={retry}>
                Reintentar
              </button>
              <button type="button" className="btn" onClick={() => leave("numeros")}>
                Descartar y salir
              </button>
              <button type="button" className="btn primary" onClick={applyResult}>
                Aplicar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {phase === "applied" && result != null && appliedSens != null ? (
        <div className="range-veil">
          <div className="range-card range-card-mid">
            <p className="eyebrow">Aplicado</p>
            <h1>Sensibilidad en {game.name}</h1>
            <p className="figure">
              {formatSens(appliedSens, game.decimals, game.unit)}
            </p>
            <p>
              {result.toFixed(2)} cm/360 a {setup.dpi} DPI. Ya está guardado en Números.
            </p>
            <div className="actions">
              <button type="button" className="btn" onClick={retry}>
                Reintentar
              </button>
              <button type="button" className="btn primary" onClick={() => leave("numeros")}>
                Ir a Números
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function writeHud(
  pts: { current: HTMLSpanElement | null },
  time: { current: HTMLSpanElement | null },
  acc: { current: HTMLSpanElement | null },
  points: number,
  clockText: string,
  accuracy: number,
) {
  if (pts.current) pts.current.textContent = `PTS ${points}`;
  if (time.current) time.current.textContent = clockText;
  if (acc.current) acc.current.textContent = formatPct01(accuracy);
}

function clockMs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
