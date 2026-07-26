const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_DIR = process.env.DEVICE_ID_DIR || path.join(__dirname, 'logs');
const DEFAULT_FILE = path.join(DEFAULT_DIR, 'device-id');

function resolvePath(filePath) {
    return filePath || process.env.DEVICE_ID_FILE || DEFAULT_FILE;
}

function getOrCreateDeviceId(filePath) {
    const target = resolvePath(filePath);
    try {
        const existing = fs.readFileSync(target, 'utf8').trim();
        if (existing) {
            return existing;
        }
    } catch (err) {
        if (!err || err.code !== 'ENOENT') {
            // Fall through and recreate on unexpected read errors.
        }
    }

    const id = crypto.randomUUID();
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${id}\n`, 'utf8');
    return id;
}

module.exports = {
    getOrCreateDeviceId,
    getDeviceId: getOrCreateDeviceId,
};
