---
type: Playbook
title: "Firespire — setup, run and deploy (Windows)"
description: "Windows commands to place the FIRMS archive, fetch NRT, build harmonized artifacts, run the web app, set up Tavily (API or MCP) for curation, and deploy to Vercel."
tags: ["firespire", "nasa-space-apps-2026", "setup", "deploy"]
sources:
  - "../../CLAUDE.md"
  - "../../web/README.md"
privacy: open
status: draft
generated:
  by: "andy/claude-code"
  at: "2026-11-15T15:30:00-03:00"
---
# 07. Setup, run and deploy

[Index](00_START_HERE.md) · [Runbook](06_IMPLEMENTATION_RUNBOOK.md) · [Release](08_TESTING_FAILURES_AND_RELEASE.md)

Commands are PowerShell from the repo root unless stated. Commands marked *after implementation* need the Track A/B/C changes from [06](06_IMPLEMENTATION_RUNBOOK.md).

## Toolchain

- Python is managed by `uv` (in `~\.local\bin`; there is no system Python). If `uv` is not found:

```powershell
$env:Path = "$HOME\.local\bin;$env:Path"
```

- Node 22 with npm; use `npm.cmd` if PowerShell blocks `npm.ps1`.

## Keys

Create `web\.env.local` from the example and edit it; never paste keys into commands, chat or screenshots.

```powershell
Copy-Item .\web\.env.example .\web\.env.local -ErrorAction SilentlyContinue
notepad.exe .\web\.env.local
```

```dotenv
FIRMS_MAP_KEY=
# Curation only, never set in Vercel:
TAVILY_API_KEY=
```

`web/.gitignore` ignores `.env*` except `.env.example`. `fetch.py::load_key` reads `FIRMS_MAP_KEY` from the environment or this file.

## Data

### 1. Place the archive

Put SP files in `fuentes\sp\` with the names in [03](03_PROVIDER_API_IMPLEMENTATION.md#archive-files-history). Quick check of names and years:

```powershell
Get-ChildItem .\fuentes\sp\*.csv | Select-Object Name, @{n='MB';e={[math]::Round($_.Length/1MB,1)}}
```

### 2. Check availability and fetch NRT

From `pipeline\`:

```powershell
uv sync
uv run firespire fetch --start 2026-08-01 --out ..\fuentes\nrt
```

Replace `2026-08-01` with `sp_cutoff + 1` (see [03](03_PROVIDER_API_IMPLEMENTATION.md#spnrt-cutoff)). *After implementation* (A2), SP gaps:

```powershell
uv run firespire fetch --product sp --start 2026-01-01 --end 2026-07-31 --sources VIIRS_SNPP_SP,VIIRS_NOAA21_SP --out ..\fuentes\sp
```

### 3. Build harmonized artifacts

```powershell
uv run firespire build ..\fuentes\sp ..\fuentes\nrt --version v2-full
Get-Content ..\web\public\artifacts\v2-full\calibration.json
Get-Content ..\web\public\artifacts\v2-full\validation.json
```

`build` writes `web\public\artifacts\v2-full\` and points `latest.json` to it. *After implementation* (C4) it also writes `museum.json` from `pipeline\resources\museum\events.json`.

### 4. Tests and lint

```powershell
uv run pytest
uv run ruff check
```

## Web

From `web\`:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open http://localhost:3000/ (History, core) and http://localhost:3000/globe/index.html (globe and museum). Restart `npm run dev` after every `build`. Checks:

```powershell
npm.cmd test
npm.cmd run check:museum
npm.cmd run lint
npm.cmd run build
```

## Tavily for curation

### Tavily API

Used by the optional `pipeline\scripts\curate_sources.py` with `TAVILY_API_KEY` from `web\.env.local`. Request formats in [03](03_PROVIDER_API_IMPLEMENTATION.md#tavily-curation-only).

### Tavily MCP

Add the Tavily MCP server to the curator's Claude Code configuration following Tavily's own MCP instructions (server package and options vary by version [unverified]). Keep the key in the MCP server's environment, not in the repo. Then, in a Claude Code session at the repo root:

1. Open `pipeline\out\candidates.json` (output of C1).
2. For each candidate, ask for a Tavily search with the queries from [04 C2](04_DISCOVERY_AND_CAUSE_ENGINE.md#c2-document-candidates-with-tavily), then an extract of the best URLs.
3. Open the URLs yourself, then write `events.json` by hand or ask Claude to draft entries you check one by one.

The MCP does not run in Vercel and adds no runtime dependency.

## Deployment

1. Vercel project with **Root Directory `web`** (`web/README.md`), framework Next.js, Node 22.
2. Environment variables (Production and Preview): `FIRMS_MAP_KEY` only. **Not** `TAVILY_API_KEY`.
3. Commit the artifacts under `web/public/artifacts/<version>/` (they are static files served by the CDN). Do not commit `fuentes/sp/` if large.
4. If B4 is shipped, add `../pipeline/resources/provincias.geojson` (or a copy under `web/`) to `outputFileTracingIncludes` for the `hotspots.csv` route.
5. Deploy, then run the checks in [08](08_TESTING_FAILURES_AND_RELEASE.md#mvp-gates) on the deployed URL.

## Troubleshooting

| Symptom | Action |
|---|---|
| `ingest` fails with unknown key | A VIIRS file name does not match `viirs-{snpp,jpss1,jpss2}_YYYY_<Country>.csv`; rename the file |
| Harmonized ≈ 2× MODIS in recent months | A regime's SP months lack a satellite; check `sp_months_incomplete` and fetch the missing SP product |
| Holdout `skipped` | Fewer than 24 SP months with data; the archive is incomplete |
| History still shows 2023 | `latest.json` not updated or dev server not restarted |
| `hotspots.csv` 503 | `FIRMS_MAP_KEY` missing in that environment |
| FIRMS "Invalid API call" | Use the area endpoint, not country (`fetch.py`) |
| FIRMS transaction limit | Wait 10 minutes; `fetch` prints usage from `mapkey_status` |
