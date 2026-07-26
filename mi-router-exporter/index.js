require('dotenv').config();
const express = require('express');

const logger = require('./logger');
const morgan = require('./morgan');
const csvlog = require('./csvlogger');
const metrics = require('./metrics');
const selfmetrics = require('./selfmetrics');
const MiRouter = require('./MiRouter');

const router = new MiRouter({
    url: process.env.ROUTER_URL,
    password: process.env.ROUTER_PASSWORD
});

const server = express();
server.use(morgan);

server.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

server.get('/metrics', async (req, res) => {
    const startTime = Date.now();
    try {
        const stats = await router.status();
        const durationMs = Date.now() - startTime;
        selfmetrics.recordScrapeSuccess(durationMs / 1000);

        csvlog.info('Stats fetched', {
            devices_total: stats.count?.all || 0,
            devices_online: stats.count?.online || 0,
            wan_downspeed: stats.wan?.downspeed || 0,
            wan_upspeed: stats.wan?.upspeed || 0,
            wan_download: stats.wan?.download || 0,
            wan_upload: stats.wan?.upload || 0,
            duration_ms: durationMs
        });

        const data = metrics.render(stats, selfmetrics.snapshot());
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
        const stats = await router.status();
        const sample = (stats.dev || []).slice(0, 3);
        res.json(sample);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const port = 3030;
const host = '0.0.0.0';
logger.info(`Server listening to ${host}:${port}, metrics exposed on /metrics endpoint`);
server.listen(port, host);
