const FOUR_PART = /^\d+\.\d+\.\d+\.\d+$/;

export function currentReleaseVersion({ packageVersion, buildInfo }) {
  const fallback = String(packageVersion || '');
  if (
    buildInfo &&
    String(buildInfo.version || '') === fallback &&
    FOUR_PART.test(String(buildInfo.buildVersion || ''))
  ) {
    return String(buildInfo.buildVersion);
  }
  return fallback;
}

export function latestReleaseVersionFromNotes(notes, fallback) {
  const match = String(notes || '').match(/^##\s+v?(\d+\.\d+\.\d+\.\d+)\s*$/m);
  return match ? match[1] : String(fallback || '');
}

/**
 * The release version a generated download link should use.
 *
 * A packaged workspace knows its exact local build. A clean CI checkout does
 * not have build-info.json, so it falls back to the newest four-part release
 * notes rather than the public three-part package version.
 */
export function artifactReleaseVersion({ packageVersion, buildInfo, notes }) {
  const generated = currentReleaseVersion({ packageVersion, buildInfo });
  if (FOUR_PART.test(generated)) return generated;
  return latestReleaseVersionFromNotes(notes, generated);
}

function fourParts(version) {
  const parts = String(version || '').replace(/^v/, '').split('.').map((part) => Number(part) || 0);
  while (parts.length < 4) parts.push(0);
  return parts.slice(0, 4);
}

export function compareReleaseVersions(current, lastTag) {
  const next = fourParts(current);
  const previous = fourParts(lastTag);
  for (let index = 0; index < 4; index += 1) {
    if (next[index] !== previous[index]) return Math.sign(next[index] - previous[index]);
  }
  return 0;
}

export function releaseBumpKind(current, lastTag) {
  const next = fourParts(current);
  const previous = fourParts(lastTag);
  if (next[1] > previous[1]) return 'SERIES';
  if (next[2] > previous[2]) return 'BIG';
  return 'SMALL';
}
