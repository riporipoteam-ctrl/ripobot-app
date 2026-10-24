const DEFAULT_MODEL = 'meta-llama/Llama-3.1-8B-Instruct';
const MAX_BODY = 96 * 1024;
const MAX_MESSAGES = 20;
const RATE_LIMIT = 24;
const SESSION_DAYS = 30;
const ADMIN_EMAIL = 'ripo.ripoteam@gmail.com';
const COINS_PER_CHAT = 2;
const DAILY_COIN_REWARD = 25;
const PLUS_COIN_COST = 1200;
const PLUS_DAYS = 30;
const PLAN_LIMITS = {
  free: { threeHourTokens: 45_000, weeklyTokens: 300_000, storageBytes: 250 * 1024 * 1024, workspaceLimit: 1 },
  plus: { threeHourTokens: null, weeklyTokens: 1_500_000, storageBytes: 750 * 1024 * 1024, workspaceLimit: 2 }
};
const ZERO_KEY_PLUGIN_CATALOG = [
  {
    id: 'open-meteo',
    name: 'Open-Meteo',
    provider: 'open-meteo.com',
    category: 'Weather',
    description: 'Current weather and forecasts worldwide with no account or API key.',
    homepage: 'https://open-meteo.com/',
    logo: 'https://open-meteo.com/favicon.ico',
    accent: '#2f86ff',
    zeroKey: true,
    actions: [
      { id: 'weather', label: 'Weather', description: 'Get current weather and a short forecast for a place.', args: { location: 'City or place name' } }
    ]
  },
  {
    id: 'wikipedia',
    name: 'Wikipedia',
    provider: 'wikipedia.org',
    category: 'Knowledge',
    description: 'Search and read public Wikipedia summaries and articles.',
    homepage: 'https://www.wikipedia.org/',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/8/80/Wikipedia-logo-v2.svg',
    accent: '#111111',
    zeroKey: true,
    actions: [
      { id: 'search', label: 'Search', description: 'Search Wikipedia and return concise article extracts.', args: { query: 'Topic to search' } }
    ]
  },
  {
    id: 'hacker-news',
    name: 'Hacker News',
    provider: 'news.ycombinator.com',
    category: 'News',
    description: 'Read top technology stories from the public Hacker News API.',
    homepage: 'https://news.ycombinator.com/',
    logo: 'https://news.ycombinator.com/y18.svg',
    accent: '#ff6600',
    zeroKey: true,
    actions: [
      { id: 'top', label: 'Top stories', description: 'Get current top Hacker News stories.', args: { limit: '1-10 results' } },
      { id: 'item', label: 'Story', description: 'Fetch a Hacker News story or comment by numeric ID.', args: { id: 'Numeric item ID' } }
    ]
  },
  {
    id: 'npm-registry',
    name: 'npm Registry',
    provider: 'npmjs.com',
    category: 'Developer',
    description: 'Search public npm packages and inspect package metadata without signing in.',
    homepage: 'https://www.npmjs.com/',
    logo: 'https://www.npmjs.com/favicon.ico',
    accent: '#cb3837',
    zeroKey: true,
    actions: [
      { id: 'search', label: 'Search packages', description: 'Search public npm packages.', args: { query: 'Package or keyword' } },
      { id: 'package', label: 'Package info', description: 'Read public metadata for an exact npm package.', args: { name: 'Exact package name' } }
    ]
  },
  {
    id: 'github-public',
    name: 'GitHub Public',
    provider: 'github.com',
    category: 'Developer',
    description: 'Search public GitHub repositories using GitHub’s unauthenticated public API allowance.',
    homepage: 'https://github.com/',
    logo: 'https://github.githubassets.com/favicons/favicon.svg',
    accent: '#111111',
    zeroKey: true,
    actions: [
      { id: 'search_repos', label: 'Search repositories', description: 'Search public GitHub repositories.', args: { query: 'Repository search query' } },
      { id: 'repo', label: 'Repository info', description: 'Read public repository metadata.', args: { repo: 'owner/name' } }
    ]
  }
];

const rateWindows = new Map();

const allowedOrigins = new Set([
  'https://ripobot.sitey.my',
  'https://www.ripobot.sitey.my',
  'http://localhost:5173'
]);

