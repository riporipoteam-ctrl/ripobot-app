const DEFAULT_MODEL = 'meta-llama/Llama-3.1-8B-Instruct';
const MAX_BODY = 96 * 1024;
const MAX_MESSAGES = 20;
const RATE_LIMIT = 24;
const SESSION_DAYS = 30;
const rateWindows = new Map();

const allowedOrigins = new Set([
  'https://ripobot.sitey.my',
  'https://www.ripobot.sitey.my',
  'http://localhost:5173'
]);

const BASE_PROMPT = [
  'You are Ripo Bot, the lead AI agent inside the Ripo Bot workspace.',
  'Be practical, warm, direct, and useful. Prefer concise answers unless the user asks for detail.',
  'Never claim a web search, file read, computer action, or external change happened unless a tool result is explicitly included in the conversation context.',
  'The user may have multiple specialist agents. Respect the current agent name, role, and instructions.'
].join(' ');

function corsHeaders(request) {
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Vary': 'Origin'
  };
  const origin = request.headers.get('Origin');
  if (origin && allowedOrigins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return headers;
}

function json(request, status, payload, extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(request),
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

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(value) {
  const raw = atob(value);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return bytesToBase64(new Uint8Array(hash));
}

async function hashPassword(password, saltBytes) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: 100_000 },
    key,
    256
  );
  return bytesToBase64(new Uint8Array(bits));
}

