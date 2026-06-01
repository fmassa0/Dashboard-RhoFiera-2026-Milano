import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useAppState } from "../state";
import { inferSize, SIZE_LABEL } from "../data/heuristics";
import { blobToBundle, bundleToBlob } from "../data/storage";
import type { MergeStats } from "../data/storage";
import type { Exhibitor, VisitState } from "../types";

const HEADERS = [
  "nome",
  "padiglione",
  "stand",
  "citta",
  "provincia",
  "regione",
  "paese",
  "telefono",
  "email",
  "sito_web",
  "indirizzo",
  "marchi",
  "categorie",
  "espositore_principale",
  "coespositore",
  "url_canonical",
];

function toRow(e: Exhibitor, v: VisitState | undefined) {
  const size = v?.size ?? inferSize(e);
  return {
    visitato: v?.visited ? "SI" : "",
    visitato_il: v?.visitedAt ? new Date(v.visitedAt).toISOString() : "",
    note: v?.notes ?? "",
    tag: (v?.tags ?? []).join(", "),
    grandezza: SIZE_LABEL[size],
    ...Object.fromEntries(HEADERS.map((h) => [h, (e as unknown as Record<string, string>)[h] ?? ""])),
  };
}

function downloadXlsx(rows: Record<string, unknown>[], filename: string) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  // freeze header
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  ws["!autofilter"] = { ref: ws["!ref"] ?? "A1" };
  XLSX.utils.book_append_sheet(wb, ws, "Espositori");
  XLSX.writeFile(wb, filename, { compression: true });
}

