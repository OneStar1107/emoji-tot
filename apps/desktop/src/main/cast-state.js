/**
 * The one cast-id normalizer.
 *
 * Preferences are user-editable and can outlive a renamed or removed cast
 * member. Every entry point therefore resolves the id the same way: a known
 * member stays as-is, while empty, malformed and unknown values fall back to
 * Tot. Keeping this pure makes the rule testable without Electron.
 */

const DEFAULT_CAST = 'tot';

function normalizeCastId(value, availableIds = []) {
  const id = typeof value === 'string' ? value.trim() : '';
  if (id === DEFAULT_CAST) return DEFAULT_CAST;
  if (!Array.isArray(availableIds) || availableIds.length === 0) return DEFAULT_CAST;
  return availableIds.includes(id) ? id : DEFAULT_CAST;
}

module.exports = { DEFAULT_CAST, normalizeCastId };
