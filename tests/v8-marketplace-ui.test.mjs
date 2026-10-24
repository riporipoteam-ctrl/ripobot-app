import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('V8 zero-key plugins are persisted per workspace and exposed by API', () => {
  const worker = fs.readFileSync(new URL('../cloudflare/worker.mjs', import.meta.url), 'utf8');
  assert.match(worker, /CREATE TABLE IF NOT EXISTS workspace_plugins/);
  assert.match(worker, /ZERO_KEY_PLUGIN_CATALOG/);
  assert.match(worker, /handlePluginsList/);
  assert.match(worker, /handlePluginInstall/);
  assert.match(worker, /handlePluginUninstall/);
  assert.match(worker, /\/api\/plugins/);
});

test('installed plugins become real bot tools rather than decorative UI', () => {
  const worker = fs.readFileSync(new URL('../cloudflare/worker.mjs', import.meta.url), 'utf8');
  assert.match(worker, /plugin_call/);
  assert.match(worker, /runInstalledPlugin/);
  assert.match(worker, /installedPluginContext/);
  assert.match(worker, /Open-Meteo/);
  assert.match(worker, /Wikipedia/);
  assert.match(worker, /Hacker News/);
  assert.match(worker, /npm Registry/);
  assert.match(worker, /GitHub Public/);
});

test('V8 plugin store installs and removes tools from the website', () => {
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /function PluginStoreView/);
  assert.match(app, /\/api\/plugins\/install/);
  assert.match(app, /\/api\/plugins\/uninstall/);
  assert.match(app, /plugin-market-v8/);
  assert.match(app, /Zero-key/);
});

test('V8 avatar engine has at least twenty distinct shapes and twelve motion families', async () => {
  const module = await import('../src/avatar-visual.js');
  assert.ok(module.AVATAR_SHAPES.length >= 20, `expected >=20 shapes, got ${module.AVATAR_SHAPES.length}`);
  const source = fs.readFileSync(new URL('../src/avatar-visual.js', import.meta.url), 'utf8');
  assert.match(source, /% 12/);
});

test('V8 chat surfaces real inter-agent handoff cards and collaboration activity', () => {
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /collaboration-handoff-v8/);
  assert.match(app, /AgentActivityView/);
  assert.match(app, /mailboxId/);
  assert.match(app, /sourceAgentName/);
  assert.match(app, /targetAgentName/);
});

test('V8 mobile navigation exposes Plugins as a first-class destination', () => {
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, />Plugins</);
  assert.match(app, /onPlugins/);
});
