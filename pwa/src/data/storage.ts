import { get, set, createStore } from "idb-keyval";
import type { AllVisits, AppSettings, VisitState } from "../types";

// Dedicated DB so we don't collide with anything else.
const store = createStore("plast26-pwa", "kv");

const VISITS_KEY = "visits.v1";
const TAGS_KEY = "tags.v1";
const SETTINGS_KEY = "settings.v1";

export async function loadVisits(): Promise<AllVisits> {
  return ((await get(VISITS_KEY, store)) as AllVisits | undefined) ?? {};
}

export async function saveVisits(visits: AllVisits): Promise<void> {
  await set(VISITS_KEY, visits, store);
}

export async function patchVisit(
  id: string,
  patch: Partial<VisitState>,
): Promise<AllVisits> {
  const all = await loadVisits();
  const current = all[id] ?? { visited: false };
  const next: VisitState = { ...current, ...patch };
  // toggling visited true sets timestamp if missing
  if (patch.visited === true && !next.visitedAt) next.visitedAt = Date.now();
  all[id] = next;
  await saveVisits(all);
  return all;
}

/**
 * Batch update: applica una trasformazione a molti id in un unico ciclo
 * load → mutate → save. Evita N round-trip su IndexedDB quando l'utente
 * applica un'azione in massa (es. marca 200 stand come visitati).
 */
export async function patchVisitsManyWith(
  ids: string[],
  transform: (current: VisitState) => VisitState,
): Promise<AllVisits> {
  if (ids.length === 0) return loadVisits();
  const all = await loadVisits();
  for (const id of ids) {
    const current = all[id] ?? { visited: false };
    all[id] = transform(current);
  }
  await saveVisits(all);
  return all;
}

export async function loadCustomTags(): Promise<string[]> {
  return ((await get(TAGS_KEY, store)) as string[] | undefined) ?? [];
}

export async function saveCustomTags(tags: string[]): Promise<void> {
  await set(TAGS_KEY, Array.from(new Set(tags)), store);
}

export async function loadSettings(): Promise<AppSettings> {
  return ((await get(SETTINGS_KEY, store)) as AppSettings | undefined) ?? {};
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await set(SETTINGS_KEY, settings, store);
}

// =========== Sync bundle (export/import fra dispositivi) ===========

export interface SyncBundle {
  format: "plast26-sync";
  version: 1;
  exportedAt: number;
  visits: AllVisits;
  customTags: string[];
  settings?: AppSettings;
}

export async function exportBundle(): Promise<SyncBundle> {
  const [visits, customTags, settings] = await Promise.all([
    loadVisits(),
    loadCustomTags(),
    loadSettings(),
  ]);
  return {
    format: "plast26-sync",
    version: 1,
    exportedAt: Date.now(),
    visits,
    customTags,
    settings,
  };
}

export interface MergeStats {
  added: number;        // espositori che non avevamo
  updated: number;      // espositori esistenti con record più recente nell'import
  unchanged: number;    // l'import è più vecchio o uguale, conserviamo locale
  newTags: number;      // tag custom aggiunti
}

/**
 * Merge sicuro: per ogni espositore prendiamo il record con visitedAt più
 * recente (last-write-wins). I tag e le note vengono uniti — non si perde
 * mai un tag aggiunto su un dispositivo. Anche se un solo dispositivo ha
 * "visited:true", il merge lo conserva.
 */
export function mergeBundle(local: AllVisits, incoming: AllVisits): { merged: AllVisits; stats: MergeStats } {
  const merged: AllVisits = { ...local };
  const stats: MergeStats = { added: 0, updated: 0, unchanged: 0, newTags: 0 };

  for (const [id, inc] of Object.entries(incoming)) {
    const cur = merged[id];
    if (!cur) {
      merged[id] = inc;
      stats.added += 1;
      continue;
    }
    const curTs = cur.visitedAt ?? 0;
    const incTs = inc.visitedAt ?? 0;
    const fresher = incTs > curTs ? inc : cur;
    const older = incTs > curTs ? cur : inc;

    const tagSet = new Set([...(cur.tags ?? []), ...(inc.tags ?? [])]);
    const merge: VisitState = {
      visited: cur.visited || inc.visited,
      visitedAt: Math.max(curTs, incTs) || undefined,
      notes: fresher.notes && fresher.notes.trim() ? fresher.notes : older.notes,
      tags: tagSet.size ? Array.from(tagSet) : undefined,
      size: fresher.size ?? older.size,
      planned: cur.planned || inc.planned || false,
    };
    merged[id] = merge;
    if (incTs > curTs) stats.updated += 1;
    else stats.unchanged += 1;
  }
  return { merged, stats };
}

export async function importBundle(bundle: SyncBundle): Promise<MergeStats> {
  if (bundle.format !== "plast26-sync") {
    throw new Error("Formato file non riconosciuto (atteso 'plast26-sync')");
  }
  const localVisits = await loadVisits();
  const { merged, stats } = mergeBundle(localVisits, bundle.visits ?? {});
  await saveVisits(merged);

  const localTags = await loadCustomTags();
  const tagSet = new Set([...localTags, ...(bundle.customTags ?? [])]);
  const newTagsCount = tagSet.size - localTags.length;
  await saveCustomTags(Array.from(tagSet));

  // Settings: the user explicitly imported this bundle, so any value it carries
  // overrides the local one. Local-only keys are preserved.
  if (bundle.settings) {
    const localSettings = await loadSettings();
    await saveSettings({ ...localSettings, ...bundle.settings });
  }
  return { ...stats, newTags: newTagsCount };
}

export function bundleToBlob(bundle: SyncBundle): Blob {
  return new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
}

export async function blobToBundle(file: File): Promise<SyncBundle> {
  const text = await file.text();
  return JSON.parse(text) as SyncBundle;
}
