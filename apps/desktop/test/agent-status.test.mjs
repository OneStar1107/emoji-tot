import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  agentTaskCount,
  classifyAgent,
  orderActiveAgents,
} = require('../src/main/agent-status.js');

describe('agent status is a live observation, not the last file ever written', () => {
  const now = Date.UTC(2026, 10, 24, 1, 30);
  const day = 24 * 60 * 60 * 1000;

  it('does not call yesterday’s completed file an active session', () => {
    const state = classifyAgent({
      raw: { status: 'done', updatedAt: now - day },
      heartbeatAt: now - day,
      present: false,
      now,
    });
    assert.deepEqual(
      { active: state.active, running: state.running, taskCount: state.taskCount },
      { active: false, running: false, taskCount: 0 },
    );
  });

  it('keeps a running badge only while the process is present', () => {
    const raw = { status: 'running', updatedAt: now - 5000 };
    const absent = classifyAgent({ raw, heartbeatAt: now - 5000, present: false, now });
    const present = classifyAgent({ raw, heartbeatAt: now - 5000, present: true, now });
    assert.equal(absent.running, false);
    assert.equal(present.running, true);
  });

  it('counts an open agent even when it has no task yet', () => {
    const state = classifyAgent({ raw: null, heartbeatAt: 0, present: true, now });
    assert.equal(state.active, true);
    assert.equal(state.running, false);
    assert.equal(state.taskCount, 0);
  });

  it('uses the task count published by the agent', () => {
    assert.equal(agentTaskCount({ status: 'running', taskCount: 4 }), 4);
    assert.equal(agentTaskCount({ status: 'running', tasks: [{}, {}, {}] }), 3);
    assert.equal(agentTaskCount({ status: 'running', sessions: 2 }), 2);
    assert.equal(agentTaskCount({ status: 'running' }), 1);
    assert.equal(agentTaskCount({ status: 'done', taskCount: 9 }), 0);
  });
});

describe('active agent order', () => {
  it('puts every started platform above the stopped ones', () => {
    const rows = [
      { id: 'dsh', active: false, taskCount: 9 },
      { id: 'claude', active: true, taskCount: 2 },
      { id: 'codex', active: true, taskCount: 3 },
    ];
    assert.deepEqual(orderActiveAgents(rows).map((row) => row.id), ['codex', 'claude', 'dsh']);
  });

  it('keeps the incoming order when started platforms have equal task counts', () => {
    const rows = [
      { id: 'dsh', active: true, taskCount: 2 },
      { id: 'claude', active: true, taskCount: 2 },
      { id: 'codex', active: false, taskCount: 8 },
    ];
    assert.deepEqual(orderActiveAgents(rows).map((row) => row.id), ['dsh', 'claude', 'codex']);
  });

  it('leaves stopped platforms in their original order', () => {
    const rows = [
      { id: 'dsh', active: false, taskCount: 1 },
      { id: 'claude', active: true, taskCount: 0 },
      { id: 'codex', active: false, taskCount: 9 },
    ];
    assert.deepEqual(orderActiveAgents(rows).map((row) => row.id), ['claude', 'dsh', 'codex']);
  });
});
