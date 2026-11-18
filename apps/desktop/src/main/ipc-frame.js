const FRAME = {
  ball: /^file:\/\/.*renderer[\\/]index\.html$/i,
  island: /^file:\/\/.*renderer[\\/]island\.html$/i,
  settings: /^file:\/\/.*renderer[\\/]settings\.html$/i,
};

function frameMatches(role, frame) {
  if (!frame || !FRAME[role]) return false;
  return FRAME[role].test(String(frame).split(/[?#]/, 1)[0]);
}

module.exports = { FRAME, frameMatches };
