const fetch = require('node-fetch');
const crypto = require('crypto');

const logger = require('./logger');
const csvlog = require('./csvlogger');
const selfmetrics = require('./selfmetrics');
const { getOrCreateDeviceId } = require('./deviceId');

class MiRouter {
    constructor(params) {
        if (!params.password) {
            throw new Error('Password is not provided');
        }

        this.url = params.url || '192.168.31.1';
        this.password = params.password;
        this.publicKey = params.publicKey || 'a2ffa5c9be07488bbb04a3a47d3c5f6a';
        this.deviceId = params.deviceId || getOrCreateDeviceId();
        this.token = null;
        this.tokenExpiry = null;
        this.TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
        this.loginAttempts = 0;
        this.maxLoginAttempts = 3;
        this.retryDelayMs = params.retryDelayMs || 200;
        this.sleep = params.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    }

    static sha1(data) {
        return crypto.createHash('sha1').update(data, 'binary').digest('hex');
    }

    createNonce() {
        const type = 0;
        const time = Math.floor(new Date().getTime() / 1000);
        const random = Math.floor(Math.random() * 10000);
        return [type, this.deviceId, time, random].join('_');
    }

    createPasswordHash(nonce, pwd) {
        return MiRouter.sha1(nonce + MiRouter.sha1(pwd + this.publicKey)).toString();
    }

    needsRefresh() {
        if (!this.token || !this.tokenExpiry) return true;
        return Date.now() >= this.tokenExpiry;
    }

    async login() {
        let lastError;

        for (let attempt = 1; attempt <= this.maxLoginAttempts; attempt++) {
            this.loginAttempts = attempt;
            const nonce = this.createNonce();
            const password = this.createPasswordHash(nonce, this.password);

            try {
                const response = await fetch(`http://${this.url}/cgi-bin/luci/api/xqsystem/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        username: 'admin',
                        password,
                        logtype: '2',
                        nonce,
                    }).toString(),
                    timeout: 15000,
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(`Login failed: ${data.error || response.statusText}`);
                }

                if (!data.token) {
                    throw new Error(`Login failed: ${data.msg || data.error || `code ${data.code}`}`);
                }

                this.token = data.token;
                this.tokenExpiry = Date.now() + this.TOKEN_TTL_MS;
                this.loginAttempts = 0;
                selfmetrics.incrementLoginSuccess();
                logger.info('Login successful');
                csvlog.info('Router login successful', { url: this.url });
                return data;
            } catch (err) {
                lastError = err;
                selfmetrics.incrementLoginFailure();
                logger.error({ err: err.message, attempts: attempt }, 'Login failed');
                csvlog.error('Router login failed', {
                    url: this.url,
                    error: err.message,
                    attempt
                });

                if (attempt >= this.maxLoginAttempts) {
                    csvlog.alert('Router login exhausted retries', {
                        url: this.url,
                        error: err.message
                    });
                    this.token = null;
                    this.tokenExpiry = null;
                    throw err;
                }

                const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
                await this.sleep(delay);
            }
        }

        throw lastError;
    }

    async request(url) {
        try {
            const response = await fetch(url, {
                timeout: 15000,
            });

            if (!response.ok) {
                selfmetrics.incrementApiErrors();
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return response.json();
        } catch (err) {
            if (!String(err.message || '').startsWith('HTTP ')) {
                selfmetrics.incrementApiErrors();
            }
            throw err;
        }
    }

    async getStatus() {
        return this.request(`http://${this.url}/cgi-bin/luci/;stok=${this.token}/api/misystem/status`);
    }

    async getDeviceList() {
        return this.request(`http://${this.url}/cgi-bin/luci/;stok=${this.token}/api/misystem/devicelist`);
    }

    async fetchStatusWithDevices() {
        logger.info('Fetching status...');
        const statusData = await this.getStatus();

        try {
            const deviceListData = await this.getDeviceList();
            const ipMap = {};
            if (deviceListData && deviceListData.list) {
                for (const dev of deviceListData.list) {
                    if (dev.mac && dev.ip && dev.ip.length > 0) {
                        ipMap[dev.mac.toUpperCase()] = dev.ip[0].ip || '';
                    }
                }
            }

            if (statusData.dev) {
                for (const dev of statusData.dev) {
                    dev._ip = ipMap[dev.mac ? dev.mac.toUpperCase() : ''] || '';
                }
            }

            statusData.deviceList = deviceListData.list || [];
        } catch (ipErr) {
            logger.warn({ err: ipErr.message }, 'Could not fetch device list for IPs');
            csvlog.warn('Failed to fetch device list', { error: ipErr.message });
            statusData.deviceList = [];
            if (statusData.dev) {
                for (const dev of statusData.dev) {
                    dev._ip = '';
                }
            }
        }

        return statusData;
    }

    async status() {
        if (this.needsRefresh()) {
            logger.warn('Token missing or expired, logging in.');
            csvlog.warn('Auth token missing or expired, performing login', { url: this.url });
            await this.login();
        }

        try {
            return await this.fetchStatusWithDevices();
        } catch (err) {
            logger.error({ err: err.message }, 'Error fetching status, re-logging in...');
            csvlog.error('Status fetch failed, re-login', { error: err.message });

            this.token = null;
            this.tokenExpiry = null;
            await this.login();

            logger.info('Fetching status after relogin...');
            return this.fetchStatusWithDevices();
        }
    }
}

module.exports = MiRouter;