function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function ensureSchema(env) {
  if (!env.DB) return false;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS workspace_state (
      user_id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      object_key TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id, created_at DESC)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS computer_state (
      user_id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`)
  ]);
  return true;
}

function getBearer(request) {
  const header = request.headers.get('Authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : '';
}

async function getAuthUser(request, env) {
  if (!env.DB) return null;
  const token = getBearer(request);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const now = Date.now();
  const row = await env.DB.prepare(`
    SELECT users.id, users.email, users.display_name AS name, sessions.expires_at
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?1 AND sessions.expires_at > ?2
  `).bind(tokenHash, now).first();
  return row || null;
}

async function issueSession(env, userId) {
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const now = Date.now();
  const expiresAt = now + SESSION_DAYS * 24 * 60 * 60 * 1000;
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(tokenHash, userId, expiresAt, now).run();
  return { token, expiresAt };
}

async function handleRegister(request, env) {
  if (!env.DB) return json(request, 503, { error: 'Cloud accounts are not provisioned yet.' });
  await ensureSchema(env);
  const body = await readJsonBody(request);
  const name = String(body.name || '').trim().slice(0, 80);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
  const password = String(body.password || '');
  if (!name) return json(request, 400, { error: 'Add your name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(request, 400, { error: 'Use a valid email address.' });
  if (password.length < 8 || password.length > 200) return json(request, 400, { error: 'Password must be 8 to 200 characters.' });
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?1').bind(email).first();
  if (existing) return json(request, 409, { error: 'An account already exists for that email.' });
  const salt = new Uint8Array(16); crypto.getRandomValues(salt);
  const passwordHash = await hashPassword(password, salt);
  const userId = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare('INSERT INTO users (id, email, display_name, password_hash, password_salt, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
    .bind(userId, email, name, passwordHash, bytesToBase64(salt), now).run();
  const session = await issueSession(env, userId);
  return json(request, 201, { user: { id: userId, email, name }, ...session });
}

async function handleLogin(request, env) {
  if (!env.DB) return json(request, 503, { error: 'Cloud accounts are not provisioned yet.' });
  await ensureSchema(env);
  const body = await readJsonBody(request);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
  const password = String(body.password || '');
  const user = await env.DB.prepare('SELECT id, email, display_name AS name, password_hash, password_salt FROM users WHERE email = ?1')
    .bind(email).first();
  if (!user) return json(request, 401, { error: 'Email or password is incorrect.' });
  const actual = await hashPassword(password, base64ToBytes(user.password_salt));
  if (actual !== user.password_hash) return json(request, 401, { error: 'Email or password is incorrect.' });
  const session = await issueSession(env, user.id);
  return json(request, 200, { user: { id: user.id, email: user.email, name: user.name }, ...session });
}

async function handleSession(request, env) {
  if (!env.DB) return json(request, 200, { user: null, cloud: false });
  await ensureSchema(env);
  const user = await getAuthUser(request, env);
  return json(request, 200, { user: user ? { id: user.id, email: user.email, name: user.name } : null, cloud: Boolean(user) });
}

async function handleLogout(request, env) {
  if (env.DB) {
    const token = getBearer(request);
    if (token) {
      const tokenHash = await sha256(token);
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(tokenHash).run().catch(() => {});
    }
  }
  return json(request, 200, { ok: true });
}

async function requireUser(request, env) {
  if (!env.DB) return { error: json(request, 503, { error: 'Cloud persistence is not provisioned.' }) };
  await ensureSchema(env);
  const user = await getAuthUser(request, env);
  if (!user) return { error: json(request, 401, { error: 'Sign in again.' }) };
  return { user };
}

async function handleStateGet(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  const row = await env.DB.prepare('SELECT state_json FROM workspace_state WHERE user_id = ?1').bind(auth.user.id).first();
  if (!row) return json(request, 200, {});
  try { return json(request, 200, JSON.parse(row.state_json)); }
  catch { return json(request, 200, {}); }
}

async function handleStatePut(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  const body = await readJsonBody(request);
  const state = {
    agents: Array.isArray(body.agents) ? body.agents.slice(0, 40) : [],
    conversations: body.conversations && typeof body.conversations === 'object' ? body.conversations : {},
    teams: Array.isArray(body.teams) ? body.teams.slice(0, 30) : [],
    onboarded: Boolean(body.onboarded)
  };
  const encoded = JSON.stringify(state);
  if (encoded.length > 2_000_000) return json(request, 413, { error: 'Workspace state is too large.' });
  await env.DB.prepare(`INSERT INTO workspace_state (user_id, state_json, updated_at) VALUES (?1, ?2, ?3)
    ON CONFLICT(user_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`)
    .bind(auth.user.id, encoded, Date.now()).run();
  return json(request, 200, { ok: true, updatedAt: Date.now() });
}

async function handleFilesList(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  const rows = await env.DB.prepare('SELECT id, name, mime_type AS type, size, created_at AS createdAt FROM files WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 200')
    .bind(auth.user.id).all();
  const files = (rows.results || []).map((file) => ({ ...file, source: 'cloud', url: `${new URL(request.url).origin}/api/files/${encodeURIComponent(file.id)}` }));
  return json(request, 200, { files });
}

async function handleFileUpload(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  if (!env.FILES) return json(request, 503, { error: 'Free KV file storage is not provisioned.' });
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return json(request, 400, { error: 'Attach a file.' });
  if (file.size > 20 * 1024 * 1024) return json(request, 413, { error: 'Files are limited to 20 MB on the free storage plan.' });
  const totals = await env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS total FROM files').first();
  const userTotals = await env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS total FROM files WHERE user_id = ?1').bind(auth.user.id).first();
  if (Number(totals?.total || 0) + file.size > 900 * 1024 * 1024) return json(request, 507, { error: 'Free cloud storage is nearly full. Delete old files before uploading more.' });
  if (Number(userTotals?.total || 0) + file.size > 250 * 1024 * 1024) return json(request, 507, { error: 'This account has reached its 250 MB free upload allowance.' });
  const safeName = String(file.name || 'file').replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 140);
  const id = crypto.randomUUID();
  const key = `file:${auth.user.id}:${id}`;
  const type = file.type || 'application/octet-stream';
  const bytes = await file.arrayBuffer();
  await env.FILES.put(key, bytes, { metadata: { type, name: safeName, userId: auth.user.id } });
  const createdAt = Date.now();
  await env.DB.prepare('INSERT INTO files (id, user_id, object_key, name, mime_type, size, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
    .bind(id, auth.user.id, key, safeName, type, file.size, createdAt).run();
  return json(request, 201, { file: { id, name: safeName, type, size: file.size, source: 'cloud', createdAt, url: `${new URL(request.url).origin}/api/files/${id}` } });
}

async function handleFileGet(request, env, fileId) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  if (!env.FILES) return json(request, 503, { error: 'Free KV file storage is not provisioned.' });
  const row = await env.DB.prepare('SELECT object_key, name, mime_type FROM files WHERE id = ?1 AND user_id = ?2').bind(fileId, auth.user.id).first();
  if (!row) return json(request, 404, { error: 'File not found.' });
  const bytes = await env.FILES.get(row.object_key, { type: 'arrayBuffer' });
  if (!bytes) return json(request, 404, { error: 'File object not found.' });
  const headers = new Headers(corsHeaders(request));
  headers.set('Content-Type', row.mime_type || 'application/octet-stream');
  headers.set('Content-Disposition', `inline; filename="${String(row.name).replaceAll('"', '')}"`);
  return new Response(bytes, { status: 200, headers });
}

function normalizeMessages(input) {
  if (!Array.isArray(input)) throw new Error('Add a message before sending.');
  return input.slice(-MAX_MESSAGES).map((message) => {
    const role = message?.role;
    const content = typeof message?.content === 'string' ? message.content.trim() : '';
    if (!['user', 'assistant'].includes(role) || !content || content.length > 12_000) throw new Error('Messages must contain text under 12,000 characters.');
    return { role, content };
  });
}

async function callHuggingFace(messages, env) {
  if (!env.HF_TOKEN) return null;
  const model = env.HF_MODEL || DEFAULT_MODEL;
  const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.HF_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: 900, temperature: 0.68 }),
    signal: AbortSignal.timeout(40_000)
  });
  if (!response.ok) return null;
  const data = await response.json();
  const reply = data?.choices?.[0]?.message?.content?.trim();
  return reply ? { reply, provider: 'huggingface', model } : null;
}

