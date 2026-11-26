#!/usr/bin/env node
/**
 * EmojiTot 工作台基准生成器（唯一事实源的构建步骤）。
 *
 * 输入：docs/baseline/atlas/project-atlas.json 里人工维护的事实
 *      （模块 / 页面 / 功能合同 / 依赖 / 改动 / 术语 / 证据 / 交接）
 * 扫描：apps/desktop 的 preload + 主进程，得到真实的 IPC 通道链路
 *      linked / frontend_only / backend_only
 * 输出：同一份 JSON，补齐实时工作台需要的字段、六层蓝图和覆盖统计。
 *
 * 只读源码，只写这一份 JSON；不启动应用、不碰用户数据、不写绝对路径。
 * 用法：node scripts/atlas-build.mjs [--check]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const atlasPath = path.join(root, 'docs/baseline/atlas/project-atlas.json');
const srcRoot = path.join(root, 'apps/desktop/src');
const checkOnly = process.argv.includes('--check');
const EXPECTED_CURATED = {
  pages: 39,
  features: 113,
  dependencies: 15,
  ipcChannels: 91,
  ipcLinked: 87,
  ipcBackendOnly: 4,
  ipcPush: 29
};

const rel = (p) => path.relative(root, p).split(path.sep).join('/');
const read = (p) => fs.readFileSync(p, 'utf8');
const lines = (p) => read(p).split(/\r?\n/);

const STATUS_MAP = {
  confirmed: 'good',
  in_progress: 'working',
  unverified: 'unverified',
  experimental: 'working',
  deprecated: 'unverified'
};
const TYPE_MAP = { window: '窗口', page: '页面', panel: '面板', library: '库', pipeline: '流水线' };
const ROLE_LABEL = {
  ball: '桌面球窗口',
  island: '灵动岛窗口',
  settings: '设置窗口',
  tray: '托盘面板',
  update: '更新卡',
  onboarding: '首次引导'
};
const ROLE_PAGES = {
  ball: ['PAGE-BALL'],
  island: ['PAGE-ISLAND', 'PAGE-ISL-MUSIC', 'PAGE-ISL-WEATHER', 'PAGE-ISL-QUOTA', 'PAGE-ISL-MAIL', 'PAGE-ISL-FOCUS', 'PAGE-ISL-TODO', 'PAGE-ISL-HEALTH', 'PAGE-ISL-SHELF', 'PAGE-ISL-DEVICES', 'PAGE-ISL-CALENDAR', 'PAGE-ISL-MESSENGER'],
  settings: ['PAGE-SETTINGS', 'PAGE-SET-GENERAL', 'PAGE-SET-APPEARANCE', 'PAGE-SET-LAYOUT', 'PAGE-SET-BEHAVIOR', 'PAGE-SET-CAST', 'PAGE-SET-PAGES', 'PAGE-SET-MUSIC', 'PAGE-SET-FOCUS', 'PAGE-SET-TODO', 'PAGE-SET-COMM', 'PAGE-SET-QUOTA', 'PAGE-SET-WEATHER', 'PAGE-SET-DEVICES', 'PAGE-SET-TRAY', 'PAGE-SET-PLUGINS', 'PAGE-SET-ABOUT'],
  tray: ['PAGE-TRAY'],
  update: ['PAGE-UPDATE'],
  onboarding: ['PAGE-ONBOARDING']
};
const RESOURCE_LABELS = {
  'RES-SCHEMA': ['唯一偏好 schema', 'apps/desktop/src/shared/schema.js'],
  'RES-PREFS': ['偏好文件 prefs.json', '主进程原子写（临时 + fsync + rename）'],
  'RES-FACE-BUS': ['表情总线', '主进程唯一的情绪真相'],
  'RES-SECRETS': ['敏感值存储', '主进程 safeStorage'],
  'RES-SERVICES': ['28 个主进程服务', 'apps/desktop/src/services/'],
  'RES-UPDATE-CHECK': ['更新检查服务', 'apps/desktop/src/services/'],
  'RES-CORE': ['packages/core 渲染引擎', 'packages/core'],
  'RES-PROTOCOL': ['packages/protocol 情绪协议', 'packages/protocol'],
  'RES-SCAN': ['敏感信息扫描', 'scripts/scan-sensitive.mjs'],
  'RES-IPC-GUARD': ['ipc-guard 四层守门', 'apps/desktop/src/main/ipc-guard.js']
};

/* ---------- IPC 扫描 ---------- */

