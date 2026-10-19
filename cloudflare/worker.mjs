const MODEL = 'meta-llama/Llama-3.1-8B-Instruct';
const MAX_BODY = 48 * 1024;
const MAX_MESSAGES = 16;
const RATE_LIMIT = 12;
const rateWindows = new Map();
const allowedOrigins = new Set([
  'https://ripobot.sitey.my',
  'https://www.ripobot.sitey.my',
  'http://localhost:5173'
]);

const BASE_PROMPT = [
  'You are RipoBot, a helpful AI teammate. Be warm and clear. Use short, useful answers by default.',
  'This web workspace can currently chat and create local task records. Do not claim to have searched the web, opened files, sent messages, changed external apps, scheduled unattended work, or executed code.',
  'If a request needs an unavailable integration or computer, say what is missing and still help with a draft, checklist, or plan.'
].join(' ');

function responseHeaders(request) {
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Vary': 'Origin'
  };
  const origin = request.headers.get('Origin');
  if (origin && allowedOrigins.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(request, status, payload, extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...responseHeaders(request),
      'Content-Type': 'application/json; charset=utf-8',
      ...extra
    }
  });
}

function withinRateLimit(request) {
  const now = Date.now();
  const address = request.headers.get('cf-connecting-ip') || 'unknown';
  const previous = rateWindows.get(address);
  if (!previous || now - previous.startedAt > 60_000) {
    rateWindows.set(address, { startedAt: now, count: 1 });
    return true;
  }
  previous.count += 1;
  return previous.count <= RATE_LIMIT;
}

function normalizeMessages(input) {
  if (!Array.isArray(input)) throw new Error('Add a message before sending.');
  return input.slice(-MAX_MESSAGES).map((message) => {
    const role = message?.role;
    const content = typeof message?.content === 'string' ? message.content.trim() : '';
    if (!['user', 'assistant'].includes(role) || !content || content.length > 8000) {
      throw new Error('Messages must contain text under 8,000 characters.');
    }
    return { role, content };
  });
}

function hasPrimaryAccess(request, env) {
  const expected = env.RIPO_ACCESS_CODE || '';
  const supplied = request.headers.get('X-RipoBot-Access-Code') || '';
  if (!env.HF_TOKEN || !expected || !supplied) return false;
  const expectedBytes = new TextEncoder().encode(expected);
  const suppliedBytes = new TextEncoder().encode(supplied);
  let mismatch = expectedBytes.length ^ suppliedBytes.length;
  const count = Math.max(expectedBytes.length, suppliedBytes.length);
  for (let i = 0; i < count; i += 1) mismatch |= (expectedBytes[i] || 0) ^ (suppliedBytes[i] || 0);
  return mismatch === 0;
}

async function callHuggingFace(messages, env) {
  if (!env.HF_TOKEN || !env.RIPO_ACCESS_CODE) return null;
  const model = env.HF_MODEL || MODEL;
  const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.HF_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model, messages, max_tokens: 700, temperature: 0.7 }),
    signal: AbortSignal.timeout(35_000)
  });
  if (!response.ok) return null;
  const data = await response.json();
  const reply = data?.choices?.[0]?.message?.content?.trim();
  return reply ? { reply, provider: 'huggingface', model } : null;
}

async function callWorkersAI(messages, env) {
  if (!env.AI) return null;
  const model = '@cf/meta/llama-3.1-8b-instruct-fp8';
  const result = await env.AI.run(model, {
    messages,
    max_tokens: 700,
    temperature: 0.7
  });
  const reply = typeof result?.response === 'string' ? result.response.trim() : '';
  return reply ? { reply, provider: 'cloudflare-ai', model } : null;
}

async function callBackup(messages) {
  const response = await fetch('https://text.pollinations.ai/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'openai', messages, max_tokens: 700, temperature: 0.7, private: true }),
    signal: AbortSignal.timeout(35_000)
  });
  if (!response.ok) return null;
  const data = await response.json();
  const reply = data?.choices?.[0]?.message?.content?.trim();
  return reply ? { reply, provider: 'pollinations', model: 'OpenAI-compatible backup' } : null;
}

async function handleChat(request, env) {
  if (!withinRateLimit(request)) {
    return json(request, 429, { error: 'That is a lot of messages at once. Please try again in a minute.' }, { 'Retry-After': '60' });
  }
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) {
    return json(request, 415, { error: 'Use an application/json request.' });
  }

  const announcedSize = Number(request.headers.get('Content-Length') || 0);
  if (announcedSize > MAX_BODY) return json(request, 413, { error: 'Request is too large.' });
  let body;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY) return json(request, 413, { error: 'Request is too large.' });
    body = JSON.parse(raw);
  } catch {
    return json(request, 400, { error: 'Send a valid JSON request.' });
  }

  let messages;
  try {
    messages = normalizeMessages(body.messages);
  } catch (error) {
    return json(request, 400, { error: error.message });
  }
  const agentName = typeof body.agentName === 'string' ? body.agentName.slice(0, 80) : 'Ripo';
  const agentRole = typeof body.agentRole === 'string' ? body.agentRole.slice(0, 120) : 'AI teammate';
  const agentInstructions = typeof body.agentInstructions === 'string' ? body.agentInstructions.slice(0, 1400) : '';
  const prompt = `${BASE_PROMPT} You are currently speaking as ${agentName}, a ${agentRole}. ${agentInstructions}`;
  const requestMessages = [{ role: 'system', content: prompt }, ...messages];

  try {
    const primary = hasPrimaryAccess(request, env) ? await callHuggingFace(requestMessages, env) : null;
    if (primary) return json(request, 200, primary);
  } catch {
    // Follow the Discord bot's fallback behavior when Hugging Face is unavailable.
  }
  try {
    const compatibleModel = await callWorkersAI(requestMessages, env);
    if (compatibleModel) return json(request, 200, compatibleModel);
  } catch (error) {
    console.warn('Cloudflare AI request failed:', error?.message || 'unknown error');
  }
  try {
    const backup = await callBackup(requestMessages);
    if (backup) return json(request, 200, backup);
  } catch {
    // Return a provider-neutral error below.
  }
  return json(request, 502, { error: 'RipoBot could not reach its AI model. Please try again.' });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') && request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...responseHeaders(request),
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-RipoBot-Access-Code',
          'Access-Control-Max-Age': '86400'
        }
      });
    }
    if (url.pathname === '/api/health' && request.method === 'GET') {
      return json(request, 200, { status: 'ok', app: 'ripobot' });
    }
    if (url.pathname === '/api/config' && request.method === 'GET') {
      return json(request, 200, {
        primaryModel: env.HF_MODEL || MODEL,
        primaryConfigured: Boolean(env.HF_TOKEN),
        accessCodeRequired: Boolean(env.HF_TOKEN && env.RIPO_ACCESS_CODE),
        accessCodeSetupRequired: Boolean(env.HF_TOKEN && !env.RIPO_ACCESS_CODE),
        huggingFaceReady: hasPrimaryAccess(request, env),
        cloudflareAiReady: Boolean(env.AI),
        backupReady: true
      });
    }
    if (url.pathname === '/api/chat' && request.method === 'POST') return handleChat(request, env);
    if (url.pathname.startsWith('/api/')) return json(request, 404, { error: 'API route not found.' });
    return json(request, 404, { error: 'RipoBot API is online.' });
  }
};
