function normalizeMac(input) {
  const hex = String(input ?? '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (hex.length !== 12) {
    throw new Error('Invalid MAC');
  }
  return hex.match(/.{2}/g).join(':');
}

function formatDisplayName({ routerName, alias }) {
  const trimmedAlias = String(alias ?? '').trim();
  if (trimmedAlias) {
    return `${trimmedAlias} (${routerName || 'unknown'})`;
  }
  return routerName || '';
}

module.exports = {
  normalizeMac,
  formatDisplayName,
};
