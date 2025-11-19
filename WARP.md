# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Repository layout

- `backend/` — Node.js + TypeScript API server on Express with SQLite storage and LLM integration.
- `frontend/` — React + TypeScript SPA built with Vite that visualizes the collision matrix and derived costs.
- `README_UI.md` — end‑user guide to the UI tabs and expected JSON formats for collision scenarios.

There is no monorepo root `package.json`; backend and frontend are developed and installed independently.

## Common commands

All commands assume PowerShell on Windows, but they are standard `npm`/Node commands.

### Backend (API + SQLite + LLM)

From `backend/`:

- Install dependencies:
  - `npm install`
- Run in watch/dev mode (default `http://localhost:3001`):
  - `npm run dev`
- Run the test suite (Vitest):
  - `npm run test`
  - Run a single test file, e.g. only matrix tests:
    - `npm run test -- tests/matrix.test.ts`
- Build TypeScript and start the compiled server:
  - `npm run build`
  - `npm start`

Useful HTTP flows (mirroring `backend/README.md`):

- Fully populate DB from the public price list and matrix CSV (with backend running):
  1. Scrape prices: `POST /api/prices/scrape`
  2. Save disciplines from matrix: `POST /api/disciplines/save`
  3. Generate discipline mapping: `POST /api/mapping/suggest`
  4. Generate element mapping: `POST /api/mapping/elements/suggest`
  5. Inspect DB counts: `GET /api/debug/db/counts`

The backend README contains ready‑to‑paste PowerShell `Invoke-RestMethod` snippets for these steps.

### Frontend (React/Vite SPA)

From `frontend/`:

- Install dependencies:
  - `npm install`
- Run dev server with HMR (default `http://localhost:5173`):
  - `npm run dev`
- Lint TypeScript/JSX with ESLint:
  - `npm run lint`
- Build the app (typecheck + bundle):
  - `npm run build`
- Preview a production build locally:
  - `npm run preview`

Matrix data baking and single‑file output:

- Bake matrix from CSV in `public/matrix.csv` into `src/assets/baked-matrix.json`:
  - `npm run bake:csv`
- Bake matrix from the running backend API (`/api/matrix`):
  - `npm run bake:api`
- Build a single‑file bundle (HTML with inlined assets):
  - `npm run build:single`
- Bake from CSV and then build a single‑file bundle:
  - `npm run build:single:baked`

## Matrix data sources (frontend)

The SPA can operate without the backend via different data sources, controlled by the `source` query parameter (see `frontend/README.md`):

- `source=baked` (default) — reads statically baked JSON from `src/assets/baked-matrix.json`.
- `source=csv` — parses `public/matrix.csv` in the browser.
- `source=api` — fetches the matrix from the backend at `http://localhost:3001/api/matrix`.

Examples:

- `http://localhost:5173/?source=baked`
- `http://localhost:5173/?source=csv`
- `http://localhost:5173/?source=api`

When generating baked JSON from the live API, ensure the backend is running before `npm run bake:api`.

## Backend architecture

High‑level responsibilities:

- Load the collision matrix from CSV into an in‑memory model.
- Scrape and store price list data in SQLite.
- Generate and store mapping suggestions at three levels: disciplines, elements, and individual cells.
- Track user accept/reject decisions on suggestions and log them as events.
- Compute per‑cell cost ranges and risk scores, optionally assisted by an external LLM.
- Expose HTTP APIs consumed by the frontend and by scripts.

### Core modules

