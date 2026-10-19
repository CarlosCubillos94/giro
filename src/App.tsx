import { BookOpen, Crosshair, Target } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Bench, SetupForm } from "./bench.tsx";
import { gameById } from "./lib/games.ts";
import { assess } from "./lib/health.ts";
import { sensFromCm } from "./lib/sensitivity.ts";
import { Method } from "./method.tsx";
import { RangeSession } from "./range/RangeSession.tsx";
import { DEFAULT_SETUP, loadSetup, saveSetup, type Setup } from "./setup.ts";

type View = "jugar" | "numeros" | "metodo";

const VIEWS: { id: View; label: string; icon: typeof Crosshair }[] = [
  { id: "jugar", label: "Jugar", icon: Target },
  { id: "numeros", label: "Números", icon: Crosshair },
  { id: "metodo", label: "Método", icon: BookOpen },
];

export default function App() {
  const [setup, setSetup] = useState<Setup>(DEFAULT_SETUP);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<View>("jugar");

  useEffect(() => {
    setSetup(loadSetup());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveSetup(setup);
  }, [setup, hydrated]);

  useEffect(() => {
    const label = VIEWS.find((item) => item.id === view)?.label ?? "Jugar";
    document.title = `GIRO · ${label}`;
  }, [view]);

  const game = gameById(setup.gameId);
  const health = assess({
    dpi: setup.dpi,
    sens: setup.sens,
    yaw: game.yaw,
    padCm: setup.padCm,
    band: game.band,
    gameName: game.name,
  });

  function applyCm(cm: number) {
    setSetup((current) => ({
      ...current,
      foundCm: cm,
      sens: sensFromCm(cm, current.dpi, gameById(current.gameId).yaw),
    }));
  }

  return (
    <div className={view === "jugar" ? "app is-range" : "app"}>
      <header className="top">
        <div className="brand">
          <strong>GIRO</strong>
          <span>juegos de puntería</span>
        </div>
        <nav className="nav" aria-label="Secciones">
          {VIEWS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={view === item.id ? "page" : undefined}
                onClick={() => setView(item.id)}
              >
                <Icon size={18} weight="light" aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>

      {view === "jugar" ? (
        <RangeSession
          setup={setup}
          currentCm={health?.cm360 ?? null}
          onChange={setSetup}
          onApply={applyCm}
          onLeave={setView}
        />
      ) : (
        <div className="stage">
          <SetupForm setup={setup} onChange={setSetup} />
          <main className="main">
            {view === "numeros" ? (
              <Bench
                setup={setup}
                health={health}
                foundCm={setup.foundCm}
                onChange={setSetup}
                onApplyFound={() => {
                  if (setup.foundCm != null) applyCm(setup.foundCm);
                }}
                onOpenFinder={() => setView("jugar")}
              />
            ) : null}
            {view === "metodo" ? <Method setup={setup} health={health} /> : null}
          </main>
        </div>
      )}

      <nav className="tabbar" aria-label="Secciones">
        {VIEWS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => setView(item.id)}
            >
              <Icon size={20} weight="light" aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
