import { useMemo } from "react";
import { HALL_CENTROIDS } from "../data/halls";
import type { OptimizedRoute } from "../data/route";
import type { AllVisits } from "../types";

interface Props {
  route: OptimizedRoute;
  startHall: string;
  visits: AllVisits;
  imageBase: string;
}

/**
 * Disegna il percorso ottimizzato sopra la planimetria della fiera:
 *  - polyline tratteggiata che collega i centroidi dei padiglioni nell'ordine
 *    deciso dal nearest-neighbor;
 *  - cerchi numerati per ciascuna fermata (verdi se tutti gli stand della
 *    fermata sono già visitati);
 *  - marker "P" per il punto di partenza, omesso se la prima fermata coincide
 *    con il padiglione di partenza.
 */
export function RouteMap({ route, startHall, visits, imageBase }: Props) {
  // Le fermate "sconosciute" (padiglioni senza coordinate mappate) restano in
  // coda al percorso ma non possono essere disegnate; le filtriamo via.
  const drawableStops = useMemo(
    () => route.stops.filter((s) => HALL_CENTROIDS[s.hall]),
    [route.stops],
  );

  const startPoint = HALL_CENTROIDS[startHall];
  const startInRoute =
    drawableStops.length > 0 && drawableStops[0].hall === startHall;

  // Punti per la polyline: se la partenza è già la prima fermata non aggiungo
  // un waypoint extra (sarebbe un punto sovrapposto con distanza zero).
  const pathPoints = useMemo(() => {
    const stopPoints = drawableStops.map((s) => HALL_CENTROIDS[s.hall]);
    return startInRoute || !startPoint ? stopPoints : [startPoint, ...stopPoints];
  }, [drawableStops, startInRoute, startPoint]);

  if (drawableStops.length === 0) return null;

  return (
    <figure className="rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-white">
      <div className="relative w-full">
        <img
          src={`${imageBase}/hall-plan-padiglioni.png`}
          alt="Planimetria con percorso disegnato"
          className="block w-full h-auto select-none"
          draggable={false}
        />
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <marker
              id="route-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerUnits="strokeWidth"
              markerWidth="3"
              markerHeight="3"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 Z" fill="#1560bd" />
            </marker>
          </defs>

          <polyline
            points={pathPoints.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="#1560bd"
            strokeWidth="0.7"
            strokeDasharray="1.6 1.1"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.92"
            markerMid="url(#route-arrow)"
            markerEnd="url(#route-arrow)"
          />

          {!startInRoute && startPoint && (
            <g>
              <circle
                cx={startPoint.x}
                cy={startPoint.y}
                r="3.4"
                fill="#0ea5e9"
                stroke="white"
                strokeWidth="0.5"
              />
              <text
                x={startPoint.x}
                y={startPoint.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="white"
                fontSize="3.2"
                fontWeight="bold"
              >
                P
              </text>
            </g>
          )}

          {drawableStops.map((stop, idx) => {
            const c = HALL_CENTROIDS[stop.hall];
            const allVisited = stop.exhibitors.every((e) => visits[e.id]?.visited);
            const fill = allVisited ? "#10b981" : "#1560bd";
            return (
              <g key={stop.hall}>
                <circle
                  cx={c.x}
                  cy={c.y}
                  r="3.2"
                  fill={fill}
                  stroke="white"
                  strokeWidth="0.5"
                />
                <text
                  x={c.x}
                  y={c.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="white"
                  fontSize="3.2"
                  fontWeight="bold"
                >
                  {idx + 1}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="px-3 py-2 text-xs text-neutral-500 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="inline-block h-2 w-4 rounded-sm bg-brand-500" />
          {drawableStops.length} {drawableStops.length === 1 ? "fermata" : "fermate"}
        </span>
        {!startInRoute && (
          <span className="inline-flex items-center gap-1">
            <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-sky-500" />
            partenza Pad. {startHall}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          tutti visitati
        </span>
        {route.unknownHalls.length > 0 && (
          <span className="text-amber-600 dark:text-amber-400">
            {route.unknownHalls.length} pad. fuori mappa in coda
          </span>
        )}
      </figcaption>
    </figure>
  );
}