async function callWorkersAI(messages, env) {
  if (!env.AI) return null;
  const model = '@cf/meta/llama-3.1-8b-instruct-fp8';
  const result = await env.AI.run(model, { messages, max_tokens: 900, temperature: 0.68 });
  const reply = typeof result?.response === 'string' ? result.response.trim() : '';
  return reply ? { reply, provider: 'cloudflare-ai', model } : null;
}

async function callBackup(messages) {
  const response = await fetch('https://text.pollinations.ai/openai', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'openai', messages, max_tokens: 900, temperature: 0.68, private: true }),
    signal: AbortSignal.timeout(35_000)
  });
  if (!response.ok) return null;
  const data = await response.json();
  const reply = data?.choices?.[0]?.message?.content?.trim();
  return reply ? { reply, provider: 'backup', model: 'OpenAI-compatible backup' } : null;
}

function decodeHtml(value) {
  return String(value || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function stripTags(value) { return decodeHtml(String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim(); }

async function fetchText(url) {
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 RipoBot/2.0' }, signal: AbortSignal.timeout(10_000) });
    return response.ok ? await response.text() : null;
  } catch { return null; }
}

async function searchWeb(query) {
  const q = String(query || '').trim().slice(0, 500);
  if (!q) return [];
  const results = [];
  const news = await fetchText(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`);
  if (news) {
    const itemRe = /<item>([\s\S]*?)<\/item>/gi;
    let item;
    while ((item = itemRe.exec(news)) && results.length < 5) {
      const block = item[1];
      const title = /<title>([\s\S]*?)<\/title>/i.exec(block)?.[1];
      const link = /<link>([\s\S]*?)<\/link>/i.exec(block)?.[1];
      const date = /<pubDate>([\s\S]*?)<\/pubDate>/i.exec(block)?.[1];
      if (title) results.push({ title: stripTags(title), url: decodeHtml(link || ''), snippet: date ? `Published ${stripTags(date)}` : '' });
    }
  }
  if (results.length) return results;

  const ddg = await fetchText(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`);
  if (ddg) {
    const linkRe = /<a[^>]*href="([^"]+)"[^>]*class=['"]result-link['"][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkRe.exec(ddg)) && results.length < 5) {
      let url = match[1];
      if (url.startsWith('//')) url = `https:${url}`;
      const redirect = /[?&]uddg=([^&]+)/.exec(url);
      if (redirect) { try { url = decodeURIComponent(redirect[1]); } catch {} }
      results.push({ title: stripTags(match[2]), url, snippet: '' });
    }
  }
  if (results.length) return results;

  const wiki = await fetchText(`https://en.wikipedia.org/w/api.php?action=opensearch&limit=4&format=json&origin=*&search=${encodeURIComponent(q)}`);
  if (wiki) {
    try {
      const data = JSON.parse(wiki);
      const titles = data?.[1] || [], descriptions = data?.[2] || [], urls = data?.[3] || [];
      for (let i = 0; i < titles.length && i < 4; i += 1) results.push({ title: titles[i], url: urls[i], snippet: descriptions[i] || '' });
    } catch {}
  }
  return results;
}

