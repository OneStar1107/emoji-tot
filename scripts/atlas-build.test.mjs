import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const atlasPath = path.join(root, 'docs/baseline/atlas/project-atlas.json');

test('atlas 基准与代码一致（--check）', () => {
  execFileSync(process.execPath, ['scripts/atlas-build.mjs', '--check'], { cwd: root, stdio: 'pipe', timeout: 120000 });
});

test('atlas 保持页面/功能数量、IPC 链路与体积上限', () => {
  const text = readFileSync(atlasPath, 'utf8');
  const atlas = JSON.parse(text);
  assert.equal(atlas.pages.length, 39, '页面数量必须保持 39');
  assert.equal(atlas.features.length, 113, '功能数量必须保持 113');
  assert.equal(atlas.dependencies.length, 15, '依赖数量必须保持 15');
  assert.ok(!text.includes('undefined'), '生成物不能出现 undefined');
  assert.ok(statSync(atlasPath).size < 300 * 1024, '基准必须小于 300 KB，否则实时工作台静默退回纯扫描');
  const linked = atlas.contracts.filter((item) => item.status === 'linked').length;
  const backendOnly = atlas.contracts.filter((item) => item.status === 'backend_only').length;
  assert.ok(linked >= 60, '已接通 IPC 通道必须保持正数覆盖');
  assert.equal(backendOnly, 4, '目前已知的 4 条无调用方通道必须继续被列出，不能静默消失');
  assert.equal(atlas.blueprint.length, 6, '蓝图必须保持六层');
  assert.ok(atlas.glossary['灵动岛'] || Object.keys(atlas.glossary).length >= 12, '术语必须保留');
});
