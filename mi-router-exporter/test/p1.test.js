const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const exporterDir = path.join(__dirname, '..');
const rootDir = path.join(exporterDir, '..');

test('metrics module escapes labels, fixes types and exposes self metrics', () => {
    const metrics = require('../metrics');
    const stats = {
        mem: { usage: 0.5 },
        cpu: { load: 0.1 },
        upTime: '123.45',
        temperature: 0,
        count: { all: 2, online: 1 },
        wan: { downspeed: 1, upspeed: 2, download: 3, upload: 4, maxdownloadspeed: 5, maxuploadspeed: 6 },
        dev: [{
            mac: 'AA:BB', devname: 'bad"name\nwith\\slash', _ip: '1.2.3.4',
            upload: 1, download: 2, upspeed: 3, downspeed: 4,
            maxuploadspeed: 5, maxdownloadspeed: 6, online: 1
        }],
        deviceList: [{ mac: 'AA:BB', name: 'x', ip: [{ ip: '1.2.3.4' }], online: 1, isap: 0, authority: { wan: 1 } }]
    };
    const out = metrics.render(stats, {
        loginSuccess: 1, loginFailure: 2, apiErrors: 3, scrapeErrors: 4,
        lastScrapeDurationSeconds: 0.25, lastScrapeSuccessTimestamp: 1700000000
    });

    assert.match(out, /name="bad\\"name\\nwith\\\\slash"/);
    assert.match(out, /# TYPE mi_router_uptime gauge/);
    assert.match(out, /mi_router_uptime 123.45/);
    assert.match(out, /# TYPE mi_router_wan_download counter/);
    assert.match(out, /mi_router_exporter_login_success_total 1/);
    assert.match(out, /mi_router_exporter_login_failure_total 2/);
    assert.match(out, /mi_router_exporter_router_api_errors_total 3/);
    assert.match(out, /mi_router_exporter_scrape_errors_total 4/);
    assert.match(out, /mi_router_exporter_scrape_duration_seconds 0.25/);
    assert.match(out, /mi_router_exporter_last_scrape_success_timestamp_seconds 1700000000/);
});

test('index uses metrics module, tracks self metrics and gates /debug', () => {
    const src = fs.readFileSync(path.join(exporterDir, 'index.js'), 'utf8');
    assert.doesNotMatch(src, /ejs/);
    assert.match(src, /require\('\.\/metrics'\)/);
    assert.match(src, /ENABLE_DEBUG/);
});

test('MiRouter records login and API error self metrics', () => {
    const src = fs.readFileSync(path.join(exporterDir, 'MiRouter.js'), 'utf8');
    assert.match(src, /selfmetrics/);
});

test('compose pins image versions, adds healthchecks and dependencies', () => {
    const compose = fs.readFileSync(path.join(rootDir, 'docker-compose.yml'), 'utf8');
    assert.doesNotMatch(compose, /:latest/);
    const healthchecks = (compose.match(/healthcheck:/g) || []).length;
    assert.ok(healthchecks >= 3, `expected >=3 healthchecks, got ${healthchecks}`);
    assert.match(compose, /depends_on:/);
});

test('Dockerfile runs as non-root with production-only install', () => {
    const df = fs.readFileSync(path.join(exporterDir, 'Dockerfile'), 'utf8');
    assert.match(df, /^USER /m);
    assert.match(df, /--omit=dev/);
    assert.match(df, /HEALTHCHECK/);
});

test('.env.example documents grafana credentials and debug flag', () => {
    const env = fs.readFileSync(path.join(rootDir, '.env.example'), 'utf8');
    assert.match(env, /GRAFANA_ADMIN_USER/);
    assert.match(env, /GRAFANA_ADMIN_PASSWORD/);
    assert.match(env, /ENABLE_DEBUG/);
});
