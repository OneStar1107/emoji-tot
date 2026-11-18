/** Schedule work once and return a function that cancels it. */
function defer(fn, ms, setTimer = setTimeout, clearTimer = clearTimeout) {
  const handle = setTimer(fn, ms);
  handle?.unref?.();
  return () => clearTimer(handle);
}

module.exports = { defer };