function searchContext(results) {
  if (!results.length) return '';
  return ['Fresh web search results:', ...results.map((result, index) => `${index + 1}. ${result.title}\n${result.snippet || ''}\n${result.url || ''}`)].join('\n');
}

function extractActions(text) {
  const actions = [];
  let clean = String(text || '');
  const regex = /<ripo_action>([\s\S]*?)<\/ripo_action>/gi;
  clean = clean.replace(regex, (_, raw) => {
    try {
      const parsed = JSON.parse(raw.trim());
      if (parsed && ['create_agent', 'create_team', 'rename_agent'].includes(parsed.type)) actions.push(parsed);
    } catch {}
    return '';
  });
  const rename = /^\s*\[\[rename:([^\]]{1,80})\]\]\s*/i.exec(clean);
  if (rename) {
    actions.push({ type: 'rename_agent', name: rename[1].trim() });
    clean = clean.slice(rename[0].length);
  }
  return { reply: clean.trim(), actions };
}

async function handleChat(request, env) {
  if (!withinRateLimit(request)) return json(request, 429, { error: 'Too many messages at once. Try again in a minute.' }, { 'Retry-After': '60' });
  const body = await readJsonBody(request);
  let messages;
  try { messages = normalizeMessages(body.messages); }
  catch (error) { return json(request, 400, { error: error.message }); }

  const agentName = String(body.agentName || 'Ripo Bot').slice(0, 80);
  const agentRole = String(body.agentRole || 'AI agent').slice(0, 120);
  const agentInstructions = String(body.agentInstructions || '').slice(0, 2200);
  const allowAgentAdmin = Boolean(body.allowAgentAdmin);
  const allowRename = Boolean(body.allowRename);
  const lastUser = [...messages].reverse().find((message) => message.role === 'user')?.content || '';
  let sources = [];
  if (body.search) sources = await searchWeb(lastUser);

  const capabilities = [];
  if (allowAgentAdmin) {
    capabilities.push(`When the user explicitly asks you to create a new specialist agent, you may include exactly one machine-readable action after your normal response using: <ripo_action>{"type":"create_agent","name":"Name","role":"Role","description":"Short description","instructions":"Instructions","avatar":"nova"}</ripo_action>.`);
    capabilities.push(`When the user explicitly asks you to form a team from existing agents, you may include: <ripo_action>{"type":"create_team","name":"Team name","memberNames":["Agent One","Agent Two"]}</ripo_action>.`);
    capabilities.push(`When the user explicitly asks you to rename another agent, you may include: <ripo_action>{"type":"rename_agent","targetName":"Current agent name","name":"New name"}</ripo_action>.`);
  }
  if (allowRename) capabilities.push('If your own role changes substantially and a better short name is useful, you may put [[rename:New Name]] at the very start of your reply. Do this rarely and only when it clearly helps.');

  const system = [
    BASE_PROMPT,
    `You are currently ${agentName}, role: ${agentRole}.`,
    agentInstructions ? `Agent-specific instructions: ${agentInstructions}` : '',
    capabilities.join(' '),
    sources.length ? `${searchContext(sources)}\nUse these results when answering and distinguish uncertainty. Do not invent sources beyond this list.` : ''
  ].filter(Boolean).join('\n\n');

  const requestMessages = [{ role: 'system', content: system }, ...messages];
  let result = null;
  try { result = await callHuggingFace(requestMessages, env); } catch {}
  if (!result) { try { result = await callWorkersAI(requestMessages, env); } catch {} }
  if (!result) { try { result = await callBackup(requestMessages); } catch {} }
  if (!result) return json(request, 502, { error: 'Ripo Bot could not reach an AI model.' });
  const parsed = extractActions(result.reply);
  return json(request, 200, { ...result, reply: parsed.reply || 'Done.', actions: parsed.actions, sources });
}

