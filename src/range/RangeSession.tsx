import { useCallback, useEffect, useRef, useState } from "react";
import { classifyShot, median, type Shot } from "../lib/finder.ts";
import {
  canRunRound,
  exitFullscreen,
  isFullscreen,
  onFullscreenChange,
  requestFullscreen,
} from "../lib/fullscreen.ts";
import { fovNote } from "../lib/fov.ts";
import { formatPct01, formatSens } from "../lib/format.ts";
import { GAMES } from "../lib/games.ts";
import { cmPer360, sensFromCm } from "../lib/sensitivity.ts";
import {
  commitPending,
  finderQuery,
  finderTiming,
  nextProbeCm,
  progressPct,
  recapFromRound,
  recommendCm,
  scoreSample,
  searchWindow,
  taskForRound,
  taskHint,
  taskKind,
  taskLabel,
  taskTitle,
  type FinderTiming,
  type Playstyle,
  type ProbeScore,
  type ProbeTask,
  type RoundRecap,
  type RoundSample,
} from "../lib/session.ts";
import type { Setup } from "../setup.ts";
import { CopyButton, NumberField, SelectField } from "../ui.tsx";
import { RangeAudio } from "./audio.ts";
import { RangeEngine } from "./engine.ts";

type Phase =
  | "intro"
  | "profile"
  | "dpi"
  | "ready"
  | "live"
  | "paused"
  | "recap"
  | "results"
  | "applied";
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
  const [result, setResult] = useState<number | null>(null);
  const [recap, setRecap] = useState<RoundRecap | null>(null);
  const [why, setWhy] = useState("");
  const [appliedSens, setAppliedSens] = useState<number | null>(null);
  const [task, setTask] = useState<ProbeTask>("track");
  const [timing, setTiming] = useState<FinderTiming>(() => finderTiming());

  const rangeRef = useRef<HTMLElement | null>(null);
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
  const fovRef = useRef({ h: game.defaultFov, basis: game.fovBasis });
  const cmRef = useRef(40);
  const roundRef = useRef(0);
  const samplesRef = useRef<ProbeScore[]>([]);
  const pendingScoreRef = useRef<ProbeScore | null>(null);
  const windowRef = useRef<[number, number]>([35, 75]);
  const timingRef = useRef(timing);
  const currentCmRef = useRef(currentCm);
  const startCmRef = useRef(40);

  useEffect(() => {
    dpiRef.current = setup.dpi;
    currentCmRef.current = currentCm;
    fovRef.current = { h: game.defaultFov, basis: game.fovBasis };
  }, [currentCm, game.defaultFov, game.fovBasis, setup.dpi]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    timingRef.current = timing;
  }, [timing]);

  useEffect(() => {
    engineRef.current?.setGameFov(game.defaultFov, game.fovBasis);
  }, [game.defaultFov, game.fovBasis]);

  useEffect(() => {
    const mode = finderQuery(window.location.search);
    if (mode === "paused") {
      setTiming(finderTiming(""));
      setPhase("paused");
      return;
    }
    if (mode === "ready") {
      setTiming(finderTiming(""));
      setTask("track");
      setPhase("ready");
      return;
    }
    if (mode === "recap") {
      setTiming(finderTiming(""));
      setRoundIndex(1);
      setTask("speed");
      setRecap({
        task: "speed",
        points: 8,
        hits: 8,
        misses: 2,
        accuracy: 0.8,
        medianMs: 312,
        overPct: 62,
        underPct: 10,
        trackOn: null,
      });
      setPhase("recap");
      return;
    }
    if (mode !== "results" && mode !== "applied") return;
    const cm = Math.round((currentCmRef.current ?? 36.85) * 100) / 100;
    setResult(cm);
    setWhy("Te pasaste en el 62% de los flicks. Por eso sube el cm/360: más centímetros, más lenta.");
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
      endingRef.current = true;
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      void exitFullscreen();
      engine.dispose();
      audio.dispose();
      engineRef.current = null;
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onGuards = () => {
      const canvas = canvasRef.current;
      const ready = canRunRound(isFullscreen(), document.pointerLockElement === canvas);
      if (ready) {
        if (phaseRef.current === "ready" || phaseRef.current === "paused") {
          phaseRef.current = "live";
          setPhase("live");
        }
        return;
      }
      if (endingRef.current) return;
      if (phaseRef.current !== "live") return;
      audioRef.current?.setTracking(false);
      if (document.pointerLockElement) document.exitPointerLock();
      phaseRef.current = "paused";
      setPhase("paused");
    };
    document.addEventListener("pointerlockchange", onGuards);
    const offFs = onFullscreenChange(onGuards);
    return () => {
      document.removeEventListener("pointerlockchange", onGuards);
      offFs();
    };
  }, []);

  const enterPlay = useCallback(() => {
    const canvas = canvasRef.current;
    const root = rangeRef.current;
    if (!canvas || !root || setup.dpi <= 0 || failed) return;
    setNote("");
    endingRef.current = false;
    const requestLock = canvas.requestPointerLock.bind(canvas) as (options?: {
      unadjustedMovement?: boolean;
    }) => void | Promise<void>;
    const attempt = lockAttempt.current + 1;
    lockAttempt.current = attempt;
    const fail = (msg: string) => {
      if (lockAttempt.current !== attempt) return;
      if (canRunRound(isFullscreen(), document.pointerLockElement === canvas)) return;
      setNote(msg);
    };
    const lockPointer = () =>
      Promise.resolve()
        .then(() => requestLock({ unadjustedMovement: true }))
        .then(() => {
          engineRef.current?.setRawMovement(true);
        })
        .catch(() =>
          Promise.resolve(requestLock()).then(() => {
            engineRef.current?.setRawMovement(false);
          }),
        );
    void (async () => {
      if (!isFullscreen()) {
        await requestFullscreen(root);
      }
      if (!isFullscreen()) {
        fail("Hace falta pantalla completa para las rondas. Vuelve a pulsar el botón.");
        return;
      }
      await lockPointer();
      window.setTimeout(() => {
        if (canRunRound(isFullscreen(), document.pointerLockElement === canvas)) {
          phaseRef.current = "live";
          setPhase("live");
          return;
        }
        if (document.pointerLockElement === canvas && !isFullscreen()) {
          document.exitPointerLock();
          fail("Hace falta pantalla completa para las rondas. Vuelve a pulsar el botón.");
          return;
        }
        fail("El navegador no capturó el mouse. Vuelve a pulsar el botón. Hace falta un mouse, no un trackpad.");
      }, 400);
    })().catch(() => fail("El navegador no pasó a pantalla completa. Vuelve a pulsar el botón."));
  }, [failed, setup.dpi]);

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
    if (!canRunRound(isFullscreen(), document.pointerLockElement === canvasRef.current)) {
      engine.onShoot = null;
      engine.onFrame = null;
      engine.showIdle();
      audioRef.current?.setTracking(false);
      return;
    }

    const dpiRound = dpiRef.current;
    const cmRound = cmRef.current;
    const timing = timingRef.current;
    const roundTask = taskForRound(roundRef.current);
    engine.setSensitivity(dpiRound, cmRound);
    engine.setGameFov(fovRef.current.h, fovRef.current.basis);
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
    let lastAlong = 0;
    let lastDir = 0;
    let corrections = 0;
    let errorSum = 0;
    let absErrorSum = 0;
    let correctionSum = 0;
    let flickCount = 0;
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
      lastAlong = 0;
      lastDir = 0;
      corrections = 0;
      started = performance.now();
      accepting = true;
      place();
      paintHud();
    }

    function trackPath() {
      const view = engine.getView();
      const vx = aim.yaw - origin.yaw;
      const vy = aim.pitch - origin.pitch;
      const len = Math.hypot(vx, vy) || 1;
      const along = ((view.yaw - origin.yaw) * vx + (view.pitch - origin.pitch) * vy) / len;
      maxPast = Math.max(maxPast, along - len);
      const dAlong = along - lastAlong;
      if (Math.abs(dAlong) > 0.08) {
        const dir = Math.sign(dAlong);
        if (lastDir !== 0 && dir !== lastDir) corrections += 1;
        lastDir = dir;
        lastAlong = along;
      }
      return { along, len, alongError: along - len };
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
      if (phaseRef.current !== "live") return;
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
        meanErrorDeg: flickCount === 0 ? 0 : errorSum / flickCount,
        meanAbsErrorDeg: flickCount === 0 ? 0 : absErrorSum / flickCount,
        correctionsPerShot: flickCount === 0 ? 0 : correctionSum / flickCount,
      };
      const scored = scoreSample(sample);
      pendingScoreRef.current = scored;
      setRecap(recapFromRound(sample, points));
      const canvas = canvasRef.current;
      if (canvas && document.pointerLockElement === canvas) document.exitPointerLock();
      void exitFullscreen();
      phaseRef.current = "recap";
      setPhase("recap");
    }

    function onShot() {
      const path = trackPath();
      const radius = roundTask === "precision" ? 0.9 : 1.45;
      const overshoot = roundTask === "precision" ? 0.5 : 1.1;
      const view = engine.getView();
      const dist = Math.hypot(aim.yaw - view.yaw, aim.pitch - view.pitch);
      const hit = engine.shootHit() || dist <= radius;
      const kind = classifyShot(hit, maxPast, overshoot, roundTask === "precision" ? 0.4 : 0.8);
      const signed = maxPast > 0.2 ? maxPast : path.alongError;
      errorSum += signed;
      absErrorSum += Math.abs(signed);
      correctionSum += corrections;
      flickCount += 1;
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
      if (accepting) trackPath();
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
    startCmRef.current = startCm;
    samplesRef.current = [];
    roundRef.current = 0;
    setRoundIndex(0);
    setResult(null);
    setWhy("");
    setAppliedSens(null);
    setTask(taskForRound(0));
    cmRef.current = nextProbeCm({
      roundIndex: 0,
      totalRounds: timing.rounds,
      currentCm: startCm,
      window: range,
      samples: [],
    });
    pendingScoreRef.current = null;
    setRecap(null);
    audioRef.current?.resume();
    setPhase("ready");
  }

  function continueAfterRecap() {
    samplesRef.current = commitPending(samplesRef.current, pendingScoreRef.current);
    pendingScoreRef.current = null;
    const nextIndex = roundRef.current + 1;
    if (nextIndex >= timingRef.current.rounds) {
      const rec = recommendCm(samplesRef.current, windowRef.current, startCmRef.current);
      setResult(rec.cm);
      setWhy(rec.why);
      setRecap(null);
      phaseRef.current = "results";
      setPhase("results");
      void exitFullscreen();
      return;
    }
    roundRef.current = nextIndex;
    setRoundIndex(nextIndex);
    setTask(taskForRound(nextIndex));
    cmRef.current = nextProbeCm({
      roundIndex: nextIndex,
      totalRounds: timingRef.current.rounds,
      currentCm: startCmRef.current,
      window: windowRef.current,
      samples: samplesRef.current,
    });
    setRecap(null);
    phaseRef.current = "ready";
    setPhase("ready");
    enterPlay();
  }

  function repeatTask() {
    pendingScoreRef.current = null;
    setRecap(null);
    phaseRef.current = "ready";
    setPhase("ready");
    enterPlay();
  }

  function retry() {
    endingRef.current = true;
    if (document.pointerLockElement) document.exitPointerLock();
    void exitFullscreen();
    pendingScoreRef.current = null;
    setRecap(null);
    setPhase("intro");
    setNote("");
    setResult(null);
    setWhy("");
    setAppliedSens(null);
  }

  function leave(view: LeaveView) {
    endingRef.current = true;
    if (document.pointerLockElement) document.exitPointerLock();
    void exitFullscreen();
    onLeave(view);
  }

  function applyResult() {
    if (result == null) return;
    onApply(result);
    setAppliedSens(sensFromCm(result, setup.dpi, game.yaw));
    setPhase("applied");
  }

  const completed =
    phase === "results" || phase === "applied"
      ? timing.rounds
      : phase === "recap"
        ? roundIndex + 1
        : roundIndex;
  const nextTask = taskForRound(phase === "recap" ? roundIndex + 1 : roundIndex);
  const lastRound = roundIndex + 1 >= timing.rounds;
  const percent = progressPct(completed, timing.rounds);

  return (
    <section className="range" ref={rangeRef}>
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

      {failed && phase !== "results" && phase !== "applied" && phase !== "ready" && phase !== "recap" && phase !== "paused" ? (
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
              Rondas cortas de seguimiento y flicks. Giro parte de tu cm/360 y lo mueve si te pasas o
              te quedas corto de forma constante. La precisión pesa más que los aciertos rápidos.
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
            <p className="hint">Mouse, no trackpad. Las rondas van a pantalla completa. Escape suelta el mouse.</p>
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
            </div>
            <p className="hint">{fovNote(game.name, game.defaultFov, game.fovBasis)}</p>
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

      {phase === "ready" ? (
        <div className="range-veil">
          <div className="range-card range-card-mid">
            <p className="eyebrow">
              Ronda {roundIndex + 1} / {timing.rounds} · {percent}% completado
            </p>
            <h1>{taskLabel(task)}</h1>
            <p className="next-kind">{taskKind(task)}</p>
            <p>{taskHint(task)}</p>
            <div className="actions">
              <button type="button" className="btn primary" onClick={enterPlay}>
                Continuar: {taskTitle(task)}
              </button>
              <button type="button" className="btn" onClick={() => leave("numeros")}>
                Salir
              </button>
            </div>
            <p className="hint">Hace falta pantalla completa. El mouse queda capturado. La sensibilidad de la ronda no se muestra.</p>
            {note ? <p className="hint warn-text">{note}</p> : null}
          </div>
        </div>
      ) : null}

      {phase === "recap" && recap != null ? (
        <div className="range-veil">
          <div className="range-card range-card-mid">
            <p className="eyebrow">
              Ronda {roundIndex + 1} / {timing.rounds} · {percent}% completado
            </p>
            <h1>Ronda terminada</h1>
            <p>
              {taskTitle(recap.task)} · {taskKind(recap.task)}
            </p>
            <dl className="range-stats">
              <div>
                <dt>Puntos</dt>
                <dd>{recap.points}</dd>
              </div>
              {recap.task === "track" ? (
                <div>
                  <dt>Tiempo en blanco</dt>
                  <dd>{formatPct01(recap.trackOn ?? recap.accuracy)}</dd>
                </div>
              ) : (
                <>
                  <div>
                    <dt>Precisión</dt>
                    <dd>{formatPct01(recap.accuracy)}</dd>
                  </div>
                  <div>
                    <dt>Aciertos / fallos</dt>
                    <dd>
                      {recap.hits} / {recap.misses}
                    </dd>
                  </div>
                  <div>
                    <dt>Reacción</dt>
                    <dd>{recap.medianMs == null ? "—" : `${Math.round(recap.medianMs)} ms`}</dd>
                  </div>
                  <div>
                    <dt>Te pasaste</dt>
                    <dd>{recap.overPct}%</dd>
                  </div>
                  <div>
                    <dt>Te quedaste corto</dt>
                    <dd>{recap.underPct}%</dd>
                  </div>
                </>
              )}
            </dl>
            {lastRound ? (
              <p className="next-kind">Siguiente: ver el cm/360 recomendado.</p>
            ) : (
              <>
                <p className="next-kind">
                  Siguiente: {taskTitle(nextTask)} · {taskKind(nextTask)}
                </p>
                <p>{taskHint(nextTask)}</p>
              </>
            )}
            <div className="actions">
              <button type="button" className="btn primary" onClick={continueAfterRecap}>
                {lastRound ? "Continuar: Ver resultado" : `Continuar: ${taskTitle(nextTask)}`}
              </button>
              <button type="button" className="btn" onClick={repeatTask}>
                Repetir tarea
              </button>
              <button type="button" className="btn" onClick={() => leave("numeros")}>
                Salir
              </button>
            </div>
            {note ? <p className="hint warn-text">{note}</p> : null}
          </div>
        </div>
      ) : null}

      {phase === "paused" ? (
        <div className="range-veil">
          <div className="range-card range-card-mid">
            <p className="eyebrow">
              Ronda {roundIndex + 1} / {timing.rounds}
            </p>
            <h1>Vuelve a pantalla completa para continuar</h1>
            <p>Saliste de pantalla completa o soltaste el mouse. Esta ronda no cuenta.</p>
            <div className="actions">
              <button type="button" className="btn primary" onClick={enterPlay}>
                Continuar
              </button>
              <button type="button" className="btn" onClick={enterPlay}>
                Reintentar
              </button>
              <button type="button" className="btn" onClick={() => leave("numeros")}>
                Salir
              </button>
            </div>
            {note ? <p className="hint warn-text">{note}</p> : null}
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
            {why ? <p className="why">{why}</p> : null}
            <div className="actions">
              <button type="button" className="btn" onClick={retry}>
                Reintentar
              </button>
              <button type="button" className="btn" onClick={() => leave("numeros")}>
                Descartar y salir
              </button>
              <button type="button" className="btn primary" onClick={applyResult}>
                Ver mi sensibilidad para {game.name}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {phase === "applied" && result != null && appliedSens != null ? (
        <div className="range-veil">
          <div className="range-card range-card-mid">
            <p className="eyebrow">Para el juego</p>
            <h1>Sensibilidad para {game.name}</h1>
            <p>
              Giro no puede cambiar los ajustes de {game.name}. Copia este valor en la
              configuración de sensibilidad del juego.
            </p>
            <p className="figure">{formatSens(appliedSens, game.decimals, game.unit)}</p>
            <p className="sens-dpi">
              A {setup.dpi} DPI. Pégalo en los ajustes de {game.name}.
            </p>
            <p className="hint">
              {result.toFixed(2)} cm/360. El número también quedó en Números para pasarlo a
              otros juegos.
            </p>
            <div className="actions">
              <CopyButton
                className="btn primary"
                text={formatSens(appliedSens, game.decimals, game.unit)}
              >
                Copiar sensibilidad
              </CopyButton>
              <button type="button" className="btn" onClick={retry}>
                Reintentar
              </button>
              <button type="button" className="btn" onClick={() => leave("numeros")}>
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
