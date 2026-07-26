const fs = require('fs');
const path = require('path');

const LOG_DIR = process.env.CSV_LOG_DIR || path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'exporter.log');
const MAX_BYTES = Number(process.env.CSV_LOG_MAX_BYTES || 5 * 1024 * 1024);

let queue = Promise.resolve();
let ensuredDir = false;

function ensureLogDir() {
    if (ensuredDir) {
        return Promise.resolve();
    }

    return fs.promises.mkdir(LOG_DIR, { recursive: true }).then(() => {
        ensuredDir = true;
    });
}

function csvEscape(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

function formatLine(level, message, extra = {}) {
    const timestamp = new Date().toISOString();
    const fields = [timestamp, level, message];

    for (const [key, val] of Object.entries(extra)) {
        fields.push(`${key}=${csvEscape(val)}`);
    }

    return `${fields.map(csvEscape).join(',')}\n`;
}

async function rotateIfNeeded() {
    try {
        const stats = await fs.promises.stat(LOG_FILE);
        if (stats.size < MAX_BYTES) {
            return;
        }

        const rotated = `${LOG_FILE}.${Date.now()}`;
        await fs.promises.rename(LOG_FILE, rotated);
    } catch (err) {
        if (err && err.code !== 'ENOENT') {
            // Ignore rotation failures so logging stays best-effort.
        }
    }
}

function enqueueWrite(level, message, extra = {}) {
    const line = formatLine(level, message, extra);

    queue = queue
        .then(async () => {
            await ensureLogDir();
            await rotateIfNeeded();
            await fs.promises.appendFile(LOG_FILE, line, 'utf8');
        })
        .catch(() => {
            // Best-effort logging: never break request path.
        });

    return queue;
}

module.exports = {
    info(msg, extra = {}) { return enqueueWrite('INFO', msg, extra); },
    warn(msg, extra = {}) { return enqueueWrite('WARN', msg, extra); },
    error(msg, extra = {}) { return enqueueWrite('ERROR', msg, extra); },
    alert(msg, extra = {}) { return enqueueWrite('ALERT', msg, extra); },
    flush() { return queue; },
};
