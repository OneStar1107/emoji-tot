/** Normalise the cached/live device snapshot every consumer sees. */
function classifyDeviceSnapshot(value) {
  const source = value && typeof value === 'object' ? value : {};
  const devices = Array.isArray(source.devices) ? source.devices : [];
  const cachedAt = Number(source.cachedAt) || 0;
  return {
    ...source,
    devices,
    cachedAt,
    scanning: source.scanning === true,
  };
}

module.exports = { classifyDeviceSnapshot };
