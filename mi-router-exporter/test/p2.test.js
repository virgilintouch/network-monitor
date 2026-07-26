const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');

const exporterDir = path.join(__dirname, '..');
const rootDir = path.join(exporterDir, '..');

test('compose hardens Grafana exposure by default', () => {
    const compose = fs.readFileSync(path.join(rootDir, 'docker-compose.yml'), 'utf8');
    assert.match(compose, /GF_AUTH_ANONYMOUS_ENABLED=\$\{GRAFANA_ANONYMOUS_ENABLED:-false\}/);
    assert.match(compose, /"127\.0\.0\.1:3344:3000"/);
    assert.match(compose, /"127\.0\.0\.1:9090:9090"/);
    assert.match(compose, /"127\.0\.0\.1:3030:3030"/);
});

test('env example documents Grafana anonymous access toggle', () => {
    const env = fs.readFileSync(path.join(rootDir, '.env.example'), 'utf8');
    assert.match(env, /GRAFANA_ANONYMOUS_ENABLED=false/);
});

test('deviceId persists a stable identifier across loads', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'device-id-'));
    process.env.DEVICE_ID_FILE = path.join(tmp, 'device-id');
    const modulePath = require.resolve('../deviceId');
    delete require.cache[modulePath];
    const first = require('../deviceId').getDeviceId();
    delete require.cache[modulePath];
    const second = require('../deviceId').getDeviceId();
    assert.equal(first, second);
    assert.match(first, /^[0-9a-f-]{36}$/i);
    assert.equal(fs.readFileSync(process.env.DEVICE_ID_FILE, 'utf8').trim(), first);
});

test('MiRouter uses deviceId helper and package no longer depends on getmac', () => {
    const routerSrc = fs.readFileSync(path.join(exporterDir, 'MiRouter.js'), 'utf8');
    const pkg = JSON.parse(fs.readFileSync(path.join(exporterDir, 'package.json'), 'utf8'));
    assert.match(routerSrc, /require\('\.\/deviceId'\)/);
    assert.doesNotMatch(routerSrc, /getmac/);
    assert.equal(pkg.dependencies.getmac, undefined);
});

test('password hash is deterministic for the same nonce and password', () => {
    const originalLoad = Module._load;
    Module._load = function load(request, parent, isMain) {
        if (request === 'node-fetch') return async () => ({ ok: true, async json() { return { token: 'x' }; } });
        if (request === './logger' || request === './csvlogger' || request === './selfmetrics' || request === './deviceId') {
            return {
                info() {}, warn() {}, error() {}, alert() {},
                snapshot() { return {}; },
                incrementLoginSuccess() {},
                incrementLoginFailure() {},
                incrementApiErrors() {},
                getDeviceId() { return 'fixed-device-id'; },
            };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    try {
        const modulePath = require.resolve('../MiRouter');
        delete require.cache[modulePath];
        const MiRouter = require('../MiRouter');
        const router = new MiRouter({ password: 'secret', deviceId: 'fixed-device-id', publicKey: 'pub' });
        const one = router.createPasswordHash('nonce-1', 'secret');
        const two = router.createPasswordHash('nonce-1', 'secret');
        const other = router.createPasswordHash('nonce-2', 'secret');
        assert.equal(one, two);
        assert.notEqual(one, other);
        assert.match(one, /^[0-9a-f]{40}$/);
    } finally {
        Module._load = originalLoad;
    }
});

test('README documents hardened local access and current metrics behavior', () => {
    const readme = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
    assert.match(readme, /127\.0\.0\.1:3344|localhost:3344/);
    assert.match(readme, /ENABLE_DEBUG/);
    assert.match(readme, /mi_router_exporter_/);
    assert.match(readme, /GRAFANA_ANONYMOUS_ENABLED/);
});

test('stale planning docs are archived or removed from the project root', () => {
    assert.equal(fs.existsSync(path.join(rootDir, 'implementation_plan.md')), false);
    assert.equal(fs.existsSync(path.join(rootDir, 'agent-handover.md')), false);
    const docsDir = path.join(rootDir, 'docs');
    assert.ok(fs.existsSync(docsDir));
    const files = fs.readdirSync(docsDir);
    assert.ok(files.some((name) => name.includes('ops') || name.includes('history')));
});

test('logger emits structured JSON without Bunyan', () => {
    const loggerPath = require.resolve('../logger');
    const originalLog = console.log;
    const originalError = console.error;
    const originalLogLevel = process.env.LOGLEVEL;
    const lines = [];

    console.log = (line) => lines.push(line);
    console.error = (line) => lines.push(line);
    process.env.LOGLEVEL = 'info';
    delete require.cache[loggerPath];

    try {
        const logger = require('../logger');
        logger.info({ router: '192.168.31.1' }, 'Router login successful');

        assert.equal(lines.length, 1);
        assert.deepEqual(JSON.parse(lines[0]), {
            name: 'mi-router-exporter',
            level: 'info',
            msg: 'Router login successful',
            router: '192.168.31.1',
        });

        const packageInfo = JSON.parse(fs.readFileSync(path.join(exporterDir, 'package.json'), 'utf8'));
        assert.equal(packageInfo.dependencies.bunyan, undefined);
    } finally {
        console.log = originalLog;
        console.error = originalError;
        if (originalLogLevel === undefined) {
            delete process.env.LOGLEVEL;
        } else {
            process.env.LOGLEVEL = originalLogLevel;
        }
        delete require.cache[loggerPath];
    }
});
