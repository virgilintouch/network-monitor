# Device Aliases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users assign custom LAN device display names by MAC via a local `/aliases` page and API, persist them in a mounted JSON file, and show `alias (router_name)` in Prometheus/Grafana.

**Architecture:** Extend `mi-router-exporter` with a pure display-name helper, a JSON alias store, REST endpoints, and a static management page. Metrics rendering will prefer aliases when present, keep existing Grafana `name` usage working, and also export `router_name`.

**Tech Stack:** Node.js 20, Express, Node test runner (`node --test`), Docker Compose, Prometheus/Grafana (consume updated labels only).

## Global Constraints

- Persist aliases in `./data/device-aliases.json` (container path `/usr/src/app/data/device-aliases.json`)
- Management UI lives at `GET /aliases`
- Display format: with alias => `自定义名 (路由器原名)`; without alias => `路由器原名`
- Keep exporter ports bound to `127.0.0.1` in compose
- No SQLite, no router writeback, no protocol/port analytics, no multi-user auth in v1
- Follow TDD: failing test first, then minimal implementation
- Prefer small focused modules over expanding `index.js` / `metrics.js` beyond wiring

## File Map

| File | Responsibility |
|------|----------------|
| `mi-router-exporter/displayName.js` | MAC normalization + display-name formatting pure helpers |
| `mi-router-exporter/aliasesStore.js` | Load/save/delete aliases JSON with atomic writes |
| `mi-router-exporter/aliasesRoutes.js` | Express routes for `/api/devices`, `/api/aliases`, `/api/aliases/:mac` |
| `mi-router-exporter/public/aliases.html` | Minimal management UI |
| `mi-router-exporter/metrics.js` | Apply aliases when rendering Prometheus labels; export `router_name` |
| `mi-router-exporter/index.js` | Wire JSON body parser, static `/aliases`, alias routes, metrics alias lookup |
| `mi-router-exporter/test/displayName.test.js` | Unit tests for helpers |
| `mi-router-exporter/test/aliasesStore.test.js` | Unit tests for persistence |
| `mi-router-exporter/test/aliasesMetrics.test.js` | Metrics label assertions with aliases |
| `mi-router-exporter/test/aliasesApi.test.js` | HTTP API tests |
| `data/.gitkeep` | Ensure data directory exists in repo |
| `.gitignore` | Ignore `data/device-aliases.json` content file |
| `docker-compose.yml` | Mount `./data:/usr/src/app/data` |
| `README.md` / `readme_CN.md` | Document `/aliases` and persistence |

---

### Task 1: Display-name helpers (TDD)

**Files:**
- Create: `mi-router-exporter/displayName.js`
- Create: `mi-router-exporter/test/displayName.test.js`

- [ ] **Step 1: Write the failing test**

```js
const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeMac, formatDisplayName } = require('../displayName');

test('normalizeMac uppercases and colon-separates common MAC forms', () => {
  assert.equal(normalizeMac('aa-bb-cc-dd-ee-ff'), 'AA:BB:CC:DD:EE:FF');
  assert.equal(normalizeMac('AABBCCDDEEFF'), 'AA:BB:CC:DD:EE:FF');
});

test('normalizeMac rejects invalid MAC', () => {
  assert.throws(() => normalizeMac('bad'), /Invalid MAC/);
});

test('formatDisplayName uses alias (routerName) when alias present', () => {
  assert.equal(formatDisplayName({ routerName: 'iPhone', alias: '客厅电视' }), '客厅电视 (iPhone)');
});

test('formatDisplayName falls back to unknown inside parentheses when router name empty', () => {
  assert.equal(formatDisplayName({ routerName: '', alias: '客厅电视' }), '客厅电视 (unknown)');
});

test('formatDisplayName returns router name when alias absent', () => {
  assert.equal(formatDisplayName({ routerName: 'iPhone', alias: '' }), 'iPhone');
  assert.equal(formatDisplayName({ routerName: '', alias: '   ' }), '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mi-router-exporter && node --test test/displayName.test.js`  
