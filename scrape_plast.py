#!/usr/bin/env python3
"""
Scraper Espositori PLAST 2026 - dp-plast.fieramilano.it (catalogo ufficiale Fiera Milano)

A differenza di Tuttofood (HTML di catalogo.fiereparma.it), PLAST espone un
catalogo digitale Fiera Milano (piattaforma LetzFair/Ximplia) con una API JSON
pubblica, senza autenticazione:

    espositore/list  -> elenco paginato (50/pagina) con padiglione, stand,
                        indirizzo, contatti, sito web, nazione_id
    tipo/nazione/tree -> mappa nazione_id -> nome paese
    espositore/item  -> scheda dettaglio del singolo espositore, con
                        list_categoria (merceologie) e descrizione

Lo schema di output (FIELDNAMES) e la mappa provincia->regione sono RIUSATI da
scrape.py, cosi' build_excel.py e il bundle JSON della PWA restano invariati.

Uso:
    pip install -r requirements.txt
    python scrape_plast.py        # riprende da progress_plast.json se interrotto
    python build_excel_plast.py   # genera l'Excel
"""

import csv
import json
import re
import sys
import time
from pathlib import Path

import requests

# ========== SCHEMA COLONNE CSV ==========
FIELDNAMES = [
    "nome", "url", "url_canonical",
    "indirizzo", "cap", "citta", "provincia", "regione", "paese",
    "telefono", "email", "sito_web",
    "padiglione", "stand", "coespositore", "espositore_principale",
    "partita_iva",
    "marchi", "categorie", "descrizione",
]

# ========== MAPPA PROVINCIA -> REGIONE ==========
PROVINCIA_REGIONE = {
    "AQ": "Abruzzo", "CH": "Abruzzo", "PE": "Abruzzo", "TE": "Abruzzo",
    "MT": "Basilicata", "PZ": "Basilicata",
    "CS": "Calabria", "CZ": "Calabria", "KR": "Calabria", "RC": "Calabria", "VV": "Calabria",
    "AV": "Campania", "BN": "Campania", "CE": "Campania", "NA": "Campania", "SA": "Campania",
    "BO": "Emilia-Romagna", "FC": "Emilia-Romagna", "FE": "Emilia-Romagna",
    "MO": "Emilia-Romagna", "PC": "Emilia-Romagna", "PR": "Emilia-Romagna",
    "RA": "Emilia-Romagna", "RE": "Emilia-Romagna", "RN": "Emilia-Romagna",
    "GO": "Friuli-Venezia Giulia", "PN": "Friuli-Venezia Giulia",
    "TS": "Friuli-Venezia Giulia", "UD": "Friuli-Venezia Giulia",
    "FR": "Lazio", "LT": "Lazio", "RI": "Lazio", "RM": "Lazio", "VT": "Lazio",
    "GE": "Liguria", "IM": "Liguria", "SP": "Liguria", "SV": "Liguria",
    "BG": "Lombardia", "BS": "Lombardia", "CO": "Lombardia", "CR": "Lombardia",
    "LC": "Lombardia", "LO": "Lombardia", "MB": "Lombardia", "MI": "Lombardia",
    "MN": "Lombardia", "PV": "Lombardia", "SO": "Lombardia", "VA": "Lombardia",
    "AN": "Marche", "AP": "Marche", "FM": "Marche", "MC": "Marche", "PU": "Marche",
    "CB": "Molise", "IS": "Molise",
    "AL": "Piemonte", "AT": "Piemonte", "BI": "Piemonte", "CN": "Piemonte",
    "NO": "Piemonte", "TO": "Piemonte", "VB": "Piemonte", "VC": "Piemonte",
    "BA": "Puglia", "BR": "Puglia", "BT": "Puglia", "FG": "Puglia",
    "LE": "Puglia", "TA": "Puglia",
    "CA": "Sardegna", "NU": "Sardegna", "OR": "Sardegna", "SS": "Sardegna", "SU": "Sardegna",
    "AG": "Sicilia", "CL": "Sicilia", "CT": "Sicilia", "EN": "Sicilia",
    "ME": "Sicilia", "PA": "Sicilia", "RG": "Sicilia", "SR": "Sicilia", "TP": "Sicilia",
    "AR": "Toscana", "FI": "Toscana", "GR": "Toscana", "LI": "Toscana",
    "LU": "Toscana", "MS": "Toscana", "PI": "Toscana", "PO": "Toscana",
    "PT": "Toscana", "SI": "Toscana",
    "BZ": "Trentino-Alto Adige", "TN": "Trentino-Alto Adige",
    "PG": "Umbria", "TR": "Umbria",
    "AO": "Valle d'Aosta",
    "BL": "Veneto", "PD": "Veneto", "RO": "Veneto", "TV": "Veneto",
    "VE": "Veneto", "VI": "Veneto", "VR": "Veneto",
}


