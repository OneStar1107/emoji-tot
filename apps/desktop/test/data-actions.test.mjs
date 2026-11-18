/**
 * Service actions must return their own result to the settings window.
 *
 * A snapshot without the action result lets the UI repaint exactly as if the
 * operation succeeded, which is how an invalid IMAP host looked like a no-op.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calendarAction,
  mailAction,
  quotaAction,
} from '../src/main/data-actions.js';

describe('data actions: service results reach the renderer', () => {
  it('passes the selected mail provider through and preserves a failure', async () => {
    let received = null;
    const mail = {
      add(payload) {
        received = payload;
        return { ok: false, error: 'IMAP host is required' };
      },
      snapshot() {
        return { accounts: [], messages: [], syncing: false, error: '', lastSync: 0 };
      },
    };

    const result = await mailAction(mail, {
      action: 'add',
      data: {
        provider: 'gmail',
        address: 'person@example.com',
        user: 'person@example.com',
        secret: 'secret',
        host: '',
      },
    });

    assert.equal(received.provider, 'gmail');
    assert.deepEqual(result.actionResult, {
      ok: false,
      error: 'IMAP host is required',
    });
    assert.deepEqual(result.accounts, []);
  });

  it('does not hide a quota add failure', async () => {
    const quota = {
      add() {
        return { ok: false, error: 'Key is empty' };
      },
      snapshot() {
        return { accounts: [], current: null, last: null };
      },
    };

    const result = await quotaAction(quota, { action: 'add', data: {} });
    assert.deepEqual(result.actionResult, { ok: false, error: 'Key is empty' });
  });

  it('does not hide an invalid calendar subscription', async () => {
    const calendar = {
      async addSubscription() {
        return { ok: false, error: 'A http(s) URL is required' };
      },
      list: () => [],
      upcoming: () => [],
      subscriptionList: () => [],
    };

    const result = await calendarAction(calendar, {
      action: 'subscribe',
      data: { name: 'Bad', url: 'not a url' },
    });
    assert.deepEqual(result.actionResult, {
      ok: false,
      error: 'A http(s) URL is required',
    });
  });
});
