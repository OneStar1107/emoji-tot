/**
 * Mail: unread summaries and verification codes, from IMAP.
 *
 * Accounts are stored as {address, host, user, secret} where only the secret is
 * encrypted. A refresh opens one connection per account, reads the newest
 * messages with a bounded body prefix, and closes it — no IDLE, no long-lived
 * connection to keep alive across sleep and network changes.
 *
 * The provider table is data, so adding one is a row.
 */
const crypto = require('node:crypto');
const { readJson, writeJson, userDir } = require('../paths');
const { encrypt, decrypt } = require('../secrets');
const calendar = require('./calendar');

const PROVIDERS = {
  '163': { label: '163 邮箱', host: 'imap.163.com', port: 993, secure: true },
  qq: { label: 'QQ 邮箱', host: 'imap.qq.com', port: 993, secure: true },
  gmail: { label: 'Gmail', host: 'imap.gmail.com', port: 993, secure: true },
  outlook: { label: 'Outlook', host: 'outlook.office365.com', port: 993, secure: true },
  custom: { label: '自定义 IMAP', host: '', port: 993, secure: true },
};

const accountsFile = () => require('node:path').join(userDir(), 'mail.json');
const DEFAULT_LIMIT = 10;
const REPEAT_LOCK_MS = 60 * 1000;

let accounts = [];
let messages = [];
let syncing = false;
let lastError = '';
let lastSync = 0;
let timer = null;
let lastAttempt = 0;
const listeners = new Set();

function load() {
  const raw = readJson(accountsFile(), null);
  accounts = Array.isArray(raw?.accounts) ? raw.accounts : [];
  messages = Array.isArray(raw?.messages) ? raw.messages : [];
  lastSync = Number(raw?.lastSync) || 0;
}

function save() {
  writeJson(accountsFile(), { accounts, messages, lastSync });
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

/** RFC 2047 encoded-word decoder: =?charset?B|Q?data?= */
function decodeHeader(value) {
  if (!value) return '';
  return String(value).replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_match, charset, encoding, data) => {
    try {
      if (encoding.toUpperCase() === 'B') {
        const buffer = Buffer.from(data, 'base64');
        return new TextDecoder(charset || 'utf-8', { fatal: false }).decode(buffer);
      }
      const text = data
        .replace(/_/g, ' ')
        .replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
      return text;
    } catch {
      return data;
    }
  });
}

/** Pick the first address out of an envelope address list. */
function firstAddress(list) {
  const entry = Array.isArray(list) ? list[0] : null;
  if (!entry) return { name: '', address: '' };
  return {
    name: decodeHeader(entry.name ?? ''),
    address: [entry.mailbox, entry.host].filter(Boolean).join('@'),
  };
}

