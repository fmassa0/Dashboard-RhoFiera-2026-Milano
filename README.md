# Dashboard PLAST 2026 — Milano

Toolkit per la fiera **PLAST 2026** (Fiera Milano Rho — plastica, gomma e materiali compositi):
- **scraper Python** (`scrape_plast.py`) → estrae gli ~1140 espositori dal catalogo digitale ufficiale di Fiera Milano
- **export Excel** (`build_excel_plast.py`) → produce `espositori_plast_2026.xlsx` con foglio Statistiche
- **PWA React** (`pwa/`) → app installabile per consultare gli espositori, segnare visite, prendere note, esportare i propri dati. Funziona offline.

> Nota storica: il progetto è nato per la fiera Tuttofood (repo `Dashboard-Tuttofood-2026-Milano`) ed è stato riconvertito a PLAST 2026. Il repo è ora `Dashboard-RhoFiera-2026-Milano` (dashboard generica per le fiere a Fiera Milano Rho). Il base path di GitHub Pages segue automaticamente il nome del repo (impostato in CI), quindi un eventuale rename non richiede modifiche al codice.

## Scraping

A differenza di Tuttofood (che richiedeva il parsing HTML del catalogo Fiere di Parma), PLAST espone un
**catalogo digitale Fiera Milano** (piattaforma LetzFair/Ximplia) con una **API JSON pubblica, senza
autenticazione**. La pagina pubblica `plastonline.org/espositori/elenco-espositori/` è invece troppo povera
(solo nome + sito web), quindi NON va usata come sorgente.

```bash
pip install -r requirements.txt
python scrape_plast.py        # ~6-8 min, riprende da progress_plast.json se interrotto
python build_excel_plast.py   # genera espositori_plast_2026.xlsx
```

Endpoint usati (host `https://dp-plast.fieramilano.it`, `manifestazione_id=2`):
- `/public/api/manifestazione/espositore/list?...&start=N` — elenco paginato (50/pagina), con padiglione, stand, indirizzo, contatti, sito web, `nazione_id`
- `/public/api/tipo/nazione/tree` — mappa `nazione_id` → nome paese
- `/public/api/manifestazione/espositore/item?...&id=ID` — scheda dettaglio, per `list_categoria` (merceologie) e descrizione

Output principali:
- `espositori_plast_2026.csv` (1140 righe, 19 colonne — stesso schema di Tuttofood per compatibilità con la PWA)
- `espositori_plast_2026.xlsx` (foglio "Espositori" + "Statistiche")

> Nota: `partita_iva` non è disponibile sul portale (campo presente nello schema ma sempre vuoto).
> Nota: ~330 espositori hanno padiglione/stand vuoti perché alla fonte lo stand è ancora *da assegnare*
> (`padiglione_id=0`). Rilanciando lo scraper più vicino alla data fiera questi campi si riempiono.

## PWA

App offline-first per consultare gli espositori durante la fiera, segnare le visite, prendere note, taggare e esportare un xlsx personale.

### Sviluppo locale

```bash
cd pwa
npm install
npm run dev          # http://localhost:5173
npm run build        # genera dist/
npm run preview      # serve dist/ su :4173
```

### Funzionalità
- **Lista**: ricerca full-text (debounced), filtri multi-select per regione/paese/padiglione/categoria/grandezza, sort A→Z / città / non-ancora-visitati, virtual scrolling (react-window) per le ~1100 righe
- **Card espositore**: toggle "Visitato" tap-friendly, note multilinea, tag preset + custom, timestamp
- **Mappa**: planimetria ufficiale PLAST + heatmap visite per padiglione (tap → filtra la lista)
- **Percorso**: ordina i padiglioni con nearest-neighbor a partire da un padiglione scelto, modalità "live walk", condivisione testo
- **Dashboard**: visitati / rimanenti / tempo medio / lista "da rivedere" / ultime visite / tag più usati
- **Scan biglietti da visita**: OCR via tesseract.js
- **Export**: xlsx solo dei tuoi visitati, xlsx completo, report PDF con foto allegate, sync `.json` tra dispositivi
- **PWA**: manifest + Workbox SW (precache di tutto), installabile su iOS/Android, prompt "Aggiungi a Home"
- **Stato utente**: tutto in IndexedDB tramite idb-keyval (store `plast26-*`, zero localStorage, zero backend)
- **Mobile-first**: bottom nav, tap target ≥ 44 px, dark mode automatica, tema blu PLAST

