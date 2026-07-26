# Network Monitor - Agent Handover

## Current Status

- **Grafana**: Running (was restarting due to macOS Docker bind mount deadlock, recovered after restart)
- **Prometheus**: Running
- **mi-router-exporter**: Running (newly rebuilt with CSV logging)

## What Was Being Worked On

Adding a CSV log file to track router exporter activity (warn/alert/error/info levels).

## Completed Changes

### 1. New file: `mi-router-exporter/csvlogger.js`
- Writes CSV logs to `./logs/exporter.log` (relative to `__dirname`, i.e. `/usr/src/app/logs/`)
- Format: `timestamp,level,message,key=value,...`
- Max 10,000 lines, auto-trims oldest when exceeded
- Exports: `info()`, `warn()`, `error()`, `alert()`

### 2. Modified: `mi-router-exporter/index.js`
- Added `csvlog` import
- On successful `/metrics` fetch: logs `info` with device count, WAN speeds, duration
- On failed `/metrics` fetch: logs `error` with error message

### 3. Modified: `mi-router-exporter/MiRouter.js`
- Added `csvlog` import
- Login success → `info`
- Login failure → `error` (with retry count)
- Login retry exhausted → `alert`
- Status fetch failure → `error`
- Device list fetch failure → `warn`
- No token → `warn`

### 4. Modified: `docker-compose.yml`
- Added `volumes: - ../logs:/usr/src/app/logs` to `mi-router-exporter` service

## Still Needed

1. **Force rebuild**: Run `docker compose up -d --force-recreate mi-router-exporter` to ensure new code is in the running container
2. **Test**: After rebuild, wait ~30s for Prometheus scrape, then check:
   - Host: `cat logs/exporter.log`
   - Expected CSV format: `2026-07-19T17:46:54.703Z,INFO,Stats fetched,devices_total=208,...`
3. **Verify** the log file appears in the host `logs/` directory (mapped from container)

## Key Files

| File | Path |
|------|------|
| CSV Logger | `mi-router-exporter/csvlogger.js` |
| Main Entry | `mi-router-exporter/index.js` |
| Router Class | `mi-router-exporter/MiRouter.js` |
| Docker Config | `docker-compose.yml` |
| Log Output | `logs/exporter.log` |

## Notes

- Old container had a path bug: `path.join(__dirname, '..', '..', 'logs')` resolved to `/usr/logs`. Fixed to `path.join(__dirname, 'logs')` → `/usr/src/app/logs`.
- `csvlogger.js` creates the `logs/` directory automatically if it doesn't exist.
- Only INFO/WARN/ERROR/ALERT are logged (DEBUG excluded).
- Prometheus scrape interval is 30s, expect ~2 log entries per minute (one per successful scrape).
