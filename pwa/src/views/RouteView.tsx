import { useMemo, useState } from "react";
import { useAppState } from "../state";
import { FilterControls } from "../components/FilterControls";
import { LiveWalk } from "../components/LiveWalk";
import { RouteMap } from "../components/RouteMap";
import { HALL_BOXES } from "../data/halls";
import { formatRouteAsText, optimizeRoute } from "../data/route";
import { applyFilters, DEFAULT_FILTERS } from "../data/filters";
import type { ListFilters } from "../data/filters";
import type { ViewName } from "../types";

interface Props {
  setView: (v: ViewName) => void;
}

const DEFAULT_START = "9";

export function RouteView({ setView }: Props) {
  const {
    exhibitors,
    visits,
    settings,
    toggleVisited,
    togglePlanned,
    setRouteStart,
  } = useAppState();

  // I filtri della view sono indipendenti da quelli della Lista. "onlyPlanned"
  // qui è implicito (la view mostra solo i preferiti) e il sort è sostituito
  // dall'ottimizzazione del percorso, quindi non li mostriamo nei controlli.
  const [filters, setFilters] = useState<ListFilters>(DEFAULT_FILTERS);
  const [liveMode, setLiveMode] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  const start = settings.routeStart ?? DEFAULT_START;
  const imageBase = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  const planned = useMemo(
    () => exhibitors.filter((e) => visits[e.id]?.planned),
    [exhibitors, visits],
  );

  const filteredPlanned = useMemo(
    () => applyFilters(planned, filters, visits),
    [planned, filters, visits],
  );

  const route = useMemo(
    () => optimizeRoute(filteredPlanned, start),
    [filteredPlanned, start],
  );

  const visitedCount = filteredPlanned.reduce(
    (n, e) => n + (visits[e.id]?.visited ? 1 : 0),
    0,
  );

  // Web Share API se disponibile (mobile: apre il foglio condivisione nativo
  // → WhatsApp, mail, ecc.); fallback automatico al clipboard quando il
  // browser non supporta share o l'utente annulla. Serve a chi non ha la PWA
  // installata e quindi non può importare il JSON di sync.
  const shareRoute = async () => {
    if (filteredPlanned.length === 0) return;
    const url = window.location.origin + window.location.pathname;
    const text = formatRouteAsText(route, start, { url });
    const title = "Il mio percorso PLAST 2026";

    setShareMsg(null);

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        setShareMsg("Condiviso ✓");
        return;
      } catch (e) {
        // L'utente che chiude il foglio nativo lancia AbortError: non è un
        // errore, semplicemente non condividere e non mostrare messaggi.
        if ((e as DOMException)?.name === "AbortError") return;
        // qualunque altro errore: tenta il clipboard come ripiego
      }
    }

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        setShareMsg("Copiato negli appunti ✓ — incollalo dove vuoi");
        return;
      } catch {
        // continua al fallback finale
      }
    }

    setShareMsg("Condivisione non supportata da questo browser.");
  };

  const allHallIds = useMemo(
    () =>
      HALL_BOXES.map((h) => h.id).sort(
        (a, b) => Number(a) - Number(b) || a.localeCompare(b),
      ),
    [],
  );

  // Il pannello filtri va mostrato solo se l'utente ha selezionato qualcosa,
  // così l'empty state "nessun preferito" resta semplice e diretto.
  if (planned.length === 0) {
    return (
      <div className="px-4 pt-safe pb-2 max-w-2xl mx-auto space-y-4">
        <h1 className="text-xl font-bold">Percorso consigliato</h1>
        <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-center space-y-3">
          <p className="text-2xl" aria-hidden="true">★</p>
          <p className="font-medium">Nessuno espositore selezionato</p>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Apri la lista, usa i filtri per trovare gli stand che ti
            interessano e tocca la stella su una card per aggiungerla al
            percorso. Quando hai finito, torna qui per vedere l'ordine
            ottimizzato.
          </p>
          <button
            type="button"
            onClick={() => setView("list")}
            className="min-h-tap px-4 rounded-full bg-brand-500 text-white font-medium"
          >
            Vai alla lista
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-20 bg-white/95 dark:bg-neutral-950/95 backdrop-blur border-b border-neutral-200 dark:border-neutral-800 pt-safe">
        <div className="px-4 pt-1 pb-1 flex items-baseline justify-between gap-2">
          <h1 className="text-lg font-bold">Percorso consigliato</h1>
          <span className="text-xs text-neutral-500">
            {visitedCount}/{filteredPlanned.length} fatti
          </span>
        </div>

        <FilterControls
          filters={filters}
          onChange={setFilters}
          exhibitors={planned}
          hideSort
          hideOnlyPlanned
        />

        <div className="px-4 py-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          <label htmlFor="route-start">Parto da</label>
          <select
            id="route-start"
            value={start}
            onChange={(e) => void setRouteStart(e.target.value)}
            className="min-h-tap rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 text-sm"
          >
            {allHallIds.map((h) => (
              <option key={h} value={h}>
                Pad. {h}
              </option>
            ))}
          </select>
          <span>
            · {filteredPlanned.length} di {planned.length} stand ·{" "}
            {route.stops.length} {route.stops.length === 1 ? "padiglione" : "padiglioni"}
          </span>
          {route.unknownHalls.length > 0 && (
            <span className="text-amber-600 dark:text-amber-400">
              · {route.unknownHalls.length} pad. senza posizione mappata in coda
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-4 py-3 max-w-2xl mx-auto space-y-4">
          {filteredPlanned.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-center text-sm text-neutral-600 dark:text-neutral-400">
              Nessun espositore corrisponde ai filtri attivi. Pulisci i filtri
              per vedere tutto il percorso.
            </div>
          ) : (
            <>
            <button
              type="button"
              onClick={() => setLiveMode(true)}
              className="w-full rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-bold py-3 text-base shadow-sm"
            >
              ▶ Avvia percorso ({filteredPlanned.length} stand)
            </button>
            <button
              type="button"
              onClick={() => void shareRoute()}
              className="w-full min-h-tap rounded-lg border border-neutral-300 dark:border-neutral-700 font-medium text-sm inline-flex items-center justify-center gap-2"
            >
              <span aria-hidden="true">📤</span>
              Condividi percorso (testo)
            </button>
            {shareMsg && (
              <div
                role="status"
                aria-live="polite"
                className="text-xs text-center text-neutral-600 dark:text-neutral-400"
              >
                {shareMsg}
              </div>
            )}
            <RouteMap
              route={route}
              startHall={start}
              visits={visits}
              imageBase={imageBase}
            />
            <ol className="space-y-4">
              {route.stops.map((stop, idx) => {
                const stopVisited = stop.exhibitors.every((e) => visits[e.id]?.visited);
                return (
                  <li
                    key={stop.hall}
                    className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden"
                  >
                    <div
                      className={`px-4 py-2 flex items-center justify-between gap-2 ${
                        stopVisited
                          ? "bg-emerald-50 dark:bg-emerald-900/20"
                          : "bg-neutral-50 dark:bg-neutral-900"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          aria-hidden="true"
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white text-xs font-bold"
                        >
                          {idx + 1}
                        </span>
                        <span className="font-semibold">Pad. {stop.hall}</span>
                        <span className="text-xs text-neutral-500">
                          {stop.exhibitors.length} stand
                        </span>
                      </div>
                    </div>
                    <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                      {stop.exhibitors.map((ex) => {
                        const v = visits[ex.id];
                        const isVisited = v?.visited ?? false;
                        return (
                          <li
                            key={ex.id}
                            className={`px-4 py-2 flex items-start gap-3 min-h-tap ${
                              isVisited ? "bg-emerald-50/50 dark:bg-emerald-900/10" : ""
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => void toggleVisited(ex.id)}
                              aria-pressed={isVisited}
                              aria-label={
                                isVisited ? "Segna come non visitato" : "Segna come visitato"
                              }
                              className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                                isVisited
                                  ? "bg-emerald-500 border-emerald-500 text-white"
                                  : "border-neutral-300 dark:border-neutral-600"
                              }`}
                            >
                              {isVisited ? "✓" : ""}
                            </button>
                            <div className="min-w-0 flex-1">
                              <div
                                className={`font-medium leading-tight truncate ${
                                  isVisited ? "line-through text-neutral-500" : ""
                                }`}
                              >
                                {ex.nome}
                              </div>
                              <div className="text-xs text-neutral-500 truncate">
                                {ex.stand ? `Stand ${ex.stand}` : "Stand n.d."}
                                {ex.citta ? ` · ${ex.citta}` : ""}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => void togglePlanned(ex.id)}
                              aria-label="Rimuovi dal percorso"
                              title="Rimuovi dal percorso"
                              className="shrink-0 min-h-tap min-w-tap px-2 text-amber-500 text-lg"
                            >
                              <span aria-hidden="true">★</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ol>
            </>
          )}

          <p className="text-xs text-neutral-500 pt-2">
            L'ordine minimizza gli spostamenti fra padiglioni partendo dal Pad.{" "}
            {start}; gli stand dentro lo stesso padiglione sono ordinati per numero.
          </p>
        </div>
      </div>

      {liveMode && (
        <LiveWalk route={route} onExit={() => setLiveMode(false)} />
      )}
    </div>
  );
}
