/**
 * AI account balances.
 *
 * Keys never live in prefs.json: the encrypted blob goes to secrets.bin through
 * Electron's safeStorage (DPAPI on Windows), and prefs only keeps names. The
 * balance request runs in a child process with the key in its environment,
 * because argv is readable by every process on the machine.
 */
const { execFile } = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');
const { readJson, writeJson, userDir, readPrefs } = require('../paths');
const { encrypt, decrypt } = require('../secrets');
const { notify } = require('./notify');

const SCRIPT = path.join(__dirname, 'quota.ps1');
const KEY_VAR = 'EMOJITOT_DEEPSEEK_KEY';
let lowBalanceWarned = false;

let accounts = [];
let current = null;
let last = null;
let timer = null;
const listeners = new Set();

const secretsFile = () => path.join(userDir(), 'secrets.bin');

function load() {
  const raw = readJson(secretsFile(), null);
  accounts = Array.isArray(raw?.accounts) ? raw.accounts : [];
  current = raw?.current ?? accounts[0]?.id ?? null;
  if (current && !accounts.some((account) => account.id === current)) current = accounts[0]?.id ?? null;
}

function save() {
  writeJson(secretsFile(), { accounts, current });
}

function snapshot() {
  return {
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      provider: account.provider ?? 'deepseek',
      current: account.id === current,
    })),
    current,
    last,
  };
}

function emit() {
  const value = snapshot();
  for (const fn of listeners) {
    try {
      fn(value);
    } catch {
      // ignore
    }
  }
}

function fetchBalance(key) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-KeyVar', KEY_VAR],
      { windowsHide: true, timeout: 20000, env: { ...process.env, [KEY_VAR]: key } },
      (error, stdout) => {
        if (error) return resolve(null);
        const text = String(stdout).trim();
        if (!text || text === 'null') return resolve(null);
        try {
          resolve(JSON.parse(text));
        } catch {
          resolve(null);
        }
      },
    );
  });
}

async function refresh() {
  const account = accounts.find((entry) => entry.id === current);
  if (!account) {
    last = null;
    emit();
    return null;
  }
  const key = decrypt(account.secret ?? '');
  if (!key) {
    last = { accountId: account.id, error: '密钥无法读取', at: Date.now() };
    emit();
    return last;
  }
  const data = await fetchBalance(key);
  if (!data) {
    last = { accountId: account.id, error: '查询失败', at: Date.now() };
    emit();
    return last;
  }
  const info = (data.balance_infos ?? [])[0] ?? {};
  last = {
    accountId: account.id,
    name: account.name,
    available: Boolean(data.is_available),
    currency: info.currency ?? 'CNY',
    total: info.total_balance ?? '0.00',
    granted: info.granted_balance ?? '0.00',
    topped: info.topped_up_balance ?? '0.00',
    at: Date.now(),
  };
  /*
   * Warn once when the balance crosses below the threshold, and re-arm when it
   * comes back up. Warning on every refresh would turn a useful reminder into
   * a metronome.
   */
  const prefs = readPrefs();
  if (prefs.quota?.alert !== false) {
    const threshold = Number(prefs.quota?.threshold) || 5;
    const total = Number(last.total);
    if (Number.isFinite(total) && total < threshold) {
      if (!lowBalanceWarned) {
        lowBalanceWarned = true;
        notify('AI 额度偏低', `${account.name} 余额 ¥${last.total}，低于 ¥${threshold}`);
      }
    } else {
      lowBalanceWarned = false;
    }
  }
  emit();
  return last;
}

/** The refresh cadence comes from settings, not a constant. */
function intervalMs() {
  const prefs = readPrefs();
  return Math.max(5, Number(prefs.quota?.intervalMin) || 15) * 60 * 1000;
}

function reschedule() {
  clearInterval(timer);
  timer = setInterval(refresh, intervalMs());
}

function add(name, key) {
  const label = String(name ?? '').trim().slice(0, 40) || 'DeepSeek';
  const secret = String(key ?? '').trim();
  if (!secret) return { ok: false, error: '密钥不能为空' };
  const account = {
    id: crypto.randomBytes(4).toString('hex'),
    name: label,
    provider: 'deepseek',
    secret: encrypt(secret),
    createdAt: Date.now(),
  };
  accounts.push(account);
  current = account.id;
  save();
  emit();
  refresh();
  return { ok: true, id: account.id };
}

function remove(id) {
  accounts = accounts.filter((account) => account.id !== id);
  if (current === id) current = accounts[0]?.id ?? null;
  save();
  emit();
  refresh();
  return { ok: true };
}

function select(id) {
  if (!accounts.some((account) => account.id === id)) return { ok: false };
  current = id;
  save();
  emit();
  refresh();
  return { ok: true };
}

function startService() {
  load();
  emit();
  // A short delay keeps app start snappy; the balance is not needed to paint.
  setTimeout(refresh, 2500);
  reschedule();
}

function stopService() {
  clearInterval(timer);
  timer = null;
}

function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

module.exports = { startService, stopService, onChange, snapshot, refresh, add, remove, select, reschedule };
