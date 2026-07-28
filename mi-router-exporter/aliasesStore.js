'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { normalizeMac } = require('./displayName');

function createAliasesStore({ filePath } = {}) {
  if (!filePath) {
    throw new Error('filePath is required');
  }

  const resolvedPath = path.resolve(filePath);

  async function ensureParentDir() {
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  }

  async function load() {
    try {
      const raw = await fs.readFile(resolvedPath, 'utf8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        return {};
      }
      throw err;
    }
  }

  async function writeAtomic(data) {
    await ensureParentDir();
    const tempPath = `${resolvedPath}.${process.pid}.${Date.now()}.tmp`;
    const payload = `${JSON.stringify(data, null, 2)}\n`;
    await fs.writeFile(tempPath, payload, 'utf8');
    await fs.rename(tempPath, resolvedPath);
  }

  async function list() {
    return load();
  }

  async function get(mac) {
    const key = normalizeMac(mac);
    const data = await load();
    return data[key];
  }

  async function setAlias(mac, alias) {
    const key = normalizeMac(mac);
    const trimmed = String(alias ?? '').trim();
    if (!trimmed) {
      throw new Error('Alias must be a non-empty string');
    }

    const data = await load();
    const record = {
      alias: trimmed,
      updatedAt: new Date().toISOString(),
    };
    data[key] = record;
    await writeAtomic(data);
    return record;
  }

  async function deleteAlias(mac) {
    const key = normalizeMac(mac);
    const data = await load();
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      delete data[key];
      await writeAtomic(data);
    }
  }

  return {
    load,
    list,
    get,
    setAlias,
    deleteAlias,
  };
}

module.exports = {
  createAliasesStore,
};
