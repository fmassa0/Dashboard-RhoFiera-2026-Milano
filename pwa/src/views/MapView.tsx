import { useMemo } from "react";
import { useAppState } from "../state";
import { HALL_BOXES } from "../data/halls";
import type { ViewName } from "../types";

interface Props {
  setView: (v: ViewName) => void;
  setPadiglioneFilter: (p: string) => void;
}

export function MapView({ setView, setPadiglioneFilter }: Props) {
  const { exhibitors, visits } = useAppState();
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  const stats = useMemo(() => {
    const map: Record<string, { total: number; visited: number }> = {};
    for (const e of exhibitors) {
      const p = e.padiglione || "?";
      map[p] ??= { total: 0, visited: 0 };
      map[p].total += 1;
      if (visits[e.id]?.visited) map[p].visited += 1;
    }
    return map;
  }, [exhibitors, visits]);

  const ordered = useMemo(
    () =>
      Object.entries(stats).sort(
        ([a], [b]) => Number(a) - Number(b) || a.localeCompare(b),
      ),
    [stats],
  );

  const totalVisited = ordered.reduce((s, [, x]) => s + x.visited, 0);
  const total = ordered.reduce((s, [, x]) => s + x.total, 0);

  const goToHall = (pad: string) => {
    setPadiglioneFilter(pad);
    setView("list");
  };

  // emerald 500 with alpha based on visit ratio
  const heatColor = (ratio: number) =>
    `rgba(16,185,129,${Math.min(0.78, 0.18 + ratio * 0.7)})`;

  return (
    <div className="px-4 pt-safe pb-2 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-bold">Mappa padiglioni</h1>
        <span className="text-xs text-neutral-500">
          {totalVisited}/{total} visitati
        </span>
      </div>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Tap su un padiglione per filtrare la lista. Le aree colorate riflettono la copertura delle visite.
      </p>

      <div className="grid gap-4 md:grid-cols-[2fr_1fr] items-start">
        {/* Mappa con hotspot */}
        <figure className="rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-white">
          <div className="relative w-full">
            <img
              src={`${base}/hall-plan-padiglioni.png`}
              alt="Planimetria padiglioni PLAST 2026"
              className="block w-full h-auto select-none"
              draggable={false}
              loading="eager"
            />
            {HALL_BOXES.map((b) => {
              const s = stats[b.id] ?? { total: 0, visited: 0 };
              const ratio = s.total ? s.visited / s.total : 0;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => goToHall(b.id)}
                  aria-label={`Padiglione ${b.id}: ${s.visited} visitati su ${s.total}, filtra lista`}
                  className="absolute group rounded-md ring-2 ring-transparent hover:ring-brand-500 focus-visible:ring-brand-500 transition-shadow"
                  style={{
                    left: `${b.left}%`,
                    top: `${b.top}%`,
                    width: `${b.width}%`,
                    height: `${b.height}%`,
                    backgroundColor: ratio > 0 ? heatColor(ratio) : "rgba(0,0,0,0.001)",
                  }}
                >
                  <span className="sr-only">Padiglione {b.id}</span>
                  {ratio > 0 && (
                    <span
                      className="absolute bottom-0.5 right-1 text-[10px] font-bold text-white drop-shadow"
                      aria-hidden="true"
                    >
                      {s.visited}/{s.total}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <figcaption className="px-3 py-2 text-xs text-neutral-500">
            Fonte: plastonline.org
          </figcaption>
        </figure>

        {/* Tile heatmap (desktop a fianco, mobile sotto) */}
        <section aria-label="Heatmap padiglioni">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 mb-2">
            Heatmap visite
          </h2>
          <ul className="grid grid-cols-2 md:grid-cols-1 gap-2">
            {ordered.map(([pad, x]) => {
              const ratio = x.total ? x.visited / x.total : 0;
              return (
                <li key={pad}>
                  <button
                    type="button"
                    onClick={() => goToHall(pad)}
                    className="w-full rounded-lg p-3 text-left border border-neutral-200 dark:border-neutral-800 min-h-tap hover:ring-2 hover:ring-brand-500 transition-all"
                    style={{ backgroundColor: ratio > 0 ? heatColor(ratio) : undefined }}
                    aria-label={`Padiglione ${pad}: ${x.visited} visitati su ${x.total}, filtra lista`}
                  >
                    <div className="font-semibold">
                      Pad. <span className="text-lg">{pad}</span>
                    </div>
                    <div className="text-xs text-neutral-700 dark:text-neutral-200">
                      {x.visited} / {x.total}
                      <span className="ml-1 opacity-70">
                        ({Math.round(ratio * 100)}%)
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
