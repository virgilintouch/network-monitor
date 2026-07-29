const { normalizeMac, formatDisplayName } = require('./displayName');

function escapeLabelValue(value) {
    return String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/"/g, '\\"');
}

function metricValue(value) {
    const num = Number(value);
    return Number.isFinite(num) ? String(num) : '0';
}

function lookupAlias(aliases, mac) {
    if (!aliases || typeof aliases !== 'object') {
        return '';
    }
    try {
        const key = normalizeMac(mac);
        const record = aliases[key];
        return record && typeof record === 'object' ? record.alias : '';
    } catch {
        return '';
    }
}

function deviceLabels(device, aliases = {}, routerNameByMac = {}) {
    let macKey = '';
    try {
        macKey = normalizeMac(device.mac || '');
    } catch {
        macKey = '';
    }
    const routerName = (macKey ? routerNameByMac[macKey] : '') || device.devname || device.name || '';
    const displayName = formatDisplayName({
        routerName,
        alias: lookupAlias(aliases, device.mac),
    });
    return `mac="${escapeLabelValue(device.mac || '')}",name="${escapeLabelValue(displayName)}",ip="${escapeLabelValue(device._ip || '')}",router_name="${escapeLabelValue(routerName)}"`;
}

function renderDeviceMetric(name, help, type, devices, field, aliases = {}, routerNameByMac = {}) {
    const lines = [
        `# HELP ${name} ${help}`,
        `# TYPE ${name} ${type}`,
    ];
    for (const device of devices) {
        lines.push(`${name}{${deviceLabels(device, aliases, routerNameByMac)}} ${metricValue(device[field])}`);
    }
    return lines.join('\n');
}

