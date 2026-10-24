import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUp,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Cloud,
  Command,
  Computer,
  Copy,
  Download,
  File,
  FileText,
  Folder,
  Globe2,
  HardDrive,
  Image,
  LoaderCircle,
  LogOut,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  SquareTerminal,
  Trash2,
  Upload,
  UserRound,
  Users,
  X,
  Zap,
  Palette,
  WalletCards,
  Plug,
  Mic,
  Phone,
  PhoneOff,
  Volume2,
  Camera,
  Coins,
  Gauge,
  ChevronRight,
  Crown,
  Shield,
  RefreshCw,
  BriefcaseBusiness,
  Images,
  Video,
  Mail,
  CalendarDays,
  Github,
  ExternalLink,
  UserPlus,
  Ban,
  TriangleAlert
} from 'lucide-react';
import { AVATAR_PRESETS, DEFAULT_CONVERSATIONS, QUICK_STARTS, STARTER_AGENTS } from './data.js';

const API_BASE = import.meta.env.DEV
  ? ''
  : (import.meta.env.VITE_API_BASE_URL || 'https://ripobot-api.ripo-ripoteam.workers.dev');

const LOCAL_KEYS = {
  session: 'ripobot.session.v2',
  profile: 'ripobot.profile.v2',
  agents: 'ripobot.agents.v2',
  conversations: 'ripobot.conversations.v2',
  teams: 'ripobot.teams.v2',
  files: 'ripobot.files.v2',
  onboarded: 'ripobot.onboarded.v2',
  theme: 'ripobot.theme.v3',
  accent: 'ripobot.accent.v4',
  archivedChats: 'ripobot.archived.v4',
  activeWorkspace: 'ripobot.workspace.v4'
};

function readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The app stays usable if browser storage is blocked.
  }
}

function storedToken() {
  try {
    const session = JSON.parse(localStorage.getItem(LOCAL_KEYS.session) || 'null');
    return session?.token || '';
  } catch { return ''; }
}

async function api(path, options = {}) {
  const token = storedToken();
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json().catch(() => ({})) : await response.text();
  if (!response.ok) {
    const error = new Error(data?.error || data || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function cls(...parts) {
  return parts.filter(Boolean).join(' ');
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
}

function avatarSeed(agent, preset) {
  const raw = String(agent?.avatarSeed || agent?.id || preset?.id || 'ripo');
  return raw.split('').reduce((sum, char, index) => (sum + char.charCodeAt(0) * (index + 3)) % 100003, 17);
}

function Avatar({ agent, size = 'md', active = false, interactive = false, onClick }) {
  const preset = AVATAR_PRESETS.find((item) => item.id === agent?.avatar) || AVATAR_PRESETS[0];
  const state = agent?.state || 'ready';
  const seed = avatarSeed(agent, preset);
  const palette = ['#7b5cf2','#168cf7','#11c58c','#ff7a18','#f42f8f','#ff4b55','#11b9b0','#9b6b3f','#8461ff','#27b568','#ef3f49','#f3a72f'];
  const color = agent?.avatarColor || palette[seed % palette.length];
  const shape = Number.isFinite(Number(agent?.avatarShape)) ? Number(agent.avatarShape) % 12 : seed % 12;
  const motion = Number.isFinite(Number(agent?.avatarMotion)) ? Number(agent.avatarMotion) % 6 : Math.floor(seed / 7) % 6;
  const eyes = Math.floor(seed / 13) % 4;
  const Tag = interactive ? 'button' : 'span';
  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={interactive ? onClick : undefined}
      className={cls('agent-avatar', `avatar-${size}`, `blob-shape-${shape}`, `motion-${motion}`, `eyes-${eyes}`, `state-${state}`, active && 'is-active', interactive && 'is-clickable')}
      style={{ '--avatar-color': color, '--avatar-delay': `-${((seed % 23) / 5).toFixed(2)}s`, '--avatar-speed': `${(4.8 + (seed % 37) / 10).toFixed(1)}s` }}
      aria-label={interactive ? `Open ${agent?.name || 'bot'} details` : undefined}
      aria-hidden={interactive ? undefined : 'true'}
    >
      <span className="avatar-halo" />
      <span className="avatar-core">
        <span className="avatar-face">
          <i className="avatar-eye avatar-eye-left" />
          <i className="avatar-eye avatar-eye-right" />
        </span>
      </span>
      <span className="avatar-status-dot" />
    </Tag>
  );
}

function StateLabel({ state = 'ready' }) {
  const labels = {
    ready: 'Ready',
    thinking: 'Thinking',
    searching: 'Searching',
    working: 'Working',
    waiting: 'Waiting',
    done: 'Done',
    error: 'Needs attention'
  };
  return <span className={cls('state-label', `state-${state}`)}><i />{labels[state] || 'Ready'}</span>;
}

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <section className={cls('modal-card', wide && 'modal-wide')} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-header">
          <div>
            <span className="eyebrow">Ripo Bot</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        {children}
      </section>
    </div>
  );
}

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = mode === 'register'
        ? { name: form.name.trim(), email: form.email.trim(), password: form.password }
        : { email: form.email.trim(), password: form.password };
      const data = await api(`/api/auth/${mode === 'register' ? 'register' : 'login'}`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      onAuthenticated({ profile: data.user, cloud: true, token: data.token, expiresAt: data.expiresAt, account: data });
    } catch (err) {
      if ([404, 501, 503].includes(err.status)) {
        setError('Cloud accounts are not provisioned on this deployment yet. You can continue in device mode below.');
      } else {
        setError(err.message || 'Could not sign in.');
      }
    } finally {
      setBusy(false);
    }
  }

  function continueLocal() {
    const email = form.email.trim() || 'local@ripobot.app';
    const name = form.name.trim() || email.split('@')[0] || 'Ripo Bot user';
    onAuthenticated({ profile: { id: `local:${email}`, name, email }, cloud: false });
  }

  return (
    <main className="auth-shell">
      <div className="auth-orb auth-orb-a" />
      <div className="auth-orb auth-orb-b" />
      <section className="auth-brand-panel">
        <div className="brand-lockup brand-lockup-large">
          <span className="brand-mark"><Sparkles size={20} /></span>
          <span>Ripo Bot</span>
        </div>
        <div className="auth-hero-copy">
          <span className="eyebrow">Your AI team, in one workspace</span>
          <h1>One bot when it’s simple.<br />A whole team when it isn’t.</h1>
          <p>Give Ripo Bot a goal, create specialist agents, search the web, work with files, and hand bigger jobs to an isolated computer.</p>
        </div>
        <div className="auth-agent-row">
          {STARTER_AGENTS.map((agent, index) => <Avatar key={agent.id} agent={{ ...agent, state: index === 0 ? 'thinking' : 'ready' }} size="lg" />)}
          <div className="auth-agent-note"><strong>Persistent agents</strong><span>Each one keeps its role, files, and workspace.</span></div>
        </div>
      </section>

      <section className="auth-form-panel">
        <div className="auth-form-card">
          <div className="auth-mobile-brand"><span className="brand-mark"><Sparkles size={18} /></span>Ripo Bot</div>
          <span className="eyebrow">{mode === 'login' ? 'Welcome back' : 'Create your workspace'}</span>
          <h2>{mode === 'login' ? 'Sign in to Ripo Bot' : 'Start with Ripo Bot'}</h2>
          <p className="muted">{mode === 'login' ? 'Your agents and work stay tied to your account.' : 'Create an account, then pick how you want your first agent team to work.'}</p>
          <form onSubmit={submit} className="auth-form">
            {mode === 'register' && (
              <label><span>Name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="What should Ripo Bot call you?" autoComplete="name" /></label>
            )}
            <label><span>Email</span><input type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" autoComplete="email" /></label>
            <label><span>Password</span><input type="password" required minLength={8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="At least 8 characters" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
            {error && <div className="auth-error">{error}</div>}
            <button className="primary-button auth-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : null}{mode === 'login' ? 'Sign in' : 'Create account'}</button>
          </form>
          <button className="text-button auth-switch" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}</button>
          {error.includes('device mode') && <button className="secondary-button device-button" onClick={continueLocal}>Continue on this device</button>}
          <div className="security-note"><ShieldCheck size={16} /><span>Model keys stay on the server. Ripo Bot never puts your Hugging Face token in browser code.</span></div>
        </div>
      </section>
    </main>
  );
}

function Onboarding({ profile, onDone }) {
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState(profile?.name || '');
  const [goal, setGoal] = useState('build');
  const [starter, setStarter] = useState(['scout', 'forge']);

  const goalOptions = [
    ['build', 'Build projects', 'Code, files, planning, and technical work.'],
    ['research', 'Research & learn', 'Search, compare, summarize, and organize.'],
    ['create', 'Create content', 'Ideas, writing, launches, and creative work.'],
    ['everything', 'A bit of everything', 'Keep Ripo Bot flexible from day one.']
  ];

  function finish() {
    onDone({ displayName: displayName.trim() || 'Ripo Bot user', goal, starter });
  }

  return (
    <main className="onboarding-shell">
      <header className="onboarding-topbar">
        <div className="brand-lockup"><span className="brand-mark"><Sparkles size={18} /></span><span>Ripo Bot</span></div>
        <span className="onboarding-progress">{step + 1} / 3</span>
      </header>
      <section className="onboarding-stage">
        {step === 0 && (
          <div className="onboarding-card onboarding-intro">
            <Avatar agent={{ ...STARTER_AGENTS[0], state: 'thinking' }} size="xl" />
            <span className="eyebrow">Meet your main agent</span>
            <h1>Start with Ripo Bot.</h1>
            <p>Ripo Bot can work alone, create specialists, or bring several agents into one team conversation. You stay in control of names, roles, files, and tools.</p>
            <label className="big-input"><span>What should Ripo Bot call you?</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" autoFocus /></label>
            <button className="primary-button onboarding-next" onClick={() => setStep(1)}>Continue <ArrowUp size={16} className="rotate-45" /></button>
          </div>
        )}
        {step === 1 && (
          <div className="onboarding-card">
            <span className="eyebrow">Tune the workspace</span>
            <h1>What will you use Ripo Bot for?</h1>
            <p className="muted">This only changes starter suggestions. You can do everything later.</p>
            <div className="goal-grid">
              {goalOptions.map(([id, title, description]) => (
                <button key={id} className={cls('choice-card', goal === id && 'selected')} onClick={() => setGoal(id)}>
                  <span className="choice-check">{goal === id ? <Check size={14} /> : null}</span>
                  <strong>{title}</strong><span>{description}</span>
                </button>
              ))}
            </div>
            <div className="onboarding-actions"><button className="secondary-button" onClick={() => setStep(0)}>Back</button><button className="primary-button" onClick={() => setStep(2)}>Continue</button></div>
          </div>
        )}
        {step === 2 && (
          <div className="onboarding-card">
            <span className="eyebrow">Build your starter team</span>
            <h1>Who joins Ripo Bot?</h1>
            <p className="muted">Ripo Bot is always there. Add specialists now or create your own later.</p>
            <div className="starter-agent-grid">
              {STARTER_AGENTS.slice(1).map((agent) => {
                const selected = starter.includes(agent.id);
                return <button key={agent.id} className={cls('starter-agent-card', selected && 'selected')} onClick={() => setStarter(selected ? starter.filter((id) => id !== agent.id) : [...starter, agent.id])}>
                  <Avatar agent={agent} size="lg" /><div><strong>{agent.name}</strong><span>{agent.role}</span><p>{agent.description}</p></div><span className="choice-check">{selected ? <Check size={14} /> : null}</span>
                </button>;
              })}
            </div>
            <div className="onboarding-actions"><button className="secondary-button" onClick={() => setStep(1)}>Back</button><button className="primary-button" onClick={finish}>Enter Ripo Bot</button></div>
          </div>
        )}
      </section>
    </main>
  );
}