const BASE_PROMPT = [
  'You are an AI bot operating inside the Ripo Bot product.',
  'Ripo Bot is the product name and also the name of the main bot. Never call yourself Ripo Bot unless the current bot name is exactly Ripo Bot.',
  'Always preserve your assigned bot identity, role, and instructions. When referring to yourself, use your own current bot name.',
  'Be practical, warm, direct, and useful. Prefer concise answers unless the user asks for detail.',
  'Never claim a web search, file read, image inspection, computer action, file edit, or external change happened unless a tool result or attachment context explicitly proves it.'
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
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_meta (
      user_id TEXT PRIMARY KEY,
      role TEXT NOT NULL DEFAULT 'user',
      plan TEXT NOT NULL DEFAULT 'free',
      plan_expires_at INTEGER,
      coins INTEGER NOT NULL DEFAULT 100,
      warnings INTEGER NOT NULL DEFAULT 0,
      banned_until INTEGER,
      storage_bonus_bytes INTEGER NOT NULL DEFAULT 0,
      daily_claim_at INTEGER,
      avatar_key TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS usage_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tokens INTEGER NOT NULL,
      kind TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_usage_user_created ON usage_events(user_id, created_at)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS coin_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_coin_user_created ON coin_events(user_id, created_at)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_workspaces_user ON workspaces(user_id, created_at)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS workspace_v4_state (
      workspace_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      state_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS file_workspaces (
      file_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS workspace_usage_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      tokens INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_workspace_usage ON workspace_usage_events(user_id, workspace_id, created_at)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS agent_mailbox (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      source_agent_id TEXT NOT NULL,
      source_agent_name TEXT NOT NULL,
      target_agent_id TEXT NOT NULL,
      target_agent_name TEXT NOT NULL,
      task TEXT NOT NULL,
      reply TEXT,
      status TEXT NOT NULL DEFAULT 'completed',
      created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_agent_mailbox_workspace_created ON agent_mailbox(user_id, workspace_id, created_at)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_agent_mailbox_target_created ON agent_mailbox(user_id, target_agent_id, created_at)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS workspace_plugins (
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      plugin_id TEXT NOT NULL,
      installed_at INTEGER NOT NULL,
      PRIMARY KEY(workspace_id, plugin_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_workspace_plugins_user ON workspace_plugins(user_id, workspace_id, installed_at)`)
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
  const createdUser = { id: userId, email, name };
  await ensureUserMeta(env, createdUser);
  await ensureDefaultWorkspace(env, createdUser);
  const session = await issueSession(env, userId);
  return json(request, 201, { ...(await accountPayload(env, createdUser)), ...session });
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
  const loginUser = { id: user.id, email: user.email, name: user.name };
  await ensureUserMeta(env, loginUser);
  await ensureDefaultWorkspace(env, loginUser);
  const session = await issueSession(env, user.id);
  return json(request, 200, { ...(await accountPayload(env, loginUser)), ...session });
}

async function handleSession(request, env) {
  if (!env.DB) return json(request, 200, { user: null, cloud: false });
  await ensureSchema(env);
  const user = await getAuthUser(request, env);
  if (!user) return json(request, 200, { user: null, cloud: false });
  return json(request, 200, { ...(await accountPayload(env, user)), cloud: true });
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


function effectivePlan(meta) {
  if (meta?.plan === 'plus' && (!meta.plan_expires_at || Number(meta.plan_expires_at) > Date.now())) return 'plus';
  return 'free';
}

async function ensureUserMeta(env, user) {
  const now = Date.now();
  const role = String(user?.email || '').toLowerCase() === ADMIN_EMAIL ? 'admin' : 'user';
  await env.DB.prepare(`INSERT INTO user_meta
    (user_id, role, plan, coins, warnings, storage_bonus_bytes, created_at, updated_at)
    VALUES (?1, ?2, 'free', 100, 0, 0, ?3, ?3)
    ON CONFLICT(user_id) DO UPDATE SET
      role = CASE WHEN ?2 = 'admin' THEN 'admin' ELSE user_meta.role END,
      updated_at = ?3`)
    .bind(user.id, role, now).run();
  const meta = await env.DB.prepare('SELECT * FROM user_meta WHERE user_id = ?1').bind(user.id).first();
  if (meta?.plan === 'plus' && meta.plan_expires_at && Number(meta.plan_expires_at) <= now) {
    await env.DB.prepare("UPDATE user_meta SET plan = 'free', plan_expires_at = NULL, updated_at = ?2 WHERE user_id = ?1")
      .bind(user.id, now).run();
    return { ...meta, plan: 'free', plan_expires_at: null };
  }
  return meta;
}

async function ensureDefaultWorkspace(env, user) {
  let workspace = await env.DB.prepare('SELECT * FROM workspaces WHERE user_id = ?1 ORDER BY created_at ASC LIMIT 1').bind(user.id).first();
  if (workspace) return workspace;
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare('INSERT INTO workspaces (id, user_id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)')
    .bind(id, user.id, 'My Workspace', now).run();
  const legacy = await env.DB.prepare('SELECT state_json FROM workspace_state WHERE user_id = ?1').bind(user.id).first();
  if (legacy?.state_json) {
    await env.DB.prepare('INSERT INTO workspace_v4_state (workspace_id, user_id, state_json, updated_at) VALUES (?1, ?2, ?3, ?4)')
      .bind(id, user.id, legacy.state_json, now).run();
  }
  return { id, user_id: user.id, name: 'My Workspace', created_at: now, updated_at: now };
}

async function resolveWorkspace(env, user, requestedId) {
  await ensureDefaultWorkspace(env, user);
  if (requestedId) {
    const chosen = await env.DB.prepare('SELECT * FROM workspaces WHERE id = ?1 AND user_id = ?2').bind(requestedId, user.id).first();
    if (chosen) return chosen;
  }
  return env.DB.prepare('SELECT * FROM workspaces WHERE user_id = ?1 ORDER BY created_at ASC LIMIT 1').bind(user.id).first();
}

function estimateTokens(messages, reply = '') {
  const chars = (messages || []).reduce((sum, message) => sum + String(message?.content || '').length, 0) + String(reply || '').length;
  return Math.max(1, Math.ceil(chars / 4));
}

async function usageSnapshot(env, user, meta) {
  const now = Date.now();
  const plan = effectivePlan(meta);
  const limits = PLAN_LIMITS[plan];
  const threeHourMs = 3 * 60 * 60 * 1000;
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const threeHourStart = Math.floor(now / threeHourMs) * threeHourMs;
  const weekStart = Math.floor(now / weekMs) * weekMs;
  const row = await env.DB.prepare(`SELECT
    COALESCE(SUM(CASE WHEN created_at >= ?2 THEN tokens ELSE 0 END), 0) AS three_hour,
    COALESCE(SUM(CASE WHEN created_at >= ?3 THEN tokens ELSE 0 END), 0) AS weekly
    FROM usage_events WHERE user_id = ?1`).bind(user.id, threeHourStart, weekStart).first();
  const threeUsed = Number(row?.three_hour || 0);
  const weekUsed = Number(row?.weekly || 0);
  const threeLimit = limits.threeHourTokens;
  const weeklyLimit = limits.weeklyTokens;
  const remainingPct = (used, limit) => limit == null ? null : Math.max(0, Math.min(100, Math.round((1 - used / limit) * 100)));
  return {
    plan,
    threeHour: threeLimit == null ? null : { used: threeUsed, limit: threeLimit, remainingPercent: remainingPct(threeUsed, threeLimit), resetsAt: threeHourStart + threeHourMs },
    weekly: { used: weekUsed, limit: weeklyLimit, remainingPercent: remainingPct(weekUsed, weeklyLimit), resetsAt: weekStart + weekMs }
  };
}

async function recordUsage(env, user, tokens, workspaceId) {
  const now = Date.now();
  const safeTokens = Math.max(1, Number(tokens || 1));
  await env.DB.batch([
    env.DB.prepare('INSERT INTO usage_events (id, user_id, tokens, kind, created_at) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(crypto.randomUUID(), user.id, safeTokens, 'chat', now),
    env.DB.prepare('INSERT INTO workspace_usage_events (id, user_id, workspace_id, tokens, created_at) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(crypto.randomUUID(), user.id, workspaceId || '', safeTokens, now)
  ]);
  const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
  const earned = await env.DB.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM coin_events WHERE user_id = ?1 AND reason = 'chat' AND created_at >= ?2")
    .bind(user.id, dayStart.getTime()).first();
  if (Number(earned?.total || 0) < 50) {
    await env.DB.batch([
      env.DB.prepare('UPDATE user_meta SET coins = coins + ?2, updated_at = ?3 WHERE user_id = ?1').bind(user.id, COINS_PER_CHAT, now),
      env.DB.prepare('INSERT INTO coin_events (id, user_id, amount, reason, created_at) VALUES (?1, ?2, ?3, ?4, ?5)')
        .bind(crypto.randomUUID(), user.id, COINS_PER_CHAT, 'chat', now)
    ]);
  }
}

async function storageSnapshot(env, user, meta, workspaceId = null) {
  let row;
  if (workspaceId) {
    row = await env.DB.prepare(`SELECT COALESCE(SUM(files.size),0) AS used
      FROM files LEFT JOIN file_workspaces fw ON fw.file_id = files.id
      WHERE files.user_id = ?1 AND fw.workspace_id = ?2`).bind(user.id, workspaceId).first();
  } else {
    row = await env.DB.prepare('SELECT COALESCE(SUM(size),0) AS used FROM files WHERE user_id = ?1').bind(user.id).first();
  }
  const plan = effectivePlan(meta);
  const limit = PLAN_LIMITS[plan].storageBytes + Number(meta?.storage_bonus_bytes || 0);
  return { used: Number(row?.used || 0), limit };
}

async function accountPayload(env, user) {
  const meta = await ensureUserMeta(env, user);
  const workspace = await ensureDefaultWorkspace(env, user);
  const usage = await usageSnapshot(env, user, meta);
  const storage = await storageSnapshot(env, user, meta);
  const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM workspaces WHERE user_id = ?1').bind(user.id).first();
  return {
    user: { id: user.id, email: user.email, name: user.name, avatarUrl: meta.avatar_key ? '/api/account/avatar' : null },
    role: meta.role,
    plan: effectivePlan(meta),
    planExpiresAt: meta.plan_expires_at || null,
    coins: Number(meta.coins || 0),
    warnings: Number(meta.warnings || 0),
    bannedUntil: meta.banned_until || null,
    usage,
    storage,
    workspaceCount: Number(count?.total || 1),
    defaultWorkspaceId: workspace.id
  };
}

async function handleAccountGet(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  return json(request, 200, await accountPayload(env, auth.user));
}

async function handleAccountUpdate(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  const body = await readJsonBody(request);
  const name = String(body.name || '').trim().slice(0, 80);
  if (!name) return json(request, 400, { error: 'Add a display name.' });
  await env.DB.prepare('UPDATE users SET display_name = ?2 WHERE id = ?1').bind(auth.user.id, name).run();
  return json(request, 200, { ok: true, name });
}

async function handleAvatarUpload(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  if (!env.FILES) return json(request, 503, { error: 'Profile photo storage is unavailable.' });
  const form = await request.formData();
  const workspace = await resolveWorkspace(env, auth.user, String(form.get('workspaceId') || ''));
  const meta = await ensureUserMeta(env, auth.user);
  const file = form.get('file');
  if (!(file instanceof File) || !String(file.type || '').startsWith('image/')) return json(request, 400, { error: 'Choose an image.' });
  if (file.size > 1024 * 1024) return json(request, 413, { error: 'Profile pictures are limited to 1 MB.' });
  const key = `avatar:${auth.user.id}`;
  await env.FILES.put(key, await file.arrayBuffer(), { metadata: { type: file.type || 'image/jpeg' } });
  await ensureUserMeta(env, auth.user);
  await env.DB.prepare('UPDATE user_meta SET avatar_key = ?2, updated_at = ?3 WHERE user_id = ?1').bind(auth.user.id, key, Date.now()).run();
  return json(request, 200, { ok: true, avatarUrl: '/api/account/avatar' });
}

async function handleAvatarGet(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  const meta = await ensureUserMeta(env, auth.user);
  if (!meta?.avatar_key || !env.FILES) return json(request, 404, { error: 'No profile picture.' });
  const object = await env.FILES.get(meta.avatar_key, { type: 'arrayBuffer' });
  if (!object) return json(request, 404, { error: 'No profile picture.' });
  const metadata = await env.FILES.getWithMetadata(meta.avatar_key, { type: 'arrayBuffer' });
  const headers = new Headers(corsHeaders(request));
  headers.set('Content-Type', metadata?.metadata?.type || 'image/jpeg');
  headers.set('Cache-Control', 'private, max-age=300');
  return new Response(object, { status: 200, headers });
}

async function handleDailyClaim(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  const meta = await ensureUserMeta(env, auth.user);
  const now = Date.now();
  const today = new Date(now); today.setUTCHours(0,0,0,0);
  if (meta.daily_claim_at && Number(meta.daily_claim_at) >= today.getTime()) {
    return json(request, 409, { error: 'Daily coins already claimed.', nextClaimAt: today.getTime() + 86400000 });
  }
  await env.DB.batch([
    env.DB.prepare('UPDATE user_meta SET coins = coins + ?2, daily_claim_at = ?3, updated_at = ?3 WHERE user_id = ?1').bind(auth.user.id, DAILY_COIN_REWARD, now),
    env.DB.prepare('INSERT INTO coin_events (id, user_id, amount, reason, created_at) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(crypto.randomUUID(), auth.user.id, DAILY_COIN_REWARD, 'daily', now)
  ]);
  const fresh = await env.DB.prepare('SELECT coins FROM user_meta WHERE user_id = ?1').bind(auth.user.id).first();
  return json(request, 200, { ok: true, reward: DAILY_COIN_REWARD, coins: Number(fresh?.coins || 0), nextClaimAt: today.getTime() + 86400000 });
}

async function handlePlusUpgrade(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  const meta = await ensureUserMeta(env, auth.user);
  if (Number(meta.coins || 0) < PLUS_COIN_COST) return json(request, 409, { error: `You need ${PLUS_COIN_COST} Ripo Coins for Plus.` });
  const now = Date.now();
  const base = meta.plan === 'plus' && Number(meta.plan_expires_at || 0) > now ? Number(meta.plan_expires_at) : now;
  const expiresAt = base + PLUS_DAYS * 86400000;
  await env.DB.batch([
    env.DB.prepare("UPDATE user_meta SET coins = coins - ?2, plan = 'plus', plan_expires_at = ?3, updated_at = ?4 WHERE user_id = ?1")
      .bind(auth.user.id, PLUS_COIN_COST, expiresAt, now),
    env.DB.prepare('INSERT INTO coin_events (id, user_id, amount, reason, created_at) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(crypto.randomUUID(), auth.user.id, -PLUS_COIN_COST, 'plus_upgrade', now)
  ]);
  return json(request, 200, { ok: true, plan: 'plus', expiresAt });
}

async function handleWorkspacesList(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  const meta = await ensureUserMeta(env, auth.user);
  await ensureDefaultWorkspace(env, auth.user);
  const rows = await env.DB.prepare('SELECT * FROM workspaces WHERE user_id = ?1 ORDER BY created_at ASC').bind(auth.user.id).all();
  const workspaces = [];
  for (const workspace of (rows.results || [])) {
    const stateRow = await env.DB.prepare('SELECT state_json FROM workspace_v4_state WHERE workspace_id = ?1 AND user_id = ?2').bind(workspace.id, auth.user.id).first();
    let botCount = 0;
    try { botCount = JSON.parse(stateRow?.state_json || '{}')?.agents?.length || 0; } catch {}
    const storage = await storageSnapshot(env, auth.user, meta, workspace.id);
    const weekStart = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)) * (7 * 24 * 60 * 60 * 1000);
    const tokenRow = await env.DB.prepare('SELECT COALESCE(SUM(tokens),0) AS total FROM workspace_usage_events WHERE user_id = ?1 AND workspace_id = ?2 AND created_at >= ?3').bind(auth.user.id, workspace.id, weekStart).first();
    workspaces.push({ id: workspace.id, name: workspace.name, createdAt: workspace.created_at, updatedAt: workspace.updated_at, botCount, weeklyTokens: Number(tokenRow?.total || 0), storage });
  }
  return json(request, 200, { workspaces, limit: PLAN_LIMITS[effectivePlan(meta)].workspaceLimit });
}

async function handleWorkspaceCreate(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  const meta = await ensureUserMeta(env, auth.user);
  const plan = effectivePlan(meta);
  const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM workspaces WHERE user_id = ?1').bind(auth.user.id).first();
  if (Number(count?.total || 0) >= PLAN_LIMITS[plan].workspaceLimit) return json(request, 403, { error: plan === 'free' ? 'Plus is required for another workspace.' : 'Workspace limit reached.' });
  const body = await readJsonBody(request);
  const name = String(body.name || 'New Workspace').trim().slice(0, 80) || 'New Workspace';
  const id = crypto.randomUUID(), now = Date.now();
  await env.DB.prepare('INSERT INTO workspaces (id, user_id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)')
    .bind(id, auth.user.id, name, now).run();
  return json(request, 201, { workspace: { id, name, createdAt: now } });
}

async function handleWorkspaceRename(request, env, workspaceId) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  const body = await readJsonBody(request);
  const name = String(body.name || '').trim().slice(0, 80);
  if (!name) return json(request, 400, { error: 'Add a workspace name.' });
  const result = await env.DB.prepare('UPDATE workspaces SET name = ?3, updated_at = ?4 WHERE id = ?1 AND user_id = ?2')
    .bind(workspaceId, auth.user.id, name, Date.now()).run();
  if (!result.meta?.changes) return json(request, 404, { error: 'Workspace not found.' });
  return json(request, 200, { ok: true, name });
}

async function handleFileDelete(request, env, fileId) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  const row = await env.DB.prepare('SELECT object_key FROM files WHERE id = ?1 AND user_id = ?2').bind(fileId, auth.user.id).first();
  if (!row) return json(request, 404, { error: 'File not found.' });
  if (env.FILES) await env.FILES.delete(row.object_key).catch(() => {});
  await env.DB.prepare('DELETE FROM files WHERE id = ?1 AND user_id = ?2').bind(fileId, auth.user.id).run();
  return json(request, 200, { ok: true });
}

async function requireAdmin(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth;
  const meta = await ensureUserMeta(env, auth.user);
  if (meta.role !== 'admin' && String(auth.user.email || '').toLowerCase() !== ADMIN_EMAIL) return { error: json(request, 403, { error: 'Admin access required.' }) };
  return { user: auth.user, meta };
}

async function handleAdminUsers(request, env) {
  const auth = await requireAdmin(request, env); if (auth.error) return auth.error;
  const rows = await env.DB.prepare(`SELECT users.id, users.email, users.display_name AS name, users.created_at AS createdAt,
    COALESCE(user_meta.role,'user') AS role, COALESCE(user_meta.plan,'free') AS plan,
    COALESCE(user_meta.coins,0) AS coins, COALESCE(user_meta.warnings,0) AS warnings,
    user_meta.banned_until AS bannedUntil, COALESCE(user_meta.storage_bonus_bytes,0) AS storageBonusBytes
    FROM users LEFT JOIN user_meta ON user_meta.user_id = users.id ORDER BY users.created_at DESC LIMIT 250`).all();
  return json(request, 200, { users: rows.results || [] });
}

async function handleAdminAction(request, env, userId) {
  const auth = await requireAdmin(request, env); if (auth.error) return auth.error;
  const body = await readJsonBody(request);
  const action = String(body.action || '');
  await env.DB.prepare(`INSERT INTO user_meta (user_id, role, plan, coins, warnings, storage_bonus_bytes, created_at, updated_at)
    VALUES (?1,'user','free',100,0,0,?2,?2) ON CONFLICT(user_id) DO NOTHING`).bind(userId, Date.now()).run();
  const now = Date.now();
  if (action === 'addCoins') await env.DB.prepare('UPDATE user_meta SET coins = MAX(0, coins + ?2), updated_at = ?3 WHERE user_id = ?1').bind(userId, Number(body.amount || 0), now).run();
  else if (action === 'setCoins') await env.DB.prepare('UPDATE user_meta SET coins = MAX(0, ?2), updated_at = ?3 WHERE user_id = ?1').bind(userId, Number(body.amount || 0), now).run();
  else if (action === 'setPlan') {
    const plan = body.plan === 'plus' ? 'plus' : 'free';
    const expires = plan === 'plus' ? now + Math.max(1, Number(body.days || 30)) * 86400000 : null;
    await env.DB.prepare('UPDATE user_meta SET plan = ?2, plan_expires_at = ?3, updated_at = ?4 WHERE user_id = ?1').bind(userId, plan, expires, now).run();
  } else if (action === 'setStorageBonus') await env.DB.prepare('UPDATE user_meta SET storage_bonus_bytes = MAX(0, ?2), updated_at = ?3 WHERE user_id = ?1').bind(userId, Number(body.bytes || 0), now).run();
  else if (action === 'warn') await env.DB.prepare('UPDATE user_meta SET warnings = warnings + 1, updated_at = ?2 WHERE user_id = ?1').bind(userId, now).run();
  else if (action === 'ban') await env.DB.prepare('UPDATE user_meta SET banned_until = ?2, updated_at = ?3 WHERE user_id = ?1').bind(userId, now + Math.max(1, Number(body.hours || 24)) * 3600000, now).run();
  else if (action === 'unban') await env.DB.prepare('UPDATE user_meta SET banned_until = NULL, updated_at = ?2 WHERE user_id = ?1').bind(userId, now).run();
  else if (action === 'setAdmin') {
    const target = await env.DB.prepare('SELECT email FROM users WHERE id = ?1').bind(userId).first();
    if (String(target?.email || '').toLowerCase() === ADMIN_EMAIL && body.enabled === false) return json(request, 400, { error: 'The owner admin cannot be demoted.' });
    await env.DB.prepare("UPDATE user_meta SET role = ?2, updated_at = ?3 WHERE user_id = ?1").bind(userId, body.enabled ? 'admin' : 'user', now).run();
  } else return json(request, 400, { error: 'Unknown admin action.' });
  return json(request, 200, { ok: true });
}

async function handleStateGet(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  const url = new URL(request.url);
  const workspace = await resolveWorkspace(env, auth.user, url.searchParams.get('workspaceId'));
  const row = await env.DB.prepare('SELECT state_json FROM workspace_v4_state WHERE workspace_id = ?1 AND user_id = ?2').bind(workspace.id, auth.user.id).first();
  if (!row) return json(request, 200, { workspaceId: workspace.id, workspaceName: workspace.name });
  try { return json(request, 200, { ...JSON.parse(row.state_json), workspaceId: workspace.id, workspaceName: workspace.name }); }
  catch { return json(request, 200, { workspaceId: workspace.id, workspaceName: workspace.name }); }
}

async function handleStatePut(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  const body = await readJsonBody(request);
  const workspace = await resolveWorkspace(env, auth.user, body.workspaceId);
  const state = {
    agents: Array.isArray(body.agents) ? body.agents.slice(0, 60) : [],
    conversations: body.conversations && typeof body.conversations === 'object' ? body.conversations : {},
    teams: Array.isArray(body.teams) ? body.teams.slice(0, 40) : [],
    archivedChats: Array.isArray(body.archivedChats) ? body.archivedChats.slice(0, 200) : [],
    onboarded: Boolean(body.onboarded)
  };
  const encoded = JSON.stringify(state);
  if (encoded.length > 3_000_000) return json(request, 413, { error: 'Workspace state is too large.' });
  await env.DB.prepare(`INSERT INTO workspace_v4_state (workspace_id, user_id, state_json, updated_at) VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT(workspace_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`)
    .bind(workspace.id, auth.user.id, encoded, Date.now()).run();
  await env.DB.prepare('UPDATE workspaces SET updated_at = ?2 WHERE id = ?1').bind(workspace.id, Date.now()).run();
  return json(request, 200, { ok: true, workspaceId: workspace.id, updatedAt: Date.now() });
}

async function persistAgentExchange(env, userId, workspaceId, exchange) {
  if (!env.DB || !exchange?.id) return exchange;
  await env.DB.prepare(`INSERT OR REPLACE INTO agent_mailbox
    (id, user_id, workspace_id, source_agent_id, source_agent_name, target_agent_id, target_agent_name, task, reply, status, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`)
    .bind(
      exchange.id,
      userId,
      workspaceId,
      exchange.sourceAgentId,
      exchange.sourceAgentName,
      exchange.targetAgentId,
      exchange.targetAgentName,
      exchange.task,
      exchange.reply || '',
      exchange.status || 'completed',
      Number(exchange.createdAt || Date.now())
    ).run();
  return exchange;
}

async function handleAgentMailbox(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  const url = new URL(request.url);
  const workspace = await resolveWorkspace(env, auth.user, url.searchParams.get('workspaceId'));
  const after = Math.max(0, Number(url.searchParams.get('after') || 0));
  const rows = await env.DB.prepare(`SELECT id, source_agent_id AS sourceAgentId, source_agent_name AS sourceAgentName,
      target_agent_id AS targetAgentId, target_agent_name AS targetAgentName, task, reply, status, created_at AS createdAt
    FROM agent_mailbox
    WHERE user_id = ?1 AND workspace_id = ?2 AND created_at >= ?3
    ORDER BY created_at ASC
    LIMIT 500`)
    .bind(auth.user.id, workspace.id, after).all();
  return json(request, 200, {
    workspaceId: workspace.id,
    messages: rows.results || []
  });
}


function pluginById(pluginId) {
  return ZERO_KEY_PLUGIN_CATALOG.find((plugin) => plugin.id === String(pluginId || '').trim()) || null;
}

async function installedPluginsForWorkspace(env, user, workspace) {
  if (!env.DB) return [];
  const rows = await env.DB.prepare('SELECT plugin_id, installed_at FROM workspace_plugins WHERE user_id = ?1 AND workspace_id = ?2 ORDER BY installed_at ASC')
    .bind(user.id, workspace.id).all();
  const installedAt = new Map((rows.results || []).map((row) => [row.plugin_id, Number(row.installed_at || 0)]));
  return ZERO_KEY_PLUGIN_CATALOG
    .filter((plugin) => installedAt.has(plugin.id))
    .map((plugin) => ({ ...plugin, installed: true, installedAt: installedAt.get(plugin.id) }));
}

async function installedPluginContext(env, user, workspace) {
  const installed = await installedPluginsForWorkspace(env, user, workspace);
  const ids = new Set(installed.map((plugin) => plugin.id));
  if (!installed.length) return { installed, ids, prompt: '' };
  const lines = installed.map((plugin) => {
    const actions = plugin.actions.map((action) => `${action.id}: ${action.description}`).join('; ');
    return `- ${plugin.name} [${plugin.id}] — ${actions}`;
  });
  return {
    installed,
    ids,
    prompt: [
      'Installed zero-key plugins in this workspace:',
      ...lines,
      'Use an installed plugin automatically when it is the best source. Emit <ripo_action>{"type":"plugin_call","pluginId":"plugin-id","action":"action-id","args":{"key":"value"}}</ripo_action>. Never claim a plugin was used unless a plugin result is returned.'
    ].join('\n')
  };
}

async function handlePluginsList(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  const url = new URL(request.url);
  const workspace = await resolveWorkspace(env, auth.user, url.searchParams.get('workspaceId'));
  const installed = await installedPluginsForWorkspace(env, auth.user, workspace);
  const installedIds = new Set(installed.map((plugin) => plugin.id));
  return json(request, 200, {
    workspaceId: workspace.id,
    plugins: ZERO_KEY_PLUGIN_CATALOG.map((plugin) => ({
      ...plugin,
      installed: installedIds.has(plugin.id),
      installedAt: installed.find((item) => item.id === plugin.id)?.installedAt || null
    }))
  });
}

async function handlePluginInstall(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  const body = await readJsonBody(request);
  const plugin = pluginById(body.pluginId);
  if (!plugin) return json(request, 404, { error: 'Plugin not found.' });
  const workspace = await resolveWorkspace(env, auth.user, body.workspaceId);
  const installedAt = Date.now();
  await env.DB.prepare('INSERT OR REPLACE INTO workspace_plugins (workspace_id, user_id, plugin_id, installed_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(workspace.id, auth.user.id, plugin.id, installedAt).run();
  return json(request, 200, { ok: true, workspaceId: workspace.id, plugin: { ...plugin, installed: true, installedAt } });
}

async function handlePluginUninstall(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  const body = await readJsonBody(request);
  const plugin = pluginById(body.pluginId);
  if (!plugin) return json(request, 404, { error: 'Plugin not found.' });
  const workspace = await resolveWorkspace(env, auth.user, body.workspaceId);
  await env.DB.prepare('DELETE FROM workspace_plugins WHERE user_id = ?1 AND workspace_id = ?2 AND plugin_id = ?3')
    .bind(auth.user.id, workspace.id, plugin.id).run();
  return json(request, 200, { ok: true, workspaceId: workspace.id, pluginId: plugin.id, installed: false });
}

async function fetchPluginJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'RipoBot/1.0 (+https://ripobot.sitey.my)',
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(`Plugin provider returned HTTP ${response.status}.`);
  return response.json();
}

function compactPluginText(value, max = 9000) {
  if (typeof value === 'string') return value.slice(0, max);
  return JSON.stringify(value, null, 2).slice(0, max);
}

async function runInstalledPlugin(pluginId, action, args = {}) {
  const id = String(pluginId || '').trim();
  const actionId = String(action || '').trim();

  if (id === 'open-meteo') {
    if (actionId !== 'weather') throw new Error('Unsupported Open-Meteo action.');
    const location = String(args.location || '').trim().slice(0, 120);
    if (!location) throw new Error('Open-Meteo needs a location.');
    const geo = await fetchPluginJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`);
    const place = geo?.results?.[0];
    if (!place) throw new Error(`No location found for "${location}".`);
    const forecast = await fetchPluginJson(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=5&timezone=auto`);
    return {
      provider: 'Open-Meteo',
      location: [place.name, place.admin1, place.country].filter(Boolean).join(', '),
      coordinates: { latitude: place.latitude, longitude: place.longitude },
      timezone: forecast.timezone,
      current: forecast.current,
      currentUnits: forecast.current_units,
      daily: forecast.daily,
      dailyUnits: forecast.daily_units
    };
  }

  if (id === 'wikipedia') {
    if (actionId !== 'search') throw new Error('Unsupported Wikipedia action.');
    const query = String(args.query || '').trim().slice(0, 180);
    if (!query) throw new Error('Wikipedia needs a search query.');
    const url = new URL('https://en.wikipedia.org/w/api.php');
    url.searchParams.set('action', 'query');
    url.searchParams.set('generator', 'search');
    url.searchParams.set('gsrsearch', query);
    url.searchParams.set('gsrlimit', '5');
    url.searchParams.set('prop', 'extracts|info');
    url.searchParams.set('exintro', '1');
    url.searchParams.set('explaintext', '1');
    url.searchParams.set('exchars', '900');
    url.searchParams.set('inprop', 'url');
    url.searchParams.set('format', 'json');
    const data = await fetchPluginJson(url.toString());
    const pages = Object.values(data?.query?.pages || {}).sort((a, b) => (a.index || 999) - (b.index || 999));
    return {
      provider: 'Wikipedia',
      query,
      results: pages.slice(0, 5).map((page) => ({ title: page.title, extract: page.extract || '', url: page.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(String(page.title || '').replace(/ /g, '_'))}` }))
    };
  }

  if (id === 'hacker-news') {
    if (actionId === 'item') {
      const itemId = Math.max(1, Number(args.id || 0));
      if (!Number.isFinite(itemId)) throw new Error('Hacker News needs a numeric item ID.');
      const item = await fetchPluginJson(`https://hacker-news.firebaseio.com/v0/item/${Math.trunc(itemId)}.json`);
      return { provider: 'Hacker News', item };
    }
    if (actionId !== 'top') throw new Error('Unsupported Hacker News action.');
    const limit = Math.min(10, Math.max(1, Number(args.limit || 8)));
    const ids = await fetchPluginJson('https://hacker-news.firebaseio.com/v0/topstories.json');
    const stories = [];
    for (const storyId of (Array.isArray(ids) ? ids.slice(0, limit) : [])) {
      try {
        const item = await fetchPluginJson(`https://hacker-news.firebaseio.com/v0/item/${storyId}.json`);
        if (item) stories.push({ id: item.id, title: item.title, url: item.url || `https://news.ycombinator.com/item?id=${item.id}`, score: item.score, by: item.by, time: item.time, descendants: item.descendants });
      } catch {}
    }
    return { provider: 'Hacker News', stories };
  }

  if (id === 'npm-registry') {
    if (actionId === 'package') {
      const name = String(args.name || '').trim().slice(0, 214);
      if (!name) throw new Error('npm Registry needs a package name.');
      const data = await fetchPluginJson(`https://registry.npmjs.org/${encodeURIComponent(name)}`);
      const latest = data?.['dist-tags']?.latest;
      const meta = latest ? data?.versions?.[latest] : null;
      return { provider: 'npm Registry', name: data?.name || name, description: data?.description, latest, homepage: data?.homepage || meta?.homepage, repository: data?.repository || meta?.repository, license: meta?.license || data?.license, keywords: data?.keywords || meta?.keywords || [] };
    }
    if (actionId !== 'search') throw new Error('Unsupported npm Registry action.');
    const query = String(args.query || '').trim().slice(0, 180);
    if (!query) throw new Error('npm Registry needs a search query.');
    const data = await fetchPluginJson(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=6`);
    return { provider: 'npm Registry', query, results: (data?.objects || []).map((entry) => ({ name: entry?.package?.name, version: entry?.package?.version, description: entry?.package?.description, links: entry?.package?.links, score: entry?.score?.final })) };
  }

  if (id === 'github-public') {
    if (actionId === 'repo') {
      const repo = String(args.repo || '').trim().slice(0, 200);
      if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) throw new Error('GitHub Public expects owner/name.');
      const data = await fetchPluginJson(`https://api.github.com/repos/${repo}`, { headers: { 'X-GitHub-Api-Version': '2022-11-28' } });
      return { provider: 'GitHub Public', repo: data.full_name, description: data.description, url: data.html_url, stars: data.stargazers_count, forks: data.forks_count, language: data.language, topics: data.topics, defaultBranch: data.default_branch, updatedAt: data.updated_at };
    }
    if (actionId !== 'search_repos') throw new Error('Unsupported GitHub Public action.');
    const query = String(args.query || '').trim().slice(0, 180);
    if (!query) throw new Error('GitHub Public needs a repository search query.');
    const data = await fetchPluginJson(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=6`, { headers: { 'X-GitHub-Api-Version': '2022-11-28' } });
    return { provider: 'GitHub Public', query, results: (data?.items || []).map((repo) => ({ fullName: repo.full_name, description: repo.description, url: repo.html_url, stars: repo.stargazers_count, language: repo.language, updatedAt: repo.updated_at })) };
  }

  throw new Error('Plugin is not supported.');
}

async function handleFilesList(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  const url = new URL(request.url);
  const workspace = await resolveWorkspace(env, auth.user, url.searchParams.get('workspaceId'));
  const rows = await env.DB.prepare(`SELECT files.id, files.name, files.mime_type AS type, files.size, files.created_at AS createdAt
    FROM files LEFT JOIN file_workspaces fw ON fw.file_id = files.id
    WHERE files.user_id = ?1 AND (fw.workspace_id = ?2 OR fw.workspace_id IS NULL)
    ORDER BY files.created_at DESC LIMIT 400`).bind(auth.user.id, workspace.id).all();
  const files = (rows.results || []).map((file) => ({ ...file, source: 'cloud', workspaceId: workspace.id, url: `${new URL(request.url).origin}/api/files/${encodeURIComponent(file.id)}` }));
  return json(request, 200, { files, workspaceId: workspace.id });
}

async function handleFileUpload(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  if (!env.FILES) return json(request, 503, { error: 'Free KV file storage is not provisioned.' });
  const form = await request.formData();
  const workspace = await resolveWorkspace(env, auth.user, String(form.get('workspaceId') || ''));
  const meta = await ensureUserMeta(env, auth.user);
  const file = form.get('file');
  if (!(file instanceof File)) return json(request, 400, { error: 'Attach a file.' });
  if (file.size > 20 * 1024 * 1024) return json(request, 413, { error: 'Files are limited to 20 MB on the free storage plan.' });
  const totals = await env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS total FROM files').first();
  const userTotals = await env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS total FROM files WHERE user_id = ?1').bind(auth.user.id).first();
  const storageLimit = PLAN_LIMITS[effectivePlan(meta)].storageBytes + Number(meta.storage_bonus_bytes || 0);
  if (Number(totals?.total || 0) + file.size > 900 * 1024 * 1024) return json(request, 507, { error: 'The zero-cost KV storage pool is nearly full. Delete old files before uploading more.' });
  if (Number(userTotals?.total || 0) + file.size > storageLimit) return json(request, 507, { error: 'This account has reached its workspace cloud-storage allowance.' });
  const safeName = String(file.name || 'file').replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 140);
  const id = crypto.randomUUID();
  const key = `file:${auth.user.id}:${id}`;
  const type = file.type || 'application/octet-stream';
  const bytes = await file.arrayBuffer();
  await env.FILES.put(key, bytes, { metadata: { type, name: safeName, userId: auth.user.id } });
  const createdAt = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO files (id, user_id, object_key, name, mime_type, size, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
      .bind(id, auth.user.id, key, safeName, type, file.size, createdAt),
    env.DB.prepare('INSERT OR REPLACE INTO file_workspaces (file_id, workspace_id, user_id) VALUES (?1, ?2, ?3)')
      .bind(id, workspace.id, auth.user.id)
  ]);
  return json(request, 201, { file: { id, name: safeName, type, size: file.size, source: 'cloud', workspaceId: workspace.id, createdAt, url: `${new URL(request.url).origin}/api/files/${id}` } });
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


function normalizeAvailableAgents(input, currentName = '') {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  return input.slice(0, 20).flatMap((agent) => {
    const id = String(agent?.id || '').trim().slice(0, 100);
    const name = String(agent?.name || '').trim().slice(0, 80);
    if (!id || !name || seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      name,
      role: String(agent?.role || 'AI bot').trim().slice(0, 120),
      description: String(agent?.description || '').trim().slice(0, 300),
      instructions: String(agent?.instructions || '').trim().slice(0, 1600),
      isPrimary: Boolean(agent?.isPrimary),
      isCurrent: name.toLowerCase() === String(currentName || '').toLowerCase()
    }];
  });
}

function isTextLikeMime(type = '', name = '') {
  const mime = String(type || '').toLowerCase();
  const filename = String(name || '').toLowerCase();
  return mime.startsWith('text/') ||
    /application\/(json|xml|javascript|x-javascript|sql|rtf|yaml|x-yaml)/.test(mime) ||
    /\.(txt|md|markdown|json|js|jsx|ts|tsx|css|html|htm|xml|yaml|yml|csv|log|ini|toml|sql|py|java|c|cc|cpp|h|hpp|rs|go|swift|kt|sh)$/i.test(filename);
}

async function ownedFile(env, userId, fileId) {
  if (!env.DB || !env.FILES || !fileId) return null;
  const row = await env.DB.prepare('SELECT id, object_key, name, mime_type, size, created_at FROM files WHERE id = ?1 AND user_id = ?2')
    .bind(String(fileId), userId).first();
  if (!row) return null;
  const bytes = await env.FILES.get(row.object_key, { type: 'arrayBuffer' });
  if (!bytes) return null;
  return {
    id: row.id,
    key: row.object_key,
    name: row.name,
    type: row.mime_type || 'application/octet-stream',
    size: Number(row.size || bytes.byteLength || 0),
    createdAt: Number(row.created_at || Date.now()),
    bytes
  };
}

async function describeImageAttachment(env, stored, userQuestion) {
  if (!env.AI || !stored?.bytes) return '';
  const bytes = new Uint8Array(stored.bytes);
  if (bytes.byteLength > 8 * 1024 * 1024) return '[Image is attached but too large for the vision pass.]';
  const image = `data:${stored.type || 'image/png'};base64,${bytesToBase64(bytes)}`;
  const prompt = String(userQuestion || 'Describe this image accurately and mention text, objects, UI, errors, and details that could matter.').slice(0, 1800);
  try {
    const result = await env.AI.run('@cf/moondream/moondream3.1-9B-A2B', {
      task: 'query',
      image,
      question: `Analyze this image precisely. Do not invent details. Extract visible text, UI state, objects, errors, and anything relevant to this request: ${prompt}`,
      reasoning: false,
      temperature: 0.15,
      max_tokens: 1200,
      stream: false
    });
    return String(result?.answer || result?.caption || result?.result?.answer || result?.result?.caption || result?.response || (typeof result?.result === 'string' ? result.result : '') || '').trim().slice(0, 9000);
  } catch (error) {
    return `[Vision analysis failed for ${stored.name}: ${error?.message || 'unavailable'}]`;
  }
}

async function buildAttachmentContext(env, user, attachments, userQuestion) {
  if (!Array.isArray(attachments) || !attachments.length) return { text: '', files: [] };
  const sections = [];
  const files = [];
  for (const attachment of attachments.slice(0, 6)) {
    const stored = await ownedFile(env, user.id, attachment?.id);
    if (!stored) {
      sections.push(`Attachment "${String(attachment?.name || attachment?.id || 'file')}" could not be opened.`);
      continue;
    }
    files.push({ id: stored.id, name: stored.name, type: stored.type, size: stored.size });
    if (stored.type.startsWith('image/')) {
      const description = await describeImageAttachment(env, stored, userQuestion);
      sections.push(`IMAGE ATTACHMENT: ${stored.name}\nVision analysis:\n${description || '[No vision description returned.]'}`);
      continue;
    }
    if (isTextLikeMime(stored.type, stored.name) && stored.bytes.byteLength <= 1024 * 1024) {
      let decoded = '';
      try { decoded = new TextDecoder('utf-8', { fatal: false }).decode(stored.bytes); } catch {}
      decoded = decoded.replace(/\u0000/g, '').slice(0, 24000);
      sections.push(`FILE ATTACHMENT: ${stored.name} (${stored.type})\nContents:\n${decoded || '[File is empty or not valid UTF-8 text.]'}`);
      continue;
    }
    if (env.AI && stored.bytes.byteLength <= 10 * 1024 * 1024) {
      try {
        const converted = await env.AI.toMarkdown({
          name: stored.name,
          blob: new Blob([stored.bytes], { type: stored.type || 'application/octet-stream' })
        });
        const result = Array.isArray(converted) ? converted[0] : converted;
        if (result?.format !== 'error' && typeof result?.data === 'string' && result.data.trim()) {
          sections.push(`DOCUMENT ATTACHMENT: ${stored.name} (${result.mimetype || stored.type})\nConverted content:\n${result.data.slice(0, 24000)}`);
          continue;
        }
        if (result?.error) {
          sections.push(`DOCUMENT ATTACHMENT: ${stored.name} could not be converted: ${String(result.error).slice(0, 500)}`);
          continue;
        }
      } catch (error) {
        sections.push(`DOCUMENT ATTACHMENT: ${stored.name} could not be converted: ${String(error?.message || 'conversion unavailable').slice(0, 500)}`);
        continue;
      }
    }
    sections.push(`FILE ATTACHMENT: ${stored.name} (${stored.type}, ${stored.size} bytes). The file is attached, but it exceeds the document-conversion size used for chat context.`);
  }
  return {
    text: sections.length ? `Attached user files are available below. Use them directly when answering.\n\n${sections.join('\n\n---\n\n')}` : '',
    files
  };
}

async function rewriteStoredTextFile(env, user, fileId, content) {
  const stored = await ownedFile(env, user.id, fileId);
  if (!stored) throw new Error('The file to edit was not found.');
  if (!isTextLikeMime(stored.type, stored.name)) throw new Error('Only text/code files can be rewritten directly. Use image editing for images.');
  const textValue = String(content ?? '');
  const bytes = new TextEncoder().encode(textValue);
  if (bytes.byteLength > 1024 * 1024) throw new Error('Edited text files are limited to 1 MB.');
  await env.FILES.put(stored.key, bytes, { metadata: { type: stored.type, name: stored.name, userId: user.id, edited: 'true' } });
  await env.DB.prepare('UPDATE files SET size = ?1 WHERE id = ?2 AND user_id = ?3').bind(bytes.byteLength, stored.id, user.id).run();
  return { id: stored.id, name: stored.name, type: stored.type, size: bytes.byteLength, source: 'cloud', edited: true, url: `/api/files/${stored.id}` };
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

async function searchWeb(query, env = null) {
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
  if (!results.length && env?.BROWSER) {
    try {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
      const rendered = await browserQuickText(env, 'markdown', searchUrl);
      const markdown = String(rendered.text || '');
      const linkRe = /\[([^\]]{2,180})\]\((https?:\/\/[^)\s]+)\)/g;
      let link;
      while ((link = linkRe.exec(markdown)) && results.length < 5) {
        const title = stripTags(link[1]);
        const url = link[2].replace(/&amp;/g, '&');
        if (!title || /google\.com\/(search|preferences|accounts)/i.test(url)) continue;
        if (!results.some((item) => item.url === url)) results.push({ title, url, snippet: 'Found through rendered web search.' });
      }
      if (!results.length && markdown.trim()) {
        results.push({
          title: `Rendered web search for "${q}"`,
          url: searchUrl,
          snippet: stripTags(markdown.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')).slice(0, 1400)
        });
      }
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
      if (parsed && ['create_agent', 'create_team', 'rename_agent', 'web_search', 'browser_open', 'browser_click', 'browser_type', 'browser_scroll', 'browser_key', 'computer_exec', 'generate_image', 'edit_image', 'rewrite_file', 'message_agent', 'delegate_agent', 'plugin_call'].includes(parsed.type)) actions.push(parsed);
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


function base64ImageBytes(value) {
  const raw = String(value || '').replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
  return base64ToBytes(raw);
}

async function generateImageForUser(env, user, prompt, workspaceId, referenceFileIds = []) {
  if (!env.AI || !env.FILES) throw new Error('Image generation is unavailable.');
  const meta = await ensureUserMeta(env, user);
  const workspace = await resolveWorkspace(env, user, workspaceId);
  const storage = await storageSnapshot(env, user, meta);
  const form = new FormData();
  form.append('prompt', String(prompt || '').trim().slice(0, 1800));
  form.append('width', '768');
  form.append('height', '768');

  let imageIndex = 0;
  for (const fileId of (Array.isArray(referenceFileIds) ? referenceFileIds : []).slice(0, 4)) {
    const stored = await ownedFile(env, user.id, fileId);
    if (!stored || !stored.type.startsWith('image/')) continue;
    const blob = new Blob([stored.bytes], { type: stored.type });
    form.append(`input_image_${imageIndex}`, blob, stored.name || `reference-${imageIndex}.png`);
    imageIndex += 1;
  }

  const serialized = new Response(form);
  const result = await env.AI.run('@cf/black-forest-labs/flux-2-klein-4b', {
    multipart: { body: serialized.body, contentType: serialized.headers.get('content-type') }
  });
  const encoded = result?.image;
  if (!encoded) throw new Error('The image model did not return an image.');
  const bytes = base64ImageBytes(encoded);
  if (storage.used + bytes.byteLength > storage.limit) throw new Error('Workspace storage is full.');
  const id = crypto.randomUUID();
  const key = `file:${user.id}:${id}`;
  const name = `ripo-image-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  const createdAt = Date.now();
  await env.FILES.put(key, bytes, { metadata: { type: 'image/png', name, userId: user.id, generated: 'true', editedFrom: referenceFileIds.join(',') } });
  await env.DB.batch([
    env.DB.prepare('INSERT INTO files (id, user_id, object_key, name, mime_type, size, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
      .bind(id, user.id, key, name, 'image/png', bytes.byteLength, createdAt),
    env.DB.prepare('INSERT OR REPLACE INTO file_workspaces (file_id, workspace_id, user_id) VALUES (?1, ?2, ?3)')
      .bind(id, workspace.id, user.id)
  ]);
  return { id, name, type: 'image/png', size: bytes.byteLength, source: 'cloud', workspaceId: workspace.id, generated: true, editedFrom: referenceFileIds, createdAt, url: `/api/files/${id}` };
}

async function handleImageGenerate(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  const body = await readJsonBody(request);
  const prompt = String(body.prompt || '').trim();
  if (!prompt) return json(request, 400, { error: 'Describe the image you want.' });
  const file = await generateImageForUser(env, auth.user, prompt, body.workspaceId);
  return json(request, 201, { file, model: '@cf/black-forest-labs/flux-2-klein-4b' });
}

function shouldAutoSearch(text) {
  return /\b(latest|current|today|tonight|this week|news|search|look up|find online|web|price|release date|schedule|weather|score|who is|what happened|update on)\b/i.test(String(text || ''));
}

async function runToolActions(request, env, user, actions, workspaceId, installedPluginIds = new Set()) {
  const toolResults = [];
  const generatedFiles = [];
  const updatedFiles = [];
  for (const action of actions.slice(0, 5)) {
    if (action.type === 'web_search') {
      const query = String(action.query || '').trim();
      if (query) {
        const results = await searchWeb(query, env);
        toolResults.push({ type: 'web_search', query, results });
      }
    } else if (action.type === 'browser_open') {
      const url = String(action.url || '').trim();
      if (url) {
        try {
          const rendered = await ensureLiveComputer(env, user.id, url);
          toolResults.push({ type: 'browser_open', url: rendered.url, title: rendered.title, content: rendered.text.slice(0, 9000), interactiveElements: rendered.items.slice(0, 50), live: true });
        } catch (error) {
          toolResults.push({ type: 'browser_open', url, error: error.message });
        }
      }
    } else if (action.type === 'browser_click') {
      try {
        const live = await browserLiveAction(env, user.id, action.selector
          ? { kind: 'click_selector', selector: action.selector }
          : { kind: 'click', x: action.x, y: action.y });
        toolResults.push({ type: 'browser_click', url: live.url, title: live.title, content: live.text.slice(0, 7000), interactiveElements: live.items.slice(0, 50) });
      } catch (error) { toolResults.push({ type: 'browser_click', error: error.message }); }
    } else if (action.type === 'browser_type') {
      try {
        const live = await browserLiveAction(env, user.id, action.selector
          ? { kind: 'type_selector', selector: action.selector, text: action.text }
          : { kind: 'type', text: action.text });
        toolResults.push({ type: 'browser_type', url: live.url, content: live.text.slice(0, 7000) });
      } catch (error) { toolResults.push({ type: 'browser_type', error: error.message }); }
    } else if (action.type === 'browser_scroll') {
      try {
        const live = await browserLiveAction(env, user.id, { kind: 'scroll', deltaX: action.deltaX, deltaY: action.deltaY });
        toolResults.push({ type: 'browser_scroll', url: live.url, content: live.text.slice(0, 7000) });
      } catch (error) { toolResults.push({ type: 'browser_scroll', error: error.message }); }
    } else if (action.type === 'browser_key') {
      try {
        const live = await browserLiveAction(env, user.id, { kind: 'key', key: action.key });
        toolResults.push({ type: 'browser_key', url: live.url, content: live.text.slice(0, 7000) });
      } catch (error) { toolResults.push({ type: 'browser_key', error: error.message }); }
    } else if (action.type === 'computer_exec') {
      const command = String(action.command || '').trim();
      if (command) {
        const fake = new Request(request.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: request.headers.get('Authorization') || '' },
          body: JSON.stringify({ command })
        });
        const response = await handleComputerExec(fake, env);
        let data = {};
        try { data = await response.json(); } catch {}
        toolResults.push({ type: 'computer_exec', command, stdout: data.stdout || '', stderr: data.stderr || data.error || '' });
      }
    } else if (action.type === 'generate_image') {
      const prompt = String(action.prompt || '').trim();
      if (prompt) {
        try {
          const file = await generateImageForUser(env, user, prompt, workspaceId);
          generatedFiles.push(file);
          toolResults.push({ type: 'generate_image', prompt, file: { id: file.id, name: file.name } });
        } catch (error) {
          toolResults.push({ type: 'generate_image', prompt, error: error.message });
        }
      }
    } else if (action.type === 'edit_image') {
      const prompt = String(action.prompt || '').trim();
      const fileId = String(action.fileId || '').trim();
      if (prompt && fileId) {
        try {
          const file = await generateImageForUser(env, user, prompt, workspaceId, [fileId]);
          generatedFiles.push(file);
          toolResults.push({ type: 'edit_image', prompt, sourceFileId: fileId, file: { id: file.id, name: file.name }, mode: 'reference-edit' });
        } catch (referenceError) {
          try {
            const stored = await ownedFile(env, user.id, fileId);
            if (!stored || !stored.type.startsWith('image/')) throw referenceError;
            let description = await describeImageAttachment(env, stored, prompt);
            if ((!description || description.startsWith('[Image is attached but too large')) && env.AI) {
              try {
                const converted = await env.AI.toMarkdown({
                  name: stored.name,
                  blob: new Blob([stored.bytes], { type: stored.type || 'image/jpeg' })
                });
                const convertedResult = Array.isArray(converted) ? converted[0] : converted;
                if (typeof convertedResult?.data === 'string' && convertedResult.data.trim()) description = convertedResult.data.slice(0, 7000);
              } catch {}
            }
            if (!description) throw referenceError;
            const reconstructionPrompt = [
              'Create a new edited version of the source image described below.',
              'Preserve the source composition, subjects, important text, layout, and visual identity as closely as possible unless the requested edit changes them.',
              `Requested edit: ${prompt}`,
              `Source image description: ${description}`
            ].join('\n');
            const file = await generateImageForUser(env, user, reconstructionPrompt, workspaceId);
            generatedFiles.push(file);
            toolResults.push({
              type: 'edit_image',
              prompt,
              sourceFileId: fileId,
              file: { id: file.id, name: file.name },
              mode: 'vision-reconstruction',
              note: 'The original reference exceeded or failed the image model reference constraints, so Ripo Bot reconstructed the source from vision context and applied the requested edit.'
            });
          } catch (fallbackError) {
            toolResults.push({ type: 'edit_image', prompt, sourceFileId: fileId, error: fallbackError?.message || referenceError?.message || 'Image edit failed.' });
          }
        }
      }
    } else if (action.type === 'plugin_call') {
      const pluginId = String(action.pluginId || '').trim();
      const pluginAction = String(action.action || '').trim();
      if (!installedPluginIds.has(pluginId)) {
        toolResults.push({ type: 'plugin_call', pluginId, action: pluginAction, error: 'That plugin is not installed in this workspace.' });
      } else {
        try {
          const result = await runInstalledPlugin(pluginId, pluginAction, action.args || {});
          toolResults.push({ type: 'plugin_call', pluginId, action: pluginAction, result: JSON.parse(compactPluginText(result, 16000)) });
        } catch (error) {
          toolResults.push({ type: 'plugin_call', pluginId, action: pluginAction, error: error?.message || 'Plugin call failed.' });
        }
      }
    } else if (action.type === 'rewrite_file') {
      const fileId = String(action.fileId || '').trim();
      if (fileId && typeof action.content === 'string') {
        try {
          const file = await rewriteStoredTextFile(env, user, fileId, action.content);
          updatedFiles.push(file);
          toolResults.push({ type: 'rewrite_file', file: { id: file.id, name: file.name, size: file.size } });
        } catch (error) {
          toolResults.push({ type: 'rewrite_file', fileId, error: error.message });
        }
      }
    }
  }
  return { toolResults, generatedFiles, updatedFiles };
}

async function runDelegations(
  env,
  user,
  workspace,
  sourceAgent,
  roster,
  actions,
  userText,
  attachmentContext,
  depth = 0,
  visitedAgentIds = new Set(),
  budget = { count: 0 }
) {
  const replies = [];
  const exchanges = [];
  if (depth > 1 || budget.count >= 5) return { replies, exchanges };

  const availableBots = roster
    .filter((agent) => agent.id !== sourceAgent.id)
    .map((agent) => `- ${agent.name} — ${agent.role}`)
    .join('\n');

  for (const action of actions.slice(0, 3)) {
    if (budget.count >= 5) break;
    if (!(action.type === 'message_agent' || action.type === 'delegate_agent')) continue;

    const requested = String(action.targetName || action.agentName || '').trim().toLowerCase();
    const target = roster.find((agent) => agent.name.toLowerCase() === requested || agent.id.toLowerCase() === requested);
    if (!target || target.id === sourceAgent.id || visitedAgentIds.has(target.id)) continue;

    const task = String(action.task || action.message || userText || '').trim().slice(0, 5000);
    if (!task) continue;

    const system = [
      BASE_PROMPT,
      `Identity rule: your name is "${target.name}". You are NOT Ripo Bot unless that exact string is your assigned name.`,
      `Your role is: ${target.role}.`,
      target.description ? `Description: ${target.description}` : '',
      target.instructions ? `Bot-specific instructions: ${target.instructions}` : '',
      `You received an internal task from "${sourceAgent.name}" (${sourceAgent.role || 'AI bot'}). Complete that task directly.`,
      attachmentContext?.text || '',
      availableBots ? `Other bots available in this workspace:\n${availableBots}` : '',
      'Any bot may coordinate with another existing bot when another specialty is genuinely useful. To send another bot a task, emit <ripo_action>{"type":"message_agent","targetName":"Bot name","message":"specific task"}</ripo_action>. To explicitly delegate work, emit <ripo_action>{"type":"delegate_agent","targetName":"Bot name","task":"specific task"}</ripo_action>. Do not message yourself. Do not create loops. Prefer completing the task yourself unless another bot adds real value.'
    ].filter(Boolean).join('\n\n');

    const createdAt = Date.now();
    const exchange = {
      id: crypto.randomUUID(),
      sourceAgentId: sourceAgent.id,
      sourceAgentName: sourceAgent.name,
      targetAgentId: target.id,
      targetAgentName: target.name,
      task,
      reply: '',
      status: 'working',
      createdAt
    };
    await persistAgentExchange(env, user.id, workspace.id, exchange);

    const requestMessages = [{ role: 'system', content: system }, { role: 'user', content: task }];
    let result = null;
    try { result = await callHuggingFace(requestMessages, env); } catch {}
    if (!result) { try { result = await callWorkersAI(requestMessages, env); } catch {} }
    if (!result) { try { result = await callBackup(requestMessages); } catch {} }
    if (!result?.reply) {
      exchange.status = 'error';
      await persistAgentExchange(env, user.id, workspace.id, exchange);
      exchanges.push(exchange);
      budget.count += 1;
      continue;
    }

    const parsedTarget = extractActions(result.reply);
    const cleanReply = parsedTarget.reply || result.reply;
    exchange.reply = cleanReply;
    exchange.status = 'completed';
    await persistAgentExchange(env, user.id, workspace.id, exchange);
    exchanges.push(exchange);
    replies.push({
      agentId: target.id,
      agentName: target.name,
      content: cleanReply,
      provider: result.provider,
      model: result.model,
      sourceAgentId: sourceAgent.id,
      sourceAgentName: sourceAgent.name,
      mailboxId: exchange.id
    });
    budget.count += 1;

    const nestedActions = parsedTarget.actions.filter((nested) => nested.type === 'message_agent' || nested.type === 'delegate_agent');
    if (nestedActions.length && depth < 1 && budget.count < 5) {
      const nextVisited = new Set(visitedAgentIds);
      nextVisited.add(sourceAgent.id);
      nextVisited.add(target.id);
      const nested = await runDelegations(
        env,
        user,
        workspace,
        target,
        roster,
        nestedActions,
        task,
        attachmentContext,
        depth + 1,
        nextVisited,
        budget
      );
      replies.push(...nested.replies);
      exchanges.push(...nested.exchanges);
    }
  }

  return { replies, exchanges };
}

async function handleChat(request, env) {
  if (!withinRateLimit(request)) return json(request, 429, { error: 'Too many messages at once. Try again in a minute.' }, { 'Retry-After': '60' });
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  const meta = await ensureUserMeta(env, auth.user);
  if (meta.banned_until && Number(meta.banned_until) > Date.now()) return json(request, 403, { error: 'This account is temporarily suspended.' });
  const beforeUsage = await usageSnapshot(env, auth.user, meta);
  if (beforeUsage.weekly.remainingPercent <= 0 || (beforeUsage.threeHour && beforeUsage.threeHour.remainingPercent <= 0)) {
    return json(request, 429, { error: 'Ripo Bot usage limit reached. It will reset automatically.', usage: beforeUsage });
  }

  const body = await readJsonBody(request);
  let messages;
  try { messages = normalizeMessages(body.messages); }
  catch (error) { return json(request, 400, { error: error.message }); }

  const agentName = String(body.agentName || 'Ripo Bot').slice(0, 80);
  const agentId = String(body.agentId || '').trim().slice(0, 100);
  const agentRole = String(body.agentRole || 'AI bot').slice(0, 120);
  const agentInstructions = String(body.agentInstructions || '').slice(0, 2200);
  const allowAgentAdmin = Boolean(body.allowAgentAdmin);
  const allowRename = Boolean(body.allowRename);
  const lastUser = [...messages].reverse().find((message) => message.role === 'user')?.content || '';
  const workspace = await resolveWorkspace(env, auth.user, body.workspaceId);
  const roster = normalizeAvailableAgents(body.availableAgents, agentName);
  const currentRosterAgent = roster.find((candidate) => candidate.isCurrent) || roster.find((candidate) => candidate.id === agentId);
  const sourceAgent = currentRosterAgent || {
    id: agentId || `agent:${agentName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name: agentName,
    role: agentRole,
    description: '',
    instructions: agentInstructions,
    isPrimary: allowAgentAdmin,
    isCurrent: true
  };
  const attachmentContext = await buildAttachmentContext(env, auth.user, body.attachments, lastUser);
  const pluginContext = await installedPluginContext(env, auth.user, workspace);
  let sources = [];
  if (shouldAutoSearch(lastUser)) sources = await searchWeb(lastUser, env);

  const capabilities = [
    'You have tools and should use them automatically when useful. Do not ask the user to turn search, files, images, or computer mode on.',
    'To search the web, emit <ripo_action>{"type":"web_search","query":"what to search"}</ripo_action>.',
    'To open a real persistent browser page that appears live in Ripo Computer, emit <ripo_action>{"type":"browser_open","url":"https://example.com"}</ripo_action>.',
    'After opening the browser, you may click a selector with <ripo_action>{"type":"browser_click","selector":"button.login"}</ripo_action>, type with <ripo_action>{"type":"browser_type","selector":"input[name=email]","text":"value"}</ripo_action>, scroll with <ripo_action>{"type":"browser_scroll","deltaY":700}</ripo_action>, or press a key with <ripo_action>{"type":"browser_key","key":"Enter"}</ripo_action>.',
    'To use the private Ripo Computer terminal/filesystem, emit <ripo_action>{"type":"computer_exec","command":"command here"}</ripo_action>.',
    'To create a new image, emit <ripo_action>{"type":"generate_image","prompt":"detailed image prompt"}</ripo_action>.',
    'To edit an attached image, emit <ripo_action>{"type":"edit_image","fileId":"attached-file-id","prompt":"describe the exact edit"}</ripo_action>.',
    'To overwrite an attached text/code file, emit <ripo_action>{"type":"rewrite_file","fileId":"attached-file-id","content":"complete replacement file contents"}</ripo_action>.',
    'Use tools only when they are needed. Tool actions are hidden and their results are returned before your final answer.'
  ];
  if (roster.length > 1) {
    capabilities.push('Any bot may coordinate with another existing bot. To send another bot a message or task, emit <ripo_action>{"type":"message_agent","targetName":"Bot name","message":"specific message or task"}</ripo_action>. The target bot will actually run the task, reply, and the exchange will be saved in both bot histories.');
    capabilities.push('To explicitly delegate a task to another bot, emit <ripo_action>{"type":"delegate_agent","targetName":"Bot name","task":"specific task"}</ripo_action>. Use this when the user asks you to tell, ask, message, bring in, or hand work to another bot, or when another specialty materially improves the result.');
  }
  if (allowAgentAdmin) {
    capabilities.push('You are the main bot and may create or organize bots without waiting for the user to manually invite them.');
    capabilities.push('To create a specialist bot when the requested specialist does not already exist, emit <ripo_action>{"type":"create_agent","name":"Name","role":"Role","description":"Short description","instructions":"Instructions","avatar":"nova"}</ripo_action>.');
    capabilities.push('To form a persistent team, emit <ripo_action>{"type":"create_team","name":"Team name","memberNames":["Agent One","Agent Two"]}</ripo_action>.');
    capabilities.push('To rename another bot, emit <ripo_action>{"type":"rename_agent","targetName":"Current bot name","name":"New name"}</ripo_action>.');
  }
  if (allowRename) capabilities.push('If your own role changes substantially and a better short name is useful, you may put [[rename:New Name]] at the start of the reply. Do this rarely.');

  const rosterText = roster.length
    ? `Available bots in this workspace:\n${roster.map((agent) => `- ${agent.name} — ${agent.role}${agent.isCurrent ? ' (you)' : ''}`).join('\n')}`
    : '';

  const system = [
    BASE_PROMPT,
    `Identity rule: your name is "${agentName}". You are NOT Ripo Bot unless your assigned name is exactly "Ripo Bot". Never introduce yourself using another bot's name.`,
    `Your role is: ${agentRole}.`,
    agentInstructions ? `Bot-specific instructions: ${agentInstructions}` : '',
    rosterText,
    attachmentContext.text,
    pluginContext.prompt,
    capabilities.filter(Boolean).join(' '),
    sources.length ? `${searchContext(sources)}\nUse these results when answering and distinguish uncertainty.` : ''
  ].filter(Boolean).join('\n\n');

  const requestMessages = [{ role: 'system', content: system }, ...messages];
  let result = null;
  try { result = await callHuggingFace(requestMessages, env); } catch {}
  if (!result) { try { result = await callWorkersAI(requestMessages, env); } catch {} }
  if (!result) { try { result = await callBackup(requestMessages); } catch {} }
  if (!result) return json(request, 502, { error: `${agentName} could not reach an AI model.` });

  let parsed = extractActions(result.reply);
  const immediateActions = parsed.actions.filter((action) => ['create_agent','create_team','rename_agent'].includes(action.type));
  const toolActions = parsed.actions.filter((action) => ['web_search','browser_open','browser_click','browser_type','browser_scroll','browser_key','computer_exec','generate_image','edit_image','rewrite_file','plugin_call'].includes(action.type));
  const delegateActions = parsed.actions.filter((action) => action.type === 'message_agent' || action.type === 'delegate_agent');

  if (!delegateActions.length && roster.length > 1) {
    const lowered = lastUser.toLowerCase();
    const wantsCollab = /\b(add|bring|invite|use|ask|tell|delegate|collaborate|work with|help from|get)\b/.test(lowered) && /\b(bot|bots|agent|agents|team)\b/.test(lowered);
    const named = roster.filter((candidate) => !candidate.isCurrent && lowered.includes(candidate.name.toLowerCase()));
    if (named.length) {
      for (const candidate of named.slice(0, 3)) delegateActions.push({ type: 'delegate_agent', targetName: candidate.name, task: lastUser });
    } else if (wantsCollab) {
      for (const candidate of roster.filter((candidate) => !candidate.isCurrent).slice(0, 2)) {
        delegateActions.push({ type: 'delegate_agent', targetName: candidate.name, task: lastUser });
      }
    }
  }

  if (!toolActions.some((action) => action.type === 'generate_image' || action.type === 'edit_image') && /\b(generate|create|make|draw)\b[\s\S]{0,60}\b(image|picture|photo|art|logo|wallpaper)\b/i.test(lastUser)) {
    const attachedImage = attachmentContext.files.find((file) => String(file.type).startsWith('image/'));
    if (attachedImage && /\b(edit|change|remove|add|replace|fix|modify|redesign)\b/i.test(lastUser)) {
      toolActions.push({ type: 'edit_image', fileId: attachedImage.id, prompt: lastUser });
    } else {
      toolActions.push({ type: 'generate_image', prompt: lastUser });
    }
  }

  const urlMatch = /https?:\/\/[^\s)\]}]+/i.exec(lastUser);
  if (urlMatch && /\b(open|browse|visit|read|check)\b/i.test(lastUser) && !toolActions.some((action) => action.type === 'browser_open')) {
    toolActions.push({ type: 'browser_open', url: urlMatch[0] });
  }

  const commandMatch = /\b(?:run|execute)\s+(?:the\s+)?(?:command\s+)?[`"']?([a-z][^\n`"']{0,100})/i.exec(lastUser);
  if (commandMatch && /\b(computer|terminal|command|shell|run|execute)\b/i.test(lastUser) && !toolActions.some((action) => action.type === 'computer_exec')) {
    toolActions.push({ type: 'computer_exec', command: commandMatch[1].trim() });
  }

  let generatedFiles = [];
  let updatedFiles = [];
  let delegatedReplies = [];
  let interAgentMessages = [];
  let pluginActivity = [];

  if (delegateActions.length) {
    const coordination = await runDelegations(
      env,
      auth.user,
      workspace,
      sourceAgent,
      roster,
      delegateActions,
      lastUser,
      attachmentContext
    );
    delegatedReplies = coordination.replies;
    interAgentMessages = coordination.exchanges;
  }

  if (toolActions.length) {
    const toolRun = await runToolActions(request, env, auth.user, toolActions, workspace.id, pluginContext.ids);
    generatedFiles = toolRun.generatedFiles;
    updatedFiles = toolRun.updatedFiles;
    pluginActivity = toolRun.toolResults
      .filter((item) => item.type === 'plugin_call')
      .map((item) => ({ pluginId: item.pluginId, action: item.action, ok: !item.error, error: item.error || null }));
    const toolMessage = `Tool results:\n${JSON.stringify(toolRun.toolResults).slice(0, 30000)}\n\nNow answer the user's request. Do not emit more tool actions. Mention created or edited files naturally when relevant.`;
    const followupMessages = [...requestMessages, { role: 'assistant', content: parsed.reply || 'I am using tools now.' }, { role: 'user', content: toolMessage }];
    let followup = null;
    try { followup = await callHuggingFace(followupMessages, env); } catch {}
    if (!followup) { try { followup = await callWorkersAI(followupMessages, env); } catch {} }
    if (!followup) { try { followup = await callBackup(followupMessages); } catch {} }
    if (followup?.reply) { result = followup; parsed = extractActions(followup.reply); }
  }

  if (delegatedReplies.length) {
    const delegationMessage = `Specialist bot results:\n${delegatedReplies.map((item) => `[${item.agentName}] ${item.content}`).join('\n\n')}\n\nSynthesize these specialist results into your final response. Credit the specialists by their actual bot names when useful. Do not call them Ripo Bot.`;
    const followupMessages = [...requestMessages, { role: 'assistant', content: parsed.reply || 'I am coordinating the team.' }, { role: 'user', content: delegationMessage }];
    let followup = null;
    try { followup = await callHuggingFace(followupMessages, env); } catch {}
    if (!followup) { try { followup = await callWorkersAI(followupMessages, env); } catch {} }
    if (!followup) { try { followup = await callBackup(followupMessages); } catch {} }
    if (followup?.reply) { result = followup; parsed = extractActions(followup.reply); }
  }

  if (!sources.length) {
    const searchTool = toolActions.find((action) => action.type === 'web_search');
    if (searchTool?.query) sources = await searchWeb(searchTool.query, env);
  }

  const tokens = estimateTokens(messages, parsed.reply) + delegatedReplies.reduce((sum, item) => sum + Math.ceil(item.content.length / 4), 0);
  await recordUsage(env, auth.user, tokens, workspace.id);
  const freshMeta = await ensureUserMeta(env, auth.user);
  const usage = await usageSnapshot(env, auth.user, freshMeta);
  return json(request, 200, {
    ...result,
    reply: parsed.reply || 'Done.',
    actions: immediateActions,
    sources,
    generatedFiles,
    updatedFiles,
    delegatedReplies,
    interAgentMessages,
    pluginActivity,
    attachmentFiles: attachmentContext.files,
    usage,
    coins: Number(freshMeta.coins || 0)
  });
}

async function handleVoiceTranscribe(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  if (!env.AI) return json(request, 503, { error: 'Voice transcription is unavailable.' });
  const form = await request.formData();
  const audio = form.get('audio');
  if (!(audio instanceof File)) return json(request, 400, { error: 'Attach recorded audio.' });
  if (audio.size < 32) return json(request, 400, { error: 'The recording was empty.' });
  if (audio.size > 8 * 1024 * 1024) return json(request, 413, { error: 'Voice recordings are limited to 8 MB.' });
  const bytes = new Uint8Array(await audio.arrayBuffer());
  const result = await env.AI.run('@cf/openai/whisper', {
    audio: [...bytes]
  });
  const textValue = String(result?.text || result?.transcription_info?.text || '').trim();
  if (!textValue) return json(request, 422, { error: 'I could not hear enough speech in that recording.' });
  return json(request, 200, { text: textValue, provider: 'workers-ai', model: '@cf/openai/whisper' });
}

async function handleVoiceSpeak(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  if (!env.AI) return json(request, 503, { error: 'Voice synthesis is unavailable.' });
  const body = await readJsonBody(request);
  const textValue = String(body.text || '').trim().slice(0, 1200);
  if (!textValue) return json(request, 400, { error: 'Add text to speak.' });
  const lang = String(body.lang || 'en').toLowerCase().slice(0, 8) || 'en';
  const generated = await env.AI.run('@cf/myshell-ai/melotts', { prompt: textValue, lang });
  if (generated instanceof Response) {
    const type = generated.headers.get('Content-Type') || '';
    if (!type.includes('application/json')) {
      const headers = new Headers(generated.headers);
      Object.entries(corsHeaders(request)).forEach(([key, value]) => headers.set(key, value));
      headers.set('Content-Type', type || 'audio/mpeg');
      headers.set('Cache-Control', 'no-store');
      return new Response(generated.body, { status: generated.status, headers });
    }
    const payload = await generated.json().catch(() => ({}));
    const encoded = payload?.audio || payload?.result?.audio;
    if (typeof encoded === 'string') {
      const raw = encoded.replace(/^data:audio\/[^;]+;base64,/, '');
      return new Response(base64ToBytes(raw), { status: 200, headers: { ...corsHeaders(request), 'Content-Type': 'audio/mpeg' } });
    }
  }
  const audio = generated?.audio || generated?.result?.audio;
  if (audio instanceof ArrayBuffer) {
    return new Response(audio, { status: 200, headers: { ...corsHeaders(request), 'Content-Type': 'audio/mpeg' } });
  }
  if (ArrayBuffer.isView(audio)) {
    return new Response(audio, { status: 200, headers: { ...corsHeaders(request), 'Content-Type': 'audio/mpeg' } });
  }
  if (typeof audio === 'string') {
    const raw = audio.replace(/^data:audio\/[^;]+;base64,/, '');
    try {
      return new Response(base64ToBytes(raw), { status: 200, headers: { ...corsHeaders(request), 'Content-Type': 'audio/mpeg' } });
    } catch {
      const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0) & 255);
      return new Response(bytes, { status: 200, headers: { ...corsHeaders(request), 'Content-Type': 'audio/mpeg' } });
    }
  }
  return json(request, 502, { error: 'The voice model did not return audio.' });
}