- `src/app.ts`
  - Creates an Express app (`createApp()`), configures CORS for `http://localhost:*`, and sets up JSON parsing.
  - Exposes the primary API surface under `/api/*`, grouped roughly as:
    - Matrix: `GET /api/matrix` (loads CSV via `loadMatrixFromCsv` and returns structured rows/columns/grid plus the CSV source path).
    - Prices: `POST /api/prices/scrape`, `GET /api/prices`.
    - Disciplines: `POST /api/disciplines/save`, `GET /api/disciplines`.
    - Discipline mapping: `POST /api/mapping/suggest`, `GET /api/mapping`, `POST /api/mapping/suggestions/:id/status`.
    - Element mapping: `POST /api/mapping/elements/suggest`, `GET /api/mapping/elements`, `POST /api/mapping/elements/:id/status`, `GET /api/mapping/elements/status-summary`.
    - Suggestion events: `GET /api/events/suggestions`.
    - LLM debug: `GET /api/debug/llm/providers`, `POST /api/debug/llm/ping`, `POST /api/debug/llm/rerank`, `GET /api/debug/logs/llm`.
    - DB debug: `GET /api/debug/db/counts`.
    - Background tasks: `POST /api/tasks/start`, `GET /api/tasks`, `GET /api/tasks/:id`, `GET /api/tasks/:id/logs`, `POST /api/tasks/:id/stop`.
    - Cell keys and suggestions: `POST /api/cells/init`, `POST /api/cells/:rowIndex/:colIndex/suggest`, `GET /api/cells/:rowIndex/:colIndex/suggestions`, `POST /api/cells/suggestions/:id/status`.
    - Cell items and summaries: `POST /api/cells/:rowIndex/:colIndex/items`, `GET /api/cells/:rowIndex/:colIndex/items`, `GET /api/cells/summary`, `GET /api/cells/status-summary`.
    - Collision costs and risk: `GET /api/cells/:rowIndex/:colIndex/collision-cost`, `POST /api/cells/:rowIndex/:colIndex/collision-scenarios`, `GET /api/cells/:rowIndex/:colIndex/risk`, `GET /api/cells/:rowIndex/:colIndex/calc-items`.
    - Cell‑level auto‑approval with LLM: `POST /api/cells/:rowIndex/:colIndex/auto-approve`.

- `src/db.ts`
  - Opens SQLite at `SQLITE_DB_PATH` or, by default, `backend/data/cmw.db`.
  - `initDB()` sets up all tables and foreign keys:
    - `disciplines` — matrix row/column discipline groups.
    - `prices` — scraped price list with category, name, unit, price, currency, and source.
    - `mapping_suggestions` — discipline→price suggestions with score and status (`proposed`/`accepted`/`rejected`).
    - `element_suggestions` — (grp, element, axis)→price suggestions.
    - `suggestion_events` — audit log of accept/reject actions across disciplines, elements, and cells.
    - `cell_keys` — stable identifiers for each (row_index, col_index) in the matrix, with group/label metadata.
    - `cell_suggestions` — candidate prices per cell.
    - `cell_items` — accepted items per cell (with quantity, unit_price, total, and provenance).
    - `collision_costs` — persisted cost ranges and raw scenarios JSON per cell.
    - `cell_risks` — hazard/importance/difficulty scores and rationale JSON per cell.
    - `tasks` and `task_logs` — background job tracking and logs.
  - Provides typed helper functions for each table (insert/bulk‑insert/query/update) that are used exclusively from higher‑level modules.

- `src/matrix.ts`
  - Parses the collision matrix CSV (see `backend/README.md` for example path) into `rows`, `columns`, and `grid` structures, including group/label metadata.
  - `extractDisciplineGroups()` derives unique discipline groups for rows and columns, used to seed the `disciplines` table.

- `src/scrapeGarant.ts`
  - Fetches and parses the GarantStroiKompleks price list into `PriceRow` structures consumed by `bulkInsertPrices`.

- `src/mapping.ts`, `src/elementMapping.ts`, `src/cellMapping.ts`
  - Implement the three levels of suggestion builders:
    - Discipline‑level mapping from a flat list of discipline names and prices.
    - Element‑level mapping from matrix `(grp, element, axis)` and prices.
    - Cell‑level suggestions given the matrix, a specific `(rowIndex, colIndex)`, and prices.
  - Use `llmRerank` (when configured) to improve ranking but always have heuristic fallbacks.

- `src/llm.ts`
  - Wraps an OpenAI‑compatible `/chat/completions` API via `chatCompletionOpenAICompatible`, with retry/delay logic controlled by `LLM_REQUEST_DELAY_MS` and `LLM_MAX_RETRIES`.
  - Masks API keys in logs and writes structured logs to `backend/logs/llm.log` when `LLM_DEBUG=1`.
  - Domain‑specific helpers:
    - `llmRerank` — reorders price candidates for a discipline or cell context, returning `{index, score}`.
    - `llmDecideCell` — decides accept/reject for cell suggestions.
    - `llmDecideElement` — decides accept/reject for element‑level suggestions.
    - `llmCollisionEstimate` — generates high‑level collision scenarios (in JSON) with rough `price_min`/`price_max` and a `unit`.
    - `llmRiskEstimate` — produces normalized `hazard`, `importance`, and `difficulty` scores with rationale JSON.
  - All of these rely on a single set of env vars: `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`.

- `src/tasks.ts`
  - Orchestrates long‑running operations triggered via `/api/tasks/start` (e.g. syncing cell keys, bulk building suggestions, computing collisions and risk for all cells).
  - Persists progress and log lines via `insertTask`, `updateTaskStatus`, and `insertTaskLog` so the frontend can poll and show progress.

