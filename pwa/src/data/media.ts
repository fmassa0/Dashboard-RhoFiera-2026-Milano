import { createStore, del, get, set } from "idb-keyval";

// Store dedicato per non gonfiare la chiave principale `plast26-pwa`. Le visite
// vengono ricaricate spesso, i blob no: tenerli separati evita di trascinare
// MB di dati a ogni operazione.
const store = createStore("plast26-media", "kv");

const MANIFEST_KEY = "manifest.v1";
const BLOB_KEY = (id: string) => `blob.${id}`;

export type MediaKind = "photo" | "audio";

export interface MediaItem {
  id: string;
  exhibitorId: string;
  kind: MediaKind;
  mime: string;
  createdAt: number;
  size: number;
  /** durata in ms — solo per audio, può mancare nei vecchi record */
  durationMs?: number;
}

export async function loadMediaManifest(): Promise<MediaItem[]> {
  return ((await get(MANIFEST_KEY, store)) as MediaItem[] | undefined) ?? [];
}

async function saveMediaManifest(items: MediaItem[]): Promise<void> {
  await set(MANIFEST_KEY, items, store);
}

export async function getMediaBlob(id: string): Promise<Blob | undefined> {
  return (await get(BLOB_KEY(id), store)) as Blob | undefined;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // fallback raro: solo se il browser non supporta crypto.randomUUID
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function addMediaItem(
  exhibitorId: string,
  kind: MediaKind,
  blob: Blob,
  extra?: { durationMs?: number },
): Promise<MediaItem> {
  const id = newId();
  const item: MediaItem = {
    id,
    exhibitorId,
    kind,
    mime: blob.type || (kind === "photo" ? "image/jpeg" : "audio/webm"),
    createdAt: Date.now(),
    size: blob.size,
    durationMs: extra?.durationMs,
  };
  await set(BLOB_KEY(id), blob, store);
  const manifest = await loadMediaManifest();
  manifest.push(item);
  await saveMediaManifest(manifest);
  return item;
}

export async function removeMediaItem(id: string): Promise<void> {
  await del(BLOB_KEY(id), store);
  const manifest = await loadMediaManifest();
  await saveMediaManifest(manifest.filter((m) => m.id !== id));
}

/**
 * Riduce le foto della camera (tipicamente 8-12MP) prima del salvataggio:
 * 1600px sul lato lungo, JPEG quality 0.85 → ~150-300KB invece di 3-5MB.
 * Mantiene l'orientation perché il browser applica EXIF al draw su canvas.
 */
export async function compressImage(
  source: File | Blob,
  maxDim = 1600,
  quality = 0.85,
): Promise<Blob> {
  const url = URL.createObjectURL(source);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Impossibile caricare l'immagine"));
      i.src = url;
    });
    const ratio = Math.min(
      maxDim / img.naturalWidth,
      maxDim / img.naturalHeight,
      1,
    );
    const w = Math.max(1, Math.round(img.naturalWidth * ratio));
    const h = Math.max(1, Math.round(img.naturalHeight * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D non disponibile");
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error("Compressione immagine fallita")),
        "image/jpeg",
        quality,
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