async function handleSearch(request, env) {
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


let nextCdpCommandId = 0;

function sendCdpCommand(socket, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextCdpCommandId;
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`CDP command "${method}" timed out`));
    }, 20_000);
    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeEventListener('message', onMessage);
      socket.removeEventListener('close', onClose);
    };
    const onClose = () => {
      cleanup();
      reject(new Error('Browser connection closed before the command completed.'));
    };
    const onMessage = (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.id !== id) return;
      cleanup();
      if (message.error) reject(new Error(message.error.message || 'Browser command failed.'));
      else resolve(message.result || {});
    };
    socket.addEventListener('message', onMessage);
    socket.addEventListener('close', onClose);
    try { socket.send(JSON.stringify({ id, method, params })); }
    catch (error) { cleanup(); reject(error); }
  });
}

async function withCdpTarget(env, sessionId, targetId, callback) {
  const connection = await env.BROWSER.connectSession(sessionId, targetId ? { targetId } : undefined);
  const response = await connection.webSocket.fetch('https://browser-binding.invalid', { headers: { Upgrade: 'websocket' } });
  if (!response.webSocket) throw new Error('Browser Run did not return a CDP WebSocket.');
  const socket = response.webSocket;
  socket.accept();
  try { return await callback(socket); }
  finally { try { socket.close(); } catch {} }
}

