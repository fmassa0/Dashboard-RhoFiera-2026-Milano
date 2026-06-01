import { jsPDF } from "jspdf";
import { getMediaBlob } from "./media";
import { inferSize, SIZE_LABEL } from "./heuristics";
import type { MediaItem } from "./media";
import type { AllVisits, Exhibitor } from "../types";

export interface ReportOptions {
  includePhotos: boolean;
  /** "PLAST 2026" o un titolo personalizzato del documento */
  title?: string;
}

const A4_WIDTH = 210;
const A4_HEIGHT = 297;
const MARGIN = 15;
const CONTENT_WIDTH = A4_WIDTH - MARGIN * 2;

interface Cursor {
  doc: jsPDF;
  y: number;
}

function ensureSpace(cur: Cursor, needed: number) {
  if (cur.y + needed > A4_HEIGHT - MARGIN) {
    cur.doc.addPage();
    cur.y = MARGIN;
  }
}

function writeWrapped(
  cur: Cursor,
  text: string,
  fontSize: number,
  opts?: { bold?: boolean; color?: [number, number, number]; lineGap?: number },
) {
  const { doc } = cur;
  doc.setFontSize(fontSize);
  doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
  if (opts?.color) doc.setTextColor(...opts.color);
  else doc.setTextColor(20, 20, 20);
  const lines = doc.splitTextToSize(text, CONTENT_WIDTH);
  const lineHeight = fontSize * 0.45;
  for (const line of lines) {
    ensureSpace(cur, lineHeight + (opts?.lineGap ?? 0));
    doc.text(line, MARGIN, cur.y);
    cur.y += lineHeight + (opts?.lineGap ?? 0);
  }
}

function hr(cur: Cursor) {
  ensureSpace(cur, 4);
  cur.doc.setDrawColor(220);
  cur.doc.line(MARGIN, cur.y, A4_WIDTH - MARGIN, cur.y);
  cur.y += 3;
}

/**
 * Carica il blob, lo legge come dataURL e ritorna larghezza/altezza naturali +
 * dataURL pronto da passare a doc.addImage. Misurare le dimensioni a monte ci
 * permette di disporre le foto rispettando l'aspect ratio.
 */
async function blobToDataUrlWithSize(
  blob: Blob,
): Promise<{ dataUrl: string; w: number; h: number }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("FileReader fallito"));
    r.readAsDataURL(blob);
  });
  const { w, h } = await new Promise<{ w: number; h: number }>(
    (resolve, reject) => {
      const img = new Image();
      img.onload = () =>
        resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error("Image load fallito"));
      img.src = dataUrl;
    },
  );
  return { dataUrl, w, h };
}

async function loadPhotosFor(
  exhibitorId: string,
  manifest: MediaItem[],
  max: number,
): Promise<Array<{ dataUrl: string; w: number; h: number }>> {
  const items = manifest
    .filter((m) => m.exhibitorId === exhibitorId && m.kind === "photo")
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, max);
  const out: Array<{ dataUrl: string; w: number; h: number }> = [];
  for (const item of items) {
    const blob = await getMediaBlob(item.id);
    if (!blob) continue;
    try {
      out.push(await blobToDataUrlWithSize(blob));
    } catch {
      // ignora la singola foto rotta, prosegui con le altre
    }
  }
  return out;
}

function drawPhotoRow(
  cur: Cursor,
  photos: Array<{ dataUrl: string; w: number; h: number }>,
) {
  if (photos.length === 0) return;
  const gap = 3;
  const targetH = 45;
  let cellW = (CONTENT_WIDTH - gap * (photos.length - 1)) / photos.length;
  // Cap larghezza per evitare immagini enormi quando c'è una sola foto
  cellW = Math.min(cellW, 90);
  const rowH = targetH;
  ensureSpace(cur, rowH + 2);
  let x = MARGIN;
  for (const p of photos) {
    const ratio = p.w / p.h;
    let drawW = cellW;
    let drawH = drawW / ratio;
    if (drawH > rowH) {
      drawH = rowH;
      drawW = drawH * ratio;
    }
    try {
      cur.doc.addImage(p.dataUrl, "JPEG", x, cur.y, drawW, drawH);
    } catch {
      // se il browser non supporta il formato, salto
    }
    x += cellW + gap;
  }
  cur.y += rowH + 2;
}

function summarize(
  exhibitors: Exhibitor[],
  visits: AllVisits,
  manifest: MediaItem[],
) {
  let visited = 0;
  let withNotes = 0;
  let withTags = 0;
  let mediaCount = 0;
  for (const e of exhibitors) {
    const v = visits[e.id];
    if (v?.visited) visited += 1;
    if (v?.notes && v.notes.trim()) withNotes += 1;
    if (v?.tags && v.tags.length > 0) withTags += 1;
    mediaCount += manifest.filter((m) => m.exhibitorId === e.id).length;
  }
  return { visited, withNotes, withTags, mediaCount };
}