function AgentEditor({ initialAgent, onSave, onClose }) {
  const editing = Boolean(initialAgent);
  const [form, setForm] = useState(initialAgent || {
    name: '', role: '', description: '', instructions: '', avatar: 'nova', avatarSeed: uid('avatar'), canRenameSelf: true
  });
  function randomizeAvatar() {
    const seed = uid('avatar');
    const colors = ['#7b5cf2','#168cf7','#11c58c','#ff7a18','#f42f8f','#ff4b55','#11b9b0','#9b6b3f','#8461ff','#27b568','#ef3f49','#f3a72f'];
    setForm({ ...form, avatarSeed: seed, avatarColor: colors[Math.floor(Math.random() * colors.length)], avatarShape: Math.floor(Math.random() * 12), avatarMotion: Math.floor(Math.random() * 6) });
  }
  return (
    <Modal title={editing ? 'Edit agent' : 'Create agent'} onClose={onClose}>
      <div className="agent-editor">
        <div className="avatar-builder">
          <div className="avatar-preview-large"><Avatar agent={{ ...form, id: form.avatarSeed || 'preview' }} size="xl" /></div>
          <div><strong>Bot avatar</strong><p>Every bot gets its own shape, color, eyes, timing, and motion pattern.</p><button className="secondary-button" type="button" onClick={randomizeAvatar}><RefreshCw size={15} /> Randomize avatar</button></div>
        </div>
        <div className="avatar-picker compact-avatar-picker">
          {AVATAR_PRESETS.slice(0, 6).map((preset) => (
            <button key={preset.id} onClick={() => setForm({ ...form, avatar: preset.id, avatarSeed: uid('avatar') })} className={cls('avatar-choice', form.avatar === preset.id && 'selected')} aria-label={preset.label}>
              <Avatar agent={{ ...form, avatar: preset.id, id: `${form.avatarSeed || 'preview'}-${preset.id}` }} size="lg" />
            </button>
          ))}
        </div>
        <div className="form-grid two-columns">
          <label><span>Name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Scout" /></label>
          <label><span>Role</span><input value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} placeholder="Research agent" /></label>
        </div>
        <label><span>Short description</span><input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="What this agent is best at" /></label>
        <label><span>Instructions</span><textarea rows={6} value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} placeholder="How should this agent behave and what should it focus on?" /></label>
        <label className="toggle-row"><div><strong>Let this agent rename itself</strong><span>It can suggest and adopt a better name when the role changes.</span></div><button className={cls('switch', form.canRenameSelf && 'on')} onClick={() => setForm({ ...form, canRenameSelf: !form.canRenameSelf })}><i /></button></label>
        <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!form.name.trim()} onClick={() => onSave({ ...form, name: form.name.trim(), role: form.role.trim() || 'AI agent', description: form.description.trim() })}>{editing ? 'Save changes' : 'Create agent'}</button></div>
      </div>
    </Modal>
  );
}

function TeamEditor({ agents, onSave, onClose }) {
  const [name, setName] = useState('New team');
  const [members, setMembers] = useState(agents.slice(0, Math.min(3, agents.length)).map((agent) => agent.id));
  return (
    <Modal title="Create agent team" onClose={onClose}>
      <div className="agent-editor">
        <label><span>Team name</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <div className="team-picker-list">
          {agents.map((agent) => {
            const selected = members.includes(agent.id);
            return <button key={agent.id} className={cls('team-member-choice', selected && 'selected')} onClick={() => setMembers(selected ? members.filter((id) => id !== agent.id) : [...members, agent.id])}>
              <Avatar agent={agent} size="sm" /><div><strong>{agent.name}</strong><span>{agent.role}</span></div><span className="choice-check">{selected ? <Check size={13} /> : null}</span>
            </button>;
          })}
        </div>
        <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!name.trim() || members.length < 2} onClick={() => onSave({ id: uid('team'), name: name.trim(), members, createdAt: Date.now() })}>Create team</button></div>
      </div>
    </Modal>
  );
}

