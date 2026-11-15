# Firespire

Firespire is a web app built for the NASA Space Apps Challenge 2026, "MODIS and VIIRS Hot Spots". It turns NASA FIRMS fire detections from MODIS (Terra, Aqua) and VIIRS (S-NPP, NOAA-20, NOAA-21) into one consistent fire history for Argentina, so the sensor that made a detection stops mattering. The guiding question is: "is this fire normal for this place and this time of year?"

## Repository layout

```
Firespire/
├── pipeline/        Python 3.12 pipeline: FIRMS CSV -> DuckDB -> versioned artifacts
├── web/             Next.js 16 (App Router, TypeScript) app that reads the artifacts
│   ├── public/artifacts/   generated artifacts, one folder per version
│   └── public/globe/       legacy static prototype, served as-is at /globe/index.html
├── docs/            product, method and data contract (Spanish)
├── fuentes/         input: NASA FIRMS yearly country CSVs
└── prep.py          legacy script that regenerates web/public/globe/data/*.js
```

## Prerequisites

- [uv](https://docs.astral.sh/uv/) (manages the Python toolchain; Python 3.12 is installed by uv)
- Node.js 22

## Quick start

Pipeline (run inside `pipeline/`):

```bash
uv sync
uv run firespire build ../fuentes --version v0   # writes web/public/artifacts/v0/
uv run pytest
uv run ruff check
```

Web (run inside `web/`):

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # vitest
npm run build
```

## Data

Input files come from NASA FIRMS yearly country CSVs, placed in `fuentes/`:

- `modis_YYYY_Argentina.csv` (MODIS family)
- `viirs-<snpp|jpss1|jpss2>_YYYY_Argentina.csv` (VIIRS family; S-NPP, NOAA-20, NOAA-21)

Today only 2023 and 2024 are in `fuentes/`, with MODIS and VIIRS NOAA-20 data. Because the calibration runs on incomplete data, the calibration factors are provisional.

Recent near-real-time (NRT) data comes from the FIRMS API (`/api/area`, clipped to Argentina):

```bash
cd pipeline
uv run firespire fetch --start 2026-09-01          # writes ../fuentes/nrt/ (not versioned)
uv run firespire build ../fuentes ../fuentes/nrt --version v1-nrt
```

NRT months are flagged as provisional and excluded from calibration. Months with no data for a sensor family are shown as "no data", not as zero fire.

## Method in one paragraph

The unit of analysis is the cell-day: an H3 cell (resolution 5) with at least one detection from a sensor family on a UTC day, counted once even if two satellites detected it that day. Persistent sources (cells with detections on more than half of the days in the range) are masked out. VIIRS constellation changes are handled with regimes (V1 to V4, defined in `pipeline/src/firespire/config.py`). For each regime, the factor k is the sum of MODIS cell-days divided by the sum of VIIRS cell-days over its non-provisional months. The harmonized series uses MODIS cell-days before 2012-02 and k times VIIRS cell-days from that month on. A holdout check (last 12 non-provisional months, with k estimated on the rest) reports the error of the harmonized series.

## Environment variables

- `FIRMS_MAP_KEY`: API key for NASA FIRMS. Server-side only, never exposed to the browser. Required by `firespire fetch`, which reads it from the environment or from `web/.env.local`. Get a free key at https://firms.modaps.eosdis.nasa.gov/api/map_key. See `web/.env.example`.

## Documentation

Start with [docs/](docs/). The data contract between pipeline and web is in [docs/contratos.md](docs/contratos.md), and open decisions are in [docs/decisiones.md](docs/decisiones.md).
