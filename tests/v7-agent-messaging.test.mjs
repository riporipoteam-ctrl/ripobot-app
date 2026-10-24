import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('agent-to-agent tasks are persisted in a real mailbox', () => {
  const worker = fs.readFileSync(new URL('../cloudflare/worker.mjs', import.meta.url), 'utf8');
  assert.match(worker, /CREATE TABLE IF NOT EXISTS agent_mailbox/);
  assert.match(worker, /persistAgentExchange/);
  assert.match(worker, /handleAgentMailbox/);
  assert.match(worker, /\/api\/agent-mailbox/);
});

test('all bots can message and delegate to other bots, while admin creation stays primary-only', () => {
  const worker = fs.readFileSync(new URL('../cloudflare/worker.mjs', import.meta.url), 'utf8');
  assert.match(worker, /Any bot may coordinate with another existing bot/);
  assert.match(worker, /action\.type === 'message_agent' \|\| action\.type === 'delegate_agent'/);
  assert.match(worker, /if \(allowAgentAdmin\).*create_agent/s);
});

test('chat responses include durable inter-agent exchanges with source and target identities', () => {
  const worker = fs.readFileSync(new URL('../cloudflare/worker.mjs', import.meta.url), 'utf8');
  assert.match(worker, /interAgentMessages/);
  assert.match(worker, /sourceAgentId/);
  assert.match(worker, /targetAgentId/);
  assert.match(worker, /sourceAgentName/);
  assert.match(worker, /targetAgentName/);
});

test('web app puts bot-to-bot request and reply into the target bot thread', () => {
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /mergeAgentMailboxIntoConversations/);
  assert.match(app, /result\.interAgentMessages/);
  assert.match(app, /\/api\/agent-mailbox/);
  assert.match(app, /agentId: exchange\.sourceAgentId/);
  assert.match(app, /agentId: exchange\.targetAgentId/);
});

test('native iOS app persists bot-to-bot exchanges in bot conversations', () => {
  const models = fs.readFileSync(new URL('../ios/RipoBot/Models.swift', import.meta.url), 'utf8');
  const store = fs.readFileSync(new URL('../ios/RipoBot/AppStore.swift', import.meta.url), 'utf8');
  const api = fs.readFileSync(new URL('../ios/RipoBot/APIClient.swift', import.meta.url), 'utf8');
  assert.match(models, /struct InterAgentMessage/);
  assert.match(models, /interAgentMessages: \[InterAgentMessage\]\?/);
  assert.match(store, /mergeAgentMailbox/);
  assert.match(api, /agentMailbox/);
});
