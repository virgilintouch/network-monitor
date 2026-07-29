const assert = require('node:assert/strict');
const test = require('node:test');
const metrics = require('../metrics');

test('metrics render uses alias display name and keeps router_name', () => {
  const stats = {
    mem: {}, cpu: {}, count: {}, wan: {},
    dev: [{
      mac: 'aa:bb:cc:dd:ee:ff',
      devname: 'iPhone',
      _ip: '192.168.31.10',
      upload: 1, download: 2, upspeed: 3, downspeed: 4,
      maxuploadspeed: 5, maxdownloadspeed: 6, online: 1
    }],
    deviceList: [{
      mac: 'aa:bb:cc:dd:ee:ff',
      name: 'iPhone',
      ip: [{ ip: '192.168.31.10' }],
      online: 1,
      isap: 0,
      authority: { wan: 1 }
    }]
  };

  const aliases = {
    'AA:BB:CC:DD:EE:FF': { alias: '客厅电视', updatedAt: '2026-07-28T01:40:00.000Z' }
  };

  const out = metrics.render(stats, {}, aliases);
  assert.match(out, /mi_router_device_download\{[^}]*name="客厅电视"/);
  assert.match(out, /router_name="iPhone"/);
  assert.match(out, /mi_router_device_info\{[^}]*name="客厅电视"[^}]*router_name="iPhone"/);
});


test('metrics prefer deviceList name over status.devname for same MAC', () => {
  const stats = {
    mem: {}, cpu: {}, count: {}, wan: {},
    dev: [{
      mac: 'aa:bb:cc:dd:ee:ff',
      devname: 'AA:BB:CC:DD:EE:FF',
      _ip: '192.168.31.10',
      upload: 1, download: 2, upspeed: 3, downspeed: 4,
      maxuploadspeed: 5, maxdownloadspeed: 6, online: 1
    }],
    deviceList: [{
      mac: 'AA:BB:CC:DD:EE:FF',
      name: 'iPhone',
      ip: [{ ip: '192.168.31.10' }],
      online: 1,
      isap: 0,
      authority: { wan: 1 }
    }]
  };

  const aliases = {
    'AA:BB:CC:DD:EE:FF': { alias: '客厅电视', updatedAt: '2026-07-28T01:40:00.000Z' }
  };

  const out = metrics.render(stats, {}, aliases);
  assert.match(out, /mi_router_device_downspeed\{[^}]*name="客厅电视"/);
  assert.match(out, /mi_router_device_download\{[^}]*name="客厅电视"/);
  assert.doesNotMatch(out, /mi_router_device_downspeed\{[^}]*name="客厅电视 \(AA:BB:CC:DD:EE:FF\)"/);
  assert.match(out, /mi_router_device_info\{[^}]*name="客厅电视"/);
});
