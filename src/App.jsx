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
  Zap
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
  theme: 'ripobot.theme.v3'
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

function Avatar({ agent, size = 'md', active = false }) {
  const preset = AVATAR_PRESETS.find((item) => item.id === agent?.avatar) || AVATAR_PRESETS[0];
  const state = agent?.state || 'ready';
  const seed = String(agent?.id || preset.id || 'ripo').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return (
    <span
      className={cls('agent-avatar', `avatar-${size}`, `tone-${preset.tone}`, `shape-${preset.id}`, `state-${state}`, active && 'is-active')}
      style={{ '--avatar-delay': `-${(seed % 11) * 0.73}s`, '--avatar-phase': `${4 + (seed % 5)}s` }}
      aria-hidden="true"
    >
      <span className="avatar-halo" />
      <span className="avatar-core">
        <span className="avatar-face">
          <i className="avatar-eye avatar-eye-left" />
          <i className="avatar-eye avatar-eye-right" />
        </span>
      </span>
      <span className="avatar-status-dot" />
    </span>
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
      onAuthenticated({ profile: data.user, cloud: true, token: data.token, expiresAt: data.expiresAt });
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
    name: '', role: '', description: '', instructions: '', avatar: 'nova', canRenameSelf: true
  });
  return (
    <Modal title={editing ? 'Edit agent' : 'Create agent'} onClose={onClose}>
      <div className="agent-editor">
        <div className="avatar-picker">
          {AVATAR_PRESETS.map((preset) => (
            <button key={preset.id} onClick={() => setForm({ ...form, avatar: preset.id })} className={cls('avatar-choice', form.avatar === preset.id && 'selected')} aria-label={preset.label}>
              <Avatar agent={{ avatar: preset.id }} size="lg" />
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

function SettingsView({ profile, cloudMode, theme, onThemeChange, onLogout }) {
  return (
    <section className="content-page settings-page">
      <header className="page-heading"><div><span className="eyebrow">Ripo Bot</span><h1>Settings</h1><p>Appearance, account, model, storage, and agent runtime.</p></div></header>
      <div className="settings-stack">
        <article className="settings-card appearance-card">
          <div className="settings-icon"><Circle size={19} /></div>
          <div className="settings-copy"><strong>Appearance</strong><span>Light is the default. Choose dark or follow your device whenever you want.</span></div>
          <div className="appearance-segmented" role="group" aria-label="Appearance">
            {['light', 'dark', 'system'].map((value) => (
              <button key={value} className={cls(theme === value && 'active')} onClick={() => onThemeChange(value)}>
                {value === 'light' ? 'Light' : value === 'dark' ? 'Dark' : 'System'}
              </button>
            ))}
          </div>
        </article>
        <article className="settings-card"><div className="settings-icon"><UserRound size={19} /></div><div className="settings-copy"><strong>{profile?.name || 'Ripo Bot user'}</strong><span>{profile?.email || 'No email'}</span></div><span className={cls('badge', cloudMode ? 'badge-success' : 'badge-muted')}>{cloudMode ? 'Cloud account' : 'Device mode'}</span></article>
        <article className="settings-card"><div className="settings-icon"><Sparkles size={19} /></div><div className="settings-copy"><strong>Ripo model route</strong><span>Cloudflare AI is live. Hugging Face can become the primary route when its server-side token and model are configured.</span></div><span className="badge badge-success">Live</span></article>
        <article className="settings-card"><div className="settings-icon"><HardDrive size={19} /></div><div className="settings-copy"><strong>Workspace persistence</strong><span>{cloudMode ? 'D1 account data + Workers KV free file storage.' : 'Saved in this browser until cloud storage is available.'}</span></div></article>
        <button className="danger-button" onClick={onLogout}><LogOut size={16} /> Sign out</button>
      </div>
    </section>
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
  files,
  onNavigateFiles
}) {
  const [draft, setDraft] = useState('');
  const [searchEnabled, setSearchEnabled] = useState(true);
  const [computerEnabled, setComputerEnabled] = useState(false);
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
    onSend(value, { search: searchEnabled, computer: computerEnabled, attachments: attached });
    setDraft('');
    setAttached([]);
  }

  function saveRename() {
    if (!agent || !renameValue.trim()) return;
    onRename(renameValue.trim());
    setRenaming(false);
  }

  return (
    <section className="chat-pane">
      <div className="chat-main-column">
      <header className="chat-header">
        <div className="chat-identity">
          <div className="stacked-avatars">{participants.slice(0, 3).map((item, index) => <span key={item.id} style={{ zIndex: participants.length - index }}><Avatar agent={item} size="sm" active={index === 0} /></span>)}</div>
          <div>
            <div className="chat-title-row">
              {renaming && agent ? <div className="inline-rename"><input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') saveRename(); if (event.key === 'Escape') setRenaming(false); }} autoFocus /><button onClick={saveRename}><Check size={14} /></button></div> : <h2>{team?.name || agent?.name || 'Ripo Bot'}</h2>}
              {agent?.isPrimary ? <span className="main-agent-chip">Main</span> : null}
            </div>
            <div className="chat-subtitle">{team ? `${participants.length} agents coordinating` : agent?.role}</div>
          </div>
        </div>
        <div className="chat-header-actions">
          <StateLabel state={sending ? (searchEnabled ? 'searching' : 'thinking') : (agent?.state || 'ready')} />
          {agent && <div className="relative"><button className="icon-button" onClick={() => setMenuOpen(!menuOpen)}><MoreHorizontal size={18} /></button>{menuOpen && <div className="popover-menu"><button onClick={() => { setRenaming(true); setMenuOpen(false); }}><Pencil size={15} /> Rename</button><button onClick={() => { onEdit(); setMenuOpen(false); }}><Settings size={15} /> Edit agent</button></div>}</div>}
        </div>
      </header>

      <div className="chat-scroll">
        {messages.length <= 1 && !team && (
          <div className="chat-empty-intro">
            <Avatar agent={agent} size="xl" />
            <span className="eyebrow">{agent?.isPrimary ? 'Main agent' : agent?.role}</span>
            <h1>{agent?.name}</h1>
            <p>{agent?.description}</p>
            <div className="quick-start-grid">
              {QUICK_STARTS.map((item) => <button key={item.title} onClick={() => setDraft(item.prompt)}><strong>{item.title}</strong><span>{item.prompt}</span></button>)}
            </div>
          </div>
        )}
        {team && messages.length === 0 && <div className="team-empty"><div className="team-orbit">{participants.map((member) => <Avatar key={member.id} agent={member} size="lg" />)}</div><span className="eyebrow">Agent team</span><h1>{team.name}</h1><p>Send one goal. Ripo Bot will pass context through the selected agents and collect their contributions in this room.</p></div>}
        <div className="message-list">
          {messages.map((message) => {
            const author = message.agentId ? agents.find((item) => item.id === message.agentId) : null;
            const isUser = message.role === 'user';
            return <article className={cls('message-row', isUser && 'message-user-row')} key={message.id}>
              {!isUser && <Avatar agent={author || agent || STARTER_AGENTS[0]} size="sm" />}
              <div className={cls('message-bubble', isUser && 'message-user')}>
                {!isUser && <div className="message-meta"><strong>{author?.name || agent?.name || 'Ripo Bot'}</strong><span>{formatTime(message.createdAt)}</span></div>}
                <div className="message-body">{message.content}</div>
                {message.sources?.length ? <div className="source-strip"><Globe2 size={14} /><span>{message.sources.length} web sources used</span></div> : null}
                {message.attachments?.length ? <div className="message-attachments">{message.attachments.map((file) => <span key={file.id}><File size={13} />{file.name}</span>)}</div> : null}
                {isUser ? <span className="message-user-time">{formatTime(message.createdAt)}</span> : null}
              </div>
            </article>;
          })}
          {sending && <article className="message-row"><Avatar agent={agent || participants[0] || STARTER_AGENTS[0]} size="sm" /><div className="message-bubble typing-bubble"><span /><span /><span /></div></article>}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="composer-wrap">
        {attached.length > 0 && <div className="composer-files">{attached.map((file) => <span key={file.id}><File size={13} />{file.name}<button onClick={() => setAttached(attached.filter((item) => item.id !== file.id))}><X size={12} /></button></span>)}</div>}
        <div className="composer">
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); } }} rows={1} placeholder={team ? `Message ${team.name}` : `Message ${agent?.name || 'Ripo Bot'}`} />
          <div className="composer-toolbar">
            <div className="composer-tools">
              <div className="relative">
                <button className="tool-button" onClick={() => setMenuOpen(menuOpen === 'files' ? false : 'files')}><Paperclip size={16} /><span>Attach</span></button>
                {menuOpen === 'files' && <div className="attachment-menu">
                  <div className="attachment-menu-head"><strong>Workspace files</strong><button onClick={onNavigateFiles}>Manage files</button></div>
                  {files.length ? files.slice(0, 6).map((file) => <button key={file.id} onClick={() => { if (!attached.some((item) => item.id === file.id)) setAttached([...attached, file]); setMenuOpen(false); }}><FileText size={15} /><span>{file.name}</span></button>) : <div className="attachment-empty">Upload a file first.</div>}
                </div>}
              </div>
              <button className={cls('tool-button', searchEnabled && 'active')} onClick={() => setSearchEnabled(!searchEnabled)}><Globe2 size={16} /><span>Search</span></button>
              <button className={cls('tool-button', computerEnabled && 'active')} onClick={() => setComputerEnabled(!computerEnabled)}><Computer size={16} /><span>Computer</span></button>
            </div>
            <button className={cls('send-button', draft.trim() && 'ready')} disabled={!draft.trim() || sending} onClick={submit}>{sending ? <Square size={15} fill="currentColor" /> : <ArrowUp size={17} />}</button>
          </div>
        </div>
        <div className="composer-footnote">Ripo Bot can make mistakes. Review important work and computer actions.</div>
      </div>
      </div>
      <aside className="chat-inspector" aria-label="Bot activity">
        <div className="inspector-card screen-card">
          <div className="inspector-title-row"><span>Computer</span><StateLabel state={sending ? 'working' : 'ready'} /></div>
          <div className="mini-browser">
            <div className="mini-browser-top"><i /><i /><i /><span>Ripo Computer</span></div>
            <div className="mini-browser-body">
              <div className="mini-browser-sidebar" />
              <div className="mini-browser-page">
                <span className="mini-page-line wide" />
                <span className="mini-page-line" />
                <div className="mini-page-cards"><i /><i /><i /></div>
                <span className="mini-page-line short" />
              </div>
            </div>
          </div>
          <p>{team?.name || agent?.name || 'Ripo Bot'}'s screen</p>
        </div>
        <div className="inspector-card routines-card">
          <div className="inspector-title-row"><span>Routines</span><button className="tiny-plus" aria-label="Add routine"><Plus size={14} /></button></div>
          <div className="routine-row"><span className="routine-dot">↻</span><div><strong>Morning briefing</strong><small>Every day at 8:00 AM</small></div></div>
          <div className="routine-row"><span className="routine-dot">↻</span><div><strong>Inbox cleanup</strong><small>Weekdays at 6:00 PM</small></div></div>
          <div className="routine-row muted-routine"><span className="routine-dot">Ⅱ</span><div><strong>Weekly team update</strong><small>Paused</small></div></div>
        </div>
      </aside>
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
  const [modal, setModal] = useState(null);
  const [sending, setSending] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [toast, setToast] = useState('');
  const [syncState, setSyncState] = useState('saved');

  const activeAgent = agents.find((item) => item.id === activeAgentId) || agents[0];
  const activeTeam = teams.find((item) => item.id === activeTeamId) || null;
  const threadKey = activeTeam ? `team:${activeTeam.id}` : activeAgent?.id;
  const messages = conversations[threadKey] || [];

  useEffect(() => {
    api('/api/auth/session').then((data) => {
      if (data?.user) {
        const previous = readLocal(LOCAL_KEYS.session, null);
        const next = { profile: data.user, cloud: true, token: previous?.token || '', expiresAt: previous?.expiresAt || null };
        setAuth(next); setProfile(data.user); setCloudMode(true);
        writeLocal(LOCAL_KEYS.session, next); writeLocal(LOCAL_KEYS.profile, data.user);
        return api('/api/state').then((state) => {
          if (state?.agents?.length) setAgents(state.agents);
          if (state?.conversations) setConversations(state.conversations);
          if (state?.teams) setTeams(state.teams);
          if (typeof state?.onboarded === 'boolean') setOnboarded(state.onboarded);
          return api('/api/files').then((dataFiles) => { if (Array.isArray(dataFiles?.files)) setFiles(dataFiles.files); }).catch(() => {});
        });
      }
      return null;
    }).catch(() => {});
  }, []);

  useEffect(() => { writeLocal(LOCAL_KEYS.agents, agents); }, [agents]);
  useEffect(() => { writeLocal(LOCAL_KEYS.conversations, conversations); }, [conversations]);
  useEffect(() => { writeLocal(LOCAL_KEYS.teams, teams); }, [teams]);
  useEffect(() => { writeLocal(LOCAL_KEYS.files, files); }, [files]);
  useEffect(() => { writeLocal(LOCAL_KEYS.onboarded, onboarded); }, [onboarded]);
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
        body: JSON.stringify({ agents, conversations, teams, onboarded })
      }).then(() => setSyncState('saved')).catch(() => setSyncState('local'));
    }, 700);
    return () => clearTimeout(timer);
  }, [agents, conversations, teams, onboarded, cloudMode, auth]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  function authenticated({ profile: nextProfile, cloud, token = '', expiresAt = null }) {
    const next = { profile: nextProfile, cloud, token, expiresAt };
    setAuth(next); setProfile(nextProfile); setCloudMode(cloud);
    writeLocal(LOCAL_KEYS.session, next); writeLocal(LOCAL_KEYS.profile, nextProfile);
  }

  function finishOnboarding(data) {
    const selectedIds = new Set(['ripo', ...(data.starter || [])]);
    setAgents(STARTER_AGENTS.filter((agent) => selectedIds.has(agent.id)));
    const nextProfile = { ...(profile || {}), name: data.displayName, goal: data.goal };
    setProfile(nextProfile); writeLocal(LOCAL_KEYS.profile, nextProfile);
    setOnboarded(true);
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
    const next = { ...form, id: uid('agent'), state: 'ready', isPrimary: false };
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
  }

  async function sendSingleAgent(agent, text, options, history, targetKey) {
    const search = Boolean(options.search);
    setAgents((current) => current.map((item) => item.id === agent.id ? { ...item, state: search ? 'searching' : 'thinking' } : item));
    const payloadMessages = history.slice(-18).map((message) => ({ role: message.role, content: message.content }));
    const result = await api('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        agentName: agent.name,
        agentRole: agent.role,
        agentInstructions: agent.instructions || '',
        messages: payloadMessages,
        search,
        computer: Boolean(options.computer),
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
            state: 'ready',
            canRenameSelf: true,
            isPrimary: false
          };
          setAgents((current) => current.some((item) => item.name.toLowerCase() === newAgent.name.toLowerCase()) ? current : [...current, newAgent]);
          setConversations((current) => current[newAgent.id] ? current : { ...current, [newAgent.id]: [] });
          setToast(`${newAgent.name} joined your team`);
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
      sources: result.sources || []
    };
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

  async function logout() {
    if (cloudMode) api('/api/auth/logout', { method: 'POST', body: '{}' }).catch(() => {});
    setAuth(null); setCloudMode(false); setProfile(null); setOnboarded(false);
    Object.values(LOCAL_KEYS).forEach((key) => { try { localStorage.removeItem(key); } catch {} });
  }

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
        <button className="new-task-button" onClick={() => { openAgent('ripo'); setConversations((current) => ({ ...current, ripo: [] })); }}><Plus size={17} /><span>New task</span><kbd>⌘ N</kbd></button>
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

        <div className="sidebar-footer">
          <button className={cls('sync-indicator', syncState === 'local' && 'local')}><Cloud size={14} /><span>{cloudMode ? (syncState === 'saving' ? 'Saving…' : syncState === 'local' ? 'Saved locally' : 'Synced') : 'Device mode'}</span></button>
          <button className={cls('profile-button', view === 'settings' && 'active')} onClick={() => navigate('settings')}><span className="profile-avatar">{(profile?.name || 'R').slice(0, 1).toUpperCase()}</span><span><strong>{profile?.name || 'Ripo user'}</strong><small>{cloudMode ? 'Cloud workspace' : 'This device'}</small></span><Settings size={15} /></button>
        </div>
      </aside>
      {mobileNav && <div className="mobile-scrim" onClick={() => setMobileNav(false)} />}

      <main className="main-shell">
        <button className="mobile-menu-button" onClick={() => setMobileNav(true)} aria-label="Back to bots"><ArrowLeft size={20} /></button>
        {view === 'chat' && <ChatView agent={activeAgent} team={activeTeam} agents={agents} messages={messages} sending={sending} onSend={sendMessage} onRename={renameAgent} onEdit={() => setModal('edit-agent')} files={files} onNavigateFiles={() => navigate('files')} />}
        {view === 'files' && <FilesView files={files} onUpload={uploadFiles} cloudMode={cloudMode} />}
        {view === 'computer' && <ComputerView />}
        {view === 'settings' && <SettingsView profile={profile} cloudMode={cloudMode} theme={theme} onThemeChange={setTheme} onLogout={logout} />}
      </main>

      {modal === 'new-agent' && <AgentEditor onClose={() => setModal(null)} onSave={createAgent} />}
      {modal === 'edit-agent' && activeAgent && <AgentEditor initialAgent={activeAgent} onClose={() => setModal(null)} onSave={saveAgent} />}
      {modal === 'new-team' && <TeamEditor agents={agents} onClose={() => setModal(null)} onSave={createTeam} />}
      {toast && <div className="toast"><CheckCircle2 size={16} />{toast}</div>}
    </div>
  );
}
