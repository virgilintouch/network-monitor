const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');

const projectRoot = path.resolve(__dirname, '..', '..');

function loadMiRouter(fetchImpl) {
    const originalLoad = Module._load;
    Module._load = function load(request, parent, isMain) {
        if (request === 'node-fetch') return fetchImpl;
        if (request === 'getmac') return { default: () => 'test-device' };
        if (request === './logger' || request === './csvlogger') {
            return { info() {}, warn() {}, error() {}, alert() {} };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    try {
        const modulePath = require.resolve('../MiRouter');
        delete require.cache[modulePath];
        return require(modulePath);
    } finally {
        Module._load = originalLoad;
    }
}

test('compose uses project-local environment and log paths', () => {
    const compose = fs.readFileSync(path.join(projectRoot, 'docker-compose.yml'), 'utf8');
    assert.match(compose, /-\s+\.env/);
    assert.match(compose, /-\s+\.\/logs:\/usr\/src\/app\/logs/);
    assert.doesNotMatch(compose, /\.\.\/\.env|\.\.\/logs/);
});

test('login sends form-urlencoded body and rejects missing token', async () => {
    let seen = null;
    const fetch = async (url, options = {}) => {
        seen = { url, options };
        return {
            ok: true,
            async json() {
                return { code: 401, msg: 'Invalid token' };
            },
        };
    };
    const MiRouter = loadMiRouter(fetch);
    const router = new MiRouter({ password: 'secret', deviceId: 'test-device', retryDelayMs: 0 });
    await assert.rejects(() => router.login(), /Invalid token|Login failed|token/i);
    assert.equal(seen.options.headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.equal(typeof seen.options.body, 'string');
    assert.match(seen.options.body, /username=admin/);
    assert.match(seen.options.body, /password=/);
    assert.match(seen.options.body, /logtype=2/);
    assert.match(seen.options.body, /nonce=/);
    assert.equal(router.token, null);
});

test('login retries transient failures up to three attempts', async () => {
    let attempts = 0;
    const fetch = async () => {
        attempts += 1;
        if (attempts < 3) throw new Error('temporary failure');
        return { ok: true, async json() { return { token: 'token-123' }; } };
    };
    const MiRouter = loadMiRouter(fetch);
    const router = new MiRouter({ password: 'secret', deviceId: 'test-device', retryDelayMs: 0 });
    const result = await router.login();
    assert.equal(attempts, 3);
    assert.equal(result.token, 'token-123');
    assert.equal(router.token, 'token-123');
});

test('status performs the complete status and device-list flow after relogin', async () => {
    const MiRouter = loadMiRouter(async () => { throw new Error('unexpected fetch'); });
    const router = new MiRouter({ password: 'secret', deviceId: 'test-device' });
    router.token = 'expired-token';
    router.tokenExpiry = Date.now() + 60_000;
    let statusCalls = 0;
    let deviceListCalls = 0;
    let loginCalls = 0;
    router.getStatus = async () => {
        statusCalls += 1;
        if (statusCalls === 1) throw new Error('expired session');
        return { dev: [{ mac: 'aa:bb', devname: 'phone' }] };
    };
    router.getDeviceList = async () => {
        deviceListCalls += 1;
        return { list: [{ mac: 'AA:BB', ip: [{ ip: '192.168.31.10' }] }] };
    };
    router.login = async () => {
        loginCalls += 1;
        router.token = 'fresh-token';
    };
    const result = await router.status();
    assert.equal(loginCalls, 1);
    assert.equal(statusCalls, 2);
    assert.equal(deviceListCalls, 1);
    assert.equal(result.dev[0]._ip, '192.168.31.10');
    assert.equal(result.deviceList.length, 1);
});

test('CSV logger avoids synchronous file operations on the request path', () => {
    const source = fs.readFileSync(path.join(projectRoot, 'mi-router-exporter', 'csvlogger.js'), 'utf8');
    assert.doesNotMatch(source, /appendFileSync|readFileSync|writeFileSync|statSync/);
});