function FilesView({ files, onUpload, cloudMode }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  async function downloadCloudFile(file) {
    try {
      const token = storedToken();
      const response = await fetch(`${API_BASE}/api/files/${encodeURIComponent(file.id)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!response.ok) throw new Error('File download failed.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = file.name || 'download';
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (error) {
      alert(error.message || 'Could not download this file.');
    }
  }
  async function choose(event) {
    const selected = [...(event.target.files || [])];
    if (!selected.length) return;
    setBusy(true);
    await onUpload(selected);
    setBusy(false);
    event.target.value = '';
  }
  return (
    <section className="content-page">
      <header className="page-heading"><div><span className="eyebrow">Workspace storage</span><h1>Files</h1><p>Upload files once and attach them to any Ripo Bot conversation.</p></div><button className="primary-button" onClick={() => inputRef.current?.click()}>{busy ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />} Upload</button></header>
      <input ref={inputRef} type="file" multiple hidden onChange={choose} />
      {!cloudMode && <div className="notice-card"><Cloud size={18} /><div><strong>Device storage mode</strong><span>File metadata is saved on this device when cloud storage is unavailable. Signed-in accounts use Cloudflare's free KV storage when available.</span></div></div>}
      <div className="file-grid">
        {files.length === 0 ? <div className="empty-state wide-empty"><Folder size={34} /><h3>No files yet</h3><p>Drop in PDFs, text files, images, code, or documents you want the agents to work with.</p><button className="secondary-button" onClick={() => inputRef.current?.click()}>Choose files</button></div> : files.map((file) => (
          <article className="file-card" key={file.id}>
            <span className="file-icon">{file.type?.startsWith('image/') ? <Image size={21} /> : <FileText size={21} />}</span>
            <div className="file-info"><strong title={file.name}>{file.name}</strong><span>{Math.max(1, Math.round((file.size || 0) / 1024))} KB · {file.source === 'cloud' ? 'Cloud' : 'This device'}</span></div>
            {file.source === 'cloud' ? <button className="icon-button" onClick={() => downloadCloudFile(file)} aria-label="Download file"><Download size={16} /></button> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function ComputerView() {
  const [status, setStatus] = useState({ loading: true, configured: false, provider: 'Ripo Computer Lite' });
  const [command, setCommand] = useState('pwd');
  const [lines, setLines] = useState([{ type: 'system', text: 'Ripo Computer Lite · private zero-cost workspace · type help · try open https://example.com' }]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/computer/status').then((data) => setStatus({ loading: false, ...data })).catch(() => setStatus({ loading: false, configured: false, provider: 'Ripo Computer Lite' }));
  }, []);

  async function run() {
    const value = command.trim();
    if (!value || busy) return;
    setLines((current) => [...current, { type: 'input', text: `$ ${value}` }]);
    setCommand('');
    setBusy(true);
    try {
      const data = await api('/api/computer/exec', { method: 'POST', body: JSON.stringify({ command: value }) });
      if (data.stdout === '__CLEAR__') setLines([{ type: 'system', text: 'Ripo Computer Lite · terminal cleared' }]);
      else if (data.stdout) setLines((current) => [...current, { type: 'output', text: data.stdout }]);
      if (data.stderr) setLines((current) => [...current, { type: 'error', text: data.stderr }]);
    } catch (err) {
      setLines((current) => [...current, { type: 'error', text: err.status === 503 ? 'Ripo Computer storage is temporarily unavailable.' : err.message }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="content-page computer-page">
      <header className="page-heading"><div><span className="eyebrow">Agent computer</span><h1>Ripo Computer</h1><p>A private Linux-style workspace with persistent files, terminal commands, search, and a real rendered browser — built to stay on the free plan.</p></div><StateLabel state={status.configured ? 'ready' : 'waiting'} /></header>
      <div className="computer-grid">
        <article className="computer-preview-card">
          <div className="computer-window-bar"><span className="traffic-lights"><i /><i /><i /></span><span>Ripo Computer</span><span className="computer-provider">{status.provider || 'Ripo Computer Lite'}</span></div>
          <div className="terminal-screen">
            {lines.map((line, index) => <pre key={`${line.type}-${index}`} className={`terminal-${line.type}`}>{line.text}</pre>)}
            <div className="terminal-input-row"><span>$</span><input value={command} disabled={!status.configured || busy} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && run()} placeholder={status.configured ? 'Run a command' : 'Computer unavailable'} /><button onClick={run} disabled={!status.configured || busy}><ArrowUp size={15} /></button></div>
          </div>
        </article>
        <aside className="computer-side-card">
          <div className="side-feature"><SquareTerminal size={18} /><div><strong>Linux-style terminal</strong><span>Private per-account shell commands and a persistent virtual filesystem without a paid VM.</span></div></div>
          <div className="side-feature"><HardDrive size={18} /><div><strong>Project files</strong><span>D1 and Workers KV keep workspace state and uploads across sessions on the free plan.</span></div></div>
          <div className="side-feature"><Globe2 size={18} /><div><strong>Real browser</strong><span>Use <code>open https://…</code> or <code>links https://…</code>. Cloudflare Browser Run renders JavaScript pages with a free 10-minute daily allowance.</span></div></div>
          {!status.configured && <div className="computer-warning"><strong>Computer unavailable</strong><span>Sign in again or retry in a moment. No paid Sandbox subscription is required.</span></div>}
        </aside>
      </div>
    </section>
  );
}

function usePrivateAsset(path, version = '') {
  const [src, setSrc] = useState('');
  useEffect(() => {
    if (!path) { setSrc(''); return undefined; }
    let alive = true;
    let objectUrl = '';
    fetch(`${API_BASE}${path}`, { headers: storedToken() ? { Authorization: `Bearer ${storedToken()}` } : {} })
      .then((response) => { if (!response.ok) throw new Error('asset'); return response.blob(); })
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {});
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [path, version]);
  return src;
}

function ProfilePicture({ account, size = 'lg', version = '', onClick }) {
  const src = usePrivateAsset(account?.user?.avatarUrl, version);
  const initials = (account?.user?.name || account?.user?.email || 'R').slice(0, 1).toUpperCase();
  return (
    <button type="button" className={cls('account-photo', `account-photo-${size}`)} onClick={onClick} disabled={!onClick}>
      {src ? <img src={src} alt="" /> : <span>{initials}</span>}
    </button>
  );
}

function UsageMeter({ label, data, subtitle }) {
  if (!data) return (
    <div className="usage-meter unlimited-meter">
      <div className="usage-meter-head"><strong>{label}</strong><span>Unlimited window</span></div>
      <div className="usage-track"><i style={{ width: '100%' }} /></div>
      <small>{subtitle}</small>
    </div>
  );
  return (
    <div className="usage-meter">
      <div className="usage-meter-head"><strong>{label}</strong><span>{data.remainingPercent}% left</span></div>
      <div className="usage-track"><i style={{ width: `${data.remainingPercent}%` }} /></div>
      <small>{subtitle || `${Math.max(0, data.limit - data.used).toLocaleString()} tokens remaining`}</small>
    </div>
  );
}

function SecureMedia({ file }) {
  const src = usePrivateAsset(`/api/files/${encodeURIComponent(file.id)}`, file.id);
  if (!src) return <div className="media-thumb media-loading"><LoaderCircle className="spin" size={18} /></div>;
  if (String(file.type || '').startsWith('video/')) return <video className="media-thumb" src={src} muted controls playsInline />;
  return <img className="media-thumb" src={src} alt={file.name || 'Workspace media'} />;
}

function SettingsView({
  profile,
  cloudMode,
  theme,
  accent,
  onThemeChange,
  onAccentChange,
  onLogout,
  onSwitchAccount,
  account,
  onRefreshAccount,
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onRefreshWorkspaces,
  files,
  onDeleteFile
}) {
  const [page, setPage] = useState('main');
  const [busy, setBusy] = useState(false);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [adminUsers, setAdminUsers] = useState([]);
  const avatarInput = useRef(null);
  const isAdmin = account?.role === 'admin';

  useEffect(() => {
    if (page === 'admin' && isAdmin) {
      api('/api/admin/users').then((data) => setAdminUsers(data.users || [])).catch(() => setAdminUsers([]));
    }
  }, [page, isAdmin]);

  async function uploadAvatar(event) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    setBusy(true);
    try {
      const body = new FormData(); body.append('file', chosen);
      await api('/api/account/avatar', { method: 'POST', body });
      setAvatarVersion((value) => value + 1);
      await onRefreshAccount?.();
    } finally { setBusy(false); event.target.value = ''; }
  }

  async function renameAccount() {
    const next = window.prompt('Profile name', account?.user?.name || profile?.name || '');
    if (!next?.trim()) return;
    setBusy(true);
    try { await api('/api/account', { method: 'PUT', body: JSON.stringify({ name: next.trim() }) }); await onRefreshAccount?.(); }
    finally { setBusy(false); }
  }

  async function claimDaily() {
    setBusy(true);
    try { await api('/api/coins/daily', { method: 'POST', body: '{}' }); await onRefreshAccount?.(); }
    catch (error) { alert(error.message || 'Could not claim coins.'); }
    finally { setBusy(false); }
  }

  async function upgrade() {
    setBusy(true);
    try { await api('/api/plans/upgrade', { method: 'POST', body: '{}' }); await onRefreshAccount?.(); }
    catch (error) { alert(error.message || 'Could not upgrade.'); }
    finally { setBusy(false); }
  }

  async function createWorkspace() {
    const name = window.prompt('Workspace name', 'New Workspace');
    if (!name?.trim()) return;
    setBusy(true);
    try { await api('/api/workspaces', { method: 'POST', body: JSON.stringify({ name: name.trim() }) }); await onRefreshWorkspaces?.(); }
    catch (error) { alert(error.message || 'Could not create workspace.'); }
    finally { setBusy(false); }
  }

  async function renameWorkspace(workspace) {
    const name = window.prompt('Rename workspace', workspace.name);
    if (!name?.trim()) return;
    setBusy(true);
    try { await api(`/api/workspaces/${encodeURIComponent(workspace.id)}/rename`, { method: 'PUT', body: JSON.stringify({ name: name.trim() }) }); await onRefreshWorkspaces?.(); }
    finally { setBusy(false); }
  }

  async function adminAction(user, action, payload = {}) {
    setBusy(true);
    try {
      await api(`/api/admin/users/${encodeURIComponent(user.id)}/action`, { method: 'POST', body: JSON.stringify({ action, ...payload }) });
      const data = await api('/api/admin/users'); setAdminUsers(data.users || []);
    } catch (error) { alert(error.message || 'Admin action failed.'); }
    finally { setBusy(false); }
  }

  const activeWorkspace = workspaces.find((item) => item.id === activeWorkspaceId) || workspaces[0];
  const media = files.filter((file) => /^image\//.test(file.type || '') || /^video\//.test(file.type || ''));

  const Back = ({ title }) => (
    <header className="settings-subheader">
      <button className="settings-back" onClick={() => setPage('main')}><ArrowLeft size={18} /></button>
      <h1>{title}</h1>
      <span />
    </header>
  );

  if (page === 'appearance') return (
    <section className="settings-v4 subpage">
      <Back title="Appearance" />
      <div className="settings-page-body narrow-settings">
        <div className="settings-section-card">
          <h2>Mode</h2><p>Light is the default. Dark keeps the same layout and spacing.</p>
          <div className="theme-preview-grid">
            {['light','dark','system'].map((value) => <button key={value} className={cls('theme-preview', theme === value && 'selected')} onClick={() => onThemeChange(value)}><span className={`theme-mini theme-mini-${value}`}><i /><i /><i /></span><strong>{value[0].toUpperCase()+value.slice(1)}</strong></button>)}
          </div>
        </div>
        <div className="settings-section-card">
          <h2>Theme color</h2><p>Pick the accent Ripo Bot uses for active states, usage, and highlights.</p>
          <div className="accent-grid">{['#111111','#7b5cf2','#168cf7','#11c58c','#ff7a18','#f42f8f','#e53f49','#00a8a8'].map((color) => <button key={color} className={cls('accent-choice', accent === color && 'selected')} style={{ '--choice': color }} onClick={() => onAccentChange(color)} aria-label={color}><i /></button>)}</div>
        </div>
      </div>
    </section>
  );

  if (page === 'workspaces') return (
    <section className="settings-v4 subpage">
      <Back title="Workspaces" />
      <div className="settings-page-body">
        <div className="workspace-page-head"><div><h2>Your workspaces</h2><p>Each workspace keeps its own bots, conversations, teams, and media.</p></div><button className="primary-button" onClick={createWorkspace} disabled={busy}><Plus size={16}/>New workspace</button></div>
        <div className="workspace-grid-v4">
          {workspaces.map((workspace) => <article key={workspace.id} className={cls('workspace-tile', workspace.id === activeWorkspaceId && 'active')}>
            <button className="workspace-open" onClick={() => onSelectWorkspace(workspace.id)}>
              <span className="workspace-icon"><BriefcaseBusiness size={20}/></span>
              <div><strong>{workspace.name}</strong><span>{workspace.botCount || 0} bots · {Math.round((workspace.storage?.used || 0)/1024/1024)} MB used</span></div>
              <ChevronRight size={17}/>
            </button>
            <div className="workspace-tile-actions"><button onClick={() => renameWorkspace(workspace)}><Pencil size={14}/> Rename</button></div>
          </article>)}
        </div>
        {activeWorkspace && <div className="workspace-stats-card">
          <div className="workspace-stat"><strong>{activeWorkspace.botCount || 0}</strong><span>Bots</span></div>
          <div className="workspace-stat"><strong>{(activeWorkspace.weeklyTokens || 0).toLocaleString()}</strong><span>AI tokens this week</span></div>
          <div className="workspace-stat"><strong>{Math.round((activeWorkspace.storage?.used || 0)/1024/1024)} MB</strong><span>Cloud storage</span></div>
          <div className="workspace-stat"><strong>{media.length}</strong><span>Media items</span></div>
        </div>}
        <div className="media-gallery-section">
          <div className="workspace-page-head"><div><h2>Media gallery</h2><p>Images and videos uploaded to or created inside this workspace.</p></div></div>
          {media.length ? <div className="media-gallery">{media.map((file) => <article key={file.id} className="media-item"><SecureMedia file={file}/><div><span title={file.name}>{file.name}</span><button onClick={() => onDeleteFile(file)}><Trash2 size={14}/></button></div></article>)}</div> : <div className="settings-empty"><Images size={28}/><strong>No media yet</strong><span>Images and videos you send to bots will appear here.</span></div>}
        </div>
      </div>
    </section>
  );

  if (page === 'plans') return (
    <section className="settings-v4 subpage">
      <Back title="Plans" />
      <div className="settings-page-body narrow-settings">
        <div className="plan-hero"><Crown size={28}/><h2>Ripo Bot {account?.plan === 'plus' ? 'Plus' : 'Free'}</h2><p>Upgrade with Ripo Coins — no card or real-money checkout in this version.</p><div className="coin-balance"><Coins size={18}/>{account?.coins || 0} Ripo Coins</div></div>
        <div className="plan-grid">
          <article className={cls('plan-card', account?.plan === 'free' && 'current')}><span className="plan-pill">Free</span><h3>Ripo Bot Free</h3><p>For everyday bot work.</p><ul><li>3-hour + weekly usage windows</li><li>1 workspace</li><li>250 MB zero-cost cloud storage</li><li>Web, computer, files, voice, image tools</li></ul>{account?.plan === 'free' && <span className="current-plan-label">Current plan</span>}</article>
          <article className={cls('plan-card plus-plan', account?.plan === 'plus' && 'current')}><span className="plan-pill"><Crown size={13}/>Plus</span><h3>Ripo Bot Plus</h3><p>More room for heavier work.</p><ul><li>No 3-hour app usage window</li><li>Higher weekly usage</li><li>2 workspaces</li><li>750 MB cloud storage on the zero-cost backend</li><li>Early feature access</li></ul>{account?.plan === 'plus' ? <span className="current-plan-label">Current plan</span> : <button className="primary-button" onClick={upgrade} disabled={busy}><Coins size={15}/>1200 coins · 30 days</button>}</article>
        </div>
        <div className="plan-note"><ShieldCheck size={17}/><span>The larger 500 GB target you asked for cannot honestly be hosted on the current free-only KV backend. This page shows the storage the live infrastructure can actually enforce without charging you.</span></div>
        {isAdmin && <button className="settings-nav-row admin-row" onClick={() => setPage('admin')}><span className="settings-row-icon"><Shield size={18}/></span><span><strong>Admin console</strong><small>Users, plans, coins, storage, bans, warnings, admins</small></span><ChevronRight size={17}/></button>}
      </div>
    </section>
  );

  if (page === 'plugins') {
    const plugins = [
      ['web','Web Search','Fresh public information and sources.',<Globe2 size={22}/>,'Built in'],
      ['browser','Browser Run','Render and read JavaScript websites when a bot needs them.',<Computer size={22}/>,'Built in'],
      ['files','Workspace Files','Read uploaded files and save generated work.',<Folder size={22}/>,'Built in'],
      ['images','Image Studio','Generate images with FLUX.2 [klein] on Workers AI.',<Images size={22}/>,'Built in'],
      ['voice','Voice Calls','Talk to bots using your device speech recognition and system voices.',<Mic size={22}/>,'Device'],
    ];
    const external = [
      ['gmail','Gmail','Requires Google OAuth before a website can safely access your mailbox.',<Mail size={22}/>],
      ['calendar','Google Calendar','Requires Google OAuth for real calendar actions.',<CalendarDays size={22}/>],
      ['github','GitHub','Requires OAuth or an authenticated app connection for private account actions.',<Github size={22}/>],
    ];
    return <section className="settings-v4 subpage"><Back title="Plugins"/><div className="settings-page-body">
      <div className="workspace-page-head"><div><h2>Connected tools</h2><p>These work immediately without you creating API keys.</p></div></div>
      <div className="plugin-grid">{plugins.map(([id,name,desc,icon,status]) => <article className="plugin-card" key={id}><span className={`plugin-logo plugin-${id}`}>{icon}</span><div><strong>{name}</strong><p>{desc}</p></div><span className="plugin-status connected"><Check size={13}/>{status}</span></article>)}</div>
      <div className="workspace-page-head plugin-external-head"><div><h2>External accounts</h2><p>I’m not faking “connected” buttons: these services require the provider’s OAuth authorization before Ripo Bot can safely access them.</p></div></div>
      <div className="plugin-grid">{external.map(([id,name,desc,icon]) => <article className="plugin-card muted-plugin" key={id}><span className={`plugin-logo plugin-${id}`}>{icon}</span><div><strong>{name}</strong><p>{desc}</p></div><span className="plugin-status">OAuth required</span></article>)}</div>
    </div></section>;
  }

  if (page === 'admin' && isAdmin) return (
    <section className="settings-v4 subpage">
      <Back title="Admin" />
      <div className="settings-page-body admin-console">
        <div className="admin-banner"><Shield size={24}/><div><strong>Ripo Bot Admin</strong><span>Server-side access is restricted to admins. The owner email is always protected.</span></div></div>
        <div className="admin-user-list">{adminUsers.map((user) => <article className="admin-user" key={user.id}>
          <div className="admin-user-main"><span className="admin-avatar">{(user.name || user.email).slice(0,1).toUpperCase()}</span><div><strong>{user.name}</strong><span>{user.email}</span><small>{user.plan} · {user.coins} coins · {user.warnings} warnings</small></div><span className={cls('role-chip', user.role === 'admin' && 'admin')}>{user.role}</span></div>
          <div className="admin-actions">
            <button onClick={() => { const amount=Number(window.prompt('Coins to add','100')); if(amount) adminAction(user,'addCoins',{amount}); }}><Coins size={14}/>Coins</button>
            <button onClick={() => adminAction(user,'setPlan',{plan:user.plan === 'plus' ? 'free':'plus',days:30})}><Crown size={14}/>{user.plan === 'plus' ? 'Make Free':'Give Plus'}</button>
            <button onClick={() => { const mb=Number(window.prompt('Extra storage MB','100')); if(mb>=0) adminAction(user,'setStorageBonus',{bytes:mb*1024*1024}); }}><HardDrive size={14}/>Storage</button>
            <button onClick={() => adminAction(user,'warn')}><TriangleAlert size={14}/>Warn</button>
            <button onClick={() => adminAction(user,user.bannedUntil ? 'unban':'ban',{hours:24})}><Ban size={14}/>{user.bannedUntil ? 'Unban':'Ban'}</button>
            <button onClick={() => adminAction(user,'setAdmin',{enabled:user.role !== 'admin'})}><Shield size={14}/>{user.role === 'admin' ? 'Remove admin':'Make admin'}</button>
          </div>
        </article>)}</div>
      </div>
    </section>
  );

  return (
    <section className="settings-v4">
      <header className="settings-main-header"><h1>Settings</h1></header>
      <div className="settings-page-body narrow-settings">
        <article className="account-hero-card">
          <input ref={avatarInput} type="file" accept="image/*" hidden onChange={uploadAvatar}/>
          <ProfilePicture account={account || { user: profile }} size="xl" version={avatarVersion} onClick={() => avatarInput.current?.click()}/>
          <div className="account-copy"><strong>{account?.user?.name || profile?.name || 'Ripo Bot user'}</strong><span>{account?.user?.email || profile?.email || ''}</span><button onClick={renameAccount}><Pencil size={13}/>Edit profile</button></div>
          <span className={cls('plan-badge', account?.plan === 'plus' && 'plus')}><Crown size={13}/>{account?.plan === 'plus' ? 'Plus':'Free'}</span>
        </article>

        <article className="usage-card-v4">
          <div className="settings-card-title"><Gauge size={18}/><div><strong>Usage</strong><span>Remaining allowance resets automatically.</span></div></div>
          <UsageMeter label="3-hour usage" data={account?.usage?.threeHour || null} subtitle={account?.plan === 'plus' ? 'Plus has no 3-hour Ripo Bot limit.' : undefined}/>
          <UsageMeter label="Weekly usage" data={account?.usage?.weekly}/>
        </article>

        <article className="coins-card">
          <div className="coin-orb"><Coins size={21}/></div><div><strong>{account?.coins || 0} Ripo Coins</strong><span>Earn 2 coins for successful bot turns, up to 50/day.</span></div><button className="secondary-button" onClick={claimDaily} disabled={busy}>Daily +25</button>
        </article>

        <div className="settings-nav-group">
          <button className="settings-nav-row" onClick={() => setPage('appearance')}><span className="settings-row-icon"><Palette size={18}/></span><span><strong>Appearance</strong><small>Light, dark, system, and accent theme</small></span><ChevronRight size={17}/></button>
          <button className="settings-nav-row" onClick={() => setPage('workspaces')}><span className="settings-row-icon"><BriefcaseBusiness size={18}/></span><span><strong>Workspaces</strong><small>{workspaces.length} workspace{workspaces.length === 1 ? '' : 's'} · bots, storage, media</small></span><ChevronRight size={17}/></button>
          <button className="settings-nav-row" onClick={() => setPage('plans')}><span className="settings-row-icon"><WalletCards size={18}/></span><span><strong>Plans</strong><small>Free, Plus, Ripo Coins, limits</small></span><ChevronRight size={17}/></button>
          <button className="settings-nav-row" onClick={() => setPage('plugins')}><span className="settings-row-icon"><Plug size={18}/></span><span><strong>Plugins</strong><small>Built-in tools and external connections</small></span><ChevronRight size={17}/></button>
          {isAdmin && <button className="settings-nav-row admin-row" onClick={() => setPage('admin')}><span className="settings-row-icon"><Shield size={18}/></span><span><strong>Admin</strong><small>Manage users, plans, coins and access</small></span><ChevronRight size={17}/></button>}
        </div>

        <div className="settings-nav-group account-actions">
          <button className="settings-nav-row" onClick={onSwitchAccount}><span className="settings-row-icon"><UserPlus size={18}/></span><span><strong>Switch account</strong><small>Sign in with another Ripo Bot account</small></span><ChevronRight size={17}/></button>
          <button className="settings-nav-row danger-row" onClick={onLogout}><span className="settings-row-icon"><LogOut size={18}/></span><span><strong>Log out</strong></span></button>
        </div>
        <div className="settings-version"><strong>Ripo Bot</strong><span>Version 4.0 · Web</span></div>
      </div>
    </section>
  );
}

function BotDetails({ agent, files, onClose, onEdit, onOpenComputer }) {
  const [tab, setTab] = useState('computer');
  const media = files.filter((file) => /^image\//.test(file.type || '') || /^video\//.test(file.type || ''));
  const busy = ['thinking','searching','working'].includes(agent?.state);
  return (
    <div className="bot-details-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="bot-details-sheet">
        <header className="bot-details-head"><button className="icon-button" onClick={onClose}><X size={18}/></button><span>Bot details</span><button className="icon-button" onClick={onEdit}><Pencil size={17}/></button></header>
        <div className="bot-details-profile">
          <Avatar agent={agent} size="xl" />
          <h2>{agent?.name}</h2><p>{agent?.role}</p>
          <StateLabel state={agent?.state || 'ready'} />
        </div>
        <div className="bot-details-tabs">
          <button className={cls(tab === 'computer' && 'active')} onClick={() => setTab('computer')}>Computer</button>
          <button className={cls(tab === 'media' && 'active')} onClick={() => setTab('media')}>Media</button>
          <button className={cls(tab === 'routines' && 'active')} onClick={() => setTab('routines')}>Routines</button>
        </div>
        <div className="bot-details-body">
          {tab === 'computer' && <div className="bot-computer-panel">
            <div className={cls('bot-screen-preview', busy && 'in-use')}>
              <div className="bot-screen-top"><span /><span /><span /><strong>Ripo Computer</strong></div>
              <div className="bot-screen-canvas">
                {busy ? <><div className="working-browser"><i/><i/><i/><div className="working-card-row"><span/><span/><span/></div></div><span className="animated-cursor">↖</span></> : <div className="computer-idle"><Computer size={34}/><strong>Not in use by {agent?.name}</strong><span>The shared computer wakes automatically when this bot needs browser or terminal work.</span></div>}
              </div>
            </div>
            <button className="secondary-button full-button" onClick={onOpenComputer}><Computer size={16}/>Open Ripo Computer</button>
          </div>}
          {tab === 'media' && (media.length ? <div className="bot-media-grid">{media.slice(0,24).map((file) => <SecureMedia key={file.id} file={file}/>)}</div> : <div className="settings-empty"><Images size={28}/><strong>No media yet</strong><span>Images and videos from this workspace will appear here.</span></div>)}
          {tab === 'routines' && <div className="routine-detail-list"><div className="routine-detail"><span>↻</span><div><strong>Morning briefing</strong><small>Paused until you ask {agent?.name} to schedule it.</small></div></div><div className="settings-empty compact"><RefreshCw size={24}/><strong>Teach a routine in chat</strong><span>Ask the bot to remember a repeatable workflow. Scheduled execution can be added once a durable scheduler is connected.</span></div></div>}
        </div>
      </section>
    </div>
  );
}

function VoiceCall({ agents, initialAgent, onClose, onTurn }) {
  const [participantIds, setParticipantIds] = useState([initialAgent?.id].filter(Boolean));
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [callLog, setCallLog] = useState([]);
  const [voices, setVoices] = useState([]);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const load = () => setVoices(window.speechSynthesis?.getVoices?.() || []);
    load();
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = load;
    return () => { if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = null; recognitionRef.current?.abort?.(); window.speechSynthesis?.cancel?.(); };
  }, []);

  function speak(text, agent) {
    if (!window.speechSynthesis || !text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    const english = voices.filter((voice) => /^en/i.test(voice.lang || ''));
    const pool = english.length ? english : voices;
    if (pool.length) utterance.voice = pool[avatarSeed(agent, { id: agent?.id }) % pool.length];
    utterance.rate = .98; utterance.pitch = .94 + (avatarSeed(agent, { id: agent?.id }) % 12) / 100;
    window.speechSynthesis.speak(utterance);
  }

  async function runTurn(text) {
    const clean = String(text || '').trim();
    if (!clean || busy) return;
    setBusy(true); setCallLog((current) => [...current, { role:'user', text:clean }]); setTranscript('');
    try {
      const replies = await onTurn(clean, participantIds);
      for (const reply of replies || []) {
        setCallLog((current) => [...current, { role:'bot', text:reply.content, agent:reply.agent }]);
        speak(reply.content, reply.agent);
      }
    } catch (error) {
      setCallLog((current) => [...current, { role:'system', text:error.message || 'Voice turn failed.' }]);
    } finally { setBusy(false); }
  }

  function startListening() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { alert('Live speech recognition is not available in this browser. You can still type during the call.'); return; }
    recognitionRef.current?.abort?.();
    const recognition = new Recognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.interimResults = true; recognition.continuous = false;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (event) => {
      let all = '', final = '';
      for (let i=event.resultIndex;i<event.results.length;i+=1) {
        const chunk = event.results[i][0]?.transcript || '';
        all += chunk;
        if (event.results[i].isFinal) final += chunk;
      }
      setTranscript(all);
      if (final.trim()) runTurn(final);
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  function toggleParticipant(id) {
    setParticipantIds((current) => current.includes(id) ? (current.length > 1 ? current.filter((item) => item !== id) : current) : [...current, id]);
  }

  return (
    <div className="voice-call-screen">
      <header className="voice-call-head"><button className="call-end" onClick={onClose}><PhoneOff size={18}/></button><div><strong>Ripo Bot Call</strong><span>{participantIds.length} bot{participantIds.length===1?'':'s'} in meeting</span></div><span /></header>
      <div className="call-stage">
        <div className="call-participants">{participantIds.map((id) => { const agent=agents.find((item)=>item.id===id); return agent ? <div className="call-person" key={id}><Avatar agent={{...agent,state:busy?'thinking':agent.state}} size="xl"/><strong>{agent.name}</strong><span>{busy?'Listening / working':agent.role}</span></div> : null; })}</div>
        <div className="call-transcript">{callLog.slice(-6).map((item,index)=><div key={index} className={cls('call-line',item.role)}>{item.agent && <Avatar agent={item.agent} size="xs"/>}<span>{item.text}</span></div>)}</div>
      </div>
      <div className="call-invite-strip"><span>Invite bots</span><div>{agents.map((agent)=><button key={agent.id} className={cls(participantIds.includes(agent.id)&&'active')} onClick={()=>toggleParticipant(agent.id)}><Avatar agent={agent} size="xs"/><span>{agent.name}</span></button>)}</div></div>
      <div className="call-controls">
        <button className={cls('mic-orb',listening&&'listening')} onClick={startListening} disabled={busy}>{busy?<LoaderCircle className="spin" size={23}/>:<Mic size={23}/>}</button>
        <div className="call-type"><input value={transcript} onChange={(event)=>setTranscript(event.target.value)} onKeyDown={(event)=>{if(event.key==='Enter')runTurn(transcript);}} placeholder={listening?'Listening…':'Speak or type to the meeting'}/><button onClick={()=>runTurn(transcript)} disabled={!transcript.trim()||busy}><ArrowUp size={17}/></button></div>
      </div>
      <p className="call-note"><Volume2 size={13}/>Uses your browser/device speech recognition and installed system voices, so voice quality and availability vary by device.</p>
    </div>
  );
}

function ChatView({
  agent,
  team,
  agents,
  messages,
  sending,
  onSend,
  onRename,
  onEdit,
  onOpenDetails,
  onStartCall,
  files,
  onNavigateFiles
}) {
  const [draft, setDraft] = useState('');
  const [attached, setAttached] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(agent?.name || team?.name || '');
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);
  useEffect(() => { setRenameValue(agent?.name || team?.name || ''); setRenaming(false); }, [agent?.id, team?.id]);
  const participants = team ? team.members.map((id) => agents.find((item) => item.id === id)).filter(Boolean) : [agent].filter(Boolean);

  function submit() {
    const value = draft.trim();
    if (!value || sending) return;
    onSend(value, { attachments: attached });
    setDraft(''); setAttached([]);
  }
  function saveRename() { if (!agent || !renameValue.trim()) return; onRename(renameValue.trim()); setRenaming(false); }

  return (
    <section className="chat-v4">
      <header className="chat-sticky-head">
        <div className="chat-head-spacer" />
        <button className="sticky-bot-identity" onClick={onOpenDetails}>
          <div className="sticky-avatar-stack">{participants.slice(0,3).map((item,index)=><span key={item.id} style={{zIndex:participants.length-index}}><Avatar agent={item} size={index===0?'md':'xs'} active={index===0}/></span>)}</div>
          <div className="sticky-bot-name">{renaming&&agent?<div className="inline-rename"><input value={renameValue} onChange={(event)=>setRenameValue(event.target.value)} onKeyDown={(event)=>{if(event.key==='Enter')saveRename();}} autoFocus/><button onClick={(event)=>{event.stopPropagation();saveRename();}}><Check size={13}/></button></div>:<strong>{team?.name||agent?.name||'Ripo Bot'}</strong>}<span>{sending?'Working…':team?`${participants.length} bots`:agent?.role}</span></div>
        </button>
        <div className="chat-head-actions"><button className="round-action" onClick={onStartCall}><Phone size={17}/></button>{agent&&<div className="relative"><button className="round-action" onClick={()=>setMenuOpen(menuOpen==='more'?false:'more')}><MoreHorizontal size={18}/></button>{menuOpen==='more'&&<div className="popover-menu head-menu"><button onClick={()=>{setRenaming(true);setMenuOpen(false);}}><Pencil size={15}/>Rename</button><button onClick={()=>{onEdit();setMenuOpen(false);}}><Settings size={15}/>Edit bot</button><button onClick={()=>{onOpenDetails();setMenuOpen(false);}}><Computer size={15}/>Bot details</button></div>}</div>}</div>
      </header>

      <div className="chat-scroll-v4">
        {messages.length <= 1 && !team && <div className="chat-welcome-v4"><Avatar agent={agent} size="xl"/><h1>{agent?.name}</h1><p>{agent?.description}</p><div className="starter-pills">{QUICK_STARTS.slice(0,4).map((item)=><button key={item.title} onClick={()=>setDraft(item.prompt)}>{item.title}</button>)}</div></div>}
        {team && messages.length===0 && <div className="chat-welcome-v4"><div className="team-orbit">{participants.map((member)=><Avatar key={member.id} agent={member} size="lg"/>)}</div><h1>{team.name}</h1><p>Message the group once. Bots can pass context and handoffs between each other in this thread.</p></div>}
        <div className="message-list-v4">{messages.map((message)=>{
          const author=message.agentId?agents.find((item)=>item.id===message.agentId):null;
          const user=message.role==='user';
          return <article className={cls('bubble-row-v4',user&&'user')} key={message.id}>
            {!user && author && <Avatar agent={author} size="xs"/>}
            <div className={cls('bubble-v4',user&&'user-bubble')}>
              {!user&&author&&<div className="bubble-author">{author.name}</div>}
              <div className="bubble-text">{message.content}</div>
              {message.sources?.length?<button className="bubble-tool-note"><Globe2 size={13}/>{message.sources.length} sources</button>:null}
              {message.attachments?.length?<div className="bubble-files">{message.attachments.map((file)=><span key={file.id}><FileText size={13}/>{file.name}</span>)}</div>:null}
              {message.generatedFiles?.length?<div className="generated-media">{message.generatedFiles.map((file)=><SecureMedia key={file.id} file={file}/>)}</div>:null}
            </div>
          </article>;
        })}
        {sending&&<article className="bubble-row-v4"><Avatar agent={agent||participants[0]} size="xs"/><div className="bubble-v4 typing-bubble"><span/><span/><span/></div></article>}
        <div ref={bottomRef}/>
        </div>
      </div>

      <div className="composer-v4-wrap">
        {attached.length>0&&<div className="composer-files">{attached.map((file)=><span key={file.id}><File size={13}/>{file.name}<button onClick={()=>setAttached(attached.filter((item)=>item.id!==file.id))}><X size={12}/></button></span>)}</div>}
        <div className="composer-v4">
          <div className="relative"><button className="composer-plus" onClick={()=>setMenuOpen(menuOpen==='files'?false:'files')}><Plus size={20}/></button>{menuOpen==='files'&&<div className="attachment-menu v4-attachments"><div className="attachment-menu-head"><strong>Workspace files</strong><button onClick={onNavigateFiles}>Manage</button></div>{files.length?files.slice(0,8).map((file)=><button key={file.id} onClick={()=>{if(!attached.some((item)=>item.id===file.id))setAttached([...attached,file]);setMenuOpen(false);}}><FileText size={15}/><span>{file.name}</span></button>):<div className="attachment-empty">Upload a file first.</div>}</div>}</div>
          <textarea value={draft} onChange={(event)=>setDraft(event.target.value)} onKeyDown={(event)=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();submit();}}} rows={1} placeholder={team?`Message ${team.name}`:`Ask ${agent?.name||'Ripo Bot'}`}/>
          <button className="composer-call" onClick={onStartCall}><Mic size={18}/></button>
          <button className={cls('composer-send',draft.trim()&&'ready')} onClick={submit} disabled={!draft.trim()||sending}>{sending?<Square size={14} fill="currentColor"/>:<ArrowUp size={17}/>}</button>
        </div>
        <small className="auto-tools-note">Search, browser, computer, and image tools run automatically when the bot needs them.</small>
      </div>
    </section>
  );
}

export default function App() {
  const [auth, setAuth] = useState(() => readLocal(LOCAL_KEYS.session, null));
  const [profile, setProfile] = useState(() => readLocal(LOCAL_KEYS.profile, null));
  const [cloudMode, setCloudMode] = useState(false);
  const [onboarded, setOnboarded] = useState(() => readLocal(LOCAL_KEYS.onboarded, false));
  const [agents, setAgents] = useState(() => readLocal(LOCAL_KEYS.agents, STARTER_AGENTS));
  const [conversations, setConversations] = useState(() => readLocal(LOCAL_KEYS.conversations, DEFAULT_CONVERSATIONS));
  const [teams, setTeams] = useState(() => readLocal(LOCAL_KEYS.teams, []));
  const [files, setFiles] = useState(() => readLocal(LOCAL_KEYS.files, []));
  const [view, setView] = useState('chat');
  const [activeAgentId, setActiveAgentId] = useState('ripo');
  const [activeTeamId, setActiveTeamId] = useState(null);
  const [mobileNav, setMobileNav] = useState(true);
  const [theme, setTheme] = useState(() => readLocal(LOCAL_KEYS.theme, 'light'));
  const [accent, setAccent] = useState(() => readLocal(LOCAL_KEYS.accent, '#111111'));
  const [account, setAccount] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(() => readLocal(LOCAL_KEYS.activeWorkspace, null));
  const [archivedChats, setArchivedChats] = useState(() => readLocal(LOCAL_KEYS.archivedChats, []));
  const [modal, setModal] = useState(null);
  const [sending, setSending] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [toast, setToast] = useState('');
  const [syncState, setSyncState] = useState('saved');

  const activeAgent = agents.find((item) => item.id === activeAgentId) || agents[0];
  const activeTeam = teams.find((item) => item.id === activeTeamId) || null;
  const threadKey = activeTeam ? `team:${activeTeam.id}` : activeAgent?.id;
  const messages = conversations[threadKey] || [];

  async function refreshAccount() {
    if (!cloudMode && !storedToken()) return null;
    try {
      const data = await api('/api/account');
      setAccount(data);
      if (data?.user) { setProfile(data.user); writeLocal(LOCAL_KEYS.profile, data.user); }
      return data;
    } catch { return null; }
  }

  async function refreshWorkspaces(preferredId = activeWorkspaceId) {
    if (!storedToken()) return [];
    try {
      const data = await api('/api/workspaces');
      const list = data.workspaces || [];
      setWorkspaces(list);
      const chosen = list.find((item) => item.id === preferredId)?.id || list[0]?.id || null;
      if (chosen && chosen !== activeWorkspaceId) {
        setActiveWorkspaceId(chosen);
        writeLocal(LOCAL_KEYS.activeWorkspace, chosen);
      }
      return list;
    } catch { return []; }
  }

  async function loadWorkspace(workspaceId) {
    if (!workspaceId || !storedToken()) return;
    try {
      const state = await api(`/api/state?workspaceId=${encodeURIComponent(workspaceId)}`);
      const nextAgents = state?.agents?.length ? state.agents : [STARTER_AGENTS[0]];
      setAgents(nextAgents);
      setConversations(state?.conversations && Object.keys(state.conversations).length ? state.conversations : { ripo: DEFAULT_CONVERSATIONS.ripo });
      setTeams(Array.isArray(state?.teams) ? state.teams : []);
      setArchivedChats(Array.isArray(state?.archivedChats) ? state.archivedChats : []);
      if (typeof state?.onboarded === 'boolean') setOnboarded(state.onboarded);
      const dataFiles = await api(`/api/files?workspaceId=${encodeURIComponent(workspaceId)}`).catch(() => ({ files: [] }));
      setFiles(Array.isArray(dataFiles?.files) ? dataFiles.files : []);
      setActiveAgentId(nextAgents[0]?.id || 'ripo');
      setActiveTeamId(null);
    } catch {}
  }

  useEffect(() => {
    api('/api/auth/session').then(async (data) => {
      if (!data?.user) return;
      const previous = readLocal(LOCAL_KEYS.session, null);
      const next = { profile: data.user, cloud: true, token: previous?.token || '', expiresAt: previous?.expiresAt || null };
      setAuth(next); setProfile(data.user); setCloudMode(true); setAccount(data);
      writeLocal(LOCAL_KEYS.session, next); writeLocal(LOCAL_KEYS.profile, data.user);
      const workspaceData = await api('/api/workspaces').catch(() => ({ workspaces: [] }));
      const list = workspaceData.workspaces || [];
      setWorkspaces(list);
      const remembered = readLocal(LOCAL_KEYS.activeWorkspace, null);
      const workspaceId = list.find((item) => item.id === remembered)?.id || data.defaultWorkspaceId || list[0]?.id;
      if (workspaceId) {
        setActiveWorkspaceId(workspaceId); writeLocal(LOCAL_KEYS.activeWorkspace, workspaceId);
        await loadWorkspace(workspaceId);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => { writeLocal(LOCAL_KEYS.agents, agents); }, [agents]);
  useEffect(() => { writeLocal(LOCAL_KEYS.conversations, conversations); }, [conversations]);
  useEffect(() => { writeLocal(LOCAL_KEYS.teams, teams); }, [teams]);
  useEffect(() => { writeLocal(LOCAL_KEYS.files, files); }, [files]);
  useEffect(() => { writeLocal(LOCAL_KEYS.onboarded, onboarded); }, [onboarded]);
  useEffect(() => { writeLocal(LOCAL_KEYS.archivedChats, archivedChats); }, [archivedChats]);
  useEffect(() => { if (activeWorkspaceId) writeLocal(LOCAL_KEYS.activeWorkspace, activeWorkspaceId); }, [activeWorkspaceId]);
  useEffect(() => {
    writeLocal(LOCAL_KEYS.accent, accent);
    document.documentElement.style.setProperty('--user-accent', accent);
  }, [accent]);
  useEffect(() => {
    writeLocal(LOCAL_KEYS.theme, theme);
    const root = document.documentElement;
    root.dataset.theme = theme;
    if (theme === 'system') {
      const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
      root.dataset.resolvedTheme = dark ? 'dark' : 'light';
      root.style.colorScheme = dark ? 'dark' : 'light';
    } else {
      root.dataset.resolvedTheme = theme;
      root.style.colorScheme = theme;
    }
  }, [theme]);

  useEffect(() => {
    if (!cloudMode || !auth || !onboarded) return undefined;
    setSyncState('saving');
    const timer = setTimeout(() => {
      api('/api/state', {
        method: 'PUT',
        body: JSON.stringify({ workspaceId: activeWorkspaceId, agents, conversations, teams, archivedChats, onboarded })
      }).then(() => setSyncState('saved')).catch(() => setSyncState('local'));
    }, 700);
    return () => clearTimeout(timer);
  }, [agents, conversations, teams, archivedChats, onboarded, cloudMode, auth, activeWorkspaceId]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  async function authenticated({ profile: nextProfile, cloud, token = '', expiresAt = null, account: nextAccount = null }) {
    const next = { profile: nextProfile, cloud, token, expiresAt };
    setAuth(next); setProfile(nextProfile); setCloudMode(cloud);
    writeLocal(LOCAL_KEYS.session, next); writeLocal(LOCAL_KEYS.profile, nextProfile);
    if (cloud) {
      const accountData = nextAccount || await api('/api/account').catch(() => null);
      if (accountData) setAccount(accountData);
      const list = await refreshWorkspaces(accountData?.defaultWorkspaceId || null);
      const workspaceId = list[0]?.id || accountData?.defaultWorkspaceId;
      if (workspaceId) { setActiveWorkspaceId(workspaceId); await loadWorkspace(workspaceId); }
    }
  }

  function finishOnboarding(data) {
    const selectedIds = new Set(['ripo', ...(data.starter || [])]);
    setAgents(STARTER_AGENTS.filter((agent) => selectedIds.has(agent.id)));
    const nextProfile = { ...(profile || {}), name: data.displayName, goal: data.goal };
    setProfile(nextProfile); writeLocal(LOCAL_KEYS.profile, nextProfile);
    setOnboarded(true);
  }

  async function selectWorkspace(workspaceId) {
    if (!workspaceId || workspaceId === activeWorkspaceId) { setView('chat'); return; }
    if (cloudMode && activeWorkspaceId) {
      await api('/api/state', { method: 'PUT', body: JSON.stringify({ workspaceId: activeWorkspaceId, agents, conversations, teams, archivedChats, onboarded }) }).catch(() => {});
    }
    setActiveWorkspaceId(workspaceId);
    writeLocal(LOCAL_KEYS.activeWorkspace, workspaceId);
    await loadWorkspace(workspaceId);
    setView('chat'); setMobileNav(false); setToast('Workspace switched');
  }

  function archiveCurrentChat() {
    if (!threadKey || !messages.length) return;
    const firstUser = messages.find((message) => message.role === 'user')?.content || (activeTeam?.name || activeAgent?.name || 'Conversation');
    const archive = {
      id: uid('archive'), threadKey, agentId: activeAgent?.id || null, teamId: activeTeam?.id || null,
      title: firstUser.slice(0, 72), createdAt: Date.now(), messages
    };
    setArchivedChats((current) => [archive, ...current].slice(0, 200));
  }

  function newTask() {
    archiveCurrentChat();
    if (!threadKey) return;
    setConversations((current) => ({ ...current, [threadKey]: [] }));
    setView('chat'); setMobileNav(false);
  }

  function openArchive(archive) {
    if (!archive) return;
    if (archive.teamId) { setActiveTeamId(archive.teamId); }
    else { setActiveAgentId(archive.agentId || 'ripo'); setActiveTeamId(null); }
    setConversations((current) => ({ ...current, [archive.threadKey]: archive.messages || [] }));
    setView('chat'); setMobileNav(false);
  }

  function navigate(next) {
    setView(next); setMobileNav(false);
    if (next !== 'chat') { setActiveTeamId(null); }
  }

  function openAgent(agentId) {
    setActiveAgentId(agentId); setActiveTeamId(null); setView('chat'); setMobileNav(false);
  }

  function openTeam(teamId) {
    setActiveTeamId(teamId); setView('chat'); setMobileNav(false);
  }

  function createAgent(form) {
    const next = { ...form, id: uid('agent'), avatarSeed: form.avatarSeed || uid('avatar'), state: 'ready', isPrimary: false };
    setAgents((current) => [...current, next]);
    setConversations((current) => ({ ...current, [next.id]: [{ id: uid('welcome'), role: 'assistant', content: `I’m ${next.name}. ${next.description || 'Tell me what you want me to handle.'}`, createdAt: new Date().toISOString(), agentId: next.id }] }));
    setModal(null); openAgent(next.id); setToast(`${next.name} joined your team`);
  }

  function saveAgent(form) {
    setAgents((current) => current.map((item) => item.id === activeAgent.id ? { ...item, ...form } : item));
    setModal(null); setToast('Agent updated');
  }

  function renameAgent(name) {
    setAgents((current) => current.map((item) => item.id === activeAgent.id ? { ...item, name } : item));
    setToast(`Renamed to ${name}`);
  }

  function createTeam(team) {
    setTeams((current) => [...current, team]);
    setConversations((current) => ({ ...current, [`team:${team.id}`]: [] }));
    setModal(null); openTeam(team.id); setToast(`${team.name} created`);
  }

  async function uploadFiles(selected) {
    const uploaded = [];
    for (const file of selected) {
      if (cloudMode) {
        try {
          const body = new FormData();
          body.append('file', file);
          if (activeWorkspaceId) body.append('workspaceId', activeWorkspaceId);
          const result = await api('/api/files', { method: 'POST', body });
          if (result?.file) { uploaded.push(result.file); continue; }
        } catch {
          // Fall back to device metadata below.
        }
      }
      uploaded.push({ id: uid('file'), name: file.name, size: file.size, type: file.type, source: 'device', createdAt: Date.now() });
    }
    setFiles((current) => [...uploaded, ...current]);
    setToast(`${uploaded.length} file${uploaded.length === 1 ? '' : 's'} added`);
    refreshWorkspaces(activeWorkspaceId).catch(() => {});
  }

  async function deleteFile(file) {
    if (!file?.id) return;
    try {
      await api(`/api/files/${encodeURIComponent(file.id)}`, { method: 'DELETE' });
      setFiles((current) => current.filter((item) => item.id !== file.id));
      setToast('File deleted');
      refreshWorkspaces(activeWorkspaceId).catch(() => {});
    } catch (error) { alert(error.message || 'Could not delete file.'); }
  }

  async function sendSingleAgent(agent, text, options = {}, history, targetKey) {
    setAgents((current) => current.map((item) => item.id === agent.id ? { ...item, state: 'working' } : item));
    const payloadMessages = history.slice(-18).map((message) => ({ role: message.role, content: message.content }));
    const result = await api('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        agentName: agent.name,
        agentRole: agent.role,
        agentInstructions: agent.instructions || '',
        messages: payloadMessages,
        workspaceId: activeWorkspaceId,
        attachments: (options.attachments || []).map((file) => ({ id: file.id, name: file.name, type: file.type })),
        allowAgentAdmin: Boolean(agent.isPrimary),
        allowRename: Boolean(agent.canRenameSelf)
      })
    });
    if (Array.isArray(result.actions)) {
      for (const action of result.actions) {
        if (action.type === 'rename_agent' && action.name) {
          const nextName = String(action.name).trim().slice(0, 80);
          const targetName = String(action.targetName || '').trim().toLowerCase();
          if (nextName && agent.isPrimary && targetName) {
            setAgents((current) => current.map((item) => item.name.toLowerCase() === targetName ? { ...item, name: nextName } : item));
          } else if (nextName && agent.canRenameSelf) {
            setAgents((current) => current.map((item) => item.id === agent.id ? { ...item, name: nextName } : item));
          }
        }
        if (action.type === 'create_agent' && agent.isPrimary && action.name) {
          const newAgent = {
            id: uid('agent'),
            name: String(action.name).trim().slice(0, 80),
            role: String(action.role || 'Specialist agent').trim().slice(0, 120),
            description: String(action.description || 'Created by Ripo Bot for this workspace.').trim().slice(0, 220),
            instructions: String(action.instructions || 'Help with the assigned specialty.').trim().slice(0, 1800),
            avatar: AVATAR_PRESETS.some((preset) => preset.id === action.avatar) ? action.avatar : 'nova',
            avatarSeed: uid('avatar'),
            state: 'ready',
            canRenameSelf: true,
            isPrimary: false
          };
          setAgents((current) => current.some((item) => item.name.toLowerCase() === newAgent.name.toLowerCase()) ? current : [...current, newAgent]);
          setConversations((current) => current[newAgent.id] ? current : { ...current, [newAgent.id]: [] });
          setToast(`${newAgent.name} joined your team`);
        }
        if (action.type === 'message_agent' && agent.isPrimary && action.targetName && action.message) {
          const target = agents.find((item) => item.name.toLowerCase() === String(action.targetName).toLowerCase());
          if (target) {
            const handoff = { id: uid('handoff'), role: 'assistant', content: `Message from ${agent.name}: ${String(action.message).slice(0, 2000)}`, createdAt: new Date().toISOString(), agentId: agent.id };
            setConversations((current) => ({ ...current, [target.id]: [...(current[target.id] || []), handoff] }));
            setToast(`${agent.name} messaged ${target.name}`);
          }
        }
        if (action.type === 'create_team' && agent.isPrimary && action.name && Array.isArray(action.memberNames)) {
          const wanted = action.memberNames.map((name) => String(name).toLowerCase());
          const memberIds = agents.filter((item) => wanted.includes(item.name.toLowerCase())).map((item) => item.id);
          if (memberIds.length >= 2) {
            const newTeam = { id: uid('team'), name: String(action.name).trim().slice(0, 80), members: memberIds, createdAt: Date.now() };
            setTeams((current) => [...current, newTeam]);
            setConversations((current) => ({ ...current, [`team:${newTeam.id}`]: current[`team:${newTeam.id}`] || [] }));
            setToast(`${newTeam.name} created`);
          }
        }
      }
    }
    const reply = {
      id: uid('assistant'), role: 'assistant', content: result.reply,
      createdAt: new Date().toISOString(), agentId: agent.id,
      sources: result.sources || [],
      generatedFiles: result.generatedFiles || []
    };
    if (Array.isArray(result.generatedFiles) && result.generatedFiles.length) {
      setFiles((current) => [...result.generatedFiles, ...current.filter((file) => !result.generatedFiles.some((generated) => generated.id === file.id))]);
    }
    if (result.usage || typeof result.coins === 'number') {
      setAccount((current) => current ? { ...current, usage: result.usage || current.usage, coins: typeof result.coins === 'number' ? result.coins : current.coins } : current);
    }
    setConversations((current) => ({ ...current, [targetKey]: [...(current[targetKey] || []), reply] }));
    setAgents((current) => current.map((item) => item.id === agent.id ? { ...item, state: 'done' } : item));
    setTimeout(() => setAgents((current) => current.map((item) => item.id === agent.id ? { ...item, state: 'ready' } : item)), 1200);
    return reply;
  }

  async function sendMessage(text, options) {
    if (!threadKey || sending) return;
    const userMessage = { id: uid('user'), role: 'user', content: text, createdAt: new Date().toISOString(), attachments: options.attachments || [] };
    const initialHistory = [...messages, userMessage];
    setConversations((current) => ({ ...current, [threadKey]: [...(current[threadKey] || []), userMessage] }));
    setSending(true);
    try {
      if (activeTeam) {
        let rolling = initialHistory;
        const memberAgents = activeTeam.members.map((id) => agents.find((item) => item.id === id)).filter(Boolean);
        for (const member of memberAgents) {
          const teamPrompt = member.id === memberAgents[0]?.id
            ? text
            : `Continue the team task. Read the previous agents' contributions, add what your specialty can improve, and do not repeat them unnecessarily. Original task: ${text}`;
          const teamHistory = [...rolling.slice(-12), { id: uid('handoff'), role: 'user', content: teamPrompt, createdAt: new Date().toISOString() }];
          const reply = await sendSingleAgent(member, teamPrompt, options, teamHistory, threadKey);
          rolling = [...rolling, reply];
        }
      } else {
        await sendSingleAgent(activeAgent, text, options, initialHistory, threadKey);
      }
    } catch (err) {
      const errorMessage = { id: uid('error'), role: 'assistant', content: err.message || 'Ripo Bot could not reach the model.', createdAt: new Date().toISOString(), agentId: activeAgent?.id };
      setConversations((current) => ({ ...current, [threadKey]: [...(current[threadKey] || []), errorMessage] }));
      if (activeAgent) setAgents((current) => current.map((item) => item.id === activeAgent.id ? { ...item, state: 'error' } : item));
    } finally {
      setSending(false);
    }
  }

  async function sendVoiceTurn(text, participantIds) {
    if (!threadKey || sending) return [];
    const selected = (participantIds || []).map((id) => agents.find((agent) => agent.id === id)).filter(Boolean);
    const participants = selected.length ? selected : [activeAgent].filter(Boolean);
    const userMessage = { id: uid('voice-user'), role: 'user', content: text, createdAt: new Date().toISOString(), voice: true };
    const base = [...(conversations[threadKey] || []), userMessage];
    setConversations((current) => ({ ...current, [threadKey]: [...(current[threadKey] || []), userMessage] }));
    setSending(true);
    const replies = [];
    try {
      let rolling = base;
      for (const participant of participants) {
        const prompt = participants.length > 1 ? `Voice meeting message from the user: ${text}\nRespond as ${participant.name}. You may coordinate with the other bots, but keep the spoken response concise.` : text;
        const reply = await sendSingleAgent(participant, prompt, {}, rolling, threadKey);
        replies.push({ ...reply, agent: participant });
        rolling = [...rolling, reply];
      }
      return replies;
    } finally { setSending(false); }
  }

  async function logout() {
    if (cloudMode) api('/api/auth/logout', { method: 'POST', body: '{}' }).catch(() => {});
    setAuth(null); setCloudMode(false); setProfile(null); setAccount(null); setOnboarded(false); setWorkspaces([]);
    const keepTheme = theme, keepAccent = accent;
    Object.values(LOCAL_KEYS).forEach((key) => { try { localStorage.removeItem(key); } catch {} });
    writeLocal(LOCAL_KEYS.theme, keepTheme); writeLocal(LOCAL_KEYS.accent, keepAccent);
  }

  async function switchAccount() { await logout(); }

  const visibleAgents = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return agents;
    return agents.filter((agent) => `${agent.name} ${agent.role}`.toLowerCase().includes(query));
  }, [agents, searchText]);

  if (!auth) return <AuthScreen onAuthenticated={authenticated} />;
  if (!onboarded) return <Onboarding profile={profile || auth.profile} onDone={finishOnboarding} />;

  return (
    <div className="app-shell" data-theme={theme}>
      <aside className={cls('sidebar', mobileNav && 'mobile-open')}>
        <div className="sidebar-top">
          <button className="sidebar-profile-orb" onClick={() => navigate('settings')} aria-label="Open settings">{(profile?.name || 'R').slice(0, 1).toUpperCase()}</button>
          <div className="brand-lockup sidebar-brand"><span>Ripo Bot</span></div>
          <div className="sidebar-top-actions">
            <button className="icon-button" onClick={() => setModal('new-agent')} aria-label="Create bot"><Plus size={18} /></button>
            <button className="icon-button sidebar-close" onClick={() => setMobileNav(false)}><X size={18} /></button>
          </div>
        </div>
        <button className="new-task-button" onClick={newTask}><Plus size={17} /><span>New task</span><kbd>⌘ N</kbd></button>
        <div className="sidebar-search"><Search size={15} /><input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search bots" /><kbd>⌘ K</kbd></div>

        <nav className="sidebar-nav primary-nav">
          <button className={cls(view === 'chat' && !activeTeamId && activeAgentId === 'ripo' && 'active')} onClick={() => openAgent('ripo')}><MessageSquare size={17} /><span>Ripo Bot</span></button>
          <button className={cls(view === 'files' && 'active')} onClick={() => navigate('files')}><Folder size={17} /><span>Files</span><em>{files.length || ''}</em></button>
          <button className={cls(view === 'computer' && 'active')} onClick={() => navigate('computer')}><Computer size={17} /><span>Computer</span></button>
        </nav>

        <div className="sidebar-section">
          <div className="section-label"><span>Bots</span><button onClick={() => setModal('new-agent')} aria-label="Create agent"><Plus size={14} /></button></div>
          <div className="agent-list">
            {visibleAgents.map((agent) => <button key={agent.id} className={cls('agent-list-item', view === 'chat' && !activeTeamId && activeAgentId === agent.id && 'active')} onClick={() => openAgent(agent.id)}><Avatar agent={agent} size="xs" /><span><strong>{agent.name}</strong><small>{agent.state === 'ready' ? agent.role : agent.state}</small></span>{agent.state !== 'ready' ? <i className={`tiny-state state-${agent.state}`} /> : null}</button>)}
          </div>
        </div>

        <div className="sidebar-section teams-section">
          <div className="section-label"><span>Teams</span><button onClick={() => setModal('new-team')} aria-label="Create team"><Plus size={14} /></button></div>
          <div className="team-list">
            {teams.length === 0 ? <button className="create-team-hint" onClick={() => setModal('new-team')}><Users size={15} /> Create a team</button> : teams.map((team) => <button key={team.id} className={cls(view === 'chat' && activeTeamId === team.id && 'active')} onClick={() => openTeam(team.id)}><Users size={15} /><span>{team.name}</span><small>{team.members.length}</small></button>)}
          </div>
        </div>

        {archivedChats.length > 0 && <div className="sidebar-section recent-section">
          <div className="section-label"><span>Recent</span><small>{archivedChats.length}</small></div>
          <div className="recent-chat-list">
            {archivedChats.slice(0, 8).map((chat) => <button key={chat.id} onClick={() => openArchive(chat)}><MessageSquare size={14}/><span><strong>{chat.title || 'Saved chat'}</strong><small>{new Date(chat.createdAt).toLocaleDateString()}</small></span></button>)}
          </div>
        </div>}

        <div className="sidebar-footer">
          <button className={cls('sync-indicator', syncState === 'local' && 'local')}><Cloud size={14} /><span>{cloudMode ? (syncState === 'saving' ? 'Saving…' : syncState === 'local' ? 'Saved locally' : 'Synced') : 'Device mode'}</span></button>
          <button className={cls('profile-button', view === 'settings' && 'active')} onClick={() => navigate('settings')}><span className="profile-avatar">{(profile?.name || 'R').slice(0, 1).toUpperCase()}</span><span><strong>{profile?.name || 'Ripo user'}</strong><small>{account?.plan === 'plus' ? 'Plus · cloud workspace' : cloudMode ? 'Free · cloud workspace' : 'This device'}</small></span><Settings size={15} /></button>
        </div>
      </aside>
      {mobileNav && <div className="mobile-scrim" onClick={() => setMobileNav(false)} />}

      <main className="main-shell">
        <button className="mobile-menu-button" onClick={() => setMobileNav(true)} aria-label="Back to bots"><ArrowLeft size={20} /></button>
        {view === 'chat' && <ChatView agent={activeAgent} team={activeTeam} agents={agents} messages={messages} sending={sending} onSend={sendMessage} onRename={renameAgent} onEdit={() => setModal('edit-agent')} onOpenDetails={() => setModal('bot-details')} onStartCall={() => setModal('voice-call')} files={files} onNavigateFiles={() => navigate('files')} />}
        {view === 'files' && <FilesView files={files} onUpload={uploadFiles} cloudMode={cloudMode} />}
        {view === 'computer' && <ComputerView />}
        {view === 'settings' && <SettingsView profile={profile} cloudMode={cloudMode} theme={theme} accent={accent} onThemeChange={setTheme} onAccentChange={setAccent} onLogout={logout} onSwitchAccount={switchAccount} account={account} onRefreshAccount={refreshAccount} workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} onSelectWorkspace={selectWorkspace} onRefreshWorkspaces={() => refreshWorkspaces(activeWorkspaceId)} files={files} onDeleteFile={deleteFile} />}
      </main>

      {modal === 'new-agent' && <AgentEditor onClose={() => setModal(null)} onSave={createAgent} />}
      {modal === 'edit-agent' && activeAgent && <AgentEditor initialAgent={activeAgent} onClose={() => setModal(null)} onSave={saveAgent} />}
      {modal === 'new-team' && <TeamEditor agents={agents} onClose={() => setModal(null)} onSave={createTeam} />}
      {modal === 'bot-details' && activeAgent && <BotDetails agent={activeAgent} files={files} onClose={() => setModal(null)} onEdit={() => setModal('edit-agent')} onOpenComputer={() => { setModal(null); navigate('computer'); }} />}
      {modal === 'voice-call' && activeAgent && <VoiceCall agents={agents} initialAgent={activeAgent} onClose={() => setModal(null)} onTurn={sendVoiceTurn} />}
      {toast && <div className="toast"><CheckCircle2 size={16} />{toast}</div>}
    </div>
  );
}
