require('dotenv').config();
const path = require('node:path');
const express = require('express');

const logger = require('./logger');
const morgan = require('./morgan');
const csvlog = require('./csvlogger');
const metrics = require('./metrics');
const selfmetrics = require('./selfmetrics');
const MiRouter = require('./MiRouter');
const { createAliasesStore } = require('./aliasesStore');
const { createAliasesRouter } = require('./aliasesRoutes');

function createApp(options = {}) {
  const {
    getStatus,
    aliasesStore,
    aliasesFilePath,
    aliasesFile,
    listen = false,
    port = 3030,
    host = '0.0.0.0',
  } = options;
  const resolvedAliasesFilePath = aliasesFilePath || aliasesFile;

  let statusProvider = getStatus;
  if (typeof statusProvider !== 'function') {
    const router = new MiRouter({
      url: process.env.ROUTER_URL,
      password: process.env.ROUTER_PASSWORD,
    });
    statusProvider = () => router.status();
  }

  const store = aliasesStore || createAliasesStore({
    filePath: resolvedAliasesFilePath
      || process.env.ALIASES_FILE
      || path.join(__dirname, 'data', 'device-aliases.json'),
  });

  const server = express();
  if (options.useMorgan !== false) {
    server.use(morgan);
  }
  server.use(express.json());

  server.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  server.use(createAliasesRouter({
    aliasesStore: store,
    getStatus: statusProvider,
  }));

  server.get('/metrics', async (req, res) => {
    const startTime = Date.now();
    try {
      const stats = await statusProvider();
      const durationMs = Date.now() - startTime;
      selfmetrics.recordScrapeSuccess(durationMs / 1000);

      csvlog.info('Stats fetched', {
        devices_total: stats.count?.all || 0,
        devices_online: stats.count?.online || 0,
        wan_downspeed: stats.wan?.downspeed || 0,
        wan_upspeed: stats.wan?.upspeed || 0,
        wan_download: stats.wan?.download || 0,
        wan_upload: stats.wan?.upload || 0,
        duration_ms: durationMs,
      });

      const aliases = await store.load();
      const data = metrics.render(stats, selfmetrics.snapshot(), aliases);
      res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.end(data);
    } catch (err) {
      selfmetrics.incrementScrapeErrors();
      logger.error({ err }, 'Getting stats error');
      csvlog.error('Stats fetch failed', { error: err.message });
      res.status(500).end(err.message);
    }
  });

  server.get('/debug', async (req, res) => {
    if (process.env.ENABLE_DEBUG !== 'true') {
      return res.status(404).end();
    }

    try {
      const stats = await statusProvider();
      const sample = (stats.dev || []).slice(0, 3);
      res.json(sample);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  let listener = null;
  if (listen) {
    listener = server.listen(port, host);
    logger.info(`Server listening to ${host}:${port}, metrics exposed on /metrics endpoint`);
  }

  server.aliasesStore = store;
  server.listener = listener;
  return server;
}

if (require.main === module) {
  createApp({ listen: true });
}

module.exports = {
  createApp,
};