Expected: FAIL because `displayName.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement in `displayName.js`:
- `normalizeMac(input)`
- `formatDisplayName({ routerName, alias })`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mi-router-exporter && node --test test/displayName.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mi-router-exporter/displayName.js mi-router-exporter/test/displayName.test.js
git commit -m "$(cat <<'EOF'
feat(exporter): add device display-name helpers

EOF
)"
```

---

### Task 2: Alias JSON store (TDD)

**Files:**
- Create: `mi-router-exporter/aliasesStore.js`
- Create: `mi-router-exporter/test/aliasesStore.test.js`

- [ ] **Step 1: Write the failing test**

Cover:
- missing file => `{}`
- `setAlias(mac, alias)` trims, rejects empty alias, normalizes MAC, writes `updatedAt`
- `deleteAlias(mac)` is idempotent
- atomic write leaves valid JSON even if interrupted conceptually (assert temp+rename path exists / final file valid)
- custom file path via constructor/options for test isolation under `os.tmpdir()`

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mi-router-exporter && node --test test/aliasesStore.test.js`  
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

`aliasesStore.js` API:
- `createAliasesStore({ filePath })`
- `load()`
- `list()`
- `get(mac)`
- `setAlias(mac, alias)`
- `deleteAlias(mac)`

Use `fs.promises`, `mkdir({ recursive: true })`, write temp file then `rename`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mi-router-exporter && node --test test/aliasesStore.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mi-router-exporter/aliasesStore.js mi-router-exporter/test/aliasesStore.test.js
git commit -m "$(cat <<'EOF'
feat(exporter): add JSON device alias store

EOF
)"
```

---

### Task 3: Metrics apply aliases + router_name (TDD)

**Files:**
- Modify: `mi-router-exporter/metrics.js`
- Create: `mi-router-exporter/test/aliasesMetrics.test.js`
- Possibly modify: existing `test/p1.test.js` only if assertions need updating for new `router_name` label

- [ ] **Step 1: Write the failing metrics test**

```js
const assert = require('node:assert/strict');
const test = require('node:test');
const metrics = require('../metrics');

test('metrics render uses alias display name and keeps router_name', () => {
  const stats = {
    mem: {}, cpu: {}, count: {}, wan: {},
    dev: [{
      mac: 'aa:bb:cc:dd:ee:ff',
      devname: 'iPhone',
      _ip: '192.168.31.10',
      upload: 1, download: 2, upspeed: 3, downspeed: 4,
      maxuploadspeed: 5, maxdownloadspeed: 6, online: 1
    }],
    deviceList: [{
      mac: 'aa:bb:cc:dd:ee:ff',
      name: 'iPhone',
      ip: [{ ip: '192.168.31.10' }],
      online: 1,
      isap: 0,
      authority: { wan: 1 }
    }]
  };

  const aliases = {
    'AA:BB:CC:DD:EE:FF': { alias: '客厅电视', updatedAt: '2026-07-28T01:40:00.000Z' }
  };

  const out = metrics.render(stats, {}, aliases);
  assert.match(out, /mi_router_device_download\{[^}]*name="客厅电视 \(iPhone\)"/);
  assert.match(out, /router_name="iPhone"/);
  assert.match(out, /mi_router_device_info\{[^}]*name="客厅电视 \(iPhone\)"[^}]*router_name="iPhone"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mi-router-exporter && node --test test/aliasesMetrics.test.js`  
Expected: FAIL because `render` ignores aliases / no `router_name`.

- [ ] **Step 3: Write minimal implementation**

Update `metrics.js`:
- Accept optional third arg `aliases = {}`
- Build labels with `formatDisplayName` + `router_name`
- Keep unaliased behavior identical to today for `name`

- [ ] **Step 4: Run relevant tests**

Run: `cd mi-router-exporter && node --test test/aliasesMetrics.test.js test/p1.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mi-router-exporter/metrics.js mi-router-exporter/test/aliasesMetrics.test.js mi-router-exporter/test/p1.test.js
git commit -m "$(cat <<'EOF'
feat(exporter): apply device aliases in metrics labels

EOF
)"
```

---

### Task 4: Alias HTTP API + `/aliases` page wiring (TDD)

