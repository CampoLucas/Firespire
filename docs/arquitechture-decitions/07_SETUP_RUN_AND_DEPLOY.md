# 07. Windows setup, run and deployment

[Index](00_START_HERE.md) · [Implementation prerequisites](06_IMPLEMENTATION_RUNBOOK.md) · [Release tests](08_TESTING_FAILURES_AND_RELEASE.md)

## Contents

[What runs now](#what-runs-now) · [Install and open the current app](#install-and-open-the-current-app) · [Accounts and environment](#accounts-and-environment) · [Prepare discovery data](#prepare-discovery-data) · [Provider probes](#provider-probes) · [Run the implemented integration](#run-the-implemented-integration) · [Two repeatable selections](#two-repeatable-selections) · [Deployment](#deployment) · [Troubleshooting](#troubleshooting)

## What runs now

The attached application is the existing visual prototype. **This architecture ZIP does not contain an implemented application.** Commands marked “existing” are present in `web/package.json::scripts`. Commands marked “after implementation” require the files described in [06](06_IMPLEMENTATION_RUNBOOK.md). A 404 for `/api/museum/discover` in the current ZIP is expected; it is not an API-key problem.

One Next.js process serves both frontend and backend. There is no second server port, Flask service, Docker requirement or browser API-key field. The supplied data can run the current prototype without Python or a FIRMS key (`README.md::Run the Museum of Fires prototype`).

## Install and open the current app

Use Windows 11, VS Code and its PowerShell terminal. Install **Node.js 22, version 22.12 or later in that major line**, matching the supplied repository recommendation. Select that version at the [official Node download page](https://nodejs.org/en/download); do not upgrade the application packages. Restart VS Code after installation. npm is included. Use `npm.cmd` to avoid PowerShell script execution-policy conflicts.

Open the extracted project folder in VS Code. The folder must contain `web`, `pipeline` and `fuentes`. In a terminal at that root:

```powershell
$ErrorActionPreference = 'Stop'
if (-not (Test-Path .\web\package.json)) {
    throw 'Open a terminal at the extracted application root first.'
}
node --version
npm.cmd --version
Set-Location .\web
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed. Read the error above.' }
npm.cmd run dev -- --port 3000
```

**Existing commands.** Leave this terminal running. Open [http://localhost:3000/](http://localhost:3000/) or directly [http://localhost:3000/globe/index.html](http://localhost:3000/globe/index.html). The homepage links to the globe. The globe requires internet for its existing hosted rendering libraries/textures (`web/public/globe/index.html` script sources and `ensurePlanMap`).

Stop with Ctrl+C. For a production-mode local run, existing commands from `web/` are:

```powershell
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
npm.cmd run start -- --port 3000
```

`npm ci` reinstalls locked dependencies; do not depend on the Windows `node_modules` or `.next` caches shipped in the source ZIP. Do not run `prep.py`; it expects an absent boundary source and is not needed here.

## Accounts and environment

Required for the complete live documentary path: Brave Search API access to **News and Web**, and Tavily Extract access. EONET is public. FIRMS MAP_KEY is optional for the initial local 2023–2024 data path and required only for testing/enabling missing-slice retrieval.

| Service | Where to obtain/configure | Cost/entitlement note |
|---|---|---|
| Brave | [API dashboard](https://api-dashboard.search.brave.com/) | Verify News/Web access and storage rights. Public Search pricing checked on 15 Nov 2026: $5/1,000 requests, $5 monthly credits; actual account terms win |
| Tavily | [Dashboard](https://app.tavily.com/) | 1,000 monthly free credits advertised; no card needed for free plan. Keep PAYGO off unless intended |
| NASA FIRMS | [MAP_KEY request](https://firms.modaps.eosdis.nasa.gov/api/map_key) | Free key; retain it server-side, including when it appears inside an upstream request path |
| Vercel | Existing project's dashboard/team | Needed for deployment, not local testing; verify access and plan limits |

Provider documentation and cost sources are consolidated in [03](03_PROVIDER_API_IMPLEMENTATION.md#account-and-cost-gates).

The coding stage must extend `web/.env.example` with this **proposed blank template**:

```dotenv
FIRMS_MAP_KEY=
BRAVE_API_KEY=
TAVILY_API_KEY=
MUSEUM_DISCOVERY_ENABLED=true
MUSEUM_EONET_ENABLED=true
MUSEUM_BRAVE_ENABLED=true
MUSEUM_TAVILY_EXTRACT_ENABLED=true
MUSEUM_TAVILY_SEARCH_ENABLED=false
MUSEUM_FIRMS_LIVE_ENABLED=false
MUSEUM_RESULT_CACHE_ENABLED=false
```

Absent boolean settings use these defaults except `MUSEUM_DISCOVERY_ENABLED`, which defaults false until deliberately configured. Key presence means configured, not provider-tested. Result caching stays off until storage entitlement is checked. Never name any secret `NEXT_PUBLIC_*`.

After that template exists, in a terminal at `web/`:

```powershell
if (-not (Test-Path .\.env.local)) {
    Copy-Item .\.env.example .\.env.local
}
notepad.exe .\.env.local
```

Paste keys into the editor, save and close it. Do not paste them into commands, screenshots, chat, query strings or logs. Restart Next after changing environment values. `web/.gitignore` already ignores `.env*` except `.env.example`; keep it that way. Only blank examples belong in source control or downloadable code.

## Prepare discovery data

**After implementation only.** From `web/`:

```powershell
if (-not (Test-Path .\scripts\build-discovery-data.mjs)) {
    throw 'The live integration has not been implemented yet.'
}
npm.cmd run data:museum
if ($LASTEXITCODE -ne 0) { throw 'Discovery index generation failed.' }
$coverage = Get-Content .\data\museum\coverage.json -Raw | ConvertFrom-Json
$coverage | Select-Object schemaVersion, datasetVersion, datasetHash
$coverage.intervals | Format-Table startDate, endDate, completeness
```

Expected: certified source-file intervals covering 2023–2024 and generated monthly shards under `web/data/museum/`. No network or API key is needed for this step. Raw data come from the supplied `../fuentes/` and boundary file `../pipeline/resources/provincias.geojson`. Generated files must be included in deployment because Vercel's `web/` root cannot be assumed to read `../fuentes` at runtime.

Do not infer complete global archive coverage from the existence of the globe's 2025/2026 files. Their rendering remains available, while strict documentary discovery initially reports unsupported provenance for those years.

## Provider probes

### EONET direct probe, runnable now without a key

From any PowerShell terminal with HTTPS access:

```powershell
$eonetUrl = 'https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=all&start=2024-09-01&end=2024-09-30&bbox=-65.771,-29.499,-61.788,-35.015&limit=50'
$eonet = Invoke-RestMethod -Uri $eonetUrl -TimeoutSec 20
@($eonet.events).Count
$eonet.events | Select-Object id, title
```

This returned four leads during this architecture task. Catalog content can change; the check is valid schema and request-specific results, not a permanently fixed count.

### Keyed operator probes after implementation

The proposed script loads `.env.local` through Node's `--env-file`. It must implement the interface in [06](06_IMPLEMENTATION_RUNBOOK.md#step-3-provider-adapters-and-probes), not expose debug HTTP endpoints. From `web/`:

```powershell
node --env-file=.env.local .\scripts\probe-providers.mjs --provider eonet
if ($LASTEXITCODE -ne 0) { throw 'EONET probe failed.' }
node --env-file=.env.local .\scripts\probe-providers.mjs --provider brave
if ($LASTEXITCODE -ne 0) { throw 'Brave News/Web probe failed.' }
```

Brave must test both endpoints and print safe returned source URLs. Choose one relevant accessible HTTPS source URL from that output, then run:

```powershell
$sourceUrl = Read-Host 'Paste one source URL returned by the Brave probe'
node --env-file=.env.local .\scripts\probe-providers.mjs --provider tavily --url $sourceUrl
if ($LASTEXITCODE -ne 0) { throw 'Tavily extraction failed for that source.' }
```

The URL is public source data, not a key. A 200 response with `failed_results` only is **not** a successful extraction. Try another actually returned source if access fails; keep the failure record.

Optional FIRMS key/availability probe:

```powershell
node --env-file=.env.local .\scripts\probe-providers.mjs --provider firms
```

This must never print its full NASA request URL because MAP_KEY is inside the path. A missing FIRMS key does not block local historical-data discovery. The script must label any unrecognized availability response and leave `MUSEUM_FIRMS_LIVE_ENABLED=false`.

## Run the implemented integration

Start the same existing dev command from `web/`; backend and frontend share port 3000:

```powershell
npm.cmd run dev -- --port 3000
```

Open a **second** PowerShell terminal at `web/` for checks. The following endpoints exist **only after implementation**:

```powershell
$base = 'http://localhost:3000'
Invoke-RestMethod -Uri "$base/api/museum/status" -TimeoutSec 10

$requestBody = @{
    schemaVersion = 1
    area = @{ kind = 'province'; countryCode = 'AR'; provinceId = 'AR:cordoba' }
    startDate = '2024-09-01'
    endDate = '2024-09-30'
    activityFilters = @{ confidenceMin = 0; dayNight = 'all' }
    language = 'es'
    refresh = $true
} | ConvertTo-Json -Depth 12

$result = Invoke-RestMethod -Method Post -Uri "$base/api/museum/discover" `
    -Headers @{ Origin = $base } -ContentType 'application/json' `
    -Body ([System.Text.Encoding]::UTF8.GetBytes($requestBody)) -TimeoutSec 70

$result | Select-Object requestId, queryKey, status, activityStatus, discoveryStatus, fromCache
$result.providers | Format-Table provider, status, calls, errorCode
$result.waypoints | Select-Object id, title, causeStatus, ready
$result.sources | Select-Object title, originalUrl, contentStatus
```

A healthy provider status with zero eligible waypoints can be an honest search outcome. It does not pass the required end-to-end source-to-board demonstration by itself. Read rejection counts and warnings before changing the query. Never relabel unknown material to make official-only populated.

## Two repeatable selections

Use [the globe](http://localhost:3000/globe/index.html). After implementation, select **Argentina → Córdoba**, start **2024-09-01**, end **2024-09-30**, confidence All, day/night All. Press **Find documented fires**. Wait for ready/partial status; allow up to a minute. Default Official is on. If empty, enable Unknown, then Unofficial as desired. Select a ready result, wait five seconds or press Start, inspect the real source, return to Whole board, then Back to globe.

Repeat with **Corrientes, 2023-02-01 to 2023-02-28**. Both selections have measured bundled activity. EONET returned zero for the second selection during this task, making it a useful fallback check. There is also independently retrievable official documentation for that period: [SNMF resource update, 26 February 2023](https://www.argentina.gob.ar/noticias/ambiente-mantiene-los-recursos-para-el-combate-de-los-incendios-en-corrientes-3). It supports documentary availability, not a guaranteed Brave/Tavily result or final cause. Do not hardcode this URL into discovery.

Second backend request after implementation:

```powershell
$secondBody = @{
    schemaVersion = 1
    area = @{ kind = 'province'; countryCode = 'AR'; provinceId = 'AR:corrientes' }
    startDate = '2023-02-01'
    endDate = '2023-02-28'
    activityFilters = @{ confidenceMin = 0; dayNight = 'all' }
    language = 'es'
    refresh = $true
} | ConvertTo-Json -Depth 12
$second = Invoke-RestMethod -Method Post -Uri "$base/api/museum/discover" `
    -Headers @{ Origin = $base } -ContentType 'application/json' `
    -Body ([System.Text.Encoding]::UTF8.GetBytes($secondBody)) -TimeoutSec 70
$second | Select-Object queryKey, status, activityStatus, discoveryStatus
$second.providers | Format-Table provider, status, calls, errorCode
$second.waypoints | Select-Object id, title, causeStatus
```

Respect the three-search/10-minute application cap. Do not hammer Refresh when an upstream provider has exhausted its quota. Rate-limited requests should provide a retry delay.

## Deployment

The actual repository documents **Vercel, Root Directory `web`** (`web/README.md`). Use the existing project's Git-linked deployment flow where available; do not invent an additional hosting stack. Deployment instructions are prospective and no deployment was performed here.

1. Complete local generation, tests and production build. Include generated `web/data/museum/` in the coding-stage commit/deployment artifact, with nonsecret source manifest. Keep `.env.local`, `.museum-probes`, `node_modules` and `.next` out. Do not put any source extraction cache into public files.
2. In the existing Vercel project, verify Root Directory `web`, framework Next.js, Node 22, install command `npm ci`, build command `npm run build`. The offline data-generation command is run before deployment; it must not fail remotely because `../fuentes` was not uploaded. No automatic remote rebuild of the FIRMS index is required.
3. Set `BRAVE_API_KEY`, `TAVILY_API_KEY` and the nonsecret enablement flags in **Preview** environment settings. Set `FIRMS_MAP_KEY` only if the optional adapter is used. Enter secrets in the dashboard, not CLI argument strings. Restart/redeploy after changes. Review provider spend caps.
4. Keep Deployment Protection on for the demonstration. Verify it actually protects both the static globe and `/api/museum/discover` from anonymous use. If unavailable for the account, keep the live demonstration local until a suitable access/rate gate exists. Do not expose a paid public search endpoint with only a per-process Map limiter.
5. Deploy the implementation branch using the existing Git integration. Ensure the two new routes' build traces include `data/museum/**/*`. Keep the three original artifact trace entries. Confirm actual function duration is at least 60 seconds and response under 1 MiB.
6. Open the Preview URL while authenticated and rerun the two live queries and complete journey. Inspect safe function logs and provider dashboards. A bundled-data 503 on Preview but not local is usually a missing output trace or generated file.
7. Only after the release checks, promote the tested deployment through the existing project's dashboard. Public release additionally needs effective platform rate controls and verified provider budgets. Protection settings and account capabilities were not available for inspection here.

Optional CLI for an existing Vercel project, run at the **application repository root** so the project's configured `web` Root Directory applies:

```powershell
npx.cmd vercel login
npx.cmd vercel link
npx.cmd vercel
```

Choose the existing team/project when prompted; do not accept a new project unintentionally. Copy the returned Preview URL. Inspect actual timeout configuration:

```powershell
$previewUrl = Read-Host 'Paste the Preview deployment URL'
npx.cmd vercel inspect $previewUrl --json
```

These are Vercel CLI commands, not repository npm scripts. Sources: [deploy CLI](https://vercel.com/docs/cli/deploy), [build/root directory](https://vercel.com/docs/builds/configure-a-build), [function duration](https://vercel.com/docs/functions/configuring-functions/duration). This plan does not require static export or GitHub Pages; those cannot hold provider secrets or run these routes.

## Troubleshooting

| Symptom | Check / action |
|---|---|
| `npm.ps1` blocked | Use the provided `npm.cmd` commands; no global execution-policy change needed |
| `npm ci` fails | Node version, registry/network, exact lockfile; do not delete lockfile or upgrade packages as first response |
| Port 3000 occupied | Stop previous app or use another port consistently in dev command, base URL and Origin |
| New route is 404 | Live code is not implemented or wrong working project; keys cannot fix missing code |
| status says disabled | Set `MUSEUM_DISCOVERY_ENABLED=true` in `web/.env.local`, restart |
| 401/403 from provider | Wrong key/product entitlement/account; no automatic retry or fallback to fictional data |
| 429 | Obey retry delay; inspect actual provider quota and local search cap |
| Historical data unavailable | Use certified 2023–2024 slice or prepare/verify real missing data; no year substitution |
| Zero official, Unknown count positive | Expected strict classification; opt into Unknown without rerunning search |
| Extraction unavailable | Source may be blocked, paywalled, image-only or oversized; preserve link/status, try other discovered sources |
| Request times out | Narrow dates/area; retain bounded partial results; inspect which stage consumed deadline |
| Blank globe | Check original CDN/texture network requests separately from documentary endpoints |
| Live board still says fictional | Incorrect mock-to-live adapter/label branch; do not call the integration ready |
| Source link selects paper instead | Fix pointer/keyboard handling described in file 05 |

Never diagnose a missing official cause as an API malfunction without checking actual source contents. No provider guarantees a final cause finding for every fire.
