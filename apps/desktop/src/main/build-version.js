const { readFileSync } = require('node:fs');
const path = require('node:path');

function resolveBuildVersion(packageVersion, buildInfo) {
  const publicVersion = String(packageVersion ?? '').trim();
  const buildVersion = String(buildInfo?.buildVersion ?? '').trim();
  if (buildInfo?.version !== publicVersion) return publicVersion;
  if (!new RegExp('^' + publicVersion.replace(/\./g, '\\.') + '\\.\\d{1,5}$').test(buildVersion)) {
    return publicVersion;
  }
  return buildVersion;
}

function loadBuildVersion(desktopRoot, packageVersion) {
  try {
    const buildInfo = JSON.parse(readFileSync(path.join(desktopRoot, 'build-info.json'), 'utf8'));
    return resolveBuildVersion(packageVersion, buildInfo);
  } catch {
    return packageVersion;
  }
}

module.exports = { loadBuildVersion, resolveBuildVersion };