def provincia_to_regione(prov: str, paese: str) -> str:
    """Mappa la sigla provincia alla regione italiana. Vuoto se estero."""
    if not prov:
        return ""
    p = prov.strip().upper()
    if p in PROVINCIA_REGIONE:
        if paese and "ital" not in paese.lower() and "italy" not in paese.lower():
            return ""
        return PROVINCIA_REGIONE[p]
    return ""


# ========== CONFIGURAZIONE ==========
API_BASE = "https://dp-plast.fieramilano.it/public/api"
MANIFESTAZIONE_ID = 2          # PLAST 2026
PAGE_SIZE = 50                 # record per pagina nell'endpoint list
DETAIL_BASE = "https://dp-plast.fieramilano.it/exhibitor"  # url_canonical sintetico (id stabile PWA)

OUT_DIR = Path(__file__).parent
OUT_CSV = OUT_DIR / "espositori_plast_2026.csv"
PROGRESS_FILE = OUT_DIR / "progress_plast.json"

DELAY_SECONDS = 0.3
TIMEOUT = 30
MAX_RETRIES = 4
PROGRESS_EVERY = 100

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
    "Referer": "https://dp-plast.fieramilano.it/page/espositori",
}

EMAIL_RE = re.compile(r"^[\w.\-+]+@[\w\-]+\.[\w.\-]+$")


# ========== HTTP ==========

def fetch_json(session: requests.Session, url: str) -> dict:
    """GET JSON con retry esponenziale. Valida success:true."""
    last_exc = None
    for attempt in range(MAX_RETRIES):
        try:
            r = session.get(url, headers=HEADERS, timeout=TIMEOUT)
            r.raise_for_status()
            data = r.json()
            if not data.get("success"):
                raise RuntimeError(f"success != true: {str(data)[:120]}")
            return data
        except Exception as e:  # noqa: BLE001 - vogliamo ritentare su tutto
            last_exc = e
            time.sleep(2 ** attempt)
    raise RuntimeError(f"Fallito dopo {MAX_RETRIES} tentativi: {url}") from last_exc