function preloadFiles() {
  return fs.readdirSync(srcRoot)
    .filter((name) => /^preload(?:-[a-z]+)?\.js$/.test(name))
    .sort()
    .map((name) => {
      const role = name === 'preload.js' ? 'ball' : name.replace(/^preload-|\.js$/g, '');
      return { file: path.join(srcRoot, name), role };
    });
}

function parsePreload({ file, role }) {
  const text = read(file);
  const api = (text.match(/contextBridge\.exposeInMainWorld\(\s*['"]([^'"]+)['"]/) || [])[1] || '';
  const calls = [];
  const callRe = /([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*ipcRenderer\.(invoke|send|sendSync)\(\s*['"\x60]([^'"\x60]+)['"\x60]/g;
  let m;
  while ((m = callRe.exec(text))) calls.push({ method: m[1], kind: m[2], channel: m[3] });
  const listeners = [];
  const listenRe = /([A-Za-z_$][\w$]*)\s*:\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*on\(\s*['"\x60]([^'"\x60]+)['"\x60]/g;
  while ((m = listenRe.exec(text))) listeners.push({ method: m[1], channel: m[2] });
  const anyListenRe = /\bon\(\s*['"\x60]([^'"\x60]+)['"\x60]/g;
  while ((m = anyListenRe.exec(text))) {
    if (listeners.some((l) => l.channel === m[1])) continue;
    const before = text.slice(Math.max(0, m.index - 260), m.index);
    const nameMatch = before.match(/([A-Za-z_$][\w$]*)\s*:\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*(?:\{[\s\S]{0,120}?)?$/);
    listeners.push({ method: nameMatch ? nameMatch[1] : 'on', channel: m[1] });
  }
  // 用于定位：方法名在文件里的行号
  const lineOf = (needle) => {
    const index = text.indexOf(needle);
    return index < 0 ? 0 : text.slice(0, index).split(/\r?\n/).length;
  };
  return {
    role,
    api,
    file: rel(file),
    calls: calls.map((c) => ({ ...c, line: lineOf(c.method + ':') })),
    listeners: listeners.map((l) => ({ ...l, line: lineOf(l.method + ':') }))
  };
}

function mainFiles() {
  const dir = path.join(srcRoot, 'main');
  const list = fs.readdirSync(dir).filter((n) => n.endsWith('.js')).map((n) => path.join(dir, n));
  const top = path.join(srcRoot, 'main.js');
  if (fs.existsSync(top)) list.push(top);
  return list.sort();
}

function parseMain() {
  const handlers = [];
  const senders = [];
  for (const file of mainFiles()) {
    const text = read(file);
    const lineAt = (index) => text.slice(0, index).split(/\r?\n/).length;
    const regRe = /guard\.(guardedHandle|guardedSend|guardedSync)\(\s*['"\x60]([^'"\x60]+)['"\x60][\s\S]{0,1200}?\[([^\]]*)\]/g;
    let m;
    while ((m = regRe.exec(text))) {
      const window = text.slice(m.index, m.index + 900);
      handlers.push({
        channel: m[2],
        kind: m[1] === 'guardedHandle' ? 'invoke' : m[1] === 'guardedSend' ? 'send' : 'sync',
        roles: m[3].split(',').map((r) => r.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean),
        file: rel(file),
        line: lineAt(m.index),
        check: /\bcheck\s*:/.test(window),
        maxBytes: /maxBytes\s*:/.test(window),
        viaGuard: true
      });
    }
    const sendRe = /(?:[\w$]+\.)*(?:safeSend|send)\(\s*(?:[^,'"\x60()]+,)?\s*['"\x60]([^'"\x60]+)['"\x60]/g;
    while ((m = sendRe.exec(text))) {
      if (text.slice(Math.max(0, m.index - 12), m.index).includes('ipcRenderer')) continue;
      senders.push({ channel: m[1], file: rel(file), line: lineAt(m.index) });
    }
  }
  return { handlers, senders };
}

function buildContracts(preloads, handlers, senders) {
  const byChannel = new Map();
  const ensure = (channel) => {
    if (!byChannel.has(channel)) byChannel.set(channel, { channel, calls: [], listeners: [], handlers: [], senders: [] });
    return byChannel.get(channel);
  };
  for (const pre of preloads) for (const c of pre.calls) ensure(c.channel).calls.push({ ...c, api: pre.api, role: pre.role, file: pre.file });
  for (const pre of preloads) for (const l of pre.listeners) ensure(l.channel).listeners.push({ ...l, api: pre.api, role: pre.role, file: pre.file });
  for (const h of handlers) ensure(h.channel).handlers.push(h);
  for (const item of senders) ensure(item.channel).senders.push(item);

  const contracts = [...byChannel.values()].map((item) => {
    const receiveHandlers = item.handlers.filter((h) => h.kind !== 'push');
    const handler = receiveHandlers[0] || null;
    const sendersAll = item.senders.concat(item.handlers.filter((h) => h.kind === 'push').map((h) => ({ file: h.file, line: h.line })));
    const hasCalls = item.calls.length > 0;
    const isPush = !hasCalls && (sendersAll.length > 0 || (!receiveHandlers.length && item.listeners.length > 0));
    let status;
    if (hasCalls) status = handler ? 'linked' : 'frontend_only';
    else if (isPush) status = sendersAll.length && item.listeners.length ? 'linked' : sendersAll.length ? 'backend_only' : 'frontend_only';
    else status = handler ? 'backend_only' : 'frontend_only';
    const roles = [...new Set(item.calls.map((c) => c.role).concat(item.listeners.map((l) => l.role)))];
    const pageIds = [...new Set(roles.flatMap((role) => ROLE_PAGES[role] || []))];
    return {
      id: 'IPC-' + item.channel.replace(/[^a-z0-9]+/gi, '-').toUpperCase(),
      channel: item.channel,
      direction: isPush ? 'push' : item.calls[0]?.kind || 'invoke',
      status,
      callers: item.calls.map((c) => ({ api: c.api, method: c.method, role: c.role, file: c.file, line: c.line })),
      listeners: item.listeners.map((l) => ({ api: l.api, method: l.method, role: l.role, file: l.file, line: l.line })),
      senders: sendersAll,
      handler: handler ? { file: handler.file, line: handler.line, roles: handler.roles, check: handler.check, maxBytes: handler.maxBytes, viaGuard: handler.viaGuard } : null,
      pageIds,
      evidence: handler ? handler.file + ':' + handler.line
        : sendersAll[0] ? sendersAll[0].file + ':' + sendersAll[0].line
        : item.calls[0] ? item.calls[0].file + ':' + item.calls[0].line
        : item.listeners[0] ? item.listeners[0].file + ':' + item.listeners[0].line
        : '待确认'
    };
  }).sort((a, b) => a.channel.localeCompare(b.channel, 'en'));
  return contracts;
}

/* ---------- 工作台字段 ---------- */

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '');
}
function dedupe(list) {
  return [...new Set(list)];
}
function pageType(surfaceType) {
  return TYPE_MAP[surfaceType] || '页面';
}

function buildPages(curated, modules, featureList = []) {
  const moduleById = new Map(modules.map((m) => [m.id, m]));
  const nameById = new Map(featureList.map((f) => [f.id, f.name]));
  return curated.map((page) => {
    const module = moduleById.get(page.moduleId) || { name: '' };
    const stateNames = (page.states || []).map((s) => (typeof s === 'string' ? s : s.name)).filter(Boolean);
    return {
      ...page,
      group: page.group || module.name,
      type: pageType(page.surfaceType),
      purpose: page.purpose || page.summary,
      entry: page.entryPoints || page.entry || [page.route],
      states: stateNames.length ? stateNames : ['合同主态'],
      stateDetails: page.states || [],
      features: page.featureIds || page.features || [],
      evidence: page.evidence || (page.implementation || []).map((i) => i.path + (i.symbol ? ' · ' + i.symbol : '')).join('；') || '待确认',
      status: STATUS_MAP[page.status] || page.status,
      preview: page.preview || {
        variant: page.surfaceType === 'window' ? 'dashboard' : module.name === '设置中心' ? 'settings' : 'dashboard',
        eyebrow: 'EmojiTot · ' + (module.name || '页面'),
        title: page.title,
        nav: curated.filter((p) => p.moduleId === page.moduleId).slice(0, 4).map((p) => p.title),
        metrics: [
          ['入口', String((page.entryPoints || []).length || 1)],
          ['功能', String((page.featureIds || []).length)],
          ['状态', stateNames.length ? stateNames[0] : '合同主态']
        ],
        rows: (page.featureIds || []).slice(0, 3).map((id) => nameById.get(id) || id),
        progress: Math.min(90, 30 + (page.featureIds || []).length * 4)
      }
    };
  });
}

function buildFeatures(curated, pages, dependencies) {
  const depsByPage = new Map();
  for (const page of pages) depsByPage.set(page.id, []);
  for (const dep of dependencies || []) {
    if (!depsByPage.has(dep.from)) depsByPage.set(dep.from, []);
    depsByPage.get(dep.from).push(dep.id);
  }
  return curated.map((feature) => {
    const contract = feature.contract || {};
    const pageIds = feature.pageIds || [];
    const status = STATUS_MAP[feature.status] || feature.status;
    const evidence = dedupe((feature.implementation || []).map((i) => i.path)).join('；') || '只有功能合同';
    const current = status === 'good'
      ? (contract.outcome || '合同已确认，按合同执行')
      : status === 'working'
        ? '开发中：' + (contract.outcome || '合同已登记，接线尚未完成')
        : feature.status === 'deprecated'
          ? '已废弃：仅保留合同记录，不再作为验收依据'
          : '合同已登记，运行验证尚未覆盖';
    const { contract: _contract, parity: _parity, ...rest } = feature;
    return {
      ...rest,
      status,
      actions: feature.actions || contract.actions || [],
      locked: feature.locked || contract.locked || [],
      entry: feature.entry || contract.entry || feature.name,
      outcome: feature.outcome || contract.outcome || '用户完成“' + feature.name + '”后能看到明确结果。',
      data: feature.data || contract.data || '待确认',
      evidence,
      current,
      after: status === 'good' ? '保持现有行为，不因本次建工作台而改变' : '补齐成功、失败与重试证据后转为已确认',
      decision: status === 'good' ? '保留' : feature.status === 'deprecated' ? '废弃' : '验证并完善',
      dependencyIds: dedupe(pageIds.flatMap((id) => depsByPage.get(id) || []))
    };
  });
}

/* ---------- 蓝图 ---------- */

function statusForLink(link) {
  return link === 'linked' ? 'linked' : link === 'frontend_only' ? 'partial' : 'pending';
}

function buildBlueprint({ pages, features, dependencies, contracts, changes }) {
  const byRole = new Map();
  for (const c of contracts) {
    const roles = c.callers.map((x) => x.role).concat(c.handler ? c.handler.roles : []);
    for (const role of dedupe(roles)) {
      if (!byRole.has(role)) byRole.set(role, []);
      byRole.get(role).push(c);
    }
  }
  const channelsForPage = (pageId) => contracts.filter((c) => c.pageIds.includes(pageId)).length;
  const linkedForPage = (pageId) => contracts.filter((c) => c.pageIds.includes(pageId) && c.status === 'linked').length;

  const pageNodes = pages.map((page) => ({
    id: 'BP-' + page.id,
    title: page.title,
    detail: (page.purpose || page.summary) + '；IPC ' + linkedForPage(page.id) + '/' + channelsForPage(page.id) + ' 条已接通',
    code: 'route ' + page.route + ' · ' + ((page.implementation || [])[0]?.path || page.evidence),
    status: page.status,
    affects: [page.id],
    trace: [ROLE_LABEL[[...byRole.keys()].find((r) => (ROLE_PAGES[r] || []).includes(page.id))] || '页面', page.title, 'IPC ' + linkedForPage(page.id) + ' 条', '主进程服务', '页面与主流程验证']
  }));

  const featureIds = dedupe([]
    .concat(...(changes || []).map((c) => c.features || []))
    .concat(features.filter((f) => ['PAGE-ISLAND', 'PAGE-SET-LAYOUT', 'PAGE-UPDATE', 'PAGE-BALL', 'PAGE-SETTINGS'].includes(f.pageIds[0])).slice(0, 14).map((f) => f.id)));
  const featureNodes = featureIds.map((id) => features.find((f) => f.id === id)).filter(Boolean).slice(0, 18).map((feature) => ({
    id: 'BP-' + feature.id,
    title: feature.name,
    detail: feature.outcome,
    code: feature.evidence,
    status: feature.status,
    affects: feature.pageIds,
    trace: ['页面', feature.name, '偏好 / 服务', 'IPC 通道 ' + dedupe(feature.pageIds.flatMap((p) => contracts.filter((c) => c.pageIds.includes(p)).map((c) => c.channel))).length + ' 条', '功能与合同验证']
  }));

  const ipcNodes = contracts.map((c) => ({
    id: 'BP-' + c.id,
    title: c.channel,
    detail: (c.callers[0] ? c.callers[0].api + '.' + c.callers[0].method : '仅主进程使用') + ' · 角色 ' + (c.handler?.roles?.join('/') || '待确认') + (c.handler?.check ? ' · 有形状校验' : ''),
    code: (c.callers[0]?.file || c.listeners[0]?.file || '主进程') + ' ↔ ' + (c.handler ? c.handler.file + ':' + c.handler.line : '未登记 handler'),
    status: statusForLink(c.status),
    affects: c.pageIds,
    trace: ['渲染层', c.channel, c.direction, 'preload ' + (c.callers[0]?.api || '—'), 'ipc-guard 校验']
  }));

  const dataNodes = dedupe(dependencies.map((d) => d.to)).map((resource) => {
    const label = RESOURCE_LABELS[resource] || [resource, resource];
    return {
      id: 'BP-' + resource,
      title: label[0],
      detail: '数据与服务来源：' + label[1],
      code: resource,
      status: 'good',
      affects: dedupe(dependencies.filter((d) => d.to === resource).map((d) => d.from)),
      trace: ['页面', resource, '写入路径', '主进程唯一写', '存储与恢复验证']
    };
  });

  const depNodes = dependencies.map((d) => {
    const label = RESOURCE_LABELS[d.to] || [d.to, ''];
    return {
      id: 'BP-' + d.id,
      title: (d.from || '') + ' → ' + label[0],
      detail: d.description,
      code: d.kind + ' · ' + d.status,
      status: STATUS_MAP[d.status] || 'unverified',
      affects: [d.from],
      trace: ['页面', d.kind, label[0], '主进程', '依赖与失败恢复']
    };
  });

  const verification = [
    ['VER-CHECK', 'pnpm check', '静态、类型、脚本、文档一起跑的发版闸门', 'package.json', 'available'],
    ['VER-SMOKE', 'smoke:desktop', '真机启动 + 主流程冒烟（需 --exe）', 'package.json', 'available'],
    ['VER-UI', 'ui:audit', '界面命中区与岛尺寸单源审计', 'package.json', 'available'],
    ['VER-SETTINGS', 'settings:audit', '设置页 43 条偏好与示意控件盘点', 'package.json', 'available'],
    ['VER-SCAN', 'scan（敏感信息扫描）', '发布前必须 FAIL=0', 'scripts/scan-sensitive.mjs', 'available'],
    ['VER-DOCS', 'docs:check', '文档一致性闸门（当前已知红：5 处过期 + 4 处不一致）', 'docs/consistency', 'blocked']
  ].map(([id, title, detail, code, status]) => ({
    id, title, detail, code, status, affects: [],
    trace: ['页面', '功能', '脚本', '证据', '发布与回滚']
  }));

  return [
    { label: '页面 / 前端', nodes: pageNodes },
    { label: '功能', nodes: featureNodes },
    { label: '接口 / 后端（IPC）', nodes: ipcNodes },
    { label: '数据模型', nodes: dataNodes },
    { label: '依赖 / 服务', nodes: depNodes },
    { label: '验证', nodes: verification }
  ];
}

/* ---------- 术语 / 改动 ---------- */

function buildGlossary(curated) {
  const items = Array.isArray(curated)
    ? curated
    : Object.values(curated || {}).map((item) => ({
      term: item.title,
      explanation: item.explanation || ((item.definition || '').match(/\[解释：([\s\S]*?)\]/) || [])[1] || item.short,
      aliases: (item.visual || []).filter((v) => v[0] === '别名').map((v) => v[1]),
      scope: item.scope || ((item.visual || [])[0] || [])[1] || '项目'
    }));
  const out = {};
  for (const item of items) {
    const term = item.term;
    out[slug(term)] = {
      title: term,
      short: (item.explanation || '').split(/[。；]/)[0] + '。',
      definition: term + ' [解释：' + item.explanation + ']',
      visual: (item.aliases || []).length ? item.aliases.map((a) => ['别名', a]) : [['范围', item.scope || '项目']]
    };
  }
  return out;
}

function buildChanges(changes, pages, features) {
  return changes.filter((change) => change.id !== 'CHG-IPC-ORPHANS').map((change) => {
    const pageTitles = (change.pages || []).map((id) => pages.find((p) => p.id === id)?.title).filter(Boolean);
    const featureNames = (change.features || []).map((id) => features.find((f) => f.id === id)?.name).filter(Boolean);
    const why = change.why || change.summary || '待补充原因';
    const acceptance = change.acceptance
      || (change.after || '').replace(/^验收标准：/, '')
      || (change.verification || [])[0]
      || '待补充验收标准';
    const risk = change.risk
      || (change.implementation || []).find((row) => row[0] === '风险')?.[2]
      || '待补充风险';
    return {
      id: change.id,
      title: change.title,
      type: '当前待办',
      status: change.status === 'done' ? 'done' : 'planned',
      summary: why,
      pages: change.pages || [],
      features: change.features || [],
      before: '当前问题：' + why,
      after: '验收标准：' + acceptance,
      why,
      risk,
      acceptance,
      implementation: [
        ['入口', '涉及页面', pageTitles.join('、') || '待确认'],
        ['对象', '涉及功能', featureNames.join('、') || '待确认'],
        ['风险', '不能放宽的边界', risk],
        ['验收', '完成后必须证明', acceptance]
      ],
      verification: [acceptance, '失败与重试路径按合同保持', '相关页面与摘要保持一致'],
      annotations: [
        ['1', '问题', why],
        ['2', '边界', risk],
        ['3', '证据', acceptance]
      ],
      preview: {
        before: { variant: 'dashboard', eyebrow: '当前', title: change.title, nav: pageTitles.slice(0, 4), metrics: [['涉及页面', String((change.pages || []).length)], ['涉及功能', String((change.features || []).length)], ['状态', '待修']], rows: [why].concat(featureNames.slice(0, 2)), progress: 26 },
        after: { variant: 'dashboard', eyebrow: '验收后', title: acceptance, nav: pageTitles.slice(0, 4), metrics: [['状态', '可验收'], ['证据', '合同 + 用例'], ['回滚', '上一提交']], rows: (acceptance || '').split('、').slice(0, 3), progress: 88 }
      }
    };
  });
}

/* ---------- 主流程 ---------- */

const base = JSON.parse(read(atlasPath));
const preloads = preloadFiles().map(parsePreload);
const { handlers, senders } = parseMain();
const contracts = buildContracts(preloads, handlers, senders);

const pages = buildPages(base.pages, base.modules, base.features);
const features = buildFeatures(base.features, pages, base.dependencies);
const glossary = buildGlossary(base.glossary);
const changes = buildChanges(base.changes, pages, features);
if (contracts.some((c) => c.status === 'backend_only')) {
  const orphans = contracts.filter((c) => c.status === 'backend_only').map((c) => c.channel);
  changes.push({
    id: 'CHG-IPC-ORPHANS',
    title: '核查静态扫描未发现调用方的 IPC 通道',
    type: '工作台审计发现',
    status: 'planned',
    summary: '有 ' + orphans.length + ' 条 IPC 在主进程登记了 handler，当前静态扫描未发现 preload 或渲染层调用方；不能据此认定它们是死通道。',
    pages: ['PAGE-ISLAND'],
    features: [],
    before: '当前：' + orphans.join('、') + ' 只有主进程一侧。',
    after: '验收：记录静态证据，完成真机、历史和动态调用核查，再由明确产品决定保留、补文档或移除。',
    why: '静态扫描未发现调用方不等于没有调用方；通道可能来自动态调用、兼容保留、真机路径或外部消费者。',
    risk: '误删仍可能通过动态调用或真机路径使用的通道，会让灵动岛显隐控制失效。',
    acceptance: '每条通道都有核查记录；保留则记录用途与证据，移除则必须取得明确批准并同步 ipc-frame 白名单、用例与冒烟验证。',
    implementation: [['入口', 'IPC 注册', 'apps/desktop/src/main/island.js'], ['对象', '待核查通道', orphans.join('、')], ['风险', '静态未检测到', '不能等同死代码'], ['验收', '核查完成后', '记录证据并取得移除批准']],
    verification: ['记录静态扫描未发现调用方的证据', '核对真机、历史与动态调用路径', '仅在产品明确批准后更新白名单并运行 pnpm check + smoke:desktop'],
    annotations: [['1', '发现', '静态扫描只看到主进程侧'], ['2', '核查', '真机、历史与动态调用'], ['3', '决定', '保留或获准后移除']],
    preview: { before: { variant: 'dashboard', eyebrow: '当前静态证据', title: '4 条通道的调用方待核查', nav: ['灵动岛'], metrics: [['静态调用方', '未检测到'], ['结论', '待核查'], ['删除', '未批准']], rows: orphans, progress: 20 }, after: { variant: 'dashboard', eyebrow: '证据完整后', title: '每条通道都有可追溯决定', nav: ['灵动岛'], metrics: [['核查', '运行时 + 历史'], ['决定', '保留 / 补文档 / 移除'], ['验证', '合同 + 冒烟']], rows: ['保留现状', '记录证据', '明确批准后变更'], progress: 86 } }
  });
}
const blueprint = buildBlueprint({ pages, features, dependencies: base.dependencies, contracts, changes });

const ipcLinked = contracts.filter((c) => c.status === 'linked').length;
const ipcFrontendOnly = contracts.filter((c) => c.status === 'frontend_only').length;
const ipcBackendOnly = contracts.filter((c) => c.status === 'backend_only').length;
const pushes = contracts.filter((c) => c.direction === 'push').length;
const states = pages.reduce((n, p) => n + (p.states || []).length, 0);

const out = {
  schemaVersion: '2.3.0',
  generatedAt: new Date().toISOString(),
  generator: 'scripts/atlas-build.mjs',
  project: base.project,
  coverage: {
    ...base.coverage,
    auditedPages: pages.length,
    totalPages: pages.length,
    auditedFeatures: features.length,
    totalFeatures: features.length,
    auditedStates: states,
    httpBackend: 0,
    ipcChannels: contracts.length,
    ipcLinked,
    ipcFrontendOnly,
    ipcBackendOnly,
    ipcPush: pushes,
    limitations: [
      'EmojiTot 是 Electron 应用，没有 HTTP 后端；接口层这里是 IPC 通道（渲染层 → preload → ipc-guard → 主进程）。',
      '前端调用/已接通的分母只统计 IPC 通道；不把 Electron 的 IPC 伪装成 HTTP 接口。',
      '静态命中只证明代码里有这条通道，不证明真机运行时一定成功；正数覆盖见 coverage，运行证据见 docs/baseline 与发版记录。',
      '页面截图由 capture-manifest.json 驱动的真机采集流程写入 docs/baseline/atlas/captures/；未变化且证据仍有效的页面复用缓存，发生变化或采集失败的页面保留上一张有效图并明确标记，无法通过真机证据覆盖的页面才使用显式标注的结构预览。'
    ]
  },
  modules: base.modules,
  pages,
  features,
  dependencies: base.dependencies,
  contracts,
  blueprint,
  changes,
  glossary,
  evidence: base.evidence,
  handoff: base.handoff
};

const serialized = JSON.stringify(out) + '\n';

// fail-closed 自检
const problems = [];
if (pages.length !== base.pages.length) problems.push('页面数量被改变：' + pages.length + ' != ' + base.pages.length);
if (features.length !== base.features.length) problems.push('功能数量被改变：' + features.length + ' != ' + base.features.length);
if (pages.length !== EXPECTED_CURATED.pages) problems.push('页面基准完整性失败：' + pages.length + ' != ' + EXPECTED_CURATED.pages);
if (features.length !== EXPECTED_CURATED.features) problems.push('功能基准完整性失败：' + features.length + ' != ' + EXPECTED_CURATED.features);
if (base.dependencies.length !== EXPECTED_CURATED.dependencies) problems.push('依赖基准完整性失败：' + base.dependencies.length + ' != ' + EXPECTED_CURATED.dependencies);
if (contracts.length !== EXPECTED_CURATED.ipcChannels) problems.push('IPC 通道完整性失败：' + contracts.length + ' != ' + EXPECTED_CURATED.ipcChannels);
if (ipcLinked !== EXPECTED_CURATED.ipcLinked) problems.push('已接通 IPC 完整性失败：' + ipcLinked + ' != ' + EXPECTED_CURATED.ipcLinked);
if (ipcBackendOnly !== EXPECTED_CURATED.ipcBackendOnly) problems.push('仅主进程 IPC 完整性失败：' + ipcBackendOnly + ' != ' + EXPECTED_CURATED.ipcBackendOnly);
if (pushes !== EXPECTED_CURATED.ipcPush) problems.push('IPC 推送通道完整性失败：' + pushes + ' != ' + EXPECTED_CURATED.ipcPush);
if (/undefined/.test(serialized)) {
  const at = serialized.indexOf('undefined');
  problems.push('生成物里出现 undefined：…' + serialized.slice(Math.max(0, at - 160), at + 80).replace(/\s+/g, ' ') + '…');
}
if (/\b[A-Za-z]:\\\\Users\\\\/i.test(serialized)) problems.push('生成物里出现本机绝对路径');
const missingContractFeature = features.filter((f) => !f.outcome || f.outcome.includes('待确认')).length;
if (missingContractFeature > 40) problems.push('过多功能退回“待确认”（' + missingContractFeature + '）');
if (Buffer.byteLength(serialized) > 300 * 1024) problems.push('基准超过 300 KB（' + Buffer.byteLength(serialized) + ' 字节），实时工作台无法读取项目基准（扫描器上限 320 KB）');
if (problems.length) {
  console.error('atlas-build 失败：');
  for (const problem of problems) console.error(' - ' + problem);
  process.exit(1);
}

if (checkOnly) {
  const strip = (text) => text.replace(/"generatedAt":"[^"]*"/, '"generatedAt":""');
  const same = strip(read(atlasPath).trim()) === strip(serialized.trim());
  if (!same) {
    console.error('基准不是最新的：请运行 node scripts/atlas-build.mjs 后重新提交。');
    process.exit(1);
  }
  console.log('基准是最新的：' + pages.length + ' 页面 / ' + features.length + ' 功能 / ' + contracts.length + ' 条 IPC');
  process.exit(0);
}

fs.writeFileSync(atlasPath, serialized, 'utf8');
console.log('已生成 docs/baseline/atlas/project-atlas.json');
console.log('页面 ' + pages.length + ' · 功能 ' + features.length + ' · 模块 ' + base.modules.length);
console.log('IPC 通道 ' + contracts.length + '：已接通 ' + ipcLinked + ' / 仅前端 ' + ipcFrontendOnly + ' / 仅主进程 ' + ipcBackendOnly + '（其中推送 ' + pushes + '）');
console.log('蓝图节点：' + blueprint.map((l) => l.label + ' ' + l.nodes.length).join(' · '));
console.log('术语 ' + Object.keys(glossary).length + ' · 改动 ' + changes.length + ' · 状态点 ' + states);
