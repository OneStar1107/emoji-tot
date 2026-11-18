import { spawn } from 'node:child_process';
import { resolveElectronBinary } from './electron-runtime.mjs';

const executable = resolveElectronBinary();
const child = spawn(executable, process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
  windowsHide: false,
});

let closed = false;
child.on('close', (code, signal) => {
  closed = true;
  if (code === null) {
    console.error(executable, 'exited with signal', signal);
    process.exit(1);
  }
  process.exit(code);
});

for (const signal of ['SIGINT', 'SIGTERM', 'SIGUSR2']) {
  process.on(signal, () => {
    if (!closed) child.kill(signal);
  });
}
