#!/usr/bin/env node
/**
 * Generate the settings audit matrix from the schema.
 *
 * The matrix is a build artefact, not a document someone maintains by hand:
 * every row comes from CONSUMERS, DEFAULTS and the two manifests, so it cannot
 * describe a control the code does not have or miss one it does.
 *
 * Usage:
 *   pnpm settings:audit          # write docs/SETTINGS-AUDIT.md
 *   pnpm settings:audit --check  # fail if the file on disk is stale
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeGeneratedText } from './generated-text.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

const {
  DEFAULTS,
  PAGE_MANIFEST,
  STATUS_MANIFEST,
  CONSUMERS,
  knownPaths,
  withDefaults,
  enabledServices,
  pageOfPath,
} = await import('../apps/desktop/src/shared/schema.js');

const OUT = resolve(root, 'docs', 'SETTINGS-AUDIT.md');

/** A default rendered the way a reader would type it. */
const show = (value) => {
  if (value === null) return '\`null\`';
  if (Array.isArray(value)) return '\`[' + value.join(', ') + ']\`';
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    const on = entries.filter(([, flag]) => flag === true).length;
    return on + '/' + entries.length + ' 项开';
  }
  if (typeof value === 'string') return value === '' ? '（空）' : '\`' + value + '\`';
  return '\`' + String(value) + '\`';
};

const valueAt = (prefs, path) => path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), prefs);

/** Which test in schema.test.mjs covers this row. */
function coverFor(path, entry) {
  if (path === 'statusItems') return 'draws every status item';
  if (path === 'pages' || path === 'pageOrder') return 'pages drive services';
  if (entry.scope === 'main') return 'has a SERVICE_PLAN entry · lists every path';
  return 'lists every path · writes dotted keys through setPath';
}

const defaults = withDefaults({});
const paths = knownPaths();
const rows = paths.map((path) => {
  const entry = CONSUMERS[path];
  const page = pageOfPath(path);
  const target = pageFromKey(page);
  return [
    '\`' + path + '\`',
    show(valueAt(defaults, path)),
    target,
    entry.scope === 'main' ? '主进程' : '渲染进程',
    '\`' + entry.at + '\`',
    entry.live ? '即时' : '重启后',
    entry.note ?? '',
    coverFor(path, entry),
  ];
});

function pageFromKey(key) {
  const nav = {
    general: '常规',
    appearance: '外观',
    layout: '尺寸与位置',
    behavior: '隐藏与交互',
    cast: '角色与表情',
    pages: '页面管理',
    music: '音乐与歌词',
    focus: '专注与饮水',
    todo: '待办与置物',
    comm: '通知、邮箱与日程',
    quota: 'AI 额度',
    weather: '天气',
  };
  return nav[key] ?? key;
}

