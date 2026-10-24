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