function render(stats = {}, self = {}, aliases = {}) {
    const devices = Array.isArray(stats.dev) ? stats.dev : [];
    const deviceList = Array.isArray(stats.deviceList) ? stats.deviceList : [];
    const mem = stats.mem || {};
    const cpu = stats.cpu || {};
    const count = stats.count || {};
    const wan = stats.wan || {};

    const routerNameByMac = {};
    for (const device of deviceList) {
        let macKey = '';
        try {
            macKey = normalizeMac(device.mac || '');
        } catch {
            macKey = '';
        }
        if (!macKey) continue;
        const routerName = device.name || device.devname || '';
        if (routerName) {
            routerNameByMac[macKey] = routerName;
        }
    }

    const sections = [
        [
            '# HELP mi_router_memory_usage Router memory usage',
            '# TYPE mi_router_memory_usage gauge',
            `mi_router_memory_usage ${metricValue(mem.usage)}`,
        ].join('\n'),
        [
            '# HELP mi_router_cpu_usage Router CPU usage',
            '# TYPE mi_router_cpu_usage gauge',
            `mi_router_cpu_usage ${metricValue(cpu.load)}`,
        ].join('\n'),
        [
            '# HELP mi_router_uptime Router uptime',
            '# TYPE mi_router_uptime gauge',
            `mi_router_uptime ${metricValue(stats.upTime)}`,
        ].join('\n'),
        [
            '# HELP mi_router_temperature Router temperature',
            '# TYPE mi_router_temperature gauge',
            `mi_router_temperature ${metricValue(stats.temperature)}`,
        ].join('\n'),
        [
            '# HELP mi_router_devices_total Router devices total',
            '# TYPE mi_router_devices_total gauge',
            `mi_router_devices_total ${metricValue(count.all)}`,
        ].join('\n'),
        [
            '# HELP mi_router_devices_online Router devices online',
            '# TYPE mi_router_devices_online gauge',
            `mi_router_devices_online ${metricValue(count.online)}`,
        ].join('\n'),
        [
            '# HELP mi_router_wan_downspeed Router WAN downspeed',
            '# TYPE mi_router_wan_downspeed gauge',
            `mi_router_wan_downspeed ${metricValue(wan.downspeed)}`,
        ].join('\n'),
        [
            '# HELP mi_router_wan_upspeed Router WAN upspeed',
            '# TYPE mi_router_wan_upspeed gauge',
            `mi_router_wan_upspeed ${metricValue(wan.upspeed)}`,
        ].join('\n'),
        [
            '# HELP mi_router_wan_download Router WAN download',
            '# TYPE mi_router_wan_download counter',
            `mi_router_wan_download ${metricValue(wan.download)}`,
        ].join('\n'),
        [
            '# HELP mi_router_wan_upload Router WAN upload',
            '# TYPE mi_router_wan_upload counter',
            `mi_router_wan_upload ${metricValue(wan.upload)}`,
        ].join('\n'),
        [
            '# HELP mi_router_wan_max_downspeed Router WAN max download speed',
            '# TYPE mi_router_wan_max_downspeed gauge',
            `mi_router_wan_max_downspeed ${metricValue(wan.maxdownloadspeed)}`,
        ].join('\n'),
        [
            '# HELP mi_router_wan_max_upspeed Router WAN max upload speed',
            '# TYPE mi_router_wan_max_upspeed gauge',
            `mi_router_wan_max_upspeed ${metricValue(wan.maxuploadspeed)}`,
        ].join('\n'),
        // Keep legacy gauge names for backward compatibility.
        renderDeviceMetric('mi_router_device_upload', 'Router device upload', 'gauge', devices, 'upload', aliases, routerNameByMac),
        renderDeviceMetric('mi_router_device_download', 'Router device download', 'gauge', devices, 'download', aliases, routerNameByMac),
        // Canonical counter names used by increase()/rate() queries.
        renderDeviceMetric('mi_router_device_upload_total', 'Router device upload total', 'counter', devices, 'upload', aliases, routerNameByMac),
        renderDeviceMetric('mi_router_device_download_total', 'Router device download total', 'counter', devices, 'download', aliases, routerNameByMac),
        renderDeviceMetric('mi_router_device_upspeed', 'Router device upspeed', 'gauge', devices, 'upspeed', aliases, routerNameByMac),
        renderDeviceMetric('mi_router_device_downspeed', 'Router device downspeed', 'gauge', devices, 'downspeed', aliases, routerNameByMac),
        renderDeviceMetric('mi_router_device_max_upspeed', 'Router device max upload speed', 'gauge', devices, 'maxuploadspeed', aliases, routerNameByMac),
        renderDeviceMetric('mi_router_device_max_downspeed', 'Router device max download speed', 'gauge', devices, 'maxdownloadspeed', aliases, routerNameByMac),
        renderDeviceMetric('mi_router_device_online', 'Router device online', 'gauge', devices, 'online', aliases, routerNameByMac),
    ];

    const infoLines = [
        '# HELP mi_router_device_info Full device list info',
        '# TYPE mi_router_device_info gauge',
    ];
    for (const device of deviceList) {
        const ip = device.ip && device.ip.length > 0 ? device.ip[0].ip : '';
        const authorityWan = device.authority && device.authority.wan;
        const routerName = device.name || '';
        const displayName = formatDisplayName({
            routerName,
            alias: lookupAlias(aliases, device.mac),
        });
        infoLines.push(
            `mi_router_device_info{mac="${escapeLabelValue(device.mac || '')}",name="${escapeLabelValue(displayName)}",ip="${escapeLabelValue(ip || '')}",online="${escapeLabelValue(device.online)}",isap="${escapeLabelValue(device.isap)}",authority_wan="${escapeLabelValue(authorityWan)}",router_name="${escapeLabelValue(routerName)}"} 1`
        );
    }
    sections.push(infoLines.join('\n'));

    sections.push([
        '# HELP mi_router_exporter_login_success_total Successful router logins',
        '# TYPE mi_router_exporter_login_success_total counter',
        `mi_router_exporter_login_success_total ${metricValue(self.loginSuccess)}`,
    ].join('\n'));
    sections.push([
        '# HELP mi_router_exporter_login_failure_total Failed router logins',
        '# TYPE mi_router_exporter_login_failure_total counter',
        `mi_router_exporter_login_failure_total ${metricValue(self.loginFailure)}`,
    ].join('\n'));
    sections.push([
        '# HELP mi_router_exporter_router_api_errors_total Router API errors',
        '# TYPE mi_router_exporter_router_api_errors_total counter',
        `mi_router_exporter_router_api_errors_total ${metricValue(self.apiErrors)}`,
    ].join('\n'));
    sections.push([
        '# HELP mi_router_exporter_scrape_errors_total Metrics scrape errors',
        '# TYPE mi_router_exporter_scrape_errors_total counter',
        `mi_router_exporter_scrape_errors_total ${metricValue(self.scrapeErrors)}`,
    ].join('\n'));
    sections.push([
        '# HELP mi_router_exporter_scrape_duration_seconds Last scrape duration in seconds',
        '# TYPE mi_router_exporter_scrape_duration_seconds gauge',
        `mi_router_exporter_scrape_duration_seconds ${metricValue(self.lastScrapeDurationSeconds)}`,
    ].join('\n'));
    sections.push([
        '# HELP mi_router_exporter_last_scrape_success_timestamp_seconds Unix timestamp of last successful scrape',
        '# TYPE mi_router_exporter_last_scrape_success_timestamp_seconds gauge',
        `mi_router_exporter_last_scrape_success_timestamp_seconds ${metricValue(self.lastScrapeSuccessTimestamp)}`,
    ].join('\n'));

    return `${sections.join('\n\n')}\n`;
}

module.exports = {
    escapeLabelValue,
    render,
};