/** Strip tags and collapse whitespace, so a code in HTML is findable. */
function plainPreview(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/\r?\n[^\r\n]*:.*?(?=\r?\n\r?\n)/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Find a verification code: labelled, or a lone 4-8 digit run near "code". */
function extractCode(text) {
  if (!text) return '';
  const labelled = /(?:验证码|校验码|动态码|verification\s*code|login\s*code|your\s*code|code)[^0-9]{0,24}(\d{4,8})/i.exec(text);
  if (labelled) return labelled[1];
  const bare = /(?:^|\s)(\d{6})(?:\s|$)/.exec(text);
  return bare ? bare[1] : '';
}

function makeClient(account) {
  const { ImapFlow } = require('imapflow');
  return new ImapFlow({
    host: account.host,
    port: Number(account.port) || 993,
    secure: account.secure !== false,
    auth: { user: account.user, pass: decrypt(account.secret) },
    // 163 and QQ reject a client that never identifies itself with IMAP ID
    // ("Unsafe Login"); imapflow sends this automatically once it is set.
    id: { name: 'EmojiTot', version: '0.3.0', vendor: 'EmojiTot' },
    logger: false,
    emitLogs: false,
  });
}

async function fetchAccount(account, limit) {
  const client = makeClient(account);
  const found = [];
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const exists = Number(client.mailbox?.exists) || 0;
      if (!exists) return found;
      const from = Math.max(1, exists - limit + 1);
      for await (const message of client.fetch(`${from}:*`, {
        envelope: true,
        flags: true,
        source: { maxLength: 6000 },
      })) {
        const raw = message.source?.toString('utf8') ?? '';
        const from_ = firstAddress(message.envelope?.from);
        const preview = plainPreview(raw);
        // A meeting invite carries a VCALENDAR part; keep it so a refresh can
        // add the event without a second fetch when the user opens the mail.
        const icsMatch = /BEGIN:VCALENDAR[\s\S]*?END:VCALENDAR/i.exec(raw);
        found.push({
          id: `${account.id}:${message.uid}`,
          account: account.address,
          accountId: account.id,
          uid: message.uid,
          subject: decodeHeader(message.envelope?.subject ?? '(无主题)'),
          fromName: from_.name,
          fromAddress: from_.address,
          date: (message.envelope?.date ?? message.internalDate ?? new Date()).getTime?.() ?? Date.now(),
          seen: Boolean(message.flags?.has?.('\\Seen')),
          preview: preview.slice(0, 140),
          code: extractCode(preview),
          hasInvite: Boolean(icsMatch),
          ics: icsMatch ? icsMatch[0].slice(0, 20000) : '',
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return found;
}

async function refresh(force = false) {
  if (!accounts.length) {
    messages = [];
    lastError = '';
    emit();
    return snapshot();
  }
  if (syncing) return snapshot();
  if (!force && Date.now() - lastAttempt < REPEAT_LOCK_MS) return snapshot();
  syncing = true;
  lastAttempt = Date.now();
  try {
    const all = [];
    const errors = [];
    for (const account of accounts.filter((entry) => entry.enabled !== false)) {
      try {
        const list = await fetchAccount(account, DEFAULT_LIMIT);
        all.push(...list);
      } catch (error) {
        errors.push(`${account.address}: ${String(error?.message ?? error).slice(0, 80)}`);
      }
    }
    messages = all.sort((a, b) => b.date - a.date).slice(0, 40);
    // Import invites once per refresh; duplicates are a calendar-side decision,
    // and the parser already ignores anything without a VEVENT.
    for (const message of messages) {
      if (message.ics) calendar.importIcs(message.ics);
    }
    lastError = errors.join('；');
    lastSync = Date.now();
    save();
  } finally {
    syncing = false;
    emit();
  }
  return snapshot();
}

function snapshot() {
  return {
    accounts: accounts.map((account) => ({
      id: account.id,
      address: account.address,
      provider: account.provider,
      enabled: account.enabled !== false,
    })),
    messages: messages.slice(0, 40),
    syncing,
    error: lastError,
    lastSync,
  };
}

function add(payload) {
  const provider = PROVIDERS[payload?.provider] ? payload.provider : 'custom';
  const preset = PROVIDERS[provider];
  const host = String(payload?.host || preset.host || '').trim();
  const user = String(payload?.user || payload?.address || '').trim();
  const address = String(payload?.address || user).trim();
  const secret = String(payload?.secret || '').trim();
  if (!host || !user || !secret) return { ok: false, error: '主机、账号和授权码都要填' };
  const account = {
    id: crypto.randomBytes(4).toString('hex'),
    address,
    user,
    host,
    port: Number(payload?.port) || 993,
    secure: payload?.secure !== false,
    provider,
    secret: encrypt(secret),
    enabled: true,
    createdAt: Date.now(),
  };
  accounts.push(account);
  save();
  emit();
  return { ok: true, id: account.id };
}

function remove(id) {
  accounts = accounts.filter((account) => account.id !== id);
  messages = messages.filter((message) => message.accountId !== id);
  save();
  emit();
  return { ok: true };
}

function startService() {
  load();
  emit();
  // First sync is deferred: the island paints before any network happens.
  setTimeout(() => refresh(true), 4000);
  clearInterval(timer);
  timer = setInterval(() => refresh(), 5 * 60 * 1000);
}

function stopService() {
  clearInterval(timer);
  timer = null;
}

function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

module.exports = { startService, stopService, onChange, snapshot, refresh, add, remove, PROVIDERS, extractCode };
