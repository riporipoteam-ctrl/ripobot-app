import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('avatar visual helper exposes genuinely distinct named shapes', async () => {
  const { avatarVisual, AVATAR_SHAPES } = await import('../src/avatar-visual.js');
  assert.ok(AVATAR_SHAPES.length >= 10);
  const shapes = new Set(Array.from({ length: 12 }, (_, index) => avatarVisual({ avatarShape: index, avatarSeed: `shape-${index}` }).shape));
  assert.ok(shapes.size >= 10, `expected 10+ distinct shapes, got ${shapes.size}`);
  assert.ok(shapes.has('circle'));
  assert.ok(shapes.has('cloud'));
  assert.ok(shapes.has('hexagon'));
  assert.ok(shapes.has('drop'));
});

test('voice session cleanup releases every microphone track and active recorder', async () => {
  const { stopVoiceSession } = await import('../src/voice-utils.js');
  let recorderStops = 0;
  let trackStops = 0;
  let aborts = 0;
  let pauses = 0;
  const recorder = { state: 'recording', stop() { recorderStops += 1; } };
  const stream = { getTracks() { return [{ stop(){ trackStops += 1; } }, { stop(){ trackStops += 1; } }]; } };
  const controller = { abort(){ aborts += 1; } };
  const audio = { pause(){ pauses += 1; }, removeAttribute(){}, load(){} };
  stopVoiceSession({ recorder, stream, controller, audio });
  assert.equal(recorderStops, 1);
  assert.equal(trackStops, 2);
  assert.equal(aborts, 1);
  assert.equal(pauses, 1);
});

test('chat composer offers direct photo and file pickers instead of routing through workspace files', () => {
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /accept="image\/\*"/);
  assert.match(app, /composer-photo-input/);
  assert.match(app, /composer-file-input/);
  assert.doesNotMatch(app, /<strong>Workspace files<\/strong>/);
});

test('avatar renderer uses vector shape geometry rather than only border-radius blobs', () => {
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /avatar-svg/);
  assert.match(app, /avatar-shape-svg/);
});


test('V6 specialist bots receive their own identity instead of global Ripo Bot identity', () => {
  const worker = fs.readFileSync(new URL('../cloudflare/worker.mjs', import.meta.url), 'utf8');
  assert.match(worker, /Identity rule: your name is/);
  assert.doesNotMatch(worker, /You are Ripo Bot, the lead AI agent inside the Ripo Bot workspace/);
});

test('V6 chat sends available agents and real attachment context', () => {
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const worker = fs.readFileSync(new URL('../cloudflare/worker.mjs', import.meta.url), 'utf8');
  assert.match(app, /availableAgents:/);
  assert.match(worker, /buildAttachmentContext/);
  assert.match(worker, /delegate_agent/);
  assert.match(worker, /edit_image/);
  assert.match(worker, /rewrite_file/);
});

test('V6 mobile shell has persistent bottom navigation and brand mark', () => {
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /mobile-tab-bar-v6/);
  assert.match(app, /mobile-brand-v6/);
  assert.match(app, />Home</);
  assert.match(app, />Computer</);
  assert.match(app, />Settings</);
});

test('V6 computer uses Browser Run live sessions instead of fake preview-only chrome', () => {
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const worker = fs.readFileSync(new URL('../cloudflare/worker.mjs', import.meta.url), 'utf8');
  assert.match(worker, /getLiveView/);
  assert.match(worker, /connectSession/);
  assert.match(worker, /Page\.navigate/);
  assert.match(worker, /Input\.dispatchMouseEvent/);
  assert.match(app, /liveViewUrl/);
  assert.match(app, /computer-live-frame/);
});


test('V6 document attachments use Workers AI Markdown Conversion instead of metadata-only fallback', () => {
  const worker = fs.readFileSync(new URL('../cloudflare/worker.mjs', import.meta.url), 'utf8');
  assert.match(worker, /env\.AI\.toMarkdown/);
  assert.match(worker, /DOCUMENT ATTACHMENT/);
});

test('V6 image editing has a vision reconstruction fallback for oversized reference images', () => {
  const worker = fs.readFileSync(new URL('../cloudflare/worker.mjs', import.meta.url), 'utf8');
  assert.match(worker, /vision-reconstruction/);
  assert.match(worker, /describeImageAttachment/);
});