const lines = [];
lines.push('# 设置中心审计矩阵');
lines.push('');
lines.push('> 本文件由 \`pnpm settings:audit\` 从 \`apps/desktop/src/shared/schema.js\` 生成，不要手改。');
lines.push('> CI 跑 \`pnpm settings:audit --check\`，矩阵与代码不一致会失败。');
lines.push('');
lines.push('## 三份 manifest');
lines.push('');
lines.push('### 页面（岛上展开后的左右翻页）');
lines.push('');
lines.push('| key | 标题 | 副标题 | 后台服务 | 默认 |');
lines.push('| --- | --- | --- | --- | --- |');
for (const page of PAGE_MANIFEST) {
  const services = [page.service, ...(page.alsoServices ?? [])].filter(Boolean);
  lines.push('| \`' + page.key + '\` | ' + page.title + ' | ' + page.sub + ' | ' +
    (services.length ? '\`' + services.join(' + ') + '\`' : '无（纯文件操作）') + ' | ' +
    (defaults.pages[page.key] ? '开' : '关') + ' |');
}
lines.push('');
lines.push('### 状态组件（收起时仍在胶囊里）');
lines.push('');
lines.push('| key | 名称 | 依赖服务 | 默认 |');
lines.push('| --- | --- | --- | --- |');
for (const item of STATUS_MANIFEST) {
  lines.push('| \`' + item.key + '\` | ' + item.label + ' | ' +
    (item.service ? '\`' + item.service + '\`' : '无') + ' | ' +
    (defaults.statusItems.includes(item.key) ? '开' : '关') + ' |');
}
lines.push('');
lines.push('## 服务计划');
lines.push('');
lines.push('默认配置下运行的服务：' + [...enabledServices(defaults)].sort().map((s) => '\`' + s + '\`').join('、') + '。');
lines.push('');
lines.push('规则：页面开 = 服务跑；页面关 = 服务停。例外只有一条——胶囊里的状态组件还要用的服务保留');
lines.push('（关掉天气页但胶囊仍显示温度时，\`weather\` 继续跑）。另有功能级开关独立于页面：');
lines.push('\`focus.enabled\`、\`health.enabled\`、\`todo.enabled\`、\`shelf.enabled\`、\`shelf.clipboard\`。');
lines.push('');
lines.push('## 审计矩阵');
lines.push('');
lines.push('| preference path | 默认值 | 设置页 | 消费进程 | 消费位置 | 生效 | 说明 | 覆盖测试 |');
lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const row of rows) lines.push('| ' + row.join(' | ') + ' |');
lines.push('');
lines.push('## 这一轮修掉的假开关');
lines.push('');
lines.push('- **所有分组开关写入的是字面量键。** \`focus.enabled\` 被写成 \`prefs["focus.enabled"]\` 而不是');
lines.push('  \`prefs.focus.enabled\`，读的时候永远读不到，所以 18 个分组开关（专注、健康、待办、置物、');
lines.push('  剪贴板、通知、消息应用、音乐、额度阈值、天气单位…）全部是"点了没反应"。现在统一走 \`setPath\`。');
lines.push('- **\`reduceMotion\` 没有任何消费者。** 现在落到 \`body[data-reduce-motion]\`，CSS 把循环动画的');
lines.push('  迭代次数压到 1，一次性过渡保留。');
lines.push('- **\`shelf.dir\` 改不了目录。** 目录原本硬编码，现在读偏好；相对路径落在应用数据目录内。');
lines.push('- **\`shelf.clipboard\` 没有任何消费者。** 剪贴板服务原本无条件运行，现在随开关启停。');
lines.push('- **胶囊的 \`quota\` 状态组件没有渲染器。** 现在绘制余额；\`volume\` 需要系统音量读取，成本不划算，');
lines.push('  直接从 manifest 删除。');
lines.push('- **\`pinned\` / \`sizeKey\` / \`oledShift\` / \`weatherAutoLocate\` 不在默认值里。** \`pinned\` 由主进程');
lines.push('  默认置顶，界面却显示为关——开关和现实相反。现在都有默认值。');
lines.push('- **\`devices\` 页在设置里不可达。** 岛上画得出来，设置的页面表里没有这一行。两份表合成一份。');
lines.push('- **页面关了服务照跑。** \`startServices\` 无条件启动全部 11 个服务。现在由 \`applyServicePlan()\`');
lines.push('  按 manifest 差异启停，偏好一改就重算。');
lines.push('- **过期说明。** "阶段 1 只保存偏好""阶段 2 再接""阶段 3 上线"共 6 处，全部删除——这些功能');
lines.push('  早就在跑了。');
lines.push('');

const next = lines.join('\n');
let current = '';
try { current = readFileSync(OUT, 'utf8'); } catch { current = ''; }

if (normalizeGeneratedText(current) === normalizeGeneratedText(next)) {
  console.log('✓ docs/SETTINGS-AUDIT.md is up to date (' + paths.length + ' preference paths)');
  process.exit(0);
}
if (checkOnly) {
  console.error('✗ docs/SETTINGS-AUDIT.md is stale — run `pnpm settings:audit`');
  process.exit(1);
}
writeFileSync(OUT, next);
console.log('· wrote docs/SETTINGS-AUDIT.md (' + paths.length + ' preference paths, ' + PAGE_MANIFEST.length + ' pages, ' + STATUS_MANIFEST.length + ' status items)');
