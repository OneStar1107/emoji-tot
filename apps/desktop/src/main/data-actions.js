/**
 * Service actions used by the settings window.
 *
 * A service snapshot describes what is stored. It does not say whether the
 * action that just ran succeeded. These helpers combine both so a failed add
 * or subscription cannot repaint as if it succeeded.
 */

const success = () => ({ ok: true });

const resultOf = (value, fallbackError) => {
  if (value && typeof value === 'object' && typeof value.ok === 'boolean') return value;
  if (value === false) return { ok: false, error: fallbackError };
  return success();
};

async function mailAction(mail, payload) {
  const { action, data = {} } = payload;
  let result = success();
  if (action === 'add') result = resultOf(mail.add(data), '邮件账号添加失败');
  else if (action === 'remove') result = resultOf(mail.remove(data.id), '邮件账号删除失败');
  else if (action === 'markRead') result = resultOf(await mail.markRead(data.ids, data.seen !== false), '标记已读失败');
  else if (action === 'delete') result = resultOf(await mail.removeMessages(data.ids), '删除邮件失败');
  else if (action === 'refresh') await mail.refresh(true);
  return { ...mail.snapshot(), actionResult: result };
}

async function quotaAction(quota, payload) {
  const { action, data = {} } = payload;
  let result = success();
  if (action === 'add') result = resultOf(quota.add(data.name, data.key, data.provider), '额度账号添加失败');
  else if (action === 'remove') result = resultOf(quota.remove(data.id), '额度账号删除失败');
  else if (action === 'select') result = resultOf(quota.select(data.id), '额度账号切换失败');
  else if (action === 'refresh') await quota.refresh();
  return { ...quota.snapshot(), actionResult: result };
}

async function calendarAction(calendar, payload) {
  const { action, data = {} } = payload;
  let result = success();
  if (action === 'add') {
    result = calendar.add(data) ? success() : { ok: false, error: '日程标题或时间无效' };
  } else if (action === 'remove') {
    calendar.remove(data.id);
  } else if (action === 'import') {
    calendar.importIcs(data.ics, 'manual-import');
  } else if (action === 'subscribe') {
    result = resultOf(await calendar.addSubscription(data.name, data.url), '日历订阅添加失败');
  } else if (action === 'unsubscribe') {
    calendar.removeSubscription(data.id);
  } else if (action === 'refresh-subscriptions') {
    await calendar.refreshSubscriptions(true);
  }
  return {
    events: calendar.list(),
    upcoming: calendar.upcoming(),
    subscriptions: calendar.subscriptionList(),
    actionResult: result,
  };
}

module.exports = { mailAction, quotaAction, calendarAction };
