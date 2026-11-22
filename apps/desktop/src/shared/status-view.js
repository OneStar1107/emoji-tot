/**
 * 胶囊里每个组件长什么样，只写一次。
 *
 * 两个窗口画同一排东西：岛上折叠的胶囊 34px，设置页「常驻排列」的预览条
 * 420px。一处是承诺，一处是兑现——读数规则（百分比、24/12 小时制、摄氏华氏、
 * 余额前缀、电池图标）如果各写一份，预览迟早会和它预测的胶囊说两套话。
 *
 * 和 schema.js 一样：纯函数，没有 DOM，没有 electron。单元测试直接 import。
 */

/**
 * 电池图标。
 *
 * 三档颜色是同一个判断：<=12% 用 --bad，<=30% 用 --warn，其余跟随文字色。
 * 电量条宽度按 13px 的格位算，所以 0% 仍留 2px 的一格，看起来是「空」而不是
 * 「没画」。charging 时叠一个闪电，颜色用 --good。
 */
export function batteryGlyph(level, charging = false) {
  const width = Math.max(2, Math.round(13 * Math.max(0, Math.min(1, Number(level) / 100))));
  const tone = level <= 12 ? 'var(--bad)' : level <= 30 ? 'var(--warn)' : 'currentColor';
  return '<svg class="" viewBox="0 0 24 24" aria-hidden="true">' +
    '<rect x="1.2" y="7" width="17" height="10" rx="2.6"/><rect x="19" y="10" width="2" height="4" rx="1"/>' +
    '<rect x="3" y="8.8" width="' + width + '" height="6.4" rx="1.4" fill="' + tone + '" stroke="none"/>' +
    (charging ? '<path d="m11 8-2.6 4.2h2.4L9.6 16l3.4-4.6H10.8z" fill="var(--good)" stroke="none"/>' : '') +
    '</svg>';
}

/** 电量：'82%'。和岛上原来的 `${level}%` 逐字一致，所以换用处不改观感。 */
export function batteryText(level) {
  return String(level) + '%';
}

/**
 * 时间：'15:41'，或 12 小时制的 '3:41 PM'。
 *
 * 12 小时制的小时不补零、分钟补零——这是岛上一直以来的样子，不是随手写的：
 * 补零的 '03:41' 在 12 小时制里读起来像 24 小时制。
 */
export function clockText(date = new Date(), use24 = true) {
  const now = date instanceof Date ? date : new Date(date);
  const minutes = String(now.getMinutes()).padStart(2, '0');
  if (use24) return String(now.getHours()).padStart(2, '0') + ':' + minutes;
  const hour = now.getHours() % 12 || 12;
  return hour + ':' + minutes + ' ' + (now.getHours() < 12 ? 'AM' : 'PM');
}

/**
 * 温度：'17°'。传进来的是摄氏度，单位偏好在这里换算。
 *
 * 缺失读数按 0 处理，和原来的 `Number(temp) || 0` 一致：调用方已经决定
 * 「有天气对象才画这一格」，所以这里拿到的 0 是有意义的 0 度，不是缺省。
 */
export function temperatureText(celsius, unit = 'c') {
  const value = Number(celsius);
  const safe = Number.isFinite(value) ? value : 0;
  return (unit === 'f' ? Math.round((safe * 9) / 5 + 32) : Math.round(safe)) + '°';
}

/**
 * 余额：'¥20.8'，没有可用读数时返回 ''。
 *
 * '' 是「这一格不画」，不是「余额为零」：胶囊里一个空 span 会让状态行多出
 * 一个间距，看起来像丢了一个组件。调用方拿到 '' 直接跳过。
 */
export function quotaText(last) {
  if (!last || last.error || last.total === undefined) return '';
  return '¥' + String(last.total);
}