async function browserDomSummary(env, sessionId, targetId) {
  return withCdpTarget(env, sessionId, targetId, async (socket) => {
    const result = await sendCdpCommand(socket, 'Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const clean = (value) => String(value || '').replace(/\\s+/g,' ').trim();
        const items = [...document.querySelectorAll('a,button,input,textarea,select,[role="button"]')].slice(0,80).map((el,index)=>({
          index,
          tag: el.tagName.toLowerCase(),
          text: clean(el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('placeholder')).slice(0,180),
          id: el.id || '',
          name: el.getAttribute('name') || '',
          type: el.getAttribute('type') || '',
          aria: el.getAttribute('aria-label') || ''
        }));
        return { url: location.href, title: document.title, text: clean(document.body?.innerText).slice(0,12000), items };
      })()`
    });
    return result?.result?.value || {};
  });
}

async function ensureLiveComputer(env, userId, inputUrl = '') {
  if (!env.BROWSER) throw new Error('Browser Run is unavailable.');
  const state = await getComputerState(env, userId);
  let sessionId = state.browserSessionId || '';
  let targetId = state.browserTargetId || '';
  if (sessionId) {
    try {
      const existing = await env.BROWSER.getSession(sessionId);
      if (!existing) sessionId = '';
    } catch { sessionId = ''; }
  }
  if (!sessionId) {
    const acquired = await env.BROWSER.acquire({
      keepAlive: 1_200_000,
      recording: true,
      targets: true,
      liveViewUrlExpiresInMs: 3_600_000
    });
    sessionId = acquired.sessionId;
    const targets = acquired.targets || await env.BROWSER.devtools.listTargets(sessionId, { liveViewUrlExpiresInMs: 3_600_000 });
    targetId = targets.find((target) => target.type === 'page')?.id || '';
    if (!targetId) {
      const created = await env.BROWSER.devtools.newTarget(sessionId, 'about:blank', { liveViewUrlExpiresInMs: 3_600_000 });
      targetId = created?.id || created?.targetId || '';
    }
  }
  if (!targetId) {
    const targets = await env.BROWSER.devtools.listTargets(sessionId, { liveViewUrlExpiresInMs: 3_600_000 });
    targetId = targets.find((target) => target.type === 'page')?.id || '';
  }
  if (!targetId) throw new Error('Browser Run did not provide a page target.');

  if (inputUrl) {
    const url = browserUrl(inputUrl);
    await withCdpTarget(env, sessionId, targetId, async (socket) => {
      await sendCdpCommand(socket, 'Page.enable');
      await sendCdpCommand(socket, 'Page.navigate', { url });
    });
    await new Promise((resolve) => setTimeout(resolve, 650));
  }

  const summary = await browserDomSummary(env, sessionId, targetId).catch(() => ({}));
  const liveView = await env.BROWSER.getLiveView(sessionId, { targetId, mode: 'tab', expiresInMs: 3_600_000 });
  state.browserSessionId = sessionId;
  state.browserTargetId = targetId;
  state.browserUrl = summary.url || state.browserUrl || inputUrl || 'about:blank';
  state.browserTitle = summary.title || state.browserTitle || '';
  state.browserUpdatedAt = Date.now();
  await saveComputerState(env, userId, state);
  return {
    active: true,
    sessionId,
    targetId,
    url: state.browserUrl,
    title: state.browserTitle,
    liveViewUrl: liveView?.devtoolsFrontendUrl || liveView?.url || '',
    text: summary.text || '',
    items: summary.items || []
  };
}

async function browserLiveAction(env, userId, action) {
  const state = await getComputerState(env, userId);
  if (!state.browserSessionId || !state.browserTargetId) throw new Error('Start the live computer first.');
  const sessionId = state.browserSessionId;
  const targetId = state.browserTargetId;
  const kind = String(action?.kind || '').toLowerCase();
  await withCdpTarget(env, sessionId, targetId, async (socket) => {
    if (kind === 'navigate') {
      await sendCdpCommand(socket, 'Page.navigate', { url: browserUrl(action.url) });
    } else if (kind === 'click') {
      const x = Math.max(0, Number(action.x || 0));
      const y = Math.max(0, Number(action.y || 0));
      await sendCdpCommand(socket, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await sendCdpCommand(socket, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await sendCdpCommand(socket, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    } else if (kind === 'click_selector') {
      const selector = String(action.selector || '').slice(0, 500);
      const expression = `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return {ok:false}; el.scrollIntoView({block:'center'}); el.click(); return {ok:true,tag:el.tagName,text:String(el.innerText||el.value||'').slice(0,200)}; })()`;
      await sendCdpCommand(socket, 'Runtime.evaluate', { expression, returnByValue: true });
    } else if (kind === 'type') {
      await sendCdpCommand(socket, 'Input.insertText', { text: String(action.text || '').slice(0, 4000) });
    } else if (kind === 'type_selector') {
      const selector = String(action.selector || '').slice(0, 500);
      const value = String(action.text || '').slice(0, 4000);
      const expression = `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return {ok:false}; el.focus(); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return {ok:true}; })()`;
      await sendCdpCommand(socket, 'Runtime.evaluate', { expression, returnByValue: true });
    } else if (kind === 'scroll') {
      await sendCdpCommand(socket, 'Input.dispatchMouseEvent', { type: 'mouseWheel', x: 480, y: 360, deltaX: Number(action.deltaX || 0), deltaY: Number(action.deltaY || 650) });
    } else if (kind === 'key') {
      const key = String(action.key || 'Enter').slice(0, 40);
      await sendCdpCommand(socket, 'Input.dispatchKeyEvent', { type: 'keyDown', key });
      await sendCdpCommand(socket, 'Input.dispatchKeyEvent', { type: 'keyUp', key });
    } else {
      throw new Error('Unsupported live-browser action.');
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 220));
  return ensureLiveComputer(env, userId);
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
    if (!arg) stderr = 'search: add a query'; else { const results = await searchWeb(arg, env); stdout = results.map((r, i) => `${i+1}. ${r.title}\n${r.url}\n${r.snippet || ''}`).join('\n\n') || 'No results.'; }
  } else if (name === 'open' || name === 'browser') {
    try {
      const rendered = await ensureLiveComputer(env, auth.user.id, arg);
      stdout = `Live Browser Run session\n${rendered.url}\n${rendered.title || ''}\n\n${rendered.text}`;
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


async function handleComputerLiveStart(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  if (!env.BROWSER) return json(request, 503, { error: 'Browser Run is unavailable.' });
  const body = await readJsonBody(request);
  const live = await ensureLiveComputer(env, auth.user.id, String(body.url || 'https://www.google.com'));
  return json(request, 200, { ...live, provider: 'Cloudflare Browser Run Live View' });
}

async function handleComputerLiveStatus(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  if (!env.BROWSER) return json(request, 200, { active: false, configured: false });
  const state = await getComputerState(env, auth.user.id);
  if (!state.browserSessionId) return json(request, 200, { active: false, configured: true });
  try {
    const session = await env.BROWSER.getSession(state.browserSessionId);
    if (!session) return json(request, 200, { active: false, configured: true });
    const targets = await env.BROWSER.devtools.listTargets(state.browserSessionId, { liveViewUrlExpiresInMs: 3_600_000 });
    const target = targets.find((item) => item.id === state.browserTargetId) || targets.find((item) => item.type === 'page');
    if (!target) return json(request, 200, { active: false, configured: true });
    const liveView = await env.BROWSER.getLiveView(state.browserSessionId, { targetId: target.id, mode: 'tab', expiresInMs: 3_600_000 });
    return json(request, 200, {
      active: true,
      configured: true,
      sessionId: state.browserSessionId,
      targetId: target.id,
      url: target.url || state.browserUrl || '',
      title: target.title || state.browserTitle || '',
      liveViewUrl: liveView?.devtoolsFrontendUrl || liveView?.url || ''
    });
  } catch {
    state.browserSessionId = '';
    state.browserTargetId = '';
    await saveComputerState(env, auth.user.id, state);
    return json(request, 200, { active: false, configured: true });
  }
}

async function handleComputerLiveAction(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  const body = await readJsonBody(request);
  const live = await browserLiveAction(env, auth.user.id, body);
  return json(request, 200, live);
}

async function handleComputerLiveClose(request, env) {
  const auth = await requireUser(request, env); if (auth.error) return auth.error;
  const state = await getComputerState(env, auth.user.id);
  if (env.BROWSER && state.browserSessionId) {
    try { await env.BROWSER.closeSession(state.browserSessionId); } catch {}
  }
  state.browserSessionId = '';
  state.browserTargetId = '';
  state.browserUrl = '';
  state.browserTitle = '';
  state.browserUpdatedAt = Date.now();
  await saveComputerState(env, auth.user.id, state);
  return json(request, 200, { active: false });
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
      if (url.pathname === '/api/health' && request.method === 'GET') return json(request, 200, { status: 'ok', app: 'ripobot', version: 8 });
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
      if (url.pathname === '/api/account' && request.method === 'GET') return handleAccountGet(request, env);
      if (url.pathname === '/api/account' && request.method === 'PUT') return handleAccountUpdate(request, env);
      if (url.pathname === '/api/account/avatar' && request.method === 'POST') return handleAvatarUpload(request, env);
      if (url.pathname === '/api/account/avatar' && request.method === 'GET') return handleAvatarGet(request, env);
      if (url.pathname === '/api/coins/daily' && request.method === 'POST') return handleDailyClaim(request, env);
      if (url.pathname === '/api/plans/upgrade' && request.method === 'POST') return handlePlusUpgrade(request, env);
      if (url.pathname === '/api/workspaces' && request.method === 'GET') return handleWorkspacesList(request, env);
      if (url.pathname === '/api/workspaces' && request.method === 'POST') return handleWorkspaceCreate(request, env);
      if (url.pathname.startsWith('/api/workspaces/') && url.pathname.endsWith('/rename') && request.method === 'PUT') return handleWorkspaceRename(request, env, decodeURIComponent(url.pathname.split('/')[3]));
      if (url.pathname === '/api/admin/users' && request.method === 'GET') return handleAdminUsers(request, env);
      if (url.pathname.startsWith('/api/admin/users/') && url.pathname.endsWith('/action') && request.method === 'POST') return handleAdminAction(request, env, decodeURIComponent(url.pathname.split('/')[4]));
      if (url.pathname === '/api/images/generate' && request.method === 'POST') return handleImageGenerate(request, env);
      if (url.pathname === '/api/voice/transcribe' && request.method === 'POST') return handleVoiceTranscribe(request, env);
      if (url.pathname === '/api/voice/speak' && request.method === 'POST') return handleVoiceSpeak(request, env);
      if (url.pathname === '/api/state' && request.method === 'GET') return handleStateGet(request, env);
      if (url.pathname === '/api/state' && request.method === 'PUT') return handleStatePut(request, env);
      if (url.pathname === '/api/files' && request.method === 'GET') return handleFilesList(request, env);
      if (url.pathname === '/api/files' && request.method === 'POST') return handleFileUpload(request, env);
      if (url.pathname.startsWith('/api/files/') && request.method === 'GET') return handleFileGet(request, env, decodeURIComponent(url.pathname.slice('/api/files/'.length)));
      if (url.pathname.startsWith('/api/files/') && request.method === 'DELETE') return handleFileDelete(request, env, decodeURIComponent(url.pathname.slice('/api/files/'.length)));
      if (url.pathname === '/api/search' && request.method === 'POST') return handleSearch(request, env);
      if (url.pathname === '/api/chat' && request.method === 'POST') return handleChat(request, env);
      if (url.pathname === '/api/agent-mailbox' && request.method === 'GET') return handleAgentMailbox(request, env);
      if (url.pathname === '/api/plugins' && request.method === 'GET') return handlePluginsList(request, env);
      if (url.pathname === '/api/plugins/install' && request.method === 'POST') return handlePluginInstall(request, env);
      if (url.pathname === '/api/plugins/uninstall' && request.method === 'POST') return handlePluginUninstall(request, env);
      if (url.pathname === '/api/computer/status' && request.method === 'GET') return json(request, 200, { configured: Boolean(env.DB), provider: 'Ripo Computer', linux: true, browser: Boolean(env.BROWSER), liveViewReady: Boolean(env.BROWSER), browserProvider: env.BROWSER ? 'Cloudflare Browser Run Live View' : 'Unavailable', persistent: Boolean(env.DB), note: 'Persistent terminal plus a real Cloudflare Browser Run session with Live View.' });
      if (url.pathname === '/api/computer/live/start' && request.method === 'POST') return handleComputerLiveStart(request, env);
      if (url.pathname === '/api/computer/live/status' && request.method === 'GET') return handleComputerLiveStatus(request, env);
      if (url.pathname === '/api/computer/live/action' && request.method === 'POST') return handleComputerLiveAction(request, env);
      if (url.pathname === '/api/computer/live/close' && request.method === 'POST') return handleComputerLiveClose(request, env);
      if (url.pathname === '/api/computer/exec' && request.method === 'POST') return handleComputerExec(request, env);
      if (url.pathname.startsWith('/api/')) return json(request, 404, { error: 'API route not found.' });
      return json(request, 404, { error: 'Ripo Bot API is online.' });
    } catch (error) {
      return json(request, error?.message === 'Request is too large.' ? 413 : 400, { error: error?.message || 'Request failed.' });
    }
  }
};