async function handleSearch(request) {
  const body = await readJsonBody(request);
  const results = await searchWeb(body.query);
  return json(request, 200, { results });
}

function defaultComputerState(userId) {
  return {
    cwd: '/home/ripo',
    dirs: ['/', '/home', '/home/ripo'],
    files: {
      '/home/ripo/README.txt': 'Welcome to Ripo Computer Lite. Type help to see commands.\nYour workspace is private to your Ripo Bot account.'
    },
    userId
  };
}

function normPath(cwd, input = '.') {
  const raw = String(input || '.').trim();
  const combined = raw.startsWith('/') ? raw : `${cwd}/${raw}`;
  const parts = [];
  for (const part of combined.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop(); else parts.push(part);
  }
  return '/' + parts.join('/');
}

async function getComputerState(env, userId) {
  const row = await env.DB.prepare('SELECT state_json FROM computer_state WHERE user_id = ?1').bind(userId).first();
  if (!row?.state_json) return defaultComputerState(userId);
  try { return JSON.parse(row.state_json); } catch { return defaultComputerState(userId); }
}

async function saveComputerState(env, userId, state) {
  const encoded = JSON.stringify(state);
  if (encoded.length > 1_500_000) throw new Error('Ripo Computer workspace is full. Remove some files first.');
  await env.DB.prepare(`INSERT INTO computer_state (user_id, state_json, updated_at) VALUES (?1, ?2, ?3)
    ON CONFLICT(user_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`)
    .bind(userId, encoded, Date.now()).run();
}

function childNames(state, dir) {
  const prefix = dir === '/' ? '/' : dir + '/';
  const names = new Set();
  for (const path of state.dirs || []) {
    if (path !== dir && path.startsWith(prefix)) { const rest = path.slice(prefix.length); if (rest && !rest.includes('/')) names.add(rest + '/'); }
  }
  for (const path of Object.keys(state.files || {})) {
    if (path.startsWith(prefix)) { const rest = path.slice(prefix.length); if (rest && !rest.includes('/')) names.add(rest); }
  }
  return [...names].sort();
}

function browserUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('Add a URL, for example: open https://example.com');
  const value = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only http and https URLs are supported.');
  const host = parsed.hostname.toLowerCase();
  const blocked = host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') ||
    /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:');
  if (blocked) throw new Error('Private or local network addresses are not allowed.');
  if (parsed.href.length > 2048) throw new Error('URL is too long.');
  return parsed.href;
}

async function browserQuickText(env, action, input) {
  if (!env.BROWSER) throw new Error('Browser Run is unavailable.');
  const url = browserUrl(input);
  const response = await env.BROWSER.quickAction(action, {
    url,
    gotoOptions: { waitUntil: 'domcontentloaded', timeout: 20000 }
  });
  const browserMs = Number(response.headers.get('X-Browser-Ms-Used') || 0);
  const raw = await response.text();
  if (!response.ok) {
    if (response.status === 429) throw new Error('The free Browser Run allowance is used up for today. Try again tomorrow.');
    throw new Error(`Browser Run failed with HTTP ${response.status}.`);
  }
  let value = raw;
  try {
    const parsed = JSON.parse(raw);
    value = parsed?.result?.markdown ?? parsed?.result?.content ?? parsed?.result ?? parsed?.markdown ?? raw;
    if (typeof value !== 'string') value = JSON.stringify(value, null, 2);
  } catch {}
  return { url, text: String(value).slice(0, 16000), browserMs };
}

