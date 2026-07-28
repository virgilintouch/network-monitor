# Device Aliases (Custom Display Names) Design

**Date:** 2026-07-28  
**Status:** Approved for implementation planning after user review  
**Project:** network-monitor / mi-router-exporter

## Goal

Let the user assign custom display names to LAN devices, keyed by MAC address, through a local management page and API. Grafana should show the custom name when present, while still preserving the router-provided original name.

## Background

Today, device names shown in Grafana come from the Xiaomi router APIs:

- Traffic / Top10 metrics use `devname || name` from `/api/misystem/status`
- Device detail inventory uses `name` from `/api/misystem/devicelist` via `mi_router_device_info`

There is no local override. Opening `http://localhost:3030/aliases` currently returns `Cannot GET /aliases`.

## Decisions Already Confirmed

1. **Management UX:** standalone page hosted by the exporter at `/aliases`
2. **Grafana display format:**
   - with alias: `自定义名 (路由器原名)`
   - without alias: `路由器原名`
3. **Persistence:** JSON file on disk, Docker-mounted so aliases survive container rebuilds
4. **Architecture:** extend existing `mi-router-exporter` (no separate alias service)
5. **Out of scope for v1:** writing names back to the router, SQLite, protocol/port analytics, multi-user auth

## Recommended Approach

Add an alias subsystem inside `mi-router-exporter`:

1. Persist aliases in `data/device-aliases.json`
2. Expose REST APIs for list/get/set/delete
3. Serve a simple management UI at `/aliases`
4. When rendering Prometheus metrics, compute display `name` as:
   - `alias (router_name)` when alias exists and is non-empty
   - otherwise `router_name`
5. Also export `router_name` label so the original router value remains available

## Data Model

File path (host): `./data/device-aliases.json`  
File path (container): `/usr/src/app/data/device-aliases.json`

Schema:

```json
{
  "AA:BB:CC:DD:EE:FF": {
    "alias": "客厅电视",
    "updatedAt": "2026-07-28T01:40:00.000Z"
  }
}
```

Rules:

- MAC is the unique key
- Normalize MAC to uppercase colon-separated form before read/write
- Empty/whitespace-only alias is rejected on write; delete endpoint is used to clear
- Missing file is treated as `{}` and created on first successful write
- Writes are atomic (temp file + rename) to avoid partial corruption

## Display Name Algorithm

Inputs:

- `routerName`: original name from router (`devname` or `name`)
- `alias`: optional user alias for that MAC

Output `displayName`:

1. If `alias` is present and non-empty after trim → `${alias} (${routerName || 'unknown'})`
2. Else → `routerName || ''`

Prometheus labels:

- `name` = `displayName` (keeps existing Grafana panels working)
- `router_name` = original router name
- existing `mac`, `ip`, and other labels remain unchanged

## API Design

Base service remains on port `3030`, bound to `127.0.0.1` via compose.

### `GET /api/devices`

Return currently known devices merged with aliases.

Response item fields:

- `mac`
- `ip`
- `online`
- `routerName`
- `alias` (nullable/empty string if none)
- `displayName`
- `updatedAt` (alias timestamp if present)

Source of device inventory:

- Prefer merged view from latest router status + device list already used by metrics scraping
- If router fetch fails, API returns an error; aliases endpoint still remains readable

### `GET /api/aliases`

Return the raw alias map currently stored on disk.

### `PUT /api/aliases/:mac`

Body:

```json
{ "alias": "客厅电视" }
```

Behavior:

- Validate MAC format
- Trim alias; reject empty alias with HTTP 400
- Upsert alias + `updatedAt`
- Persist JSON
- Return updated record

### `DELETE /api/aliases/:mac`

Behavior:

- Normalize MAC
- Remove alias entry if present
- Persist JSON
- Return success even if alias did not previously exist (idempotent)

## Management UI

Route: `GET /aliases`

Minimal single-page UI served by exporter:

- Table of devices: MAC, IP, online, router name, alias input, display preview
- Save button per row (or save action that calls `PUT`)
- Clear/remove alias action that calls `DELETE`
- Uses fetch against `/api/devices` and `/api/aliases/:mac`
- No external frontend framework required for v1

## Deployment / Persistence

Update `docker-compose.yml` for `mi-router-exporter`:

- Mount `./data:/usr/src/app/data`
- Ensure directory exists in repo (`data/` with `.gitkeep` and optional empty starter file policy)

Also document:

- Aliases survive `docker compose up -d --build`
- Deleting `./data/device-aliases.json` clears all custom names

## Files Expected to Change / Add

Add:

- `mi-router-exporter/aliasesStore.js` — load/save/normalize aliases
- `mi-router-exporter/displayName.js` — pure display-name helper
- `mi-router-exporter/public/aliases.html` — management page (or equivalent static asset)
- `mi-router-exporter/test/aliases*.test.js` — unit/API tests
- `data/.gitkeep`
- `docs/superpowers/specs/2026-07-28-device-aliases-design.md` (this file)

Modify:

- `mi-router-exporter/index.js` — routes for page + API; wire store into metrics path
- `mi-router-exporter/metrics.js` — apply display name + `router_name`
- `docker-compose.yml` — data volume mount
- `README.md` / `readme_CN.md` — usage for `/aliases` and persistence
- `.gitignore` if alias data file should not be committed (keep directory, ignore content file)

## Testing Strategy

TDD-first:

1. Unit tests for MAC normalization and display-name formatting
2. Unit tests for alias store read/write/delete/atomic save
3. Metrics tests asserting:
   - aliased device exports `name="客厅电视 (iPhone)"`
   - `router_name="iPhone"`
   - unaliased device keeps original `name`
4. HTTP tests for API validation and persistence
5. Manual verification:
   - open `/aliases`
   - set an alias
   - confirm `/metrics` reflects new display name
   - rebuild container and confirm alias still present

## Success Criteria

- User can open `/aliases` and no longer see `Cannot GET /aliases`
- User can set/clear a custom name for a device by MAC
- Grafana Top10 / device detail show `alias (router_name)` when alias exists
- Aliases persist across exporter container rebuilds via mounted JSON file
- No SQLite / no router writeback / no protocol-port scope creep in v1

## Non-Goals / Later Work

- Per-device historical drill-down UX improvements in Grafana (can reuse Prometheus time series)
- Protocol/port breakdown (requires new packet/flow telemetry sources)
- Optional later migration from JSON to SQLite if metadata needs grow (notes, tags, rename history)

## Risks and Mitigations

1. **Prometheus label change churn**  
   Changing `name` creates a new time series identity. Acceptable for home dashboard use; document that historical series under old names may appear discontinuous.

2. **Router name empty/unstable**  
   Display algorithm falls back to `unknown` only inside parentheses when alias exists; unaliased empty names remain empty string.

3. **Concurrent writes**  
   v1 assumes single local user; atomic write reduces corruption risk. No multi-writer locking required yet.

4. **Security**  
   Keep bind on `127.0.0.1`. Management UI is local-only in default compose setup.
