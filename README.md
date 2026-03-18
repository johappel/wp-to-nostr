# wp-to-nostr

WordPress-Termine als Nostr-Kalenderevents (kind:31923, NIP-52) veröffentlichen.

Holt Posts aus einer WordPress REST-API, mappt sie auf das [NIP-52](https://github.com/nostr-protocol/nips/blob/master/52.md) Kalenderformat und publiziert sie auf einem Nostr-Relay. Läuft als **GitHub Action** (Cron alle 6 h) oder lokal mit **Deno**.

## Features

- **Vollständige Pagination** – holt alle Posts, nicht nur die erste Seite
- **Korrekte Zeitzonenkonvertierung** – WordPress-Lokalzeit (Europe/Berlin) → UTC-Timestamp
- **HTML → Markdown** – Content und Excerpt via Turndown
- **Addressable Events** – `d`-Tag = WordPress-Permalink, Relay ersetzt automatisch ältere Versionen
- **Dry-Run-Modus** – Events anzeigen ohne zu posten
- **Inspect-Tool** – einzelne Posts debuggen mit Vergleichstabelle

## Schnellstart

### Voraussetzung

[Deno](https://deno.com) ≥ 2.x installieren:

```bash
# macOS
brew install deno

# Linux / Windows
curl -fsSL https://deno.land/install.sh | sh
```

### Dry Run (lokal testen, nichts posten)

```bash
deno task dry-run
```

### Live (auf Relay veröffentlichen)

```bash
NOSTR_PRIVATE_KEY=nsec1… deno task start
```

### Einzelnen Post inspizieren

```bash
deno task inspect              # erster Post
WP_PAGE=3 deno task inspect    # erster Post von Seite 3
```

## Umgebungsvariablen

| Variable           | Pflicht       | Standard                                          | Beschreibung                            |
|--------------------|---------------|---------------------------------------------------|-----------------------------------------|
| `NOSTR_PRIVATE_KEY`| Live-Modus ✅ | –                                                 | `nsec1…` oder 64-stellige Hex-Zeichenkette |
| `DRY_RUN`          | –             | `false`                                           | `true` → nur anzeigen, nicht posten     |
| `WP_API_URL`       | –             | `https://relilab.org/wp-json/wp/v2/posts`         | WordPress REST-API-Endpunkt             |
| `WP_CATEGORY`      | –             | `176`                                             | WordPress-Kategorie-ID                  |
| `NOSTR_RELAY`      | –             | `wss://relay-rpi.edufeed.org`                     | Ziel-Relay (WSS-URL)                    |

## GitHub Actions

Der Workflow `.github/workflows/sync.yml` synchronisiert automatisch alle 6 Stunden.

### Einrichtung

1. **Secret anlegen:** Repository → Settings → Secrets → Actions → `NOSTR_PRIVATE_KEY`
2. **Optional – Variables:** `WP_API_URL`, `WP_CATEGORY`, `WP_NOSTR_RELAY` als Repository-Variables setzen, um die Defaults zu überschreiben
3. **Manueller Test:** Actions → „WordPress → Nostr Sync" → „Run workflow" → Dry Run = `true`
4. **Live schalten:** Workflow erneut starten mit Dry Run = `false`

Der Cron-Job läuft automatisch im Live-Modus (`DRY_RUN=false`).

## Projektstruktur

```
wp-to-nostr/
├── wp-to-nostr.ts              # Haupt-Sync-Script
├── inspect-mapping.ts          # Debug: einzelnen Post inspizieren
├── deno.json                   # Tasks & Import-Map
├── .github/workflows/sync.yml  # GitHub Actions Workflow
├── docs/
│   └── nostr-kind-31923.md     # NIP-52 Mapping-Dokumentation
├── LICENSE
└── README.md
```

## Mapping-Übersicht

| WordPress                           | → Nostr kind:31923                   |
|--------------------------------------|--------------------------------------|
| `post.link`                          | `d`-Tag + `r`-Tag                   |
| `title.rendered`                     | `title`-Tag                         |
| `acf.relilab_startdate`             | `start`-Tag (UTC Unix-Timestamp)    |
| `acf.relilab_enddate`               | `end`-Tag (UTC Unix-Timestamp)      |
| *(fest: Europe/Berlin)*              | `start_tzid` / `end_tzid`           |
| `excerpt.rendered`                   | `summary`-Tag (Markdown)            |
| `content.rendered`                   | `content` (Markdown)                |
| `acf.relilab_custom_zoom_link`      | `location`-Tag                      |
| `featured_image_urls_v2.thumbnail`   | `image`-Tag                         |
| `taxonomy_info.post_tag[].label`     | `t`-Tags                            |

Detaillierte Spezifikation: [docs/nostr-kind-31923.md](docs/nostr-kind-31923.md)

## Anpassen für andere WordPress-Instanzen

1. `WP_API_URL` auf deinen Endpunkt setzen
2. `WP_CATEGORY` anpassen (oder Parameter entfernen)
3. ACF-Feldnamen in `mapPostToNostrEvent()` an dein Schema anpassen
4. Zeitzone in `wpDateToUnix()` und den `_tzid`-Tags ändern falls nötig

## Lizenz

[MIT](LICENSE)
