const assert = require('node:assert/strict');
const test = require('node:test');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../index');

async function withTempApp(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aliases-api-'));
  const aliasesFile = path.join(dir, 'device-aliases.json');
  const fakeStatus = async () => ({
    dev: [
      {
        mac: 'aa:bb:cc:dd:ee:ff',
        devname: 'iPhone',
        _ip: '192.168.31.10',
        online: 1,
      },
    ],
    deviceList: [
      {
        mac: 'aa:bb:cc:dd:ee:ff',
        name: 'iPhone',
        ip: [{ ip: '192.168.31.10' }],
        online: 1,
      },
    ],
  });

  const app = createApp({
    aliasesFile,
    getStatus: fakeStatus,
    listen: false,
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await run({ baseUrl, aliasesFile });
  } finally {
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function request(baseUrl, method, urlPath, body) {
  const headers = { Connection: 'close' };
  let payload;
  if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(payload);
  }

  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body: payload,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, headers: res.headers, text, json };
}

test('PUT /api/aliases/:mac persists valid alias and returns record', async () => {
  await withTempApp(async ({ baseUrl, aliasesFile }) => {
    const res = await request(baseUrl, 'PUT', '/api/aliases/aa-bb-cc-dd-ee-ff', {
      alias: '  客厅电视  ',
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.alias, '客厅电视');
    assert.match(res.json.updatedAt, /^\d{4}-\d{2}-\d{2}T/);

    const onDisk = JSON.parse(await fs.readFile(aliasesFile, 'utf8'));
    assert.equal(onDisk['AA:BB:CC:DD:EE:FF'].alias, '客厅电视');
  });
});

test('PUT /api/aliases/:mac rejects empty alias with 400', async () => {
  await withTempApp(async ({ baseUrl }) => {
    const res = await request(baseUrl, 'PUT', '/api/aliases/aa:bb:cc:dd:ee:ff', {
      alias: '   ',
    });
    assert.equal(res.status, 400);
  });
});

test('PUT /api/aliases/:mac rejects invalid MAC with 400', async () => {
  await withTempApp(async ({ baseUrl }) => {
    const res = await request(baseUrl, 'PUT', '/api/aliases/not-a-mac', {
      alias: '客厅电视',
    });
    assert.equal(res.status, 400);
  });
});

test('DELETE /api/aliases/:mac removes alias and is idempotent', async () => {
  await withTempApp(async ({ baseUrl, aliasesFile }) => {
    await request(baseUrl, 'PUT', '/api/aliases/aa:bb:cc:dd:ee:ff', {
      alias: '客厅电视',
    });

    let res = await request(baseUrl, 'DELETE', '/api/aliases/AA-BB-CC-DD-EE-FF');
    assert.equal(res.status, 204);
    assert.deepEqual(JSON.parse(await fs.readFile(aliasesFile, 'utf8')), {});

    res = await request(baseUrl, 'DELETE', '/api/aliases/aa:bb:cc:dd:ee:ff');
    assert.equal(res.status, 204);
  });
});

test('GET /api/aliases returns alias map', async () => {
  await withTempApp(async ({ baseUrl }) => {
    await request(baseUrl, 'PUT', '/api/aliases/aa:bb:cc:dd:ee:ff', {
      alias: '客厅电视',
    });
    const res = await request(baseUrl, 'GET', '/api/aliases');
    assert.equal(res.status, 200);
    assert.equal(res.json['AA:BB:CC:DD:EE:FF'].alias, '客厅电视');
  });
});

test('GET /api/devices merges router devices with aliases into displayName', async () => {
  await withTempApp(async ({ baseUrl }) => {
    await request(baseUrl, 'PUT', '/api/aliases/aa:bb:cc:dd:ee:ff', {
      alias: '客厅电视',
    });
    const res = await request(baseUrl, 'GET', '/api/devices');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.json));
    assert.equal(res.json.length, 1);
    assert.equal(res.json[0].mac, 'AA:BB:CC:DD:EE:FF');
    assert.equal(res.json[0].ip, '192.168.31.10');
    assert.equal(res.json[0].online, true);
    assert.equal(res.json[0].routerName, 'iPhone');
    assert.equal(res.json[0].alias, '客厅电视');
    assert.equal(res.json[0].displayName, '客厅电视 (iPhone)');
  });
});

test('GET /aliases returns HTML 200', async () => {
  await withTempApp(async ({ baseUrl }) => {
    const res = await request(baseUrl, 'GET', '/aliases');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /html/i);
    assert.match(res.text, /aliases/i);
  });
});
