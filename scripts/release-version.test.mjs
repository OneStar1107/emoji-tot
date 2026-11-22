import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  compareReleaseVersions,
  currentReleaseVersion,
  latestReleaseVersionFromNotes,
  releaseBumpKind,
} from './release-version-lib.mjs';

describe('release version resolution', () => {
  it('uses the generated fourth segment when build-info matches the package version', () => {
    assert.equal(currentReleaseVersion({
      packageVersion: '0.8.18',
      buildInfo: { version: '0.8.18', buildVersion: '0.8.18.13' },
    }), '0.8.18.13');
  });

  it('ignores stale build-info from another public version', () => {
    assert.equal(currentReleaseVersion({
      packageVersion: '0.8.19',
      buildInfo: { version: '0.8.18', buildVersion: '0.8.18.13' },
    }), '0.8.19');
  });

  it('compares all four segments before the tag is created', () => {
    assert.equal(compareReleaseVersions('0.8.18.13', 'v0.8.18'), 1);
    assert.equal(compareReleaseVersions('v0.8.18', '0.8.18.13'), -1);
    assert.equal(compareReleaseVersions('0.8.18.13', 'v0.8.18.13'), 0);
  });

  it('classifies a fourth-segment release as a small fix', () => {
    assert.equal(releaseBumpKind('0.8.18.13', 'v0.8.18'), 'SMALL');
    assert.equal(releaseBumpKind('0.8.19', 'v0.8.18'), 'BIG');
    assert.equal(releaseBumpKind('0.9.0', 'v0.8.18'), 'SERIES');
  });

  it('reads the latest four-part release heading for documentation links', () => {
    assert.equal(latestReleaseVersionFromNotes(`
# Release notes
## 0.8.18.13
- current
## 0.8.18
- previous
`, '0.8.18'), '0.8.18.13');
  });

  it('falls back when release notes have no four-part heading', () => {
    assert.equal(latestReleaseVersionFromNotes('## 0.8.18\n- previous\n', '0.8.18'), '0.8.18');
  });
});