export function ExportView() {
  const { exhibitors, visits, media, exportSync, importSync } = useAppState();
  const [busy, setBusy] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [includePhotos, setIncludePhotos] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const visitedCount = exhibitors.filter((e) => visits[e.id]?.visited).length;
  const annotatedCount = exhibitors.filter(
    (e) => visits[e.id] && (visits[e.id]!.visited || visits[e.id]!.notes || (visits[e.id]!.tags?.length ?? 0) > 0),
  ).length;

  const exportVisited = async () => {
    setBusy("visited");
    try {
      const rows = exhibitors
        .filter((e) => visits[e.id] && (visits[e.id]!.visited || visits[e.id]!.notes || (visits[e.id]!.tags?.length ?? 0) > 0))
        .map((e) => toRow(e, visits[e.id]));
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      downloadXlsx(rows, `plast-2026_visitati_${stamp}.xlsx`);
    } finally {
      setBusy(null);
    }
  };

  const exportAll = async () => {
    setBusy("all");
    try {
      const rows = exhibitors.map((e) => toRow(e, visits[e.id]));
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      downloadXlsx(rows, `plast-2026_completo_${stamp}.xlsx`);
    } finally {
      setBusy(null);
    }
  };

  const exportPdfReport = async () => {
    setBusy("pdf");
    try {
      // Import dinamico: jspdf (e i suoi peer) pesano ~500KB. Senza
      // code-split la home della PWA caricherebbe la libreria PDF anche per
      // chi la usa una volta sola al rientro dalla fiera.
      const { generateVisitReport } = await import("../data/report");
      const blob = await generateVisitReport(exhibitors, visits, media, {
        includePhotos,
        title: "PLAST 2026 — Report visite",
      });
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      const filename = `plast-2026_report_${stamp}.pdf`;

      // Su mobile prova prima Web Share con file (apre WhatsApp/mail), così
      // l'utente non deve cercare il PDF tra i download. Fallback al download.
      const file = new File([blob], filename, { type: "application/pdf" });
      const canShareFile =
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });
      if (canShareFile && navigator.share) {
        try {
          await navigator.share({
            title: "Report visite PLAST 2026",
            files: [file],
          });
          return;
        } catch (e) {
          if ((e as DOMException)?.name === "AbortError") return;
          // qualunque altro errore: ricado sul download
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="px-4 pt-safe pb-2 space-y-4">
      <h1 className="text-xl font-bold">Export</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        I file vengono generati nel browser e scaricati. Nessun dato lascia il tuo dispositivo.
      </p>

      <button
        type="button"
        disabled={busy !== null || annotatedCount === 0}
        onClick={exportVisited}
        className="w-full min-h-tap rounded-lg bg-brand-500 text-white font-semibold py-3 disabled:opacity-50"
      >
        {busy === "visited" ? "Genero..." : `Esporta i miei dati (${annotatedCount} con note/visita)`}
      </button>

      <button
        type="button"
        disabled={busy !== null}
        onClick={exportAll}
        className="w-full min-h-tap rounded-lg border-2 border-brand-500 text-brand-500 font-semibold py-3 disabled:opacity-50"
      >
        {busy === "all" ? "Genero..." : `Esporta tutti (${exhibitors.length} espositori)`}
      </button>

      <hr className="border-neutral-200 dark:border-neutral-800" />

      <section className="space-y-2">
        <div>
          <h2 className="text-lg font-bold">Report PDF visite</h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
            Una pagina per espositore visitato/annotato con dati anagrafici,
            contatti, note, tag e (se presenti) le foto allegate. Da girare al
            team o al cliente come "report fiera".
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm select-none cursor-pointer min-h-tap">
          <input
            type="checkbox"
            checked={includePhotos}
            onChange={(e) => setIncludePhotos(e.target.checked)}
            className="h-5 w-5 accent-brand-500"
          />
          <span>
            Includi foto nel PDF ({media.filter((m) => m.kind === "photo").length} disponibili)
          </span>
        </label>
        <button
          type="button"
          disabled={busy !== null || annotatedCount === 0}
          onClick={exportPdfReport}
          className="w-full min-h-tap rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold py-3 disabled:opacity-50"
        >
          {busy === "pdf"
            ? "Genero PDF..."
            : `Esporta report PDF (${annotatedCount} espositori)`}
        </button>
      </section>

      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 text-sm">
        <div className="font-semibold mb-1">Riepilogo</div>
        <ul className="space-y-0.5 text-neutral-700 dark:text-neutral-300">
          <li>Espositori in DB: <strong>{exhibitors.length}</strong></li>
          <li>Visitati: <strong>{visitedCount}</strong></li>
          <li>Con note o tag: <strong>{annotatedCount}</strong></li>
        </ul>
      </div>

      <hr className="border-neutral-200 dark:border-neutral-800" />

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold">Sincronizza con un altro dispositivo</h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
            Esporta lo stato (visite, note, tag) in un file <code>.json</code>, mandalo all&apos;altro
            telefono via WhatsApp/email, poi importalo lì. Il merge è
            automatico: <strong>nessuna visita viene persa</strong>, i tag vengono uniti, le
            note più recenti vincono.
          </p>
        </div>

        <button
          type="button"
          disabled={busy !== null}
          onClick={async () => {
            setBusy("sync-out");
            setSyncMsg(null);
            try {
              const bundle = await exportSync();
              const blob = bundleToBlob(bundle);
              const url = URL.createObjectURL(blob);
              const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
              const a = document.createElement("a");
              a.href = url;
              a.download = `plast26-sync_${stamp}.json`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
              setSyncMsg({ kind: "ok", text: "File scaricato. Inviarlo all'altro dispositivo." });
            } catch (e) {
              setSyncMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
            } finally {
              setBusy(null);
            }
          }}
          className="w-full min-h-tap rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-semibold py-3 disabled:opacity-50"
        >
          {busy === "sync-out" ? "Genero..." : "Esporta stato (per condividere)"}
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy("sync-in");
            setSyncMsg(null);
            try {
              const bundle = await blobToBundle(file);
              const stats: MergeStats = await importSync(bundle);
              setSyncMsg({
                kind: "ok",
                text: `Import OK — aggiunti ${stats.added}, aggiornati ${stats.updated}, invariati ${stats.unchanged}, nuovi tag ${stats.newTags}.`,
              });
            } catch (err) {
              setSyncMsg({ kind: "err", text: err instanceof Error ? err.message : String(err) });
            } finally {
              setBusy(null);
              if (fileRef.current) fileRef.current.value = "";
            }
          }}
        />
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => fileRef.current?.click()}
          className="w-full min-h-tap rounded-lg border-2 border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100 font-semibold py-3 disabled:opacity-50"
        >
          {busy === "sync-in" ? "Importo..." : "Importa stato da file"}
        </button>

        {syncMsg && (
          <div
            role="status"
            aria-live="polite"
            className={`rounded-md p-2 text-sm ${
              syncMsg.kind === "ok"
                ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200"
                : "bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200"
            }`}
          >
            {syncMsg.text}
          </div>
        )}

        <details className="text-xs text-neutral-600 dark:text-neutral-400">
          <summary className="cursor-pointer min-h-tap py-1">Come funziona il merge</summary>
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            <li>Se uno dei due dispositivi ha segnato un espositore come visitato, resta visitato dopo il merge.</li>
            <li>Per le note, vince la più recente (timestamp dell&apos;ultima visita).</li>
            <li>I tag vengono uniti, mai sottratti.</li>
            <li>Si possono importare più file in sequenza, l&apos;operazione è idempotente.</li>
          </ul>
        </details>
      </section>
    </div>
  );
}
