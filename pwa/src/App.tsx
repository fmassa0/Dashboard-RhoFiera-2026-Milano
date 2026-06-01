import { useState } from "react";
import { useAppState } from "./state";
import { BottomNav } from "./components/BottomNav";
import { ListView } from "./views/ListView";
import { MapView } from "./views/MapView";
import { RouteView } from "./views/RouteView";
import { DashboardView } from "./views/DashboardView";
import { ExportView } from "./views/ExportView";
import { InstallPrompt } from "./components/InstallPrompt";
import type { ViewName } from "./types";

export function App() {
  const { loading, error } = useAppState();
  const [view, setView] = useState<ViewName>("list");
  const [pendingPad, setPendingPad] = useState<string | undefined>(undefined);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="text-3xl font-bold text-brand-500">PLAST26</div>
          <div className="mt-2 text-sm text-neutral-500">Caricamento espositori…</div>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="h-full flex items-center justify-center px-6">
        <div className="text-center">
          <div className="text-lg font-semibold mb-2">Errore</div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <main className="flex-1 min-h-0 overflow-y-auto" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 64px)" }}>
        {view === "list" && (
          <ListView
            initialPadiglione={pendingPad}
            setView={(v) => {
              if (v !== "list") setPendingPad(undefined);
              setView(v);
            }}
          />
        )}
        {view === "map" && (
          <MapView
            setView={setView}
            setPadiglioneFilter={(p) => setPendingPad(p)}
          />
        )}
        {view === "route" && <RouteView setView={setView} />}
        {view === "dashboard" && <DashboardView />}
        {view === "export" && <ExportView />}
      </main>
      <BottomNav current={view} onChange={setView} />
      <InstallPrompt />
    </div>
  );
}
