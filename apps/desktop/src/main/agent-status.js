/**
 * Turn one agent's status file plus process presence into the three facts the
 * island may show: active, running and how many tasks it owns.
 *
 * A status file is a receipt, not a process table. Yesterday's "done" file must
 * not become today's green running dot, and an open agent with no task yet is
 * still a started platform.
 */

const RUNNING_WORDS = new Set([
  'running',
  'working',
  'thinking',
  'busy',
  'in-progress',
  'in_progress',
]);

const TERMINAL_WORDS = new Set([
  'done',
  'complete',
  'completed',
  'idle',
  'stopped',
  'failed',
  'blocked',
]);

const STALE_MS = 2 * 60 * 1000;

function timestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function statusWord(raw) {
  return String(raw?.status ?? raw?.state ?? '').trim().toLowerCase();
}

function runningWord(raw) {
  if (raw?.running === true) return true;
  return RUNNING_WORDS.has(statusWord(raw));
}

function countValue(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

/** A task count reported by the agent, or one for a running legacy reporter. */
function agentTaskCount(raw) {
  if (!raw || typeof raw !== 'object') return 0;
  if (TERMINAL_WORDS.has(statusWord(raw))) return 0;
  const explicit =
    countValue(raw.taskCount) ||
    countValue(raw.activeTasks) ||
    (Array.isArray(raw.tasks) ? raw.tasks.length : 0) ||
    countValue(raw.sessions);
  if (explicit) return explicit;
  return runningWord(raw) ? 1 : 0;
}

/**
 * `present` is true/false from the process watcher, or undefined until its
 * first sample. Until presence is known, a fresh status file is the fallback.
 */
function classifyAgent({
  raw = null,
  heartbeatAt = 0,
  present,
  now = Date.now(),
  staleMs = STALE_MS,
  wasActive = false,
  since = 0,
} = {}) {
  const updatedAt = timestamp(raw?.updatedAt ?? raw?.at);
  const heart = Math.max(timestamp(heartbeatAt), updatedAt);
  const fresh = Boolean(raw && heart > 0 && now - heart <= staleMs && heart <= now + staleMs);
  const wantsRun = runningWord(raw);
  const presenceKnown = typeof present === 'boolean';
  const running = wantsRun && (present === true || (!presenceKnown && fresh));
  const taskCount = agentTaskCount(raw);
  const active = present === true || running || (fresh && taskCount > 0);
  return {
    active,
    running,
    taskCount,
    heartbeatAt: heart,
    since: active ? (wasActive ? since : now) : 0,
  };
}

/** Active platforms first, more tasks first; equal rows keep their arrival order. */
function orderActiveAgents(rows) {
  return [...rows].sort((a, b) => {
    const active = Number(Boolean(b.active)) - Number(Boolean(a.active));
    if (active) return active;
    // Only started platforms compete by task count. Stopped rows keep the
    // incoming settings order even if they carry a stale task receipt.
    if (!a.active) return 0;
    return (Number(b.taskCount) || 0) - (Number(a.taskCount) || 0);
  });
}

module.exports = {
  STALE_MS,
  agentTaskCount,
  classifyAgent,
  orderActiveAgents,
};
