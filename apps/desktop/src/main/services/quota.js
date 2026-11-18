/**
 * AI account balances.
 *
 * Keys never live in prefs.json: the encrypted blob goes to secrets.bin through
 * Electron's safeStorage (DPAPI on Windows), and prefs only keeps names. The
 * balance request runs in a child process with the key in its environment,
 * because argv is readable by every process on the machine.
 */
const platform = require('../platform');
const path = require('node:path');
const crypto = require('node:crypto');
const { readJson, writeJson, userDir, readPrefs, scriptFile } = require('../paths');
const { encrypt, decrypt } = require('../secrets');
const { notify } = require('./notify');

const SCRIPT = scriptFile('quota.ps1');
const KEY_VAR = 'EMOJITOT_QUOTA_KEY';

/** Providers this module can read a balance from. */
const PROVIDERS = ['deepseek', 'moonshot', 'siliconflow', 'openrouter'];
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

async function fetchBalance(key, provider = 'deepseek') {
  const result = await platform.runPowerShell(
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-KeyVar', KEY_VAR, '-Provider', provider],
    { timeout: 20000, env: { ...process.env, [KEY_VAR]: key } },
  );
  if (!result.ok) return null;
  const text = result.stdout.trim();
  if (!text || text === 'null') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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
  const data = await fetchBalance(key, account.provider ?? 'deepseek');
  if (!data) {
    last = { accountId: account.id, error: '查询失败', at: Date.now() };
    emit();
    return last;
  }
  last = {
    accountId: account.id,
    name: account.name,
    provider: data.provider ?? account.provider ?? 'deepseek',
    available: Boolean(data.available),
    currency: data.currency ?? 'CNY',
    total: data.total ?? '0.00',
    granted: data.granted ?? '0.00',
    topped: data.topped ?? '0.00',
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

function add(name, key, provider = 'deepseek') {
  const label = String(name ?? '').trim().slice(0, 40) || 'DeepSeek';
  const secret = String(key ?? '').trim();
  const chosen = PROVIDERS.includes(provider) ? provider : 'deepseek';
  if (!secret) return { ok: false, error: '密钥不能为空' };
  const account = {
    id: crypto.randomBytes(4).toString('hex'),
    name: label,
    provider: chosen,
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