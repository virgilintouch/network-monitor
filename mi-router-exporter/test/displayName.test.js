const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeMac, formatDisplayName } = require('../displayName');

test('normalizeMac uppercases and colon-separates common MAC forms', () => {
  assert.equal(normalizeMac('aa-bb-cc-dd-ee-ff'), 'AA:BB:CC:DD:EE:FF');
  assert.equal(normalizeMac('AABBCCDDEEFF'), 'AA:BB:CC:DD:EE:FF');
});

test('normalizeMac rejects invalid MAC', () => {
  assert.throws(() => normalizeMac('bad'), /Invalid MAC/);
});

test('formatDisplayName uses alias (routerName) when alias present', () => {
  assert.equal(formatDisplayName({ routerName: 'iPhone', alias: '客厅电视' }), '客厅电视 (iPhone)');
});

test('formatDisplayName falls back to unknown inside parentheses when router name empty', () => {
  assert.equal(formatDisplayName({ routerName: '', alias: '客厅电视' }), '客厅电视 (unknown)');
});

test('formatDisplayName returns router name when alias absent', () => {
  assert.equal(formatDisplayName({ routerName: 'iPhone', alias: '' }), 'iPhone');
  assert.equal(formatDisplayName({ routerName: '', alias: '   ' }), '');
});