async function handleComputerExec(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  const body = await readJsonBody(request);
  const command = String(body.command || '').trim();
  if (!command) return json(request, 400, { error: 'Enter a command.' });
  const state = await getComputerState(env, auth.user.id);
  const [nameRaw, ...rest] = command.split(/\s+/);
  const name = nameRaw.toLowerCase();
  const arg = rest.join(' ');
  let stdout = '';
  let stderr = '';
  let changed = false;

  if (name === 'help') stdout = 'Commands: pwd, ls [path], cd <dir>, mkdir <dir>, touch <file>, cat <file>, echo <text> > <file>, rm <path>, cp <src> <dst>, mv <src> <dst>, files, search <query>, open <url>, links <url>, whoami, uname, date, clear, help';
  else if (name === 'pwd') stdout = state.cwd;
  else if (name === 'whoami') stdout = auth.user.email;
  else if (name === 'uname') stdout = 'RipoOS Lite 1.0 · Cloudflare Worker virtual workspace';
  else if (name === 'date') stdout = new Date().toISOString();
  else if (name === 'clear') stdout = '__CLEAR__';
  else if (name === 'ls') {
    const path = normPath(state.cwd, arg || '.');
    if (!(state.dirs || []).includes(path)) stderr = `ls: ${path}: not a directory`; else stdout = childNames(state, path).join('  ') || '(empty)';
  } else if (name === 'cd') {
    const path = normPath(state.cwd, arg || '/home/ripo');
    if (!(state.dirs || []).includes(path)) stderr = `cd: ${path}: no such directory`; else { state.cwd = path; stdout = path; changed = true; }
  } else if (name === 'mkdir') {
    if (!arg) stderr = 'mkdir: missing directory'; else { const path = normPath(state.cwd, arg); if (!state.dirs.includes(path)) { state.dirs.push(path); changed = true; } stdout = path; }
  } else if (name === 'touch') {
    if (!arg) stderr = 'touch: missing file'; else { const path = normPath(state.cwd, arg); if (!(path in state.files)) state.files[path] = ''; changed = true; stdout = path; }
  } else if (name === 'cat') {
    const path = normPath(state.cwd, arg); if (!(path in state.files)) stderr = `cat: ${path}: no such file`; else stdout = state.files[path];
  } else if (name === 'echo') {
    const match = /^([\s\S]*?)\s*>\s*(\S+)\s*$/.exec(arg);
    if (!match) stdout = arg; else { const path = normPath(state.cwd, match[2]); state.files[path] = match[1]; changed = true; stdout = path; }
  } else if (name === 'rm') {
    const path = normPath(state.cwd, arg);
    if (path in state.files) { delete state.files[path]; changed = true; }
    else if (state.dirs.includes(path) && path !== '/' && path !== '/home' && path !== '/home/ripo') { state.dirs = state.dirs.filter((d) => d !== path && !d.startsWith(path + '/')); for (const f of Object.keys(state.files)) if (f.startsWith(path + '/')) delete state.files[f]; changed = true; }
    else stderr = `rm: ${path}: not found`;
  } else if (name === 'cp' || name === 'mv') {
    const parts = rest;
    if (parts.length < 2) stderr = `${name}: source and destination required`;
    else { const src = normPath(state.cwd, parts[0]), dst = normPath(state.cwd, parts[1]); if (!(src in state.files)) stderr = `${name}: ${src}: no such file`; else { state.files[dst] = state.files[src]; if (name === 'mv') delete state.files[src]; changed = true; stdout = dst; } }
  } else if (name === 'files') {
    const rows = await env.DB.prepare('SELECT id, name, size FROM files WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 50').bind(auth.user.id).all();
    stdout = (rows.results || []).map((f) => `${f.id}  ${f.name}  ${Math.max(1, Math.round(Number(f.size || 0)/1024))}KB`).join('\n') || 'No uploaded cloud files.';
  } else if (name === 'search') {
    if (!arg) stderr = 'search: add a query'; else { const results = await searchWeb(arg); stdout = results.map((r, i) => `${i+1}. ${r.title}\n${r.url}\n${r.snippet || ''}`).join('\n\n') || 'No results.'; }
  } else if (name === 'open' || name === 'browser') {
    try {
      const rendered = await browserQuickText(env, 'markdown', arg);
      stdout = `Rendered with Cloudflare Browser Run · ${Math.max(1, rendered.browserMs)}ms\n${rendered.url}\n\n${rendered.text}`;
    } catch (error) { stderr = error.message || 'Browser Run failed.'; }
  } else if (name === 'links') {
    try {
      const rendered = await browserQuickText(env, 'links', arg);
      stdout = `Rendered links · ${Math.max(1, rendered.browserMs)}ms\n${rendered.url}\n\n${rendered.text}`;
    } catch (error) { stderr = error.message || 'Browser Run failed.'; }
  } else stderr = `${nameRaw}: command not found. Type help.`;

  if (changed) await saveComputerState(env, auth.user.id, state);
  return json(request, 200, { stdout, stderr, cwd: state.cwd, provider: 'Ripo Computer Lite' });
}

