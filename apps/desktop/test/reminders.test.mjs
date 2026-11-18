import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pruneReminderKeys, reminderKey } from '../src/main/reminders.js';

describe('calendar reminder keys', () => {
  it('drops keys whose event no longer exists', () => {
    const keep = { id: 'keep', start: 100 };
    const drop = { id: 'drop', start: 200 };
    const keys = new Set([reminderKey(keep), reminderKey(drop)]);

    assert.deepEqual([...pruneReminderKeys(keys, [keep])], [reminderKey(keep)]);
  });
});
