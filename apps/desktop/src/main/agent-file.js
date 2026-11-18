/** Keep the last good mtime when a status file is caught mid-write. */
function nextAgentMtime(previous, mtime, parsed) {
  return parsed == null ? previous : mtime;
}

module.exports = { nextAgentMtime };