/**
 * Genera un PDF "report visite" da girare al team o al cliente.
 * Ogni espositore rilevante ha un blocco con dati anagrafici, contatti,
 * note, tag, e (se richiesto e disponibili) le sue foto allegate.
 *
 * Filtra automaticamente solo gli espositori con qualche traccia di
 * lavoro (visitati, con note, tag, planned o foto): un report di 1500
 * pagine vuote non serve a nessuno.
 */
export async function generateVisitReport(
  exhibitors: Exhibitor[],
  visits: AllVisits,
  mediaManifest: MediaItem[],
  options: ReportOptions,
): Promise<Blob> {
  const selected = exhibitors.filter((e) => {
    const v = visits[e.id];
    if (!v) return false;
    if (v.visited) return true;
    if (v.notes && v.notes.trim()) return true;
    if (v.tags && v.tags.length > 0) return true;
    if (v.planned) return true;
    if (mediaManifest.some((m) => m.exhibitorId === e.id)) return true;
    return false;
  });

  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const cur: Cursor = { doc, y: MARGIN };

  // ====== Header / cover sulla prima pagina ======
  writeWrapped(cur, options.title ?? "PLAST 2026 — Report visite", 22, {
    bold: true,
  });
  cur.y += 1;
  writeWrapped(
    cur,
    `Generato il ${new Date().toLocaleString("it-IT")}`,
    9,
    { color: [110, 110, 110] },
  );
  cur.y += 2;

  const stats = summarize(exhibitors, visits, mediaManifest);
  writeWrapped(
    cur,
    `${selected.length} espositori inclusi · ${stats.visited} visitati · ${stats.withNotes} con note · ${stats.withTags} con tag · ${stats.mediaCount} foto/audio`,
    9,
    { color: [110, 110, 110] },
  );
  cur.y += 4;
  hr(cur);

  // ====== Blocco per espositore ======
  for (const ex of selected) {
    const v = visits[ex.id];

    // Stima conservativa dell'altezza minima del blocco; se non ci sta nella
    // pagina corrente la spostiamo a quella nuova così il titolo non resta
    // separato dal corpo.
    const minBlockH = options.includePhotos ? 60 : 30;
    ensureSpace(cur, minBlockH);

    const status: string[] = [];
    if (v?.visited) {
      const when = v.visitedAt
        ? new Date(v.visitedAt).toLocaleDateString("it-IT")
        : "";
      status.push(`✓ Visitato${when ? ` il ${when}` : ""}`);
    }
    if (v?.planned) status.push("★ nel percorso");

    writeWrapped(cur, ex.nome, 14, { bold: true });
    const sub = [
      ex.padiglione ? `Pad. ${ex.padiglione}` : "",
      ex.stand ? `Stand ${ex.stand}` : "",
      [ex.citta, ex.provincia, ex.regione, ex.paese].filter(Boolean).join(", "),
    ]
      .filter(Boolean)
      .join("  ·  ");
    if (sub) writeWrapped(cur, sub, 9, { color: [80, 80, 80] });
    if (status.length > 0) {
      writeWrapped(cur, status.join("  ·  "), 9, { color: [70, 130, 70] });
    }
    cur.y += 1;

    const sizeLabel = SIZE_LABEL[v?.size ?? inferSize(ex)];
    const contactLines = [
      ex.email ? `Email: ${ex.email}` : "",
      ex.telefono ? `Tel: ${ex.telefono}` : "",
      ex.sito_web ? `Web: ${ex.sito_web}` : "",
      `Grandezza: ${sizeLabel}`,
    ].filter(Boolean);
    if (contactLines.length > 0) {
      writeWrapped(cur, contactLines.join("    "), 9);
    }

    if (ex.marchi) {
      writeWrapped(cur, `Marchi: ${ex.marchi}`, 9);
    }
    if (ex.categorie) {
      writeWrapped(cur, `Categorie: ${ex.categorie.replace(/ \| /g, ", ")}`, 9);
    }

    if (v?.tags && v.tags.length > 0) {
      writeWrapped(cur, `Tag: ${v.tags.join(", ")}`, 9, { color: [180, 80, 0] });
    }

    if (v?.notes && v.notes.trim()) {
      cur.y += 1;
      writeWrapped(cur, "Note:", 9, { bold: true });
      writeWrapped(cur, v.notes.trim(), 10, { lineGap: 0.5 });
    }

    if (options.includePhotos) {
      const photos = await loadPhotosFor(ex.id, mediaManifest, 4);
      if (photos.length > 0) {
        cur.y += 1;
        drawPhotoRow(cur, photos);
      }
    }

    cur.y += 3;
    hr(cur);
  }

  if (selected.length === 0) {
    writeWrapped(
      cur,
      "Nessun espositore con dati da includere nel report (visite, note, tag, preferiti o foto).",
      11,
      { color: [110, 110, 110] },
    );
  }

  // Numerazione pagine
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(`Pagina ${i} di ${pages}`, A4_WIDTH - MARGIN, A4_HEIGHT - 8, {
      align: "right",
    });
  }

  return doc.output("blob");
}
