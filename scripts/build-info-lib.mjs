const MAX_BUILD_NUMBER = 65535;

export function nextBuildInfo({ version, previous = {}, explicitNumber = null }) {
  const publicVersion = String(version ?? '').trim();
  if (!/^\d+\.\d+\.\d+$/.test(publicVersion)) {
    throw new Error('public version must have exactly three numeric segments');
  }

  let number;
  if (explicitNumber !== null && explicitNumber !== undefined && String(explicitNumber).trim() !== '') {
    number = Number(explicitNumber);
  } else if (previous?.version === publicVersion) {
    number = Number(previous.number) + 1;
  } else {
    number = 1;
  }
  if (!Number.isInteger(number) || number < 1 || number > MAX_BUILD_NUMBER) {
    throw new Error('build number must be an integer from 1 to ' + MAX_BUILD_NUMBER);
  }
  return {
    version: publicVersion,
    number,
    buildVersion: publicVersion + '.' + number,
  };
}