**Files:**
- Create: `mi-router-exporter/aliasesRoutes.js`
- Create: `mi-router-exporter/public/aliases.html`
- Create: `mi-router-exporter/test/aliasesApi.test.js`
- Modify: `mi-router-exporter/index.js`

- [ ] **Step 1: Write failing API tests**

Use Express app export or lightweight harness:
- `PUT /api/aliases/:mac` with valid body persists and returns record
- empty alias => 400
- invalid MAC => 400
- `DELETE /api/aliases/:mac` removes alias
- `GET /api/aliases` returns map
- `GET /api/devices` merges router devices + aliases into `displayName`
- `GET /aliases` returns HTML 200

For router-dependent `/api/devices`, inject a fake status provider in tests.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mi-router-exporter && node --test test/aliasesApi.test.js`  
Expected: FAIL

- [ ] **Step 3: Implement routes + page + wiring**

In `index.js`:
- `express.json()`
- create aliases store with `process.env.ALIASES_FILE` or default `path.join(__dirname, 'data', 'device-aliases.json')`
- mount `aliasesRoutes`
- `GET /aliases` serves `public/aliases.html`
- `/metrics` loads aliases and passes them into `metrics.render`

`aliases.html` minimal UI:
- fetch `/api/devices`
- show MAC / IP / online / routerName / alias input / displayName preview
- save via `PUT`
- clear via `DELETE`
- no frontend framework

- [ ] **Step 4: Run API tests + full exporter tests**

Run: `cd mi-router-exporter && npm test`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mi-router-exporter/aliasesRoutes.js mi-router-exporter/public/aliases.html mi-router-exporter/index.js mi-router-exporter/test/aliasesApi.test.js
git commit -m "$(cat <<'EOF'
feat(exporter): add device alias API and management page

EOF
)"
```

---

### Task 5: Persistence mount, docs, and manual verification

**Files:**
- Create: `data/.gitkeep`
- Modify: `.gitignore`
- Modify: `docker-compose.yml`
- Modify: `README.md`
- Modify: `readme_CN.md`
- Optionally modify: `docs/ops.md`

- [ ] **Step 1: Add data mount and ignore rules**

`.gitignore` add:
```gitignore
data/device-aliases.json
```

`docker-compose.yml` under `mi-router-exporter.volumes` add:
```yaml
- ./data:/usr/src/app/data
```

Create `data/.gitkeep`.

- [ ] **Step 2: Update docs**

Document in both READMEs:
- open `http://localhost:3030/aliases`
- aliases stored in `./data/device-aliases.json`
- survive `docker compose up -d --build`
- Grafana display format `alias (router_name)`
- note Prometheus series may look discontinuous when names change

- [ ] **Step 3: Rebuild and manually verify**

Run:
```bash
mkdir -p data
docker compose up -d --build mi-router-exporter
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3030/aliases
curl -fsS http://127.0.0.1:3030/api/devices | head
```

Then set one alias via API/UI and confirm `/metrics` contains `name="... (...)"` and `router_name=`.

Rebuild once more and confirm alias still present from `./data/device-aliases.json`.

- [ ] **Step 4: Commit**

```bash
git add data/.gitkeep .gitignore docker-compose.yml README.md readme_CN.md docs/ops.md
git commit -m "$(cat <<'EOF'
docs: document device aliases UI and persistence mount

EOF
)"
```

---

## Implementation Notes

- Default aliases path should work both in Docker (`/usr/src/app/data/...`) and local `npm test` (temp paths in unit tests).
- Keep `/health` unchanged.
- Keep `/debug` gated by `ENABLE_DEBUG`.
- Do not change Prometheus scrape config; label changes flow automatically on next scrape.
- If exporting app factory from `index.js` for tests, avoid double `listen()` during unit tests.

## Done When

- `/aliases` no longer returns `Cannot GET /aliases`
- User can set/clear custom names by MAC
- Metrics/Grafana show `alias (router_name)` when alias exists
- Aliases persist across exporter rebuild via mounted JSON
- All exporter tests pass under TDD-added coverage