async function readJsonBody(request) {
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) throw new Error('Use an application/json request.');
  const announcedSize = Number(request.headers.get('Content-Length') || 0);
  if (announcedSize > MAX_BODY) throw new Error('Request is too large.');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY) throw new Error('Request is too large.');
  try { return JSON.parse(raw || '{}'); }
  catch { throw new Error('Send valid JSON.'); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') && request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(request),
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-RipoBot-Access-Code',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    try {
      if (url.pathname === '/api/health' && request.method === 'GET') return json(request, 200, { status: 'ok', app: 'ripobot', version: 2 });
      if (url.pathname === '/api/config' && request.method === 'GET') return json(request, 200, {
        primaryModel: env.HF_MODEL || DEFAULT_MODEL,
        huggingFaceConfigured: Boolean(env.HF_TOKEN),
        cloudflareAiReady: Boolean(env.AI),
        authReady: Boolean(env.DB),
        storageReady: Boolean(env.DB && env.FILES),
        computerReady: Boolean(env.DB),
        storageProvider: env.FILES ? 'Workers KV Free' : 'device',
        computerProvider: 'Ripo Computer Lite',
        browserReady: Boolean(env.BROWSER),
        browserProvider: env.BROWSER ? 'Cloudflare Browser Run Free' : 'Search fallback'
      });

      if (url.pathname === '/api/auth/register' && request.method === 'POST') return handleRegister(request, env);
      if (url.pathname === '/api/auth/login' && request.method === 'POST') return handleLogin(request, env);
      if (url.pathname === '/api/auth/session' && request.method === 'GET') return handleSession(request, env);
      if (url.pathname === '/api/auth/logout' && request.method === 'POST') return handleLogout(request, env);
      if (url.pathname === '/api/state' && request.method === 'GET') return handleStateGet(request, env);
      if (url.pathname === '/api/state' && request.method === 'PUT') return handleStatePut(request, env);
      if (url.pathname === '/api/files' && request.method === 'GET') return handleFilesList(request, env);
      if (url.pathname === '/api/files' && request.method === 'POST') return handleFileUpload(request, env);
      if (url.pathname.startsWith('/api/files/') && request.method === 'GET') return handleFileGet(request, env, decodeURIComponent(url.pathname.slice('/api/files/'.length)));
      if (url.pathname === '/api/search' && request.method === 'POST') return handleSearch(request);
      if (url.pathname === '/api/chat' && request.method === 'POST') return handleChat(request, env);
      if (url.pathname === '/api/computer/status' && request.method === 'GET') return json(request, 200, { configured: Boolean(env.DB), provider: 'Ripo Computer Lite', linux: true, browser: Boolean(env.BROWSER), browserProvider: env.BROWSER ? 'Cloudflare Browser Run Free' : 'Search fallback', browserFreeLimit: '10 minutes/day', persistent: Boolean(env.DB), note: 'Zero-cost Linux-style workspace with persistent files and real rendered browsing on the Browser Run free allowance.' });
      if (url.pathname === '/api/computer/exec' && request.method === 'POST') return handleComputerExec(request, env);
      if (url.pathname.startsWith('/api/')) return json(request, 404, { error: 'API route not found.' });
      return json(request, 404, { error: 'Ripo Bot API is online.' });
    } catch (error) {
      return json(request, error?.message === 'Request is too large.' ? 413 : 400, { error: error?.message || 'Request failed.' });
    }
  }
};
