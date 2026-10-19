import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile?.('.env');
} catch {
  // A local .env file is optional; production values come from the host.
}

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(root, 'dist');
const port = Number(process.env.RIPO_PORT || process.env.PORT || 8788);
const model = process.env.HF_MODEL || 'meta-llama/Llama-3.1-8B-Instruct';
const rateWindows = new Map();
const MAX_BODY = 48 * 1024;

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp'
};

const BASE_PROMPT = [
  'You are RipoBot, a helpful AI teammate. Be warm and clear. Use short, useful answers by default.',
  'This web workspace can currently chat and create local task records. Do not claim to have searched the web, opened files, sent messages, changed external apps, scheduled unattended work, or executed code.',
  'If a request needs an unavailable integration or computer, say what is missing and still help with a draft, checklist, or plan.'
].join(' ');

function json(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin'
  });
  response.end(JSON.stringify(payload));
}

function requestAddress(request) {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length < 200) {
    return forwarded.split(',')[0].trim() || request.socket.remoteAddress || 'unknown';
  }
  return request.socket.remoteAddress || 'unknown';
}

function withinRateLimit(request) {
  const now = Date.now();
  const address = requestAddress(request);
  const previous = rateWindows.get(address);
  if (!previous || now - previous.startedAt > 60_000) {
    rateWindows.set(address, { startedAt: now, count: 1 });
    return true;
  }
  previous.count += 1;
  return previous.count <= 12;
}

async function readJson(request) {
  let size = 0;
  const parts = [];
  for await (const part of request) {
    size += part.length;
    if (size > MAX_BODY) throw new Error('Request is too large.');
    parts.push(part);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } catch {
    throw new Error('Send a valid JSON request.');
  }
}

function normalizeMessages(input) {
  if (!Array.isArray(input)) throw new Error('Add a message before sending.');
  return input.slice(-16).map((message) => {
    const role = message?.role;
    const content = typeof message?.content === 'string' ? message.content.trim() : '';
    if (!['user', 'assistant'].includes(role) || !content || content.length > 8000) {
      throw new Error('Messages must contain text under 8,000 characters.');
    }
    return { role, content };
  });
}

async function callHuggingFace(messages) {
  const token = process.env.HF_TOKEN;
  if (!token || !process.env.RIPO_ACCESS_CODE) return null;
  const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 700,
      temperature: 0.7
    }),
    signal: AbortSignal.timeout(35_000)
  });
  if (!response.ok) return null;
  const data = await response.json();
  const reply = data?.choices?.[0]?.message?.content?.trim();
  return reply ? { reply, provider: 'huggingface', model } : null;
}

function hasPrimaryAccess(request) {
  const expected = process.env.RIPO_ACCESS_CODE;
  const supplied = request.headers['x-ripobot-access-code'];
  if (!process.env.HF_TOKEN || !expected || typeof supplied !== 'string') return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
}

async function callBackup(messages) {
  const response = await fetch('https://text.pollinations.ai/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai',
      messages,
      max_tokens: 700,
      temperature: 0.7,
      private: true
    }),
    signal: AbortSignal.timeout(35_000)
  });
  if (!response.ok) return null;
  const data = await response.json();
  const reply = data?.choices?.[0]?.message?.content?.trim();
  return reply ? { reply, provider: 'pollinations', model: 'OpenAI-compatible backup' } : null;
}

async function handleChat(request, response) {
  if (!withinRateLimit(request)) {
    response.setHeader('Retry-After', '60');
    return json(response, 429, { error: 'That is a lot of messages at once. Please try again in a minute.' });
  }
  if (!String(request.headers['content-type'] || '').includes('application/json')) {
    return json(response, 415, { error: 'Use an application/json request.' });
  }
  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    return json(response, 400, { error: error.message });
  }

  let messages;
  try {
    messages = normalizeMessages(body.messages);
  } catch (error) {
    return json(response, 400, { error: error.message });
  }
  const agentName = typeof body.agentName === 'string' ? body.agentName.slice(0, 80) : 'Ripo';
  const agentRole = typeof body.agentRole === 'string' ? body.agentRole.slice(0, 120) : 'AI teammate';
  const agentInstructions = typeof body.agentInstructions === 'string' ? body.agentInstructions.slice(0, 1400) : '';
  const system = BASE_PROMPT + ' You are currently speaking as ' + agentName + ', a ' + agentRole + '. ' + agentInstructions;
  const requestMessages = [{ role: 'system', content: system }, ...messages];

  try {
    const primary = hasPrimaryAccess(request) ? await callHuggingFace(requestMessages) : null;
    if (primary) return json(response, 200, primary);
  } catch {
    // The Discord bot also falls back when Hugging Face is unavailable.
  }

  try {
    const backup = await callBackup(requestMessages);
    if (backup) return json(response, 200, backup);
  } catch {
    // A friendly API error is returned below without exposing provider details.
  }

  return json(response, 502, {
    error: 'RipoBot could not reach its AI model. Check the Hugging Face token and try again.'
  });
}

async function serveStatic(request, response) {
  const rawPath = new URL(request.url || '/', 'http://localhost').pathname;
  let relative;
  try {
    relative = decodeURIComponent(rawPath).replace(/^\/+/, '');
  } catch {
    return json(response, 400, { error: 'Invalid path.' });
  }
  let filename = resolve(dist, relative || 'index.html');
  if (filename !== dist && !filename.startsWith(dist + sep)) {
    return json(response, 403, { error: 'Path is not available.' });
  }
  try {
    const info = await stat(filename);
    if (info.isDirectory()) filename = resolve(filename, 'index.html');
  } catch {
    filename = resolve(dist, 'index.html');
  }
  try {
    const data = await readFile(filename);
    response.writeHead(200, {
      'Content-Type': mimeTypes[extname(filename)] || 'application/octet-stream',
      'Cache-Control': filename.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'DENY'
    });
    response.end(data);
  } catch {
    json(response, 404, { error: 'Build the web app before starting the production server.' });
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://localhost');
  if (url.pathname === '/api/health') {
    return json(response, 200, { status: 'ok', app: 'ripobot' });
  }
  if (url.pathname === '/api/config') {
    return json(response, 200, {
      primaryModel: model,
      primaryConfigured: Boolean(process.env.HF_TOKEN),
      accessCodeRequired: Boolean(process.env.HF_TOKEN && process.env.RIPO_ACCESS_CODE),
      accessCodeSetupRequired: Boolean(process.env.HF_TOKEN && !process.env.RIPO_ACCESS_CODE),
      huggingFaceReady: hasPrimaryAccess(request),
      backupReady: true
    });
  }
  if (url.pathname === '/api/chat' && request.method === 'POST') {
    return handleChat(request, response);
  }
  if (url.pathname.startsWith('/api/')) {
    return json(response, 404, { error: 'API route not found.' });
  }
  if (process.argv.includes('--api-only')) {
    return json(response, 404, { error: 'API-only development server.' });
  }
  return serveStatic(request, response);
});

server.listen(port, '0.0.0.0', () => {
  console.log('RipoBot server listening on port ' + port);
});
