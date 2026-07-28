'use strict';


const path = require('node:path');
const express = require('express');
const { normalizeMac, formatDisplayName } = require('./displayName');

function createAliasesRouter({ aliasesStore, getStatus, aliasesHtmlPath } = {}) {
  if (!aliasesStore) {
    throw new Error('aliasesStore is required');
  }
  if (typeof getStatus !== 'function') {
    throw new Error('getStatus is required');
  }

  const router = express.Router();
  const htmlPath = aliasesHtmlPath || path.join(__dirname, 'public', 'aliases.html');

  router.get('/aliases', (req, res) => {
    res.sendFile(htmlPath);
  });

  router.get('/api/aliases', async (req, res) => {
    try {
      const aliases = await aliasesStore.list();
      res.json(aliases);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/api/aliases/:mac', async (req, res) => {
    let mac;
    try {
      mac = normalizeMac(req.params.mac);
    } catch {
      return res.status(400).json({ error: 'Invalid MAC' });
    }

    const alias = req.body && req.body.alias;
    const trimmed = String(alias ?? '').trim();
    if (!trimmed) {
      return res.status(400).json({ error: 'Alias must be a non-empty string' });
    }

    try {
      const record = await aliasesStore.setAlias(mac, trimmed);
      res.json(record);
    } catch (err) {
      if (/empty/i.test(err.message) || /Invalid MAC/i.test(err.message)) {
        return res.status(400).json({ error: err.message });
      }
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/api/aliases/:mac', async (req, res) => {
    let mac;
    try {
      mac = normalizeMac(req.params.mac);
    } catch {
      return res.status(400).json({ error: 'Invalid MAC' });
    }

    try {
      await aliasesStore.deleteAlias(mac);
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/api/devices', async (req, res) => {
    try {
      const [stats, aliases] = await Promise.all([
        getStatus(),
        aliasesStore.list(),
      ]);
      const deviceList = Array.isArray(stats && stats.deviceList) ? stats.deviceList : [];
      const devices = deviceList.map((device) => {
        const routerName = device.name || device.devname || '';
        let mac = device.mac || '';
        try {
          mac = normalizeMac(mac);
        } catch {
          // keep original mac if invalid
        }
        const record = aliases[mac];
        const alias = record && typeof record === 'object' ? (record.alias || '') : '';
        const ip = Array.isArray(device.ip) && device.ip[0]
          ? (device.ip[0].ip || '')
          : (device._ip || device.ip || '');
        return {
          mac,
          ip,
          online: Number(device.online) === 1 || device.online === true,
          routerName,
          alias,
          displayName: formatDisplayName({ routerName, alias }),
        };
      });
      res.json(devices);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = {
  createAliasesRouter,
};
