function loginItemOptions(openAtLogin, executable, env = process.env) {
  const launcher = typeof env.EMOJITOT_LAUNCHER === 'string' ? env.EMOJITOT_LAUNCHER.trim() : '';
  return {
    openAtLogin: Boolean(openAtLogin),
    path: launcher || executable,
  };
}

module.exports = { loginItemOptions };
