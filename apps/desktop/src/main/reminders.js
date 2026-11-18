function reminderKey(event) {
  return event.id + ':' + event.start;
}

function pruneReminderKeys(keys, events) {
  const valid = new Set(events.map(reminderKey));
  return new Set([...keys].filter((key) => valid.has(key)));
}

module.exports = { reminderKey, pruneReminderKeys };