### Aggiornare i dati

Quando rigeneri il CSV, aggiorna anche il bundle JSON della PWA:

```bash
python -c "import csv,json; rows=[{**r,'id':(r.get('url_canonical') or r.get('url','')).rstrip('/')} for r in csv.DictReader(open('espositori_plast_2026.csv',encoding='utf-8'))]; [r.pop('partita_iva',None) for r in rows]; open('pwa/public/data/espositori.json','w',encoding='utf-8').write(json.dumps(rows,ensure_ascii=False,separators=(',',':')))"
cd pwa && npm run build
```

### Planimetria e padiglioni

PLAST occupa i 6 padiglioni al pian terreno di Fiera Milano Rho: **9, 11, 13, 15, 22, 24**.
La planimetria (`pwa/public/hall-plan-padiglioni.png`) proviene da
`plastonline.org/profilo/quartiere-espositivo/`. Le posizioni cliccabili dei padiglioni sono
in `pwa/src/data/halls.ts` (`HALL_BOXES`, coordinate in % misurate sulla pianta isometrica —
approssimate, facili da ritoccare). Per rigenerare la PNG da un nuovo JPG si può usare Pillow
(`pip install pillow`).

### Deploy

#### GitHub Pages

Il repo serve la PWA da `/<nome-repo>/` (attualmente `/Dashboard-RhoFiera-2026-Milano/`). Il deploy è
automatico via GitHub Actions (`.github/workflows/pages.yml`) ad ogni push su `main`: il workflow imposta
`VITE_BASE` al nome del repo, quindi non c'è nulla da cambiare se il repo viene rinominato. Per un build
locale con la base path corretta:

```bash
cd pwa
VITE_BASE=/Dashboard-RhoFiera-2026-Milano/ npm run build
```

#### Vercel

Più semplice (no base path): Project Root `pwa`, preset **Vite**, build `npm run build`, output `dist`,
lascia `VITE_BASE` non valorizzato (default `./`).

### Note sul service worker

- precache di **tutti** gli asset, incluso `data/espositori.json` (`maximumFileSizeToCacheInBytes` alzato a 6 MiB in `vite.config.ts`)
- `registerType: "autoUpdate"` + `clientsClaim: true` → l'app si aggiorna alla riapertura
- realmente offline-first: dopo la prima apertura, anche senza rete vedi tutti gli espositori, prendi note, fai export

### Struttura

```
pwa/
├── public/
│   ├── data/espositori.json     # bundled exhibitor data
│   ├── hall-plan-padiglioni.png # planimetria PLAST (Fiera Milano Rho)
│   ├── icons/                   # PWA icons (192/512/maskable)
│   └── favicon.svg
├── src/
│   ├── data/        loader, IndexedDB storage, filtri, halls, route, report, ocr
│   ├── components/  BottomNav, ExhibitorCard, InstallPrompt, RouteMap, BizCardScan, ...
│   ├── views/       List, Map, Route, Dashboard, Export
│   ├── hooks/       useDebounce, useMediaBlobUrl
│   ├── state.tsx    AppStateProvider context
│   └── App.tsx, main.tsx, types.ts, index.css
├── tailwind.config.js   # palette brand = blu PLAST (#1560bd)
└── vite.config.ts       # vite + vite-plugin-pwa (Workbox)
```