def load_progress() -> dict:
    if PROGRESS_FILE.exists():
        try:
            return json.loads(PROGRESS_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
    return {}


def save_progress(progress: dict):
    PROGRESS_FILE.write_text(json.dumps(progress, ensure_ascii=False), encoding="utf-8")


# ========== LOOKUP ==========

def get_nazioni(session: requests.Session) -> dict:
    """nazione_id -> nome paese."""
    print("[lookup] Scarico elenco nazioni", flush=True)
    data = fetch_json(session, f"{API_BASE}/tipo/nazione/tree?public=1")
    out = {}
    for n in data["data"]["list"]:
        out[n["id"]] = (n.get("nome") or n.get("nome_en") or "").strip()
    return out


# ========== LISTA ESPOSITORI ==========

def get_exhibitor_list(session: requests.Session) -> list[dict]:
    """Tutti i record base, paginando su start."""
    print("[lista] Scarico elenco espositori (paginato)", flush=True)
    first = fetch_json(
        session,
        f"{API_BASE}/manifestazione/espositore/list"
        f"?manifestazione_id={MANIFESTAZIONE_ID}&public=1&start=0",
    )
    lst = first["data"]["list"]
    total = lst["total"]
    items = list(lst["items"])
    start = PAGE_SIZE
    while start < total:
        page = fetch_json(
            session,
            f"{API_BASE}/manifestazione/espositore/list"
            f"?manifestazione_id={MANIFESTAZIONE_ID}&public=1&start={start}",
        )
        items.extend(page["data"]["list"]["items"])
        start += PAGE_SIZE
        time.sleep(DELAY_SECONDS)
    print(f"[lista] Totale dichiarato={total}, scaricati={len(items)}", flush=True)
    return items


# ========== DETTAGLIO ==========

def get_detail(session: requests.Session, rec_id: int) -> dict:
    """Scheda dettaglio: serve per list_categoria (merceologie) e descrizione."""
    data = fetch_json(
        session,
        f"{API_BASE}/manifestazione/espositore/item"
        f"?manifestazione_id={MANIFESTAZIONE_ID}&public=1&id={rec_id}",
    )
    d = data["data"]
    return d.get("item", d) if isinstance(d, dict) else {}


# ========== TRASFORMAZIONE ==========

def _hall_number(nome_padiglione: str, padiglione_id: int) -> str:
    """'Hall 22' -> '22'. Vuoto se padiglione non assegnato (id 0)."""
    if not padiglione_id or not nome_padiglione:
        return ""
    m = re.search(r"(\d+)", nome_padiglione)
    return m.group(1) if m else ""


def _it_text(traduzione_json: str) -> str:
    """descrizione_traduzione e' un JSON {'it':..,'en':..}; preferisci it."""
    if not traduzione_json:
        return ""
    try:
        d = json.loads(traduzione_json)
        return (d.get("it") or d.get("en") or "").strip()
    except (json.JSONDecodeError, TypeError):
        return str(traduzione_json).strip()


def _categorie(detail: dict) -> str:
    cats = []
    seen = set()
    for c in detail.get("list_categoria") or []:
        nome = (c.get("nome") or "").strip()
        if nome and nome not in seen:
            seen.add(nome)
            cats.append(nome)
    return " | ".join(cats)[:800]


def _sito_web(raw: str) -> str:
    raw = (raw or "").strip()
    if not raw or EMAIL_RE.match(raw):   # qualche record ha un'email al posto del sito
        return ""
    if not raw.startswith(("http://", "https://")):
        raw = "http://" + raw
    return raw


def build_row(base: dict, detail: dict, nazioni: dict) -> dict:
    data = {k: "" for k in FIELDNAMES}

    rec_id = base.get("id")
    data["nome"] = (base.get("nome") or "").strip()
    data["url_canonical"] = f"{DETAIL_BASE}/{rec_id}"
    data["url"] = data["url_canonical"]

    data["indirizzo"] = (base.get("indirizzo_via") or "").strip()
    data["cap"] = (base.get("indirizzo_cap") or "").strip()
    data["citta"] = (base.get("indirizzo_comune") or "").strip()
    data["provincia"] = (base.get("indirizzo_provincia") or "").strip()
    data["paese"] = nazioni.get(base.get("indirizzo_nazione_id"), "").strip()
    data["regione"] = provincia_to_regione(data["provincia"], data["paese"])

    data["telefono"] = (base.get("recapito_telefono_principale") or "").strip()
    data["email"] = (base.get("recapito_email_principale") or "").strip()
    data["sito_web"] = _sito_web(base.get("sito_web"))

    data["padiglione"] = _hall_number(base.get("nome_padiglione"), base.get("padiglione_id"))
    data["stand"] = (base.get("padiglione_stand") or "").strip()

    # PLAST non distingue co-espositori nell'API pubblica -> campi vuoti.
    data["categorie"] = _categorie(detail)
    data["descrizione"] = _it_text(detail.get("descrizione_traduzione"))[:1500]

    return data


# ========== MAIN ==========

def main():
    progress = load_progress()
    session = requests.Session()

    nazioni = get_nazioni(session)
    bases = get_exhibitor_list(session)

    # indicizza per id (dedup difensivo: l'elenco ha 1 nome doppione)
    by_id = {}
    for b in bases:
        rid = b.get("id")
        if rid is not None and rid not in by_id:
            by_id[rid] = b

    done = {int(k) for k, v in progress.items() if v is True}
    print(f"[info] {len(by_id)} espositori unici, gia' processati: {len(done)}", flush=True)

    file_exists = OUT_CSV.exists() and OUT_CSV.stat().st_size > 0
    new_count = 0
    err_count = 0

    with OUT_CSV.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES, extrasaction="ignore")
        if not file_exists:
            writer.writeheader()

        for i, (rid, base) in enumerate(sorted(by_id.items()), 1):
            if rid in done:
                continue
            try:
                detail = get_detail(session, rid)
                row = build_row(base, detail, nazioni)
                writer.writerow(row)
                f.flush()
                progress[str(rid)] = True
                new_count += 1
            except Exception as e:  # noqa: BLE001
                progress[str(rid)] = f"ERROR: {e}"
                err_count += 1

            if i % PROGRESS_EVERY == 0:
                save_progress(progress)
                print(
                    f"[{i:>4}/{len(by_id)}] (+{new_count} nuove, {err_count} errori)",
                    flush=True,
                )
            time.sleep(DELAY_SECONDS)

    save_progress(progress)
    print(
        f"\n[done] CSV salvato: {OUT_CSV}  (+{new_count} nuove righe, {err_count} errori)",
        flush=True,
    )
    print("[done] Ora esegui: python build_excel_plast.py", flush=True)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[stop] Interrotto. Riavvia per riprendere da dove eri.")
        sys.exit(130)
