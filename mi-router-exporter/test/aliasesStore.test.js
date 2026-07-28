const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createAliasesStore } = require('../aliasesStore');

async function withTempStore(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aliases-store-'));
  const filePath = path.join(dir, 'device-aliases.json');
  const store = createAliasesStore({ filePath });
  try {
    await run(store, filePath, dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('load returns empty object when file is missing', async () => {
  await withTempStore(async (store, filePath) => {
    await assert.rejects(() => fs.access(filePath), /ENOENT/);
    assert.deepEqual(await store.load(), {});
  });
});

test('setAlias trims alias, normalizes MAC, and writes updatedAt', async () => {
  await withTempStore(async (store, filePath) => {
    const before = Date.now();
    const record = await store.setAlias('aa-bb-cc-dd-ee-ff', '  客厅电视  ');
    const after = Date.now();

    assert.equal(record.alias, '客厅电视');
    assert.match(record.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
    const updatedMs = Date.parse(record.updatedAt);
    assert.ok(updatedMs >= before && updatedMs <= after);

    assert.deepEqual(await store.get('AABBCCDDEEFF'), record);
    assert.deepEqual(await store.list(), {
      'AA:BB:CC:DD:EE:FF': record,
    });

    const onDisk = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.deepEqual(onDisk, {
      'AA:BB:CC:DD:EE:FF': record,
    });
  });
});

test('setAlias rejects empty or whitespace-only alias', async () => {
  await withTempStore(async (store) => {
    await assert.rejects(() => store.setAlias('aa:bb:cc:dd:ee:ff', ''), /empty/i);
    await assert.rejects(() => store.setAlias('aa:bb:cc:dd:ee:ff', '   '), /empty/i);
    assert.deepEqual(await store.load(), {});
  });
});

test('deleteAlias removes alias and is idempotent', async () => {
  await withTempStore(async (store, filePath) => {
    await store.setAlias('aa:bb:cc:dd:ee:ff', '客厅电视');
    await store.deleteAlias('AA-BB-CC-DD-EE-FF');
    assert.equal(await store.get('aa:bb:cc:dd:ee:ff'), undefined);
    assert.deepEqual(await store.load(), {});

    await store.deleteAlias('aa:bb:cc:dd:ee:ff');
    assert.deepEqual(JSON.parse(await fs.readFile(filePath, 'utf8')), {});
  });
});

test('writes are atomic and leave valid final JSON', async () => {
  await withTempStore(async (store, filePath, dir) => {
    await store.setAlias('11:22:33:44:55:66', '路由器');
    await store.setAlias('aa:bb:cc:dd:ee:ff', '客厅电视');

    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    assert.equal(parsed['AA:BB:CC:DD:EE:FF'].alias, '客厅电视');
    assert.equal(parsed['11:22:33:44:55:66'].alias, '路由器');

    const leftovers = (await fs.readdir(dir)).filter((name) => name !== 'device-aliases.json');
    assert.deepEqual(leftovers, []);
  });
});
