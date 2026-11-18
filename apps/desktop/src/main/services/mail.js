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
      /*
       * Q-encoding is byte-level, not character-level: =E4=B8=AD is three
       * bytes of one UTF-8 character. Building a string with fromCharCode per
       * byte produces mojibake for every non-ASCII subject, so the bytes are
       * collected first and decoded with the declared charset.
       */
      const bytes = [];
      for (let i = 0; i < data.length; i += 1) {
        const char = data[i];
        if (char === '_') {
          bytes.push(0x20);
        } else if (char === '=' && /^[0-9A-Fa-f]{2}$/.test(data.slice(i + 1, i + 3))) {
          bytes.push(parseInt(data.slice(i + 1, i + 3), 16));
          i += 2;
        } else {
          bytes.push(char.charCodeAt(0) & 0xff);
        }
      }
      return decodeBytes(Buffer.from(bytes), charset);
    } catch {
      return data;
    }
  });
}

/* ------------------------------------------------------------ MIME reading */

/** Decode bytes with a declared charset, falling back to UTF-8. */
function decodeBytes(buffer, charset) {
  try {
    return new TextDecoder(charset || 'utf-8', { fatal: false }).decode(buffer);
  } catch {
    return buffer.toString('utf8');
  }
}

/** Header / body split at the first blank line. */
function splitEntity(raw) {
  const text = String(raw ?? '');
  const match = /\r?\n\r?\n/.exec(text);
  if (!match) return { headers: text, body: '' };
  return {
    headers: text.slice(0, match.index),
    body: text.slice(match.index + match[0].length),
  };
}

/** One header by name, with folded lines joined. */
function headerValue(headers, name) {
  const pattern = new RegExp('^' + name + '\\s*:\\s*([\\s\\S]*?)(?=\\r?\\n[^ \\t]|$)', 'im');
  const match = pattern.exec(headers);
  return match ? match[1].replace(/\r?\n[ \t]+/g, ' ').trim() : '';
}

function parseContentType(value) {
  const semi = String(value ?? '').indexOf(';');
  const type = (semi < 0 ? String(value ?? '') : String(value).slice(0, semi)).trim().toLowerCase();
  const params = {};
  if (semi >= 0) {
    for (const part of String(value).slice(semi + 1).split(';')) {
      const eq = part.indexOf('=');
      if (eq < 0) continue;
      params[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1).trim().replace(/^"|"$/g, '');
    }
  }
  return { type, params };
}

/** Content-Transfer-Encoding back to bytes. */
function decodeTransfer(body, encoding) {
  const enc = String(encoding ?? '').toLowerCase().trim();
  if (enc === 'base64') return Buffer.from(String(body).replace(/[^A-Za-z0-9+/=]/g, ''), 'base64');
  if (enc === 'quoted-printable') {
    const text = String(body).replace(/=\r?\n/g, '');
    const bytes = [];
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(text.slice(i + 1, i + 3))) {
        bytes.push(parseInt(text.slice(i + 1, i + 3), 16));
        i += 2;
      } else {
        bytes.push(text.charCodeAt(i) & 0xff);
      }
    }
    return Buffer.from(bytes);
  }
  return Buffer.from(String(body), 'utf8');
}

/** Walk a message into its leaf parts, following multipart boundaries. */
function collectParts(raw, out = []) {
  const { headers, body } = splitEntity(raw);
  const contentType = parseContentType(headerValue(headers, 'Content-Type') || 'text/plain');
  if (contentType.type.startsWith('multipart/') && contentType.params.boundary) {
    const boundary = '--' + contentType.params.boundary;
    const segments = body.split(boundary);
    // The first segment is the preamble and the last is the epilogue.
    for (const segment of segments.slice(1, -1)) {
      collectParts(segment.replace(/^\r?\n/, ''), out);
    }
    return out;
  }
  out.push({
    type: contentType.type,
    charset: contentType.params.charset || '',
    encoding: headerValue(headers, 'Content-Transfer-Encoding'),
    body,
  });
  return out;
}

const ICS_MAX = 200 * 1024;

/**
 * The real text/calendar part, decoded — not a regex over a truncated copy.
 *
 * The old reader fetched a 6 KB prefix of the message and searched it for
 * BEGIN:VCALENDAR. A meeting invite's calendar part sits *after* the body, so
 * the prefix routinely cut it off; when it did survive, a quoted-printable or
 * base64 part still had to be decoded, which nothing did. This walks the MIME
 * tree and decodes the part that declares itself as text/calendar.
 */
function extractCalendar(raw) {
  for (const part of collectParts(raw)) {
    if (part.type === 'text/calendar') {
      const text = decodeBytes(decodeTransfer(part.body, part.encoding), part.charset);
      return text.slice(0, ICS_MAX);
    }
  }
  // Some clients send the .ics as an application/octet-stream attachment with
  // a filename; accept a VCALENDAR body wherever it appears rather than lose it.
  const match = /BEGIN:VCALENDAR[\s\S]*?END:VCALENDAR/i.exec(String(raw ?? ''));
  return match ? match[0].slice(0, ICS_MAX) : '';
}

/** The readable body: text/plain preferred, HTML stripped as a fallback. */
function extractText(raw) {
  const parts = collectParts(raw);
  const plain = parts.find((part) => part.type === 'text/plain');
  const html = parts.find((part) => part.type === 'text/html');
  const chosen = plain || html;
  if (!chosen) return '';
  const text = decodeBytes(decodeTransfer(chosen.body, chosen.encoding), chosen.charset);
  return chosen.type === 'text/html' ? plainPreview(text) : text;
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
        // Multipart bodies need room: the calendar part comes after the text.
        source: { maxLength: ICS_MAX * 2 },
      })) {
        const raw = message.source?.toString('utf8') ?? '';
        const from_ = firstAddress(message.envelope?.from);
        const preview = extractText(raw);
        // A meeting invite carries a VCALENDAR part; keep the decoded part so
        // a refresh can add the event without a second fetch.
        const ics = extractCalendar(raw);
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
          hasInvite: Boolean(ics),
          ics,
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
      if (message.ics) calendar.importIcs(message.ics, "mail:" + message.id);
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

module.exports = {
  decodeHeader,
  extractCalendar, startService, stopService, onChange, snapshot, refresh, add, remove, PROVIDERS, extractCode };