- `src/server.ts`
  - Entry point that calls `initDB()` and `createApp()`, then starts listening on `PORT` (default `3001`).

### Backend configuration notes

- Database location:
  - Controlled by `SQLITE_DB_PATH`; `':memory:'` enables an in‑memory DB (useful for tests).
- LLM configuration (used both in `app.ts` debug endpoints and in `llm.ts` helpers):
  - `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` — must all be set to enable LLM features.
  - `LLM_DEBUG=1` — enable detailed logging to `backend/logs/llm.log`.
  - `LLM_REQUEST_DELAY_MS`, `LLM_MAX_RETRIES` — throttle and retry behaviour for external requests.

The `backend/README.md` still documents older, provider‑specific variables (`MISTRAL_*`, `OPENAI_*`); prefer the generic `LLM_*` env vars reflected in the current code when wiring up providers.

## Frontend architecture

High‑level responsibilities:

- Provide a tabbed UI over the collision matrix for:
  - Inspecting the raw matrix.
  - Viewing and refining cost ranges per cell.
  - Managing element‑level and discipline‑level price mappings.
  - Monitoring LLM providers and debugging calls.
  - Reviewing accept/reject events and background tasks.
- Work both against a live backend (`source=api`) and against baked or CSV matrix data (`source=baked` / `source=csv`).

### Core modules

- `src/main.tsx` / `src/App.tsx`
  - Standard Vite React entry and top‑level shell.

- `src/AppOrchestrator.tsx`
  - Central coordinator for the SPA:
    - Reads the `source` query parameter and chooses between baked JSON, CSV, or API.
    - Loads the matrix and passes it to tab components.
    - Manages shared state such as the currently selected matrix cell/element and active tab.

- `src/tabs/MatrixTab.tsx`
  - Shows the base collision matrix (rows, columns, and grid) without costs.
  - Allows selecting a row/column element, which is reused by other tabs (`Elements`, `Disciplines`).

- `src/tabs/CostMatrixTab.tsx`
  - Visualizes per‑cell cost and risk summaries obtained from `/api/cells/summary`, `/api/cells/status-summary`, and related endpoints.
  - Drives cell‑level workflows described in `README_UI.md`: opening a cell, editing collision scenarios JSON, saving to recompute `min/max`, and triggering LLM‑assisted suggestion/auto‑approval flows.

- `src/tabs/ElementsTab.tsx`
  - Focuses on element‑level suggestions for a currently selected matrix element.
  - Calls `/api/mapping/elements*` endpoints to fetch and update suggestions; exposes manual accept/reject actions.

- `src/tabs/DisciplinesTab.tsx`
  - Similar to `ElementsTab`, but operates on discipline groups rather than individual elements, using `/api/mapping*` endpoints.

- `src/tabs/LlmTab.tsx`
  - Surfaces `/api/debug/llm/providers`, `/api/debug/llm/ping`, and `/api/debug/llm/rerank` for interactive LLM diagnostics.

- `src/tabs/EventsTab.tsx`
  - Uses `/api/events/suggestions` to display a chronological log of accepted/rejected suggestions with price and context metadata.

- `src/components/TasksBar.tsx`
  - Polls `/api/tasks` and `/api/tasks/:id/logs` to display the status of long‑running backend tasks.
  - Provides controls to start/stop supported task types (e.g. full cell sync, bulk suggestion builds) via `/api/tasks/start` and `/api/tasks/:id/stop`.

- `src/utils/matrix.ts`
  - Normalizes raw matrix data from baked JSON, CSV, or API into a unified internal representation shared across tabs.
  - Provides helper functions for addressing cells, reading associated summaries/statuses, and mapping between row/column indices and labels/groups.

### UI behaviour from `README_UI.md`

`README_UI.md` documents the intended UX across tabs; future agents should preserve these semantics when making changes:

- **Matrix** — base collision matrix and entry point for selecting elements.
- **Матрица со стоимостью** (Cost matrix) — cell‑level `min–max` values, accepted positions, and LLM‑generated scenarios; includes JSON editing for scenarios with a strict schema (array of `{ scenario, rationale, items:[{ name, quantity }] }`).
- **Элементы / Дисциплины** — ranked price suggestions with manual and LLM‑assisted accept/reject flows.
- **LLM** — provider summary and ping functionality.
- **Журнал** — audit log of accept/reject actions and related context.

The JSON format and helper notes in `README_UI.md` should be treated as the source of truth for scenario structure and UI affordances around editing and persisting those scenarios.
