/**
 * UI automation for the two behaviours that live outside the DOM.
 *
 * Edge docking and click-through are window behaviours: the page cannot show
 * them, so this drives the real cursor with SendInput-equivalent calls and
 * asks the main process, through its --dev-only channel, what it actually did.
 */
import { execFileSync } from 'node:child_process';

const PORT = process.argv[2] ?? '9343';
const BASE = `http://127.0.0.1:${PORT}`;
const PS1 = new URL('./mouse.ps1', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/^\//, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mouse(cmd, x = 0, y = 0, steps = 1) {
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-cmd', cmd, '-x', String(x), '-y', String(y), '-steps', String(steps)], { stdio: 'pipe' });
}

const targets = await (await fetch(BASE + '/json/list')).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } };
const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise((r) => (ws.onopen = r));
await send('Runtime.enable');
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result?.value;
};
const state = () => evaluate('window.petAPI.debugState()');

const results = [];
function check(name, actual, expected, detail = '') {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ name, ok, actual, expected, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
}

const s0 = await state();
if (!s0) throw new Error('debug channel missing: start the app with --dev');
const { bounds, workArea, size } = s0;
const [savedX, savedY] = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-cmd', 'pos'], { encoding: 'utf8' }).trim().split(',').map(Number);
const ballCx = bounds.x + Math.round(bounds.width / 2);
const ballCy = bounds.y + 46 + Math.round((bounds.height - 46) / 2);

// 1. Click-through: off while the pointer is on the ball.
mouse('move', ballCx, ballCy);
await sleep(500);
check('pointer on ball takes input back', (await state()).clickThrough, false);

// 2. Click-through: on while the pointer is outside the ball but inside the window.
mouse('move', bounds.x + 4, bounds.y + bounds.height - 4);
await sleep(500);
check('pointer off the ball passes clicks through', (await state()).clickThrough, true);

// 3. Edge docking: grab the ball and drag it to the right edge.
mouse('move', ballCx, ballCy);
await sleep(400);
mouse('down');
await sleep(120);
mouse('drag', workArea.width - 2, ballCy, 12);
await sleep(200);
mouse('up');
await sleep(500);
const docked = await state();
check('dragged to the edge -> docked right', docked.docked, 'right');
check('docked window slides past the edge', docked.bounds.x > workArea.width - size, true, `x=${docked.bounds.x} width=${workArea.width}`);

// 4. The drop happens with the cursor on the edge, so the ball must stay put
//    until the pointer has actually left once.
await sleep(500);
check('a fresh dock does not open under the cursor', (await state()).docked, 'right');

// 5. Move away, then come back: now it slides out.
mouse('move', workArea.width - 320, ballCy);
await sleep(400);
mouse('move', workArea.width - 6, ballCy);
await sleep(600);
check('hovering the sliver opens it', (await state()).docked, 'right-open');

// 6. Leaving tucks it away again.
mouse('move', workArea.width - 320, ballCy);
await sleep(600);
check('leaving the sliver tucks it back', (await state()).docked, 'right');

// Restore: undock by opening, drag the ball back to where it was, put the cursor back.
mouse('move', workArea.width - 6, ballCy);
await sleep(600);
mouse('move', workArea.width - 60, ballCy);
await sleep(300);
mouse('down');
await sleep(120);
mouse('drag', bounds.x + Math.round(bounds.width / 2), ballCy, 12);
await sleep(200);
mouse('up');
await sleep(400);
mouse('move', Number.isFinite(savedX) ? savedX : 200, Number.isFinite(savedY) ? savedY : 200);
await sleep(200);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
ws.close();
process.exit(failed.length ? 1 : 0);
